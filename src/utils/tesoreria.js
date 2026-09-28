import { DETRACCION_BIENES_SERVICIOS } from "./catalogosSunat.js";
import { round2 } from "./compras.js";

// Espejo de Backend/src/utils/impuesto.js: el backend recalcula siempre; esto
// es solo la vista previa de los formularios.
export const UMBRAL_IMPUESTO = 700;
export const TASA_RETENCION = 0.03;
export const CODIGO_SERVICIOS = "037";
export const CODIGOS_DETRACCION = DETRACCION_BIENES_SERVICIOS.filter((c) => c.porcentaje);

const aSoles = (total, moneda, tipoCambio) => (moneda === "USD" ? Number(total) * Number(tipoCambio || 1) : Number(total));

export function calcularImpuesto({ tipo, codigoSunat, total, moneda = "PEN", tipoCambio = 1 }) {
  if (!tipo || tipo === "ninguno") return { tasa: 0, monto: 0 };
  const soles = aSoles(total, moneda, tipoCambio);
  if (tipo === "detraccion") {
    const bien = CODIGOS_DETRACCION.find((c) => c.codigo === codigoSunat);
    if (!bien) return { tasa: 0, monto: 0 };
    const tasa = bien.porcentaje / 100;
    return { tasa, monto: Math.round(round2(soles * tasa)) };
  }
  return { tasa: TASA_RETENCION, monto: round2(soles * TASA_RETENCION) };
}

const seDescuenta = (lado, quienDeposita) => (lado === "compra" ? quienDeposita === "nosotros" : quienDeposita === "cliente");

export function partes({ lado, total, moneda = "PEN", tipoCambio = 1, impuesto }) {
  if (!impuesto || impuesto.tipo === "ninguno" || !impuesto.monto) return { neto: round2(total), impuesto: 0 };
  const enMonedaDoc = moneda === "USD" ? impuesto.monto / Number(tipoCambio) : impuesto.monto;
  const neto = seDescuenta(lado, impuesto.quienDeposita) ? round2(total - enMonedaDoc) : round2(total);
  const parteImpuesto = lado === "compra" && impuesto.quienDeposita === "proveedor" ? 0 : impuesto.monto;
  return { neto, impuesto: parteImpuesto };
}

export function tipoMovimientoEsperado({ lado, concepto, impuesto }) {
  if (lado === "compra") return "egreso";
  if (concepto === "neto") return "ingreso";
  if (impuesto?.tipo === "retencion") return "retencion";
  return impuesto?.quienDeposita === "cliente" ? "ingreso" : "transferencia";
}

export function sugerirImpuesto({ total, moneda = "PEN", tipoCambio = 1, hayServicios, esAgenteRetencion, noAplicaRetencion = false }) {
  if (aSoles(total, moneda, tipoCambio) <= UMBRAL_IMPUESTO) return { tipo: "ninguno", codigoSunat: "" };
  if (hayServicios) return { tipo: "detraccion", codigoSunat: CODIGO_SERVICIOS };
  if (esAgenteRetencion && !noAplicaRetencion) return { tipo: "retencion", codigoSunat: "" };
  return { tipo: "ninguno", codigoSunat: "" };
}

export function impuestoVentaPorDefecto(total) {
  if (Number(total) <= UMBRAL_IMPUESTO) return { tipo: "ninguno", codigoSunat: "", tasa: 0, monto: 0 };
  return { tipo: "detraccion", codigoSunat: CODIGO_SERVICIOS, ...calcularImpuesto({ tipo: "detraccion", codigoSunat: CODIGO_SERVICIOS, total }) };
}

export function etiquetaImpuesto(impuesto) {
  const pct = `${Math.round((impuesto?.tasa || 0) * 100)}%`;
  if (impuesto?.tipo === "detraccion") return `Detracción ${pct}`;
  if (impuesto?.tipo === "retencion") return `Retención ${pct}`;
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
  const venc = String(fechaVencimiento).slice(0, 10);
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
    const emision = String(x.fechaEmision || "").slice(0, 10);
    const pendiente = x.saldoNeto > 0.009 || x.saldoImpuesto > 0.009;
    return (!f.tercero || terceroDe(x, lado).includes(f.tercero.toLowerCase()))
      && (!f.estado || estadoDe(x, lado) === f.estado)
      && (!f.vencimiento || semaforo(vencimientoDe(x, lado), pendiente, hoyIso) === f.vencimiento)
      && (!f.desde || emision >= f.desde)
      && (!f.hasta || emision <= f.hasta);
  });
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
export function cuentasPara({ cuentas, lado, concepto, impuesto }) {
  const activas = cuentas.filter((c) => c.activo);
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
