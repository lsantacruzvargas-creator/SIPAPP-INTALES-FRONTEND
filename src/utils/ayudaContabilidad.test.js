import { test } from "node:test";
import assert from "node:assert/strict";
import { AYUDA, ORDEN_AYUDA, buscarAyuda } from "./ayudaContabilidad.js";

test("ayuda: cada sección tiene título, descripción y términos sin repetir", () => {
  assert.deepEqual(Object.keys(AYUDA).sort(), [...ORDEN_AYUDA].sort());
  for (const clave of ORDEN_AYUDA) {
    const s = AYUDA[clave];
    assert.ok(s.titulo && s.descripcion && s.terminos.length, clave);
    const nombres = s.terminos.map((t) => t.termino);
    assert.equal(new Set(nombres).size, nombres.length, `términos repetidos en ${clave}`);
    for (const t of s.terminos) assert.ok(t.definicion.length > 20, `${clave}: ${t.termino}`);
  }
});

test("buscarAyuda: sin tildes ni mayúsculas, en término y definición, con su sección", () => {
  assert.deepEqual(buscarAyuda("  "), []);
  const r = buscarAyuda("DETRACCION");
  assert.ok(r.length >= 3);
  assert.ok(r.some((t) => t.termino === "Detracción" && t.seccion === "Automáticos"));
  assert.ok(buscarAyuda("cuo").some((t) => t.termino === "CUO" && t.seccion === "Conceptos básicos"));
  assert.ok(buscarAyuda("banco de la nacion").length >= 1, "busca dentro de las definiciones");
});
