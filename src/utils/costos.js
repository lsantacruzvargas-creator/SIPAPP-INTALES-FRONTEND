const r2 = (n) => Math.round(n * 100) / 100;

export function convertir(monto, de, a, tc) {
  if (monto == null) return monto;
  if (de === a || !(tc > 0)) return monto;
  return r2(de === "PEN" ? monto / tc : monto * tc);
}

const mapa = (o, f) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, f(v)]));

// Costo de fabricación (S/) y OC del cliente (su moneda) llevados a la moneda elegida
// con el TC de una fecha; el margen se calcula ya en la misma moneda.
export function costoEn(c, moneda, tc) {
  const desdeSoles = (v) => convertir(v, "PEN", moneda, tc);
  const comprometido = mapa(c.comprometido, desdeSoles);
  const consumido = mapa(c.consumido, desdeSoles);
  const costoTotal = desdeSoles(c.costoTotal);
  const ocMoneda = c.ocMoneda || "PEN";
  const sinTC = ocMoneda !== moneda && !(tc > 0);
  const ocSubtotal = c.ocSubtotal == null || sinTC ? null : convertir(c.ocSubtotal, ocMoneda, moneda, tc);
  return { ...c, moneda, comprometido, consumido, costoTotal, ocSubtotal, margen: ocSubtotal == null ? null : r2(ocSubtotal - costoTotal) };
}

// Filas del reporte "Costos de fabricación" (tabla y Excel) sobre filas ya convertidas:
// comprometido = comprado y aún no pagado; consumido = pagado por Tesorería + HH/HM.
export const filaResumenCosto = (c, nombreEmpresa, tc) => ({
  "N° OT": c.numeroOT,
  "N° Orden de Compra": c.numeroOrdenCompra || "—",
  "Titulo": c.titulo,
  "Empresa": nombreEmpresa(c.empresa),
  "Moneda": c.moneda,
  "TC": c.moneda === "USD" ? tc : "",
  "OC sin IGV": c.ocSubtotal ?? "—",
  "Comprometido": c.comprometido.total,
  "Consumido": c.consumido.total,
  "Costo total": c.costoTotal,
  "Margen": c.margen ?? "—",
});

export const filaComprometido = (c) => ({
  "N° OT": c.numeroOT,
  "Moneda": c.moneda,
  "Materiales": c.comprometido.materiales,
  "Servicios": c.comprometido.servicios,
  "Flete": c.comprometido.flete,
  "Otros": c.comprometido.otros,
  "Total comprometido": c.comprometido.total,
});

export const filaConsumido = (c) => ({
  "N° OT": c.numeroOT,
  "Moneda": c.moneda,
  "HH": c.consumido.hh,
  "HM": c.consumido.hm,
  "Materiales": c.consumido.materiales,
  "Servicios": c.consumido.servicios,
  "Flete": c.consumido.flete,
  "Otros": c.consumido.otros,
  "Total consumido": c.consumido.total,
});

// GET /sunat/tipo-cambio responde 200 aunque apiperu falle (fuente "respaldo" o
// "vigente"): solo "apiperu" y "bd" son el TC SUNAT publicado para esa fecha.
export const esTcSunat = (d) => d?.fuente === "apiperu" || d?.fuente === "bd";

const diaMes = (f) => (/^\d{4}-\d{2}-\d{2}/.test(f || "") ? `${f.slice(8, 10)}/${f.slice(5, 7)}` : "");

// "SUNAT 29/09", "último guardado 26/09" o "TC vigente del sistema".
export function origenTC(d) {
  if (d?.fuente === "vigente") return "TC vigente del sistema";
  return `${d?.fuente === "respaldo" ? "último guardado" : "SUNAT"} ${diaMes(d?.fecha)}`.trim();
}
