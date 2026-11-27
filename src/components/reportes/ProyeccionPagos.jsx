import { useState, useEffect } from "react";
import * as XLSX from "xlsx";
import { fetchAuth } from "../../utils/fetchAuth";
import { fechaHoyLima, aInputFecha } from "../../utils/fecha";
import TablaScroll from "../TablaScroll";
import { TH, INP, json, celda, sumaPorMoneda, enMoneda, sumarDias, ddmmaaaa } from "../../utils/reportes";
import { CeldaMonto, FilaSubtotal, Tarjeta, ErrorCarga } from "./comun";

const AGRUPAR = [
  { id: "dia", label: "Por día" },
  { id: "semana", label: "Por semana" },
  { id: "plazo", label: "Por forma de pago" },
  { id: "proveedor", label: "Por proveedor" },
];
const VENCIDAS = "0000-vencidas";
const SIN_FECHA = "9999-sin-fecha";

const lunesDe = (iso) => sumarDias(iso, -((new Date(Date.parse(iso)).getUTCDay() + 6) % 7));
const diasDelPlazo = (plazo) => Number(String(plazo).match(/(\d+)\s*d[ií]as?/i)?.[1] ?? (/contado|adelanto/i.test(plazo) ? 0 : 9999));

function grupoDe(f, agrupar, desde) {
  if (!f.dia) return { clave: SIN_FECHA, etiqueta: "Sin fecha de pago (consignación o forma de pago sin plazo)" };
  if (f.dia < desde) return { clave: VENCIDAS, etiqueta: `Vencido sin pagar (antes del ${ddmmaaaa(desde)})` };
  if (agrupar === "semana") {
    const lunes = lunesDe(f.dia);
    return { clave: lunes, etiqueta: `Semana del ${ddmmaaaa(lunes)} al ${ddmmaaaa(sumarDias(lunes, 6))}` };
  }
  if (agrupar === "plazo") return { clave: f.plazo, etiqueta: f.plazo, orden: diasDelPlazo(f.plazo) };
  if (agrupar === "proveedor") return { clave: f.proveedor, etiqueta: f.proveedor || "Sin proveedor" };
  return { clave: f.dia, etiqueta: ddmmaaaa(f.dia) };
}

function agruparFilas(filas, agrupar, desde) {
  const grupos = new Map();
  for (const f of filas) {
    const g = grupoDe(f, agrupar, desde);
    if (!grupos.has(g.clave)) grupos.set(g.clave, { ...g, filas: [] });
    grupos.get(g.clave).filas.push(f);
  }
  const fijo = (c) => (c === VENCIDAS ? -1 : c === SIN_FECHA ? 1 : 0);
  return [...grupos.values()]
    .sort((a, b) => fijo(a.clave) - fijo(b.clave) || (a.orden ?? 0) - (b.orden ?? 0) || String(a.clave).localeCompare(String(b.clave), "es"))
    .map((g) => ({ ...g, filas: g.filas.sort((a, b) => (a.dia || "9").localeCompare(b.dia || "9")), suma: sumaPorMoneda(g.filas) }));
}

function BadgeAnticipo({ dias }) {
  if (dias == null) return <span className="text-gray-300">—</span>;
  const [clase, texto] = dias > 0 ? ["bg-sky-100 text-sky-700", `Adelantado ${dias} día${dias !== 1 ? "s" : ""}`]
    : dias < 0 ? ["bg-red-100 text-red-700", `Atrasado ${-dias} día${dias !== -1 ? "s" : ""}`]
      : ["bg-green-100 text-green-700", "En fecha"];
  return <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full uppercase tracking-wide whitespace-nowrap ${clase}`}>{texto}</span>;
}

export default function ProyeccionPagos() {
  const hoy = fechaHoyLima();
  const [rango, setRango] = useState({ desde: hoy, hasta: sumarDias(hoy, 30) });
  const [agrupar, setAgrupar] = useState("dia");
  const [incluirVencidas, setIncluirVencidas] = useState(true);
  const [data, setData] = useState({ pendientes: [], pagos: [] });
  const [error, setError] = useState("");
  const [intento, setIntento] = useState(0);
  // Cargando mientras la última respuesta no sea de la consulta actual.
  const consulta = `${rango.desde}|${rango.hasta}|${intento}`;
  const [respondida, setRespondida] = useState(null);
  const cargando = respondida !== consulta;
  const rangoValido = rango.desde && rango.hasta && rango.desde <= rango.hasta;

  useEffect(() => {
    if (!rangoValido) return;
    let vigente = true;
    fetchAuth(`/reportes/proyeccion-pagos?desde=${rango.desde}&hasta=${rango.hasta}`).then(json)
      .then((d) => { if (vigente) { setData(d); setError(""); } })
      .catch((e) => { if (vigente) setError(e.message && !/^\d+$/.test(e.message) ? e.message : "No se pudo cargar la proyección de pagos."); })
      .finally(() => { if (vigente) setRespondida(consulta); });
    return () => { vigente = false; };
  }, [rango.desde, rango.hasta, rangoValido, consulta]);

  const pendientes = data.pendientes
    .map((f) => ({ ...f, dia: f.fecha ? aInputFecha(f.fecha) : null }))
    .filter((f) => !f.dia || (f.dia >= rango.desde && f.dia <= rango.hasta) || (incluirVencidas && f.dia < rango.desde && f.dia < hoy));
  const grupos = agruparFilas(pendientes, agrupar, rango.desde);
  const totalPendiente = sumaPorMoneda(pendientes);
  const totalVencido = sumaPorMoneda(pendientes.filter((f) => f.dia && f.dia < hoy));
  const totalPagado = sumaPorMoneda(data.pagos);

  const exportarExcel = () => {
    const filaPend = (f) => ({
      "Fecha de pago": f.dia ? ddmmaaaa(f.dia) : "Sin fecha", Proveedor: celda(f.proveedor), Documento: f.documento, OC: f.ocp,
      "Forma de pago": celda(f.plazo), Concepto: f.concepto, "Monto S/": enMoneda(f, "PEN") ?? "", "Monto US$": enMoneda(f, "USD") ?? "",
      Tipo: f.estimada ? "Estimado (OC sin facturar)" : "Factura registrada",
    });
    const subtotal = (etiqueta, s) => ({ "Fecha de pago": "", Proveedor: "", Documento: "", OC: "", "Forma de pago": "", Concepto: etiqueta, "Monto S/": s.PEN, "Monto US$": s.USD, Tipo: "" });
    const proyeccion = grupos.flatMap((g) => [...g.filas.map(filaPend), subtotal(`Subtotal ${g.etiqueta}`, g.suma)]);
    if (proyeccion.length) proyeccion.push(subtotal("TOTAL", totalPendiente));
    const pagos = data.pagos.map((p) => ({
      "Fecha de pago": ddmmaaaa(aInputFecha(p.fecha)), Proveedor: celda(p.proveedor), Comprobante: p.documento, OC: p.ocp,
      "Forma de pago": celda(p.plazo), Concepto: p.concepto, Vencimiento: p.vencimiento ? ddmmaaaa(aInputFecha(p.vencimiento)) : "",
      "Días antes del vencimiento": p.diasAnticipo ?? "", "Monto S/": enMoneda(p, "PEN") ?? "", "Monto US$": enMoneda(p, "USD") ?? "",
    }));
    if (pagos.length) pagos.push({ Concepto: "TOTAL", "Monto S/": totalPagado.PEN, "Monto US$": totalPagado.USD });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, proyeccion.length ? XLSX.utils.json_to_sheet(proyeccion) : XLSX.utils.aoa_to_sheet([["Sin datos"]]), "Proyeccion de pagos");
    XLSX.utils.book_append_sheet(wb, pagos.length ? XLSX.utils.json_to_sheet(pagos) : XLSX.utils.aoa_to_sheet([["Sin datos"]]), "Pagos realizados");
    XLSX.writeFile(wb, `proyeccion-pagos_${rango.desde}_${rango.hasta}.xlsx`);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs text-gray-500 flex flex-col gap-1">Desde
          <input type="date" value={rango.desde} onChange={(e) => setRango((r) => ({ ...r, desde: e.target.value }))} className={INP} />
        </label>
        <label className="text-xs text-gray-500 flex flex-col gap-1">Hasta
          <input type="date" value={rango.hasta} onChange={(e) => setRango((r) => ({ ...r, hasta: e.target.value }))} className={INP} />
        </label>
        <div className="flex gap-1">
          {[7, 15, 30, 60, 90].map((n) => (
            <button key={n} onClick={() => setRango({ desde: hoy, hasta: sumarDias(hoy, n) })}
              className="text-xs border border-gray-300 rounded-lg px-2.5 py-2 text-gray-600 hover:bg-gray-50">{n} días</button>
          ))}
        </div>
        <select value={agrupar} onChange={(e) => setAgrupar(e.target.value)} className={INP}>
          {AGRUPAR.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm text-gray-600 py-2">
          <input type="checkbox" checked={incluirVencidas} onChange={(e) => setIncluirVencidas(e.target.checked)} />
          Incluir vencidos sin pagar
        </label>
        <button onClick={exportarExcel} disabled={cargando || !!error}
          className="ml-auto border border-gray-300 text-gray-600 px-4 py-2 rounded-lg text-sm hover:bg-gray-50 transition disabled:opacity-50">Exportar Excel</button>
      </div>

      {!rangoValido && <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">Indica un rango válido: «desde» no puede ser posterior a «hasta».</p>}
      {error && <ErrorCarga mensaje={error} onReintentar={() => setIntento((n) => n + 1)} />}
      {cargando && rangoValido && <p className="text-sm text-gray-400">Cargando proyección…</p>}

      {!cargando && !error && rangoValido && (
        <>
          <div className="flex flex-wrap gap-3">
            <Tarjeta titulo="Por pagar (proyección)" suma={totalPendiente} acento="text-amber-700" />
            <Tarjeta titulo="De eso, ya vencido" suma={totalVencido} acento="text-red-600" />
            <Tarjeta titulo="Pagado en el rango" suma={totalPagado} acento="text-emerald-700" />
          </div>
          <p className="text-xs text-gray-400 max-w-4xl">
            Las facturas registradas en Tesorería se proyectan a su fecha de vencimiento por su saldo pendiente. Lo que una OC aún no tiene
            facturado se estima con su forma de pago: fecha de entrega (o de la OC) + días del plazo, con IGV.
          </p>

          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="w-1.5 h-5 rounded-full bg-amber-500" />
              <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wide">Pagos proyectados</h3>
              <span className="text-xs text-gray-400">({pendientes.length})</span>
            </div>
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              <TablaScroll className="overflow-x-auto">
                <table className="w-full text-sm min-w-[1100px]">
                  <thead className="bg-gray-50 text-xs uppercase tracking-wide border-b-2 border-gray-200">
                    <tr>
                      <th className={`${TH} text-left`}>Fecha de pago</th>
                      <th className={`${TH} text-left`}>Proveedor</th>
                      <th className={`${TH} text-left`}>Documento</th>
                      <th className={`${TH} text-left`}>OC</th>
                      <th className={`${TH} text-left`}>Forma de pago</th>
                      <th className={`${TH} text-left`}>Concepto</th>
                      <th className={`${TH} text-right`}>Monto S/</th>
                      <th className={`${TH} text-right`}>Monto US$</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {grupos.length === 0 ? (
                      <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">Sin pagos pendientes en este rango</td></tr>
                    ) : grupos.map((g) => [
                      <tr key={`h-${g.clave}`} className={g.clave === VENCIDAS ? "bg-red-50" : "bg-purple-50/60"}>
                        <td colSpan={8} className={`px-4 py-2 text-xs font-bold uppercase tracking-wide ${g.clave === VENCIDAS ? "text-red-700" : "text-purple-800"}`}>{g.etiqueta}</td>
                      </tr>,
                      ...g.filas.map((f, i) => (
                        <tr key={`${g.clave}-${i}`} className="hover:bg-gray-50">
                          <td className="px-4 py-2.5 whitespace-nowrap">
                            <span className={f.dia && f.dia < hoy ? "text-red-600 font-semibold" : "text-gray-700"}>{f.dia ? ddmmaaaa(f.dia) : "—"}</span>
                            {f.estimada && <span className="ml-2 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500 uppercase">Estimado</span>}
                          </td>
                          <td className="px-4 py-2.5 text-gray-700">{f.proveedor}</td>
                          <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">{f.documento}</td>
                          <td className="px-4 py-2.5 font-mono text-xs text-gray-500">{f.ocp || "—"}</td>
                          <td className="px-4 py-2.5 text-xs text-gray-600">{f.plazo}</td>
                          <td className="px-4 py-2.5 text-xs text-gray-600">{f.concepto}</td>
                          <CeldaMonto valor={enMoneda(f, "PEN")} moneda="PEN" />
                          <CeldaMonto valor={enMoneda(f, "USD")} moneda="USD" />
                        </tr>
                      )),
                      <FilaSubtotal key={`s-${g.clave}`} etiqueta={`Subtotal ${g.etiqueta}`} suma={g.suma} columnas={6} />,
                    ])}
                    {grupos.length > 0 && <FilaSubtotal etiqueta="Total por pagar" suma={totalPendiente} columnas={6} total />}
                  </tbody>
                </table>
              </TablaScroll>
            </div>
          </div>

          <div>
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <span className="w-1.5 h-5 rounded-full bg-emerald-500" />
              <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wide">Pagos realizados en el rango</h3>
              <span className="text-xs text-gray-400">({data.pagos.length}) — un pago antes del vencimiento sale de la proyección y aparece aquí con su fecha real</span>
            </div>
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              <TablaScroll className="overflow-x-auto">
                <table className="w-full text-sm min-w-[1200px]">
                  <thead className="bg-gray-50 text-xs uppercase tracking-wide border-b-2 border-gray-200">
                    <tr>
                      <th className={`${TH} text-left`}>Fecha de pago</th>
                      <th className={`${TH} text-left`}>Proveedor</th>
                      <th className={`${TH} text-left`}>Comprobante</th>
                      <th className={`${TH} text-left`}>OC</th>
                      <th className={`${TH} text-left`}>Forma de pago</th>
                      <th className={`${TH} text-left`}>Concepto</th>
                      <th className={`${TH} text-left`}>Vencimiento</th>
                      <th className={`${TH} text-center`}>Pago vs. vencimiento</th>
                      <th className={`${TH} text-right`}>Monto S/</th>
                      <th className={`${TH} text-right`}>Monto US$</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {data.pagos.length === 0 ? (
                      <tr><td colSpan={10} className="px-4 py-8 text-center text-gray-400">Sin pagos a proveedores en este rango</td></tr>
                    ) : data.pagos.map((p) => (
                      <tr key={p.codigo} className="hover:bg-gray-50">
                        <td className="px-4 py-2.5 whitespace-nowrap text-gray-700">{ddmmaaaa(aInputFecha(p.fecha))}</td>
                        <td className="px-4 py-2.5 text-gray-700">{p.proveedor}</td>
                        <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">{p.documento}</td>
                        <td className="px-4 py-2.5 font-mono text-xs text-gray-500">{p.ocp || "—"}</td>
                        <td className="px-4 py-2.5 text-xs text-gray-600">{p.plazo}</td>
                        <td className="px-4 py-2.5 text-xs text-gray-600">{p.concepto}</td>
                        <td className="px-4 py-2.5 whitespace-nowrap text-gray-600">{p.vencimiento ? ddmmaaaa(aInputFecha(p.vencimiento)) : "—"}</td>
                        <td className="px-4 py-2.5 text-center"><BadgeAnticipo dias={p.diasAnticipo} /></td>
                        <CeldaMonto valor={enMoneda(p, "PEN")} moneda="PEN" />
                        <CeldaMonto valor={enMoneda(p, "USD")} moneda="USD" />
                      </tr>
                    ))}
                    {data.pagos.length > 0 && <FilaSubtotal etiqueta="Total pagado" suma={totalPagado} columnas={8} total />}
                  </tbody>
                </table>
              </TablaScroll>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
