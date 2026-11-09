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

test("boleta PDF: no lleva etiquetas del PLAME ni provisiones", () => {
  const todo = textos(boleta({
    provisiones: [{ tipo: "cts", periodo: "202705", devengado: 210.25, monto: 210.25 }],
  })).join(" ");
  assert.ok(!/PLAME/.test(todo));
  assert.ok(!/rovisi/.test(todo));
});

test("boleta PDF: bajo la 0406 calculada va el detalle del cálculo; digitada, no", () => {
  const gratificacion = { rc: 2523, meses: 5, diasNoLaborados: 2, factor: 1, tasaBonificacion: 0.09, monto: 2074.37, avisos: [] };
  const conceptos = [...boleta().conceptos, { codigo: "0406", nombre: "GRATIFICACIÓN DE DICIEMBRE", tipo: "ingreso", monto: 2074.37, calculado: true }];
  const todo = textos(boleta({ periodo: "202612", conceptos, gratificacion })).join(" ").replace(/\s+/g, " ");
  assert.ok(todo.includes("GRATIFICACIÓN DE DICIEMBRE (S/ 2,523.00 × 5 meses ÷ 6 - S/ 2,523.00 ÷ 180 × 2 días no laborados)"), todo);
  const digitada = conceptos.map((c) => (c.codigo === "0406" ? { ...c, calculado: false } : c));
  assert.ok(!textos(boleta({ periodo: "202612", conceptos: digitada, gratificacion })).join(" ").includes("÷ 6"));
});
