import { test } from "node:test";
import assert from "node:assert/strict";
import { veFacturas, ROLES_FINANZAS, puedeEditarFacturas } from "./roles.js";

test("veFacturas: solo admin, jefatura, facturación, tesorero y contador", () => {
  assert.deepEqual(ROLES_FINANZAS, ["admin", "jefatura", "facturacion", "tesorero", "contador"]);
  for (const rol of ROLES_FINANZAS) assert.equal(veFacturas(rol), true, rol);
  for (const rol of ["vendedor", "asistente", "coordinadora", "planner", "supervisor", "almacenero", "tecnico", undefined]) assert.equal(veFacturas(rol), false, String(rol));
});

test("puedeEditarFacturas: tesorero y contador solo ven", () => {
  for (const rol of ["admin", "jefatura", "facturacion"]) assert.equal(puedeEditarFacturas(rol), true, rol);
  for (const rol of ["tesorero", "contador", "vendedor"]) assert.equal(puedeEditarFacturas(rol), false, rol);
});
