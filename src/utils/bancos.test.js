import { test } from "node:test";
import assert from "node:assert/strict";
import { signo, resumenConciliacion, periodoDeMes, mesDePeriodo, textoPeriodo, mesAnteriorLima } from "./bancos.js";

test("signo por cuenta: ingreso, egreso y transferencia", () => {
  assert.equal(signo({ tipo: "ingreso", cuenta: "a" }, "a"), 1);
  assert.equal(signo({ tipo: "egreso", cuenta: { _id: "a" } }, "a"), -1);
  assert.equal(signo({ tipo: "egreso", cuenta: "a" }, "b"), 0);
  assert.equal(signo({ tipo: "transferencia", cuenta: "a", cuentaDestino: "b" }, "a"), -1);
  assert.equal(signo({ tipo: "transferencia", cuenta: "a", cuentaDestino: "b" }, "b"), 1);
  assert.equal(signo({ tipo: "retencion", cuenta: null }, "a"), 0);
});

test("resumenConciliacion: tránsito, conciliado y diferencia con decimales", () => {
  const pendientes = [{ _id: 1, salida: 10 }, { _id: 2, entrada: 300.1 }, { _id: 3, salida: 200.2 }];
  const r = resumenConciliacion({ pendientes, marcados: [1], saldoExtracto: "990", saldoLibros: 1089.9 });
  assert.deepEqual(r, { ingresosTransito: 300.1, egresosTransito: 200.2, saldoConciliado: 1089.9, diferencia: 0, cuadra: true });
  assert.equal(resumenConciliacion({ pendientes, marcados: [], saldoExtracto: "", saldoLibros: 0 }).cuadra, false);
  assert.equal(resumenConciliacion({ pendientes, marcados: [1, 2, 3], saldoExtracto: 5, saldoLibros: 4 }).diferencia, -1);
});

test("periodos y mes anterior en Lima", () => {
  assert.equal(periodoDeMes("2026-09"), "202609");
  assert.equal(mesDePeriodo("202609"), "2026-09");
  assert.equal(textoPeriodo("202609"), "09/2026");
  assert.equal(mesAnteriorLima(new Date("2026-01-01T04:00:00Z")), "2025-11", "aún es 31/12 en Lima");
  assert.equal(mesAnteriorLima(new Date("2026-03-15T12:00:00Z")), "2026-02");
});
