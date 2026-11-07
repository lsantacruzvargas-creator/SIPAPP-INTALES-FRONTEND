// Liquidación de beneficios sociales: la propuesta y los descuentos de ley los calcula el servidor; aquí solo la suma en pantalla.
const round2 = (n) => Math.round(n * 100) / 100;
const suma = (lista) => round2(lista.reduce((s, x) => s + (Number(x.monto) || 0), 0));

// Los descuentos de ley son la vista previa del servidor (con signo); las líneas, lo que el usuario está editando.
export function totalesEnPantalla(lineas, descuentosLey = []) {
  const ingresos = suma(lineas.filter((l) => l.tipo === "ingreso"));
  const descuentos = suma(lineas.filter((l) => l.tipo === "descuento"));
  const leyes = suma(descuentosLey || []);
  return { ingresos, descuentos, leyes, neto: round2(ingresos - descuentos - leyes) };
}

export function validarLinea({ codigo, descripcion, monto }) {
  if (!codigo) return "Elige el concepto de la línea.";
  if ((descripcion || "").trim().length > 80) return "La descripción admite hasta 80 caracteres.";
  const texto = String(monto ?? "").trim();
  if (!/^\d+(\.\d{1,2})?$/.test(texto) || !(Number(texto) > 0)) return "El monto debe ser mayor que 0, con hasta 2 decimales.";
  return "";
}
