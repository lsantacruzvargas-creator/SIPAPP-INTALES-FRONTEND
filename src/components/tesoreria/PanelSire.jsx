import { useState, useEffect, useCallback } from "react";
import { fetchAuth, uploadAuth } from "../../utils/fetchAuth";
import { fechaHoyLima, formatearFechaHora } from "../../utils/fecha";
import { money } from "../../utils/compras";
import { periodoDeMes, fechaIsoTexto } from "../../utils/tesoreria";
import { sumarPorMoneda, textoMontos, exportarHoja, filasSubtotal } from "../../utils/exportarTabla";
import TablaScroll from "../TablaScroll";

const INP = "border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300";
const RESULTADOS = {
  coincide: { label: "Coincide", cls: "bg-emerald-50 text-emerald-700" },
  difiere: { label: "Difiere", cls: "bg-amber-50 text-amber-700" },
  solo_sire: { label: "Solo en SIRE", cls: "bg-red-50 text-red-700" },
  solo_sistema: { label: "Solo en el sistema", cls: "bg-blue-50 text-blue-700" },
};
const CAMPOS = [["fecha", "fechaEmision"], ["total", "total"], ["igv", "igv"], ["moneda", "moneda"]];

const sinTildes = (t) => String(t ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
// Texto que se ve en cada columna: es lo que se compara con el filtro de esa columna.
const TEXTO_COL = {
  ruc: (f) => (f.sire || f.sistema).rucContraparte,
  razon: (f) => (f.sire || f.sistema).razonSocial,
  comprobante: (f) => { const d = f.sire || f.sistema; return `${d.tipo} ${d.serie}-${d.numero}`; },
  fecha: (f) => fechaIsoTexto((f.sire || f.sistema).fechaEmision),
  total: (f) => String((f.sire || f.sistema).total ?? ""),
  igv: (f) => String((f.sire || f.sistema).igv ?? ""),
  moneda: (f) => (f.sire || f.sistema).moneda,
};
const COLUMNAS = [["resultado", "Resultado"], ["ruc", "RUC"], ["razon", "Razón social"], ["comprobante", "Comprobante"], ["fecha", "Fecha"], ["total", "Total"], ["igv", "IGV"], ["moneda", "Moneda"]];
const INP_COL = "w-full border border-gray-300 rounded px-2 py-1 text-xs font-normal normal-case text-gray-700 focus:outline-none focus:ring-1 focus:ring-purple-300";

export default function PanelSire({ onRegistrarFactura }) {
  const [libro, setLibro] = useState("RCE");
  const [mes, setMes] = useState(fechaHoyLima().slice(0, 7));
  const [estado, setEstado] = useState(null);
  const [filas, setFilas] = useState([]);
  const [filtro, setFiltro] = useState("");
  const [colFiltros, setColFiltros] = useState({});
  const limpiarFiltros = () => { setColFiltros({}); setFiltro(""); };
  const setCol = (k, v) => setColFiltros((p) => ({ ...p, [k]: v }));
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState("");
  const base = `/sire/${libro}/${periodoDeMes(mes)}`;

  const cargar = useCallback(() => fetchAuth(`${base}/estado`).then(async (r) => {
    const est = await r.json().catch(() => null);
    setEstado(r.ok ? est : null);
    if (!r.ok) setError(est?.mensaje || "No se pudo consultar el estado del SIRE.");
    if (est?.estado === "lista") {
      const rc = await fetchAuth(`${base}/conciliacion`);
      setFilas(rc.ok ? await rc.json() : []);
    } else setFilas([]);
  }), [base]);
  useEffect(() => { cargar(); }, [cargar]);
  // Mientras SUNAT procesa el ticket se consulta solo cada 15 s (antes había que pulsar "Actualizar estado").
  const descargando = estado?.estado === "descargando";
  useEffect(() => {
    if (!descargando) return undefined;
    const t = setInterval(cargar, 15000);
    return () => clearInterval(t);
  }, [descargando, cargar]);

  const accion = async (fn) => {
    setOcupado(true);
    setError("");
    try {
      const r = await fn();
      if (!r.ok) setError((await r.json().catch(() => ({}))).mensaje || "La operación con el SIRE falló.");
      await cargar();
    } catch {
      setError("Error de conexión con el servidor, intenta de nuevo.");
    } finally {
      setOcupado(false);
    }
  };
  const descargar = () => accion(() => fetchAuth(`${base}/descargar`, { method: "POST" }));
  const subir = (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const fd = new FormData();
    fd.append("archivo", file);
    accion(() => uploadAuth(`${base}/archivo`, fd));
  };

  const visibles = filas.filter((f) => (!filtro || f.estado === filtro)
    && (!colFiltros.resultado || f.estado === colFiltros.resultado)
    && Object.entries(TEXTO_COL).every(([k, fn]) => !colFiltros[k] || sinTildes(fn(f)).includes(sinTildes(colFiltros[k]).trim())));
  const hayColFiltros = Object.values(colFiltros).some(Boolean);
  const conteo = (e) => filas.filter((f) => f.estado === e).length;
  const dato = (f) => f.sire || f.sistema;
  const sub = {
    total: sumarPorMoneda(visibles, (f) => dato(f).total, (f) => dato(f).moneda),
    igv: sumarPorMoneda(visibles, (f) => dato(f).igv, (f) => dato(f).moneda),
  };
  const exportarExcel = () => exportarHoja(`sire-${libro.toLowerCase()}-${periodoDeMes(mes)}.xlsx`, "Conciliación SIRE", visibles.map((f) => {
    const d = dato(f);
    return {
      RESULTADO: RESULTADOS[f.estado].label, RUC: d.rucContraparte, "RAZÓN SOCIAL": d.razonSocial || "",
      COMPROBANTE: `${d.tipo} ${d.serie}-${d.numero}`, FECHA: fechaIsoTexto(d.fechaEmision),
      TOTAL: d.total, IGV: d.igv, MONEDA: d.moneda, DIFERENCIAS: f.diferencias.join(", "),
    };
  }), filasSubtotal("RESULTADO", { TOTAL: sub.total, IGV: sub.igv }));

  // Plantilla .txt para "Subir archivo": mismas columnas y formato que exporta el SIRE
  // (la arma el servidor copiando la propuesta descargada del periodo, si la hay).
  const descargarPlantilla = () => accion(async () => {
    const r = await fetchAuth(`${base}/plantilla`);
    if (!r.ok) return r;
    const url = URL.createObjectURL(await r.blob());
    const a = document.createElement("a");
    a.href = url;
    a.download = `plantilla-sire-${libro.toLowerCase()}-${periodoDeMes(mes)}.txt`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    return { ok: true };
  });

  const celda = (f, [clave, campo]) => {
    const dato = f.sire?.[campo] ?? f.sistema?.[campo];
    const difiere = f.diferencias.includes(clave);
    const texto = campo === "total" || campo === "igv" ? money(dato || 0, f.sire?.moneda || f.sistema?.moneda || "PEN")
      : campo === "fechaEmision" ? fechaIsoTexto(dato) : String(dato ?? "—");
    return (
      <td key={clave} className={`px-3 py-2 ${difiere ? "bg-amber-100 font-semibold" : ""}`}>
        {texto}{difiere && f.sistema ? <span className="block text-[11px] text-gray-500">sistema: {campo === "fechaEmision" ? fechaIsoTexto(f.sistema[campo]) : String(f.sistema[campo])}</span> : null}
      </td>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-center">
        <select value={libro} onChange={(e) => { setLibro(e.target.value); limpiarFiltros(); }} className={INP}>
          <option value="RCE">Compras (RCE)</option><option value="RVIE">Ventas (RVIE)</option>
        </select>
        <input type="month" value={mes} onChange={(e) => { setMes(e.target.value); limpiarFiltros(); }} className={INP} />
        <button onClick={descargar} disabled={ocupado} className="bg-purple-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-50">Descargar de SUNAT</button>
        {estado?.estado === "descargando" && <button onClick={() => accion(() => fetchAuth(`${base}/estado`))} disabled={ocupado} className="border border-gray-300 px-4 py-2 rounded-lg text-sm">Actualizar estado</button>}
        <label className="border border-gray-300 text-gray-600 px-4 py-2 rounded-lg text-sm hover:bg-gray-50 cursor-pointer">
          Subir archivo<input type="file" accept=".zip,.txt" className="hidden" onChange={subir} disabled={ocupado} />
        </label>
        <button onClick={exportarExcel} disabled={!visibles.length} className="border border-gray-300 text-gray-600 px-4 py-2 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50">Exportar Excel</button>
        <button onClick={descargarPlantilla} disabled={ocupado} title="Archivo .txt con las columnas del SIRE para llenar y cargarlo con «Subir archivo»" className="border border-purple-300 text-purple-700 px-4 py-2 rounded-lg text-sm hover:bg-purple-50 disabled:opacity-50">Descargar plantilla</button>
        <span className="text-xs text-gray-500">
          {!estado || estado.estado === "sin_datos" ? "Sin propuesta descargada"
            : `${estado.estado === "lista" ? "Lista" : estado.estado === "error" ? "Error" : "Descargando"} · ${estado.origen === "archivo" ? "archivo" : "API"} · ${estado.totalComprobantes} comprobantes${estado.fechaDescarga ? ` · ${formatearFechaHora(estado.fechaDescarga)}` : ""}${estado.mensaje ? ` · ${estado.mensaje}` : ""}`}
        </span>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      {filas.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setFiltro("")} className={`px-3 py-1 rounded-full text-xs ${!filtro ? "bg-gray-800 text-white" : "bg-gray-100"}`}>Todos ({filas.length})</button>
          {Object.entries(RESULTADOS).map(([k, r]) => (
            <button key={k} onClick={() => setFiltro(k)} className={`px-3 py-1 rounded-full text-xs ${filtro === k ? "ring-2 ring-gray-800" : ""} ${r.cls}`}>{r.label} ({conteo(k)})</button>
          ))}
        </div>
      )}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <TablaScroll className="overflow-x-auto">
          <table className="w-full text-sm" style={{ minWidth: "1000px" }}>
            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
              <tr>{[...COLUMNAS.map(([, h]) => h), ""].map((h) => <th key={h} className="px-3 py-2 text-left">{h}</th>)}</tr>
              {filas.length > 0 && (
                <tr className="bg-white">
                  {COLUMNAS.map(([k, h]) => (
                    <th key={k} className="px-3 py-1">
                      {k === "resultado" ? (
                        <select value={colFiltros.resultado || ""} onChange={(e) => setCol(k, e.target.value)} className={INP_COL} aria-label="Filtrar Resultado">
                          <option value="">Todos</option>
                          {Object.entries(RESULTADOS).map(([v, r]) => <option key={v} value={v}>{r.label}</option>)}
                        </select>
                      ) : (
                        <input value={colFiltros[k] || ""} onChange={(e) => setCol(k, e.target.value)} placeholder="Filtrar" className={INP_COL} aria-label={`Filtrar ${h}`} />
                      )}
                    </th>
                  ))}
                  <th className="px-3 py-1 text-right">
                    {hayColFiltros && <button onClick={() => setColFiltros({})} className="text-xs font-normal normal-case text-purple-600 hover:text-purple-800">Limpiar</button>}
                  </th>
                </tr>
              )}
            </thead>
            <tbody className="divide-y divide-gray-100">
              {visibles.length === 0 && <tr><td colSpan={9} className="px-3 py-8 text-center text-gray-400">Sin comprobantes para conciliar</td></tr>}
              {visibles.map((f) => {
                const d = f.sire || f.sistema;
                return (
                  <tr key={f.clave}>
                    <td className="px-3 py-2"><span className={`px-2 py-0.5 rounded-full text-xs ${RESULTADOS[f.estado].cls}`}>{RESULTADOS[f.estado].label}</span></td>
                    <td className="px-3 py-2">{d.rucContraparte}</td>
                    <td className="px-3 py-2">{d.razonSocial || "—"}</td>
                    <td className="px-3 py-2">{d.tipo} {d.serie}-{d.numero}</td>
                    {CAMPOS.map((c) => celda(f, c))}
                    <td className="px-3 py-2 text-right">
                      {f.estado === "solo_sire" && libro === "RCE" && (
                        <button onClick={() => onRegistrarFactura({ precarga: f.sire })} className="text-xs text-purple-600 hover:text-purple-800">Registrar factura</button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {visibles.length > 0 && (
              <tfoot className="bg-gray-50 font-semibold text-gray-700">
                <tr>
                  <td colSpan={5} className="px-3 py-2">Subtotal ({visibles.length} comprobantes)</td>
                  <td className="px-3 py-2 tabular-nums">{textoMontos(sub.total)}</td>
                  <td className="px-3 py-2 tabular-nums">{textoMontos(sub.igv)}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            )}
          </table>
        </TablaScroll>
      </div>
    </div>
  );
}
