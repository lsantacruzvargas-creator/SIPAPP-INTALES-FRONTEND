import { useState, useEffect, useCallback } from "react";
import * as XLSX from "xlsx";
import { fetchAuth, getUsuario } from "../utils/fetchAuth";
import { formatearFecha } from "../utils/fecha";
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

// Un ítem de solicitud puede tratarse a nombre de un cliente/planta distinto
// del de quien lo pidió — OC/OT/Cliente/Planta deben quedar visibles en cada fila.
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

const TABS = [
  { id: "por-procesar", label: "Por procesar" },
  { id: "pendiente-pago", label: "Pendiente de pago" },
  { id: "pagados", label: "Pagados" },
];

export default function Compras() {
  const [lista, setLista] = useState([]);
  const [servicios, setServicios] = useState([]);
  const [ordenesCompra, setOrdenesCompra] = useState([]);
  const [seccion, setSeccion] = useState("materiales");
  const [tab, setTab] = useState("por-procesar");
  const [seleccionados, setSeleccionados] = useState(() => new Set());
  const [procesarOpen, setProcesarOpen] = useState(false);
  const [confirmandoPago, setConfirmandoPago] = useState(false);
  const [pagando, setPagando] = useState(false);
  const [exitoPago, setExitoPago] = useState("");
  const usuario = getUsuario();
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

  const esMateriales = seccion === "materiales";
  const nPorProcesarSel = esMateriales ? itemsSeleccionadosMateriales.length : serviciosSeleccionados.length;
  const nPendientePagoSel = esMateriales ? itemsSeleccionadosPagoMateriales.length : serviciosSeleccionadosPago.length;

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

  const pagarSeleccionados = async () => {
    setPagando(true);
    if (esMateriales) {
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

  const puedeMarcar = tab === "por-procesar" ? puedeProcesar : tab === "pendiente-pago" ? puedePagar : false;

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
          <button onClick={() => setConfirmandoPago(true)}
            className="text-sm bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 transition font-medium">
            Marcar como pagado ({nPendientePagoSel})
          </button>
        </div>
      )}
      {tab === "pagados" && (
        <div className="flex justify-end">
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
              : itemsPagados;
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
                  titulo={`${it.categoriaNombre} — ${it.requerimiento.codigo}`}
                  subtitulo={resumenCompra(it)}
                  cantidad={it.cantidad}
                  unidad={it.materialAsociado?.unidad}
                  fecha={fmtFecha(it.fechaProcesado || it.createdAt)}
                  chips={
                    <div className="flex flex-wrap items-center gap-1.5 mt-1">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${ESTADO_ITEM[it.estado]}`}>{it.estado}</span>
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
      ) : (
        <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-5">
          {(() => {
            const items = tab === "por-procesar" ? serviciosPorProcesar
              : tab === "pendiente-pago" ? serviciosPendientePago
              : serviciosPagados;
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
                  titulo={s.tipoTrabajo}
                  subtitulo={s.material}
                  cantidad={s.cantidad}
                  unidad=""
                  fecha={fmtFecha(s.fechaProcesado || s.createdAt)}
                  chips={
                    <div className="flex flex-wrap items-center gap-1.5 mt-1">
                      {s.nombreProveedor && (
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-purple-50 text-purple-700">
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
          tipo={esMateriales ? "material" : "servicio"}
          items={itemsParaModal}
          onClose={() => setProcesarOpen(false)}
          onProcesado={procesarListo}
        />
      )}

      {confirmandoPago && (
        <ConfirmacionAccion
          mensaje={`¿Marcar ${nPendientePagoSel} solicitud(es) como Pagado?`}
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
