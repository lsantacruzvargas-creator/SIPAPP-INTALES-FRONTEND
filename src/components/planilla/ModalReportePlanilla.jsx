import { useState } from "react";
import * as XLSX from "xlsx";
import { money } from "../../utils/compras";
import { COLUMNAS_REPORTE, filasReportePlanilla, libroReporte, libroRecord, tituloMes } from "../../utils/reportePlanilla";
import { generarReportePlanillaPdf } from "../../utils/reportePlanillaPdf";

const BTN = "border border-gray-300 text-gray-700 px-3 py-1.5 rounded-lg text-sm hover:bg-gray-50";

const celda = (c, v) => (c.soles ? money(v) : v);

const GRUPOS = COLUMNAS_REPORTE.reduce((acc, c) => {
  const ultimo = acc.at(-1);
  if (ultimo?.grupo === c.grupo) ultimo.span += 1; else acc.push({ grupo: c.grupo, span: 1 });
  return acc;
}, []);

// Reporte mensual de planilla: asistencia, horas, tardanza y totales por trabajador, con Excel en masa o por persona y PDF.
export default function ModalReportePlanilla({ boletas, contexto, onClose }) {
  const [error, setError] = useState("");
  const { filas, totales } = filasReportePlanilla(boletas);
  const { periodo, cerrada, empleador } = contexto;

  const ejecutar = (fn) => {
    setError("");
    try { fn(); } catch (e) {
      console.error(e);
      setError("No se pudo generar el archivo. Vuelve a intentarlo.");
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-white">
      <div className="flex flex-wrap items-center gap-3 border-b px-5 py-3">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-gray-800">Reporte de planilla – {tituloMes(periodo)}</h3>
          <p className="text-xs text-gray-500">
            {empleador?.razonSocial || ""}{empleador?.ruc ? ` · RUC ${empleador.ruc}` : ""} ·{" "}
            <span className={cerrada ? "text-green-700" : "text-amber-700"}>{cerrada ? "Cerrada" : "En borrador"}</span> · {boletas.length} trabajadores
          </p>
        </div>
        <button onClick={() => ejecutar(() => XLSX.writeFile(libroReporte(boletas, contexto), `reporte-planilla-${periodo}.xlsx`))} className={BTN}>Excel</button>
        <button onClick={() => ejecutar(() => generarReportePlanillaPdf(boletas, contexto))} className={BTN}>PDF</button>
        <button onClick={onClose} className={BTN}>Cerrar</button>
      </div>
      {error && <p className="text-sm text-red-700 bg-red-50 border-b border-red-200 px-5 py-2">{error}</p>}

      <div className="flex-1 overflow-auto p-5">
        <div className="overflow-x-auto">
          <table className="w-full text-xs whitespace-nowrap">
            <thead>
              <tr className="text-gray-500">
                {GRUPOS.map((g) => <th key={g.grupo} colSpan={g.span} className="py-1 px-2 text-center font-bold uppercase border-b border-l border-gray-200 first:border-l-0">{g.grupo}</th>)}
                <th />
              </tr>
              <tr className="text-left text-gray-500 border-b">
                {COLUMNAS_REPORTE.map((c) => <th key={c.clave} className={`py-2 px-2 whitespace-normal align-bottom ${c.numero ? "text-right" : ""}`}>{c.titulo}</th>)}
                <th />
              </tr>
            </thead>
            <tbody>
              {filas.map((f, i) => (
                <tr key={boletas[i]._id || i} className="border-b border-gray-100">
                  {COLUMNAS_REPORTE.map((c) => <td key={c.clave} className={`py-1.5 px-2 ${c.numero ? "text-right tabular-nums" : ""}`}>{celda(c, f[c.clave])}</td>)}
                  <td className="py-1.5 px-2 text-right">
                    <button onClick={() => ejecutar(() => XLSX.writeFile(libroRecord(boletas[i], contexto), `record-${f.documento || "trabajador"}-${periodo}.xlsx`))}
                      className="text-xs text-purple-600 hover:underline">Excel</button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="font-semibold text-gray-700 border-t-2">
                {COLUMNAS_REPORTE.map((c) => (
                  <td key={c.clave} className={`py-2 px-2 ${c.numero ? "text-right tabular-nums" : ""}`}>{c.clave === "documento" ? "TOTAL" : c.numero ? celda(c, totales[c.clave]) : ""}</td>
                ))}
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}
