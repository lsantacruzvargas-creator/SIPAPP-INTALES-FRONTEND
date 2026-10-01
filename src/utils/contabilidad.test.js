import { test } from "node:test";
import assert from "node:assert/strict";
import { totalesAsiento, validarLineas, lineasParaEnviar, lineasDeAsiento, arbolCuentas, filtrarPlan, cuentasDeFilasExcel, sinTildes } from "./contabilidad.js";

const cuentas = new Map([
  ["6329", { codigo: "6329", activa: true, deMovimiento: true }],
  ["4212", { codigo: "4212", activa: true, deMovimiento: true, exigeTercero: true }],
  ["6343", { codigo: "6343", activa: true, deMovimiento: true, exigeCentroCosto: true }],
  ["63", { codigo: "63", activa: true, deMovimiento: false }],
  ["6321", { codigo: "6321", activa: false, deMovimiento: true }],
]);

test("totalesAsiento: cuadre con decimales sin errores de coma flotante", () => {
  assert.deepEqual(totalesAsiento([{ debe: "0.1" }, { debe: 0.2 }, { haber: "0.3" }]), { debe: 0.3, haber: 0.3, diferencia: 0, cuadra: true });
  assert.equal(totalesAsiento([{ debe: 10 }, { haber: 9.99 }]).diferencia, 0.01);
  assert.equal(totalesAsiento([{ debe: "" }, { haber: "" }]).cuadra, false, "en cero no cuadra");
});

test("validarLineas: mismas reglas que el servidor", () => {
  const errores = validarLineas([
    { cuenta: "6329", debe: 10 },
    { cuenta: "63", debe: 10 },
    { cuenta: "6321", debe: 10 },
    { cuenta: "6329", debe: 10, haber: 5 },
    { cuenta: "6329", debe: 10.005 },
    { cuenta: "4212", haber: 10 },
    { cuenta: "6343", debe: 1 },
    { cuenta: "", debe: 1 },
    { cuenta: "6329", debe: -1 },
  ], cuentas);
  assert.deepEqual(errores.map((e) => e.indice), [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.match(errores[0].mensaje, /no es de movimiento/);
  assert.match(errores[4].mensaje, /tercero/);
  assert.match(errores[5].mensaje, /centro de costo/);
  assert.equal(validarLineas([{ cuenta: "6329", debe: 1 }], cuentas).at(-1).indice, -1);
  assert.deepEqual(validarLineas([{ cuenta: "6329", debe: 1 }, { cuenta: "4212", haber: 1, tercero: { numDoc: "20" } }], cuentas), []);
});

test("lineasParaEnviar y lineasDeAsiento: USD va como importe en dólares", () => {
  const form = [{ cuenta: "6329", debe: "10", haber: "" }, { cuenta: "101", debe: "", haber: 10 }];
  assert.deepEqual(lineasParaEnviar(form, "USD").map((l) => [l.debeME, l.haberME, l.debe]), [[10, 0, undefined], [0, 10, undefined]]);
  assert.deepEqual(lineasParaEnviar(form, "PEN").map((l) => [l.debe, l.haber]), [[10, 0], [0, 10]]);
  const vuelta = lineasDeAsiento({ moneda: "USD", lineas: [{ cuenta: "6329", debe: 35, haber: 0, debeME: 10, haberME: 0, centroCosto: { _id: "c1" } }] });
  assert.equal(vuelta[0].debe, 10);
  assert.equal(vuelta[0].haber, "");
  assert.equal(vuelta[0].centroCosto, "c1");
});

test("arbolCuentas: profundidad por la cadena de padres existentes", () => {
  const plan = arbolCuentas([
    { codigo: "40111", padre: "4011" }, { codigo: "40", padre: null }, { codigo: "4011", padre: "401" }, { codigo: "401", padre: "40" }, { codigo: "424", padre: "42" },
  ]);
  assert.deepEqual(plan.map((c) => [c.codigo, c.profundidad]), [["40", 0], ["401", 1], ["4011", 2], ["40111", 3], ["424", 0]]);
});

test("filtrarPlan: código, nombre sin tildes, de movimiento e inactivas", () => {
  const plan = [
    { codigo: "106", nombre: "Depósitos en instituciones financieras", deMovimiento: true, activa: true },
    { codigo: "10", nombre: "Efectivo", deMovimiento: false, activa: true },
    { codigo: "101", nombre: "Caja", deMovimiento: true, activa: false },
  ];
  assert.deepEqual(filtrarPlan(plan, "DEPOSITO").map((c) => c.codigo), ["106"]);
  assert.deepEqual(filtrarPlan(plan, "10").map((c) => c.codigo), ["106", "10", "101"]);
  assert.deepEqual(filtrarPlan(plan, "", { soloMovimiento: true, verInactivas: false }).map((c) => c.codigo), ["106"]);
});

test("cuentasDeFilasExcel: reconoce las cabeceras usuales y descarta filas inválidas", () => {
  const filas = [
    { "Código": "104101", "Descripción": "BCP Soles" },
    { "CUENTA": 4212, "Denominación": " Emitidas " },
    { "Código": "Total", "Descripción": "x" },
    { "Código": "63.21", "Descripción": "Administrativa" },
    { "Código": "70321", "Descripción": "" },
  ];
  assert.deepEqual(cuentasDeFilasExcel(filas), [
    { codigo: "104101", nombre: "BCP Soles" }, { codigo: "4212", nombre: "Emitidas" }, { codigo: "6321", nombre: "Administrativa" },
  ]);
  assert.equal(sinTildes("Árbol "), "arbol");
});

test("destinoPorDefecto: 941/791 solo para gastos 62–68", async () => {
  const { destinoPorDefecto } = await import("./contabilidad.js");
  assert.deepEqual(destinoPorDefecto("6341"), { debe: "941", haber: "791" });
  assert.deepEqual(destinoPorDefecto("602"), { debe: "", haber: "" });
  assert.deepEqual(destinoPorDefecto(undefined), { debe: "", haber: "" });
});
