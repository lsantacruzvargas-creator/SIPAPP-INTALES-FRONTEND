import { test } from "node:test";
import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import { hojaConSubtotales } from "./exportarTabla.js";

test("hojaConSubtotales: cada subtotal cae bajo su columna aunque la fila no traiga todas las claves", () => {
  const ws = hojaConSubtotales([{ FECHA: "01/09/2026", TIPO: "Factura", "BASE S/": 100, "TOTAL S/": 118 }], [{ FECHA: "TOTAL", "TOTAL S/": 118 }]);
  const [cab, , sub] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
  assert.equal(sub[cab.indexOf("TOTAL S/")], 118);
  assert.equal(sub[cab.indexOf("TIPO")], "");
});

test("libroConHojas: una hoja por entrada, con su nombre y sus subtotales en columna", async () => {
  const { libroConHojas } = await import("./exportarTabla.js");
  const wb = libroConHojas([{ hoja: "Compras", filas: [{ A: 1, B: 2 }], subtotales: [{ A: "T", B: 2 }] }, { hoja: "Ventas", filas: [{ C: 3 }] }]);
  assert.deepEqual(wb.SheetNames, ["Compras", "Ventas"]);
  assert.deepEqual(XLSX.utils.sheet_to_json(wb.Sheets.Compras, { header: 1 })[2], ["T", 2]);
});
