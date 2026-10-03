// Lógica pura de Bancos (espejo de Backend/src/utils/bancos.js, spec 2026-10-02-bancos-b7).
import { round2 } from "./compras.js";
import { etiquetaConceptoManual } from "./tesoreria.js";

// +1 entra a la cuenta, −1 sale, 0 no la toca.
export function signo(mov, cuentaId) {
  const id = String(cuentaId);
  const origen = String(mov.cuenta?._id || mov.cuenta || "");
  const destino = String(mov.cuentaDestino?._id || mov.cuentaDestino || "");
  if (mov.tipo === "transferencia") return destino === id ? 1 : origen === id ? -1 : 0;
  if (origen !== id) return 0;
  return mov.tipo === "ingreso" ? 1 : mov.tipo === "egreso" ? -1 : 0;
}

// Resumen en vivo de la conciliación con lo marcado en pantalla (mismas fórmulas que el servidor).
export function resumenConciliacion({ pendientes, marcados, saldoExtracto, saldoLibros }) {
  const set = new Set(marcados.map(String));
  let ingresosTransito = 0, egresosTransito = 0;
  for (const m of pendientes) {
    if (set.has(String(m._id))) continue;
    ingresosTransito += m.entrada || 0;
    egresosTransito += m.salida || 0;
  }
  ingresosTransito = round2(ingresosTransito);
  egresosTransito = round2(egresosTransito);
  const extracto = saldoExtracto === "" || saldoExtracto == null ? null : Number(saldoExtracto);
  const saldoConciliado = extracto == null || Number.isNaN(extracto) ? null : round2(extracto + ingresosTransito - egresosTransito);
  const diferencia = saldoConciliado == null ? null : round2(saldoLibros - saldoConciliado);
  return { ingresosTransito, egresosTransito, saldoConciliado, diferencia, cuadra: diferencia !== null && Math.abs(diferencia) < 0.005 };
}

// "202609" ↔ "2026-09" (input type="month").
export const periodoDeMes = (mes) => String(mes || "").replace("-", "");
export const mesDePeriodo = (p) => (p ? `${p.slice(0, 4)}-${p.slice(4)}` : "");
export const textoPeriodo = (p) => (p ? `${p.slice(4)}/${p.slice(0, 4)}` : "");

// Mes anterior al actual en Lima (lo usual al conciliar): "AAAA-MM".
export function mesAnteriorLima(hoy = new Date()) {
  const [y, m] = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" }).format(hoy).split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

// Descripción de un movimiento en el libro de bancos y en la conciliación (incluye la fila del saldo inicial).
export function descripcionMovimiento(m) {
  if (m.saldoInicial) return "Saldo inicial";
  const extra = m.descripcion ? ` — ${m.descripcion}` : "";
  if (m.conceptoManual === "transferencia") return `Transferencia ${m.cuenta?.nombre || ""} → ${m.cuentaDestino?.nombre || ""}${extra}`;
  if (m.conceptoManual) return `${etiquetaConceptoManual(m.conceptoManual)}${extra}`;
  if (m.concepto === "caja_chica") return `Gasto de caja chica${extra}`;
  return `${m.concepto === "neto" ? "Neto" : "Impuesto"} de ${m.documento?.tipo === "facturaVenta" ? "factura de venta" : "comprobante de compra"}`;
}
