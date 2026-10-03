import { test } from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { libroConcar, nombreArchivoConcar } from "./concar.js";

const columnas = ["A", "B", "C", "D", "N", "O", "Q"];
const formato = {
  hoja: "CONCAR", columnas, columnasFecha: ["D"],
  cabeceras: {
    titulos: { A: "WE", B: "Sub Diario", C: "Número de Comprobante", D: "Fecha de Comprobante", N: "Debe / Haber", O: "Importe Original", Q: "Importe en Soles" },
    notas: { A: "Contabilidad", B: "Ver T.G. 02" },
    formatos: { A: "Tamaño/Formato", D: "dd/mm/aaaa" },
  },
};
const filas = [
  { A: "", B: "05", C: "090001", D: "2026-09-12", N: "D", O: 118, Q: 118 },
  { A: "", B: "05", C: "090001", D: "2026-09-12", N: "H", O: 118, Q: 118 },
];

test("libroConcar: tres filas de cabecera, datos desde la 4, códigos como texto y fechas como fecha", async () => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await libroConcar({ filas, formato }));
  const ws = wb.getWorksheet("CONCAR");
  assert.equal(ws.getRow(1).getCell(2).value, "Sub Diario");
  assert.equal(ws.getRow(2).getCell(2).value, "Ver T.G. 02");
  assert.equal(ws.getRow(3).getCell(4).value, "dd/mm/aaaa");
  const r = ws.getRow(4);
  assert.equal(r.getCell(1).value, null);
  assert.equal(r.getCell(2).value, "05", "conserva el cero");
  assert.equal(r.getCell(3).value, "090001");
  assert.deepEqual(r.getCell(4).value, new Date(Date.UTC(2026, 8, 12)));
  assert.equal(r.getCell(6).value, 118);
  assert.equal(ws.rowCount, 5);
});

test("nombre del archivo", () => {
  assert.equal(nombreArchivoConcar({ periodo: "202609", codigo: "EXP-00001" }), "CONCAR-202609-EXP-00001.xlsx");
});
