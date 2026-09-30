import { test } from "node:test";
import assert from "node:assert/strict";
import { mensajeOcupado, huboActividad, avisoDeRespuesta, cabecerasBloqueo, versionTrasAccion, pasoAutoEditar, tomaVigente } from "./bloqueo.js";

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
  assert.equal(versionTrasAccion({ editando: true, versionFormulario: "v1", versionTomada: "v1", versionNueva: "v2" }), "v2");
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
