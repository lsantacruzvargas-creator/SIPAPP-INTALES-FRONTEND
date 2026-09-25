import { useState, useEffect, useCallback } from "react";
import * as XLSX from "xlsx";
import { fetchAuth, getUsuario } from "../utils/fetchAuth";
import { formatearFecha } from "../utils/fecha";
import SelectorMateriales from "../components/SelectorMateriales";
import PromptAccion from "../components/PromptAccion";
import ConfirmacionAccion from "../components/ConfirmacionAccion";
import ModalProcesarSolicitud from "../components/ModalProcesarSolicitud";

const ESTADO_ITEM = {
  pendiente: "bg-blue-100 text-blue-700",
  atendido: "bg-green-100 text-green-700",
  cerrado: "bg-green-100 text-green-700",
  rechazado: "bg-red-100 text-red-700",
};

const money = (v) => "S/ " + Number(v ?? 0).toLocaleString("es-PE", { minimumFractionDigits: 2 });

function resumenCompra(item) {
  return Object.entries(item.camposCompra || {}).map(([k, v]) => `${k}: ${v}`).join(" · ");
}

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
    const r = await fetchAuth(`/requerimientos/${requerimientoId}/items/${item._id}/salida`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lote, cantidad: Number(cantidad), precioUnitario: precioAuto }),
    });
    if (r.ok) {
      onListo(await r.json());
    } else {
      const d = await r.json();
      setError(d.mensaje || "Error al registrar la salida");
    }
    setGuardando(false);
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
    const r = await fetchAuth(`/requerimientos/${requerimientoId}/items/${item._id}/devolucion`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cantidad: Number(cantidad) }),
    });
    if (r.ok) {
      onListo(await r.json());
    } else {
      const d = await r.json();
      setError(d.mensaje || "Error al registrar la devolución");
    }
    setGuardando(false);
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
  const unidad = item.esSolicitudCompra ? item.materialAsociado?.unidad : item.material?.unidad;

  const accion = async (endpoint, body) => {
    const r = await fetchAuth(`/requerimientos/${requerimiento._id}/items/${item._id}/${endpoint}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {}),
    });
    if (r.ok) onActualizado(await r.json());
  };

  const rechazar = async (motivo) => {
    setRechazando(true);
    await accion("rechazar", { motivo });
    setRechazando(false);
    setConfirmandoRechazo(false);
  };

  const vincular = (material) => {
    setBuscadorAbierto(false);
    accion("vincular-material", { material: material._id });
  };

  return (
    <div className="border-t border-gray-50 first:border-t-0 py-2.5">
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          {item.esSolicitudCompra ? (
            <>
              <p className="text-sm font-medium text-gray-800">
                <span className="text-xs px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 mr-1.5">Compra</span>
                {item.categoriaNombre} — {item.cantidad}
              </p>
              <p className="text-xs text-gray-400 truncate">{resumenCompra(item)}</p>
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
        {puedeAtender && item.estado === "pendiente" && (!item.esSolicitudCompra || item.materialAsociado) && (
          <button onClick={() => setPanelSalida((v) => !v)}
            className="text-xs bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-lg hover:bg-emerald-100 transition font-medium shrink-0">
            Atender
          </button>
        )}
        {puedeAtender && item.estado === "pendiente" && item.esSolicitudCompra && !item.materialAsociado && (
          <button onClick={() => setBuscadorAbierto(true)}
            className="text-xs bg-blue-50 text-blue-700 px-2.5 py-1 rounded-lg hover:bg-blue-100 transition font-medium shrink-0">
            Vincular SKU
          </button>
        )}
        {puedeAtender && item.estado === "pendiente" && (
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

// ─── Fila con checkbox del pipeline Por procesar / Pendiente de pago / Pagados ──

// Un ítem de solicitud puede tratarse a nombre de un cliente/planta distinto
// del de quien lo pidió — el usuario pidió que OC/OT/Cliente/Planta queden
// notoriamente visibles en cada fila, no solo la OT (revisión 2026-09-14).
function FilaSeleccionable({ seleccionado, onToggle, disabledCheckbox, ot, oc, cliente, planta, titulo, subtitulo, cantidad, unidad, fecha, chips }) {
  return (
    <div className="flex items-start gap-3 border-t border-gray-50 first:border-t-0 py-3">
      <input type="checkbox" checked={seleccionado} disabled={disabledCheckbox}
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
        <p className="text-sm font-medium text-gray-800">{titulo}</p>
        {subtitulo && <p className="text-xs text-gray-400">{subtitulo}</p>}
        {chips}
      </div>
      <div className="text-right shrink-0">
        <p className="text-sm text-gray-700">{cantidad} {unidad || ""}</p>
        <p className="text-xs text-gray-400">{fecha}</p>
      </div>
    </div>
  );
}

// ─── Página principal ────────────────────────────────────────────────────────

const TABS_MATERIALES = [
  { id: "activos", label: "Activos" },
  { id: "completados", label: "Completados" },
  { id: "por-procesar", label: "Por procesar" },
  { id: "pendiente-pago", label: "Pendiente de pago" },
  { id: "pagados", label: "Pagados" },
];
const TABS_SERVICIOS = [
  { id: "por-procesar", label: "Por procesar" },
  { id: "pendiente-pago", label: "Pendiente de pago" },
  { id: "pagados", label: "Pagados" },
];

export default function Requerimientos() {
  const [lista, setLista] = useState([]);
  const [servicios, setServicios] = useState([]);
  const [ordenesCompra, setOrdenesCompra] = useState([]);
  const [seccion, setSeccion] = useState("materiales");
  const [tabMateriales, setTabMateriales] = useState("activos");
  const [tabServicios, setTabServicios] = useState("por-procesar");
  const [seleccionados, setSeleccionados] = useState(() => new Set());
  const [procesarOpen, setProcesarOpen] = useState(false);
  const [confirmandoPago, setConfirmandoPago] = useState(false);
  const [pagando, setPagando] = useState(false);
  const [exitoPago, setExitoPago] = useState("");
  const usuario = getUsuario();
  const puedeAtender = ["admin", "jefatura", "almacenero"].includes(usuario?.rol);
  // "Procesar solicitud" (elegir proveedor + monto) — rol vendedor, más
  // admin como excepción (mismo criterio que el resto de acciones
  // restringidas de la app).
  const puedeProcesar = ["vendedor", "admin"].includes(usuario?.rol);
  // "Marcar como pagado" — exclusivo Coordinadora/Jefatura/Admin.
  const puedePagar = ["admin", "jefatura", "coordinadora"].includes(usuario?.rol);

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

  const tieneItemsPendientes = (r) => r.items.some((it) => it.estado === "pendiente");
  const filtradosActivosCompletados = lista.filter((r) => {
    if (tabMateriales === "activos") return tieneItemsPendientes(r);
    if (tabMateriales === "completados") return !tieneItemsPendientes(r);
    return false;
  });

  // Ítems de solicitud de compra "aplanados" con su Requerimiento padre —
  // el pipeline de pago vive a nivel de ítem, no de Requerimiento completo.
  const itemsCompra = lista.flatMap((r) =>
    (r.items || [])
      .filter((it) => it.esSolicitudCompra)
      .map((it) => ({ ...it, requerimiento: r }))
  );
  const itemsPorProcesar = itemsCompra.filter((it) => (it.estadoPago || "por_procesar") === "por_procesar");
  const itemsPendientePago = itemsCompra.filter((it) => it.estadoPago === "pendiente_pago");
  const itemsPagados = itemsCompra.filter((it) => it.estadoPago === "pagado");

  const serviciosActivos = servicios.filter((s) => !s.anulado);
  const serviciosPorProcesar = serviciosActivos.filter((s) => (s.estadoPago || "por_procesar") === "por_procesar");
  const serviciosPendientePago = serviciosActivos.filter((s) => s.estadoPago === "pendiente_pago");
  const serviciosPagados = serviciosActivos.filter((s) => s.estadoPago === "pagado");

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
      "TITULO": ot?.titulo || "—",
      "CLIENTE": nombreEmpresa(ot?.empresa) || "—",
      "MATERIALES": [it.categoriaNombre, resumenCompra(it)].filter(Boolean).join(" — "),
      "PROVEEDOR": it.proveedorNombre || "—",
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
      "TITULO": ot?.titulo || "—",
      "CLIENTE": nombreEmpresa(ot?.empresa) || "—",
      "MATERIALES": [s.tipoTrabajo, s.material].filter(Boolean).join(" — "),
      "PROVEEDOR": s.nombreProveedor || "—",
      "COSTO": costo,
      "CANTIDAD": cantidad,
      "FLETE": flete,
      "TOTAL": costo * cantidad + flete,
      "FECHA": fmtFechaExcel(s.fechaPago || s.createdAt),
    };
  };

  const exportarPagadosExcel = () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(itemsPagados.map(filaPagoMaterial)), "Materiales pagados");
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

  const itemsSeleccionadosMateriales = itemsPorProcesar.filter((it) => seleccionados.has(filaMaterialKey(it)));
  const itemsSeleccionadosPagoMateriales = itemsPendientePago.filter((it) => seleccionados.has(filaMaterialKey(it)));
  const serviciosSeleccionados = serviciosPorProcesar.filter((s) => seleccionados.has(filaServicioKey(s)));
  const serviciosSeleccionadosPago = serviciosPendientePago.filter((s) => seleccionados.has(filaServicioKey(s)));

  const hayPorProcesarSeleccionados = seccion === "materiales" ? itemsSeleccionadosMateriales.length > 0 : serviciosSeleccionados.length > 0;
  const hayPendientePagoSeleccionados = seccion === "materiales" ? itemsSeleccionadosPagoMateriales.length > 0 : serviciosSeleccionadosPago.length > 0;

  const itemsParaModal = seccion === "materiales"
    ? itemsSeleccionadosMateriales.map((it) => ({
        key: filaMaterialKey(it),
        requerimientoId: it.requerimiento._id,
        id: it._id,
        label: `${it.categoriaNombre} — ${it.requerimiento.codigo}`,
        cantidad: it.cantidad,
        unidad: it.materialAsociado?.unidad || "",
      }))
    : serviciosSeleccionados.map((s) => ({
        key: filaServicioKey(s),
        id: s._id,
        label: `${s.tipoTrabajo} — ${s.material}`,
        cantidad: s.cantidad,
        unidad: "",
      }));

  // El propio ModalProcesarSolicitud ya muestra su rectángulo verde de éxito
  // (mismo patrón que ModalCrearOrdenCompra) antes de llamar a onProcesado.
  const procesarListo = async () => {
    setProcesarOpen(false);
    setSeleccionados(new Set());
    await cargar();
  };

  const pagarSeleccionados = async () => {
    setPagando(true);
    if (seccion === "materiales") {
      for (const it of itemsSeleccionadosPagoMateriales) {
        await fetchAuth(`/requerimientos/${it.requerimiento._id}/items/${it._id}/pagar`, { method: "PATCH" });
      }
    } else {
      for (const s of serviciosSeleccionadosPago) {
        await fetchAuth(`/servicios-externos/${s._id}/pagar`, { method: "PATCH" });
      }
    }
    setPagando(false);
    await cargar();
    setSeleccionados(new Set());
    // Mismo patrón que ModalCrearOrdenCompra: el rectángulo verde reemplaza
    // la pregunta de confirmación y el panel se cierra solo tras el delay.
    setExitoPago("Solicitud(es) marcada(s) como Pagado.");
    setTimeout(() => { setConfirmandoPago(false); setExitoPago(""); }, 1800);
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-800">Requerimientos</h1>
        <p className="text-sm text-gray-400 mt-0.5">Solicitudes de material y servicios externos hechas desde las Órdenes de Trabajo</p>
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
        {(seccion === "materiales" ? TABS_MATERIALES : TABS_SERVICIOS).map((t) => (
          <button key={t.id}
            onClick={() => seccion === "materiales" ? setTabMateriales(t.id) : setTabServicios(t.id)}
            className={`px-4 py-2.5 text-sm font-medium transition border-b-2 -mb-px ${
              (seccion === "materiales" ? tabMateriales : tabServicios) === t.id
                ? "border-purple-600 text-purple-700" : "border-transparent text-gray-500 hover:text-gray-700"
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Barra de acción masiva */}
      {seccion === "materiales" && tabMateriales === "por-procesar" && puedeProcesar && hayPorProcesarSeleccionados && (
        <div className="flex justify-end">
          <button onClick={() => setProcesarOpen(true)}
            className="text-sm bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition font-medium">
            Procesar solicitud ({itemsSeleccionadosMateriales.length})
          </button>
        </div>
      )}
      {seccion === "materiales" && tabMateriales === "pendiente-pago" && puedePagar && hayPendientePagoSeleccionados && (
        <div className="flex justify-end">
          <button onClick={() => setConfirmandoPago(true)}
            className="text-sm bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 transition font-medium">
            Marcar como pagado ({itemsSeleccionadosPagoMateriales.length})
          </button>
        </div>
      )}
      {seccion === "servicios" && tabServicios === "por-procesar" && puedeProcesar && hayPorProcesarSeleccionados && (
        <div className="flex justify-end">
          <button onClick={() => setProcesarOpen(true)}
            className="text-sm bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition font-medium">
            Procesar solicitud ({serviciosSeleccionados.length})
          </button>
        </div>
      )}
      {seccion === "servicios" && tabServicios === "pendiente-pago" && puedePagar && hayPendientePagoSeleccionados && (
        <div className="flex justify-end">
          <button onClick={() => setConfirmandoPago(true)}
            className="text-sm bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 transition font-medium">
            Marcar como pagado ({serviciosSeleccionadosPago.length})
          </button>
        </div>
      )}
      {((seccion === "materiales" && tabMateriales === "pagados") || (seccion === "servicios" && tabServicios === "pagados")) && (
        <div className="flex justify-end">
          <button onClick={exportarPagadosExcel}
            className="text-sm border border-gray-300 text-gray-600 px-4 py-2 rounded-lg hover:bg-gray-50 transition">
            Exportar Excel
          </button>
        </div>
      )}

      {/* ── Materiales: Activos / Completados (tarjetas por Requerimiento, sin cambios) ── */}
      {seccion === "materiales" && (tabMateriales === "activos" || tabMateriales === "completados") && (
        <div className="space-y-4">
          {filtradosActivosCompletados.length === 0 && (
            <p className="text-center py-10 text-gray-300 text-sm">
              Sin requerimientos {tabMateriales === "activos" ? "activos" : "completados"}
            </p>
          )}
          {filtradosActivosCompletados.map((r) => {
            const ocRel = resolverOC(r.ordenTrabajo);
            return (
            <div key={r._id} className="bg-white border border-gray-100 rounded-2xl shadow-sm p-5">
              <div className="flex flex-wrap justify-between items-start gap-2 mb-2">
                <div>
                  <p className="font-mono text-xs text-gray-400">{r.codigo}</p>
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
                {r.items.map((item) => (
                  <FilaItem key={item._id} requerimiento={r} item={item} puedeAtender={puedeAtender}
                    onActualizado={actualizarEnLista} />
                ))}
              </div>
            </div>
            );
          })}
        </div>
      )}

      {/* ── Materiales: Por procesar / Pendiente de pago / Pagados (lista con checkbox) ── */}
      {seccion === "materiales" && ["por-procesar", "pendiente-pago", "pagados"].includes(tabMateriales) && (
        <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-5">
          {(() => {
            const items = tabMateriales === "por-procesar" ? itemsPorProcesar
              : tabMateriales === "pendiente-pago" ? itemsPendientePago
              : itemsPagados;
            if (items.length === 0) {
              return <p className="text-center py-10 text-gray-00 text-md">Sin solicitudes de compra en esta vista</p>;
            }
            return items.map((it) => {
              const key = filaMaterialKey(it);
              const puedeMarcar = tabMateriales === "por-procesar" ? puedeProcesar : tabMateriales === "pendiente-pago" ? puedePagar : false;
              return (
                <FilaSeleccionable key={key}
                  seleccionado={seleccionados.has(key)}
                  disabledCheckbox={!puedeMarcar}
                  onToggle={() => toggleSeleccion(key)}
                  ot={it.requerimiento.ordenTrabajo}
                  oc={resolverOC(it.requerimiento.ordenTrabajo)}
                  cliente={nombreEmpresa(it.requerimiento.ordenTrabajo?.empresa)}
                  planta={it.requerimiento.ordenTrabajo?.planta}
                  titulo={`${it.categoriaNombre} — ${it.requerimiento.codigo}`}
                  subtitulo={resumenCompra(it)}
                  cantidad={it.cantidad}
                  unidad={it.materialAsociado?.unidad}
                  fecha={fmtFecha(it.fechaProcesado || it.createdAt)}
                  chips={
                    <div className="flex flex-wrap items-center gap-1.5 mt-1">
                      <span className={`px-2 py-0.5 rounded-full text-[1px] font-semibold ${ESTADO_ITEM[it.estado]}`}>{it.estado}</span>
                      {it.proveedorNombre && (
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-purple-50 text-purple-700">
                          {it.proveedorNombre}
                        </span>
                      )}
                      {it.montoUnitario != null && (
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">
                          {money(it.montoUnitario)}/u{it.costoTransporte > 0 ? ` + ${money(it.costoTransporte)} transporte` : ""}
                        </span>
                      )}
                    </div>
                  }
                />
              );
            });
          })()}
        </div>
      )}

      {/* ── Servicios: Por procesar / Pendiente de pago / Pagados ── */}
      {seccion === "servicios" && (
        <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-5">
          {(() => {
            const items = tabServicios === "por-procesar" ? serviciosPorProcesar
              : tabServicios === "pendiente-pago" ? serviciosPendientePago
              : serviciosPagados;
            if (items.length === 0) {
              return <p className="text-center py-1 text-gray-300 text-sm">Sin servicios en esta vista</p>;
            }
            return items.map((s) => {
              const key = filaServicioKey(s);
              const puedeMarcar = tabServicios === "por-procesar" ? puedeProcesar : tabServicios === "pendiente-pago" ? puedePagar : false;
              return (
                <FilaSeleccionable key={key}
                  seleccionado={seleccionados.has(key)}
                  disabledCheckbox={!puedeMarcar}
                  onToggle={() => toggleSeleccion(key)}
                  ot={s.ordenTrabajo}
                  oc={resolverOC(s.ordenTrabajo)}
                  cliente={nombreEmpresa(s.ordenTrabajo?.empresa)}
                  planta={s.ordenTrabajo?.planta}
                  titulo={s.tipoTrabajo}
                  subtitulo={s.material}
                  cantidad={s.cantidad}
                  unidad=""
                  fecha={fmtFecha(s.fechaProcesado || s.createdAt)}
                  chips={
                    <div className="flex flex-wrap items-center gap-1.5 mt-1">
                      {s.nombreProveedor && (
                        <span className="text-[px] font-medium px-1.5 py-0.5 rounded bg-purple-50 text-purple-700">
                          {s.nombreProveedor}
                        </span>
                      )}
                      {s.costo > 0 && (
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">
                          {money(s.costo)}/u{s.costoTransporte > 0 ? ` + ${money(s.costoTransporte)} transporte` : ""}
                        </span>
                      )}
                    </div>
                  }
                />
              );
            });
          })()}
        </div>
      )}

      {procesarOpen && (
        <ModalProcesarSolicitud
          tipo={seccion === "materiales" ? "material" : "servicio"}
          items={itemsParaModal}
          onClose={() => setProcesarOpen(false)}
          onProcesado={procesarListo}
        />
      )}

      {confirmandoPago && (
        <ConfirmacionAccion
          mensaje={`¿Marcar ${seccion === "materiales" ? itemsSeleccionadosPagoMateriales.length : serviciosSeleccionadosPago.length} solicitud(es) como Pagado?`}
          onCancelar={() => setConfirmandoPago(false)}
          onConfirmar={pagarSeleccionados}
          procesando={pagando}
          textoConfirmar="Marcar como pagado"
          exito={exitoPago}
        />
      )}
    </div>
  );
}
