// Estado de una compra (ítem de solicitud de compra o servicio externo) tal como lo muestra Compras. «Recepcionado» es
// una marca aparte: `estadoPago` se queda en "pagado" para no sacar la compra del costo por OT.
export const ESTADO_COMPRA = {
  por_procesar:   { clase: "bg-gray-100 text-gray-600",   label: "Por procesar" },
  pendiente_pago: { clase: "bg-amber-100 text-amber-700", label: "Pendiente de pago" },
  pagado:         { clase: "bg-green-100 text-green-700", label: "Pagado" },
  recepcionado:   { clase: "bg-sky-100 text-sky-700",     label: "Recepcionado" },
};

export const estadoCompra = (x) =>
  ESTADO_COMPRA[x.recepcionado ? "recepcionado" : x.estadoPago || "por_procesar"] || ESTADO_COMPRA.por_procesar;
