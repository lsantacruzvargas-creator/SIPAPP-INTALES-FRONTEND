import { useState, useEffect } from "react";
import { fetchAuth } from "../../utils/fetchAuth";
import { fechaHoyLima, formatearFecha } from "../../utils/fecha";
import { money } from "../../utils/compras";
import { filasExcelResumen, TIPOS_COMPROBANTE_COMPRA } from "../../utils/tesoreria";
import { exportarHoja } from "../../utils/exportarTabla";
import TablaScroll from "../TablaScroll";

const INP = "border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300";
const tipoDe = (v) => TIPOS_COMPROBANTE_COMPRA.find((t) => t.valor === v)?.label || v;

function Tarjeta({ titulo, filas }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
      <p className="text-xs font-semibold uppercase text-gray-500 mb-2">{titulo}</p>
      {filas.map(([label, valor]) => (
        <div key={label} className="flex justify-between text-sm py-0.5">
          <span className="text-gray-500">{label}</span>
          <span className="tabular-nums font-medium text-gray-800">{money(valor)}</span>
        </div>
      ))}
    </div>
  );
}

// Comprobantes de compra del mes en soles: crédito fiscal (las NC restan), sin crédito y retención de 4ta.
export default function PanelResumenTributario() {
  const [mes, setMes] = useState(fechaHoyLima().slice(0, 7));
  // Resultado guardado con su mes: "cargando" es que aún no llegó el del mes elegido.
  const [resultado, setResultado] = useState(null);
  const mesValido = /^\d{4}-\d{2}$/.test(mes);
  const cargando = mesValido && resultado?.mes !== mes;
  const datos = resultado?.mes === mes ? resultado.datos : null;
  const error = resultado?.mes === mes ? resultado.error : "";

  useEffect(() => {
    if (!mesValido) return undefined;
    let vigente = true;
    fetchAuth(`/tesoreria/resumen-tributario?periodo=${mes}`)
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        return r.ok ? { datos: d, error: "" } : { datos: null, error: d.mensaje || "No se pudo cargar el resumen." };
      })
      .catch(() => ({ datos: null, error: "Error de conexión con el servidor." }))
      .then((res) => { if (vigente) setResultado({ mes, ...res }); });
    return () => { vigente = false; };
  }, [mes, mesValido]);

  const t = datos?.totales;
  const detalle = datos?.detalle || [];
  const retenciones = datos?.retenciones4ta || [];
  const exportar = () => exportarHoja(`resumen-tributario-${mes}.xlsx`, "Resumen tributario", filasExcelResumen(detalle), [
    { FECHA: "CON CRÉDITO FISCAL", "BASE S/": t.conCredito.base, "IGV S/": t.conCredito.igv, "TOTAL S/": t.conCredito.total },
    { FECHA: "SIN CRÉDITO FISCAL", "TOTAL S/": t.sinCredito.total },
    { FECHA: "4TA RETENIDA (MES DE PAGO)", "4TA DEL RECIBO S/": t.retencion4ta.retenido },
    { FECHA: "4TA PAGADA A SUNAT EN EL MES", "4TA DEL RECIBO S/": t.retencion4ta.pagado },
    { FECHA: "4TA PENDIENTE HOY", "4TA DEL RECIBO S/": t.retencion4ta.pendiente },
  ]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-center">
        <input type="month" value={mes} onChange={(e) => setMes(e.target.value)} className={INP} aria-label="Mes" />
        <button onClick={exportar} disabled={!detalle.length} className="border border-gray-300 text-gray-600 px-4 py-2 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50">Exportar a Excel</button>
        {cargando && <span className="text-xs text-gray-400">Cargando…</span>}
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      {t && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Tarjeta titulo="Con crédito fiscal" filas={[["Base imponible", t.conCredito.base], ["IGV", t.conCredito.igv], ["Total", t.conCredito.total]]} />
          <Tarjeta titulo="Sin crédito fiscal" filas={[["Total", t.sinCredito.total]]} />
          <Tarjeta titulo="Retención 4ta (por mes de pago)" filas={[["Retenido en el mes", t.retencion4ta.retenido], ["Pagado a SUNAT en el mes", t.retencion4ta.pagado], ["Pendiente hoy", t.retencion4ta.pendiente]]} />
        </div>
      )}
      {retenciones.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <p className="text-xs font-semibold uppercase text-gray-500 mb-2">Recibos por honorarios pagados en el mes (retención 4ta)</p>
          <table className="w-full text-sm">
            <tbody className="divide-y divide-gray-100">
              {retenciones.map((r) => (
                <tr key={r._id}>
                  <td className="py-1.5">{r.serie}-{r.numero}</td>
                  <td className="py-1.5">{r.proveedorRazonSocial} <span className="text-[11px] text-gray-400">{r.proveedorRuc}</span></td>
                  <td className="py-1.5 text-gray-500">pagado {formatearFecha(r.fechaPago)}</td>
                  <td className="py-1.5 tabular-nums text-right">retenido {money(r.retenido)}</td>
                  <td className="py-1.5 tabular-nums text-right text-amber-700">{r.pendiente > 0 ? `pendiente ${money(r.pendiente)}` : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <TablaScroll className="overflow-x-auto">
          <table className="w-full text-sm" style={{ minWidth: "1000px" }}>
            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
              <tr>{["Fecha", "Comprobante", "Proveedor", "Moneda", "TC", "Base S/", "IGV S/", "Total S/", "Crédito", "4ta del recibo S/"].map((h) => <th key={h} className="px-3 py-2 text-left">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {!detalle.length && <tr><td colSpan={10} className="px-3 py-8 text-center text-gray-400">Sin comprobantes de compra en el mes</td></tr>}
              {detalle.map((d) => (
                <tr key={d._id} className={d.totalSoles < 0 ? "text-red-700" : ""}>
                  <td className="px-3 py-2">{formatearFecha(d.fechaEmision)}</td>
                  <td className="px-3 py-2">{tipoDe(d.tipoComprobante)} {d.serie}-{d.numero}</td>
                  <td className="px-3 py-2">{d.proveedorRazonSocial}<span className="block text-[11px] text-gray-400">{d.proveedorRuc}</span></td>
                  <td className="px-3 py-2">{d.moneda}</td>
                  <td className="px-3 py-2 tabular-nums">{d.moneda === "USD" ? Number(d.tipoCambio).toFixed(3) : "—"}</td>
                  <td className="px-3 py-2 tabular-nums">{money(d.baseSoles)}</td>
                  <td className="px-3 py-2 tabular-nums">{money(d.igvSoles)}</td>
                  <td className="px-3 py-2 tabular-nums">{money(d.totalSoles)}</td>
                  <td className="px-3 py-2">{d.creditoFiscal ? "Sí" : "No"}</td>
                  <td className="px-3 py-2 tabular-nums">{d.retencion4ta ? money(d.retencion4ta) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TablaScroll>
      </div>
    </div>
  );
}
