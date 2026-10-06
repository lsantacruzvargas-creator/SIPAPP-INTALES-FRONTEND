import { test } from "node:test";
import assert from "node:assert/strict";
import { totalesAsiento, validarLineas, lineasParaEnviar, lineasDeAsiento, lineaIntacta, arbolCuentas, filtrarPlan, cuentasDeFilasExcel, sinTildes } from "./contabilidad.js";

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

test("editar un asiento guardado: las líneas sin tocar van solo con su posición; las cambiadas la llevan para conservar su comprobante", () => {
  // Cobro automático en dólares: banco y cliente a distinto TC, y la diferencia de cambio solo en soles.
  const form = lineasDeAsiento({ moneda: "USD", lineas: [
    { cuenta: "1041", debe: 375, haber: 0, debeME: 100, haberME: 0 },
    { cuenta: "1212", debe: 0, haber: 370, debeME: 0, haberME: 100, tercero: { tipoDoc: "6", numDoc: "20555555555" } },
    { cuenta: "776", debe: 0, haber: 5, debeME: 0, haberME: 0 },
  ] });
  assert.deepEqual(form.map((l) => [l.origenLinea, l.soloSoles, l.soles]), [[0, false, 375], [1, false, 370], [2, true, 5]]);
  assert.ok(form.every(lineaIntacta));
  assert.deepEqual(lineasParaEnviar(form, "USD"), [0, 1, 2].map((i) => ({ origenLinea: i, sinCambios: true })));
  assert.deepEqual(validarLineas(form, cuentas), [], "las intactas no se validan aquí (776 ni siquiera está en este plan)");
  assert.deepEqual(totalesAsiento(form), { debe: 100, haber: 100, diferencia: 0, cuadra: true });

  // Se cambia el importe del cliente y se agrega una línea nueva.
  const editado = [form[0], { ...form[1], haber: 90 }, form[2], { cuenta: "6329", glosa: "", debe: "", haber: 10, centroCosto: "", tercero: {} }];
  assert.equal(lineaIntacta(editado[1]), false);
  const cuerpo = lineasParaEnviar(editado, "USD");
  assert.deepEqual(cuerpo[0], { origenLinea: 0, sinCambios: true });
  assert.deepEqual([cuerpo[1].origenLinea, cuerpo[1].sinCambios, cuerpo[1].haberME, cuerpo[1].cuenta], [1, undefined, 90, "1212"]);
  assert.deepEqual([cuerpo[3].origenLinea, cuerpo[3].haberME], [undefined, 10]);
});
