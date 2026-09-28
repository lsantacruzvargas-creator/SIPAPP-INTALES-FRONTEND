import { useState, useEffect, useCallback } from "react";
import * as XLSX from "xlsx";
import { fetchAuth } from "../../utils/fetchAuth";
import { formatearFecha } from "../../utils/fecha";
import { FILTROS_VACIOS, filtrarOCPs, aplanarItemsOCP, money } from "../../utils/compras";
import { exportarOrdenCompraProveedorPdf } from "../../utils/compraPdf";
import TablaScroll from "../TablaScroll";
import PromptAccion from "../PromptAccion";
import DetalleOCP from "./DetalleOCP";

const INP = "border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300";
const fecha = (d) => formatearFecha(d, { day: "2-digit", month: "2-digit", year: "numeric" });

export default function TablaCompras({ catalogos }) {
  const [ocps, setOcps] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [vista, setVista] = useState("oc");
  const [filtros, setFiltros] = useState(FILTROS_VACIOS);
  const [detalleId, setDetalleId] = useState(null);
  const [anulando, setAnulando] = useState(null);
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState("");

  const cargar = useCallback(() => fetchAuth("/ordenes-compra-proveedor").then(async (r) => {
    if (r.ok) setOcps(await r.json());
    setCargando(false);
  }), []);
  useEffect(() => { cargar(); }, [cargar]);

  const setFiltro = (campo) => (e) => setFiltros((f) => ({ ...f, [campo]: e.target.value }));
  const filtradas = filtrarOCPs(ocps, filtros);
  const items = aplanarItemsOCP(ocps, filtros);

  const anular = async (motivo) => {
    setProcesando(true);
    setError("");
    const r = await fetchAuth(`/ordenes-compra-proveedor/${anulando._id}/anular`, { method: "PATCH", body: JSON.stringify({ motivo }) });
    if (r.ok) await cargar();
    else {
      const d = await r.json().catch(() => ({}));
      setError(d.mensaje || "No se pudo anular la orden de compra.");
    }
    setProcesando(false);
    setAnulando(null);
  };

  const exportarExcel = () => {
    const filas = vista === "oc"
      ? filtradas.map((o) => ({
        OCP: o.codigo, FECHA: fecha(o.fecha), PROVEEDOR: o.proveedorRazonSocial, RUC: o.proveedorRuc,
        "ÍTEMS": o.items.length, MONEDA: o.moneda, SUBTOTAL: o.subtotal, IGV: o.igv, TOTAL: o.total,
        "FORMA DE PAGO": o.formaPago, ESTADO: o.anulada ? "Anulada" : "Vigente",
      }))
      : items.map((it) => ({
        FECHA: fecha(it.ocp.fecha), OCP: it.ocp.codigo, PROVEEDOR: it.ocp.proveedorRazonSocial,
        "TIPO DE ARTÍCULO": it.tipoArticulo?.nombre || "", "DESCRIPCIÓN": it.descripcion, CANTIDAD: it.cantidad,
        UNIDAD: it.unidad, "P. UNIT.": it.precioUnitario, MONEDA: it.ocp.moneda, SUBTOTAL: it.subtotal,
        "CENTRO DE COSTO": it.centroCosto?.nombre || "", OT: it.ordenTrabajo?.numeroOT || it.ordenTrabajo?.codigo || "", SC: it.scCodigo,
      }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(filas), vista === "oc" ? "Órdenes de compra" : "Ítems comprados");
    XLSX.writeFile(wb, `compras-${vista === "oc" ? "por-oc" : "por-item"}.xlsx`);
  };

  const th = "px-3 py-3 text-left";
  const td = "px-3 py-2";

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
        <select value={filtros.estado} onChange={setFiltro("estado")} className={INP}>
          <option value="">Vigentes y anuladas</option>
          <option value="vigente">Vigentes</option>
          <option value="anulada">Anuladas</option>
        </select>
        <button onClick={() => setFiltros(FILTROS_VACIOS)} className="text-sm text-gray-500 hover:text-gray-800">Limpiar</button>
        <button onClick={exportarExcel} className="ml-auto text-sm border border-gray-300 text-gray-600 px-4 py-2 rounded-lg hover:bg-gray-50 transition">Exportar Excel</button>
      </div>

      {error && <p className="text-sm text-red-500 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <TablaScroll className="overflow-x-auto">
          {vista === "oc" ? (
            <table className="w-full text-sm min-w-[1000px]">
              <thead className="bg-gray-500 text-white text-xs uppercase">
                <tr>
                  <th className={th}>OCP</th><th className={th}>Fecha</th><th className={th}>Proveedor</th>
                  <th className="px-3 py-3 text-right">Ítems</th><th className={th}>Moneda</th><th className="px-3 py-3 text-right">Total</th>
                  <th className={th}>Forma de pago</th><th className={th}>Estado</th><th className="px-3 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {cargando ? (
                  <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-400">Cargando…</td></tr>
                ) : filtradas.length === 0 ? (
                  <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-400">Sin órdenes de compra para estos filtros</td></tr>
                ) : filtradas.map((o) => (
                  <tr key={o._id} className={`hover:bg-gray-50 ${o.anulada ? "opacity-60" : ""}`}>
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
                    <td className={`${td} text-right space-x-3 whitespace-nowrap`}>
                      <button onClick={() => setDetalleId(o._id)} className="text-blue-600 hover:underline text-xs">Ver</button>
                      <button onClick={() => exportarOrdenCompraProveedorPdf(o)} className="text-purple-600 hover:underline text-xs">PDF</button>
                      {!o.anulada && <button onClick={() => setAnulando(o)} className="text-red-500 hover:underline text-xs">Anular</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <table className="w-full text-sm min-w-[1300px]">
              <thead className="bg-gray-500 text-white text-xs uppercase">
                <tr>
                  <th className={th}>Fecha</th><th className={th}>OCP</th><th className={th}>Proveedor</th><th className={th}>Tipo de artículo</th>
                  <th className={th}>Descripción</th><th className="px-3 py-3 text-right">Cant.</th><th className={th}>Und.</th>
                  <th className="px-3 py-3 text-right">P. unit.</th><th className="px-3 py-3 text-right">Subtotal</th>
                  <th className={th}>Centro de costo</th><th className={th}>OT</th><th className={th}>SC</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {cargando ? (
                  <tr><td colSpan={12} className="px-4 py-8 text-center text-gray-400">Cargando…</td></tr>
                ) : items.length === 0 ? (
                  <tr><td colSpan={12} className="px-4 py-8 text-center text-gray-400">Sin ítems comprados para estos filtros</td></tr>
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
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </TablaScroll>
      </div>

      {detalleId && <DetalleOCP ocpId={detalleId} onClose={() => setDetalleId(null)} />}
      {anulando && (
        <PromptAccion titulo={`Anular ${anulando.codigo}`} placeholder="Sus ítems volverán a Por procesar"
          onCancelar={() => setAnulando(null)} onConfirmar={anular} procesando={procesando} textoConfirmar="Anular OC" />
      )}
    </div>
  );
}
