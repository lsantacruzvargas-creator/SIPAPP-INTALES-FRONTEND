import { test } from "node:test";
import assert from "node:assert/strict";
import { jsPDF } from "jspdf";
import { dibujarReportePlanilla } from "./reportePlanillaPdf.js";

const boleta = (numDoc) => ({
  datos: { nombre: "PEREZ GOMEZ JUAN", numDoc, cargo: "Operario", area: "produccion" },
  dias: { vinculo: 30, efectivos: 30 },
  asistencia: { suspensiones: [{ tipo: "23", dias: 5 }], minutosTardanza: 45 },
  conceptos: [],
  totales: { ingresos: 3000, descuentos: 112.5, aportesTrabajador: 390, neto: 2497.5, aportesEmpleador: 270 },
});
const contexto = (cerrada) => ({ empleador: { razonSocial: "INTALES SAC", ruc: "20123456789" }, periodo: "202611", cerrada });

const dibujar = (cerrada) => {
  const doc = new jsPDF({ orientation: "landscape" });
  const escritos = [];
  const original = doc.text.bind(doc);
  doc.text = (t, ...resto) => { escritos.push(...[t].flat().map(String)); return original(t, ...resto); };
  dibujarReportePlanilla(doc, [boleta("45678901"), boleta("22222222")], contexto(cerrada));
  return { doc, texto: escritos.join(" ") };
};

test("reporte PDF: apaisado, encabezado con empleador y mes, fila TOTAL y BORRADOR solo en borrador", () => {
  const { doc, texto } = dibujar(false);
  assert.ok(doc.internal.pageSize.getWidth() > doc.internal.pageSize.getHeight());
  assert.ok(texto.includes("INTALES SAC"), texto);
  assert.ok(texto.includes("Reporte de planilla – Noviembre 2026"), texto);
  assert.ok(texto.includes("TOTAL"), texto);
  assert.ok(texto.includes("BORRADOR"));
  assert.ok(!dibujar(true).texto.includes("BORRADOR"));
});
