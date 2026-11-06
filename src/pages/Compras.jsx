import { useState, useEffect, useCallback } from "react";
import * as XLSX from "xlsx";
import { fetchAuth, getUsuario, uploadAuth, descargarArchivoProtegido } from "../utils/fetchAuth";
import { formatearFecha, fechaHoyLima } from "../utils/fecha";
import ConfirmacionAccion from "../components/ConfirmacionAccion";
import ModalProcesarSolicitud from "../components/ModalProcesarSolicitud";

const ESTADO_ITEM = {
  pendiente: "bg-blue-100 text-blue-700",
  atendido: "bg-green-100 text-green-700",
  cerrado: "bg-green-100 text-green-700",
  rechazado: "bg-red-100 text-red-700",
};

const ESTADO_PAGO = {
  por_procesar:   { clase: "bg-gray-100 text-gray-600",   label: "Por procesar" },
  pendiente_pago: { clase: "bg-amber-100 text-amber-700", label: "Pendiente de pago" },
  pagado:         { clase: "bg-green-100 text-green-700", label: "Pagado" },
  recepcionado:   { clase: "bg-sky-100 text-sky-700",     label: "Recepcionado" },
};

const money = (v) => "S/ " + Number(v ?? 0).toLocaleString("es-PE", { minimumFractionDigits: 2 });

function resumenCompra(item) {
  return Object.entries(item.camposCompra || {}).map(([k, v]) => `${k}: ${v}`).join(" · ");
}

// "Otros" guarda solo { descripcion }: ahí se muestra el valor sin la clave.
function descripcionMaterial(item) {
  const campos = Object.entries(item.camposCompra || {}).filter(([, v]) => v !== "" && v != null);
  if (campos.length === 1) return String(campos[0][1]);
  return campos.map(([k, v]) => `${k}: ${v}`).join(" · ") || item.categoriaNombre || "—";
}

// `endpoint` apunta al documento dueño de los archivos (ítem del
// requerimiento o servicio externo); tras subir/eliminar se recarga la página.
function AdjuntosCompra({ archivos = [], endpoint, onCambio }) {
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState("");
  const [porEliminar, setPorEliminar] = useState(null);
  const [eliminando, setEliminando] = useState(false);

  const subir = async (fileList) => {
    const files = Array.from(fileList || []);
    if (files.length === 0) return;
    setError("");
    setSubiendo(true);
    // Secuencial: cada subida hace $push sobre el mismo array `archivos`.
    for (const file of files) {
      const fd = new FormData();
      fd.append("archivo", file);
      const res = await uploadAuth(`${endpoint}/archivos`, fd);
      if (!res.ok) setError(`No se pudo subir "${file.name}" — solo imágenes, PDF, Word o Excel (máx. 20 MB).`);
    }
    setSubiendo(false);
    await onCambio();
  };

  const eliminar = async () => {
    setEliminando(true);
    const res = await fetchAuth(`${endpoint}/archivos/${porEliminar._id}`, { method: "DELETE" });
    setEliminando(false);
    setPorEliminar(null);
    if (res.ok) await onCambio();
    else setError("No se pudo eliminar el documento.");
  };

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
            <button type="button" onClick={() => setPorEliminar(a)} title="Eliminar documento"
              className="w-5 h-5 shrink-0 rounded-full text-cyan-500 hover:text-red-600 hover:bg-red-50 leading-none">
              ✕
            </button>
          </span>
        ))}
        <label className={`inline-flex items-center gap-1 text-xs border border-dashed border-gray-300 text-gray-500 rounded-full px-2.5 py-0.5 ${subiendo ? "opacity-60" : "hover:border-cyan-400 hover:text-cyan-700 cursor-pointer"}`}>
          {subiendo ? "Subiendo…" : "📎 Adjuntar documento"}
          <input type="file" multiple accept={ACCEPT_DOCUMENTOS} className="hidden" disabled={subiendo}
            onChange={(e) => { subir(e.target.files); e.target.value = ""; }} />
        </label>
      </div>
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
      {porEliminar && (
        <ConfirmacionAccion
          mensaje={`¿Eliminar el documento "${porEliminar.nombre}"?`}
          onCancelar={() => setPorEliminar(null)}
          onConfirmar={eliminar}
          procesando={eliminando}
          textoConfirmar="Eliminar"
        />
      )}
    </div>
  );
}

const ACCEPT_DOCUMENTOS = [
  "image/jpeg", "image/png", "image/webp",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
].join(",");

// Un ítem de solicitud puede tratarse a nombre de un cliente/planta distinto
// del de quien lo pidió — OC/OT/Cliente/Planta deben quedar visibles en cada fila.
function FilaSeleccionable({
  seleccionado, onToggle, disabledCheckbox, ot, oc, cliente, planta,
  descripcion, proveedor, precio, flete, referencia, estado, cantidad, unidad, fecha, detalle, adjuntos,
}) {
  return (
    <div className="flex items-start gap-3 border-t border-gray-100 first:border-t-0 py-4">
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
        <div className="my-2 border-l-4 border-purple-500 bg-purple-50 rounded-r-lg px-3 py-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-purple-600">Descripción</p>
          <p className="text-base font-bold text-gray-900 break-words">{descripcion}</p>
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-sm">
          <dt className="text-gray-400">Proveedor:</dt>
          <dd className="text-gray-800 font-medium truncate">{proveedor || "—"}</dd>
          <dt className="text-gray-400">Precio:</dt>
          <dd className="text-gray-800">{precio != null ? `${money(precio)} c/u` : "—"}</dd>
          <dt className="text-gray-400">Flete:</dt>
          <dd className="text-gray-800">{flete > 0 ? money(flete) : "—"}</dd>
        </dl>
        <p className="text-xs text-gray-400 mt-1.5">{referencia}</p>
        <div className="mt-1">{estado}</div>
        {detalle}
        {adjuntos}
      </div>
      <div className="text-right shrink-0">
        <p className="text-sm text-gray-700">{cantidad} {unidad || ""}</p>
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
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center px-4">
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

// Evita que un texto escrito por el usuario se ejecute como fórmula en Excel.
const celda = (v) => (typeof v === "string" && /^[=+\-@]/.test(v) ? `'${v}` : v);

const TABS = [
  { id: "por-procesar", label: "Por procesar" },
  { id: "pendiente-pago", label: "Pendiente de pago" },
  { id: "pagados", label: "Pagados" },
  { id: "recepcionado", label: "Recepcionado" },
];

export default function Compras() {
  const [lista, setLista] = useState([]);
  const [servicios, setServicios] = useState([]);
  const [ordenesCompra, setOrdenesCompra] = useState([]);
  const [seccion, setSeccion] = useState("materiales");
  const [tab, setTab] = useState("por-procesar");
  const [seleccionados, setSeleccionados] = useState(() => new Set());
  const [procesarOpen, setProcesarOpen] = useState(false);
  // "pago" | "recepcion" | null
  const [modalDatos, setModalDatos] = useState(null);
  const usuario = getUsuario();
  // "Procesar solicitud" (elegir proveedor + monto) — vendedor, admin, jefatura y coordinadora.
  const puedeProcesar = ["vendedor", "admin", "jefatura", "coordinadora"].includes(usuario?.rol);
  // "Marcar como pagado" — exclusivo Coordinadora/Jefatura/Admin.
  const puedePagar = ["admin", "jefatura", "coordinadora"].includes(usuario?.rol);
  // "Marcar como recepcionado" — todos los roles que ven Compras.
  const puedeRecepcionar = ["vendedor", "admin", "jefatura", "coordinadora"].includes(usuario?.rol);

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
  useEffect(() => { setSeleccionados(new Set()); }, [seccion, tab]);

  // Ítems de solicitud de compra "aplanados" con su Requerimiento padre —
  // el pipeline de pago vive a nivel de ítem, no de Requerimiento completo.
  const itemsCompra = lista.flatMap((r) =>
    (r.items || [])
      .filter((it) => it.esSolicitudCompra)
      .map((it) => ({ ...it, requerimiento: r }))
  );
  const itemsPorProcesar = itemsCompra.filter((it) => (it.estadoPago || "por_procesar") === "por_procesar");
  const itemsPendientePago = itemsCompra.filter((it) => it.estadoPago === "pendiente_pago");
  const itemsPagados = itemsCompra.filter((it) => it.estadoPago === "pagado" && !it.recepcionado);
  const itemsRecepcionados = itemsCompra.filter((it) => it.estadoPago === "pagado" && it.recepcionado);

  const serviciosActivos = servicios.filter((s) => !s.anulado);
  const serviciosPorProcesar = serviciosActivos.filter((s) => (s.estadoPago || "por_procesar") === "por_procesar");
  const serviciosPendientePago = serviciosActivos.filter((s) => s.estadoPago === "pendiente_pago");
  const serviciosPagados = serviciosActivos.filter((s) => s.estadoPago === "pagado" && !s.recepcionado);
  const serviciosRecepcionados = serviciosActivos.filter((s) => s.estadoPago === "pagado" && s.recepcionado);

  const fmtFecha = (d) => d ? formatearFecha(d, { day: "2-digit", month: "2-digit", year: "2-digit" }) : "—";
  const fmtFechaExcel = (d) => d ? formatearFecha(d, { day: "2-digit", month: "2-digit", year: "numeric" }) : "—";

  const datosPagoRecepcion = (x) => ({
    "FECHA PAGO": fmtFechaExcel(x.fechaPago),
    "PAGADO POR": celda(x.pagador || "—"),
    "FECHA RECEPCIÓN": x.recepcionado ? fmtFechaExcel(x.fechaRecepcion) : "—",
    "RECEPTOR": celda(x.receptor || "—"),
    "GUÍA": celda(x.guiaRecepcion || "—"),
    "FACTURA": celda(x.facturaRecepcion || "—"),
  });

  // Excel de todo lo pagado (materiales + servicios), recepcionado o no — mismo
  // patrón de XLSX.json_to_sheet + multi-hoja que ya usan ListaCotizaciones.jsx /
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
      "MATERIALES": celda([it.categoriaNombre, resumenCompra(it)].filter(Boolean).join(" — ")),
      "PROVEEDOR": it.proveedorNombre || "—",
      "COSTO": costo,
      "CANTIDAD": cantidad,
      "FLETE": flete,
      "TOTAL": costo * cantidad + flete,
      ...datosPagoRecepcion(it),
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
      "MATERIALES": celda([s.tipoTrabajo, s.material].filter(Boolean).join(" — ")),
      "PROVEEDOR": s.nombreProveedor || "—",
      "COSTO": costo,
      "CANTIDAD": cantidad,
      "FLETE": flete,
      "TOTAL": costo * cantidad + flete,
      ...datosPagoRecepcion(s),
    };
  };

  const exportarPagadosExcel = () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([...itemsPagados, ...itemsRecepcionados].map(filaPagoMaterial)), "Materiales pagados");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([...serviciosPagados, ...serviciosRecepcionados].map(filaPagoServicio)), "Servicios pagados");
    XLSX.writeFile(wb, "solicitudes-pagadas.xlsx");
  };

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
  const itemsSeleccionadosRecepcion = itemsPagados.filter((it) => seleccionados.has(filaMaterialKey(it)));
  const serviciosSeleccionadosRecepcion = serviciosPagados.filter((s) => seleccionados.has(filaServicioKey(s)));

  const esMateriales = seccion === "materiales";
  const nPorProcesarSel = esMateriales ? itemsSeleccionadosMateriales.length : serviciosSeleccionados.length;
  const nPendientePagoSel = esMateriales ? itemsSeleccionadosPagoMateriales.length : serviciosSeleccionadosPago.length;
  const nRecepcionSel = esMateriales ? itemsSeleccionadosRecepcion.length : serviciosSeleccionadosRecepcion.length;

  const itemsParaModal = esMateriales
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

  // Secuencial: los ítems de un mismo Requerimiento se guardan sobre el mismo
  // documento. Devuelve el primer error del servidor (o null) para el modal.
  const aplicarASeleccion = async (accion, datos) => {
    const rutas = esMateriales
      ? (accion === "pagar" ? itemsSeleccionadosPagoMateriales : itemsSeleccionadosRecepcion)
          .map((it) => `/requerimientos/${it.requerimiento._id}/items/${it._id}/${accion}`)
      : (accion === "pagar" ? serviciosSeleccionadosPago : serviciosSeleccionadosRecepcion)
          .map((s) => `/servicios-externos/${s._id}/${accion}`);
    let error = null;
    for (const ruta of rutas) {
      const res = await fetchAuth(ruta, { method: "PATCH", body: JSON.stringify(datos) });
      if (!res.ok && !error) error = (await res.json().catch(() => ({}))).mensaje || "No se pudo guardar";
    }
    setSeleccionados(new Set());
    await cargar();
    return error;
  };

  const puedeMarcar = tab === "por-procesar" ? puedeProcesar
    : tab === "pendiente-pago" ? puedePagar
    : tab === "pagados" ? puedeRecepcionar
    : false;

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-800">Compras</h1>
        <p className="text-sm text-gray-400 mt-0.5">Solicitudes de compra de material y servicios externos: procesamiento y pago</p>
      </div>

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

      {tab === "por-procesar" && puedeProcesar && nPorProcesarSel > 0 && (
        <div className="flex justify-end">
          <button onClick={() => setProcesarOpen(true)}
            className="text-sm bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition font-medium">
            Procesar solicitud ({nPorProcesarSel})
          </button>
        </div>
      )}
      {tab === "pendiente-pago" && puedePagar && nPendientePagoSel > 0 && (
        <div className="flex justify-end">
          <button onClick={() => setModalDatos("pago")}
            className="text-sm bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 transition font-medium">
            Marcar como pagado ({nPendientePagoSel})
          </button>
        </div>
      )}
      {(tab === "pagados" || tab === "recepcionado") && (
        <div className="flex justify-end gap-2">
          {tab === "pagados" && puedeRecepcionar && nRecepcionSel > 0 && (
            <button onClick={() => setModalDatos("recepcion")}
              className="text-sm bg-sky-600 text-white px-4 py-2 rounded-lg hover:bg-sky-700 transition font-medium">
              Marcar como recepcionado ({nRecepcionSel})
            </button>
          )}
          <button onClick={exportarPagadosExcel}
            className="text-sm border border-gray-300 text-gray-600 px-4 py-2 rounded-lg hover:bg-gray-50 transition">
            Exportar Excel
          </button>
        </div>
      )}

      {esMateriales ? (
        <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-5">
          {(() => {
            const items = tab === "por-procesar" ? itemsPorProcesar
              : tab === "pendiente-pago" ? itemsPendientePago
              : tab === "pagados" ? itemsPagados
              : itemsRecepcionados;
            if (items.length === 0) {
              return <p className="text-center py-10 text-gray-300 text-sm">Sin solicitudes de compra en esta vista</p>;
            }
            return items.map((it) => {
              const key = filaMaterialKey(it);
              return (
                <FilaSeleccionable key={key}
                  seleccionado={seleccionados.has(key)}
                  disabledCheckbox={!puedeMarcar}
                  onToggle={() => toggleSeleccion(key)}
                  ot={it.requerimiento.ordenTrabajo}
                  oc={resolverOC(it.requerimiento.ordenTrabajo)}
                  cliente={nombreEmpresa(it.requerimiento.ordenTrabajo?.empresa)}
                  planta={it.requerimiento.ordenTrabajo?.planta}
                  descripcion={descripcionMaterial(it)}
                  proveedor={it.proveedorNombre}
                  precio={it.montoUnitario}
                  flete={it.costoTransporte}
                  referencia={`${it.categoriaNombre || "Otros"} — ${it.requerimiento.codigo}`}
                  estado={
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${ESTADO_ITEM[it.estado]}`}>{it.estado}</span>
                  }
                  cantidad={it.cantidad}
                  unidad={it.materialAsociado?.unidad}
                  fecha={fmtFecha(it.fechaProcesado || it.createdAt)}
                  detalle={<DetallePagoRecepcion x={it} />}
                  adjuntos={
                    <AdjuntosCompra archivos={it.archivos}
                      endpoint={`/requerimientos/${it.requerimiento._id}/items/${it._id}`}
                      onCambio={cargar} />
                  }
                />
              );
            });
          })()}
        </div>
      ) : (
        <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-5">
          {(() => {
            const items = tab === "por-procesar" ? serviciosPorProcesar
              : tab === "pendiente-pago" ? serviciosPendientePago
              : tab === "pagados" ? serviciosPagados
              : serviciosRecepcionados;
            if (items.length === 0) {
              return <p className="text-center py-10 text-gray-300 text-sm">Sin servicios en esta vista</p>;
            }
            return items.map((s) => {
              const key = filaServicioKey(s);
              return (
                <FilaSeleccionable key={key}
                  seleccionado={seleccionados.has(key)}
                  disabledCheckbox={!puedeMarcar}
                  onToggle={() => toggleSeleccion(key)}
                  ot={s.ordenTrabajo}
                  oc={resolverOC(s.ordenTrabajo)}
                  cliente={nombreEmpresa(s.ordenTrabajo?.empresa)}
                  planta={s.ordenTrabajo?.planta}
                  descripcion={s.material || "—"}
                  proveedor={s.nombreProveedor}
                  precio={s.costo > 0 ? s.costo : null}
                  flete={s.costoTransporte}
                  referencia={`${s.tipoTrabajo} — ${s.codigo}`}
                  estado={(() => {
                    const clave = s.recepcionado ? "recepcionado" : s.estadoPago || "por_procesar";
                    const { clase, label } = ESTADO_PAGO[clave] || ESTADO_PAGO.por_procesar;
                    return <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${clase}`}>{label}</span>;
                  })()}
                  cantidad={s.cantidad}
                  unidad=""
                  fecha={fmtFecha(s.fechaProcesado || s.createdAt)}
                  detalle={<DetallePagoRecepcion x={s} />}
                  adjuntos={
                    <AdjuntosCompra archivos={s.archivos}
                      endpoint={`/servicios-externos/${s._id}`}
                      onCambio={cargar} />
                  }
                />
              );
            });
          })()}
        </div>
      )}

      {procesarOpen && (
        <ModalProcesarSolicitud
          tipo={esMateriales ? "material" : "servicio"}
          items={itemsParaModal}
          onClose={() => setProcesarOpen(false)}
          onProcesado={procesarListo}
        />
      )}

      {modalDatos === "pago" && (
        <ModalDatosCompra
          titulo="Marcar como pagado"
          descripcion={`${nPendientePagoSel} solicitud(es) seleccionada(s).`}
          campos={CAMPOS_PAGO}
          inicial={{ fechaPago: fechaHoyLima(), pagador: "" }}
          textoConfirmar="Marcar como pagado"
          onCancelar={() => setModalDatos(null)}
          onConfirmar={(datos) => aplicarASeleccion("pagar", datos)}
        />
      )}

      {modalDatos === "recepcion" && (
        <ModalDatosCompra
          titulo="Marcar como recepcionado"
          descripcion={`${nRecepcionSel} solicitud(es) seleccionada(s).`}
          campos={CAMPOS_RECEPCION}
          inicial={{ fechaRecepcion: fechaHoyLima(), receptor: "", guiaRecepcion: "", facturaRecepcion: "" }}
          textoConfirmar="Marcar como recepcionado"
          onCancelar={() => setModalDatos(null)}
          onConfirmar={(datos) => aplicarASeleccion("recepcionar", datos)}
        />
      )}
    </div>
  );
}
