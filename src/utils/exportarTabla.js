import * as XLSX from "xlsx";
import { money, round2 } from "./compras.js";

// Suma `monto(item)` agrupando por moneda: { PEN: 10, USD: 5 }. Nunca mezcla soles con dólares.
export function sumarPorMoneda(items, monto, moneda = () => "PEN") {
  return items.reduce((t, it) => {
    const m = moneda(it) || "PEN";
    t[m] = round2((t[m] || 0) + Number(monto(it) || 0));
    return t;
  }, {});
}

// "S/ 10.00 · US$ 5.00" (o S/ 0.00 si no hay filas).
export const textoMontos = (porMoneda) => {
  const e = Object.entries(porMoneda);
  return e.length ? e.map(([m, v]) => money(v, m)).join(" · ") : money(0);
};

// Descarga un .xlsx con `filas` (objetos) y, debajo, las filas de subtotales ya armadas.
export function exportarHoja(archivo, hoja, filas, subtotales = []) {
  const ws = XLSX.utils.json_to_sheet(filas);
  if (subtotales.length) XLSX.utils.sheet_add_json(ws, subtotales, { skipHeader: true, origin: -1 });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, hoja);
  XLSX.writeFile(wb, archivo);
}

// Fila de subtotales por moneda: { [primeraColumna]: "SUBTOTAL (PEN)", [col]: suma, … }.
export function filasSubtotal(primeraColumna, columnas) {
  const monedas = [...new Set(Object.values(columnas).flatMap((p) => Object.keys(p)))];
  return monedas.map((m) => ({
    [primeraColumna]: `SUBTOTAL (${m})`,
    ...Object.fromEntries(Object.entries(columnas).map(([col, p]) => [col, p[m] ?? 0])),
  }));
}
