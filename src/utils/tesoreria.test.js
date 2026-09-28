import { test } from "node:test";
import assert from "node:assert/strict";
import {
  calcularImpuesto, partes, tipoMovimientoEsperado, sugerirImpuesto, impuestoVentaPorDefecto, etiquetaImpuesto,
  diasCredito, sumarDias, vencimientoDe, semaforo, filtrarFacturas, FILTROS_TESORERIA, totalesMovimientos, cuentasPara, periodoDeMes,
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
