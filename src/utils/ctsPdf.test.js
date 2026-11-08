import { test } from "node:test";
import assert from "node:assert/strict";
import { filasHojaCts, nombreArchivoHojasCts, nombreArchivoHojaCts, generarHojaCtsPdf } from "./ctsPdf.js";

const dep = (extra = {}) => ({ codigo: "CTS-0001", periodo: "202611", estado: "confirmado", fechaDeposito: "2026-11-14", ...extra });
const fila = (extra = {}) => ({
  trabajador: "a1",
  datos: { nombre: "QUISPE MAMANI ANA", tipoDoc: "01", numDoc: "12345678", cargo: "Soldadora", fechaIngreso: "2020-01-01", cuentaCts: { entidad: "BCP", numero: "191-1234567" } },
  rc: 2523, sexto: 418.83, rcCts: 2941.83,
  detalleRc: { basico: 2400, asignacion: 123, fijos: [{ nombre: "Bono", monto: 50 }], variables: [], promedioVariables: 0, total: 2523, gratificacion: { periodo: "202607", monto: 2513 }, fuente: "boleta" },
  desde: "2026-05-01", hasta: "2026-10-31", meses: 6, dias: 0, noComputables: 0, factor: 1, monto: 1470.92, editado: false, excluido: false,
  detalle: [{ base: 2941.83, divisor: 12, cantidad: 6, unidad: "meses", monto: 1470.92 }],
  calculado: { rc: 2523, sexto: 418.83, meses: 6, dias: 0, noComputables: 0, monto: 1470.92 }, avisos: [],
  ...extra,
});
const importe = (n) => Number(n || 0).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const empleador = { razonSocial: "INTALES SAC", ruc: "20123456789", direccion: "Av. Lima 123" };
const textoPdf = (doc) => doc.output().replace(/\\([()])/g, "$1");

test("filasHojaCts: periodo en dd/mm/aaaa, fórmula ÷ 12 × 6 meses, monto, entidad, cuenta y fecha de depósito", () => {
  const h = filasHojaCts(dep(), fila());
  assert.equal(h.periodo, "Periodo del 01/05/2026 al 31/10/2026");
  assert.ok(h.calculo.some((c) => c.texto === `${importe(2941.83)} ÷ 12 × 6 meses` && c.monto === 1470.92));
  assert.equal(h.monto, 1470.92);
  assert.equal(h.entidad, "BCP");
  assert.equal(h.cuenta, "191-1234567");
  assert.equal(h.fechaDeposito, "14/11/2026");
  assert.equal(h.tiempo, "6 meses y 0 días");
  assert.equal(h.ingreso, "01/01/2020");
});

test("filasHojaCts: sin fecha de depósito ni cuenta quedan en blanco", () => {
  const h = filasHojaCts(dep({ fechaDeposito: "" }), fila({ datos: { ...fila().datos, cuentaCts: { entidad: "", numero: "" } } }));
  assert.equal(h.fechaDeposito, "");
  assert.equal(h.entidad, "");
  assert.equal(h.cuenta, "");
});

test("filasHojaCts: sin editar muestra el desglose; la RC y el sexto salen de la fila, no de detalleRc", () => {
  const h = filasHojaCts(dep(), fila());
  assert.deepEqual(h.remuneracion.map((r) => r.texto), [
    "Remuneración básica", "Asignación familiar", "Bono", "Promedio de variables", "Remuneración computable",
    "1/6 de la gratificación de 07/2026", "Remuneración computable para CTS",
  ]);
  assert.deepEqual(h.remuneracion.map((r) => r.monto), [2400, 123, 50, 0, 2523, 418.83, 2941.83]);
});

test("filasHojaCts: con la RC editada no se imprime el desglose (podría estar desfasado)", () => {
  const h = filasHojaCts(dep(), fila({ rc: 3000, rcCts: 3418.83 }));
  assert.deepEqual(h.remuneracion.map((r) => r.texto), [
    "Remuneración computable (ajustada por el contador)", "1/6 de la gratificación de 07/2026", "Remuneración computable para CTS",
  ]);
  assert.equal(h.remuneracion[0].monto, 3000);
  assert.equal(h.remuneracion[2].monto, 3418.83);
});

test("filasHojaCts: con el sexto editado no se cita el periodo de la gratificación", () => {
  const h = filasHojaCts(dep(), fila({ sexto: 100, rcCts: 2623 }));
  assert.equal(h.remuneracion[5].texto, "1/6 de la gratificación percibida en el semestre");
  assert.equal(h.remuneracion[5].monto, 100);
});

test("filasHojaCts: días, no computables y renglones; el monto ajustado reemplaza la fórmula", () => {
  const detalle = [
    { base: 2941.83, divisor: 12, cantidad: 2, unidad: "meses", monto: 490.31 },
    { base: 2941.83, divisor: 360, cantidad: 10, unidad: "días", monto: 81.72 },
    { base: 2941.83, divisor: 360, cantidad: -3, unidad: "días no computables", monto: -24.52 },
  ];
  const h = filasHojaCts(dep(), fila({ meses: 2, dias: 10, noComputables: 3, detalle, monto: 547.51 }));
  assert.equal(h.tiempo, "2 meses y 10 días");
  assert.equal(h.noComputables, 3);
  assert.equal(h.calculo[2].texto, `menos ${importe(2941.83)} ÷ 360 × 3 días no computables`);
  const aj = filasHojaCts(dep(), fila({ editado: true, monto: 1500 }));
  assert.deepEqual(aj.calculo, [{ texto: "Monto ajustado por el contador", monto: null }]);
  assert.equal(aj.monto, 1500);
});

test("nombreArchivoHojasCts: zip o pdf con sufijo BORRADOR", () => {
  assert.equal(nombreArchivoHojasCts("202611", { zip: true }), "cts-202611.zip");
  assert.equal(nombreArchivoHojasCts("202611", { zip: true, borrador: true }), "cts-202611-BORRADOR.zip");
});

test("generarHojaCtsPdf: título, empleador, trabajador, cuenta y monto; sin marca si está confirmado", () => {
  const doc = generarHojaCtsPdf(dep(), fila(), { empleador, guardar: false });
  const t = textoPdf(doc);
  for (const s of ["LIQUIDACI", "CTS-0001", "INTALES SAC", "20123456789", "QUISPE MAMANI ANA", "12345678", "BCP", "191-1234567", "14/11/2026", `S/ ${importe(1470.92)}`, "Empleador", "Trabajador"]) {
    assert.ok(t.includes(s), s);
  }
  assert.equal(t.includes("(BORRADOR)"), false);
});

test("generarHojaCtsPdf: un borrador lleva la marca y sin fecha ni cuenta no lanza", () => {
  const doc = generarHojaCtsPdf(dep({ estado: "borrador", fechaDeposito: "" }), fila({ datos: { ...fila().datos, cuentaCts: undefined, cargo: "" } }), { empleador, guardar: false });
  assert.equal(doc.output().split("(BORRADOR)").length - 1, doc.getNumberOfPages());
});

test("nombreArchivoHojaCts: el PDF individual de un borrador lleva el sufijo BORRADOR como el zip", () => {
  assert.equal(nombreArchivoHojaCts("202611", "12345678"), "cts-202611-12345678.pdf");
  assert.equal(nombreArchivoHojaCts("202611", "12345678", { borrador: true }), "cts-202611-12345678-BORRADOR.pdf");
});

test("generarHojaCtsPdf: un nombre y una entidad muy largos se parten en líneas (no se solapan con el campo de la derecha)", () => {
  const nombre = "HUAMANCHUMO DE LA CRUZ VILLANUEVA QUISPE MAMANI SANCHEZ CARRANZA DEL AGUILA FERNANDEZ ZZFINNOMBRE";
  const entidad = "CAJA MUNICIPAL DE AHORRO Y CREDITO DE LA PROVINCIA CONSTITUCIONAL DEL CALLAO ZZFINENTIDAD";
  const doc = generarHojaCtsPdf(dep(), fila({ datos: { ...fila().datos, nombre, cuentaCts: { entidad, numero: "191-1234567" } } }), { empleador, guardar: false });
  const t = textoPdf(doc);
  assert.equal(t.includes(nombre), false);
  assert.equal(t.includes(entidad), false);
  assert.ok(t.includes("ZZFINNOMBRE"));
  assert.ok(t.includes("ZZFINENTIDAD"));
});
