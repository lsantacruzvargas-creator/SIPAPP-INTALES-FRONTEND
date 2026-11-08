import { test } from "node:test";
import assert from "node:assert/strict";
import { opcionesDeposito, totalesCts, filaEditable, validarFilaCts, cuerpoGuardarCts, hayCambiosCts, hojasDisponibles, avisosDescargaHojasCts } from "./cts.js";

const fila = (extra = {}) => ({
  trabajador: "a1", datos: { nombre: "QUISPE MAMANI ANA", numDoc: "12345678" },
  rc: 2523, sexto: 418.83, rcCts: 2941.83, meses: 6, dias: 0, noComputables: 0, monto: 1470.92, editado: false, excluido: false, motivoExclusion: "",
  calculado: { rc: 2523, sexto: 418.83, meses: 6, dias: 0, noComputables: 0, monto: 1470.92 }, avisos: [],
  ...extra,
});

test("opcionesDeposito: mayo y noviembre del año, el más reciente primero, con su semestre", () => {
  assert.deepEqual(opcionesDeposito(2026), [
    { periodo: "202611", texto: "Noviembre 2026 (may–oct 2026)" },
    { periodo: "202605", texto: "Mayo 2026 (nov 2025–abr 2026)" },
  ]);
});

test("totalesCts: suma solo las filas incluidas, redondeada, y cuenta las excluidas", () => {
  const t = totalesCts([fila({ monto: 1470.92 }), fila({ trabajador: "b", monto: 100.1 }), fila({ trabajador: "c", monto: 999, excluido: true, motivoExclusion: "x" })]);
  assert.deepEqual(t, { incluidos: 2, excluidos: 1, total: 1571.02 });
  assert.deepEqual(totalesCts([]), { incluidos: 0, excluidos: 0, total: 0 });
});

test("filaEditable: textos para los campos y sin marcas de edición", () => {
  assert.deepEqual(filaEditable(fila()), {
    trabajador: "a1", nombre: "QUISPE MAMANI ANA", rc: "2523", sexto: "418.83", meses: "6", dias: "0", noComputables: "0", monto: "1470.92",
    montoTocado: false, volverAFormula: false, excluido: false, motivoExclusion: "",
  });
});

test("validarFilaCts: importes con hasta 2 decimales, enteros en rango y motivo al excluir", () => {
  const ok = filaEditable(fila());
  assert.equal(validarFilaCts(ok), "");
  assert.match(validarFilaCts({ ...ok, rc: "" }), /remuneración computable/i);
  assert.match(validarFilaCts({ ...ok, rc: "10.123" }), /remuneración computable/i);
  assert.match(validarFilaCts({ ...ok, sexto: "-1" }), /sexto/i);
  assert.match(validarFilaCts({ ...ok, meses: "8" }), /meses/i);
  assert.match(validarFilaCts({ ...ok, meses: "1.5" }), /meses/i);
  assert.match(validarFilaCts({ ...ok, dias: "31" }), /días/i);
  assert.match(validarFilaCts({ ...ok, noComputables: "201" }), /no computables/i);
  assert.equal(validarFilaCts({ ...ok, meses: "7", dias: "30", noComputables: "200" }), "");
  assert.equal(validarFilaCts({ ...ok, monto: "abc" }), "", "el monto solo se valida si el usuario lo tocó");
  assert.match(validarFilaCts({ ...ok, monto: "abc", montoTocado: true }), /monto/i);
  assert.equal(validarFilaCts({ ...ok, monto: "0", montoTocado: true }), "");
  assert.match(validarFilaCts({ ...ok, excluido: true, motivoExclusion: " a " }), /motivo/i);
  assert.match(validarFilaCts({ ...ok, excluido: true, motivoExclusion: "x".repeat(201) }), /motivo/i);
  assert.equal(validarFilaCts({ ...ok, excluido: true, motivoExclusion: "Licencia sin goce" }), "");
});

test("cuerpoGuardarCts: números, monto solo si se tocó, editado:false al volver a la fórmula, motivo solo si está excluido", () => {
  const a = filaEditable(fila());
  const b = { ...filaEditable(fila({ trabajador: "b" })), montoTocado: true, monto: "1500.5", rc: "2600" };
  const c = { ...filaEditable(fila({ trabajador: "c", editado: true })), volverAFormula: true };
  const d = { ...filaEditable(fila({ trabajador: "d" })), excluido: true, motivoExclusion: "  Cesa pronto " };
  const { trabajadores, error } = cuerpoGuardarCts([a, b, c, d]);
  assert.equal(error, undefined);
  assert.deepEqual(trabajadores[0], { trabajador: "a1", rc: 2523, sexto: 418.83, meses: 6, dias: 0, noComputables: 0, excluido: false, motivoExclusion: "" });
  assert.deepEqual(trabajadores[1], { trabajador: "b", rc: 2600, sexto: 418.83, meses: 6, dias: 0, noComputables: 0, monto: 1500.5, excluido: false, motivoExclusion: "" });
  assert.deepEqual(trabajadores[2], { trabajador: "c", rc: 2523, sexto: 418.83, meses: 6, dias: 0, noComputables: 0, editado: false, excluido: false, motivoExclusion: "" });
  assert.deepEqual(trabajadores[3], { trabajador: "d", rc: 2523, sexto: 418.83, meses: 6, dias: 0, noComputables: 0, excluido: true, motivoExclusion: "Cesa pronto" });
});

test("cuerpoGuardarCts: el error nombra al trabajador y no hay cuerpo", () => {
  const r = cuerpoGuardarCts([filaEditable(fila()), { ...filaEditable(fila({ trabajador: "b", datos: { nombre: "ZEA ANA" } })), meses: "9" }]);
  assert.match(r.error, /^ZEA ANA: /);
  assert.equal(r.trabajadores, undefined);
});

test("hayCambiosCts: compara con lo guardado, incluidas las marcas", () => {
  const filas = [fila(), fila({ trabajador: "b" })];
  const e = filas.map(filaEditable);
  assert.equal(hayCambiosCts(e, filas), false);
  assert.equal(hayCambiosCts([e[0], { ...e[1], dias: "3" }], filas), true);
  assert.equal(hayCambiosCts([e[0], { ...e[1], volverAFormula: true }], filas), true);
  assert.equal(hayCambiosCts([e[0]], filas), true);
});

test("hojasDisponibles: las filas no excluidas de un depósito no anulado", () => {
  const filas = [fila(), fila({ trabajador: "b", excluido: true, motivoExclusion: "x" })];
  assert.equal(hojasDisponibles({ estado: "borrador", trabajadores: filas }).length, 1);
  assert.equal(hojasDisponibles({ estado: "confirmado", trabajadores: filas }).length, 1);
  assert.equal(hojasDisponibles({ estado: "anulado", trabajadores: filas }).length, 0);
});

test("avisosDescargaHojasCts: borrador, sin cuenta CTS y sin fecha de depósito", () => {
  const conCuenta = fila({ datos: { nombre: "A", numDoc: "1", cuentaCts: { entidad: "BCP", numero: "1" } } });
  const sinCuenta = fila({ trabajador: "b", datos: { nombre: "B", numDoc: "2", cuentaCts: { entidad: "", numero: "" } } });
  assert.deepEqual(avisosDescargaHojasCts({ estado: "confirmado", fechaDeposito: "2026-11-14", trabajadores: [conCuenta] }), []);
  const avisos = avisosDescargaHojasCts({ estado: "borrador", fechaDeposito: "", trabajadores: [conCuenta, sinCuenta] });
  assert.equal(avisos.length, 3);
  assert.ok(avisos[0].includes("BORRADOR"));
  assert.ok(avisos.some((a) => a.includes("1 trabajador sin cuenta CTS")));
  assert.ok(avisos.some((a) => a.includes("fecha de depósito")));
});
