import { test } from "node:test";
import assert from "node:assert/strict";
import { nombreArchivoBoletas, nombrePdfTrabajador, nombresUnicos, avisosDescargaBoletas } from "./boletasMasa.js";
import { generarBoletasPdf } from "./boletaPdf.js";

const boleta = (numDoc, extra = {}) => ({
  periodo: "202610", datos: { numDoc, nombre: `TRABAJADOR ${numDoc}`, pension: { sistema: "ONP" }, fechaIngreso: "2024-01-15" },
  dias: { remunerados: 30 }, horas: { ordinarias: 240 },
  conceptos: [{ tipo: "ingreso", nombre: "Remuneración básica", monto: 3000 }, { tipo: "descuento", nombre: "ONP", monto: 390 }, { tipo: "aporteEmpleador", nombre: "EsSalud", monto: 270 }],
  totales: { ingresos: 3000, descuentos: 0, aportesTrabajador: 390, aportesEmpleador: 270, neto: 2610 },
  ...extra,
});

test("nombreArchivoBoletas: PDF o zip, con sufijo BORRADOR", () => {
  assert.equal(nombreArchivoBoletas("202610", {}), "boletas-202610.pdf");
  assert.equal(nombreArchivoBoletas("202610", { borrador: true }), "boletas-202610-BORRADOR.pdf");
  assert.equal(nombreArchivoBoletas("202610", { zip: true }), "boletas-202610.zip");
  assert.equal(nombreArchivoBoletas("202610", { borrador: true, zip: true }), "boletas-202610-BORRADOR.zip");
});

test("nombrePdfTrabajador: sin tildes, Ñ a N, sin caracteres de archivo prohibidos y espacios simples", () => {
  assert.equal(nombrePdfTrabajador({ datos: { numDoc: "46653246", nombre: "SANTA CRUZ VARGAS LUIS ALBERTO" } }), "46653246 SANTA CRUZ VARGAS LUIS ALBERTO.pdf");
  assert.equal(nombrePdfTrabajador({ datos: { numDoc: "1", nombre: "NÚÑEZ/PÉREZ  ANA" } }), "1 NUNEZ PEREZ ANA.pdf");
  assert.equal(nombrePdfTrabajador({ datos: { numDoc: "2", nombre: 'a\\b:c*d?e"f<g>h|i' } }), "2 a b c d e f g h i.pdf");
});

test("nombresUnicos: los repetidos llevan (2), (3) antes de la extensión", () => {
  assert.deepEqual(nombresUnicos(["a.pdf", "a.pdf", "b.pdf", "a.pdf"]), ["a.pdf", "a (2).pdf", "b.pdf", "a (3).pdf"]);
  assert.deepEqual(nombresUnicos(["a.pdf", "a (2).pdf", "a.pdf"]), ["a.pdf", "a (2).pdf", "a (3).pdf"]);
});

test("avisosDescargaBoletas: nada en una cerrada limpia; avisos de neto negativo, sin ingresos y borrador", () => {
  assert.deepEqual(avisosDescargaBoletas([boleta("1")], { cerrada: true }), []);
  const negativa = boleta("2", { totales: { ingresos: 100, descuentos: 105, aportesTrabajador: 0, aportesEmpleador: 0, neto: -5 } });
  const sinIngresos = boleta("3", { totales: { ingresos: 0, descuentos: 0, aportesTrabajador: 0, aportesEmpleador: 0, neto: 0 } });
  assert.deepEqual(avisosDescargaBoletas([negativa, sinIngresos], { cerrada: false }), [
    "1 boleta con neto negativo: revisa sus descuentos",
    "1 boleta sin ingresos en el mes",
    "Planilla en borrador: las boletas salen con la marca BORRADOR",
  ]);
  assert.match(avisosDescargaBoletas([negativa, negativa], { cerrada: true })[0], /^2 boletas con neto negativo/);
});

test("generarBoletasPdf: una página por boleta; una sin conceptos no lanza", () => {
  const doc = generarBoletasPdf([boleta("1"), boleta("2"), boleta("3")], { periodo: "202610", guardar: false });
  assert.equal(doc.getNumberOfPages(), 3);
  const vacia = boleta("4", { conceptos: [], totales: { ingresos: 0, descuentos: 0, aportesTrabajador: 0, aportesEmpleador: 0, neto: 0 } });
  assert.equal(generarBoletasPdf([vacia], { periodo: "202610", borrador: true, guardar: false }).getNumberOfPages(), 1);
});

test("generarBoletasPdf: la marca BORRADOR solo sale en borrador (cerrada: ninguna página la lleva)", () => {
  const cerrada = generarBoletasPdf([boleta("1"), boleta("2")], { periodo: "202610", guardar: false }).output();
  const borrador = generarBoletasPdf([boleta("1"), boleta("2")], { periodo: "202610", borrador: true, guardar: false }).output();
  assert.equal(cerrada.includes("BORRADOR"), false);
  assert.equal(borrador.split("(BORRADOR)").length - 1, 2);
});
