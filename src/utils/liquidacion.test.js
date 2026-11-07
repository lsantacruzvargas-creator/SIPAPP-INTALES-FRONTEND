import { test } from "node:test";
import assert from "node:assert/strict";
import { totalesEnPantalla, validarLinea } from "./liquidacion.js";

test("totalesEnPantalla: suma las líneas en pantalla y los descuentos de ley del servidor", () => {
  const lineas = [
    { codigo: "0904", tipo: "ingreso", monto: 1129.2 },
    { codigo: "0114", tipo: "ingreso", monto: "1340.15" },
    { codigo: "0701", tipo: "descuento", monto: "100" },
  ];
  assert.deepEqual(totalesEnPantalla(lineas, [{ codigo: "0607", monto: 174.22 }]), { ingresos: 2469.35, descuentos: 100, leyes: 174.22, neto: 2195.13 });
});

test("totalesEnPantalla: montos a medio escribir cuentan 0 y los descuentos de ley negativos restan", () => {
  const lineas = [{ tipo: "ingreso", monto: "1000" }, { tipo: "ingreso", monto: "" }, { tipo: "descuento", monto: "abc" }];
  assert.deepEqual(totalesEnPantalla(lineas, [{ monto: 130 }, { monto: -30.5 }]), { ingresos: 1000, descuentos: 0, leyes: 99.5, neto: 900.5 });
  assert.deepEqual(totalesEnPantalla([], undefined), { ingresos: 0, descuentos: 0, leyes: 0, neto: 0 });
});

test("validarLinea: código obligatorio, descripción hasta 80 y monto mayor que 0 con 2 decimales", () => {
  const ok = { codigo: "0701", descripcion: "Adelanto", monto: "100.50" };
  assert.equal(validarLinea(ok), "");
  assert.equal(validarLinea({ ...ok, monto: 25 }), "");
  assert.equal(validarLinea({ ...ok, descripcion: "x".repeat(80) }), "");
  assert.notEqual(validarLinea({ ...ok, codigo: "" }), "");
  assert.notEqual(validarLinea({ ...ok, descripcion: "x".repeat(81) }), "");
  for (const monto of [0, "0", "1.234", "", "-5", "abc", "1,5"]) assert.notEqual(validarLinea({ ...ok, monto }), "", `monto ${monto}`);
});
