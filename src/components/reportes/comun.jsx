import { money } from "../detalleShared";

export function CeldaMonto({ valor, moneda, className = "" }) {
  return (
    <td className={`px-4 py-2.5 text-right tabular-nums whitespace-nowrap ${className}`}>
      {valor == null ? <span className="text-gray-300">—</span> : money(valor, moneda)}
    </td>
  );
}

// Fila de subtotal/total: `columnas` celdas de texto (la etiqueta va en la última) y luego S/ y US$.
export function FilaSubtotal({ etiqueta, suma, columnas, total = false, despues = 0 }) {
  return (
    <tr className={total ? "bg-gray-100 border-t-2 border-gray-300 font-bold" : "bg-gray-50 font-semibold"}>
      <td colSpan={columnas} className="px-4 py-2.5 text-right text-xs uppercase tracking-wide text-gray-600">{etiqueta}</td>
      <CeldaMonto valor={suma.PEN} moneda="PEN" className="text-gray-900" />
      <CeldaMonto valor={suma.USD} moneda="USD" className="text-gray-900" />
      {despues > 0 && <td colSpan={despues} />}
    </tr>
  );
}

export function Tarjeta({ titulo, suma, acento = "text-gray-900" }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-5 py-4 min-w-[200px]">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">{titulo}</p>
      <p className={`text-xl font-bold tabular-nums ${acento}`}>{money(suma.PEN)}</p>
      {suma.USD > 0 && <p className={`text-sm font-semibold tabular-nums ${acento}`}>{money(suma.USD, "USD")}</p>}
    </div>
  );
}

export function ErrorCarga({ mensaje, onReintentar }) {
  return (
    <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 inline-flex items-center gap-3">
      {mensaje}
      <button onClick={onReintentar} className="underline hover:text-red-900">Reintentar</button>
    </p>
  );
}
