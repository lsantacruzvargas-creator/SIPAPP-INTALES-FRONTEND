import { test } from "node:test";
import assert from "node:assert/strict";
import { enviarConSobregiro } from "./sobregiro.js";

const respuesta = (status, data) => ({ status, ok: status < 400, clone() { return this; }, json: async () => data });

test("enviarConSobregiro: si no hay 409 SOBREGIRO devuelve la respuesta sin preguntar", async () => {
  const llamadas = [];
  let preguntas = 0;
  const r = await enviarConSobregiro(async (b) => { llamadas.push(b); return respuesta(201, {}); }, { a: 1 }, async () => { preguntas++; return true; });
  assert.equal(r.status, 201);
  assert.equal(llamadas.length, 1);
  assert.equal(preguntas, 0);
});

test("enviarConSobregiro: SOBREGIRO pregunta y reintenta con confirmarSobregiro en la raíz del body", async () => {
  const llamadas = [];
  const enviar = async (b) => {
    llamadas.push(b);
    return llamadas.length === 1 ? respuesta(409, { mensaje: "La cuenta BCP quedará en −S/ 5.00", codigo: "SOBREGIRO" }) : respuesta(201, { ok: 1 });
  };
  let pregunta = "";
  const r = await enviarConSobregiro(enviar, { pago: { cuenta: "x" } }, async (m) => { pregunta = m; return true; });
  assert.equal(r.status, 201);
  assert.deepEqual(llamadas[0], { pago: { cuenta: "x" } });
  assert.deepEqual(llamadas[1], { pago: { cuenta: "x" }, confirmarSobregiro: true });
  assert.match(pregunta, /quedará en −S\/ 5\.00/);
});

test("enviarConSobregiro: si el usuario cancela devuelve el 409 sin reintentar; un 409 de caja no pregunta", async () => {
  let llamadas = 0;
  const sobregiro = async () => { llamadas++; return respuesta(409, { mensaje: "quedará en −S/ 1.00", codigo: "SOBREGIRO" }); };
  const r1 = await enviarConSobregiro(sobregiro, {}, async () => false);
  assert.equal(r1.status, 409);
  assert.equal(llamadas, 1);
  let preguntas = 0;
  const r2 = await enviarConSobregiro(async () => respuesta(409, { mensaje: "Saldo insuficiente en Caja" }), {}, async () => { preguntas++; return true; });
  assert.equal(r2.status, 409);
  assert.equal(preguntas, 0);
  assert.equal((await r2.json()).mensaje, "Saldo insuficiente en Caja");
});
