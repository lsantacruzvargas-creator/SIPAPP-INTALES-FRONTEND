import { test } from "node:test";
import assert from "node:assert/strict";
import { renglonFormula, textoConformidad, fechaLarga, montoAjustado, lineasEnCero, generarLiquidacionPdf } from "./liquidacionPdf.js";

const importe = (n) => Number(n || 0).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

test("renglonFormula: base ÷ divisor × cantidad unidad", () => {
  const t = renglonFormula({ base: 5211.7, divisor: 12, cantidad: 2, unidad: "meses", monto: 868.62 });
  assert.equal(t, `${importe(5211.7)} ÷ 12 × 2 meses`);
});

test("renglonFormula: un renglón negativo se imprime con «menos», sin S/ y con cantidad positiva", () => {
  const t = renglonFormula({ base: 5211.7, divisor: 360, cantidad: -3, unidad: "días no computables", monto: -43.43 });
  assert.equal(t, `menos ${importe(5211.7)} ÷ 360 × 3 días no computables`);
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

const textoPdf = (doc) => doc.output().replace(/\\([()])/g, "$1");

const modelo = () => liq({
  bloques: {
    cts: { desde: "2025-05-01", hasta: "2025-07-18", meses: 2, dias: 18, noComputables: 0, factor: 1 },
    truncas: { desde: "2025-04-01", hasta: "2025-07-18", meses: 3, dias: 18, usados: 0, factor: 1 },
    gratificacion: { desde: "2025-07-01", hasta: "2025-07-18", meses: 0, factor: 1, tasaBonificacion: 9, semestre: 2 },
  },
  bases: { basico: 4354.17, asignacion: 113, fijos: [], promedioVariables: 0, rcVacaciones: 4467.17, sextoGratificacion: 744.53, rcCts: 5211.7, rcGratificacion: 4467.17 },
  lineas: [
    { clave: "cts", codigo: "0904", descripcion: "CTS trunca", tipo: "ingreso", monto: 1129.2, origen: "propuesta", editada: false,
      detalle: [{ base: 5211.7, divisor: 12, cantidad: 2, unidad: "meses", monto: 868.62 }, { base: 5211.7, divisor: 360, cantidad: 18, unidad: "días", monto: 260.58 }] },
    { clave: "truncas", codigo: "0114", descripcion: "Vacaciones truncas", tipo: "ingreso", monto: 1340.15, origen: "propuesta", editada: false,
      detalle: [{ base: 4467.17, divisor: 12, cantidad: 3, unidad: "meses", monto: 1116.79 }, { base: 4467.17, divisor: 360, cantidad: 18, unidad: "días", monto: 223.36 }] },
  ],
  quitadas: [],
  descuentos: [{ codigo: "0607", nombre: "SISTEMA NACIONAL DE PENSIONES - D.L.19990", monto: 174.22, base: 1340.15, tasa: 13 }],
  totales: { ingresos: 2469.35, descuentos: 0, leyes: 174.22, neto: 2295.13 }, totalEnLetras: "DOS MIL DOSCIENTOS NOVENTA Y CINCO Y 13/100 SOLES",
});

test("lineasEnCero: la gratificación con 0 meses y su bonificación salen en 0 con la fórmula del bloque", () => {
  const m = modelo();
  const ceros = lineasEnCero(m);
  assert.deepEqual(ceros.map((l) => l.clave), ["gratificacion", "bonificacion"]);
  assert.deepEqual(ceros[0].detalle, [{ base: 4467.17, divisor: 6, cantidad: 0, unidad: "meses", monto: 0 }]);
  assert.deepEqual(ceros[1].detalle, [{ base: 0, divisor: 100, cantidad: 9, unidad: "%", monto: 0 }]);
});

test("lineasEnCero: respeta quitadas, el factor de pequeña empresa y los bloques que no existen", () => {
  const m = modelo();
  assert.deepEqual(lineasEnCero({ ...m, quitadas: ["gratificacion"] }), []);
  assert.deepEqual(lineasEnCero({ ...m, quitadas: ["bonificacion"] }).map((l) => l.clave), ["gratificacion"]);
  const pequena = lineasEnCero({ ...m, bloques: { ...m.bloques, gratificacion: { ...m.bloques.gratificacion, factor: 0.5 } } });
  assert.equal(pequena[0].detalle[0].divisor, 12);
  assert.deepEqual(lineasEnCero({ ...m, bloques: { gratificacion: { ...m.bloques.gratificacion, factor: 0 } } }), []);
  const sinLineas = lineasEnCero({ ...m, lineas: [], bloques: { cts: { ...m.bloques.cts, noComputables: 3 } } });
  assert.deepEqual(sinLineas[0].detalle.map((r) => r.cantidad), [2, 18, -3]);
});

test("generarLiquidacionPdf: el modelo con gratificación en 0 muestra las secciones 1 a 5, el rango y 0.00, en una sola hoja", () => {
  const doc = generarLiquidacionPdf(modelo(), opciones);
  const texto = textoPdf(doc);
  assert.equal(doc.getNumberOfPages(), 1);
  const posiciones = ["1. Remuneraci", "2. CTS trunca (01/05/2025 al 18/07/2025)", "3. Vacaciones", "4. Gratificaci", "(01/07/2025 al 18/07/2025)", "5. Bonificaci", "TOTAL INGRESOS", "TOTAL A RECIBIR", "Lima, 18 de julio de 2025"].map((t) => {
    const i = texto.indexOf(t);
    assert.ok(i >= 0, t);
    return i;
  });
  assert.deepEqual(posiciones, [...posiciones].sort((a, b) => a - b));
  assert.ok(texto.includes(`(${importe(0)})`));
  assert.ok(texto.includes("(Descuentos)"));
  assert.ok(texto.includes(`${importe(4467.17)} ÷ 6 × 0 meses`));
});

test("generarLiquidacionPdf: una gratificación quitada no sale; sin descuentos no hay título «Descuentos»", () => {
  const texto = textoPdf(generarLiquidacionPdf({ ...modelo(), quitadas: ["gratificacion"], descuentos: [], totales: { ingresos: 2469.35, descuentos: 0, leyes: 0, neto: 2469.35 } }, opciones));
  assert.equal(texto.includes("4. Gratificaci"), false);
  assert.equal(texto.includes("5. Bonificaci"), false);
  assert.equal(texto.includes("(Descuentos)"), false);
  assert.equal(texto.includes("TOTAL DESCUENTOS"), false);
  assert.ok(texto.includes("(TOTAL INGRESOS)"));
});

test("generarLiquidacionPdf: TOTAL A RECIBIR, conformidad y firma no se parten entre hojas", () => {
  const muchas = Array.from({ length: 38 }, (_, i) => ({ codigo: "0118", descripcion: `Otro ${i}`, tipo: "ingreso", monto: 10, origen: "manual", editada: false }));
  const doc = generarLiquidacionPdf({ ...modelo(), lineas: [...modelo().lineas, ...muchas] }, opciones);
  const n = doc.getNumberOfPages();
  assert.ok(n >= 2);
  const paginas = Array.from({ length: n }, (_, i) => doc.internal.pages[i + 1].join("\n"));
  const bloque = ["TOTAL A RECIBIR", "Boleta de Pago", "Lima, 18"];
  const conAlguno = paginas.filter((t) => bloque.some((x) => t.includes(x)));
  assert.equal(conAlguno.length, 1);
  assert.ok(bloque.every((x) => conAlguno[0].includes(x)));
});
