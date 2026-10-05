import { DETRACCION_BIENES_SERVICIOS } from "./catalogosSunat.js";
import { round2, money } from "./compras.js";
import { origenTC, esTcSunat } from "./costos.js";
import { fechaHoyLima, formatearFecha, aInputFecha } from "./fecha.js";

// Espejo de Backend/src/utils/impuesto.js: el backend recalcula siempre; esto
// es solo la vista previa de los formularios.
export const UMBRAL_IMPUESTO = 700;
export const TASA_RETENCION = 0.03;
// Percepción del IGV en ventas (INTALES agente): 2 % general o 0.5 % si el cliente también es agente.
export const TASAS_PERCEPCION = [0.02, 0.005];
export const CODIGO_SERVICIOS = "037";
export const CODIGOS_DETRACCION = DETRACCION_BIENES_SERVICIOS.filter((c) => c.porcentaje);

const aSoles = (total, moneda, tipoCambio) => (moneda === "USD" ? Number(total) * Number(tipoCambio || 1) : Number(total));

export function calcularImpuesto({ tipo, codigoSunat, total, moneda = "PEN", tipoCambio = 1, tasa }) {
  if (!tipo || tipo === "ninguno") return { tasa: 0, monto: 0 };
  const soles = aSoles(total, moneda, tipoCambio);
  if (tipo === "percepcion") {
    const t = TASAS_PERCEPCION.includes(Number(tasa)) ? Number(tasa) : TASAS_PERCEPCION[0];
    return { tasa: t, monto: round2(soles * t) };
  }
  if (tipo === "detraccion") {
    const bien = CODIGOS_DETRACCION.find((c) => c.codigo === codigoSunat);
    if (!bien) return { tasa: 0, monto: 0 };
    const tasa = bien.porcentaje / 100;
    return { tasa, monto: Math.round(round2(soles * tasa)) };
  }
  if (tipo === "retencion4ta") return { tasa: 0.08, monto: round2(soles * 0.08) };
  return { tasa: TASA_RETENCION, monto: round2(soles * TASA_RETENCION) };
}

const seDescuenta = (lado, quienDeposita) => (lado === "compra" ? quienDeposita === "nosotros" : quienDeposita === "cliente");

export function partes({ lado, total, moneda = "PEN", tipoCambio = 1, impuesto }) {
  if (!impuesto || impuesto.tipo === "ninguno" || !impuesto.monto) return { neto: round2(total), impuesto: 0 };
  // La percepción no se descuenta: se cobra además del total.
  if (impuesto.tipo === "percepcion") return { neto: round2(total), impuesto: impuesto.monto };
  const enMonedaDoc = moneda === "USD" ? impuesto.monto / Number(tipoCambio) : impuesto.monto;
  const neto = seDescuenta(lado, impuesto.quienDeposita) ? round2(total - enMonedaDoc) : round2(total);
  const parteImpuesto = lado === "compra" && impuesto.quienDeposita === "proveedor" ? 0 : impuesto.monto;
  return { neto, impuesto: parteImpuesto };
}

export function tipoMovimientoEsperado({ lado, concepto, impuesto }) {
  if (lado === "compra") return "egreso";
  if (concepto === "neto") return "ingreso";
  if (impuesto?.tipo === "retencion") return "retencion";
  if (impuesto?.tipo === "percepcion") return "ingreso";
  return impuesto?.quienDeposita === "cliente" ? "ingreso" : "transferencia";
}

// conCreditoFiscal: la retención del IGV (3 %) solo va en comprobantes con crédito fiscal.
export function sugerirImpuesto({ total, moneda = "PEN", tipoCambio = 1, hayServicios, esAgenteRetencion, noAplicaRetencion = false, conCreditoFiscal = true }) {
  if (aSoles(total, moneda, tipoCambio) <= UMBRAL_IMPUESTO) return { tipo: "ninguno", codigoSunat: "" };
  if (hayServicios) return { tipo: "detraccion", codigoSunat: CODIGO_SERVICIOS };
  if (esAgenteRetencion && !noAplicaRetencion && conCreditoFiscal) return { tipo: "retencion", codigoSunat: "" };
  return { tipo: "ninguno", codigoSunat: "" };
}

// Espejo del backend: umbral y monto de la detracción en soles (ventas en dólares: total × TC).
export function impuestoVentaPorDefecto(total, moneda = "PEN", tipoCambio = 1) {
  if (aSoles(total, moneda, tipoCambio) <= UMBRAL_IMPUESTO) return { tipo: "ninguno", codigoSunat: "", tasa: 0, monto: 0 };
  return { tipo: "detraccion", codigoSunat: CODIGO_SERVICIOS, ...calcularImpuesto({ tipo: "detraccion", codigoSunat: CODIGO_SERVICIOS, total, moneda, tipoCambio }) };
}

// La moneda de una venta la manda su OC (que sigue a su cotización); sin OC, la elegida.
export const monedaFactura = ({ oc, elegida }) => (oc?.moneda === "USD" || oc?.moneda === "PEN" ? oc.moneda : elegida === "USD" ? "USD" : "PEN");

// Vista previa de la factura de venta: detracción en S/, total a pagar en la moneda de la factura.
export function calculoVenta({ subtotal, descuentoPct = 0, moneda = "PEN", tipoCambio = 1 }) {
  const sub = round2(Number(subtotal) || 0);
  const base = round2(sub * (1 - (Number(descuentoPct) || 0) / 100));
  const igv = round2(base * 0.18);
  const total = round2(base + igv);
  const detraccion = impuestoVentaPorDefecto(total, moneda, tipoCambio).monto;
  const enDoc = moneda === "USD" && tipoCambio > 0 ? detraccion / tipoCambio : detraccion;
  return { base, igv, total, detraccion, totalAPagar: round2(total - enDoc) };
}

export function etiquetaImpuesto(impuesto) {
  const pct = `${Math.round((impuesto?.tasa || 0) * 100)}%`;
  if (impuesto?.tipo === "detraccion") return `Detracción ${pct}`;
  if (impuesto?.tipo === "retencion") return `Retención ${pct}`;
  if (impuesto?.tipo === "retencion4ta") return `Retención 4ta ${pct}`;
  if (impuesto?.tipo === "percepcion") return `Percepción ${+((impuesto.tasa || 0) * 100).toFixed(1)}%`;
  return "Sin detracción / retención";
}

export function diasCredito(formaPago) {
  const m = /(\d+)\s*d[ií]as/i.exec(String(formaPago || ""));
  return m ? Number(m[1]) : 0;
}

export function sumarDias(fechaIso, dias) {
  const [a, m, d] = fechaIso.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d + dias)).toISOString().slice(0, 10);
}

// Venta: la primera cuota impaga manda; sin cuotas, la fecha de cancelación.
export function vencimientoDe(f, lado) {
  if (lado === "compra") return f.fechaVencimiento || null;
  const cuota = [...(f.cuotas || [])].sort((a, b) => a.numero - b.numero).find((c) => !c.pagado);
  return cuota?.fechaVencimiento || f.fechaCancelacion || null;
}

export function semaforo(fechaVencimiento, pendiente, hoyIso) {
  if (!fechaVencimiento || !pendiente) return null;
  const venc = aInputFecha(fechaVencimiento);
  if (venc < hoyIso) return "vencida";
  if (venc <= sumarDias(hoyIso, 7)) return "por_vencer";
  return "al_dia";
}

const ESTADO_VENTA = { "sin pago": "pendiente", "pago parcial": "parcial", pagado: "pagada" };
const estadoDe = (f, lado) => (lado === "compra" ? f.estado : ESTADO_VENTA[f.estadoPago] || "pendiente");
const terceroDe = (f, lado) => (lado === "compra"
  ? `${f.proveedorRazonSocial || ""} ${f.proveedorRuc || ""}`
  : `${f.empresa?.alias || ""} ${f.empresa?.razonSocial || ""} ${f.empresa?.ruc || ""}`).toLowerCase();

export const FILTROS_TESORERIA = { tercero: "", estado: "", vencimiento: "", desde: "", hasta: "" };

export function filtrarFacturas(lista, f, { lado, hoyIso }) {
  return lista.filter((x) => {
    const emision = aInputFecha(x.fechaEmision);
    const pendiente = x.saldoNeto > 0.009 || x.saldoImpuesto > 0.009;
    return (!f.tercero || terceroDe(x, lado).includes(f.tercero.toLowerCase()))
      && (!f.estado || estadoDe(x, lado) === f.estado)
      && (!f.vencimiento || semaforo(vencimientoDe(x, lado), pendiente, hoyIso) === f.vencimiento)
      && (!f.desde || emision >= f.desde)
      && (!f.hasta || emision <= f.hasta);
  });
}

// Dinero sin comprobante (espejo de MovimientoTesoreria.conceptoManual en el backend).
export const CONCEPTOS_MANUALES = [
  { valor: "aporte", label: "Aporte" }, { valor: "prestamo", label: "Préstamo" }, { valor: "retiro", label: "Retiro" },
  { valor: "gasto_bancario", label: "Gasto bancario" }, { valor: "otros", label: "Otros" },
];
export const etiquetaConceptoManual = (valor) =>
  valor === "transferencia" ? "Transferencia entre cuentas" : CONCEPTOS_MANUALES.find((c) => c.valor === valor)?.label || valor;

export const textoCuenta = (c) =>
  `${c.nombre} (${c.moneda || "PEN"})${c.saldo != null ? ` · saldo ${money(c.saldo, c.moneda || "PEN")}` : ""}`;

// Columnas Documento / Tercero / Parte del libro de movimientos.
export function referenciaMovimiento(m) {
  if (m.conceptoManual) return { documento: etiquetaConceptoManual(m.conceptoManual), tercero: m.descripcion || "", parte: "Manual" };
  if (m.concepto === "caja_chica") return { documento: "Gasto de caja chica", tercero: m.descripcion || "", parte: "Caja chica" };
  return { documento: m.documentoRef?.comprobante || "", tercero: m.documentoRef?.tercero || "", parte: m.concepto === "neto" ? "Neto" : "Impuesto" };
}

export function totalesMovimientos(movs) {
  return movs.filter((m) => !m.anulado).reduce((t, m) => {
    const soles = round2(m.monto * (m.moneda === "USD" ? m.tipoCambio : 1));
    if (m.tipo === "ingreso") t.ingresos = round2(t.ingresos + soles);
    if (m.tipo === "egreso") t.egresos = round2(t.egresos + soles);
    return t;
  }, { ingresos: 0, egresos: 0 });
}

// Mismas reglas que valida registrarMovimiento en el backend.
// El neto se mueve en la moneda del documento; el impuesto siempre en soles (espejo del backend).
export function cuentasPara({ cuentas, lado, concepto, impuesto, moneda = "PEN" }) {
  const monedaMov = concepto === "neto" ? moneda : "PEN";
  const activas = cuentas.filter((c) => c.activo && (c.moneda || "PEN") === monedaMov);
  const noBN = activas.filter((c) => c.tipo !== "detracciones");
  const bn = activas.filter((c) => c.tipo === "detracciones");
  const tipo = tipoMovimientoEsperado({ lado, concepto, impuesto });
  if (tipo === "retencion") return { origen: [], destino: [] };
  if (tipo === "transferencia") return { origen: noBN, destino: bn };
  if (lado === "venta" && concepto === "impuesto" && impuesto?.tipo === "detraccion") return { origen: bn, destino: [] };
  return { origen: noBN, destino: [] };
}

export const periodoDeMes = (mes) => String(mes || "").replace("-", "");

// Los días de SIRE llegan como "YYYY-MM-DD" (ya en hora Lima): se reordenan como
// texto; pasarlos por new Date() los correría al día anterior.
export const fechaIsoTexto = (v) => {
  const d = String(v || "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d.split("-").reverse().join("/") : "—";
};

// Un origen que pasó por Compras (SC → OCP) se paga en Tesorería; en Requerimientos
// solo quedan los pagos antiguos. La SC queda en el Requerimiento (ítems) o en el Servicio.
export const esPagoAntiguo = (x) => !(x.solicitudCompra || x.requerimiento?.solicitudCompra);

// Pagar desde una cuenta en otra moneda está permitido (hay conversión en el banco),
// pero se avisa porque el libro por cuenta mezcla monedas.
export function avisoMoneda(cuenta, monedaParte) {
  if (!cuenta || cuenta.moneda === monedaParte) return null;
  return `La cuenta ${cuenta.nombre} está en ${cuenta.moneda} y este monto es en ${monedaParte}: verifica la conversión antes de registrar.`;
}

export function diasEntre(desdeIso, hastaIso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(desdeIso || "") || !/^\d{4}-\d{2}-\d{2}$/.test(hastaIso || "")) return null;
  return Math.round((Date.parse(hastaIso) - Date.parse(desdeIso)) / 86400000);
}

// ── TC de un comprobante en USD (spec comprobantes-compra, regla 7) ──
// Mismo rango que valida el servidor.
export const tcValido = (v) => Number(v) >= 2 && Number(v) <= 6;
export const fechaConsultableTc = (f) => /^\d{4}-\d{2}-\d{2}$/.test(f || "") && f >= "2000-01-01";

// `consulta` = { ok, datos?, mensaje? } de GET /sunat/tipo-cambio?fecha=. El TC SUNAT de
// esa fecha queda solo lectura; si la ruta cayó a un respaldo se propone pero se puede
// corregir; si falló, el campo queda vacío para escribirlo.
export function estadoTcComprobante(consulta) {
  const d = consulta?.ok ? consulta.datos : null;
  if (!d?.venta) {
    return { tc: "", soloLectura: false, aviso: `${consulta?.mensaje || "No se pudo obtener el TC SUNAT de esa fecha"}: escríbelo`, alerta: true };
  }
  if (esTcSunat(d)) return { tc: String(d.venta), soloLectura: true, aviso: `TC venta ${origenTC(d)}`, alerta: false };
  return { tc: String(d.venta), soloLectura: false, aviso: `No se pudo consultar SUNAT: se propone el ${origenTC(d)}; revísalo`, alerta: true };
}

// ── Comprobantes de compra (spec comprobantes-compra, Fase 3) ──
export const TIPOS_COMPROBANTE_COMPRA = [
  { valor: "01", label: "Factura" },
  { valor: "02", label: "Recibo por honorarios" },
  { valor: "03", label: "Boleta" },
  { valor: "07", label: "Nota de crédito" },
  { valor: "08", label: "Nota de débito" },
  { valor: "12", label: "Ticket / ticket POS" },
  { valor: "14", label: "Recibo de servicios públicos" },
];

// Espejo de Backend/src/utils/comprobantesCompra.js (el servidor decide; esto es la vista previa).
export function creditoFiscalDe({ tipoComprobante, igv, ticketConRuc, origen }) {
  if (tipoComprobante === "07" || tipoComprobante === "08") return origen ? origen.creditoFiscal ?? creditoFiscalDe(origen) : false;
  if (!(Number(igv) > 0)) return false;
  if (tipoComprobante === "01" || tipoComprobante === "14") return true;
  if (tipoComprobante === "12") return !!ticketConRuc;
  return false;
}

// Retención del IGV (3 %): con crédito fiscal y nunca en recibos de servicios públicos
// (14) ni en sus notas (espejo del backend).
export function admiteRetencionIgv(datos) {
  const tipoBase = datos.tipoComprobante === "07" || datos.tipoComprobante === "08" ? datos.origen?.tipoComprobante : datos.tipoComprobante;
  return tipoBase !== "14" && creditoFiscalDe(datos);
}

// "Ticket / ticket POS TK01-5": tipo y serie-número, para distinguirlos en las tablas.
export const etiquetaComprobante = (f) =>
  `${TIPOS_COMPROBANTE_COMPRA.find((t) => t.valor === f.tipoComprobante)?.label || "Comprobante"} ${f.serie}-${f.numero}`;

// NC: se aplica al comprobante hasta su saldo; lo que sobra queda a favor (espejo del backend).
export function vistaPreviaNota({ totalNota, saldoOrigen }) {
  const aplicar = round2(Math.max(0, Math.min(totalNota, saldoOrigen)));
  return { aplicar, aFavor: round2(totalNota - aplicar) };
}

// Comprobantes a los que se puede ligar una nota o aplicar un saldo a favor:
// mismo proveedor y moneda, vigentes y que no sean notas.
export const origenesPosibles = (facturas, { proveedor, moneda }) => facturas.filter((f) =>
  String(f.proveedor?._id || f.proveedor) === String(proveedor) && f.moneda === moneda && !f.anulada
  && f.tipoComprobante !== "07" && f.tipoComprobante !== "08");

// Formulario precargado desde una fila "Solo en SIRE". El SIRE trae las NC en negativo
// y un ticket que aparece en el RCE es porque trae el RUC de INTALES.
export function precargaDesdeSire(s, proveedores) {
  const prov = proveedores.find((p) => p.ruc === s.rucContraparte);
  const tipos = TIPOS_COMPROBANTE_COMPRA.map((t) => t.valor);
  const igv = Math.abs(Number(s.igv) || 0);
  const base = Math.abs(Number(s.baseImponible) || 0) || round2(Math.abs(Number(s.total) || 0) - igv);
  return {
    modo: "sinOc", proveedor: prov?._id || "", tipoComprobante: tipos.includes(s.tipo) ? s.tipo : "01",
    serie: s.serie, numero: s.numero, fechaEmision: String(s.fechaEmision || "").slice(0, 10) || fechaHoyLima(),
    moneda: s.moneda === "USD" ? "USD" : "PEN", subtotal: String(base), conIgv: igv > 0, ticketConRuc: s.tipo === "12",
  };
}

const tc3 = (v) => Number(v).toFixed(3);
export const textoTcSire = (tc) =>
  `sistema ${tc3(tc.sistema)} · SIRE ${tc3(tc.sire)} · SUNAT ${tc.sunat > 0
    ? `${tc3(tc.sunat)}${tc.fechaTc ? ` (${fechaIsoTexto(tc.fechaTc).slice(0, 5)}${tc.deOrigen ? ", fecha del comprobante que modifica" : ""})` : ""}`
    : "no disponible"}`;

// Excel del resumen tributario: una fila por comprobante (montos en S/ con signo; las NC restan).
export const filasExcelResumen = (detalle) => detalle.map((d) => ({
  FECHA: formatearFecha(d.fechaEmision, { day: "2-digit", month: "2-digit", year: "numeric" }),
  TIPO: TIPOS_COMPROBANTE_COMPRA.find((t) => t.valor === d.tipoComprobante)?.label || d.tipoComprobante,
  COMPROBANTE: `${d.serie}-${d.numero}`, RUC: d.proveedorRuc, "RAZÓN SOCIAL": d.proveedorRazonSocial,
  MONEDA: d.moneda, TC: d.tipoCambio, BASE: d.base, IGV: d.igv, TOTAL: d.total,
  "BASE S/": d.baseSoles, "IGV S/": d.igvSoles, "TOTAL S/": d.totalSoles,
  "CRÉDITO FISCAL": d.creditoFiscal ? "Sí" : "No", "4TA DEL RECIBO S/": d.retencion4ta,
}));

// Excel del reporte de diferencia de cambio al cierre (+ ganancia, − pérdida, en S/).
const PARTIDAS_DC = { porCobrar: "Por cobrar", porPagar: "Por pagar", cuenta: "Cuenta en dólares" };
export const filasExcelDiferenciaCambio = (partidas) => partidas.map((p) => ({
  PARTIDA: PARTIDAS_DC[p.tipo] || p.tipo,
  DETALLE: p.cuenta ? p.cuenta.nombre : [p.documento?.numero, p.documento?.tercero].filter(Boolean).join(" · "),
  "TC DOC.": p.tcDoc ?? "", "SALDO US$": p.saldoMe, "LIBROS S/": p.librosSoles, "AL CIERRE S/": p.cierreSoles,
  "DIFERENCIA S/": p.diferencia, RESULTADO: p.diferencia > 0 ? "Ganancia" : p.diferencia < 0 ? "Pérdida" : "—",
}));

// Excel del resumen tributario, hoja Ventas (montos en S/ con signo: las NC restan).
const TIPOS_VENTA = { "01": "Factura", "03": "Boleta", "07": "Nota de crédito", "08": "Nota de débito" };
export const filasExcelVentas = (ventas) => ventas.map((v) => ({
  FECHA: fechaIsoTexto(String(v.fechaEmision).slice(0, 10)),
  TIPO: TIPOS_VENTA[v.tipoDoc] || v.tipoDoc, COMPROBANTE: `${v.serie}-${v.correlativo}`, RUC: v.clienteRuc, "RAZÓN SOCIAL": v.clienteRazonSocial,
  MONEDA: v.moneda, TC: v.tipoCambio, BASE: v.base, IGV: v.igv, TOTAL: v.total, "BASE S/": v.baseSoles, "IGV S/": v.igvSoles, "TOTAL S/": v.totalSoles,
}));

// Subtotales de Por cobrar por moneda: total, neto y saldo neto en la moneda de cada factura;
// la detracción/retención (y su saldo) siempre en soles.
export function subtotalesPorCobrar(facturas) {
  const sumar = (lista, monto, moneda) => lista.reduce((t, x) => {
    const m = moneda(x);
    t[m] = round2((t[m] || 0) + Number(monto(x) || 0));
    return t;
  }, {});
  const mon = (f) => f.moneda || "PEN";
  const conImpuesto = facturas.filter((f) => f.impuesto?.tipo && f.impuesto.tipo !== "ninguno");
  const saldo = sumar(facturas, (f) => f.saldoNeto, mon);
  const saldoImp = facturas.reduce((s, f) => s + (Number(f.saldoImpuesto) || 0), 0);
  if (saldoImp) saldo.PEN = round2((saldo.PEN || 0) + saldoImp);
  return {
    total: sumar(facturas, (f) => f.total, mon),
    impuesto: sumar(conImpuesto, (f) => f.impuesto.monto, () => "PEN"),
    neto: sumar(facturas, (f) => f.totalAPagar, mon),
    saldo,
  };
}

// Comparación de la carga manual del SIRE contra la propuesta descargada de SUNAT.
export const RESULTADOS_CARGA = { coincide: "Coincide", difiere: "Difiere", solo_carga: "Solo en la carga", solo_sire: "Solo en SUNAT" };
export const filasExcelComparacionCarga = (filas) => filas.map((f) => ({
  RESULTADO: RESULTADOS_CARGA[f.estado] || f.estado, COMPROBANTE: `${f.tipo} ${f.serie}-${f.numero}`, RUC: f.ruc,
  "RUC SUNAT": f.rucSire && f.rucSire !== f.ruc ? f.rucSire : "", "RAZÓN SOCIAL": f.razonSocial || "",
  "BASE SIRE": f.baseSire ?? "", "BASE CARGA": f.baseCarga ?? "",
  DIFERENCIA: f.baseSire != null && f.baseCarga != null ? round2(f.baseCarga - f.baseSire) : "",
  DIFERENCIAS: (f.diferencias || []).map((d) => (d === "ruc" ? "RUC" : "Base")).join(", "),
}));
