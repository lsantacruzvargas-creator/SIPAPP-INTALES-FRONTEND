export const UNIDADES = ["und", "kg", "g", "L", "mL", "m", "cm", "m²", "caja", "rollo", "par", "juego", "bolsa"];

// Descuento global (%) de TODA la cotización (ver DetalleCotizacion.jsx
// `form.descuentoGlobal`) — un solo valor para todos los ítems, ya no hay
// descuento por ítem. Se aplica sobre el PRECIO UNITARIO de cada ítem
// (precisión del usuario, 2026-09-11), no sobre el total de la línea.
// `montoDescuentoItem` = cuánto se descuenta de ESE ítem — ej. 100 × 4% = 4.
export const montoDescuentoItem = (item, descuentoGlobalPct = 0) =>
  Math.max(0, (item.precio || 0) * (Number(descuentoGlobalPct) || 0) / 100);

export const precioConDescuento = (item, descuentoGlobalPct = 0) =>
  Math.max(0, (item.precio || 0) - montoDescuentoItem(item, descuentoGlobalPct));

export const calcSubtotal = (item, descuentoGlobalPct = 0) =>
  parseFloat((item.cantidad * precioConDescuento(item, descuentoGlobalPct)).toFixed(2));

export const INP =
  "border border-gray-200 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-gray-400";
export const INP_RO = "bg-transparent border-transparent text-sm px-2 py-1";

export const itemVacioVenta = () => ({
  _key: Date.now() + Math.random(),
  descripcion: "",
  codigo: "",
  unidad: "und",
  cantidad: 1,
  diasEntrega: "",
  precio: 0,
  moneda: "PEN",
  imagenes: [],
});

export const itemVacioServicio = () => ({
  _key: Date.now() + Math.random(),
  descripcion: "",
  subItems: [],
  codigo: "",
  unidad: "und",
  cantidad: 1,
  diasEntrega: "",
  precio: 0,
  moneda: "PEN",
  imagenes: [],
});

export const itemDesdeDb = (item) => ({
  _key: Date.now() + Math.random(),
  descripcion: item.descripcion,
  subItems: (item.subItems || []).map((texto) => ({
    _subKey: Date.now() + Math.random(),
    texto,
  })),
  codigo: item.codigo || "",
  unidad: item.unidad || "und",
  cantidad: item.cantidad,
  diasEntrega: item.diasEntrega ?? "",
  precio: item.precio,
  moneda: item.moneda || "PEN",
  imagenes: item.imagenes || [],
  otGenerada: item.otGenerada || null,
});

// Validación de ítems requeridos por el modelo (Backend/src/models/Cotizacion.js:
// descripcion, cantidad y precio son obligatorios) — se resalta en el form
// antes de enviar, en vez de dejar que el guardado falle en el servidor.
export const descripcionInvalida = (item) => !item.descripcion?.trim();
export const cantidadInvalida = (item) => !(Number(item.cantidad) > 0);
export const precioInvalido = (item) =>
  item.precio === "" || item.precio == null || isNaN(Number(item.precio)) || Number(item.precio) < 0;
export const itemInvalido = (item) =>
  descripcionInvalida(item) || cantidadInvalida(item) || precioInvalido(item);
