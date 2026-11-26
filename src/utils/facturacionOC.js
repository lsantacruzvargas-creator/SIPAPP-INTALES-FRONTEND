import { r2 } from "./redondeo.js";
import { idDe, precioConDescuento } from "./cotizacionItems.js";
import { itemVacioComprobante, precioUnitarioDesdeValor, calcularLineaComprobante } from "./catalogosSunat.js";

// OC que todavía se puede facturar entera fuera de la emisión por partidas: legado (sin partidas), sin
// factura y sin comprobante en vuelo. Una OC por partidas solo se factura desde su detalle.
export const ocLegadoLibre = (o) => !o?.anulado && !(o?.partidas || []).length
  && o?.estadoFacturacion?.estado === "sin facturar" && !o?.estadoFacturacion?.reservada;

// ANULADO sin la NC que lo anuló: la emisión chocó con otro comprobante que ya reservaba las partidas y no
// se envió a SUNAT (el correlativo quedó consumido).
export const noEnviado = (c) => c?.estado === "ANULADO" && !c.anuladoPor;

export const estadoDePartida = (oc, p) => oc?.estadoFacturacion?.partidas?.find((e) => idDe(e._id) === idDe(p?._id));
export const partidasFacturadas = (oc) =>
  (oc?.estadoFacturacion?.partidas || []).filter((e) => e.estado === "facturada" || e.estado === "pagada").length;
export const numerosFacturaDe = (oc) => (oc?.estadoFacturacion?.numerosFactura || "").split(/\s*,\s*/).filter(Boolean);

// OC de una cotización: las que tienen una partida suya (la propia o una a la que se anexó); una OC legado (sin
// partidas), por su `cotizacion`. `vigentes`: sin las anuladas (una OC anulada ya no tiene las partidas).
export const ocsDeCotizacion = (ocs, cotizacionId, { vigentes = false } = {}) => (ocs || []).filter((o) =>
  (!vigentes || !o.anulado) && ((o.partidas || []).length
    ? o.partidas.some((p) => idDe(p.cotizacion) === idDe(cotizacionId))
    : idDe(o.cotizacion) === idDe(cotizacionId)));

// Facturas de una cotización entre las de `ocsDeCot` (sus OC): las que no traen `partidasOC` (cubren la OC entera) o
// cubren alguna partida suya. Una factura sin OC, si comparte la cadena (`numeroDocumento`).
export function facturasDeCotizacion(facturas, ocsDeCot, { _id, numeroDocumento } = {}) {
  const idsOC = new Set((ocsDeCot || []).map((o) => idDe(o._id)));
  const propias = new Set((ocsDeCot || []).flatMap((o) =>
    (o.partidas || []).filter((p) => idDe(p.cotizacion) === idDe(_id)).map((p) => idDe(p._id))));
  return (facturas || []).filter((f) => {
    const ocId = idDe(f.ordenCompra);
    if (ocId) return idsOC.has(ocId) && (!(f.partidasOC || []).length || f.partidasOC.some((p) => propias.has(idDe(p))));
    return numeroDocumento != null && f.numeroDocumento === numeroDocumento;
  });
}

// Con facturación por partidas una cadena puede tener varias facturas: se guardan todas para que la
// búsqueda encuentre cualquiera de sus números.
export function numerosFacturaPorCadena(facturas) {
  const m = new Map();
  (facturas || []).forEach((f) => {
    if (!f.numeroFactura || f.numeroDocumento == null) return;
    const previo = m.get(f.numeroDocumento);
    m.set(f.numeroDocumento, previo ? `${previo}, ${f.numeroFactura}` : f.numeroFactura);
  });
  return m;
}

const lineaUnica = (descripcion, monto, unidad) => {
  const valor = r2(Number(monto) || 0);
  return {
    ...itemVacioComprobante(),
    descripcion,
    cantidad: 1,
    unidad,
    valorUnitario: valor,
    precioUnitario: precioUnitarioDesdeValor(valor, "10"),
    afectacion: "10",
    descuentoPorcentaje: 0,
  };
};

// El valor unitario sale neto del descuento global de la cotización (mismo criterio que su tabla).
const lineasDeItems = (items, cotizacion, unidad) => items.map((i) => {
  const valorUnitario = precioConDescuento(i, cotizacion?.descuentoGlobal);
  return {
    ...itemVacioComprobante(),
    descripcion: i.descripcion,
    cantidad: i.cantidad || 1,
    unidad,
    valorUnitario,
    precioUnitario: precioUnitarioDesdeValor(valorUnitario, "10"),
    afectacion: "10",
    descuentoPorcentaje: 0,
  };
});

// Un céntimo de redondeo por línea, igual que la tolerancia del servidor al comparar con las partidas. En una OC
// legado el servidor no cuenta líneas (tolerancia fija de un céntimo): se pasa `tolerancia`.
const cuadran = (lineas, monto, tolerancia = 0.01 * lineas.length) =>
  Math.abs(lineas.reduce((s, l) => s + calcularLineaComprobante(l).base, 0) - monto) <= tolerancia;

// Prellenado de Emitir CPE desde `location.state.prellenarDesdeOC` de DetalleOrdenCompra. `partidas` vacío =
// OC legado, que se factura entera (contra su subtotal). Con partidas el monto de cada una es el de la OC:
// más de una → una línea por partida; una sola → sus ítems de la cotización si suman su monto, si no una línea.
export function prellenadoDesdeOC({ oc, partidas, cotizaciones }) {
  const cots = cotizaciones || [];
  const cotDe = (v) => cots.find((c) => idDe(c._id) === idDe(v)) || (v && typeof v === "object" ? v : null);
  const elegidas = partidas || [];
  const cotOrigen = cotDe(oc.cotizacion) || cots[0] || null;
  const cotBase = elegidas.length ? cotDe(elegidas[0].cotizacion) : cotOrigen;
  const tipoBienServicio = cotBase?.tipo === "servicio" ? "servicio" : "bien";
  const unidad = tipoBienServicio === "servicio" ? "ZZ" : "NIU";
  const montoOC = r2(Number(oc.subtotal) || 0);

  let items;
  if (elegidas.length > 1) {
    items = elegidas.map((p) => lineaUnica(p.titulo || cotDe(p.cotizacion)?.titulo || "", p.subtotal, unidad));
  } else if (elegidas.length === 1) {
    const [p] = elegidas;
    const cot = cotDe(p.cotizacion);
    const monto = r2(Number(p.subtotal) || 0);
    const lineas = lineasDeItems((cot?.items || []).filter((i) => idDe(i.partidaOC) === idDe(p._id)), cot, unidad);
    items = lineas.length && cuadran(lineas, monto)
      ? lineas
      : [lineaUnica(p.titulo || cot?.titulo || oc.descripcion || oc.titulo || "", monto, unidad)];
  } else {
    const deOC = (cotOrigen?.items || []).filter((i) => idDe(i.ocGenerada) === idDe(oc._id));
    const lineas = lineasDeItems(deOC.length ? deOC : cotOrigen?.items || [], cotOrigen, unidad);
    // OC legado con subtotal 0: el servidor no compara montos.
    if (lineas.length && (!(montoOC > 0) || cuadran(lineas, montoOC, 0.01))) items = lineas;
    else if (montoOC > 0) items = [lineaUnica(oc.descripcion || oc.titulo || lineas[0]?.descripcion || "", montoOC, unidad)];
    else items = [{ ...itemVacioComprobante(), descripcion: oc.descripcion || oc.titulo || "", unidad }];
  }

  return {
    items,
    tipoBienServicio,
    moneda: cotOrigen?.moneda || oc.moneda || "PEN",
    partidasOC: elegidas.map((p) => idDe(p._id)),
    numeroOrdenCompra: oc.numeroOrden || oc.codigo || "",
    ordenCompraId: idDe(oc._id) || "",
    montosFijos: elegidas.length > 0 || montoOC > 0,
  };
}
