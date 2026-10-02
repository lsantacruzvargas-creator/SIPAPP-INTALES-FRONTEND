import { test } from "node:test";
import assert from "node:assert/strict";
import { documentoValido, TIPO_DOC_RECEPTOR } from "./catalogosSunat.js";

test("clientes varios: tipo y número '-' (no '0', que el RVIE rechaza en boletas menores a S/ 700)", () => {
  assert.equal(documentoValido("-", "-"), true);
  assert.equal(documentoValido("-", "12345678"), false);
  assert.deepEqual(TIPO_DOC_RECEPTOR.map((t) => t.valor), ["6", "1", "4", "7", "-"]);
});
