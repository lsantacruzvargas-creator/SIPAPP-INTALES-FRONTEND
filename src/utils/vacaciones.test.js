import { test } from "node:test";
import assert from "node:assert/strict";
import { ESTADOS_PERIODO, validarAjuste, filasExcelVacaciones, validarDiasVendidos, periodosCargaInicial } from "./vacaciones.js";

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

test("periodosCargaInicial: ganados antes del mes de corte, con liquidado incluido y el saldo base como valor inicial", () => {
  const p = (inicio, fin, o = {}) => ({ inicio, fin, ganado: true, liquidado: false, derecho: 30, gozados: 0, vendidos: 0, ajustes: 0, saldo: 0, ...o });
  const detalle = {
    corte: "202609",
    periodos: [
      p("2023-03-16", "2024-03-15", { liquidado: true }),
      p("2024-03-16", "2025-03-15", { ajustes: 10, saldo: 10 }),
      p("2025-03-16", "2026-03-15", { gozados: 5, vendidos: 3, saldo: 12, ajustes: 0 }),
      p("2026-03-16", "2027-03-15", { saldo: 30 }),
      p("2027-03-16", "2028-03-15", { ganado: false, saldo: 30 }),
    ],
  };
  assert.deepEqual(periodosCargaInicial(detalle), [
    { periodoInicio: "2023-03-16", inicio: "2023-03-16", fin: "2024-03-15", gozados: 0, vendidos: 0, pendientes: "0" },
    { periodoInicio: "2024-03-16", inicio: "2024-03-16", fin: "2025-03-15", gozados: 0, vendidos: 0, pendientes: "10" },
    { periodoInicio: "2025-03-16", inicio: "2025-03-16", fin: "2026-03-15", gozados: 5, vendidos: 3, pendientes: "20" },
  ]);
  assert.deepEqual(periodosCargaInicial({ corte: "202609", periodos: [] }), []);
});
