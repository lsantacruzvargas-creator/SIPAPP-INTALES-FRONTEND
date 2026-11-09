import { test } from "node:test";
import assert from "node:assert/strict";
import { PERFIL_VACIO, errorPorcentajeQuincena, precargaAportes, aplicarPrecarga, cambiaSctrRegistrado, limiteFechaSctr, errorFechaSctr, mostrarCambioPerfil,
  beneficiosDeFormulario, cuerpoBeneficios, errorBeneficios, textoHistorialBeneficios, avisoBeneficios, conRegistroBeneficios } from "./perfilLaboral.js";

test("PERFIL_VACIO: misma forma que el del servidor, con textos vacíos en los inputs", () => {
  assert.deepEqual(Object.keys(PERFIL_VACIO), ["remype", "ciiu", "actividadIndustrial", "porcentajeQuincena", "senati", "sctr", "vidaLey", "beneficios", "cambios"]);
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

test("mostrarCambioPerfil: se esconde al marcarlo visto y reaparece con un cambio más reciente", () => {
  const cambio = { fecha: "2026-11-02T20:00:00.000Z", texto: "x" };
  assert.equal(mostrarCambioPerfil(null, ""), false);
  assert.equal(mostrarCambioPerfil(undefined, "2026-01-01T00:00:00.000Z"), false);
  assert.equal(mostrarCambioPerfil(cambio, ""), true);
  assert.equal(mostrarCambioPerfil(cambio, null), true);
  assert.equal(mostrarCambioPerfil(cambio, "basura"), true);
  assert.equal(mostrarCambioPerfil(cambio, "2026-11-02T19:59:59.000Z"), true);
  assert.equal(mostrarCambioPerfil(cambio, cambio.fecha), false);
  assert.equal(mostrarCambioPerfil(cambio, "2026-11-03T08:00:00.000Z"), false);
});

test("beneficios sociales: del servidor al formulario (mes en formato de input) y de vuelta", () => {
  assert.deepEqual(PERFIL_VACIO.beneficios, { registro: "gasto", desde: "", historial: [] });
  assert.deepEqual(beneficiosDeFormulario({ registro: "provision", desde: "202611", historial: [{ registro: "provision", desde: "202611" }] }),
    { registro: "provision", desde: "2026-11", historial: [{ registro: "provision", desde: "202611" }] });
  assert.deepEqual(beneficiosDeFormulario(undefined), { registro: "gasto", desde: "", historial: [] });
  const base = beneficiosDeFormulario({ registro: "gasto", desde: "", historial: [] });
  assert.equal(cuerpoBeneficios(base, base), undefined);
  assert.deepEqual(cuerpoBeneficios({ ...base, registro: "provision", desde: "2026-11" }, base), { registro: "provision", desde: "202611" });
  // Cambiar solo el mes también reescribe desde ese mes: se envía la elección completa.
  const prov = beneficiosDeFormulario({ registro: "provision", desde: "202611", historial: [] });
  assert.deepEqual(cuerpoBeneficios({ ...prov, desde: "2026-12" }, prov), { registro: "provision", desde: "202612" });
  assert.equal(cuerpoBeneficios(prov, prov), undefined);
});

test("beneficios sociales: el mes es obligatorio al cambiar, también para volver a gasto", () => {
  const base = beneficiosDeFormulario({ registro: "gasto", desde: "", historial: [] });
  assert.match(errorBeneficios({ ...base, registro: "provision" }, base), /desde qué mes/);
  assert.equal(errorBeneficios({ ...base, registro: "provision", desde: "2026-11" }, base), "");
  assert.equal(errorBeneficios(base, base), "");
  const prov = beneficiosDeFormulario({ registro: "provision", desde: "202611", historial: [] });
  assert.match(errorBeneficios({ ...prov, registro: "gasto", desde: "" }, prov), /desde qué mes/);
});

test("beneficios sociales: historial legible y avisos al cambiar", () => {
  assert.deepEqual(textoHistorialBeneficios([{ registro: "gasto", desde: "202605" }, { registro: "provision", desde: "202611" }]),
    ["Gasto al pagar desde 05/2026", "Provisión mensual desde 11/2026"]);
  assert.deepEqual(textoHistorialBeneficios([]), []);
  const base = beneficiosDeFormulario({ registro: "gasto", desde: "", historial: [] });
  assert.match(avisoBeneficios({ ...base, registro: "provision", desde: "2026-11" }, base), /primera planilla.*de una vez/);
  assert.equal(avisoBeneficios(base, base), "");
  const prov = beneficiosDeFormulario({ registro: "provision", desde: "202611", historial: [] });
  assert.match(avisoBeneficios({ ...prov, registro: "gasto", desde: "2027-01" }, prov), /saldos provisionados/);
});

test("beneficios sociales: cambiar el registro vacía «Rige desde» y exige elegirlo; volver al guardado recupera su mes", () => {
  const base = beneficiosDeFormulario({ registro: "provision", desde: "202606", historial: [{ registro: "provision", desde: "202606" }] });
  const gasto = conRegistroBeneficios(base, "gasto", base);
  assert.deepEqual([gasto.registro, gasto.desde, gasto.historial], ["gasto", "", base.historial]);
  assert.equal(errorBeneficios(gasto, base), "Indica desde qué mes rige el registro de beneficios sociales.");
  assert.deepEqual(cuerpoBeneficios({ ...gasto, desde: "2026-12" }, base), { registro: "gasto", desde: "202612" });
  const vuelta = conRegistroBeneficios(gasto, "provision", base);
  assert.equal(vuelta.desde, "2026-06");
  assert.equal(cuerpoBeneficios(vuelta, base), undefined);
});

test("PERFIL_VACIO: el adelanto de quincena nace en 50 % y se acepta de 0 a 100", () => {
  assert.equal(PERFIL_VACIO.porcentajeQuincena, 50);
  for (const v of [0, "0", 50, "37.5", 100]) assert.equal(errorPorcentajeQuincena(v), "");
  for (const v of ["", " ", null, "abc", -1, 101]) assert.notEqual(errorPorcentajeQuincena(v), "");
});
