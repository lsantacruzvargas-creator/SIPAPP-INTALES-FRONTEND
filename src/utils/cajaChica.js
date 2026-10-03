// Lógica pura de Caja chica (espejo de Backend/src/utils/cajaChica.js, spec 2026-10-02-caja-chica).
export const TIPOS_GASTO = [
  { valor: "03", label: "Boleta" }, { valor: "12", label: "Ticket" }, { valor: "01", label: "Factura (sin crédito fiscal)" },
  { valor: "02", label: "Recibo por honorarios" }, { valor: "MV", label: "Planilla de movilidad" }, { valor: "VS", label: "Vale sin comprobante" },
];
export const etiquetaTipo = (v) => TIPOS_GASTO.find((t) => t.valor === v)?.label?.replace(" (sin crédito fiscal)", "") || v || "";
export const conComprobante = (tipo) => ["01", "02", "03", "12"].includes(tipo);

// Errores del formulario de gasto antes de enviarlo (el servidor valida lo mismo y más).
export function erroresGasto(g, { tope = 0, saldo = Infinity } = {}) {
  const e = [];
  const monto = Number(g.monto);
  if (!(monto > 0)) e.push("El monto debe ser mayor a 0");
  else {
    if (tope > 0 && monto > tope) e.push(`Supera el tope por gasto (S/ ${tope.toFixed(2)})`);
    if (monto > saldo) e.push(`La caja no tiene saldo suficiente (S/ ${saldo.toFixed(2)})`);
  }
  if (!String(g.descripcion || "").trim()) e.push("Describe el gasto");
  if (conComprobante(g.tipoComprobante) && (!String(g.serie || "").trim() || !String(g.numero || "").trim())) e.push("Indica la serie y el número");
  const doc = String(g.numDoc || "").trim();
  if (doc && !/^(\d{8}|\d{11})$/.test(doc)) e.push("El documento del proveedor es un RUC (11) o DNI (8)");
  if (["01", "02"].includes(g.tipoComprobante) && doc.length !== 11) e.push("Factura y recibo por honorarios exigen el RUC");
  if (g.tipoComprobante === "MV" && !String(g.trabajador || "").trim()) e.push("Indica el trabajador de la movilidad");
  return e;
}
