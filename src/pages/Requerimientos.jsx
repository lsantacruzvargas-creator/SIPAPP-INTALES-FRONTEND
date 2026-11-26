import { useState, useEffect, useCallback } from "react";
import * as XLSX from "xlsx";
import { fetchAuth, getUsuario, uploadAuth, descargarArchivoProtegido } from "../utils/fetchAuth";
import { comprimirFoto, mensajeSubida } from "../utils/comprimirFoto";
import { formatearFecha, formatearFechaHora, fechaHoyLima } from "../utils/fecha";
import SelectorMateriales from "../components/SelectorMateriales";
import PromptAccion from "../components/PromptAccion";
import ConfirmacionAccion from "../components/ConfirmacionAccion";
import AvisoAccion from "../components/AvisoAccion";
import { conBloqueo } from "../utils/bloqueoApi";
import { esPagoAntiguo } from "../utils/tesoreria";

const ESTADO_ITEM = {
  pendiente: "bg-blue-100 text-blue-700",
  atendido: "bg-green-100 text-green-700",
  cerrado: "bg-green-100 text-green-700",
  rechazado: "bg-red-100 text-red-700",
};

// Estado de una compra heredada de comprabasico. «Recepcionado» es una marca aparte: `estadoPago` se queda en
// "pagado" para no sacar la compra del costo por OT.
const ESTADO_COMPRA = {
  por_procesar:   { clase: "bg-gray-100 text-gray-600",   label: "Por procesar" },
  pendiente_pago: { clase: "bg-amber-100 text-amber-700", label: "Pendiente de pago" },
  pagado:         { clase: "bg-green-100 text-green-700", label: "Pagado" },
  recepcionado:   { clase: "bg-sky-100 text-sky-700",     label: "Recepcionado" },
  anulado:        { clase: "bg-red-100 text-red-700",     label: "Anulado" },
};
const estadoCompra = (x) =>
  ESTADO_COMPRA[x.anulado ? "anulado" : x.recepcionado ? "recepcionado" : x.estadoPago || "por_procesar"]
  || ESTADO_COMPRA.por_procesar;

// Las compras de comprabasico pueden estar en dólares (moneda + tipoCambio guardados al procesar).
const money = (v, moneda = "PEN") => (moneda === "USD" ? "US$ " : "S/ ") + Number(v ?? 0).toLocaleString("es-PE", { minimumFractionDigits: 2 });

function resumenCompra(item) {
  return Object.entries(item.camposCompra || {}).map(([k, v]) => `${k}: ${v}`).join(" · ");
}

// "Otros" guarda solo { descripcion }: ahí se muestra el valor sin la clave.
function descripcionMaterial(item) {
  const campos = Object.entries(item.camposCompra || {}).filter(([, v]) => v !== "" && v != null);
  if (campos.length === 1) return String(campos[0][1]);
  return campos.map(([k, v]) => `${k}: ${v}`).join(" · ") || item.categoriaNombre || "—";
}

// Evita que un texto escrito por el usuario se ejecute como fórmula en Excel.
const celda = (v) => (typeof v === "string" && /^[=+\-@]/.test(v) ? `'${v}` : v);

const fmtFechaHora = (d) => formatearFechaHora(d, { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

// ─── Salida de un ítem de stock: pide lote (FIFO disponible) + cantidad ────

function PanelSalida({ requerimientoId, item, onClose, onListo }) {
  const [lotes, setLotes] = useState([]);
  const [lote, setLote] = useState("");
  const [precioAuto, setPrecioAuto] = useState(0);
  const [cantidad, setCantidad] = useState(item.cantidad);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  // Ítem de stock existente: usa `item.material`. Ítem de compra ya vinculado
  // a un SKU: usa `item.materialAsociado` — mismo flujo de Atender para ambos.
  const materialId = item.esSolicitudCompra
    ? (item.materialAsociado?._id || item.materialAsociado)
    : item.material._id;

  useEffect(() => {
    fetchAuth(`/movimientos-almacen/lotes/${materialId}`)
      .then((r) => r.ok ? r.json() : [])
      .then(setLotes);
  }, [materialId]);

  const seleccionarLote = (l) => { setLote(l.lote); setPrecioAuto(l.precioUnitario); };

  const confirmar = async () => {
    if (!lote || !cantidad || cantidad <= 0) { setError("Selecciona el lote e ingresa la cantidad."); return; }
    setGuardando(true);
    try {
      const r = await conBloqueo("requerimiento", requerimientoId, (h) => fetchAuth(`/requerimientos/${requerimientoId}/items/${item._id}/salida`, {
        method: "PATCH",
        headers: h,
        body: JSON.stringify({ lote, cantidad: Number(cantidad), precioUnitario: precioAuto }),
      }));
      if (r.ok) {
        onListo(await r.json());
      } else {
        const d = await r.json().catch(() => ({}));
        setError(d.mensaje || "Error al registrar la salida");
      }
    } catch {
      setError("Error al registrar la salida");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="bg-blue-50/60 rounded-xl p-3 mt-2 space-y-2">
      {error && <p className="text-xs text-red-500 bg-red-50 px-2 py-1 rounded">{error}</p>}
      {lotes.length === 0 ? (
        // Sin stock, no hay nada que seleccionar — mostrar cantidad/confirmar
        // acá sería un callejón sin salida (el botón nunca se habilita porque
        // nunca hay un lote que elegir). Se avisa y se corta el flujo acá.
        <>
          <p className="text-xs text-gray-500">
            Sin lotes disponibles para este material — registra un ingreso en Almacén antes de poder atenderlo.
          </p>
          <div className="flex justify-end">
            <button onClick={onClose} className="text-xs text-gray-400 hover:text-gray-700">Cancelar</button>
          </div>
        </>
      ) : (
        <>
          <div className="space-y-1.5">
            {lotes.map((l) => (
              <button key={l.lote} type="button" onClick={() => seleccionarLote(l)}
                className={`w-full text-left px-3 py-2 rounded-lg border text-xs transition ${
                  lote === l.lote ? "border-blue-400 bg-blue-50" : "border-gray-200 bg-white hover:border-gray-300"
                }`}>
                <div className="flex justify-between">
                  <span className="font-mono font-semibold text-gray-700">{l.lote}</span>
                  <span className="font-semibold text-gray-800">S/ {Number(l.precioUnitario).toFixed(2)}</span>
                </div>
                <div className="flex gap-3 text-gray-400 mt-0.5">
                  <span>Disponible: <strong>{l.cantidadDisponible}</strong></span>
                </div>
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <input type="number" min={0.01} step="any" value={cantidad} onChange={(e) => setCantidad(e.target.value)}
              className="w-24 border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-right bg-white" />
            <button onClick={confirmar} disabled={guardando || !lote}
              className="text-xs bg-emerald-600 text-white px-3 py-1.5 rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition font-medium">
              {guardando ? "Guardando…" : "Confirmar salida"}
            </button>
            <button onClick={onClose} className="text-xs text-gray-400 hover:text-gray-700">Cancelar</button>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Devolución de un ítem ya atendido: registra un INGRESO en Movimientos ──

function PanelDevolucion({ requerimientoId, item, onClose, onListo }) {
  const unidad = item.esSolicitudCompra ? item.materialAsociado?.unidad : item.material?.unidad;
  const maxDevolvible = item.cantidad - (item.cantidadDevuelta || 0);
  const [cantidad, setCantidad] = useState(maxDevolvible);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  const confirmar = async () => {
    if (!cantidad || cantidad <= 0) { setError("Ingresa una cantidad válida."); return; }
    setGuardando(true);
    try {
      const r = await conBloqueo("requerimiento", requerimientoId, (h) => fetchAuth(`/requerimientos/${requerimientoId}/items/${item._id}/devolucion`, {
        method: "PATCH",
        headers: h,
        body: JSON.stringify({ cantidad: Number(cantidad) }),
      }));
      if (r.ok) {
        onListo(await r.json());
      } else {
        const d = await r.json().catch(() => ({}));
        setError(d.mensaje || "Error al registrar la devolución");
      }
    } catch {
      setError("Error al registrar la devolución");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="bg-red-50/60 rounded-xl p-3 mt-2 space-y-2">
      {error && <p className="text-xs text-red-500 bg-red-50 px-2 py-1 rounded">{error}</p>}
      <p className="text-xs text-gray-500">Disponible para devolver: <strong>{maxDevolvible}</strong> {unidad}</p>
      <div className="flex items-center gap-2">
        <input type="number" min={0.01} max={maxDevolvible} step="any" value={cantidad} onChange={(e) => setCantidad(e.target.value)}
          className="w-24 border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-right bg-white" />
        <button onClick={confirmar} disabled={guardando || maxDevolvible <= 0}
          className="text-xs bg-red-600 text-white px-3 py-1.5 rounded-lg hover:bg-red-700 disabled:opacity-50 transition font-medium">
          {guardando ? "Guardando…" : "Confirmar devolución"}
        </button>
        <button onClick={onClose} className="text-xs text-gray-400 hover:text-gray-700">Cancelar</button>
      </div>
    </div>
  );
}

// Ubicación / Stock actual / Cantidad solicitada, visibles de un vistazo —
// el stock se colorea en rojo cuando no alcanza para cubrir lo pedido
// (respuesta a que antes quedaba enterrado en una línea de texto gris chica).
function BadgesMaterial({ material, cantidad }) {
  if (!material) return null;
  const stock = material.stock ?? 0;
  const alcanza = stock >= cantidad;
  return (
    <div className="flex flex-wrap items-center gap-1.5 mt-1">
      <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700">
        Ubicación: {material.ubicacion?.nombre || "Sin ubicación"}
      </span>
      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${alcanza ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
        Stock: {stock} {material.unidad}
      </span>
      <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">
        Solicitado: {cantidad} {material.unidad}
      </span>
    </div>
  );
}

// ─── Fila de un ítem dentro de un requerimiento (tabs Activos/Completados) ──

function FilaItem({ requerimiento, item, puedeAtender, onActualizado }) {
  const [panelSalida, setPanelSalida] = useState(false);
  const [panelDevolucion, setPanelDevolucion] = useState(false);
  const [buscadorAbierto, setBuscadorAbierto] = useState(false);
  const [confirmandoRechazo, setConfirmandoRechazo] = useState(false);
  const [rechazando, setRechazando] = useState(false);
  const [error, setError] = useState("");
  const unidad = item.esSolicitudCompra ? item.materialAsociado?.unidad : item.material?.unidad;
  const esCompra = item.esSolicitudCompra;
  const pendiente = puedeAtender && !requerimiento.anulado && item.estado === "pendiente";
  const estadoC = esCompra ? estadoCompra(item) : null;

  const accion = async (endpoint, body) => {
    setError("");
    const r = await conBloqueo("requerimiento", requerimiento._id, (h) => fetchAuth(`/requerimientos/${requerimiento._id}/items/${item._id}/${endpoint}`, {
      method: "PATCH",
      headers: h,
      body: JSON.stringify(body || {}),
    }));
    if (r.ok) onActualizado(await r.json());
    else setError((await r.json().catch(() => ({}))).mensaje || "No se pudo completar la acción.");
  };

  const rechazar = async (motivo) => {
    setRechazando(true);
    try {
      await accion("rechazar", { motivo });
    } finally {
      setRechazando(false);
      setConfirmandoRechazo(false);
    }
  };

  const vincular = (material) => {
    setBuscadorAbierto(false);
    accion("vincular-material", { material: material._id });
  };

  return (
    <div className="border-t border-gray-50 first:border-t-0 py-2.5">
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          {esCompra ? (
            <>
              <p className="text-sm font-medium text-gray-800">
                <span className="text-xs px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 mr-1.5">Compra</span>
                {item.categoriaNombre} — {item.cantidad}
              </p>
              <p className="text-xs text-gray-400 truncate">{resumenCompra(item)}</p>
              <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${estadoC.clase}`}>{estadoC.label}</span>
                {item.proveedorNombre && <span className="text-xs text-gray-500 truncate">Proveedor: {item.proveedorNombre}</span>}
              </div>
              {item.materialAsociado && (
                <>
                  <p className="text-xs text-blue-600 mt-0.5">Vinculado a: {item.materialAsociado.sku} — {item.materialAsociado.nombre}</p>
                  <BadgesMaterial material={item.materialAsociado} cantidad={item.cantidad} />
                </>
              )}
            </>
          ) : (
            <>
              <p className="text-sm font-medium text-gray-800">{item.material?.nombre}</p>
              <p className="text-xs text-gray-400 font-mono">{item.material?.sku}</p>
              <BadgesMaterial material={item.material} cantidad={item.cantidad} />
            </>
          )}
        </div>
        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold shrink-0 ${ESTADO_ITEM[item.estado]}`}>
          {item.estado}
        </span>
        {pendiente && (!esCompra || item.materialAsociado) && (
          <button onClick={() => setPanelSalida((v) => !v)}
            className="text-xs bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-lg hover:bg-emerald-100 transition font-medium shrink-0">
            Atender
          </button>
        )}
        {pendiente && esCompra && !item.materialAsociado && (
          <button onClick={() => setBuscadorAbierto(true)}
            className="text-xs bg-blue-50 text-blue-700 px-2.5 py-1 rounded-lg hover:bg-blue-100 transition font-medium shrink-0">
            Vincular SKU
          </button>
        )}
        {pendiente && (
          <button onClick={() => setConfirmandoRechazo(true)} className="text-xs text-gray-400 hover:text-red-500 transition shrink-0">
            Rechazar
          </button>
        )}
        {puedeAtender && item.estado === "atendido" && item.movimientoAlmacen && (
          <button onClick={() => setPanelDevolucion((v) => !v)}
            disabled={item.cantidad - (item.cantidadDevuelta || 0) <= 0}
            className="text-xs bg-red-50 text-red-700 px-2.5 py-1 rounded-lg hover:bg-red-100 disabled:opacity-40 disabled:cursor-not-allowed transition font-medium shrink-0">
            Devolución
          </button>
        )}
      </div>
      {item.cantidadDevuelta > 0 && (
        <p className="text-xs text-red-500 mt-1">Devuelto: {item.cantidadDevuelta} {unidad}</p>
      )}
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}

      {panelSalida && (
        <PanelSalida requerimientoId={requerimiento._id} item={item}
          onClose={() => setPanelSalida(false)}
          onListo={(r) => { setPanelSalida(false); onActualizado(r); }} />
      )}
      {panelDevolucion && (
        <PanelDevolucion requerimientoId={requerimiento._id} item={item}
          onClose={() => setPanelDevolucion(false)}
          onListo={(r) => { setPanelDevolucion(false); onActualizado(r); }} />
      )}
      {buscadorAbierto && (
        <SelectorMateriales onSelect={vincular} onClose={() => setBuscadorAbierto(false)} />
      )}
      {confirmandoRechazo && (
        <PromptAccion
          titulo="Rechazar ítem"
          label="Motivo del rechazo"
          onCancelar={() => setConfirmandoRechazo(false)}
          onConfirmar={rechazar}
          procesando={rechazando}
          textoConfirmar="Rechazar"
        />
      )}
    </div>
  );
}

// ─── Adjuntos de una compra heredada (ítem de requerimiento) ────────────────

const ACCEPT_DOCUMENTOS = [
  "image/jpeg", "image/png", "image/webp",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
].join(",");

// El servidor responde el array `archivos` del ítem tras subir o quitar; `onCambio` lo recibe.
function AdjuntosCompra({ requerimientoId, itemId, archivos = [], puedeEditar, onCambio }) {
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState("");
  const [porEliminar, setPorEliminar] = useState(null);
  const [eliminando, setEliminando] = useState(false);
  const base = `/requerimientos/${requerimientoId}/items/${itemId}/archivos`;

  const subir = async (fileList) => {
    const files = Array.from(fileList || []);
    if (files.length === 0) return;
    setError("");
    setSubiendo(true);
    try {
      // Secuencial: cada subida hace push sobre el mismo array `archivos`.
      for (const file of files) {
        const fd = new FormData();
        fd.append("archivo", await comprimirFoto(file));
        const r = await conBloqueo("requerimiento", requerimientoId, (h) => uploadAuth(base, fd, h));
        if (r.ok) onCambio(await r.json());
        else if (r.status === 423) { setError((await r.json().catch(() => ({}))).mensaje || "El requerimiento está en edición por otro usuario."); break; }
        else setError(`No se pudo subir "${file.name}": ${await mensajeSubida(r)} (solo imágenes, PDF, Word o Excel, máx. 20 MB).`);
      }
    } finally {
      setSubiendo(false);
    }
  };

  const eliminar = async () => {
    setEliminando(true);
    try {
      const r = await conBloqueo("requerimiento", requerimientoId, (h) => fetchAuth(`${base}/${porEliminar._id}`, { method: "DELETE", headers: h }));
      if (r.ok) onCambio(await r.json());
      else setError((await r.json().catch(() => ({}))).mensaje || "No se pudo eliminar el documento.");
    } finally {
      setEliminando(false);
      setPorEliminar(null);
    }
  };

  if (!puedeEditar && archivos.length === 0) return null;
  return (
    <div className="mt-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {archivos.map((a) => (
          <span key={a._id} className="inline-flex items-center gap-1 text-xs bg-cyan-50 text-cyan-800 border border-cyan-100 rounded-full pl-2.5 pr-1 py-0.5 max-w-[240px]">
            <button type="button" onClick={() => descargarArchivoProtegido(a.url, a.nombre)}
              title={`Descargar ${a.nombre}${a.subidoPor ? ` — subido por ${a.subidoPor}` : ""}`}
              className="truncate hover:underline">
              ⬇ {a.nombre}
            </button>
            {puedeEditar && (
              <button type="button" onClick={() => setPorEliminar(a)} title="Eliminar documento"
                className="w-5 h-5 shrink-0 rounded-full text-cyan-500 hover:text-red-600 hover:bg-red-50 leading-none">
                ✕
              </button>
            )}
          </span>
        ))}
        {puedeEditar && (
          <label className={`inline-flex items-center gap-1 text-xs border border-dashed border-gray-300 text-gray-500 rounded-full px-2.5 py-0.5 ${subiendo ? "opacity-60" : "hover:border-cyan-400 hover:text-cyan-700 cursor-pointer"}`}>
            {subiendo ? "Subiendo…" : "📎 Adjuntar documento"}
            <input type="file" multiple accept={ACCEPT_DOCUMENTOS} className="hidden" disabled={subiendo}
              onChange={(e) => { subir(e.target.files); e.target.value = ""; }} />
          </label>
        )}
      </div>
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
      {porEliminar && (
        <ConfirmacionAccion
          mensaje={`¿Eliminar el documento "${porEliminar.nombre}"?`}
          onCancelar={() => setPorEliminar(null)}
          onConfirmar={eliminar}
          procesando={eliminando}
          textoConfirmar="Eliminar"
          peligro
        />
      )}
    </div>
  );
}

// ─── Card de compra / servicio heredado (pestañas Por procesar → Recepcionado) ──

// Un ítem de solicitud puede tratarse a nombre de un cliente/planta distinto
// del de quien lo pidió — OC/OT/Cliente/Planta deben quedar visibles en cada fila.
function FilaSeleccionable({
  seleccionado, onToggle, disabledCheckbox, ot, oc, cliente, planta,
  descripcion, observacion, proveedor, precio, flete, moneda, referencia, estado, cantidad, unidad, fecha, detalle, adjuntos,
  anulacion, onDescartar, correcciones,
}) {
  return (
    <div className={`flex items-start gap-3 border-t border-gray-100 first:border-t-0 py-4 ${anulacion ? "opacity-60" : ""}`}>
      <input type="checkbox" checked={seleccionado && !anulacion} disabled={disabledCheckbox || !!anulacion}
        onChange={onToggle} className="mt-1 w-4 h-4 rounded border-gray-300 text-purple-600 focus:ring-purple-400 disabled:opacity-30" />
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
          <span className="text-[15px] font-mono font-semibold px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700">
            OT {ot?.numeroOT || ot?.codigo || "—"}
          </span>
          {oc && (
            <span className="text-[15px] font-mono font-semibold px-1.5 py-0.5 rounded bg-amber-50 text-amber-700">
              OC {oc.numeroOrden || oc.codigo}
            </span>
          )}
          {ot?.titulo && <span className="text-sm text-gray-800 truncate">{ot.titulo}</span>}
        </div>
        {(cliente || planta) && (
          <p className="text-xs font-semibold text-gray-600 mb-0.5">
            {cliente}{planta ? ` — ${planta}` : ""}
          </p>
        )}
        <div className="my-2 border-l-4 border-purple-500 bg-purple-50 rounded-r-lg px-3 py-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-purple-600">Descripción</p>
          <p className="text-base font-bold text-gray-900 break-words">{descripcion}</p>
        </div>
        {observacion?.trim() && (
          <div className="mb-2 border-l-4 border-amber-400 bg-amber-50 rounded-r-lg px-3 py-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-700">Observación</p>
            <p className="text-sm italic text-gray-800 whitespace-pre-line break-words">{observacion}</p>
          </div>
        )}
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-sm">
          <dt className="text-gray-400">Cantidad:</dt>
          <dd className="text-gray-800 font-semibold">{cantidad != null && cantidad !== "" ? `${cantidad} ${unidad || ""}` : "—"}</dd>
          <dt className="text-gray-400">Proveedor:</dt>
          <dd className="text-gray-800 font-medium truncate">{proveedor || "—"}</dd>
          <dt className="text-gray-400">Precio:</dt>
          <dd className="text-gray-800">{precio != null ? `${money(precio, moneda)} c/u` : "—"}</dd>
          <dt className="text-gray-400">Flete:</dt>
          <dd className="text-gray-800">{flete > 0 ? money(flete, moneda) : "—"}</dd>
        </dl>
        <p className="text-xs text-gray-400 mt-1.5">{referencia}</p>
        <div className="mt-1">{estado}</div>
        {anulacion ? (
          <div className="mt-2 border-l-4 border-red-400 bg-red-50 rounded-r-lg px-3 py-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-red-700">Anulado</p>
            <p className="text-xs text-gray-700">
              <span className="font-semibold">Por:</span> {anulacion.por || "—"}
              <span className="mx-1.5 text-gray-300">·</span>
              <span className="font-semibold">Fecha y hora:</span> {anulacion.fecha || "—"}
            </p>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-red-700 mt-1">Motivo</p>
            <p className="text-sm italic text-gray-800 whitespace-pre-line break-words">{anulacion.motivo || "—"}</p>
          </div>
        ) : (
          <>
            {detalle}
            <HistorialCorrecciones correcciones={correcciones} />
            {adjuntos}
          </>
        )}
      </div>
      <div className="text-right shrink-0 flex flex-col items-end gap-1">
        {onDescartar && !anulacion && (
          <button type="button" onClick={onDescartar} title="Descartar compra" aria-label="Descartar compra"
            className="w-8 h-8 flex items-center justify-center rounded-full border border-red-200 text-red-500 text-lg leading-none hover:bg-red-50 hover:text-red-700 hover:border-red-400 transition">
            ✕
          </button>
        )}
        <p className="text-xs text-gray-400">{fecha}</p>
      </div>
    </div>
  );
}

function DetallePagoRecepcion({ x }) {
  if (x.estadoPago !== "pagado") return null;
  const f = (d) => (d ? formatearFecha(d, { day: "2-digit", month: "2-digit", year: "numeric" }) : "—");
  return (
    <div className="mt-1.5 text-xs text-gray-500 space-y-0.5">
      <p>Pagado el {f(x.fechaPago)}{x.pagador ? ` por ${x.pagador}` : ""}</p>
      {x.recepcionado && (
        <p>
          Recepcionado el {f(x.fechaRecepcion)} por {x.receptor}
          {x.guiaRecepcion ? ` · Guía ${x.guiaRecepcion}` : ""}
          {x.facturaRecepcion ? ` · Factura ${x.facturaRecepcion}` : ""}
        </p>
      )}
    </div>
  );
}

// Solo lectura: las correcciones se hicieron en comprabasico; aquí no se corrige el monto.
function HistorialCorrecciones({ correcciones = [] }) {
  if (correcciones.length === 0) return null;
  return (
    <div className="mt-2 border-l-4 border-amber-400 bg-amber-50 rounded-r-lg px-3 py-1.5 space-y-1">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-700">
        Monto corregido ({correcciones.length})
      </p>
      {correcciones.map((c) => (
        <div key={c._id} className="text-xs text-gray-700">
          <p>
            {money(c.montoAnterior, c.monedaAnterior)} c/u → <span className="font-semibold">{money(c.montoNuevo, c.monedaNueva)} c/u</span>
            {(c.fleteAnterior || 0) !== (c.fleteNuevo || 0) && <> · flete {money(c.fleteAnterior, c.monedaAnterior)} → {money(c.fleteNuevo, c.monedaNueva)}</>}
            <span className="text-gray-400"> — {c.por || "—"}, {fmtFechaHora(c.fecha)}</span>
          </p>
          <p className="italic text-gray-600 whitespace-pre-line break-words">{c.motivo}</p>
        </div>
      ))}
    </div>
  );
}

// Modal de datos obligatorios al marcar Pagado / Recepcionado. `onConfirmar`
// recibe el formulario y devuelve un mensaje de error o null.
function ModalDatosCompra({ titulo, descripcion, campos, inicial, textoConfirmar, onCancelar, onConfirmar }) {
  const [form, setForm] = useState(inicial);
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [exito, setExito] = useState("");

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const confirmar = async () => {
    const faltante = campos.find((c) => c.requerido && !String(form[c.name] ?? "").trim());
    if (faltante) { setError(`${faltante.label} es obligatorio.`); return; }
    if (campos.some((c) => c.type === "date" && form[c.name] > fechaHoyLima())) {
      setError("La fecha no puede ser posterior a hoy.");
      return;
    }
    setError("");
    setGuardando(true);
    try {
      const msg = await onConfirmar(form);
      if (msg) { setError(msg); return; }
      setExito("Listo.");
      setTimeout(onCancelar, 1200);
    } catch {
      setError("Error de conexión con el servidor");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/40 flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
        <div>
          <h3 className="font-semibold text-gray-800">{titulo}</h3>
          {descripcion && <p className="text-sm text-gray-500 mt-0.5">{descripcion}</p>}
        </div>
        {exito ? (
          <p className="text-sm bg-green-50 border border-green-200 text-green-700 rounded-lg px-4 py-3">{exito}</p>
        ) : (
          <>
            <div className="space-y-3">
              {campos.map((c) => (
                <label key={c.name} className="block">
                  <span className="text-xs font-medium text-gray-600">
                    {c.label}{c.requerido ? " *" : " (opcional)"}
                  </span>
                  <input type={c.type || "text"} name={c.name} value={form[c.name] ?? ""} onChange={handleChange}
                    max={c.type === "date" ? fechaHoyLima() : undefined} maxLength={c.maxLength}
                    className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400" />
                </label>
              ))}
            </div>
            {error && <p className="text-xs text-red-500">{error}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={onCancelar} disabled={guardando}
                className="text-sm px-4 py-2 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50">
                Cancelar
              </button>
              <button type="button" onClick={confirmar} disabled={guardando}
                className="text-sm px-4 py-2 rounded-lg bg-purple-600 text-white hover:bg-purple-700 font-medium disabled:opacity-60">
                {guardando ? "Guardando…" : textoConfirmar}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const CAMPOS_PAGO = [
  { name: "fechaPago", label: "Fecha de pago", type: "date", requerido: true },
  { name: "pagador", label: "Nombre de quien pagó", requerido: true, maxLength: 120 },
];

const CAMPOS_RECEPCION = [
  { name: "fechaRecepcion", label: "Fecha de recepción", type: "date", requerido: true },
  { name: "receptor", label: "Nombre del receptor", requerido: true, maxLength: 120 },
  { name: "guiaRecepcion", label: "N° de guía", maxLength: 40 },
  { name: "facturaRecepcion", label: "N° de factura", maxLength: 40 },
];

// ─── Página principal ────────────────────────────────────────────────────────

const TABS_PAGO_MATERIALES = [
  { id: "pendiente-pago", label: "Pendiente de pago" },
  { id: "pagados", label: "Pagados" },
  { id: "recepcionado", label: "Recepcionado" },
];
const TABS_SERVICIOS = [
  { id: "pendiente-pago", label: "Pendiente de pago" },
  { id: "pagados", label: "Pagados" },
];

const ROLES_PAGO = ["admin", "jefatura", "coordinadora"];
// Recepcionar, descartar y adjuntar en compras heredadas (mismos roles del backend).
const ROLES_COMPRA = ["vendedor", "admin", "jefatura", "coordinadora"];

export default function Requerimientos() {
  const [lista, setLista] = useState([]);
  const [servicios, setServicios] = useState([]);
  const [ordenesCompra, setOrdenesCompra] = useState([]);
  const [seccion, setSeccion] = useState("materiales");
  const [tabMateriales, setTabMateriales] = useState("pendiente-pago");
  const [tabServicios, setTabServicios] = useState("pendiente-pago");
  const [seleccionados, setSeleccionados] = useState(() => new Set());
  // { tipo: "pago" | "recepcion", n } | null — solo materiales (`n` fija el conteo mientras se ve el éxito); el pago de servicios usa la confirmación simple.
  const [modalDatos, setModalDatos] = useState(null);
  const [confirmandoPago, setConfirmandoPago] = useState(false);
  const [pagando, setPagando] = useState(false);
  const [exitoPago, setExitoPago] = useState("");
  const [errorPago, setErrorPago] = useState("");
  const [porDescartar, setPorDescartar] = useState(null);
  const [descartando, setDescartando] = useState(false);
  const [errorDescarte, setErrorDescarte] = useState("");
  const usuario = getUsuario();
  const puedeAtender = ["admin", "jefatura", "coordinadora", "almacenero"].includes(usuario?.rol);
  // "Marcar como pagado" — exclusivo Coordinadora/Jefatura/Admin.
  const puedePagar = ROLES_PAGO.includes(usuario?.rol);
  const puedeGestionarCompra = ROLES_COMPRA.includes(usuario?.rol);

  const cargar = useCallback(async () => {
    const [r1, r2, r3] = await Promise.all([
      fetchAuth("/requerimientos"),
      fetchAuth("/servicios-externos"),
      fetchAuth("/ordenes-compra"),
    ]);
    if (r1.ok) setLista(await r1.json());
    if (r2.ok) setServicios(await r2.json());
    if (r3.ok) setOrdenesCompra(await r3.json());
  }, []);

  // OC no tiene FK directa a la OT — se resuelve por el mismo salto de 2
  // pasos OT → cotización → OC que ya usa DetalleOrdenTrabajo.jsx.
  const resolverOC = (ot) => {
    const cotId = ot?.cotizacion?._id || ot?.cotizacion;
    if (!cotId) return null;
    return ordenesCompra.find((o) => (o.cotizacion?._id || o.cotizacion) === cotId) || null;
  };
  const nombreEmpresa = (emp) => emp ? (emp.alias ? `${emp.alias} — ${emp.razonSocial}` : emp.razonSocial) : "";

  useEffect(() => { cargar(); }, [cargar]);

  // Cambiar de sección/tab limpia la selección — evita procesar/pagar ítems
  // que ya no se ven en pantalla.
  useEffect(() => { setSeleccionados(new Set()); }, [seccion, tabMateriales, tabServicios]);

  const actualizarEnLista = (actualizado) => {
    setLista((prev) => prev.map((r) => r._id === actualizado._id ? actualizado : r));
  };

  const actualizarArchivos = (requerimientoId, itemId, archivos) => {
    setLista((prev) => prev.map((r) => r._id !== requerimientoId ? r : {
      ...r,
      items: r.items.map((it) => it._id === itemId ? { ...it, archivos } : it),
    }));
  };

  // Las compras con SC se gestionan en Compras y no aparecen aquí. Las compras heredadas de comprabasico (sin SC) solo
  // se ven en Activos/Completados una vez recepcionadas y no anuladas: ahí se vinculan a un SKU y se entregan a la OT.
  // Un RQ sin ítems visibles no aparece.
  const itemsVisibles = (r) => r.items.filter((it) =>
    !it.esSolicitudCompra || (esPagoAntiguo({ ...it, requerimiento: r }) && it.recepcionado && !it.anulado));
  const tieneItemsPendientes = (r) => !r.anulado && itemsVisibles(r).some((it) => it.estado === "pendiente");

  // Ítems de solicitud de compra "aplanados" con su Requerimiento padre —
  // el pipeline de pago vive a nivel de ítem, no de Requerimiento completo.
  const itemsCompra = lista.flatMap((r) =>
    (r.items || [])
      .filter((it) => it.esSolicitudCompra)
      .map((it) => ({ ...it, requerimiento: r }))
  );
  // Con solicitud de compra el pago va por Tesorería (OC a proveedor → factura
  // → movimiento); aquí quedan solo los pagos antiguos.
  const itemsLegacy = itemsCompra.filter(esPagoAntiguo);
  // Los anulados (descartados) se quedan en su pestaña, deshabilitados; no se pueden seleccionar ni van al Excel.
  const itemsPorProcesar = itemsLegacy.filter((it) => (it.estadoPago || "por_procesar") === "por_procesar");
  const itemsPendientePago = itemsLegacy.filter((it) => it.estadoPago === "pendiente_pago");
  const itemsPagados = itemsLegacy.filter((it) => it.estadoPago === "pagado" && !it.recepcionado);
  const itemsRecepcionados = itemsLegacy.filter((it) => it.estadoPago === "pagado" && it.recepcionado);

  const serviciosActivos = servicios.filter((s) => !s.anulado);
  const serviciosLegacy = serviciosActivos.filter(esPagoAntiguo);
  const serviciosPendientePago = serviciosLegacy.filter((s) => s.estadoPago === "pendiente_pago");
  const serviciosPagados = serviciosLegacy.filter((s) => s.estadoPago === "pagado");

  // CO no procesa compras heredadas (todas pasaron a SC): «Por procesar» solo aparece si queda alguna vigente.
  const hayPorProcesar = itemsPorProcesar.some((it) => !it.anulado);
  const hayPagosMateriales = itemsPendientePago.length + itemsPagados.length + itemsRecepcionados.length > 0;
  // Activos/Completados se ocultan (decisión del usuario, 2026-11-26): las compras nuevas viven en Compras y su costo
  // pasa de comprometido a consumido al pagarse, sin salida de almacén. Su bloque de render se conserva abajo.
  const tabsMateriales = [
    ...(hayPorProcesar ? [{ id: "por-procesar", label: "Por procesar" }] : []),
    ...(hayPagosMateriales ? TABS_PAGO_MATERIALES : []),
  ];
  const tabsServicios = serviciosPendientePago.length + serviciosPagados.length > 0 ? TABS_SERVICIOS : [];
  // Si la pestaña elegida se vacía (p. ej. se descartó la última compra por procesar), se pasa a la primera que quede.
  const tabMat = tabsMateriales.some((t) => t.id === tabMateriales) ? tabMateriales : tabsMateriales[0]?.id;

  const filtradosActivosCompletados = lista
    .filter((r) => itemsVisibles(r).length > 0)
    .filter((r) => tabMat === "activos" ? tieneItemsPendientes(r) : !tieneItemsPendientes(r));

  const fmtFecha = (d) => d ? formatearFecha(d, { day: "2-digit", month: "2-digit", year: "2-digit" }) : "—";
  const fmtFechaExcel = (d) => d ? formatearFecha(d, { day: "2-digit", month: "2-digit", year: "numeric" }) : "—";

  // Excel de todo lo pagado (materiales + servicios) — mismo patrón de
  // XLSX.json_to_sheet + multi-hoja que ya usan ListaCotizaciones.jsx /
  // ListaOrdenesCompra.jsx.
  const filaPagoMaterial = (it) => {
    const ot = it.requerimiento.ordenTrabajo;
    const oc = resolverOC(ot);
    const costo = Number(it.montoUnitario) || 0;
    const flete = Number(it.costoTransporte) || 0;
    const cantidad = Number(it.cantidad) || 0;
    return {
      "OC": oc?.numeroOrden || oc?.codigo || "—",
      "OT": ot?.numeroOT || ot?.codigo || "—",
      "TITULO": celda(ot?.titulo || "—"),
      "CLIENTE": celda(nombreEmpresa(ot?.empresa) || "—"),
      "MATERIALES": celda([it.categoriaNombre, resumenCompra(it)].filter(Boolean).join(" — ")),
      "PROVEEDOR": celda(it.proveedorNombre || "—"),
      "MONEDA": it.moneda || "PEN",
      "COSTO": costo,
      "CANTIDAD": cantidad,
      "FLETE": flete,
      "TOTAL": costo * cantidad + flete,
      "FECHA": fmtFechaExcel(it.fechaPago || it.createdAt),
    };
  };

  const filaPagoServicio = (s) => {
    const ot = s.ordenTrabajo;
    const oc = resolverOC(ot);
    const costo = Number(s.costo) || 0;
    const flete = Number(s.costoTransporte) || 0;
    const cantidad = Number(s.cantidad) || 0;
    return {
      "OC": oc?.numeroOrden || oc?.codigo || "—",
      "OT": ot?.numeroOT || ot?.codigo || "—",
      "TITULO": celda(ot?.titulo || "—"),
      "CLIENTE": celda(nombreEmpresa(ot?.empresa) || "—"),
      "MATERIALES": celda([s.tipoTrabajo, s.material].filter(Boolean).join(" — ")),
      "PROVEEDOR": celda(s.nombreProveedor || "—"),
      "MONEDA": s.moneda || "PEN",
      "COSTO": costo,
      "CANTIDAD": cantidad,
      "FLETE": flete,
      "TOTAL": costo * cantidad + flete,
      "FECHA": fmtFechaExcel(s.fechaPago || s.createdAt),
    };
  };

  // Pagados y recepcionados van juntos: recepcionar no cambia que la compra ya está pagada.
  const exportarPagadosExcel = () => {
    const wb = XLSX.utils.book_new();
    const materialesPagados = [...itemsPagados, ...itemsRecepcionados].filter((it) => !it.anulado);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(materialesPagados.map(filaPagoMaterial)), "Materiales pagados");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(serviciosPagados.map(filaPagoServicio)), "Servicios pagados");
    XLSX.writeFile(wb, "solicitudes-pagadas.xlsx");
  };

  // ── Selección con checkbox (compartida entre Materiales y Servicios) ──
  const toggleSeleccion = (key) => setSeleccionados((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  const filaMaterialKey = (it) => `mat-${it._id}`;
  const filaServicioKey = (s) => `serv-${s._id}`;

  const selMat = (xs) => xs.filter((it) => !it.anulado && seleccionados.has(filaMaterialKey(it)));
  const itemsSeleccionadosPago = selMat(itemsPendientePago);
  const itemsSeleccionadosRecepcion = selMat(itemsPagados);
  const serviciosSeleccionadosPago = serviciosPendientePago.filter((s) => seleccionados.has(filaServicioKey(s)));

  // En serie: varios ítems del mismo requerimiento toman y sueltan su bloqueo uno tras otro.
  // Devuelve el primer error del servidor (o null) para el modal.
  const aplicarASeleccion = async (accion, datos) => {
    const items = accion === "pagar" ? itemsSeleccionadosPago : itemsSeleccionadosRecepcion;
    let error = null;
    try {
      for (const it of items) {
        const rqId = it.requerimiento._id;
        const r = await conBloqueo("requerimiento", rqId, (h) => fetchAuth(`/requerimientos/${rqId}/items/${it._id}/${accion}`, {
          method: "PATCH",
          headers: h,
          body: JSON.stringify(datos),
        }));
        if (!r.ok && !error) error = (await r.json().catch(() => ({}))).mensaje || "No se pudo guardar";
      }
    } finally {
      setSeleccionados(new Set());
      await cargar();
    }
    return error;
  };

  const pagarServiciosSeleccionados = async () => {
    setPagando(true);
    const fallos = [];
    try {
      for (const s of serviciosSeleccionadosPago) {
        const r = await conBloqueo("servicioExterno", s._id, (h) => fetchAuth(`/servicios-externos/${s._id}/pagar`, { method: "PATCH", headers: h }));
        if (!r.ok) fallos.push((await r.json().catch(() => ({}))).mensaje || "Error al marcar como pagado");
      }
    } catch {
      fallos.push("Error al marcar como pagado");
    } finally {
      setPagando(false);
    }
    const total = serviciosSeleccionadosPago.length;
    await cargar();
    setSeleccionados(new Set());
    if (fallos.length) {
      setConfirmandoPago(false);
      setErrorPago(`${fallos.length} de ${total} no se pudieron marcar como pagado: ${fallos[0]}`);
      return;
    }
    // Mismo patrón que ModalCrearOrdenCompra: el rectángulo verde reemplaza
    // la pregunta de confirmación y el panel se cierra solo tras el delay.
    setExitoPago("Solicitud(es) marcada(s) como Pagado.");
    setTimeout(() => { setConfirmandoPago(false); setExitoPago(""); }, 1800);
  };

  // Descartar solo antes de pagar: una compra pagada ya suma al costo de la OT.
  const puedeDescartar = puedeGestionarCompra && (tabMat === "por-procesar" || tabMat === "pendiente-pago");
  const datosAnulacion = (x) => x.anulado
    ? { motivo: x.motivoAnulacion, por: x.anuladoPor, fecha: x.fechaAnulacion ? fmtFechaHora(x.fechaAnulacion) : "" }
    : null;

  const descartar = async (motivo) => {
    const it = porDescartar;
    const rqId = it.requerimiento._id;
    setDescartando(true);
    setErrorDescarte("");
    try {
      const r = await conBloqueo("requerimiento", rqId, (h) => fetchAuth(`/requerimientos/${rqId}/items/${it._id}/anular`, {
        method: "PATCH",
        headers: h,
        body: JSON.stringify({ motivo }),
      }));
      if (!r.ok) {
        setErrorDescarte((await r.json().catch(() => ({}))).mensaje || "No se pudo descartar.");
        return;
      }
      actualizarEnLista(await r.json());
      setPorDescartar(null);
    } finally {
      setDescartando(false);
    }
  };

  const puedeMarcarMateriales = tabMat === "pendiente-pago" ? puedePagar : tabMat === "pagados" ? puedeGestionarCompra : false;
  const listaPipeline = tabMat === "por-procesar" ? itemsPorProcesar
    : tabMat === "pendiente-pago" ? itemsPendientePago
    : tabMat === "pagados" ? itemsPagados
    : itemsRecepcionados;

  const badgeEstado = (x) => {
    const { clase, label } = estadoCompra(x);
    return <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${clase}`}>{label}</span>;
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-800">Requerimientos</h1>
        <p className="text-sm text-gray-400 mt-0.5">Solicitudes de material y servicios externos hechas desde las Órdenes de Trabajo</p>
        <p className="text-xs text-purple-600 mt-1">Las solicitudes de compra por procesar ahora se gestionan en Compras (SC → licitación → OC al proveedor).</p>
      </div>

      {/* Sección: Materiales / Servicios */}
      <div className="flex gap-2">
        {[{ id: "materiales", label: "Materiales" }, { id: "servicios", label: "Servicios" }].map((s) => (
          <button key={s.id} onClick={() => setSeccion(s.id)}
            className={`px-5 py-2 rounded-xl text-sm font-semibold transition ${
              seccion === s.id ? "bg-purple-600 text-white shadow-sm" : "bg-white border border-gray-200 text-gray-500 hover:text-gray-700"
            }`}>
            {s.label}
          </button>
        ))}
      </div>

      {/* Sub-tabs */}
      <div className="flex border-b border-gray-200 gap-1 flex-wrap">
        {(seccion === "materiales" ? tabsMateriales : tabsServicios).map((t) => (
          <button key={t.id}
            onClick={() => seccion === "materiales" ? setTabMateriales(t.id) : setTabServicios(t.id)}
            className={`px-4 py-2.5 text-sm font-medium transition border-b-2 -mb-px ${
              (seccion === "materiales" ? tabMat : tabServicios) === t.id
                ? "border-purple-600 text-purple-700" : "border-transparent text-gray-500 hover:text-gray-700"
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Barra de acción masiva */}
      {seccion === "materiales" && tabMat === "por-procesar" && (
        <p className="text-xs text-gray-500">
          Compras heredadas sin procesar: las compras nuevas se gestionan en Compras. Aquí solo se pueden descartar.
        </p>
      )}
      {seccion === "materiales" && tabMat === "pendiente-pago" && puedePagar && itemsSeleccionadosPago.length > 0 && (
        <div className="flex justify-end">
          <button onClick={() => setModalDatos({ tipo: "pago", n: itemsSeleccionadosPago.length })}
            className="text-sm bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 transition font-medium">
            Marcar como pagado ({itemsSeleccionadosPago.length})
          </button>
        </div>
      )}
      {seccion === "materiales" && !tabMat && (
        <p className="text-center py-10 text-gray-300 text-sm">
          Sin compras heredadas pendientes. Las compras nuevas se gestionan en Compras.
        </p>
      )}
      {seccion === "materiales" && (tabMat === "pagados" || tabMat === "recepcionado") && (
        <div className="flex justify-end gap-2">
          {tabMat === "pagados" && puedeGestionarCompra && itemsSeleccionadosRecepcion.length > 0 && (
            <button onClick={() => setModalDatos({ tipo: "recepcion", n: itemsSeleccionadosRecepcion.length })}
              className="text-sm bg-sky-600 text-white px-4 py-2 rounded-lg hover:bg-sky-700 transition font-medium">
              Recepcionar ({itemsSeleccionadosRecepcion.length})
            </button>
          )}
          <button onClick={exportarPagadosExcel}
            className="text-sm border border-gray-300 text-gray-600 px-4 py-2 rounded-lg hover:bg-gray-50 transition">
            Exportar Excel
          </button>
        </div>
      )}
      {seccion === "servicios" && tabServicios === "pendiente-pago" && puedePagar && serviciosSeleccionadosPago.length > 0 && (
        <div className="flex justify-end">
          <button onClick={() => setConfirmandoPago(true)}
            className="text-sm bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 transition font-medium">
            Marcar como pagado ({serviciosSeleccionadosPago.length})
          </button>
        </div>
      )}
      {seccion === "servicios" && tabServicios === "pagados" && (
        <div className="flex justify-end">
          <button onClick={exportarPagadosExcel}
            className="text-sm border border-gray-300 text-gray-600 px-4 py-2 rounded-lg hover:bg-gray-50 transition">
            Exportar Excel
          </button>
        </div>
      )}

      {/* ── Materiales: Activos / Completados (tarjetas por Requerimiento) ── */}
      {seccion === "materiales" && (tabMat === "activos" || tabMat === "completados") && (
        <div className="space-y-4">
          {filtradosActivosCompletados.length === 0 && (
            <p className="text-center py-10 text-gray-300 text-sm">
              Sin requerimientos {tabMat === "activos" ? "activos" : "completados"}
            </p>
          )}
          {filtradosActivosCompletados.map((r) => {
            const ocRel = resolverOC(r.ordenTrabajo);
            return (
            <div key={r._id} className="bg-white border border-gray-100 rounded-2xl shadow-sm p-5">
              <div className="flex flex-wrap justify-between items-start gap-2 mb-2">
                <div>
                  <p className="font-mono text-xs text-gray-400">
                    {r.codigo}
                    {r.anulado && <span className="ml-1.5 font-sans font-semibold px-1.5 py-0.5 rounded bg-red-100 text-red-700">Anulado</span>}
                  </p>
                  <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                    <span className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700">
                      OT {r.ordenTrabajo?.numeroOT || r.ordenTrabajo?.codigo || "—"}
                    </span>
                    {ocRel && (
                      <span className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded bg-amber-50 text-amber-700">
                        OC {ocRel.numeroOrden || ocRel.codigo}
                      </span>
                    )}
                  </div>
                  {(r.ordenTrabajo?.empresa || r.ordenTrabajo?.planta) && (
                    <p className="text-xs font-semibold text-gray-600 mt-0.5">
                      {nombreEmpresa(r.ordenTrabajo?.empresa)}{r.ordenTrabajo?.planta ? ` — ${r.ordenTrabajo.planta}` : ""}
                    </p>
                  )}
                  <p className="text-sm font-semibold text-gray-800 mt-0.5">{r.ordenTrabajo?.titulo}</p>
                  <p className="text-xs text-gray-500">{r.solicitadoPor}{r.dni ? ` — DNI ${r.dni}` : ""}</p>
                </div>
                <span className="text-xs text-gray-400">{fmtFecha(r.createdAt)}</span>
              </div>
              {r.observaciones && <p className="text-xs text-gray-400 italic mb-2">{r.observaciones}</p>}
              <div>
                {itemsVisibles(r).map((item) => (
                  <FilaItem key={item._id} requerimiento={r} item={item} puedeAtender={puedeAtender}
                    onActualizado={actualizarEnLista} />
                ))}
              </div>
            </div>
            );
          })}
        </div>
      )}

      {/* ── Materiales: Por procesar / Pendiente de pago / Pagados / Recepcionado (compras heredadas) ── */}
      {seccion === "materiales" && ["por-procesar", "pendiente-pago", "pagados", "recepcionado"].includes(tabMat) && (
        <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-5">
          {listaPipeline.length === 0 ? (
            <p className="text-center py-10 text-gray-400 text-sm">Sin solicitudes de compra en esta vista</p>
          ) : listaPipeline.map((it) => {
            const key = filaMaterialKey(it);
            const rq = it.requerimiento;
            return (
              <FilaSeleccionable key={key}
                seleccionado={seleccionados.has(key)}
                disabledCheckbox={!puedeMarcarMateriales}
                onToggle={() => toggleSeleccion(key)}
                ot={rq.ordenTrabajo}
                oc={resolverOC(rq.ordenTrabajo)}
                cliente={nombreEmpresa(rq.ordenTrabajo?.empresa)}
                planta={rq.ordenTrabajo?.planta}
                descripcion={descripcionMaterial(it)}
                observacion={rq.observaciones}
                proveedor={it.proveedorNombre}
                precio={it.montoUnitario}
                flete={it.costoTransporte}
                moneda={it.moneda}
                referencia={`${it.categoriaNombre || "Otros"} — ${rq.codigo}`}
                estado={badgeEstado(it)}
                anulacion={datosAnulacion(it)}
                onDescartar={puedeDescartar ? () => { setErrorDescarte(""); setPorDescartar(it); } : null}
                correcciones={it.correccionesMonto}
                cantidad={it.cantidad}
                unidad={it.materialAsociado?.unidad}
                fecha={fmtFecha(it.fechaProcesado || it.createdAt)}
                detalle={<DetallePagoRecepcion x={it} />}
                adjuntos={
                  <AdjuntosCompra requerimientoId={rq._id} itemId={it._id} archivos={it.archivos}
                    puedeEditar={puedeGestionarCompra && tabMat !== "por-procesar"}
                    onCambio={(archivos) => actualizarArchivos(rq._id, it._id, archivos)} />
                }
              />
            );
          })}
        </div>
      )}

      {/* ── Servicios: Pendiente de pago / Pagados ── */}
      {seccion === "servicios" && (
        <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-5">
          {(() => {
            const items = tabServicios === "pendiente-pago" ? serviciosPendientePago : serviciosPagados;
            if (items.length === 0) {
              return <p className="text-center py-1 text-gray-300 text-sm">Sin servicios en esta vista</p>;
            }
            return items.map((s) => {
              const key = filaServicioKey(s);
              return (
                <FilaSeleccionable key={key}
                  seleccionado={seleccionados.has(key)}
                  disabledCheckbox={!(tabServicios === "pendiente-pago" && puedePagar)}
                  onToggle={() => toggleSeleccion(key)}
                  ot={s.ordenTrabajo}
                  oc={resolverOC(s.ordenTrabajo)}
                  cliente={nombreEmpresa(s.ordenTrabajo?.empresa)}
                  planta={s.ordenTrabajo?.planta}
                  descripcion={s.material || "—"}
                  observacion={s.observaciones}
                  proveedor={s.nombreProveedor}
                  precio={s.costo > 0 ? s.costo : null}
                  flete={s.costoTransporte}
                  moneda={s.moneda}
                  referencia={[s.tipoTrabajo, s.codigo].filter(Boolean).join(" — ")}
                  estado={badgeEstado(s)}
                  correcciones={s.correccionesMonto}
                  cantidad={s.cantidad}
                  unidad=""
                  fecha={fmtFecha(s.fechaProcesado || s.createdAt)}
                  detalle={<DetallePagoRecepcion x={s} />}
                />
              );
            });
          })()}
        </div>
      )}

      {modalDatos?.tipo === "pago" && (
        <ModalDatosCompra
          titulo="Marcar como pagado"
          descripcion={`${modalDatos.n} solicitud(es) seleccionada(s).`}
          campos={CAMPOS_PAGO}
          inicial={{ fechaPago: fechaHoyLima(), pagador: "" }}
          textoConfirmar="Marcar como pagado"
          onCancelar={() => setModalDatos(null)}
          onConfirmar={(datos) => aplicarASeleccion("pagar", datos)}
        />
      )}

      {modalDatos?.tipo === "recepcion" && (
        <ModalDatosCompra
          titulo="Recepcionar compra"
          descripcion={`${modalDatos.n} solicitud(es) seleccionada(s). Las compras recepcionadas pasan a Activos para vincularlas a un SKU y entregarlas a la OT.`}
          campos={CAMPOS_RECEPCION}
          inicial={{ fechaRecepcion: fechaHoyLima(), receptor: "", guiaRecepcion: "", facturaRecepcion: "" }}
          textoConfirmar="Recepcionar"
          onCancelar={() => setModalDatos(null)}
          onConfirmar={(datos) => aplicarASeleccion("recepcionar", datos)}
        />
      )}

      {porDescartar && (
        <PromptAccion
          titulo="Descartar compra"
          label={`Motivo de anulación o descarte * (quedará registrado a nombre de ${usuario?.nombre || "tu usuario"}, con la fecha y hora)`}
          placeholder="Ej. ya no se requiere, se consiguió en stock…"
          maxLength={500}
          onCancelar={() => setPorDescartar(null)}
          onConfirmar={descartar}
          procesando={descartando}
          textoConfirmar="Descartar"
          peligro
          error={errorDescarte}
        />
      )}

      {confirmandoPago && (
        <ConfirmacionAccion
          mensaje={`¿Marcar ${serviciosSeleccionadosPago.length} servicio(s) como Pagado?`}
          onCancelar={() => setConfirmandoPago(false)}
          onConfirmar={pagarServiciosSeleccionados}
          procesando={pagando}
          textoConfirmar="Marcar como pagado"
          exito={exitoPago}
        />
      )}

      {errorPago && <AvisoAccion mensaje={errorPago} onCerrar={() => setErrorPago("")} />}
    </div>
  );
}
