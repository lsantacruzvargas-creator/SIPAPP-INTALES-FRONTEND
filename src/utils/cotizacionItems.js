import { r2 } from "./redondeo.js";
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
  ocGenerada: item.ocGenerada || null,
  partidaOC: item.partidaOC || null,
});

// Un vínculo llega como id o poblado ({ _id, codigo, … }).
export const idDe = (v) => (v == null ? null : typeof v === "object" ? (v._id == null ? null : String(v._id)) : String(v));

// El PUT de cotización exige que cada ítem traiga sus vínculos tal como están guardados: así siguen
// a su ítem aunque cambie de posición (Backend/src/routes/cotizaciones.js, itemsConVinculos).
export const vinculosItem = (item) => ({
  otGenerada: idDe(item.otGenerada),
  ocGenerada: idDe(item.ocGenerada),
  partidaOC: idDe(item.partidaOC),
});

// Monto sin IGV de cada ítem con el descuento global, escalado a la base de la
// cotización (`total - igv`) según su peso en el subtotal: así la suma de todas
// las partidas de OC da la base sin IGV de la cotización.
// Copia en Backend/src/utils/partidasOC.js (`calcSubtotal`, `montoAjustadoItem`, `montoPartida`,
// `subtotalPartida`, que fijan el monto de cada partida de OC): cambiar uno obliga a cambiar el otro.
export function montoAjustadoItem(cotizacion, item) {
  const dscto = Number(cotizacion.descuentoGlobal) || 0;
  const subtotalItems = (cotizacion.items || []).reduce((s, i) => s + calcSubtotal(i, dscto), 0);
  const total = Number(cotizacion.total) || 0;
  const igv = Number(cotizacion.igv) || 0;
  const base = cotizacion.afectoIgv === false && total > 0 ? total
    : total > 0 && igv > 0 ? total - igv : subtotalItems;
  const factor = subtotalItems > 0 ? base / subtotalItems : 1;
  return r2(calcSubtotal(item, dscto) * factor);
}

// Monto de una partida con los ítems `indices` de la cotización guardada: todos → `total − igv`
// (sin el redondeo de sumar ítem por ítem); sin ítems, la partida cubre la cotización entera.
export function subtotalPartida(cotizacion, indices) {
  const items = cotizacion.items || [];
  const total = Number(cotizacion.total) || 0;
  const base = r2(total - (Number(cotizacion.igv) || 0));
  if (!items.length) return base;
  if (indices.length === items.length && total > 0) return base;
  return r2(indices.reduce((s, i) => s + montoAjustadoItem(cotizacion, items[i]), 0));
}

// Un ítem está cubierto si su OC existe y no fue anulada (una OC anulada no toca sus ítems).
export const itemConOC = (item) => !!item.ocGenerada && !item.ocGenerada.anulado;

export const indicesLibresOC = (cotizacion) =>
  (cotizacion?.items || []).reduce((acc, item, idx) => {
    if (!itemConOC(item)) acc.push(idx);
    return acc;
  }, []);

// `bloqueo.indicesFacturados` son posiciones en el orden guardado: se traducen a la partida de cada
// ítem para que el candado siga al ítem aunque cambie de posición en pantalla.
export const partidasTomadas = (cotizacion) => new Set(
  (cotizacion?.bloqueo?.indicesFacturados || [])
    .map((i) => idDe(cotizacion.items?.[i]?.partidaOC))
    .filter(Boolean),
);

// Partida de la OC que recibió los ítems recién generados o anexados: la única de la cotización
// sin facturar (los ítems nunca se suman a una partida tomada).
export function partidaRecibida(oc, cotizacionId) {
  const estados = new Map((oc?.estadoFacturacion?.partidas || []).map((p) => [idDe(p._id), p.estado]));
  const deCot = (oc?.partidas || []).filter((p) => idDe(p.cotizacion) === String(cotizacionId));
  return deCot.find((p) => (estados.get(idDe(p._id)) ?? "sin facturar") === "sin facturar")
    || deCot[deCot.length - 1] || null;
}

export function infoPartidaItem(item, ocs) {
  const ocId = idDe(item.ocGenerada);
  const partidaId = idDe(item.partidaOC);
  if (!ocId || !partidaId) return null;
  const oc = (ocs || []).find((o) => idDe(o._id) === ocId);
  if (!oc) return null;
  const partidas = oc.partidas || [];
  const n = partidas.findIndex((p) => idDe(p._id) === partidaId);
  const estado = (oc.estadoFacturacion?.partidas || []).find((p) => idDe(p._id) === partidaId)?.estado;
  return { posicion: n >= 0 ? n + 1 : null, total: partidas.length, estado };
}

// Validación de ítems requeridos por el modelo (Backend/src/models/Cotizacion.js:
// descripcion, cantidad y precio son obligatorios) — se resalta en el form
// antes de enviar, en vez de dejar que el guardado falle en el servidor.
export const descripcionInvalida = (item) => !item.descripcion?.trim();
export const cantidadInvalida = (item) => !(Number(item.cantidad) > 0);
export const precioInvalido = (item) =>
  item.precio === "" || item.precio == null || isNaN(Number(item.precio)) || Number(item.precio) < 0;
export const itemInvalido = (item) =>
  descripcionInvalida(item) || cantidadInvalida(item) || precioInvalido(item);
