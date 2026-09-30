import { test } from "node:test";
import assert from "node:assert/strict";
import { avisaGuardado } from "./avisoGuardado.js";

test("avisaGuardado: solo las escrituras exitosas de datos avisan; las del bloqueo de edición no", () => {
  assert.equal(avisaGuardado(true, { method: "PUT" }), true);
  assert.equal(avisaGuardado(true, { method: "POST" }), true);
  assert.equal(avisaGuardado(true, {}), false);
  assert.equal(avisaGuardado(false, { method: "PUT" }), false);
  assert.equal(avisaGuardado(true, { method: "PUT", sinAvisoGuardado: true }), false);
});
