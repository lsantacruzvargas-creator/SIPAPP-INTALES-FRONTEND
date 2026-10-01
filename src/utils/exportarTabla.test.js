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
