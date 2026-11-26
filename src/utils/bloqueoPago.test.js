import { test } from "node:test";
import assert from "node:assert/strict";
import { bloqueadoPorPago, fusionarBloqueo } from "./bloqueoPago.js";

test("bloqueadoPorPago: el backend lo manda crudo y Jefatura conserva su excepción", () => {
  assert.equal(bloqueadoPorPago({ bloqueadoPorPago: true }, "admin"), true);
  assert.equal(bloqueadoPorPago({ bloqueadoPorPago: true }, "facturacion"), true);
  assert.equal(bloqueadoPorPago({ bloqueadoPorPago: true }, "jefatura"), false);
  assert.equal(bloqueadoPorPago({ bloqueadoPorPago: false }, "admin"), false);
  assert.equal(bloqueadoPorPago({}, "admin"), false);
  assert.equal(bloqueadoPorPago(null, "admin"), false);
  assert.equal(bloqueadoPorPago(undefined, "admin"), false);
});

test("fusionarBloqueo: una respuesta sin bloqueo conserva el que ya se tenía", () => {
  const previo = { _id: "c1", titulo: "Viejo", bloqueadoPorPago: true, bloqueo: { enOC: true, indicesFacturados: [0] } };
  const fusionada = fusionarBloqueo(previo, { _id: "c1", titulo: "Nuevo" });
  assert.equal(fusionada.titulo, "Nuevo");
  assert.equal(fusionada.bloqueadoPorPago, true);
  assert.deepEqual(fusionada.bloqueo, { enOC: true, indicesFacturados: [0] });
});

test("fusionarBloqueo: una respuesta con bloqueo lo reemplaza, también si vale false", () => {
  const previo = { bloqueadoPorPago: true, bloqueo: { enOC: true, indicesFacturados: [0] } };
  const nuevo = { bloqueadoPorPago: false, bloqueo: { enOC: false, indicesFacturados: [] } };
  assert.deepEqual(fusionarBloqueo(previo, nuevo), nuevo);
  assert.deepEqual(fusionarBloqueo(undefined, nuevo), nuevo);
});
