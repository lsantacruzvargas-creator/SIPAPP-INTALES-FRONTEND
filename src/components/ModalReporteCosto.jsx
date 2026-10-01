import SelectorMonedaTC from "./SelectorMonedaTC";
import { costoEn } from "../utils/costos";

const money = (v, moneda) => `${moneda === "USD" ? "US$" : "S/"} ${Number(v ?? 0).toLocaleString("es-PE", { minimumFractionDigits: 2 })}`;

// Componente a nivel de módulo (no dentro del render de ModalReporteCosto) —
// crear un componente por render reinicia su estado y dispara
// react-hooks/static-components.
function Fila({ label, valor, moneda, resaltado }) {
  return (
    <div className={`flex items-center justify-between py-2 ${resaltado ? "font-semibold text-gray-800" : "text-gray-600"}`}>
      <span className="text-sm">{label}</span>
      <span className="text-sm tabular-nums">{money(valor, moneda)}</span>
    </div>
  );
}

// Desglose de solo lectura de la tarjeta "Costo de fabricación" de la OC del
// cliente (spec 2026-09-30): consumido (pagado + HH/HM) y comprometido (comprado
// y aún no pagado), calculados por el servidor en soles y mostrados en la moneda
// y al TC de la fecha que se elija.
export default function ModalReporteCosto({ costos, orden, vista, onCambioVista, onClose }) {
  const moneda = vista.moneda === "USD" && !vista.tc ? "PEN" : vista.moneda;
  const c = costos
    ? costoEn({ ...costos, ocSubtotal: Number(orden.subtotal ?? orden.monto) || 0, ocMoneda: orden.moneda || "PEN" }, moneda, vista.tc)
    : null;
  const margenPct = c?.margen != null && c.ocSubtotal > 0 ? (c.margen / c.ocSubtotal) * 100 : null;
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-800">Costo de fabricación</h3>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl leading-none">✕</button>
        </div>

        <div className="p-6 overflow-y-auto">
          <div className="mb-4">
            <SelectorMonedaTC moneda={vista.moneda} fecha={vista.fecha} onCambio={onCambioVista} />
          </div>
          {!c ? (
            <p className="text-sm text-gray-400">Calculando…</p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 mb-5">
                <div className="rounded-xl bg-gray-50 border border-gray-100 p-3 text-center">
                  <p className="text-[10px] text-gray-400 uppercase tracking-wide">Subtotal sin IGV (OC)</p>
                  <p className="text-lg font-bold text-gray-800">{c.ocSubtotal != null ? money(c.ocSubtotal, moneda) : "—"}</p>
                </div>
                <div className="rounded-xl bg-gray-50 border border-gray-100 p-3 text-center">
                  <p className="text-[10px] text-gray-400 uppercase tracking-wide">Costo total</p>
                  <p className="text-lg font-bold text-gray-800">{money(c.costoTotal, moneda)}</p>
                </div>
              </div>

              <p className="text-xs font-semibold text-emerald-700 uppercase tracking-wide mb-1">Consumido (pagado)</p>
              <div className="divide-y divide-gray-50 mb-2">
                <Fila label="Horas hombre (HH)" valor={c.consumido.hh} moneda={moneda} />
                <Fila label="Horas máquina (HM)" valor={c.consumido.hm} moneda={moneda} />
                <Fila label="Materiales" valor={c.consumido.materiales} moneda={moneda} />
                <Fila label="Servicios externos" valor={c.consumido.servicios} moneda={moneda} />
                <Fila label="Flete" valor={c.consumido.flete} moneda={moneda} />
                <Fila label="Otros gastos" valor={c.consumido.otros} moneda={moneda} />
                <Fila label="Total consumido" valor={c.consumido.total} moneda={moneda} resaltado />
              </div>

              <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-1 mt-4">Comprometido (por pagar)</p>
              <div className="divide-y divide-gray-50 mb-3">
                <Fila label="Materiales" valor={c.comprometido.materiales} moneda={moneda} />
                <Fila label="Servicios externos" valor={c.comprometido.servicios} moneda={moneda} />
                <Fila label="Flete" valor={c.comprometido.flete} moneda={moneda} />
                <Fila label="Otros gastos" valor={c.comprometido.otros} moneda={moneda} />
                <Fila label="Total comprometido" valor={c.comprometido.total} moneda={moneda} resaltado />
              </div>

              <div className={`mt-4 rounded-xl p-4 text-center ${c.margen == null ? "bg-gray-50" : c.margen >= 0 ? "bg-green-50" : "bg-red-50"}`}>
                <p className="text-xs text-gray-500 uppercase tracking-wide">Margen</p>
                <p className={`text-2xl font-extrabold ${c.margen == null ? "text-gray-400" : c.margen >= 0 ? "text-green-700" : "text-red-700"}`}>
                  {c.margen != null ? money(c.margen, moneda) : "—"}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {margenPct != null ? `${margenPct.toFixed(1)}%` : "Sin tipo de cambio para comparar"}
                </p>
              </div>
            </>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex justify-end">
          <button type="button" onClick={onClose}
            className="text-sm border border-gray-300 px-4 py-2 rounded-lg hover:bg-gray-50 transition">
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
