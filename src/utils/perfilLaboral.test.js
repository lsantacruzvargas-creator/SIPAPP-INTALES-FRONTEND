import { test } from "node:test";
import assert from "node:assert/strict";
import { PERFIL_VACIO, precargaAportes, aplicarPrecarga, cambiaSctrRegistrado, limiteFechaSctr, errorFechaSctr } from "./perfilLaboral.js";

test("PERFIL_VACIO: misma forma que el del servidor, con textos vacíos en los inputs", () => {
  assert.deepEqual(Object.keys(PERFIL_VACIO), ["remype", "ciiu", "actividadIndustrial", "senati", "sctr", "vidaLey", "cambios"]);
  assert.equal(PERFIL_VACIO.sctr.salud.entidad, "essalud");
  assert.equal(PERFIL_VACIO.sctr.pension.entidad, "onp");
  assert.equal(PERFIL_VACIO.sctr.salud.tasa, "");
  assert.equal(PERFIL_VACIO.sctr.pension.tasa, "");
  assert.equal(PERFIL_VACIO.vidaLey.valor, "");
  assert.equal(PERFIL_VACIO.vidaLey.calculo, "tasa");
  assert.equal(PERFIL_VACIO.vidaLey.vigenciaDesde, "");
  assert.equal(PERFIL_VACIO.remype.desde, "");
  assert.equal(PERFIL_VACIO.senati.aporta, false);
  assert.equal(PERFIL_VACIO.sctr.actividadRiesgo, false);
});

test("precarga por categoría ocupacional: obrero marcado, empleado y ejecutivo no", () => {
  assert.deepEqual(precargaAportes("01", {}), { senati: true, sctr: true });
  assert.deepEqual(precargaAportes("02", {}), { senati: false, sctr: false });
  assert.deepEqual(precargaAportes("03", {}), { senati: false, sctr: false });
  assert.deepEqual(precargaAportes("", {}), { senati: false, sctr: false });
  assert.deepEqual(precargaAportes(undefined), { senati: false, sctr: false });
});

test("empresa industrial: SENATI marcado para todos, SCTR sigue a la categoría", () => {
  const industrial = { actividadIndustrial: true };
  assert.deepEqual(precargaAportes("01", industrial), { senati: true, sctr: true });
  assert.deepEqual(precargaAportes("02", industrial), { senati: true, sctr: false });
  assert.deepEqual(precargaAportes("03", industrial), { senati: true, sctr: false });
});

test("aplicarPrecarga solo cambia las casillas que el usuario no tocó", () => {
  const perfil = { actividadIndustrial: false };
  const form = { nombres: "Ana", tregistro: { categoriaOcupacional: "01" }, aportes: { senati: false, sctr: false } };
  assert.deepEqual(aplicarPrecarga(form, {}, perfil).aportes, { senati: true, sctr: true });
  assert.deepEqual(aplicarPrecarga(form, { sctr: true }, perfil).aportes, { senati: true, sctr: false });
  assert.deepEqual(aplicarPrecarga(form, { senati: true, sctr: true }, perfil).aportes, { senati: false, sctr: false });

  const aObrero = { ...form, aportes: { senati: true, sctr: true }, tregistro: { categoriaOcupacional: "02" } };
  assert.deepEqual(aplicarPrecarga(aObrero, { senati: true }, perfil).aportes, { senati: true, sctr: false });
  assert.equal(aplicarPrecarga(form, {}, perfil).nombres, "Ana");
  assert.deepEqual(form.aportes, { senati: false, sctr: false });
});

test("cambiaSctrRegistrado: solo si la casilla SCTR cambió y el alta ya está registrada o no tiene estado", () => {
  const form = (sctr) => ({ aportes: { senati: false, sctr } });
  const guardado = (sctr, alta) => ({ aportes: { senati: false, sctr }, estado: alta ? { alta, baja: "ninguna" } : undefined });

  assert.equal(cambiaSctrRegistrado(guardado(false, "registrada"), form(true)), true);
  assert.equal(cambiaSctrRegistrado(guardado(true, "registrada"), form(false)), true);
  assert.equal(cambiaSctrRegistrado(guardado(false, undefined), form(true)), true);
  assert.equal(cambiaSctrRegistrado(guardado(false, "registrada"), form(false)), false);
  assert.equal(cambiaSctrRegistrado(guardado(true, "registrada"), form(true)), false);
  assert.equal(cambiaSctrRegistrado(guardado(false, "sin control"), form(true)), true);
  assert.equal(cambiaSctrRegistrado(guardado(false, "pendiente"), form(true)), false);
  assert.equal(cambiaSctrRegistrado(guardado(false, "anulada"), form(true)), false);
  assert.equal(cambiaSctrRegistrado({ estado: { alta: "registrada" } }, form(false)), false);
});

test("cambiaSctrRegistrado: con la baja registrada el servidor no crea modificación", () => {
  const form = { aportes: { senati: false, sctr: true } };
  const guardado = (alta, baja) => ({ aportes: { senati: false, sctr: false }, estado: { alta, baja } });
  assert.equal(cambiaSctrRegistrado(guardado("registrada", "registrada"), form), false);
  assert.equal(cambiaSctrRegistrado(guardado("sin control", "registrada"), form), false);
  assert.equal(cambiaSctrRegistrado(guardado("registrada", "pendiente"), form), true);
  assert.equal(cambiaSctrRegistrado(guardado("registrada", "ninguna"), form), true);
});

test("aplicarPrecarga: sin perfil (aún no cargó) no falla y usa la categoría sola", () => {
  const form = { tregistro: { categoriaOcupacional: "01" }, aportes: { senati: false, sctr: false } };
  assert.deepEqual(aplicarPrecarga(form, {}, null).aportes, { senati: true, sctr: true });
  assert.deepEqual(aplicarPrecarga(form, undefined, undefined).aportes, { senati: true, sctr: true });
});

test("limiteFechaSctr: inicio de cobertura hasta +30 días, cierre hasta +5 (incluso cruzando mes y año)", () => {
  assert.equal(limiteFechaSctr("2026-11-03", { cierra: false }), "2026-12-03");
  assert.equal(limiteFechaSctr("2026-11-03", { cierra: true }), "2026-11-08");
  assert.equal(limiteFechaSctr("2026-12-28", { cierra: true }), "2027-01-02");
  assert.equal(limiteFechaSctr("2028-02-10", { cierra: false }), "2028-03-11");
});

test("errorFechaSctr: acepta hasta el límite, rechaza el día siguiente y la fecha vacía", () => {
  const hoy = "2026-11-03";
  assert.equal(errorFechaSctr("2026-12-03", hoy, { cierra: false }), "");
  assert.match(errorFechaSctr("2026-12-04", hoy, { cierra: false }), /30 días/);
  assert.equal(errorFechaSctr("2026-11-08", hoy, { cierra: true }), "");
  assert.match(errorFechaSctr("2026-11-09", hoy, { cierra: true }), /5 días/);
  assert.equal(errorFechaSctr("2026-10-01", hoy, { cierra: true }), "");
  assert.match(errorFechaSctr("", hoy, { cierra: false }), /Indica la fecha/);
});
