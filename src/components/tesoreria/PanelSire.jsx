import { useState, useEffect, useCallback } from "react";
import { fetchAuth, uploadAuth } from "../../utils/fetchAuth";
import { fechaHoyLima, formatearFechaHora } from "../../utils/fecha";
import { money } from "../../utils/compras";
import { periodoDeMes, fechaIsoTexto, textoTcSire, filasExcelComparacionCarga, RESULTADOS_CARGA } from "../../utils/tesoreria";
import { sumarPorMoneda, textoMontos, exportarHoja, filasSubtotal } from "../../utils/exportarTabla";
import { plantillaXlsx, xlsxATexto } from "../../utils/sireExcel";
import TablaScroll from "../TablaScroll";

const INP = "border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300";
const RESULTADOS = {
  coincide: { label: "Coincide", cls: "bg-emerald-50 text-emerald-700" },
  difiere: { label: "Difiere", cls: "bg-amber-50 text-amber-700" },
  solo_sire: { label: "Solo en SIRE", cls: "bg-red-50 text-red-700" },
  solo_sistema: { label: "Solo en el sistema", cls: "bg-blue-50 text-blue-700" },
};
const CAMPOS = [["fecha", "fechaEmision"], ["total", "total"], ["igv", "igv"], ["moneda", "moneda"], ["tipoCambio", "tipoCambio"]];
const tcDe = (d) => (d?.moneda === "USD" && Number(d.tipoCambio) > 0 ? Number(d.tipoCambio).toFixed(3) : "—");

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
  tipoCambio: (f) => tcDe(f.sire || f.sistema),
};
const COLUMNAS = [["resultado", "Resultado"], ["ruc", "RUC"], ["razon", "Razón social"], ["comprobante", "Comprobante"], ["fecha", "Fecha"], ["total", "Total"], ["igv", "IGV"], ["moneda", "Moneda"], ["tipoCambio", "TC"]];
const INP_COL = "w-full border border-gray-300 rounded px-2 py-1 text-xs font-normal normal-case text-gray-700 focus:outline-none focus:ring-1 focus:ring-purple-300";

const CLS_CARGA = { coincide: "bg-emerald-50 text-emerald-700", difiere: "bg-amber-50 text-amber-700", solo_carga: "bg-red-50 text-red-700", solo_sire: "bg-blue-50 text-blue-700" };

// Carga manual vs propuesta descargada de SUNAT: la carga no reemplaza a la propuesta; aquí se
// ve qué comprobantes difieren en base imponible o están solo en uno de los dos.
function ComparacionCarga({ datos, archivo, onCerrar }) {
  const [filtro, setFiltro] = useState("");
  const filas = datos.filas.filter((f) => !filtro || f.estado === filtro);
  const cuenta = (e) => datos.filas.filter((f) => f.estado === e).length;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h3 className="font-semibold text-gray-800">Carga manual vs propuesta descargada de SUNAT</h3>
            <p className="text-xs text-gray-500">La carga no reemplazó a la propuesta de SUNAT. Comparación por comprobante, RUC y base imponible.</p>
          </div>
          <button onClick={onCerrar} className="text-gray-400 hover:text-gray-700 text-xl" aria-label="Cerrar">✕</button>
        </div>
        <div className="px-6 pt-3 flex flex-wrap gap-2 items-center">
          <button onClick={() => setFiltro("")} className={`px-3 py-1 rounded-full text-xs ${!filtro ? "bg-gray-800 text-white" : "bg-gray-100"}`}>Todos ({datos.filas.length})</button>
          {Object.entries(RESULTADOS_CARGA).map(([k, l]) => (
            <button key={k} onClick={() => setFiltro(k)} className={`px-3 py-1 rounded-full text-xs ${filtro === k ? "ring-2 ring-gray-800" : ""} ${CLS_CARGA[k]}`}>{l} ({cuenta(k)})</button>
          ))}
          <button onClick={() => exportarHoja(archivo, "Carga vs SUNAT", filasExcelComparacionCarga(filas))} disabled={!filas.length}
            className="ml-auto border border-gray-300 text-gray-600 px-3 py-1.5 rounded-lg text-xs hover:bg-gray-50 disabled:opacity-50">Exportar Excel</button>
        </div>
        <div className="flex-1 overflow-y-auto p-6 pt-3">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
              <tr>{["Resultado", "Comprobante", "RUC", "Razón social", "Base SUNAT", "Base carga"].map((h) => <th key={h} className="px-3 py-2 text-left">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {!filas.length && <tr><td colSpan={6} className="px-3 py-6 text-center text-gray-400">Sin comprobantes</td></tr>}
              {filas.map((f) => (
                <tr key={f.clave}>
                  <td className="px-3 py-2"><span className={`px-2 py-0.5 rounded-full text-xs ${CLS_CARGA[f.estado]}`}>{RESULTADOS_CARGA[f.estado]}</span></td>
                  <td className="px-3 py-2">{f.tipo} {f.serie}-{f.numero}</td>
                  <td className={`px-3 py-2 ${f.diferencias?.includes("ruc") ? "bg-amber-100 font-semibold" : ""}`}>{f.ruc}
                    {f.diferencias?.includes("ruc") && <span className="block text-[11px] font-normal text-gray-600">SUNAT: {f.rucSire}</span>}
                  </td>
                  <td className="px-3 py-2">{f.razonSocial || "—"}</td>
                  <td className={`px-3 py-2 tabular-nums ${f.diferencias?.includes("base") ? "bg-amber-100 font-semibold" : ""}`}>{f.baseSire != null ? money(f.baseSire) : "—"}</td>
                  <td className={`px-3 py-2 tabular-nums ${f.diferencias?.includes("base") ? "bg-amber-100 font-semibold" : ""}`}>{f.baseCarga != null ? money(f.baseCarga) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

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
  const [comparacion, setComparacion] = useState(null);
  const base = `/sire/${libro}/${periodoDeMes(mes)}`;
  const abrirComparacion = async () => {
    try {
      const r = await fetchAuth(`${base}/comparar-carga`);
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setError(d.mensaje || "No se pudo comparar la carga manual."); return; }
      setComparacion(d);
    } catch {
      setError("Error de conexión con el servidor, intenta de nuevo.");
    }
  };

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
  // El Excel de la plantilla se convierte aquí al formato del SIRE (texto con "|"); el
  // ZIP o TXT descargado de SUNAT se sube tal cual.
  const subir = (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    let comparar = false;
    accion(async () => {
      let archivo = file;
      if (/\.xlsx$/i.test(file.name)) {
        try {
          archivo = new File([await xlsxATexto(await file.arrayBuffer())], "sire.txt", { type: "text/plain" });
        } catch (err) {
          return { ok: false, json: async () => ({ mensaje: `No se pudo leer el Excel: ${err.message}` }) };
        }
      }
      const fd = new FormData();
      fd.append("archivo", archivo);
      const r = await uploadAuth(`${base}/archivo`, fd);
      // Con propuesta de SUNAT ya descargada, la carga queda aparte: se abre la comparación.
      if (r.ok) {
        const d = await r.clone().json().catch(() => null);
        comparar = d?.origen === "api" && d.cargaManual > 0;
      }
      return r;
    }).then(() => { if (comparar) abrirComparacion(); });
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
      "TC SISTEMA": f.sistema?.moneda === "USD" ? f.sistema.tipoCambio : "", "TC SIRE": f.sire?.moneda === "USD" ? f.sire.tipoCambio : "",
      "TC SUNAT": f.tc?.sunat ?? "",
    };
  }), filasSubtotal("RESULTADO", { TOTAL: sub.total, IGV: sub.igv }));

  // Plantilla Excel para llenar y cargar con "Subir archivo": columnas y orden del SIRE
  // (el servidor las copia de la propuesta descargada del periodo, si la hay).
  const descargarPlantilla = () => accion(async () => {
    const r = await fetchAuth(`${base}/plantilla`);
    if (!r.ok) return r;
    const charset = /charset=([^;]+)/i.exec(r.headers.get("content-type") || "")?.[1] || "utf-8";
    const cabecera = new TextDecoder(charset).decode(await r.arrayBuffer()).split(/\r?\n/)[0];
    const blob = new Blob([await plantillaXlsx(cabecera)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `plantilla-sire-${libro.toLowerCase()}-${periodoDeMes(mes)}.xlsx`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    return { ok: true };
  });

  const celda = (f, [clave, campo]) => {
    const dato = f.sire?.[campo] ?? f.sistema?.[campo];
    const difiere = f.diferencias.includes(clave);
    const texto = campo === "total" || campo === "igv" ? money(dato || 0, f.sire?.moneda || f.sistema?.moneda || "PEN")
      : campo === "fechaEmision" ? fechaIsoTexto(dato) : campo === "tipoCambio" ? tcDe(f.sire || f.sistema) : String(dato ?? "—");
    if (clave === "tipoCambio" && difiere && f.tc) {
      return <td key={clave} className="px-3 py-2 bg-amber-100 font-semibold">{texto}<span className="block text-[11px] font-normal text-gray-600">{textoTcSire(f.tc)}</span></td>;
    }
    return (
      <td key={clave} className={`px-3 py-2 ${difiere ? "bg-amber-100 font-semibold" : ""}`}>
        {texto}{difiere && f.sistema ? <span className="block text-[11px] text-gray-500">sistema: {campo === "fechaEmision" ? fechaIsoTexto(f.sistema[campo]) : String(f.sistema[campo])}</span> : null}
      </td>
    );
  };

  return (
    <div className="space-y-4">
      {comparacion && <ComparacionCarga datos={comparacion} archivo={`carga-vs-sunat-${libro.toLowerCase()}-${periodoDeMes(mes)}.xlsx`} onCerrar={() => setComparacion(null)} />}
      <div className="flex flex-wrap gap-3 items-center">
        <select value={libro} onChange={(e) => { setLibro(e.target.value); limpiarFiltros(); }} className={INP}>
          <option value="RCE">Compras (RCE)</option><option value="RVIE">Ventas (RVIE)</option>
        </select>
        <input type="month" value={mes} onChange={(e) => { setMes(e.target.value); limpiarFiltros(); }} className={INP} />
        <button onClick={descargar} disabled={ocupado} className="bg-purple-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-50">Descargar de SUNAT</button>
        {estado?.estado === "descargando" && <button onClick={() => accion(() => fetchAuth(`${base}/estado`))} disabled={ocupado} className="border border-gray-300 px-4 py-2 rounded-lg text-sm">Actualizar estado</button>}
        <label className="border border-gray-300 text-gray-600 px-4 py-2 rounded-lg text-sm hover:bg-gray-50 cursor-pointer">
          Subir archivo<input type="file" accept=".zip,.txt,.xlsx" className="hidden" onChange={subir} disabled={ocupado} />
        </label>
        {estado?.cargaManual > 0 && estado.origen === "api" && (
          <button onClick={abrirComparacion} className="border border-amber-300 text-amber-700 px-4 py-2 rounded-lg text-sm hover:bg-amber-50">Comparar carga manual ({estado.cargaManual})</button>
        )}
        <button onClick={exportarExcel} disabled={!visibles.length} className="border border-gray-300 text-gray-600 px-4 py-2 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50">Exportar Excel</button>
        <button onClick={descargarPlantilla} disabled={ocupado} title="Excel con las columnas del SIRE para llenar y cargarlo con «Subir archivo»" className="border border-purple-300 text-purple-700 px-4 py-2 rounded-lg text-sm hover:bg-purple-50 disabled:opacity-50">Descargar plantilla</button>
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
              {visibles.length === 0 && <tr><td colSpan={10} className="px-3 py-8 text-center text-gray-400">Sin comprobantes para conciliar</td></tr>}
              {visibles.map((f) => {
                const d = f.sire || f.sistema;
                return (
                  <tr key={f.clave}>
                    <td className="px-3 py-2"><span className={`px-2 py-0.5 rounded-full text-xs ${RESULTADOS[f.estado].cls}`}>{RESULTADOS[f.estado].label}</span></td>
                    <td className="px-3 py-2">{d.rucContraparte}</td>
                    <td className="px-3 py-2">{d.razonSocial || "—"}</td>
                    <td className="px-3 py-2">{d.tipo} {d.serie}-{d.numero}
                      {f.diferencias.includes("ticketConRuc") && <span className="block text-[11px] text-amber-700">Registrado sin «Trae RUC de INTALES»: corrígelo para tomar el crédito fiscal</span>}
                    </td>
                    {CAMPOS.map((c) => celda(f, c))}
                    <td className="px-3 py-2 text-right">
                      {f.estado === "solo_sire" && libro === "RCE" && (
                        <button onClick={() => onRegistrarFactura({ precarga: f.sire })} className="text-xs text-purple-600 hover:text-purple-800">Registrar comprobante</button>
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
                  <td colSpan={3} />
                </tr>
              </tfoot>
            )}
          </table>
        </TablaScroll>
      </div>
    </div>
  );
}
