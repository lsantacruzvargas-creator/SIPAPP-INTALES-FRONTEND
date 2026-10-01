import { useState, useEffect } from "react";
import { fetchAuth } from "../../utils/fetchAuth";
import { fechaHoyLima } from "../../utils/fecha";
import { money } from "../../utils/compras";
import { filasExcelDiferenciaCambio } from "../../utils/tesoreria";
import { origenTC } from "../../utils/costos";
import { exportarHoja } from "../../utils/exportarTabla";
import TablaScroll from "../TablaScroll";

const INP = "border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300";
const PARTIDA = { porCobrar: "Por cobrar", porPagar: "Por pagar", cuenta: "Cuenta en dólares" };

// Ajuste por diferencia de cambio al cierre: lo pendiente en dólares reexpresado al TC SUNAT de
// la fecha (activos al TC compra, pasivos al TC venta). Solo informa; el asiento lo hará el motor contable.
export default function PanelDiferenciaCambio() {
  const [fecha, setFecha] = useState(fechaHoyLima());
  const [resultado, setResultado] = useState(null);
  const fechaValida = /^\d{4}-\d{2}-\d{2}$/.test(fecha) && fecha >= "2000-01-01";
  const cargando = fechaValida && resultado?.fecha !== fecha;
  const datos = resultado?.fecha === fecha ? resultado.datos : null;
  const error = resultado?.fecha === fecha ? resultado.error : "";

  useEffect(() => {
    if (!fechaValida) return undefined;
    let vigente = true;
    fetchAuth(`/tesoreria/diferencia-cambio?fecha=${fecha}`)
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        return r.ok ? { datos: d, error: "" } : { datos: null, error: d.mensaje || "No se pudo calcular la diferencia de cambio." };
      })
      .catch(() => ({ datos: null, error: "Error de conexión con el servidor." }))
      .then((res) => { if (vigente) setResultado({ fecha, ...res }); });
    return () => { vigente = false; };
  }, [fecha, fechaValida]);

  const partidas = datos?.partidas || [];
  const t = datos?.totales;
  const exportar = () => exportarHoja(`diferencia-cambio-${fecha}.xlsx`, "Diferencia de cambio", filasExcelDiferenciaCambio(partidas), [
    { PARTIDA: "GANANCIA (776)", "DIFERENCIA S/": t.ganancia },
    { PARTIDA: "PÉRDIDA (676)", "DIFERENCIA S/": -t.perdida },
    { PARTIDA: "NETO", "DIFERENCIA S/": t.neto },
  ]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-center">
        <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className={INP} aria-label="Fecha de cierre" />
        <button onClick={exportar} disabled={!partidas.length} className="border border-gray-300 text-gray-600 px-4 py-2 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50">Exportar a Excel</button>
        {cargando && <span className="text-xs text-gray-400">Calculando…</span>}
        {datos && (
          <span className="text-xs text-gray-500">
            TC compra {Number(datos.tcCompra).toFixed(3)} · venta {Number(datos.tcVenta).toFixed(3)} ({origenTC({ fuente: datos.fuenteTc, fechaTc: datos.fechaTc })})
          </span>
        )}
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      {t && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {[["Ganancia (776)", t.ganancia, "text-emerald-700"], ["Pérdida (676)", t.perdida, "text-red-600"], ["Neto", t.neto, "text-gray-800"]].map(([l, v, cls]) => (
            <div key={l} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
              <p className="text-xs font-semibold uppercase text-gray-500">{l}</p>
              <p className={`text-lg font-semibold tabular-nums ${cls}`}>{money(v)}</p>
            </div>
          ))}
        </div>
      )}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <TablaScroll className="overflow-x-auto">
          <table className="w-full text-sm" style={{ minWidth: "900px" }}>
            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
              <tr>{["Partida", "Detalle", "TC doc.", "Saldo US$", "Libros S/", "Al cierre S/", "Diferencia S/"].map((h) => <th key={h} className="px-3 py-2 text-left">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {!partidas.length && <tr><td colSpan={7} className="px-3 py-8 text-center text-gray-400">Sin saldos en dólares a esa fecha</td></tr>}
              {partidas.map((p, i) => (
                <tr key={`${p.tipo}-${p.documento?.id || p.cuenta?.id || i}`}>
                  <td className="px-3 py-2">{PARTIDA[p.tipo]}</td>
                  <td className="px-3 py-2">{p.cuenta ? p.cuenta.nombre : <>{p.documento?.numero}{p.documento?.tercero ? <span className="block text-[11px] text-gray-400">{p.documento.tercero}</span> : null}</>}</td>
                  <td className="px-3 py-2 tabular-nums">{p.tcDoc ? Number(p.tcDoc).toFixed(3) : "—"}</td>
                  <td className="px-3 py-2 tabular-nums">{money(p.saldoMe, "USD")}</td>
                  <td className="px-3 py-2 tabular-nums">{money(p.librosSoles)}</td>
                  <td className="px-3 py-2 tabular-nums">{money(p.cierreSoles)}</td>
                  <td className={`px-3 py-2 tabular-nums font-medium ${p.diferencia > 0 ? "text-emerald-700" : p.diferencia < 0 ? "text-red-600" : ""}`}>{money(p.diferencia)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TablaScroll>
      </div>
    </div>
  );
}
