// Espejo de Backend/src/middleware/roles.js: quién ve facturas de venta y comprobantes electrónicos.
export const ROLES_FINANZAS = ["admin", "jefatura", "facturacion", "tesorero", "contador"];
export const veFacturas = (rol) => ROLES_FINANZAS.includes(rol);
// Crear/editar facturas de venta y su impuesto (tesorero y contador solo ven).
export const puedeEditarFacturas = (rol) => ["admin", "jefatura", "facturacion"].includes(rol);
// Espejo de ROLES_MOVIMIENTO_MANUAL (Backend/src/middleware/puedeTesoreria.js): ingresos/egresos
// manuales y transferencias entre cuentas; el contador solo lee.
export const puedeMovimientoManual = (rol) => ["admin", "jefatura", "tesorero"].includes(rol);
export const rolDeSesion = () => {
  try { return JSON.parse(sessionStorage.getItem("usuario") || "{}")?.rol; } catch { return undefined; }
};
