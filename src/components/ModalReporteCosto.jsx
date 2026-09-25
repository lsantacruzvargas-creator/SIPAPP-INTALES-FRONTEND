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

// Desglose de solo lectura del card "Costo de fabricación" en
// DetalleOrdenCompra.jsx — recibe los números ya calculados ahí (ver spec
// 2026-09-22, sección "Reporte por OT — cálculo"; movido de OT a OC a
// pedido del usuario, 2026-09-22).
export default function ModalReporteCosto({
  moneda, ocSubtotal, costoHH, costoHM, costoMateriales, costoServicios,
  costoFabricacion, margen, margenPct, onClose,
}) {
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-800">Costo de fabricación</h3>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl leading-none">✕</button>
        </div>

        <div className="p-6">
          {/* Comparación principal: Subtotal sin IGV de la OC vs el costo de
              fabricación — lo que pide el título del modal. */}
          <div className="grid grid-cols-2 gap-3 mb-5">
            <div className="rounded-xl bg-gray-50 border border-gray-100 p-3 text-center">
              <p className="text-[10px] text-gray-400 uppercase tracking-wide">Subtotal sin IGV (OC)</p>
              <p className="text-lg font-bold text-gray-800">{money(ocSubtotal, moneda)}</p>
            </div>
            <div className="rounded-xl bg-gray-50 border border-gray-100 p-3 text-center">
              <p className="text-[10px] text-gray-400 uppercase tracking-wide">Costo de fabricación</p>
              <p className="text-lg font-bold text-gray-800">{money(costoFabricacion, moneda)}</p>
            </div>
          </div>

          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Costo de fabricación:</p>
          <div className="divide-y divide-gray-50 mb-3">
            <Fila label="Compras de materiales (pagadas)" valor={costoMateriales} moneda={moneda} />
            <Fila label="Servicios externos (pagados)" valor={costoServicios} moneda={moneda} />
            <Fila label="Horas hombre (HH)" valor={costoHH} moneda={moneda} />
            <Fila label="Horas máquina (HM)" valor={costoHM} moneda={moneda} />
          </div>
          <div className="border-t border-gray-200 pt-2">
            <Fila label="Total costo de fabricación" valor={costoFabricacion} moneda={moneda} resaltado />
          </div>

          <div className={`mt-4 rounded-xl p-4 text-center ${margen >= 0 ? "bg-green-50" : "bg-red-50"}`}>
            <p className="text-xs text-gray-500 uppercase tracking-wide">Margen</p>
            <p className={`text-2xl font-extrabold ${margen >= 0 ? "text-green-700" : "text-red-700"}`}>
              {money(margen, moneda)}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">
              {margenPct != null ? `${margenPct.toFixed(1)}%` : "Sin OC para comparar"}
            </p>
          </div>
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
