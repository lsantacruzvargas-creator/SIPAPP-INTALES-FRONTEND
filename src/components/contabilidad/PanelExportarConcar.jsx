import { useState, useEffect, useCallback } from "react";
import { fetchAuth } from "../../utils/fetchAuth";
import { formatearFechaHora } from "../../utils/fecha";
import { mesAnteriorLima, periodoDeMes, textoPeriodo } from "../../utils/bancos";
import { libroConcar, nombreArchivoConcar } from "../../utils/concar";
import TablaScroll from "../TablaScroll";
import AvisoAccion from "../AvisoAccion";

const INP = "border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300";
const NOMBRES = { compras: "Compras", comprasDetraccion: "Compras con detracción", boletas: "Boletas", honorarios: "Honorarios", ventas: "Ventas", cajaBancos: "Caja y bancos" };

async function descargar(lote) {
  const blob = new Blob([await libroConcar(lote)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombreArchivoConcar(lote);
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

// Exportación al Excel de importación de CONCAR (C2): los asientos automáticos contabilizados del mes.
export default function PanelExportarConcar({ puedeEscribir }) {
  const [mes, setMes] = useState(mesAnteriorLima());
  const [soloNuevos, setSoloNuevos] = useState(true);
  const [iniciales, setIniciales] = useState({});
  const [subdiarios, setSubdiarios] = useState({});
  const [lotes, setLotes] = useState([]);
  const [procesando, setProcesando] = useState(false);
  const [aviso, setAviso] = useState("");
  const periodo = periodoDeMes(mes);

  const cargar = useCallback(async () => {
    if (!/^\d{6}$/.test(periodo)) return;
    try {
      const r = await fetchAuth(`/contabilidad/exportaciones?periodo=${periodo}`);
      const d = await r.json().catch(() => []);
      if (!r.ok) throw new Error(d.mensaje || "No se pudieron cargar las exportaciones.");
      setLotes(d);
    } catch (e) {
      setAviso(e.message || "Error de conexión con el servidor.");
    }
  }, [periodo]);
  useEffect(() => { const t = setTimeout(cargar, 200); return () => clearTimeout(t); }, [cargar]);
  useEffect(() => {
    fetchAuth("/contabilidad/configuracion").then(async (r) => { if (r.ok) setSubdiarios((await r.json()).config.subdiarios || {}); }).catch(() => {});
  }, []);

  const exportar = async () => {
    setProcesando(true);
    try {
      const r = await fetchAuth("/contabilidad/exportaciones", { method: "POST", body: JSON.stringify({ periodo, soloNuevos, numerosIniciales: iniciales }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) return setAviso(d.mensaje || "No se pudo exportar.");
      await descargar(d);
      setIniciales({});
      cargar();
    } catch {
      setAviso("Error de conexión con el servidor.");
    } finally {
      setProcesando(false);
    }
  };
  const volverADescargar = async (l) => {
    try {
      const r = await fetchAuth(`/contabilidad/exportaciones/${l._id}`);
      const d = await r.json().catch(() => ({}));
      if (!r.ok) return setAviso(d.mensaje || "No se pudo descargar.");
      await descargar(d);
    } catch {
      setAviso("Error de conexión con el servidor.");
    }
  };

  const codigos = [...new Set(Object.entries(subdiarios).filter(([k]) => NOMBRES[k]).map(([, v]) => v))].sort();
  return (
    <div className="space-y-5">
      <p className="text-sm text-gray-500">
        Excel de importación de CONCAR (41 columnas, hoja CONCAR) con los asientos automáticos <b>contabilizados</b> del
        mes. Un asiento exportado ya no se anula: se corrige con un asiento de ajuste. El número de comprobante (mes +
        correlativo) se pone por subdiario al exportar.
      </p>
      {puedeEscribir && (
        <div className="flex flex-wrap items-end gap-3 border border-gray-200 rounded-xl p-4">
          <div>
            <label className="text-xs text-gray-500 block">Periodo</label>
            <input type="month" value={mes} onChange={(e) => setMes(e.target.value)} className={INP} />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700 pb-2">
            <input type="checkbox" checked={soloNuevos} onChange={(e) => setSoloNuevos(e.target.checked)} />
            Solo los no exportados
          </label>
          {codigos.map((c) => (
            <div key={c}>
              <label className="text-xs text-gray-500 block">N.º inicial subd. {c}</label>
              <input type="number" min={1} max={9999} value={iniciales[c] ?? ""} placeholder="siguiente"
                onChange={(e) => setIniciales((s) => ({ ...s, [c]: e.target.value }))} className={`${INP} w-28`} />
            </div>
          ))}
          <button onClick={exportar} disabled={procesando} className="bg-purple-600 text-white px-3 py-2 rounded-lg text-sm hover:bg-purple-700 disabled:opacity-50">
            Exportar a CONCAR
          </button>
        </div>
      )}
      {!puedeEscribir && (
        <div>
          <label className="text-xs text-gray-500 block">Periodo</label>
          <input type="month" value={mes} onChange={(e) => setMes(e.target.value)} className={INP} />
        </div>
      )}
      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-gray-700">Exportaciones de {textoPeriodo(periodo)}</h3>
        <TablaScroll>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 border-b">
                <th className="py-2 pr-3">Código</th><th className="py-2 pr-3">Fecha</th><th className="py-2 pr-3">Asientos</th>
                <th className="py-2 pr-3">Alcance</th><th className="py-2 pr-3">Por</th><th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {lotes.map((l) => (
                <tr key={l._id} className="border-b border-gray-100">
                  <td className="py-1.5 pr-3 font-mono text-xs">{l.codigo}</td>
                  <td className="py-1.5 pr-3">{formatearFechaHora(l.createdAt)}</td>
                  <td className="py-1.5 pr-3">{l.cantidad}</td>
                  <td className="py-1.5 pr-3">{l.soloNuevos ? "Nuevos" : "Todo el mes"}</td>
                  <td className="py-1.5 pr-3">{l.creadoPor}</td>
                  <td className="py-1.5 text-right"><button onClick={() => volverADescargar(l)} className="text-xs text-purple-600 hover:underline">Descargar</button></td>
                </tr>
              ))}
              {!lotes.length && <tr><td colSpan={6} className="py-4 text-center text-gray-400 text-sm">Sin exportaciones en el periodo</td></tr>}
            </tbody>
          </table>
        </TablaScroll>
      </section>
      {aviso && <AvisoAccion mensaje={aviso} onCerrar={() => setAviso("")} />}
    </div>
  );
}
