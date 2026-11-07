import { test } from "node:test";
import assert from "node:assert/strict";
import { renglonFormula, textoConformidad, fechaLarga, montoAjustado, generarLiquidacionPdf } from "./liquidacionPdf.js";

const importe = (n) => Number(n || 0).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

test("renglonFormula: base ÷ divisor × cantidad unidad", () => {
  const t = renglonFormula({ base: 5211.7, divisor: 12, cantidad: 2, unidad: "meses", monto: 868.62 });
  assert.equal(t, `${importe(5211.7)} ÷ 12 × 2 meses`);
});

test("renglonFormula: un renglón negativo se imprime con signo menos y cantidad positiva", () => {
  const t = renglonFormula({ base: 5211.7, divisor: 360, cantidad: -3, unidad: "días no computables", monto: -43.43 });
  assert.equal(t, `- S/ ${importe(5211.7)} ÷ 360 × 3 días no computables`);
});

test("textoConformidad: razón social, total y la boleta del mes en mayúsculas", () => {
  const t = textoConformidad({ razonSocial: "INTALES", total: 2295.13, periodo: "202507" });
  assert.ok(t.includes("INTALES"));
  assert.ok(t.includes(`S/ ${importe(2295.13)}`));
  assert.ok(t.includes("Boleta de Pago del mes de JULIO de 2025"));
  assert.ok(t.startsWith("He recibido de la empresa INTALES la suma de"));
  assert.ok(t.endsWith("firmo en señal de conformidad."));
});

test("fechaLarga: día, mes en minúsculas y año", () => {
  assert.equal(fechaLarga("2025-07-18"), "18 de julio de 2025");
  assert.equal(fechaLarga("2026-01-05"), "5 de enero de 2026");
});

test("montoAjustado: editada, o el monto no sale de la fórmula", () => {
  const detalle = [{ monto: 868.62 }, { monto: 260.59 }];
  assert.equal(montoAjustado({ editada: false, monto: 1129.2, detalle }), false);
  assert.equal(montoAjustado({ editada: true, monto: 1129.2, detalle }), true);
  assert.equal(montoAjustado({ editada: false, monto: 1500, detalle }), true);
  assert.equal(montoAjustado({ editada: false, monto: 1500 }), false);
});

const liq = (extra = {}) => ({
  codigo: "LBS-0001", estado: "confirmada", periodo: "202507", fechaIngreso: "2018-04-01", fechaCese: "2025-07-18", motivoCese: "01",
  datos: { nombre: "QUISPE MAMANI ANA", tipoDoc: "01", numDoc: "12345678", cargo: "Soldadora" }, pension: { regimen: "onp" },
  periodoTrabajo: "7 años 3 meses 18 días", observaciones: "Pago por transferencia",
  bases: { basico: 4354.17, asignacion: 113, fijos: [{ codigo: "0201", nombre: "Bono", monto: 0 }], promedioVariables: 0, rcVacaciones: 4467.17, sextoGratificacion: 744.53, rcCts: 5211.7 },
  bloques: { cts: { desde: "2025-05-01", hasta: "2025-07-18", meses: 2, dias: 18 }, gratificacion: { desde: "2025-07-01", hasta: "2025-07-18", meses: 0 } },
  lineas: [
    { clave: "cts", codigo: "0904", descripcion: "CTS trunca", tipo: "ingreso", monto: 1129.2, origen: "propuesta", editada: false,
      detalle: [{ base: 5211.7, divisor: 12, cantidad: 2, unidad: "meses", monto: 868.62 }, { base: 5211.7, divisor: 360, cantidad: 18, unidad: "días", monto: 260.59 }] },
    { clave: "truncas", codigo: "0114", descripcion: "Vacaciones truncas", tipo: "ingreso", monto: 1340.15, origen: "propuesta", editada: true },
    { codigo: "0701", descripcion: "Adelanto", tipo: "descuento", monto: 100, origen: "manual", editada: false },
  ],
  descuentos: [{ codigo: "0607", nombre: "SISTEMA NACIONAL DE PENSIONES - D.L.19990", monto: 174.22, base: 1340.15, tasa: 13 }, { codigo: "0605", nombre: "Retención de 5.ª categoría", monto: -12.5, base: -100, tasa: null }],
  totales: { ingresos: 2469.35, descuentos: 100, leyes: 161.72, neto: 2207.63 }, totalEnLetras: "DOS MIL DOSCIENTOS SIETE Y 63/100 SOLES",
  confirmadaEn: "2025-07-19T03:30:00.000Z",
  ...extra,
});
const opciones = { empleador: { razonSocial: "INTALES SAC", ruc: "20123456789", direccion: "Av. Lima 123" }, afps: {}, motivosBaja: [{ codigo: "01", nombre: "Renuncia" }], guardar: false };

test("generarLiquidacionPdf: una liquidación confirmada genera el documento con los textos clave y sin marca", () => {
  const doc = generarLiquidacionPdf(liq(), opciones);
  const texto = doc.output();
  assert.ok(doc.getNumberOfPages() >= 1);
  for (const t of ["LIQUIDACI", "LBS-0001", "INTALES SAC", "Renuncia", "Monto ajustado por el contador", "TOTAL A RECIBIR", "Lima, 18 de julio de 2025"]) {
    assert.ok(texto.includes(t), t);
  }
  assert.equal(texto.includes("(BORRADOR)"), false);
});

test("generarLiquidacionPdf: un borrador usa vistaPrevia y lleva la marca en todas las páginas", () => {
  const b = liq({ estado: "borrador", descuentos: [], totales: undefined, totalEnLetras: "", confirmadaEn: null,
    vistaPrevia: { descuentos: [{ codigo: "0607", nombre: "ONP", monto: 174.22, base: 1340.15, tasa: 13 }], totales: { ingresos: 2469.35, descuentos: 100, leyes: 174.22, neto: 2195.13 }, totalEnLetras: "X" } });
  const doc = generarLiquidacionPdf(b, opciones);
  assert.equal(doc.output().split("(BORRADOR)").length - 1, doc.getNumberOfPages());
});

test("generarLiquidacionPdf: sin motivo, sin observaciones, sin CTS y con muchas líneas no lanza", () => {
  const muchas = Array.from({ length: 60 }, (_, i) => ({ codigo: "0118", descripcion: `Otro ${i}`, tipo: "ingreso", monto: 10, origen: "manual", editada: false }));
  const doc = generarLiquidacionPdf(liq({ motivoCese: "", observaciones: "", bloques: {}, lineas: muchas }), opciones);
  assert.ok(doc.getNumberOfPages() > 1);
});
