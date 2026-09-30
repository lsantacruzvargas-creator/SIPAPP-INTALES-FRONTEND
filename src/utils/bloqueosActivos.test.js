import { test } from "node:test";
import assert from "node:assert/strict";
import { registrarBloqueo, quitarBloqueo, estaActivo, soltarTodos } from "./bloqueosActivos.js";

test("soltarTodos suelta cada bloqueo de la ventana con el token antes de que se borre", async () => {
  registrarBloqueo("c1");
  registrarBloqueo("c2");
  registrarBloqueo("c3");
  quitarBloqueo("c3");
  const envios = [];
  const fetchImpl = async (url, opciones) => { envios.push({ url, opciones }); return { ok: true }; };
  await soltarTodos({ api: "http://x/api", token: "T", fetchImpl });
  assert.deepEqual(envios.map((e) => e.url).sort(), ["http://x/api/bloqueos/c1", "http://x/api/bloqueos/c2"]);
  for (const { opciones } of envios) {
    assert.equal(opciones.method, "DELETE");
    assert.equal(opciones.keepalive, true);
    assert.equal(opciones.headers.Authorization, "Bearer T");
  }
  assert.equal(estaActivo("c1"), false);
});

test("soltarTodos no espera más del máximo si el servidor no responde", async () => {
  registrarBloqueo("lento");
  const inicio = Date.now();
  await soltarTodos({ api: "http://x/api", token: "T", fetchImpl: () => new Promise(() => {}), esperaMaxMs: 30 });
  assert.ok(Date.now() - inicio < 1000);
});

test("sin bloqueos o sin token no envía nada", async () => {
  let llamadas = 0;
  await soltarTodos({ api: "http://x/api", token: "T", fetchImpl: async () => { llamadas++; } });
  registrarBloqueo("c9");
  await soltarTodos({ api: "http://x/api", token: null, fetchImpl: async () => { llamadas++; } });
  assert.equal(llamadas, 0);
});
