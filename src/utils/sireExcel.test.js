import { test } from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { plantillaXlsx, xlsxATexto } from "./sireExcel.js";

const CAB = "RUC|Apellidos y Nombres o Razón social|Periodo|Fecha de emisión|Tipo CP/Doc.|Serie del CDP|Nro CP o Doc. Nro Inicial (Rango)|Nro Doc Identidad|Total CP|Moneda|Tipo de Cambio";

test("plantillaXlsx: fila 1 con las columnas del SIRE en su orden y columnas en formato texto", async () => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await plantillaXlsx(CAB));
  const ws = wb.getWorksheet("SIRE");
  assert.deepEqual(ws.getRow(1).values.slice(1), CAB.split("|"));
  assert.equal(ws.rowCount, 1);
  assert.equal(ws.getColumn(7).numFmt, "@");
});

test("xlsxATexto: lo llenado en Excel vuelve al formato del SIRE (fechas dd/mm/aaaa, ceros, fórmulas, sin '|')", async () => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await plantillaXlsx(CAB));
  const ws = wb.getWorksheet("SIRE");
  // Como lo dejaría una persona: texto, una fecha que Excel convirtió, números y una fórmula.
  ws.getRow(2).values = ["20612928551", "AUTOMATION | PARTS", "202608", new Date(Date.UTC(2026, 7, 27)), "01", "F19O", "00035241", "20127765279", { formula: "38.34+6.9", result: 45.24 }, "PEN", 1];
  ws.getRow(4).values = ["20612928551", "AUTOMATION PARTS S.A.C.", "202608", "06/08/2026", "01", "FI01", "20661966", "20100047218", "40.5", "PEN", "1.000"];
  const texto = await xlsxATexto(await wb.xlsx.writeBuffer());
  assert.equal(texto, [
    CAB,
    "20612928551|AUTOMATION   PARTS|202608|27/08/2026|01|F19O|00035241|20127765279|45.24|PEN|1",
    "20612928551|AUTOMATION PARTS S.A.C.|202608|06/08/2026|01|FI01|20661966|20100047218|40.5|PEN|1.000",
    "",
  ].join("\n"));
});

test("xlsxATexto: un Excel sin cabecera se rechaza", async () => {
  const wb = new ExcelJS.Workbook();
  wb.addWorksheet("Hoja1");
  await assert.rejects(xlsxATexto(await wb.xlsx.writeBuffer()), /cabecera/);
});
