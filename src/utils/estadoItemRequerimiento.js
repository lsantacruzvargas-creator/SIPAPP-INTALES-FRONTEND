// Estado de un ítem de requerimiento en las tablas de la OT y sub-OT. Una compra que pasó a Compras trae
// `compra` (GET /requerimientos: estado de la SC, la licitación y el pago de la OCP); una compra heredada
// de comprabasico solo tiene estadoPago/recepcionado/anulado; un ítem de stock sigue el despacho de almacén.
const COMPRA = {
  por_procesar:   { clase: "bg-gray-100 text-gray-600",     label: "Por procesar" },
  en_licitacion:  { clase: "bg-purple-100 text-purple-700", label: "En licitación" },
  pendiente_pago: { clase: "bg-amber-100 text-amber-700",   label: "Pendiente de pago" },
  pago_parcial:   { clase: "bg-orange-100 text-orange-700", label: "Pago parcial" },
  pagado:         { clase: "bg-green-100 text-green-700",   label: "Pagado" },
  recepcionado:   { clase: "bg-teal-100 text-teal-700",     label: "Recepcionado" },
  anulado:        { clase: "bg-red-100 text-red-600",       label: "Anulado" },
};
const STOCK = {
  pendiente: { clase: "bg-blue-100 text-blue-700",  label: "Pendiente" },
  atendido:  { clase: "bg-green-100 text-green-700", label: "Atendido" },
  rechazado: { clase: "bg-red-100 text-red-700",     label: "Rechazado" },
};

export function estadoItem(it) {
  if (!it.esSolicitudCompra) return STOCK[it.estado] || { clase: "bg-gray-100 text-gray-500", label: it.estado || "—" };
  const c = it.compra;
  const clave = c ? c.estado
    : it.anulado ? "anulado"
      : it.recepcionado ? "recepcionado"
        : it.estadoPago || "por_procesar";
  const detalle = c ? [c.sc, c.licitacion, c.ocp].filter(Boolean).join(" · ") : "";
  return { ...(COMPRA[clave] || COMPRA.por_procesar), detalle };
}
