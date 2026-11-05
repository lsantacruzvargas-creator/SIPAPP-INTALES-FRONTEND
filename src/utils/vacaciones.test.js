import { test } from "node:test";
import assert from "node:assert/strict";
import { ESTADOS_PERIODO, validarAjuste, filasExcelVacaciones, validarDiasVendidos } from "./vacaciones.js";

test("ESTADOS_PERIODO: un texto y una clase por cada estado del servidor", () => {
  assert.deepEqual(Object.keys(ESTADOS_PERIODO), ["en curso", "liquidado", "gozado", "vigente", "por vencer", "vencido"]);
  for (const e of Object.values(ESTADOS_PERIODO)) {
    assert.equal(typeof e.texto, "string");
    assert.match(e.clase, /bg-/);
  }
  assert.equal(ESTADOS_PERIODO.vencido.texto, "Vencido");
});

test("validarAjuste: periodo, días (entero distinto de 0, máximo 60) y motivo", () => {
  const ok = { periodoInicio: "2026-03-16", dias: "5", motivo: "Corrección" };
  assert.equal(validarAjuste(ok), "");
  assert.equal(validarAjuste({ ...ok, dias: "-3" }), "");
  assert.equal(validarAjuste({ ...ok, dias: "60" }), "");
  assert.equal(validarAjuste({ ...ok, periodoInicio: "" }), "Elige el periodo.");
  for (const dias of ["0", "61", "1.5", "", "-61", "abc"]) {
    assert.equal(validarAjuste({ ...ok, dias }), "Los días deben ser un entero distinto de 0 (máximo 60).", `dias ${dias}`);
  }
  assert.equal(validarAjuste({ ...ok, motivo: "" }), "Indica el motivo del ajuste.");
  assert.equal(validarAjuste({ ...ok, motivo: "   " }), "Indica el motivo del ajuste.");
});

test("validarDiasVendidos: entero de 0 a 15, vacío cuenta como 0", () => {
  for (const v of ["", "0", "7", "15", 3]) assert.equal(validarDiasVendidos(v), "", String(v));
  for (const v of ["16", "-1", "1.5", "abc"]) assert.equal(validarDiasVendidos(v), "Días de vacaciones vendidos: entero de 0 a 15", v);
});

test("filasExcelVacaciones: fechas dd/mm/aaaa, avisos unidos y guion sin vencimiento", () => {
  const t = { nombre: "QUISPE ANA", numDoc: "12345678", fechaIngreso: "2022-03-16", pendientes: 20, proximoVencimiento: "2027-03-15", avisos: ["a", "b"] };
  assert.deepEqual(filasExcelVacaciones([t]), [
    { Trabajador: "QUISPE ANA", Documento: "12345678", "Fecha de ingreso": "16/03/2022", "Días pendientes": 20, "Próximo vencimiento": "15/03/2027", Avisos: "a | b" },
  ]);
  const [sin] = filasExcelVacaciones([{ ...t, proximoVencimiento: null, avisos: [] }]);
  assert.equal(sin["Próximo vencimiento"], "—");
  assert.equal(sin.Avisos, "");
});
