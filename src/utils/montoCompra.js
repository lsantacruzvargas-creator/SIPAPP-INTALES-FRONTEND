// Misma conversión que Backend/src/utils/monedaCompra.js: una compra en USD guarda el TC con el que se procesó.
export const simboloMoneda = (moneda) => (moneda === "USD" ? "US$" : "S/");

export const costoCompraSoles = ({ unitario, cantidad, flete, moneda, tipoCambio }) => {
  const total = (Number(unitario) || 0) * (Number(cantidad) || 0) + (Number(flete) || 0);
  return moneda === "USD" ? total * (Number(tipoCambio) || 0) : total;
};
