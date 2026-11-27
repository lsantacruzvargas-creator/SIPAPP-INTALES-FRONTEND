import { useState, useEffect, useCallback } from "react";
import { fetchAuth, getUsuario } from "../utils/fetchAuth";
import { formatearFecha } from "../utils/fecha";
import SelectorMateriales from "../components/SelectorMateriales";
import PromptAccion from "../components/PromptAccion";
import ConfirmacionAccion from "../components/ConfirmacionAccion";
import { costoCompraSoles } from "../utils/montoCompra";
import { estadoCompra } from "../utils/estadoCompra";
import { r2 } from "../utils/redondeo";

const INP = "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white";
// Mismas unidades que el formulario de SKU de Almacén (Inventario).
const UNIDADES = ["und", "kg", "g", "L", "mL", "m", "cm", "m²", "caja", "rollo", "par", "juego", "bolsa"];

const soles = (v) => `S/ ${Number(v || 0).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Mismo cálculo que el backend (routes/requerimientos.js, costoUnitarioCompra): flete prorrateado sobre lo comprado.
const costoUnitarioCompra = (item) => r2(costoCompraSoles({
  unitario: item.montoUnitario, cantidad: item.cantidad, flete: item.costoTransporte, moneda: item.moneda, tipoCambio: item.tipoCambio,
}) / item.cantidad);

const ESTADO_ITEM = {
  pendiente: "bg-blue-100 text-blue-700",
  atendido: "bg-green-100 text-green-700",
  cerrado: "bg-green-100 text-green-700",
  rechazado: "bg-red-100 text-red-700",
};

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
  const [confirmando, setConfirmando] = useState(false);
  const [error, setError] = useState("");
  const unidad = (item.esSolicitudCompra ? item.materialAsociado?.unidad : item.material?.unidad) || "";

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
  const loteSel = lotes.find((l) => l.lote === lote);

  const intentarConfirmar = () => {
    if (!lote || cantidad === "" || cantidad == null) { setError("Selecciona el lote e ingresa la cantidad."); return; }
    if (!(Number(cantidad) > 0)) { setError("La cantidad debe ser un número mayor a 0 (usa punto para los decimales)."); return; }
    if (loteSel && Number(cantidad) > Number(loteSel.cantidadDisponible)) {
      setError(`El lote ${lote} solo tiene ${loteSel.cantidadDisponible} disponible(s).`);
      return;
    }
    setError("");
    setConfirmando(true);
  };

  const confirmar = async () => {
    setConfirmando(false);
    setGuardando(true);
    try {
      const r = await fetchAuth(`/requerimientos/${requerimientoId}/items/${item._id}/salida`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lote, cantidad: Number(cantidad) }),
      });
      if (r.ok) {
        onListo(await r.json());
      } else {
        const d = await r.json().catch(() => ({}));
        setError(d.mensaje || "Error al registrar la salida");
      }
    } catch {
      setError("No se pudo conectar con el servidor. Revisa el requerimiento antes de reintentar.");
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
            <button onClick={intentarConfirmar} disabled={guardando || !lote}
              className="text-xs bg-emerald-600 text-white px-3 py-1.5 rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition font-medium">
              {guardando ? "Guardando…" : "Confirmar salida"}
            </button>
            <button onClick={onClose} className="text-xs text-gray-400 hover:text-gray-700">Cancelar</button>
          </div>
        </>
      )}
      {confirmando && (
        <ConfirmacionAccion
          mensaje={`¿Confirmas la salida de ${cantidad} ${unidad} del lote ${lote} a la OT (${cantidad} × ${soles(precioAuto)} = ${soles(Number(cantidad) * Number(precioAuto))})?`}
          onCancelar={() => setConfirmando(false)}
          onConfirmar={confirmar}
          procesando={guardando}
          textoConfirmar="Confirmar salida"
        />
      )}
    </div>
  );
}

// ─── Ingreso al almacén de una compra recepcionada en Compras ──────────────
// Vincula la compra a un SKU existente o crea uno nuevo, y registra el ingreso con el costo de la compra (en soles,
// flete incluido). Después el ítem se atiende como uno de stock (salida a la OT).

function ModalIngresoAlmacen({ requerimiento, item, onClose, onListo }) {
  const [form, setForm] = useState({
    modo: "existente",
    cantidad: item.cantidad,
    guiaProveedor: item.guiaRecepcion || "",
    tipoComponente: "", categoria: "", codigo: "",
    nombre: item.camposCompra?.descripcion || item.categoriaNombre || "",
    descripcion: resumenCompra(item),
    unidad: "und", stockMinimo: 0, ubicacion: "", tipoMaterial: "",
  });
  const [material, setMaterial] = useState(item.materialAsociado?._id ? item.materialAsociado : null);
  const [buscadorAbierto, setBuscadorAbierto] = useState(false);
  const [lookups, setLookups] = useState({ ubicaciones: [], tiposComponente: [], categorias: [] });
  const [confirmando, setConfirmando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([
      fetchAuth("/ubicaciones"),
      fetchAuth("/tipos-componente"),
      fetchAuth("/categorias-componente"),
    ]).then(async ([ru, rt, rc]) => {
      setLookups({
        ubicaciones: ru.ok ? await ru.json() : [],
        tiposComponente: rt.ok ? await rt.json() : [],
        categorias: rc.ok ? await rc.json() : [],
      });
    }).catch(() => {});
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    // La categoría es hija del tipo de componente: cambiar el tipo la invalida.
    if (name === "tipoComponente") setForm((f) => ({ ...f, tipoComponente: value, categoria: "" }));
    else setForm((f) => ({ ...f, [name]: value }));
  };

  const categoriasDelTipo = lookups.categorias.filter(
    (c) => (c.tipoComponente?._id || c.tipoComponente) === form.tipoComponente
  );
  const costoUnit = costoUnitarioCompra(item);
  const esNuevo = form.modo === "nuevo";
  const unidad = esNuevo ? form.unidad : material?.unidad || "";
  const nombreSku = esNuevo ? form.nombre.trim() : material ? `${material.sku} — ${material.nombre}` : "";
  // Compra vinculada con el flujo anterior (Vincular SKU + ingreso manual en Almacén): su stock pudo entrar ya.
  const vinculadaAntes = !!item.materialAsociado;

  const intentarGuardar = () => {
    const cant = Number(form.cantidad);
    if (form.cantidad === "" || !(cant > 0)) { setError("La cantidad debe ser un número mayor a 0 (usa punto para los decimales)."); return; }
    if (cant > item.cantidad) { setError(`No puedes ingresar más de lo comprado (${item.cantidad}).`); return; }
    if (esNuevo) {
      if (!form.codigo.trim()) { setError("El código del SKU es obligatorio."); return; }
      if (!form.nombre.trim()) { setError("El título del SKU es obligatorio."); return; }
      if (!form.descripcion.trim()) { setError("La descripción del SKU es obligatoria."); return; }
      if (!form.tipoMaterial) { setError("Selecciona si el SKU es Repuesto o Consumible."); return; }
      if (form.stockMinimo !== "" && !(Number(form.stockMinimo) >= 0)) { setError("El stock mínimo debe ser un número mayor o igual a 0."); return; }
    } else if (!material) {
      setError("Busca y elige el SKU al que se vincula la compra.");
      return;
    }
    setError("");
    setConfirmando(true);
  };

  const guardar = async () => {
    setConfirmando(false);
    setGuardando(true);
    const body = { cantidad: Number(form.cantidad), guiaProveedor: form.guiaProveedor };
    if (esNuevo) {
      body.nuevoMaterial = {
        codigo: form.codigo, nombre: form.nombre, descripcion: form.descripcion, unidad: form.unidad,
        tipoMaterial: form.tipoMaterial, stockMinimo: form.stockMinimo,
      };
      for (const campo of ["ubicacion", "tipoComponente", "categoria"]) {
        if (form[campo]) body.nuevoMaterial[campo] = form[campo];
      }
    } else {
      body.material = material._id;
    }
    try {
      const r = await fetchAuth(`/requerimientos/${requerimiento._id}/items/${item._id}/ingresar-almacen`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (r.ok) {
        onListo(await r.json());
      } else {
        const d = await r.json().catch(() => ({}));
        setError(d.mensaje || "Error al ingresar la compra al almacén");
      }
    } catch {
      setError("No se pudo conectar con el servidor. Revisa el requerimiento antes de reintentar.");
    } finally {
      setGuardando(false);
    }
  };

  const tabModo = (modo, label) => (
    <button type="button" onClick={() => { setForm((f) => ({ ...f, modo })); setError(""); }}
      className={`flex-1 px-3 py-2 text-sm font-medium rounded-lg transition ${
        form.modo === modo ? "bg-white shadow-sm text-gray-800" : "text-gray-500 hover:text-gray-700"
      }`}>
      {label}
    </button>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <div>
            <h3 className="font-semibold text-gray-800">Ingresar compra al almacén</h3>
            <p className="text-xs text-gray-400">{requerimiento.codigo} · {item.categoriaNombre} — {item.cantidad}</p>
          </div>
          <button onClick={onClose} disabled={guardando} className="text-gray-400 hover:text-gray-700 text-xl leading-none">✕</button>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto flex-1">
          {error && <p className="text-sm text-red-500 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}

          <div className="text-xs text-gray-500 bg-gray-50 rounded-xl px-4 py-3 space-y-0.5">
            <p className="truncate">{resumenCompra(item)}</p>
            <p>Proveedor: <strong>{item.proveedorNombre || "—"}</strong>{item.guiaRecepcion ? ` · Guía ${item.guiaRecepcion}` : ""}</p>
          </div>

          {vinculadaAntes && (
            <p className="text-xs text-amber-700 bg-amber-50 px-3 py-2 rounded-lg">
              Esta compra ya estaba vinculada a {item.materialAsociado.sku}. Si su stock ya se registró a mano en Almacén, no
              la ingreses de nuevo: cierra este formulario y usa «Atender».
            </p>
          )}

          <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
            {tabModo("existente", "Vincular a SKU existente")}
            {tabModo("nuevo", "Crear SKU nuevo")}
          </div>

          {esNuevo ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-500 block mb-1">Tipo Componente</label>
                <select name="tipoComponente" value={form.tipoComponente} onChange={handleChange} className={INP}>
                  <option value="">Sin clasificar</option>
                  {lookups.tiposComponente.map((t) => <option key={t._id} value={t._id}>{t.nombre}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Categoría</label>
                <select name="categoria" value={form.categoria} onChange={handleChange} disabled={!form.tipoComponente} className={INP}>
                  <option value="">{form.tipoComponente ? "Sin clasificar" : "Elige un Tipo Componente primero"}</option>
                  {categoriasDelTipo.map((c) => <option key={c._id} value={c._id}>{c.nombre}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Código *</label>
                <input name="codigo" value={form.codigo} onChange={handleChange} className={INP} />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Título *</label>
                <input name="nombre" value={form.nombre} onChange={handleChange} className={INP} />
              </div>
              <div className="md:col-span-2">
                <label className="text-xs text-gray-500 block mb-1">Descripción *</label>
                <input name="descripcion" value={form.descripcion} onChange={handleChange} className={INP} />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Unidad de medida</label>
                <select name="unidad" value={form.unidad} onChange={handleChange} className={INP}>
                  {UNIDADES.map((u) => <option key={u}>{u}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Centro de costo *</label>
                <select name="tipoMaterial" value={form.tipoMaterial} onChange={handleChange} className={INP}>
                  <option value="">Seleccionar…</option>
                  <option value="repuesto">Repuesto</option>
                  <option value="consumible">Consumible</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Ubicación</label>
                <select name="ubicacion" value={form.ubicacion} onChange={handleChange} className={INP}>
                  <option value="">Sin ubicación</option>
                  {lookups.ubicaciones.map((u) => <option key={u._id} value={u._id}>{u.nombre}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Stock mínimo</label>
                <input type="number" name="stockMinimo" value={form.stockMinimo} onChange={handleChange} min={0} className={INP} />
              </div>
            </div>
          ) : (
            <div>
              <label className="text-xs text-gray-500 block mb-1">SKU *</label>
              <div className="flex items-center gap-2">
                <div className={`${INP} flex-1 min-w-0 truncate ${material ? "text-gray-800" : "text-gray-400"}`}>
                  {material ? `${material.sku} — ${material.nombre}` : "Ningún SKU elegido"}
                </div>
                <button type="button" onClick={() => setBuscadorAbierto(true)}
                  className="text-sm border border-gray-300 px-3 py-2 rounded-lg hover:bg-gray-50 transition shrink-0">
                  {material ? "Cambiar" : "Buscar SKU"}
                </button>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-gray-500 block mb-1">Cantidad a ingresar *</label>
              <input type="number" name="cantidad" value={form.cantidad} onChange={handleChange}
                min={0.01} max={item.cantidad} step="any" className={INP} />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Guía del proveedor</label>
              <input name="guiaProveedor" value={form.guiaProveedor} onChange={handleChange} maxLength={40} className={INP} />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Costo unitario (S/)</label>
              <input value={costoUnit.toFixed(2)} readOnly
                className={`${INP} bg-gray-50 text-gray-600 cursor-not-allowed`} />
            </div>
          </div>
          <p className="text-xs text-gray-400">
            Costo de la compra en soles con el flete prorrateado entre las {item.cantidad} unidades compradas
            {item.moneda === "USD" ? ` (TC ${item.tipoCambio})` : ""}. No vuelve a sumar al costo de la OT: la compra pagada ya cuenta.
          </p>
        </div>

        <div className="flex gap-2 justify-end px-6 py-4 border-t border-gray-100 shrink-0">
          <button onClick={onClose} disabled={guardando}
            className="text-sm border border-gray-300 px-4 py-2 rounded-lg hover:bg-gray-50 transition">
            Cancelar
          </button>
          <button onClick={intentarGuardar} disabled={guardando}
            className="text-sm bg-emerald-600 text-white px-5 py-2 rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition font-medium">
            {guardando ? "Guardando…" : "Ingresar al almacén"}
          </button>
        </div>
      </div>

      {buscadorAbierto && (
        <SelectorMateriales
          onSelect={(m) => { setMaterial(m); setBuscadorAbierto(false); setError(""); }}
          onClose={() => setBuscadorAbierto(false)} />
      )}
      {confirmando && (
        <ConfirmacionAccion
          mensaje={`¿Confirmas el ingreso al almacén de ${form.cantidad} ${unidad} ${esNuevo ? `en el SKU nuevo "${nombreSku}"` : `en ${nombreSku}`} (${form.cantidad} × ${soles(costoUnit)} = ${soles(Number(form.cantidad) * costoUnit)})?`}
          onCancelar={() => setConfirmando(false)}
          onConfirmar={guardar}
          procesando={guardando}
          textoConfirmar="Confirmar ingreso"
        />
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
  const [modalIngreso, setModalIngreso] = useState(false);
  const [confirmandoRechazo, setConfirmandoRechazo] = useState(false);
  const [rechazando, setRechazando] = useState(false);
  const [errorRechazo, setErrorRechazo] = useState("");
  const unidad = item.esSolicitudCompra ? item.materialAsociado?.unidad : item.material?.unidad;
  const esCompra = item.esSolicitudCompra;
  const ingresada = !!item.ingresoAlmacen;
  const pendiente = puedeAtender && !requerimiento.anulado && item.estado === "pendiente";
  const estadoC = esCompra ? estadoCompra(item) : null;

  const rechazar = async (motivo) => {
    setRechazando(true);
    setErrorRechazo("");
    try {
      const r = await fetchAuth(`/requerimientos/${requerimiento._id}/items/${item._id}/rechazar`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ motivo }),
      });
      if (r.ok) {
        onActualizado(await r.json());
      } else {
        const d = await r.json().catch(() => ({}));
        setErrorRechazo(d.mensaje || "No se pudo rechazar el ítem");
      }
    } catch {
      setErrorRechazo("No se pudo conectar con el servidor.");
    } finally {
      setRechazando(false);
      setConfirmandoRechazo(false);
    }
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
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${ingresada ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-500"}`}>
                  {ingresada ? `En almacén · lote ${item.ingresoAlmacen.lote || item.ingresoAlmacen.codigo}` : "Sin ingresar al almacén"}
                </span>
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
        {pendiente && esCompra && !ingresada && (
          <button onClick={() => setModalIngreso(true)}
            className="text-xs bg-blue-50 text-blue-700 px-2.5 py-1 rounded-lg hover:bg-blue-100 transition font-medium shrink-0">
            Ingresar al almacén
          </button>
        )}
        {/* Una compra vinculada con el flujo anterior (sin ingreso registrado aquí) también puede atenderse. */}
        {pendiente && (!esCompra || item.materialAsociado) && (
          <button onClick={() => setPanelSalida((v) => !v)}
            className="text-xs bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-lg hover:bg-emerald-100 transition font-medium shrink-0">
            Atender
          </button>
        )}
        {/* Las compras se descartan desde Compras. */}
        {pendiente && !esCompra && (
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
      {errorRechazo && <p className="text-xs text-red-500 bg-red-50 px-2 py-1 rounded mt-1">{errorRechazo}</p>}

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
      {modalIngreso && (
        <ModalIngresoAlmacen requerimiento={requerimiento} item={item}
          onClose={() => setModalIngreso(false)}
          onListo={(r) => { setModalIngreso(false); onActualizado(r); }} />
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

// ─── Página principal ────────────────────────────────────────────────────────

const TABS = [
  { id: "activos", label: "Activos" },
  { id: "completados", label: "Completados" },
];

export default function Requerimientos() {
  const [lista, setLista] = useState([]);
  const [ordenesCompra, setOrdenesCompra] = useState([]);
  const [tab, setTab] = useState("activos");
  const usuario = getUsuario();
  const puedeAtender = ["admin", "jefatura", "coordinadora", "almacenero"].includes(usuario?.rol);

  const cargar = useCallback(async () => {
    const [r1, r2] = await Promise.all([
      fetchAuth("/requerimientos"),
      fetchAuth("/ordenes-compra"),
    ]);
    if (r1.ok) setLista(await r1.json());
    if (r2.ok) setOrdenesCompra(await r2.json());
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

  const actualizarEnLista = (actualizado) => {
    setLista((prev) => prev.map((r) => r._id === actualizado._id ? actualizado : r));
  };

  // Las solicitudes de compra se gestionan en Compras (decisión del usuario, 2026-11-12) hasta que se recepcionan:
  // desde ahí se ingresan al almacén y se atienden aquí (decisión del usuario, 2026-11-25). Un RQ sin ítems visibles
  // no aparece.
  const itemsVisibles = (r) => r.items.filter((it) => !it.esSolicitudCompra || (it.recepcionado && !it.anulado));
  const tieneItemsPendientes = (r) => !r.anulado && itemsVisibles(r).some((it) => it.estado === "pendiente");
  const filtrados = lista
    .filter((r) => itemsVisibles(r).length > 0)
    .filter((r) => tab === "activos" ? tieneItemsPendientes(r) : !tieneItemsPendientes(r));

  const fmtFecha = (d) => d ? formatearFecha(d, { day: "2-digit", month: "2-digit", year: "2-digit" }) : "—";

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-800">Requerimientos</h1>
        <p className="text-sm text-gray-400 mt-0.5">Solicitudes de material hechas desde las Órdenes de Trabajo</p>
      </div>

      <div className="flex border-b border-gray-200 gap-1 flex-wrap">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2.5 text-sm font-medium transition border-b-2 -mb-px ${
              tab === t.id ? "border-purple-600 text-purple-700" : "border-transparent text-gray-500 hover:text-gray-700"
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="space-y-4">
        {filtrados.length === 0 && (
          <p className="text-center py-10 text-gray-300 text-sm">
            Sin requerimientos {tab === "activos" ? "activos" : "completados"}
          </p>
        )}
        {filtrados.map((r) => {
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
    </div>
  );
}
