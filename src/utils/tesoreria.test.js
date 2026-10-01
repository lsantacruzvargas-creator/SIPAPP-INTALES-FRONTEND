import { test } from "node:test";
import assert from "node:assert/strict";
import {
  calcularImpuesto, partes, tipoMovimientoEsperado, sugerirImpuesto, impuestoVentaPorDefecto, etiquetaImpuesto,
  diasCredito, sumarDias, vencimientoDe, semaforo, filtrarFacturas, FILTROS_TESORERIA, totalesMovimientos, cuentasPara, periodoDeMes, fechaIsoTexto, esPagoAntiguo, avisoMoneda, diasEntre,
  estadoTcComprobante, tcValido, fechaConsultableTc, TIPOS_COMPROBANTE_COMPRA, creditoFiscalDe, etiquetaComprobante, vistaPreviaNota, origenesPosibles,
} from "./tesoreria.js";

test("calcularImpuesto replica al backend: detracción entera en soles y retención 3 %", () => {
  assert.deepEqual(calcularImpuesto({ tipo: "detraccion", codigoSunat: "037", total: 1187.5 }), { tasa: 0.12, monto: 143 });
  assert.deepEqual(calcularImpuesto({ tipo: "detraccion", codigoSunat: "037", total: 1000, moneda: "USD", tipoCambio: 3.75 }), { tasa: 0.12, monto: 450 });
  assert.deepEqual(calcularImpuesto({ tipo: "retencion", total: 1180 }), { tasa: 0.03, monto: 35.4 });
  assert.deepEqual(calcularImpuesto({ tipo: "detraccion", codigoSunat: "002", total: 1000 }), { tasa: 0, monto: 0 });
  assert.deepEqual(calcularImpuesto({ tipo: "ninguno", total: 1000 }), { tasa: 0, monto: 0 });
});

test("partes descuenta el impuesto según quién deposita", () => {
  const det = { tipo: "detraccion", monto: 450, quienDeposita: "nosotros" };
  assert.deepEqual(partes({ lado: "compra", total: 1000, moneda: "USD", tipoCambio: 3.75, impuesto: det }), { neto: 880, impuesto: 450 });
  assert.deepEqual(partes({ lado: "compra", total: 1000, impuesto: { ...det, quienDeposita: "proveedor" } }), { neto: 1000, impuesto: 0 });
  assert.deepEqual(partes({ lado: "venta", total: 1180, impuesto: { tipo: "detraccion", monto: 142, quienDeposita: "cliente" } }), { neto: 1038, impuesto: 142 });
  assert.deepEqual(partes({ lado: "venta", total: 1180, impuesto: { tipo: "detraccion", monto: 142, quienDeposita: "nosotros" } }), { neto: 1180, impuesto: 142 });
  assert.equal(tipoMovimientoEsperado({ lado: "venta", concepto: "impuesto", impuesto: { tipo: "detraccion", quienDeposita: "nosotros" } }), "transferencia");
  assert.equal(tipoMovimientoEsperado({ lado: "venta", concepto: "impuesto", impuesto: { tipo: "retencion", quienDeposita: "cliente" } }), "retencion");
});

test("sugerirImpuesto: servicios > S/ 700 → detracción 037; si no, retención solo si somos agentes", () => {
  assert.deepEqual(sugerirImpuesto({ total: 800, hayServicios: true, esAgenteRetencion: true }), { tipo: "detraccion", codigoSunat: "037" });
  assert.deepEqual(sugerirImpuesto({ total: 800, hayServicios: false, esAgenteRetencion: true }), { tipo: "retencion", codigoSunat: "" });
  assert.deepEqual(sugerirImpuesto({ total: 800, hayServicios: false, esAgenteRetencion: true, noAplicaRetencion: true }), { tipo: "ninguno", codigoSunat: "" });
  assert.deepEqual(sugerirImpuesto({ total: 700, hayServicios: true, esAgenteRetencion: true }), { tipo: "ninguno", codigoSunat: "" });
  assert.deepEqual(sugerirImpuesto({ total: 200, moneda: "USD", tipoCambio: 3.8, hayServicios: true }), { tipo: "detraccion", codigoSunat: "037" });
});

test("impuesto de venta por defecto y etiqueta", () => {
  assert.deepEqual(impuestoVentaPorDefecto(1180), { tipo: "detraccion", codigoSunat: "037", tasa: 0.12, monto: 142 });
  assert.equal(impuestoVentaPorDefecto(700).tipo, "ninguno");
  assert.equal(etiquetaImpuesto({ tipo: "detraccion", tasa: 0.12 }), "Detracción 12%");
  assert.equal(etiquetaImpuesto({ tipo: "retencion", tasa: 0.03 }), "Retención 3%");
  assert.equal(etiquetaImpuesto(undefined), "Sin detracción / retención");
});

test("crédito, vencimiento y semáforo", () => {
  assert.equal(diasCredito("Factura a 30 días"), 30);
  assert.equal(diasCredito("CONTADO"), 0);
  assert.equal(sumarDias("2026-09-28", 30), "2026-10-28");
  assert.equal(semaforo("2026-09-27T05:00:00.000Z", true, "2026-09-28"), "vencida");
  assert.equal(semaforo("2026-10-05T05:00:00.000Z", true, "2026-09-28"), "por_vencer");
  assert.equal(semaforo("2026-10-20T05:00:00.000Z", true, "2026-09-28"), "al_dia");
  assert.equal(semaforo("2026-09-27T05:00:00.000Z", false, "2026-09-28"), null);
  const venta = { fechaCancelacion: "2026-11-30", cuotas: [{ numero: 1, pagado: true, fechaVencimiento: "2026-10-01" }, { numero: 2, pagado: false, fechaVencimiento: "2026-10-31" }] };
  assert.equal(vencimientoDe(venta, "venta"), "2026-10-31");
  assert.equal(vencimientoDe({ fechaVencimiento: "2026-10-10" }, "compra"), "2026-10-10");
});

test("filtrarFacturas por tercero, estado, vencimiento y fechas en ambos lados", () => {
  const fps = [
    { proveedorRazonSocial: "ACME SAC", proveedorRuc: "20100000001", estado: "pendiente", fechaEmision: "2026-09-01", fechaVencimiento: "2026-09-20", saldoNeto: 10, saldoImpuesto: 0 },
    { proveedorRazonSocial: "BETA SAC", proveedorRuc: "20100000002", estado: "pagada", fechaEmision: "2026-09-15", fechaVencimiento: "2026-09-30", saldoNeto: 0, saldoImpuesto: 0 },
  ];
  const hoyIso = "2026-09-28";
  assert.equal(filtrarFacturas(fps, { ...FILTROS_TESORERIA, tercero: "acme" }, { lado: "compra", hoyIso }).length, 1);
  assert.equal(filtrarFacturas(fps, { ...FILTROS_TESORERIA, tercero: "20100000002" }, { lado: "compra", hoyIso }).length, 1);
  assert.equal(filtrarFacturas(fps, { ...FILTROS_TESORERIA, estado: "pagada" }, { lado: "compra", hoyIso })[0].proveedorRazonSocial, "BETA SAC");
  assert.equal(filtrarFacturas(fps, { ...FILTROS_TESORERIA, vencimiento: "vencida" }, { lado: "compra", hoyIso }).length, 1);
  assert.equal(filtrarFacturas(fps, { ...FILTROS_TESORERIA, desde: "2026-09-10" }, { lado: "compra", hoyIso }).length, 1);
  const ventas = [{ empresa: { razonSocial: "CLIENTE SA", ruc: "20300000003" }, estadoPago: "pago parcial", fechaEmision: "2026-09-02", cuotas: [], saldoNeto: 5, saldoImpuesto: 0 }];
  assert.equal(filtrarFacturas(ventas, { ...FILTROS_TESORERIA, estado: "parcial", tercero: "cliente" }, { lado: "venta", hoyIso }).length, 1);
});

test("totales de movimientos en soles sin anulados ni transferencias", () => {
  const movs = [
    { tipo: "ingreso", monto: 100, moneda: "PEN", tipoCambio: 1 },
    { tipo: "egreso", monto: 10, moneda: "USD", tipoCambio: 3.75 },
    { tipo: "egreso", monto: 50, moneda: "PEN", tipoCambio: 1, anulado: true },
    { tipo: "transferencia", monto: 40, moneda: "PEN", tipoCambio: 1 },
  ];
  assert.deepEqual(totalesMovimientos(movs), { ingresos: 100, egresos: 37.5 });
});

test("cuentasPara filtra la cuenta de detracciones según la parte", () => {
  const cuentas = [
    { _id: "bcp", tipo: "banco", activo: true }, { _id: "caja", tipo: "caja", activo: true },
    { _id: "bn", tipo: "detracciones", activo: true }, { _id: "viejo", tipo: "banco", activo: false },
  ];
  const ids = (l) => l.map((c) => c._id);
  const detCliente = { tipo: "detraccion", quienDeposita: "cliente" };
  assert.deepEqual(ids(cuentasPara({ cuentas, lado: "compra", concepto: "neto", impuesto: detCliente }).origen), ["bcp", "caja"]);
  assert.deepEqual(ids(cuentasPara({ cuentas, lado: "venta", concepto: "impuesto", impuesto: detCliente }).origen), ["bn"]);
  const auto = cuentasPara({ cuentas, lado: "venta", concepto: "impuesto", impuesto: { tipo: "detraccion", quienDeposita: "nosotros" } });
  assert.deepEqual([ids(auto.origen), ids(auto.destino)], [["bcp", "caja"], ["bn"]]);
  assert.deepEqual(cuentasPara({ cuentas, lado: "venta", concepto: "impuesto", impuesto: { tipo: "retencion", quienDeposita: "cliente" } }), { origen: [], destino: [] });
  assert.equal(periodoDeMes("2026-09"), "202609");
});

test("fechaIsoTexto muestra un día YYYY-MM-DD como dd/mm/aaaa sin correrlo por zona horaria", () => {
  assert.equal(fechaIsoTexto("2026-09-28"), "28/09/2026");
  assert.equal(fechaIsoTexto("2026-09-28T05:00:00.000Z"), "28/09/2026");
  assert.equal(fechaIsoTexto(""), "—");
});

test("esPagoAntiguo: solo lo que no pasó por Compras (la SC vive en el Requerimiento o en el Servicio)", () => {
  assert.equal(esPagoAntiguo({ estadoPago: "pendiente_pago", requerimiento: { solicitudCompra: "sc1" } }), false);
  assert.equal(esPagoAntiguo({ estadoPago: "pendiente_pago", requerimiento: { solicitudCompra: null } }), true);
  assert.equal(esPagoAntiguo({ estadoPago: "pagado", solicitudCompra: "sc2" }), false);
  assert.equal(esPagoAntiguo({ estadoPago: "pagado", solicitudCompra: null }), true);
});

test("avisoMoneda solo avisa cuando la cuenta y la parte están en monedas distintas", () => {
  assert.equal(avisoMoneda({ nombre: "BCP Soles", moneda: "PEN" }, "PEN"), null);
  assert.equal(avisoMoneda(undefined, "USD"), null);
  assert.match(avisoMoneda({ nombre: "BCP Soles", moneda: "PEN" }, "USD"), /BCP Soles está en PEN.*USD/);
});

test("diasEntre cuenta días calendario entre dos fechas YYYY-MM-DD", () => {
  assert.equal(diasEntre("2026-09-28", "2026-10-28"), 30);
  assert.equal(diasEntre("2026-09-28", "2026-09-28"), 0);
  assert.equal(diasEntre("2026-09-28", ""), null);
});

test("estadoTcComprobante: TC SUNAT de la fecha queda solo lectura; respaldo editable con aviso; falla vacío y editable", () => {
  assert.deepEqual(estadoTcComprobante({ ok: true, datos: { venta: 3.756, fuente: "apiperu", fecha: "2026-09-28", fechaTc: "2026-09-29" } }),
    { tc: "3.756", soloLectura: true, aviso: "TC venta SUNAT para el 29/09", alerta: false });
  assert.equal(estadoTcComprobante({ ok: true, datos: { venta: 3.7, fuente: "bd", fecha: "2026-09-29" } }).soloLectura, true);
  assert.deepEqual(estadoTcComprobante({ ok: true, datos: { venta: 3.73, fuente: "respaldo", fecha: "2026-09-24", fechaTc: "2026-09-25" } }),
    { tc: "3.73", soloLectura: false, aviso: "No se pudo consultar SUNAT: se propone el último guardado, para el 25/09; revísalo", alerta: true });
  assert.equal(estadoTcComprobante({ ok: true, datos: { venta: 3.8, fuente: "vigente", fecha: null } }).aviso,
    "No se pudo consultar SUNAT: se propone el TC vigente del sistema; revísalo");
  assert.deepEqual(estadoTcComprobante({ ok: false }),
    { tc: "", soloLectura: false, aviso: "No se pudo obtener el TC SUNAT de esa fecha: escríbelo", alerta: true });
  assert.equal(estadoTcComprobante({ ok: false, mensaje: "No hay tipo de cambio de una fecha futura" }).aviso, "No hay tipo de cambio de una fecha futura: escríbelo");
});

test("tcValido: 2–6 como el servidor", () => {
  assert.equal(tcValido("3.75"), true);
  assert.equal(tcValido(""), false);
  assert.equal(tcValido("37.5"), false);
  assert.equal(tcValido("1.9"), false);
});

test("fechaConsultableTc: no consulta fechas vacías ni las que aparecen al teclear el año", () => {
  assert.equal(fechaConsultableTc("2026-09-29"), true);
  assert.equal(fechaConsultableTc(""), false);
  assert.equal(fechaConsultableTc("0002-09-29"), false);
});

test("tipos de comprobante de compra y crédito fiscal (espejo del backend)", () => {
  assert.deepEqual(TIPOS_COMPROBANTE_COMPRA.map((t) => t.valor), ["01", "02", "03", "07", "08", "12", "14"]);
  assert.equal(creditoFiscalDe({ tipoComprobante: "12", igv: 18, ticketConRuc: false }), false);
  assert.equal(creditoFiscalDe({ tipoComprobante: "12", igv: 18, ticketConRuc: true }), true);
  assert.equal(creditoFiscalDe({ tipoComprobante: "14", igv: 9 }), true);
  assert.equal(creditoFiscalDe({ tipoComprobante: "03", igv: 18 }), false);
});

test("retención de 4ta: 8 % del total en soles y su etiqueta", () => {
  assert.deepEqual(calcularImpuesto({ tipo: "retencion4ta", total: 2000 }), { tasa: 0.08, monto: 160 });
  assert.equal(etiquetaImpuesto({ tipo: "retencion4ta", tasa: 0.08 }), "Retención 4ta 8%");
});

test("sugerirImpuesto no sugiere la retención del 3 % si el comprobante no da crédito fiscal", () => {
  assert.equal(sugerirImpuesto({ total: 1000, esAgenteRetencion: true, conCreditoFiscal: false }).tipo, "ninguno");
  assert.equal(sugerirImpuesto({ total: 1000, esAgenteRetencion: true, conCreditoFiscal: true }).tipo, "retencion");
  assert.equal(sugerirImpuesto({ total: 1000, esAgenteRetencion: true }).tipo, "retencion");
});

test("etiquetaComprobante: tipo + serie-número para distinguir ticket, boleta y factura", () => {
  assert.equal(etiquetaComprobante({ tipoComprobante: "12", serie: "TK01", numero: "5" }), "Ticket / ticket POS TK01-5");
  assert.equal(etiquetaComprobante({ tipoComprobante: "01", serie: "F001", numero: "9" }), "Factura F001-9");
});

test("vistaPreviaNota: aplica hasta el saldo del origen y el resto queda a favor", () => {
  assert.deepEqual(vistaPreviaNota({ totalNota: 118, saldoOrigen: 354 }), { aplicar: 118, aFavor: 0 });
  assert.deepEqual(vistaPreviaNota({ totalNota: 118, saldoOrigen: 18 }), { aplicar: 18, aFavor: 100 });
});

test("origenesPosibles: mismo proveedor y moneda, vigentes, sin notas", () => {
  const fs = [
    { _id: "a", proveedor: { _id: "p1" }, moneda: "PEN", tipoComprobante: "01", anulada: false },
    { _id: "b", proveedor: { _id: "p1" }, moneda: "USD", tipoComprobante: "01", anulada: false },
    { _id: "c", proveedor: { _id: "p2" }, moneda: "PEN", tipoComprobante: "01", anulada: false },
    { _id: "d", proveedor: { _id: "p1" }, moneda: "PEN", tipoComprobante: "07", anulada: false },
    { _id: "e", proveedor: "p1", moneda: "PEN", tipoComprobante: "03", anulada: true },
  ];
  assert.deepEqual(origenesPosibles(fs, { proveedor: "p1", moneda: "PEN" }).map((f) => f._id), ["a"]);
});

test("creditoFiscalDe de una nota sigue a su origen", () => {
  assert.equal(creditoFiscalDe({ tipoComprobante: "07", origen: { tipoComprobante: "01", igv: 18 } }), true);
  assert.equal(creditoFiscalDe({ tipoComprobante: "08", origen: { tipoComprobante: "03", igv: 18 } }), false);
  assert.equal(creditoFiscalDe({ tipoComprobante: "07", origen: { creditoFiscal: true } }), true);
});

test("precargaDesdeSire: NC en negativo da subtotal positivo; ticket del SIRE trae RUC", async () => {
  const { precargaDesdeSire } = await import("./tesoreria.js");
  const p = precargaDesdeSire({ rucContraparte: "1", tipo: "07", serie: "FC01", numero: "5", fechaEmision: "2026-09-28", moneda: "PEN", baseImponible: -100, igv: -18, total: -118 }, []);
  assert.equal(p.subtotal, "100");
  assert.equal(p.conIgv, true);
  assert.equal(p.tipoComprobante, "07");
  assert.equal(precargaDesdeSire({ tipo: "12", total: 59, igv: 9, baseImponible: 50 }, []).ticketConRuc, true);
  assert.equal(precargaDesdeSire({ tipo: "01", total: 118, igv: 18, baseImponible: 100 }, []).ticketConRuc, false);
});

test("textoTcSire muestra los tres TC; sin SUNAT lo dice", async () => {
  const { textoTcSire } = await import("./tesoreria.js");
  assert.equal(textoTcSire({ sistema: 3.7, sire: 3.75, sunat: 3.72, fechaTc: "2026-09-25" }), "sistema 3.700 · SIRE 3.750 · SUNAT 3.720 (25/09)");
  assert.equal(textoTcSire({ sistema: 3.7, sire: 3.75, sunat: null }), "sistema 3.700 · SIRE 3.750 · SUNAT no disponible");
});

test("filasExcelResumen: una fila por comprobante, NC en negativo, crédito Sí/No", async () => {
  const { filasExcelResumen } = await import("./tesoreria.js");
  const [f] = filasExcelResumen([{ fechaEmision: "2026-09-28T05:00:00.000Z", tipoComprobante: "07", serie: "FC01", numero: "5", proveedorRuc: "1", proveedorRazonSocial: "P",
    moneda: "PEN", tipoCambio: 1, base: 100, igv: 18, total: 118, baseSoles: -100, igvSoles: -18, totalSoles: -118, creditoFiscal: true, retencion4ta: 0 }]);
  assert.equal(f["TOTAL S/"], -118);
  assert.equal(f["CRÉDITO FISCAL"], "Sí");
  assert.equal(f.FECHA, "28/09/2026");
  assert.equal(f.TIPO, "Nota de crédito");
  assert.equal(f.COMPROBANTE, "FC01-5");
});

test("textoTcSire: en una nota el TC SUNAT es el de la fecha de su comprobante", async () => {
  const { textoTcSire } = await import("./tesoreria.js");
  assert.equal(textoTcSire({ sistema: 3.7, sire: 3.75, sunat: 3.7, fechaTc: "2026-09-20", deOrigen: true }), "sistema 3.700 · SIRE 3.750 · SUNAT 3.700 (20/09, fecha del comprobante que modifica)");
});

test("admiteRetencionIgv: no en recibos de servicios públicos (14) ni en sus notas; sí en factura", async () => {
  const { admiteRetencionIgv } = await import("./tesoreria.js");
  assert.equal(admiteRetencionIgv({ tipoComprobante: "14", igv: 18 }), false);
  assert.equal(admiteRetencionIgv({ tipoComprobante: "08", igv: 18, origen: { tipoComprobante: "14", igv: 18 } }), false);
  assert.equal(admiteRetencionIgv({ tipoComprobante: "01", igv: 18 }), true);
  assert.equal(admiteRetencionIgv({ tipoComprobante: "03", igv: 18 }), false);
});

test("monedaFactura: la OC manda; sin OC, la elegida; por defecto soles", async () => {
  const { monedaFactura } = await import("./tesoreria.js");
  assert.equal(monedaFactura({ oc: { moneda: "USD" }, elegida: "PEN" }), "USD");
  assert.equal(monedaFactura({ oc: null, elegida: "USD" }), "USD");
  assert.equal(monedaFactura({ oc: {}, elegida: "" }), "PEN");
});

test("calculoVenta en dólares: detracción en soles con umbral convertido; neto en dólares", async () => {
  const { calculoVenta } = await import("./tesoreria.js");
  const c = calculoVenta({ subtotal: 1000, descuentoPct: 0, moneda: "USD", tipoCambio: 3.51 });
  assert.deepEqual(c, { base: 1000, igv: 180, total: 1180, detraccion: 497, totalAPagar: 1038.4 });
  assert.equal(calculoVenta({ subtotal: 150, moneda: "USD", tipoCambio: 3.51 }).detraccion, 0);
  assert.equal(calculoVenta({ subtotal: 1000 }).totalAPagar, 1038);
});

test("filasExcelDiferenciaCambio: partida legible con saldos y diferencia con signo", async () => {
  const { filasExcelDiferenciaCambio } = await import("./tesoreria.js");
  const filas = filasExcelDiferenciaCambio([
    { tipo: "porPagar", documento: { numero: "F002-460", tercero: "PROV" }, moneda: "USD", tcDoc: 3.53, saldoMe: 1180, librosSoles: 4165.4, cierreSoles: 4212.6, diferencia: -47.2 },
    { tipo: "cuenta", cuenta: { nombre: "BCP Dólares" }, moneda: "USD", saldoMe: 3540, librosSoles: 12295.6, cierreSoles: 12602.4, diferencia: 306.8 },
  ]);
  assert.deepEqual(filas[0], { PARTIDA: "Por pagar", DETALLE: "F002-460 · PROV", "TC DOC.": 3.53, "SALDO US$": 1180, "LIBROS S/": 4165.4, "AL CIERRE S/": 4212.6, "DIFERENCIA S/": -47.2, RESULTADO: "Pérdida" });
  assert.equal(filas[1].PARTIDA, "Cuenta en dólares");
  assert.equal(filas[1].DETALLE, "BCP Dólares");
  assert.equal(filas[1]["TC DOC."], "");
  assert.equal(filas[1].RESULTADO, "Ganancia");
});
