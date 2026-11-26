import { test } from "node:test";
import assert from "node:assert/strict";
import { veFacturas, ROLES_FINANZAS, puedeEditarFacturas, puedeMovimientoManual } from "./roles.js";

test("veFacturas: solo admin, jefatura, coordinadora, facturación, tesorero y contador", () => {
  assert.deepEqual(ROLES_FINANZAS, ["admin", "jefatura", "coordinadora", "facturacion", "tesorero", "contador"]);
  for (const rol of ROLES_FINANZAS) assert.equal(veFacturas(rol), true, rol);
  for (const rol of ["vendedor", "asistente", "planner", "supervisor", "almacenero", "tecnico", undefined]) assert.equal(veFacturas(rol), false, String(rol));
});

test("puedeEditarFacturas: tesorero y contador solo ven", () => {
  for (const rol of ["admin", "jefatura", "coordinadora", "facturacion"]) assert.equal(puedeEditarFacturas(rol), true, rol);
  for (const rol of ["tesorero", "contador", "vendedor"]) assert.equal(puedeEditarFacturas(rol), false, rol);
});

test("puedeMovimientoManual: admin, jefatura, tesorero y contador; facturación solo lee", () => {
  for (const rol of ["admin", "jefatura", "tesorero", "contador"]) assert.equal(puedeMovimientoManual(rol), true, rol);
  for (const rol of ["facturacion", "coordinadora", "vendedor", undefined]) assert.equal(puedeMovimientoManual(rol), false, String(rol));
});
