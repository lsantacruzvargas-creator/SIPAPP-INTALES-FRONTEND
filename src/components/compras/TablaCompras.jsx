import { useState, useEffect, useCallback } from "react";
import * as XLSX from "xlsx";
import { fetchAuth } from "../../utils/fetchAuth";
import { formatearFecha, fechaHoyLima } from "../../utils/fecha";
import { FILTROS_VACIOS, filtrarOCPs, aplanarItemsOCP, money } from "../../utils/compras";
import { exportarOrdenCompraProveedorPdf } from "../../utils/compraPdf";
import TablaScroll from "../TablaScroll";
import PromptAccion from "../PromptAccion";
import DetalleOCP from "./DetalleOCP";
import { conBloqueo } from "../../utils/bloqueoApi";

const INP = "border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300";
const fecha = (d) => formatearFecha(d, { day: "2-digit", month: "2-digit", year: "numeric" });

const ESTADO_PAGO = {
  pendiente_pago: { label: "Pendiente de pago", clase: "bg-amber-50 text-amber-700" },
  pago_parcial: { label: "Pago parcial", clase: "bg-orange-50 text-orange-700" },
  pagado: { label: "Pagado", clase: "bg-green-50 text-green-700" },
};
const estadoPago = (o) => ESTADO_PAGO[o.estadoPago] || ESTADO_PAGO.pendiente_pago;

// Evita que un texto escrito por el usuario se ejecute como fórmula en Excel.
const celda = (v) => (typeof v === "string" && /^[=+\-@]/.test(v) ? `'${v}` : v);

const CAMPOS_RECEPCION = [
  { name: "fechaRecepcion", label: "Fecha de recepción", type: "date", requerido: true },
  { name: "receptor", label: "Nombre del receptor", requerido: true, maxLength: 120 },
  { name: "guiaRecepcion", label: "N° de guía", maxLength: 40 },
  { name: "facturaRecepcion", label: "N° de factura", maxLength: 40 },
];

// Mismo modal que «Marcar como recepcionado» de comprabasico. `onConfirmar`
// devuelve un mensaje de error o null.
function ModalRecepcion({ cantidad, onCancelar, onConfirmar }) {
  const [form, setForm] = useState({ fechaRecepcion: fechaHoyLima(), receptor: "", guiaRecepcion: "", facturaRecepcion: "" });
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const confirmar = async () => {
    const faltante = CAMPOS_RECEPCION.find((c) => c.requerido && !String(form[c.name] ?? "").trim());
    if (faltante) return setError(`${faltante.label} es obligatorio.`);
    if (form.fechaRecepcion > fechaHoyLima()) return setError("La fecha no puede ser posterior a hoy.");
    setError("");
    setGuardando(true);
    try {
      const msg = await onConfirmar(form);
      if (msg) setError(msg);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] bg-black/40 flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
        <div>
          <h3 className="font-semibold text-gray-800">Marcar como recepcionado</h3>
          <p className="text-sm text-gray-500 mt-0.5">{cantidad} orden(es) de compra seleccionada(s).</p>
        </div>
        <div className="space-y-3">
          {CAMPOS_RECEPCION.map((c) => (
            <label key={c.name} className="block">
              <span className="text-xs font-medium text-gray-600">{c.label}{c.requerido ? " *" : " (opcional)"}</span>
              <input type={c.type || "text"} name={c.name} value={form[c.name]} onChange={handleChange}
                max={c.type === "date" ? fechaHoyLima() : undefined} maxLength={c.maxLength}
                className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400" />
            </label>
          ))}
        </div>
        {error && <p className="text-xs text-red-500">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCancelar} disabled={guardando}
            className="text-sm px-4 py-2 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50">Cancelar</button>
          <button type="button" onClick={confirmar} disabled={guardando}
            className="text-sm px-4 py-2 rounded-lg bg-purple-600 text-white hover:bg-purple-700 font-medium disabled:opacity-60">
            {guardando ? "Guardando…" : "Marcar como recepcionado"}
          </button>
        </div>
      </div>
    </div>
  );
}

// modo "compras": OCs aún no recepcionadas (se marcan acá); "recepcionado": las ya recibidas.
export default function TablaCompras({ catalogos, modo = "compras" }) {
  const recepcion = modo === "recepcionado";
  const [ocps, setOcps] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState(false);
  const [vista, setVista] = useState("oc");
  const [filtros, setFiltros] = useState(FILTROS_VACIOS);
  const [filtroPago, setFiltroPago] = useState("");
  const [seleccion, setSeleccion] = useState(() => new Set());
  const [recepcionando, setRecepcionando] = useState(false);
  const [detalleId, setDetalleId] = useState(null);
  const [anulando, setAnulando] = useState(null);
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState("");

  const cargar = useCallback(() => fetchAuth("/ordenes-compra-proveedor").then(async (r) => {
    if (r.ok) { setOcps(await r.json()); setErrorCarga(false); } else setErrorCarga(true);
    setCargando(false);
  }), []);
  useEffect(() => { cargar(); }, [cargar]);

  const setFiltro = (campo) => (e) => setFiltros((f) => ({ ...f, [campo]: e.target.value }));
  const delModo = ocps.filter((o) => !!o.recepcionado === recepcion && (!filtroPago || (!o.anulada && (o.estadoPago || "pendiente_pago") === filtroPago)));
  const filtradas = filtrarOCPs(delModo, filtros);
  const items = aplanarItemsOCP(delModo, filtros);
  const seleccionables = recepcion ? [] : filtradas.filter((o) => !o.anulada);
  const seleccionadas = seleccionables.filter((o) => seleccion.has(o._id));
  const todasMarcadas = seleccionables.length > 0 && seleccionables.every((o) => seleccion.has(o._id));

  const toggle = (id) => setSeleccion((prev) => {
    const s = new Set(prev);
    if (s.has(id)) s.delete(id); else s.add(id);
    return s;
  });
  const toggleTodas = () => setSeleccion(todasMarcadas ? new Set() : new Set(seleccionables.map((o) => o._id)));

  const anular = async (motivo) => {
    setProcesando(true);
    setError("");
    const r = await conBloqueo("ordenCompraProveedor", anulando._id, (h) => fetchAuth(`/ordenes-compra-proveedor/${anulando._id}/anular`, { headers: h, method: "PATCH", body: JSON.stringify({ motivo }) }));
    if (r.ok) await cargar();
    else {
      const d = await r.json().catch(() => ({}));
      setError(d.mensaje || "No se pudo anular la orden de compra.");
    }
    setProcesando(false);
    setAnulando(null);
  };

  // Una por una: cada OC confirmada sale de la selección, así un reintento no repite las ya guardadas.
  const recepcionar = async (datos) => {
    let ok = 0;
    for (const o of seleccionadas) {
      const r = await conBloqueo("ordenCompraProveedor", o._id, (h) => fetchAuth(`/ordenes-compra-proveedor/${o._id}/recepcionar`, {
        headers: h, method: "PATCH", body: JSON.stringify(datos),
      }));
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        await cargar();
        return `${ok > 0 ? `Se recepcionaron ${ok} de ${seleccionadas.length}. ` : ""}${o.codigo}: ${d.mensaje || "no se pudo recepcionar."}`;
      }
      ok++;
      setSeleccion((prev) => { const s = new Set(prev); s.delete(o._id); return s; });
    }
    await cargar();
    setRecepcionando(false);
    return null;
  };

  const exportarExcel = () => {
    const filas = vista === "oc"
      ? filtradas.map((o) => ({
        OCP: o.codigo, FECHA: fecha(o.fecha), PROVEEDOR: celda(o.proveedorRazonSocial), RUC: o.proveedorRuc,
        "ÍTEMS": o.items.length, MONEDA: o.moneda, SUBTOTAL: o.subtotal, IGV: o.igv, TOTAL: o.total,
        "FORMA DE PAGO": celda(o.formaPago), ESTADO: o.anulada ? "Anulada" : "Vigente",
        "ESTADO DE PAGO": o.anulada ? "—" : estadoPago(o).label,
        ...(recepcion ? {
          "FECHA RECEPCIÓN": o.fechaRecepcion ? fecha(o.fechaRecepcion) : "", RECEPTOR: celda(o.receptor || ""),
          "GUÍA": celda(o.guiaRecepcion || ""), FACTURA: celda(o.facturaRecepcion || ""),
        } : {}),
      }))
      : items.map((it) => ({
        FECHA: fecha(it.ocp.fecha), OCP: it.ocp.codigo, PROVEEDOR: celda(it.ocp.proveedorRazonSocial),
        "TIPO DE ARTÍCULO": it.tipoArticulo?.nombre || "", "DESCRIPCIÓN": celda(it.descripcion), CANTIDAD: it.cantidad,
        UNIDAD: it.unidad, "P. UNIT.": it.precioUnitario, MONEDA: it.ocp.moneda, SUBTOTAL: it.subtotal,
        "CENTRO DE COSTO": it.centroCosto?.nombre || "", OT: it.ordenTrabajo?.numeroOT || it.ordenTrabajo?.codigo || "", SC: it.scCodigo,
        "ESTADO DE PAGO": it.ocp.anulada ? "Anulada" : estadoPago(it.ocp).label,
      }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(filas), vista === "oc" ? "Órdenes de compra" : "Ítems comprados");
    XLSX.writeFile(wb, `${recepcion ? "recepcionado" : "compras"}-${vista === "oc" ? "por-oc" : "por-item"}.xlsx`);
  };

  const th = "px-3 py-3 text-left";
  const td = "px-3 py-2";
  const colsOC = recepcion ? 13 : 11;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg border border-gray-300 overflow-hidden">
          {[{ id: "oc", label: "Por OC" }, { id: "item", label: "Por ítem" }].map((v) => (
            <button key={v.id} onClick={() => setVista(v.id)}
              className={`px-4 py-2 text-sm ${vista === v.id ? "bg-purple-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}>{v.label}</button>
          ))}
        </div>
        <input value={filtros.codigo} onChange={setFiltro("codigo")} placeholder="N° OC" className={`${INP} w-28`} />
        <select value={filtros.proveedor} onChange={setFiltro("proveedor")} className={INP}>
          <option value="">Todos los proveedores</option>
          {catalogos.proveedores.map((p) => <option key={p._id} value={p._id}>{p.razonSocial}</option>)}
        </select>
        <input value={filtros.texto} onChange={setFiltro("texto")} placeholder="Material / descripción" className={`${INP} w-48`} />
        <select value={filtros.tipoArticulo} onChange={setFiltro("tipoArticulo")} className={INP}>
          <option value="">Todos los tipos</option>
          {catalogos.tiposArticulo.map((t) => <option key={t._id} value={t._id}>{t.nombre}</option>)}
        </select>
        <select value={filtros.centroCosto} onChange={setFiltro("centroCosto")} className={INP}>
          <option value="">Todos los centros</option>
          {catalogos.centrosCosto.map((c) => <option key={c._id} value={c._id}>{c.nombre}</option>)}
        </select>
        <label className="text-xs text-gray-500 flex items-center gap-1">Desde <input type="date" value={filtros.desde} onChange={setFiltro("desde")} className={INP} /></label>
        <label className="text-xs text-gray-500 flex items-center gap-1">Hasta <input type="date" value={filtros.hasta} onChange={setFiltro("hasta")} className={INP} /></label>
        {!recepcion && (
          <select value={filtros.estado} onChange={setFiltro("estado")} className={INP}>
            <option value="">Vigentes y anuladas</option>
            <option value="vigente">Vigentes</option>
            <option value="anulada">Anuladas</option>
          </select>
        )}
        <select value={filtroPago} onChange={(e) => setFiltroPago(e.target.value)} className={INP}>
          <option value="">Todo estado de pago</option>
          {Object.entries(ESTADO_PAGO).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <button onClick={() => { setFiltros(FILTROS_VACIOS); setFiltroPago(""); }} className="text-sm text-gray-500 hover:text-gray-800">Limpiar</button>
        <div className="ml-auto flex gap-2">
          {!recepcion && vista === "oc" && (
            <button onClick={() => { setError(""); setRecepcionando(true); }} disabled={seleccionadas.length === 0}
              className="text-sm bg-sky-600 text-white px-4 py-2 rounded-lg hover:bg-sky-700 disabled:opacity-40 transition font-medium">
              Marcar como recepcionado ({seleccionadas.length})
            </button>
          )}
          <button onClick={exportarExcel} className="text-sm border border-gray-300 text-gray-600 px-4 py-2 rounded-lg hover:bg-gray-50 transition">Exportar Excel</button>
        </div>
      </div>

      {error && <p className="text-sm text-red-500 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
      {errorCarga && (
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 inline-flex items-center gap-3">
          No se pudieron cargar las órdenes de compra.
          <button onClick={() => { setCargando(true); cargar(); }} className="underline">Reintentar</button>
        </p>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <TablaScroll className="overflow-x-auto">
          {vista === "oc" ? (
            <table className={`w-full text-sm ${recepcion ? "min-w-[1150px]" : "min-w-[1000px]"}`}>
              <thead className="bg-gray-500 text-white text-xs uppercase">
                <tr>
                  {!recepcion && <th className="px-3 py-3"><input type="checkbox" checked={todasMarcadas} onChange={toggleTodas} className="w-4 h-4" /></th>}
                  <th className={th}>OCP</th><th className={th}>Fecha</th><th className={th}>Proveedor</th>
                  <th className="px-3 py-3 text-right">Ítems</th><th className={th}>Moneda</th><th className="px-3 py-3 text-right">Total</th>
                  <th className={th}>Forma de pago</th><th className={th}>Estado</th><th className={th}>Estado de pago</th>
                  {recepcion && <><th className={th}>Recepción</th><th className={th}>Receptor</th><th className={th}>Guía / Factura</th></>}
                  <th className="px-3 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {cargando ? (
                  <tr><td colSpan={colsOC} className="px-4 py-8 text-center text-gray-400">Cargando…</td></tr>
                ) : filtradas.length === 0 ? (
                  <tr><td colSpan={colsOC} className="px-4 py-8 text-center text-gray-400">
                    {recepcion ? "Sin órdenes recepcionadas para estos filtros" : "Sin órdenes de compra para estos filtros"}
                  </td></tr>
                ) : filtradas.map((o) => (
                  <tr key={o._id} className={`hover:bg-gray-50 ${o.anulada ? "opacity-60" : ""}`}>
                    {!recepcion && (
                      <td className={`${td} text-center`}>
                        {!o.anulada && <input type="checkbox" checked={seleccion.has(o._id)} onChange={() => toggle(o._id)} className="w-4 h-4" />}
                      </td>
                    )}
                    <td className={`${td} font-mono text-xs`}>{o.codigo}</td>
                    <td className={`${td} text-xs text-gray-500`}>{fecha(o.fecha)}</td>
                    <td className={td}>{o.proveedorRazonSocial}</td>
                    <td className={`${td} text-right`}>{o.items.length}</td>
                    <td className={`${td} text-xs`}>{o.moneda}</td>
                    <td className={`${td} text-right font-medium`}>{money(o.total, o.moneda)}</td>
                    <td className={`${td} text-xs`}>{o.formaPago || "—"}</td>
                    <td className={td}>
                      <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${o.anulada ? "bg-red-50 text-red-600" : "bg-green-50 text-green-700"}`}>
                        {o.anulada ? "Anulada" : "Vigente"}
                      </span>
                    </td>
                    <td className={td}>
                      {o.anulada ? <span className="text-gray-300">—</span> : (
                        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${estadoPago(o).clase}`}>{estadoPago(o).label}</span>
                      )}
                    </td>
                    {recepcion && (
                      <>
                        <td className={`${td} text-xs text-gray-500`}>{o.fechaRecepcion ? fecha(o.fechaRecepcion) : "—"}</td>
                        <td className={`${td} text-xs`}>{o.receptor || "—"}</td>
                        <td className={`${td} text-xs text-gray-500`}>{[o.guiaRecepcion && `Guía ${o.guiaRecepcion}`, o.facturaRecepcion && `Fact. ${o.facturaRecepcion}`].filter(Boolean).join(" · ") || "—"}</td>
                      </>
                    )}
                    <td className={`${td} text-right space-x-3 whitespace-nowrap`}>
                      <button onClick={() => setDetalleId(o._id)} className="text-blue-600 hover:underline text-xs">Ver</button>
                      <button onClick={() => exportarOrdenCompraProveedorPdf(o)} className="text-purple-600 hover:underline text-xs">PDF</button>
                      {!o.anulada && !o.recepcionado && <button onClick={() => setAnulando(o)} className="text-red-500 hover:underline text-xs">Anular</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <table className="w-full text-sm min-w-[1150px]">
              <thead className="bg-gray-500 text-white text-xs uppercase">
                <tr>
                  <th className={th}>Fecha</th><th className={th}>OCP</th><th className={th}>Proveedor</th><th className={th}>Tipo de artículo</th>
                  <th className={th}>Descripción</th><th className="px-3 py-3 text-right">Cant.</th><th className={th}>Und.</th>
                  <th className="px-3 py-3 text-right">P. unit.</th><th className="px-3 py-3 text-right">Subtotal</th>
                  <th className={th}>Centro de costo</th><th className={th}>OT</th><th className={th}>SC</th><th className={th}>Estado de pago</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {cargando ? (
                  <tr><td colSpan={13} className="px-4 py-8 text-center text-gray-400">Cargando…</td></tr>
                ) : items.length === 0 ? (
                  <tr><td colSpan={13} className="px-4 py-8 text-center text-gray-400">Sin ítems para estos filtros</td></tr>
                ) : items.map((it) => (
                  <tr key={`${it.ocp._id}-${it._id}`} className={`hover:bg-gray-50 ${it.ocp.anulada ? "opacity-60" : ""}`}>
                    <td className={`${td} text-xs text-gray-500`}>{fecha(it.ocp.fecha)}</td>
                    <td className={`${td} font-mono text-xs`}>
                      <button onClick={() => setDetalleId(it.ocp._id)} className="text-blue-600 hover:underline">{it.ocp.codigo}</button>
                    </td>
                    <td className={td}>{it.ocp.proveedorRazonSocial}</td>
                    <td className={`${td} text-xs`}>{it.tipoArticulo?.nombre || "—"}</td>
                    <td className={td}>{it.descripcion}</td>
                    <td className={`${td} text-right`}>{it.cantidad}</td>
                    <td className={`${td} text-xs text-gray-500`}>{it.unidad}</td>
                    <td className={`${td} text-right`}>{money(it.precioUnitario, it.ocp.moneda)}</td>
                    <td className={`${td} text-right`}>{money(it.subtotal, it.ocp.moneda)}</td>
                    <td className={`${td} text-xs`}>{it.centroCosto?.nombre || "—"}</td>
                    <td className={`${td} font-mono text-xs`}>{it.ordenTrabajo?.numeroOT || it.ordenTrabajo?.codigo || "—"}</td>
                    <td className={`${td} font-mono text-xs`}>{it.scCodigo}</td>
                    <td className={td}>
                      {it.ocp.anulada ? <span className="text-xs text-red-600">Anulada</span>
                        : <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${estadoPago(it.ocp).clase}`}>{estadoPago(it.ocp).label}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </TablaScroll>
      </div>

      {detalleId && <DetalleOCP ocpId={detalleId} onClose={() => setDetalleId(null)} onCambio={cargar} />}
      {anulando && (
        <PromptAccion titulo={`Anular ${anulando.codigo}`} placeholder="Sus ítems volverán a Por procesar"
          onCancelar={() => setAnulando(null)} onConfirmar={anular} procesando={procesando} textoConfirmar="Anular OC" />
      )}
      {recepcionando && (
        <ModalRecepcion cantidad={seleccionadas.length} onCancelar={() => setRecepcionando(false)} onConfirmar={recepcionar} />
      )}
    </div>
  );
}
