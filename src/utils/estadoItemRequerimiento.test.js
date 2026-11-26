import { test } from "node:test";
import assert from "node:assert/strict";
import { estadoItem } from "./estadoItemRequerimiento.js";

test("compra en Compras: manda el estado de la SC/OCP y muestra sus códigos", () => {
  const it = { esSolicitudCompra: true, estadoPago: "por_procesar", compra: { estado: "en_licitacion", sc: "SC-0003", licitacion: "LIC-0001", ocp: "" } };
  assert.equal(estadoItem(it).label, "En licitación");
  assert.equal(estadoItem(it).detalle, "SC-0003 · LIC-0001");
  assert.equal(estadoItem({ ...it, compra: { estado: "pago_parcial", sc: "SC-0003", ocp: "OCP-0002" } }).label, "Pago parcial");
});

test("compra heredada: anulado y recepcionado antes que el estado de pago", () => {
  assert.equal(estadoItem({ esSolicitudCompra: true, estadoPago: "pagado", recepcionado: true }).label, "Recepcionado");
  assert.equal(estadoItem({ esSolicitudCompra: true, estadoPago: "pendiente_pago", anulado: true }).label, "Anulado");
  assert.equal(estadoItem({ esSolicitudCompra: true }).label, "Por procesar");
});

test("ítem de stock: estado del despacho de almacén", () => {
  assert.equal(estadoItem({ esSolicitudCompra: false, estado: "atendido" }).label, "Atendido");
  assert.equal(estadoItem({ esSolicitudCompra: false, estado: "raro" }).label, "raro");
});
