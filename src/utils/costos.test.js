import { test } from "node:test";
import assert from "node:assert/strict";
import { convertir, costoEn, filaResumenCosto, filaComprometido, filaConsumido } from "./costos.js";

const c = {
  numeroOT: "OT-1", numeroOrdenCompra: "OC-1", titulo: "Eje", empresa: { razonSocial: "CLI" },
  ocSubtotal: 200, ocMoneda: "USD",
  comprometido: { materiales: 380, servicios: 0, flete: 38, otros: 0, total: 418 },
  consumido: { hh: 76, hm: 0, materiales: 190, servicios: 0, flete: 0, otros: 0, total: 266 },
  costoTotal: 684,
};

test("convertir entre soles y dólares con el TC; misma moneda o sin TC no cambia", () => {
  assert.equal(convertir(380, "PEN", "USD", 3.8), 100);
  assert.equal(convertir(100, "USD", "PEN", 3.8), 380);
  assert.equal(convertir(380, "PEN", "PEN", 3.8), 380);
  assert.equal(convertir(380, "PEN", "USD", null), 380);
});

test("costoEn: costos (S/) y OC del cliente (USD) quedan en la misma moneda antes del margen", () => {
  const enUSD = costoEn(c, "USD", 3.8);
  assert.equal(enUSD.costoTotal, 180);
  assert.equal(enUSD.ocSubtotal, 200);
  assert.equal(enUSD.margen, 20);
  assert.equal(enUSD.comprometido.flete, 10);
  const enPEN = costoEn(c, "PEN", 3.8);
  assert.equal(enPEN.ocSubtotal, 760);
  assert.equal(enPEN.margen, 76);
  assert.equal(costoEn({ ...c, ocSubtotal: null, ocMoneda: null }, "PEN", 3.8).margen, null);
  // Sin TC no se puede comparar una OC en USD contra costos en S/: margen "—", no un número falso.
  assert.equal(costoEn(c, "PEN", null).margen, null);
});

test("filas del reporte y del Excel en la moneda elegida", () => {
  const enUSD = costoEn(c, "USD", 3.8);
  const r = filaResumenCosto(enUSD, (e) => e.razonSocial, 3.8);
  assert.equal(r["Moneda"], "USD");
  assert.equal(r["TC"], 3.8);
  assert.equal(r["Costo total"], 180);
  assert.equal(r["Margen"], 20);
  assert.equal(filaResumenCosto(costoEn({ ...c, ocSubtotal: null }, "PEN", 3.8), (e) => e.razonSocial, 3.8)["Margen"], "—");
  assert.deepEqual(Object.keys(filaComprometido(enUSD)), ["N° OT", "Moneda", "Materiales", "Servicios", "Flete", "Otros", "Total comprometido"]);
  assert.equal(filaConsumido(enUSD)["HH"], 20);
});
