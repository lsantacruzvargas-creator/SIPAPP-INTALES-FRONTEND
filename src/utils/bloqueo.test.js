import { test } from "node:test";
import assert from "node:assert/strict";
import { mensajeOcupado, huboActividad, avisoDeRespuesta, cabecerasBloqueo, versionTrasAccion, pasoAutoEditar, tomaVigente, resultadoConsulta, edicionPerdida, errorDelFormulario } from "./bloqueo.js";

test("mensajeOcupado: hora de Lima y otra ventana propia", () => {
  assert.equal(mensajeOcupado({ ocupado: true, usuarioNombre: "Ana", tomadoEn: "2026-09-28T15:32:00Z" }), "En edición por Ana desde las 10:32");
  assert.equal(mensajeOcupado({ ocupado: true, propio: true }), "En edición por ti en otra ventana");
});

test("huboActividad: dentro del último minuto", () => {
  assert.equal(huboActividad(1000, 50000), true);
  assert.equal(huboActividad(1000, 62000), false);
});

test("avisoDeRespuesta distingue ocupado (423) y cambio (409 con cambio)", () => {
  assert.deepEqual(avisoDeRespuesta(423, { mensaje: "En edición por Ana desde las 10:32" }), { tipo: "ocupado", mensaje: "En edición por Ana desde las 10:32" });
  assert.deepEqual(avisoDeRespuesta(409, { cambio: true, mensaje: "cambió" }), { tipo: "cambio", mensaje: "cambió" });
  assert.equal(avisoDeRespuesta(409, { recalculo: {} }), null);
  assert.equal(avisoDeRespuesta(200, {}), null);
});

test("cabecerasBloqueo incluye la versión solo si la hay", () => {
  assert.deepEqual(cabecerasBloqueo("k1"), { "X-Bloqueo": "k1" });
  assert.deepEqual(cabecerasBloqueo("k1", "2026-09-28T15:00:00.000Z"), { "X-Bloqueo": "k1", "X-Version": "2026-09-28T15:00:00.000Z" });
});

test("versionTrasAccion: desde lectura no adopta la versión nueva si el formulario ya estaba viejo", () => {
  assert.equal(versionTrasAccion({ editando: true, versionFormulario: "v1", versionPrevia: "v1", versionNueva: "v2" }), "v2");
  assert.equal(versionTrasAccion({ editando: false, versionFormulario: "v1", versionTomada: "v1", versionNueva: "v2" }), "v2");
  assert.equal(versionTrasAccion({ editando: false, versionFormulario: "v1", versionTomada: "v3", versionNueva: "v4" }), "v1");
});

test("pasoAutoEditar: toma una sola vez al abrir libre; si lo abrió ocupado no retoma al liberarse", () => {
  assert.equal(pasoAutoEditar({ autoEditar: false, estado: "lectura", intentado: null, documento: "a" }), null);
  assert.equal(pasoAutoEditar({ autoEditar: true, estado: "cargando", intentado: null, documento: "a" }), null);
  assert.equal(pasoAutoEditar({ autoEditar: true, estado: "lectura", intentado: null, documento: "a" }), "editar");
  assert.equal(pasoAutoEditar({ autoEditar: true, estado: "ocupado", intentado: null, documento: "a" }), "marcar");
  assert.equal(pasoAutoEditar({ autoEditar: true, estado: "lectura", intentado: "a", documento: "a" }), null);
  assert.equal(pasoAutoEditar({ autoEditar: true, estado: "lectura", intentado: "a", documento: "b" }), "editar");
  assert.equal(pasoAutoEditar({ autoEditar: true, estado: "lectura", intentado: null, documento: null }), null);
});

test("tomaVigente: la respuesta de tomar solo se aplica si el formulario sigue en ese documento", () => {
  assert.equal(tomaVigente({ documentoPedido: "a", documentoActual: "a" }), true);
  assert.equal(tomaVigente({ documentoPedido: "a", documentoActual: null }), false);
  assert.equal(tomaVigente({ documentoPedido: "a", documentoActual: "b" }), false);
});

test("resultadoConsulta: libre → lectura, tomado → ocupado, y si la consulta falla → error con el motivo", () => {
  assert.deepEqual(resultadoConsulta({ ok: true, data: { ocupado: false } }), { estado: "lectura", mensaje: "" });
  assert.equal(resultadoConsulta({ ok: true, data: { ocupado: true, propio: true } }).estado, "ocupado");
  const caido = resultadoConsulta({ errorRed: true });
  assert.equal(caido.estado, "error");
  assert.match(caido.mensaje, /sin conexión/);
  const noExiste = resultadoConsulta({ ok: false, status: 404, data: { mensaje: "Documento no encontrado" } });
  assert.equal(noExiste.estado, "error");
  assert.match(noExiste.mensaje, /Documento no encontrado/);
  assert.match(resultadoConsulta({ ok: false, status: 500, data: null }).mensaje, /500/);
});

test("edicionPerdida: un 423 mientras se edita significa que el bloqueo propio venció", () => {
  assert.equal(edicionPerdida({ editando: false, status: 423, data: {} }), null);
  assert.equal(edicionPerdida({ editando: true, status: 409, data: { cambio: true } }), null);
  assert.equal(edicionPerdida({ editando: true, status: 200, data: {} }), null);
  const vencido = edicionPerdida({ editando: true, status: 423, data: { mensaje: "El documento no está tomado para edición" } });
  assert.match(vencido, /se liberó/);
  assert.match(vencido, /Retomar edición/);
  const tomadoPorOtro = edicionPerdida({ editando: true, status: 423, data: { mensaje: "En edición por Ana desde las 10:32" } });
  assert.match(tomadoPorOtro, /se liberó/);
  assert.match(tomadoPorOtro, /En edición por Ana/);
});

test("errorDelFormulario: lo que ya muestra la barra (423, 409 'cambió') no se repite en el formulario", () => {
  assert.equal(errorDelFormulario(423, { mensaje: "En edición por Ana" }, "x"), null);
  assert.equal(errorDelFormulario(409, { mensaje: "Este documento cambió", cambio: true }, "x"), null);
  assert.equal(errorDelFormulario(409, { mensaje: "Ya existe" }, "x"), "Ya existe");
  assert.equal(errorDelFormulario(400, { mensaje: "Tiene cobros" }, "x"), "Tiene cobros");
  assert.equal(errorDelFormulario(500, null, "No se pudo"), "No se pudo");
});

test("resultadoConsulta: si se libera mientras lo miras, queda 'libre' hasta salir y volver a entrar", () => {
  const libre = resultadoConsulta({ ok: true, data: { ocupado: false }, sondeo: true });
  assert.equal(libre.estado, "libre");
  assert.match(libre.mensaje, /sal y vuelve a entrar/);
  assert.equal(resultadoConsulta({ ok: true, data: { ocupado: false } }).estado, "lectura");
  assert.equal(resultadoConsulta({ ok: true, data: { ocupado: true, usuarioNombre: "Ana", tomadoEn: new Date().toISOString() }, sondeo: true }).estado, "ocupado");
});

test("versionTrasAccion: editando, si otro cambió el documento antes de la acción propia se conserva la versión vieja (el guardado dará 409)", () => {
  assert.equal(versionTrasAccion({ editando: true, versionFormulario: "v1", versionPrevia: "v1b", versionNueva: "v2" }), "v1");
  assert.equal(versionTrasAccion({ editando: true, versionFormulario: "v1", versionPrevia: null, versionNueva: "v2" }), "v1");
});

test("resultadoConsulta: a quien no puede editar, al liberarse no se le dice 'sal y vuelve a entrar'", () => {
  assert.equal(resultadoConsulta({ ok: true, data: { ocupado: false }, sondeo: true, puedeEditar: false }).estado, "lectura");
});
