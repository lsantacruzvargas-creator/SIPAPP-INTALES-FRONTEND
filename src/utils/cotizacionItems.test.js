import { test } from "node:test";
import assert from "node:assert/strict";
import {
  itemDesdeDb, vinculosItem, montoAjustadoItem, subtotalPartida, indicesLibresOC,
  partidasTomadas, partidaRecibida, infoPartidaItem,
} from "./cotizacionItems.js";

const cot = {
  _id: "c1",
  descuentoGlobal: 0,
  afectoIgv: true,
  items: [
    { descripcion: "A", cantidad: 1, precio: 100 },
    { descripcion: "B", cantidad: 2, precio: 100 },
    { descripcion: "C", cantidad: 1, precio: 200 },
  ],
  // Base 450 sobre ítems que suman 500: factor 0,9.
  igv: 81,
  total: 531,
};

test("itemDesdeDb conserva los tres vínculos y vinculosItem los manda como ids", () => {
  const it = itemDesdeDb({
    descripcion: "A", cantidad: 1, precio: 10,
    otGenerada: { _id: "ot1", codigo: "OT-1" },
    ocGenerada: { _id: "oc1", numeroOrden: "450", anulado: false },
    partidaOC: "p1",
  });
  assert.equal(it.partidaOC, "p1");
  assert.deepEqual(vinculosItem(it), { otGenerada: "ot1", ocGenerada: "oc1", partidaOC: "p1" });
  assert.deepEqual(vinculosItem({ descripcion: "nuevo" }), { otGenerada: null, ocGenerada: null, partidaOC: null });
});

test("subtotalPartida: igual que Backend/src/utils/partidasOC.js", () => {
  assert.equal(montoAjustadoItem(cot, cot.items[1]), 180);
  assert.equal(subtotalPartida(cot, [1]), 180);
  assert.equal(subtotalPartida(cot, [0, 2]), 270);
  assert.equal(subtotalPartida(cot, [0, 1, 2]), 450);
  assert.equal(subtotalPartida({ ...cot, items: [] }, []), 450);
  const inafecta = { ...cot, afectoIgv: false, igv: 0, total: 400 };
  assert.equal(subtotalPartida(inafecta, [0, 1, 2]), 400);
  assert.equal(subtotalPartida(inafecta, [1]), 160);
});

test("indicesLibresOC: un ítem con OC anulada vuelve a estar libre", () => {
  const c = { items: [{ ocGenerada: { _id: "o1", anulado: false } }, { ocGenerada: null }, { ocGenerada: { _id: "o2", anulado: true } }] };
  assert.deepEqual(indicesLibresOC(c), [1, 2]);
  assert.deepEqual(indicesLibresOC(null), []);
});

test("partidasTomadas: traduce las posiciones guardadas a la partida de cada ítem", () => {
  const c = {
    items: [{ partidaOC: "p1" }, { partidaOC: null }, { partidaOC: "p1" }, { partidaOC: "p2" }],
    bloqueo: { indicesFacturados: [0, 2] },
  };
  assert.deepEqual([...partidasTomadas(c)], ["p1"]);
  assert.equal(partidasTomadas({ items: [] }).size, 0);
});

test("partidaRecibida: la partida libre de la cotización (al anexar, la nueva o la que se amplió)", () => {
  const oc = {
    partidas: [{ _id: "p1", cotizacion: { _id: "c1" } }, { _id: "p2", cotizacion: "c2" }, { _id: "p3", cotizacion: "c1" }],
    estadoFacturacion: { partidas: [{ _id: "p1", estado: "facturada" }, { _id: "p2", estado: "sin facturar" }, { _id: "p3", estado: "sin facturar" }] },
  };
  assert.equal(partidaRecibida(oc, "c1")._id, "p3");
  assert.equal(partidaRecibida({ partidas: [{ _id: "p9", cotizacion: "c1" }] }, "c1")._id, "p9");
  assert.equal(partidaRecibida({ partidas: [] }, "c1"), null);
});

test("infoPartidaItem: posición n/N y estado de la partida del ítem", () => {
  const ocs = [{
    _id: "oc1",
    partidas: [{ _id: "p1" }, { _id: "p2" }],
    estadoFacturacion: { partidas: [{ _id: "p1", estado: "sin facturar" }, { _id: "p2", estado: "reservada" }] },
  }];
  assert.deepEqual(infoPartidaItem({ ocGenerada: { _id: "oc1" }, partidaOC: "p2" }, ocs), { posicion: 2, total: 2, estado: "reservada" });
  assert.equal(infoPartidaItem({ ocGenerada: { _id: "oc9" }, partidaOC: "p2" }, ocs), null);
  assert.equal(infoPartidaItem({ ocGenerada: null, partidaOC: null }, ocs), null);
});
