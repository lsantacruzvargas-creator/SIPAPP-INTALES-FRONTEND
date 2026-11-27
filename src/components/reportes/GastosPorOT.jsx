import { useState, useEffect } from "react";
import * as XLSX from "xlsx";
import { fetchAuth } from "../../utils/fetchAuth";
import { aInputFecha } from "../../utils/fecha";
import { money } from "../detalleShared";
import TablaScroll from "../TablaScroll";
import { TH, INP, json, celda, sumaPorMoneda, enMoneda, ddmmaaaa } from "../../utils/reportes";
import { CeldaMonto, FilaSubtotal, Tarjeta, ErrorCarga } from "./comun";

const SIN_OT = "Sin OT";
const porOT = (a, b) => (a === SIN_OT) - (b === SIN_OT) || String(a).localeCompare(String(b), "es", { numeric: true });

// Mismo origen que la hoja «Detalle de compras» del Excel general (GET /reportes/detalle-compras):
// líneas de OC a proveedor, compras antiguas ya procesadas y comprobantes sin OC ligados a la OT. Sin IGV.
export default function GastosPorOT() {
  const [filas, setFilas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(false);
  const [intento, setIntento] = useState(0);
  const [filtros, setFiltros] = useState({ ot: "", texto: "", tipo: "", desde: "", hasta: "" });

  useEffect(() => {
    fetchAuth("/reportes/detalle-compras").then(json)
      .then((d) => { setFilas(d.map((f) => ({ ...f, ot: f.numeroOT || SIN_OT, dia: f.fechaCompra ? aInputFecha(f.fechaCompra) : "" }))); setError(false); })
      .catch(() => setError(true))
      .finally(() => setCargando(false));
  }, [intento]);

  const setFiltro = (campo) => (e) => setFiltros((f) => ({ ...f, [campo]: e.target.value }));
  const q = filtros.texto.trim().toLowerCase();
  const visibles = filas.filter((f) =>
    (!filtros.ot || f.ot === filtros.ot)
    && (!filtros.tipo || f.tipo === filtros.tipo)
    && (!filtros.desde || (f.dia && f.dia >= filtros.desde))
    && (!filtros.hasta || (f.dia && f.dia <= filtros.hasta))
    && (!q || [f.descripcion, f.proveedor, f.codigo, f.subOT, f.tituloOT].some((v) => String(v || "").toLowerCase().includes(q))));

  const ots = [...new Set(filas.map((f) => f.ot))].sort(porOT);
  const tipos = [...new Set(filas.map((f) => f.tipo))].sort();
  const grupos = [...new Set(visibles.map((f) => f.ot))].sort(porOT).map((ot) => {
    const delOT = visibles.filter((f) => f.ot === ot);
    return { ot, titulo: delOT[0]?.tituloOT || "", numeroOC: delOT[0]?.numeroOC || "", filas: delOT, suma: sumaPorMoneda(delOT, (f) => f.total) };
  });
  const total = sumaPorMoneda(visibles, (f) => f.total);

  const exportarExcel = () => {
    const filaExcel = (f) => ({
      "N° OT": f.ot, "Título OT": celda(f.tituloOT || ""), "Sub-OT": f.subOT || "", "Fecha de compra": f.dia ? ddmmaaaa(f.dia) : "",
      Tipo: f.tipo, Documento: f.codigo, Proveedor: celda(f.proveedor), "Material / descripción": celda(f.descripcion),
      Cantidad: f.cantidad, "P. unit. (sin IGV)": f.precioUnitario, Flete: f.flete,
      "Total S/": enMoneda(f, "PEN", f.total) ?? "", "Total US$": enMoneda(f, "USD", f.total) ?? "",
    });
    const subtotal = (etiqueta, s) => ({ "Material / descripción": etiqueta, "Total S/": s.PEN, "Total US$": s.USD });
    const hoja = grupos.flatMap((g) => [...g.filas.map(filaExcel), subtotal(`Subtotal OT ${g.ot}`, g.suma)]);
    if (hoja.length) hoja.push(subtotal("TOTAL", total));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, hoja.length ? XLSX.utils.json_to_sheet(hoja) : XLSX.utils.aoa_to_sheet([["Sin datos"]]), "Gastos por OT");
    XLSX.writeFile(wb, "gastos-por-ot.xlsx");
  };

  if (error) return <ErrorCarga mensaje="No se pudieron cargar los gastos por OT." onReintentar={() => { setCargando(true); setError(false); setIntento((n) => n + 1); }} />;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs text-gray-500 flex flex-col gap-1">OT
          <select value={filtros.ot} onChange={setFiltro("ot")} className={INP}>
            <option value="">Todas las OT</option>
            {ots.map((ot) => <option key={ot} value={ot}>{ot}</option>)}
          </select>
        </label>
        <label className="text-xs text-gray-500 flex flex-col gap-1">Buscar
          <input value={filtros.texto} onChange={setFiltro("texto")} placeholder="Material, proveedor, documento…" className={`${INP} w-64`} />
        </label>
        <label className="text-xs text-gray-500 flex flex-col gap-1">Tipo
          <select value={filtros.tipo} onChange={setFiltro("tipo")} className={INP}>
            <option value="">Todos</option>
            {tipos.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
        <label className="text-xs text-gray-500 flex flex-col gap-1">Compra desde
          <input type="date" value={filtros.desde} onChange={setFiltro("desde")} className={INP} />
        </label>
        <label className="text-xs text-gray-500 flex flex-col gap-1">Hasta
          <input type="date" value={filtros.hasta} onChange={setFiltro("hasta")} className={INP} />
        </label>
        <button onClick={() => setFiltros({ ot: "", texto: "", tipo: "", desde: "", hasta: "" })} className="text-sm text-gray-500 hover:text-gray-800 py-2">Limpiar</button>
        <button onClick={exportarExcel} disabled={cargando}
          className="ml-auto border border-gray-300 text-gray-600 px-4 py-2 rounded-lg text-sm hover:bg-gray-50 transition disabled:opacity-50">Exportar Excel</button>
      </div>

      {cargando ? <p className="text-sm text-gray-400">Cargando gastos…</p> : (
        <>
          <div className="flex flex-wrap gap-3">
            <Tarjeta titulo={`Gasto total (${grupos.length} OT)`} suma={total} />
          </div>
          <p className="text-xs text-gray-400">Montos sin IGV, en la moneda de cada compra. Incluye lo comprado aunque aún no esté pagado.</p>
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <TablaScroll className="overflow-x-auto">
              <table className="w-full text-sm min-w-[1250px]">
                <thead className="bg-gray-50 text-xs uppercase tracking-wide border-b-2 border-gray-200">
                  <tr>
                    <th className={`${TH} text-left`}>Sub-OT</th>
                    <th className={`${TH} text-left`}>Fecha</th>
                    <th className={`${TH} text-left`}>Tipo</th>
                    <th className={`${TH} text-left`}>Documento</th>
                    <th className={`${TH} text-left`}>Proveedor</th>
                    <th className={`${TH} text-left`}>Material / descripción</th>
                    <th className={`${TH} text-right`}>Cant.</th>
                    <th className={`${TH} text-right`}>P. unit.</th>
                    <th className={`${TH} text-right`}>Total S/</th>
                    <th className={`${TH} text-right`}>Total US$</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {grupos.length === 0 ? (
                    <tr><td colSpan={10} className="px-4 py-8 text-center text-gray-400">Sin gastos para estos filtros</td></tr>
                  ) : grupos.map((g) => [
                    <tr key={`h-${g.ot}`} className="bg-indigo-50/60">
                      <td colSpan={10} className="px-4 py-2 text-xs font-bold text-indigo-800 uppercase tracking-wide">
                        {g.ot === SIN_OT ? SIN_OT : `OT ${g.ot}`}{g.titulo ? ` — ${g.titulo}` : ""}
                        {g.numeroOC && <span className="ml-2 font-normal normal-case text-indigo-600">OC cliente {g.numeroOC}</span>}
                      </td>
                    </tr>,
                    ...g.filas.map((f, i) => (
                      <tr key={`${g.ot}-${i}`} className="hover:bg-gray-50">
                        <td className="px-4 py-2.5 text-xs text-gray-500">{f.subOT || "—"}</td>
                        <td className="px-4 py-2.5 whitespace-nowrap text-gray-600">{f.dia ? ddmmaaaa(f.dia) : "—"}</td>
                        <td className="px-4 py-2.5 text-xs text-gray-600">{f.tipo}</td>
                        <td className="px-4 py-2.5 font-mono text-xs text-gray-500 whitespace-nowrap">{f.codigo}</td>
                        <td className="px-4 py-2.5 text-gray-700">{f.proveedor || "—"}</td>
                        <td className="px-4 py-2.5 text-gray-800">
                          {f.descripcion || "—"}
                          {f.flete > 0 && <span className="block text-[11px] text-gray-400">Incluye flete {money(f.flete, f.moneda)}</span>}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{f.cantidad}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums whitespace-nowrap">{money(f.precioUnitario, f.moneda)}</td>
                        <CeldaMonto valor={enMoneda(f, "PEN", f.total)} moneda="PEN" />
                        <CeldaMonto valor={enMoneda(f, "USD", f.total)} moneda="USD" />
                      </tr>
                    )),
                    <FilaSubtotal key={`s-${g.ot}`} etiqueta={`Subtotal ${g.ot === SIN_OT ? SIN_OT : `OT ${g.ot}`}`} suma={g.suma} columnas={8} />,
                  ])}
                  {grupos.length > 0 && <FilaSubtotal etiqueta="Total general" suma={total} columnas={8} total />}
                </tbody>
              </table>
            </TablaScroll>
          </div>
        </>
      )}
    </div>
  );
}
