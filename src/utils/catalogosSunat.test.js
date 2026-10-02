import { test } from "node:test";
import assert from "node:assert/strict";
import { documentoValido, TIPO_DOC_RECEPTOR } from "./catalogosSunat.js";

test("clientes varios: tipo y número '-' (no '0', que el RVIE rechaza en boletas menores a S/ 700)", () => {
  assert.equal(documentoValido("-", "-"), true);
  assert.equal(documentoValido("-", "12345678"), false);
  assert.deepEqual(TIPO_DOC_RECEPTOR.map((t) => t.valor), ["6", "1", "4", "7", "-"]);
});

test("el selector de detracción del CPE no ofrece 004, 026 ni 027 (el backend los rechaza: van con operación 1002–1004)", async () => {
  const { DETRACCION_VENTA_CPE } = await import("./catalogosSunat.js");
  const codigos = DETRACCION_VENTA_CPE.map((b) => b.codigo);
  for (const c of ["004", "026", "027"]) assert.equal(codigos.includes(c), false, c);
  assert.equal(codigos.includes("037"), true);
});
