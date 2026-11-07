import { test } from "node:test";
import assert from "node:assert/strict";
import { jsPDF } from "jspdf";
import { dibujarBoleta } from "./boletaPdf.js";

const boleta = (extra = {}) => ({
  periodo: "202611",
  datos: { nombre: "QUISPE MAMANI ANA", numDoc: "12345678", cargo: "Soldadora", fechaIngreso: "2020-01-01", pension: { regimen: "onp" } },
  dias: { remunerados: 30 }, horas: { ordinarias: 240 },
  conceptos: [{ codigo: "0121", nombre: "REMUNERACIÓN BÁSICA", tipo: "ingreso", monto: 2400 }, { codigo: "0607", nombre: "ONP", tipo: "aporteTrabajador", monto: 312 }],
  totales: { ingresos: 2400, descuentos: 0, aportesTrabajador: 312, aportesEmpleador: 216, neto: 2088 },
  ...extra,
});

// Todo texto que el PDF escribe, incluido el de las tablas.
const textos = (b) => {
  const doc = new jsPDF();
  const escritos = [];
  const original = doc.text.bind(doc);
  doc.text = (t, ...resto) => { escritos.push(...[t].flat().map(String)); return original(t, ...resto); };
  dibujarBoleta(doc, b, { empleador: { razonSocial: "INTALES SAC", ruc: "20100000001" } });
  return escritos;
};

test("boleta PDF: el depósito de CTS va en un recuadro informativo y el neto no cambia", () => {
  const sin = textos(boleta());
  assert.ok(!sin.some((t) => t.includes("Depósito de CTS")));
  const con = textos(boleta({ ctsDepositada: { codigo: "CTS-0001", periodo: "202611", monto: 1470.92 } }));
  assert.ok(con.some((t) => t === "Depósito de CTS (may–oct 2026): S/ 1,470.92"));
  assert.ok(con.some((t) => t.includes("no forma parte de los ingresos")));
  assert.ok(con.includes("Neto a pagar: S/ 2,088.00"));
  assert.ok(sin.includes("Neto a pagar: S/ 2,088.00"));
});

test("boleta PDF: no lleva etiquetas del PLAME ni provisiones", () => {
  const todo = textos(boleta({
    ctsDepositada: { codigo: "CTS-0001", periodo: "202611", monto: 100 },
    provisiones: [{ tipo: "cts", periodo: "202705", devengado: 210.25, monto: 210.25 }],
  })).join(" ");
  assert.ok(!/PLAME/.test(todo));
  assert.ok(!/rovisi/.test(todo));
});
