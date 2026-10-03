import { test } from "node:test";
import assert from "node:assert/strict";
import { erroresGasto, etiquetaTipo, conComprobante } from "./cajaChica.js";

const base = { tipoComprobante: "03", serie: "B001", numero: "1", descripcion: "Pernos", monto: "45.50", numDoc: "" };

test("erroresGasto: válido, tope, saldo y comprobante", () => {
  assert.deepEqual(erroresGasto(base, { tope: 200, saldo: 500 }), []);
  assert.match(erroresGasto({ ...base, monto: "250" }, { tope: 200, saldo: 500 })[0], /tope/);
  assert.match(erroresGasto({ ...base, monto: "250" }, { saldo: 100 })[0], /saldo/);
  assert.match(erroresGasto({ ...base, serie: "" }).join(), /serie/);
  assert.match(erroresGasto({ ...base, tipoComprobante: "01", numDoc: "12345678" }).join(), /RUC/);
  assert.match(erroresGasto({ ...base, tipoComprobante: "MV", serie: "", numero: "" }).join(), /trabajador/);
  assert.deepEqual(erroresGasto({ ...base, tipoComprobante: "VS", serie: "", numero: "" }), []);
});

test("etiquetas y tipos con comprobante", () => {
  assert.equal(etiquetaTipo("01"), "Factura");
  assert.equal(etiquetaTipo("MV"), "Planilla de movilidad");
  assert.equal(conComprobante("12"), true);
  assert.equal(conComprobante("VS"), false);
});
