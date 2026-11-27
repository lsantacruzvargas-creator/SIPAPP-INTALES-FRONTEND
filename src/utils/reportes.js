export const TH = "px-4 py-3 font-semibold text-gray-500 whitespace-nowrap";
export const INP = "border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300";
export const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// Un error no se convierte en lista vacía: la pantalla y el Excel lo mostrarían como «Sin datos».
export const json = (r) => (r.ok ? r.json() : r.json().catch(() => ({})).then((d) => Promise.reject(new Error(d.mensaje || String(r.status)))));

// Evita que un texto escrito por el usuario se ejecute como fórmula en Excel.
export const celda = (v) => (typeof v === "string" && /^[=+\-@]/.test(v) ? `'${v}` : v);

// Soles y dólares nunca se suman entre sí: cada subtotal lleva las dos monedas.
export function sumaPorMoneda(filas, monto = (f) => f.monto, moneda = (f) => f.moneda) {
  return filas.reduce((acc, f) => {
    const m = moneda(f) === "USD" ? "USD" : "PEN";
    acc[m] = r2(acc[m] + (Number(monto(f)) || 0));
    return acc;
  }, { PEN: 0, USD: 0 });
}

export const enMoneda = (f, m, monto = f.monto) => ((f.moneda === "USD" ? "USD" : "PEN") === m ? monto : null);

// "YYYY-MM-DD" ± n días. Aritmética de calendario sobre medianoche UTC: no depende del huso.
export const sumarDias = (iso, n) => new Date(Date.parse(iso) + n * 86400000).toISOString().slice(0, 10);
export const ddmmaaaa = (iso) => (iso ? iso.split("-").reverse().join("/") : "");
