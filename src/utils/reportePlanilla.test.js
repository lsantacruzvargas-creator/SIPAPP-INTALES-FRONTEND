import { test } from "node:test";
import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import { COLUMNAS_REPORTE, NOMBRES_SUSPENSION, GRUPOS_DIAS, filasReportePlanilla, hojaRecord, nombreHoja, libroReporte, libroRecord, tituloMes } from "./reportePlanilla.js";

const boleta = (numDoc = "45678901", extra = {}) => ({
  datos: { nombre: "PEREZ GOMEZ JUAN", numDoc, tipoDoc: "01", cargo: "Operario", area: "produccion", fechaIngreso: "2024-03-01" },
  dias: { vinculo: 30, noPagados: 3, remunerados: 27, vacaciones: 5, efectivos: 15 },
  asistencia: {
    suspensiones: [{ tipo: "23", dias: 5 }, { tipo: "20", dias: 2 }, { tipo: "21", dias: 3 }, { tipo: "07", dias: 1 }, { tipo: "05", dias: 2 }],
    horasExtras25: 4, horasExtras35: 2, diasVendidos: 3, minutosTardanza: 45,
  },
  conceptos: [
    { codigo: "0121", nombre: "Remuneración básica", tipo: "ingreso", monto: 3000 },
    { codigo: "0704", nombre: "Tardanzas", tipo: "descuento", monto: 12.5 },
    { codigo: "0607", nombre: "ONP", tipo: "aporteTrabajador", monto: 390 },
  ],
  totales: { ingresos: 3000, descuentos: 112.5, aportesTrabajador: 390, neto: 2497.5, aportesEmpleador: 270 },
  ...extra,
});
const contexto = { empleador: { razonSocial: "INTALES SAC", ruc: "20123456789" }, periodo: "202611", cerrada: false };
const valor = (filas, clave) => filas[0][clave];

test("reporte: agrupa los días por tipo y toma minutos y 0704", () => {
  const { filas } = filasReportePlanilla([boleta()]);
  assert.equal(valor(filas, "vacaciones"), 5);
  assert.equal(valor(filas, "descansoMedico"), 2);
  assert.equal(valor(filas, "subsidios"), 3);
  assert.equal(valor(filas, "faltas"), 1);
  assert.equal(valor(filas, "licenciasSinGoce"), 2);
  assert.equal(valor(filas, "licenciasConGoce"), 0);
  assert.equal(valor(filas, "minutosTardanza"), 45);
  assert.equal(valor(filas, "descuentoTardanza"), 12.5);
  assert.equal(valor(filas, "descuentos"), 502.5);
  assert.equal(valor(filas, "neto"), 2497.5);
});

test("reporte: totales de dos boletas; boleta antigua sin minutos ni días da 0", () => {
  const antigua = { datos: { nombre: "RAMOS LUIS", numDoc: "11111111" }, conceptos: [], totales: { ingresos: 1000, descuentos: 100, aportesTrabajador: 130, neto: 770, aportesEmpleador: 90 } };
  const { filas, totales } = filasReportePlanilla([boleta(), antigua]);
  for (const c of COLUMNAS_REPORTE.filter((c) => c.numero && !["ingresos", "descuentos", "neto", "aportesEmpleador"].includes(c.clave))) {
    assert.equal(filas[1][c.clave], 0, c.clave);
  }
  assert.equal(filas[1].cargo, "");
  assert.equal(totales.minutosTardanza, 45);
  assert.equal(totales.ingresos, 4000);
  assert.equal(totales.descuentos, 732.5);
  assert.equal(totales.neto, 3267.5);
  assert.equal(totales.aportesEmpleador, 360);
  assert.equal(totales.descuentoTardanza, 12.5);
  assert.ok(!("documento" in totales));
});

test("récord: lista cada suspensión con su nombre, cada concepto y el neto", () => {
  const filas = hojaRecord(boleta(), contexto);
  assert.deepEqual(filas.find((f) => f[0] === "07 Falta no justificada"), ["07 Falta no justificada", 1]);
  assert.ok(filas.some((f) => f[0] === "20 Enfermedad o accidente (primeros 20 días)" && f[1] === 2));
  assert.ok(filas.some((f) => f[0] === "21 Incapacidad temporal subsidiada por EsSalud" && f[1] === 3));
  assert.ok(filas.some((f) => String(f[0]).startsWith("0704") && f[1] === 12.5));
  assert.deepEqual(filas.find((f) => f[0] === "Neto a pagar"), ["Neto a pagar", 2497.5]);
  assert.deepEqual(filas.find((f) => f[0] === "Descuentos (sin aportes)"), ["Descuentos (sin aportes)", 112.5]);
  assert.ok(!filas.some((f) => f[0] === "Total descuentos"));
  assert.ok(filas.some((f) => f[0] === "Récord de planilla – Noviembre 2026"));
  assert.deepEqual(filas.find((f) => f[0] === "RUC"), ["RUC", "20123456789"]);
  assert.deepEqual(filas.find((f) => f[0] === "Estado de la planilla"), ["Estado de la planilla", "Borrador"]);
  assert.deepEqual(filas.find((f) => f[0] === "Fecha de ingreso"), ["Fecha de ingreso", "01/03/2024"]);
  assert.ok(!filas.some((f) => f[0] === "Fecha de cese"));
});

test("récord: boleta antigua sin asistencia ni días no rompe", () => {
  const filas = hojaRecord({ datos: { nombre: "X", numDoc: "1" }, conceptos: [], totales: { neto: 5 } }, { ...contexto, cerrada: true });
  assert.deepEqual(filas.find((f) => f[0] === "Tardanza (minutos)"), ["Tardanza (minutos)", 0]);
  assert.deepEqual(filas.find((f) => f[0] === "Estado de la planilla"), ["Estado de la planilla", "Cerrada"]);
});

test("hojas: nombres válidos y únicos", () => {
  const usados = new Set();
  const a = nombreHoja("12/34:56", usados);
  assert.ok(!/[:\/?*[\]]/.test(a));
  const b = nombreHoja("45678901", usados);
  const c = nombreHoja("45678901", usados);
  assert.notEqual(b, c);
  const largo = "A".repeat(40);
  const d = nombreHoja(largo, usados), e = nombreHoja(largo, usados);
  assert.ok(d.length <= 31 && e.length <= 31);
  assert.notEqual(d, e);
  assert.equal(nombreHoja("", usados).length > 0, true);
});

test("tituloMes: mes en español", () => {
  assert.equal(tituloMes("202611"), "Noviembre 2026");
  assert.equal(tituloMes("202601"), "Enero 2026");
});

test("libro en masa: «Reporte» y una hoja por trabajador", () => {
  const wb = libroReporte([boleta("45678901"), boleta("22222222")], contexto);
  assert.deepEqual(wb.SheetNames, ["Reporte", "45678901", "22222222"]);
  const filas = XLSX.utils.sheet_to_json(wb.Sheets.Reporte, { header: 1, defval: "" });
  assert.deepEqual(filas.slice(0, 5).map((f) => f[0]), ["INTALES SAC", "RUC 20123456789", "Reporte de planilla – Noviembre 2026", "Estado de la planilla: En borrador", ""]);
  const cabecera = filas[5];
  assert.equal(cabecera[0], "Documento");
  assert.equal(filas.length, 9);
  assert.equal(String(filas.at(-1)[0]), "TOTAL");
  assert.equal(filas.at(-1)[cabecera.indexOf("Neto a pagar")], 4995);
  assert.equal(filas.at(-1)[cabecera.indexOf("Total descuentos (incl. aportes)")], 1005);
  assert.ok(wb.Sheets.Reporte["!cols"].length >= COLUMNAS_REPORTE.length);
  const cerrado = XLSX.utils.sheet_to_json(libroReporte([boleta()], { ...contexto, cerrada: true }).Sheets.Reporte, { header: 1, defval: "" });
  assert.equal(cerrado[3][0], "Estado de la planilla: Cerrada");
});

test("cada tipo de suspensión pertenece a exactamente un grupo de días", () => {
  for (const tipo of Object.keys(NOMBRES_SUSPENSION)) {
    const grupos = Object.entries(GRUPOS_DIAS).filter(([, tipos]) => tipos.includes(tipo));
    assert.equal(grupos.length, 1, tipo);
  }
});

test("libro de una persona: solo su hoja", () => {
  const wb = libroRecord(boleta("45678901"), contexto);
  assert.deepEqual(wb.SheetNames, ["45678901"]);
});
