import { test } from "node:test";
import assert from "node:assert/strict";
import { mensajeOcupado, huboActividad, avisoDeRespuesta, cabecerasBloqueo } from "./bloqueo.js";

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
