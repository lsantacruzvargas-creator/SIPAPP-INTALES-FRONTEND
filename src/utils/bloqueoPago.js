// `bloqueadoPorPago` lo calcula el backend (utils/bloqueos.js) sin mirar el rol: documento pagado, o de
// una cadena cerrada en lo histórico. Jefatura conserva su excepción, salvo los montos de lo facturado.
export const bloqueadoPorPago = (doc, rol) => !!doc?.bloqueadoPorPago && !["jefatura", "coordinadora"].includes(rol);

// Si alguna respuesta llega sin `bloqueadoPorPago` ni `bloqueo`, se conserva lo que ya se tenía en vez
// de pisarlo con undefined (y dejar editable lo que no lo es).
export const fusionarBloqueo = (previo, nuevo) => ({
  ...nuevo,
  bloqueadoPorPago: nuevo?.bloqueadoPorPago ?? previo?.bloqueadoPorPago,
  bloqueo: nuevo?.bloqueo ?? previo?.bloqueo,
});
