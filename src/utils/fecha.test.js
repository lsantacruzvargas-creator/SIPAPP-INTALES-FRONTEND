import { test } from "node:test";
import assert from "node:assert/strict";
import { formatearFecha, aInputFecha, anioLima, mesLima } from "./fecha.js";

test("un día guardado a medianoche UTC es ese día de calendario, no el anterior en Lima", () => {
  assert.equal(aInputFecha("2026-10-01T00:00:00.000Z"), "2026-10-01");
  assert.equal(aInputFecha("2026-10-01"), "2026-10-01");
  assert.equal(formatearFecha("2026-10-01T00:00:00.000Z", { day: "2-digit", month: "2-digit", year: "numeric" }), "01/10/2026");
  assert.deepEqual([anioLima("2027-01-01T00:00:00.000Z"), mesLima("2027-01-01T00:00:00.000Z")], [2027, 1]);
});

test("un instante se lee en hora de Lima: las 03:00 UTC del 1 de octubre aún son 30 de septiembre", () => {
  assert.equal(aInputFecha("2026-10-01T03:00:00.000Z"), "2026-09-30");
  assert.equal(aInputFecha("2026-10-01T05:00:00.000Z"), "2026-10-01", "medianoche de Lima");
  assert.equal(formatearFecha("2026-10-01T03:00:00.000Z", { day: "2-digit", month: "2-digit", year: "numeric" }), "30/09/2026");
  assert.deepEqual([anioLima("2027-01-01T03:00:00.000Z"), mesLima("2027-01-01T03:00:00.000Z")], [2026, 12]);
});

test("sin fecha no revienta", () => {
  assert.equal(aInputFecha(null), "");
  assert.equal(aInputFecha("no es fecha"), "");
  assert.ok(Number.isNaN(anioLima(undefined)));
});
