import { useState, useEffect, useCallback } from "react";
import { fetchAuth, uploadAuth } from "../../utils/fetchAuth";
import { fechaHoyLima, formatearFechaHora } from "../../utils/fecha";
import { money } from "../../utils/compras";
import { periodoDeMes, fechaIsoTexto } from "../../utils/tesoreria";
import TablaScroll from "../TablaScroll";

const INP = "border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300";
const RESULTADOS = {
  coincide: { label: "Coincide", cls: "bg-emerald-50 text-emerald-700" },
  difiere: { label: "Difiere", cls: "bg-amber-50 text-amber-700" },
  solo_sire: { label: "Solo en SIRE", cls: "bg-red-50 text-red-700" },
  solo_sistema: { label: "Solo en el sistema", cls: "bg-blue-50 text-blue-700" },
};
const CAMPOS = [["fecha", "fechaEmision"], ["total", "total"], ["igv", "igv"], ["moneda", "moneda"]];

export default function PanelSire({ onRegistrarFactura }) {
  const [libro, setLibro] = useState("RCE");
  const [mes, setMes] = useState(fechaHoyLima().slice(0, 7));
  const [estado, setEstado] = useState(null);
  const [filas, setFilas] = useState([]);
  const [filtro, setFiltro] = useState("");
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

  const accion = async (fn) => {
    setOcupado(true);
    setError("");
    const r = await fn();
    if (!r.ok) setError((await r.json().catch(() => ({}))).mensaje || "La operación con el SIRE falló.");
    await cargar();
    setOcupado(false);
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

  const visibles = filas.filter((f) => !filtro || f.estado === filtro);
  const conteo = (e) => filas.filter((f) => f.estado === e).length;
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
        <select value={libro} onChange={(e) => setLibro(e.target.value)} className={INP}>
          <option value="RCE">Compras (RCE)</option><option value="RVIE">Ventas (RVIE)</option>
        </select>
        <input type="month" value={mes} onChange={(e) => setMes(e.target.value)} className={INP} />
        <button onClick={descargar} disabled={ocupado} className="bg-purple-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-50">Descargar de SUNAT</button>
        {estado?.estado === "descargando" && <button onClick={() => accion(() => fetchAuth(`${base}/estado`))} disabled={ocupado} className="border border-gray-300 px-4 py-2 rounded-lg text-sm">Actualizar estado</button>}
        <label className="border border-gray-300 text-gray-600 px-4 py-2 rounded-lg text-sm hover:bg-gray-50 cursor-pointer">
          Subir archivo<input type="file" accept=".zip,.txt" className="hidden" onChange={subir} disabled={ocupado} />
        </label>
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
              <tr>{["Resultado", "RUC", "Razón social", "Comprobante", "Fecha", "Total", "IGV", "Moneda", ""].map((h) => <th key={h} className="px-3 py-2 text-left">{h}</th>)}</tr>
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
          </table>
        </TablaScroll>
      </div>
    </div>
  );
}
