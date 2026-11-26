import { test } from "node:test";
import assert from "node:assert/strict";
import {
  prellenadoDesdeOC, ocLegadoLibre, noEnviado, estadoDePartida, partidasFacturadas, numerosFacturaDe, numerosFacturaPorCadena,
  ocsDeCotizacion, facturasDeCotizacion,
} from "./facturacionOC.js";

const cotA = {
  _id: "cA", titulo: "Mantenimiento A", tipo: "servicio", moneda: "USD", descuentoGlobal: 0, total: 354, igv: 54,
  items: [
    { descripcion: "Bomba", cantidad: 2, precio: 100, partidaOC: "p1", ocGenerada: "oc1" },
    { descripcion: "Válvula", cantidad: 1, precio: 100, partidaOC: "p1", ocGenerada: "oc1" },
    { descripcion: "Sin OC", cantidad: 1, precio: 50 },
  ],
};
const cotB = { _id: "cB", titulo: "Repuestos B", tipo: "venta", moneda: "USD", total: 118, igv: 18, items: [] };

const ocBase = {
  _id: "oc1", numeroOrden: "4500", codigo: "OC-0001", subtotal: 400, moneda: "PEN",
  cotizacion: { _id: "cA", titulo: "Mantenimiento A", moneda: "USD", tipo: "servicio" },
  partidas: [
    { _id: "p1", cotizacion: { _id: "cA" }, titulo: "Partida A", subtotal: 300 },
    { _id: "p2", cotizacion: { _id: "cB" }, titulo: "", subtotal: 100 },
  ],
};

test("más de una partida: una línea por partida con su monto (título o el de la cotización)", () => {
  const r = prellenadoDesdeOC({ oc: ocBase, partidas: ocBase.partidas, cotizaciones: [cotA, cotB] });
  assert.deepEqual(r.items.map((i) => [i.descripcion, i.cantidad, i.valorUnitario, i.unidad, i.afectacion]), [
    ["Partida A", 1, 300, "ZZ", "10"],
    ["Repuestos B", 1, 100, "ZZ", "10"],
  ]);
  assert.equal(r.items[0].precioUnitario, 354);
  assert.deepEqual(r.partidasOC, ["p1", "p2"]);
  assert.equal(r.moneda, "USD");
  assert.equal(r.tipoBienServicio, "servicio");
  assert.equal(r.numeroOrdenCompra, "4500");
  assert.equal(r.ordenCompraId, "oc1");
  assert.equal(r.montosFijos, true);
});

test("una partida: sus ítems por partidaOC si suman su monto", () => {
  const r = prellenadoDesdeOC({ oc: ocBase, partidas: [ocBase.partidas[0]], cotizaciones: [cotA, cotB] });
  assert.deepEqual(r.items.map((i) => [i.descripcion, i.cantidad, i.valorUnitario]), [
    ["Bomba", 2, 100],
    ["Válvula", 1, 100],
  ]);
  assert.deepEqual(r.partidasOC, ["p1"]);
});

test("una partida con descuento global: valor unitario neto y tolerancia de medio céntimo por línea", () => {
  const cot = { ...cotA, descuentoGlobal: 4 };
  const partida = { ...ocBase.partidas[0], subtotal: 288.01 };
  const r = prellenadoDesdeOC({ oc: ocBase, partidas: [partida], cotizaciones: [cot] });
  assert.deepEqual(r.items.map((i) => i.valorUnitario), [96, 96]);
});

test("una partida cuyos ítems no suman su monto: una línea genérica por el monto de la partida", () => {
  const partida = { ...ocBase.partidas[0], subtotal: 320 };
  const r = prellenadoDesdeOC({ oc: ocBase, partidas: [partida], cotizaciones: [cotA] });
  assert.deepEqual(r.items.map((i) => [i.descripcion, i.valorUnitario]), [["Partida A", 320]]);
});

test("una partida de una cotización sin ítems (la cubre entera): línea genérica", () => {
  const r = prellenadoDesdeOC({ oc: ocBase, partidas: [ocBase.partidas[1]], cotizaciones: [cotB] });
  assert.deepEqual(r.items.map((i) => [i.descripcion, i.valorUnitario, i.unidad]), [["Repuestos B", 100, "NIU"]]);
  assert.equal(r.tipoBienServicio, "bien");
  assert.equal(r.moneda, "USD");
});

test("OC legado sin partidas: ítems de la OC si cuadran con su subtotal, partidasOC vacío", () => {
  const oc = { ...ocBase, partidas: [], subtotal: 300 };
  const cot = { ...cotA, items: cotA.items.map((i) => ({ ...i, partidaOC: null })) };
  const r = prellenadoDesdeOC({ oc, partidas: [], cotizaciones: [cot] });
  assert.deepEqual(r.items.map((i) => i.descripcion), ["Bomba", "Válvula"]);
  assert.deepEqual(r.partidasOC, []);
  assert.equal(r.montosFijos, true);
});

test("OC legado cuyos ítems no cuadran: una línea por el subtotal de la OC", () => {
  const oc = { ...ocBase, partidas: [], subtotal: 250, descripcion: "Servicio OC" };
  const r = prellenadoDesdeOC({ oc, partidas: [], cotizaciones: [cotA] });
  assert.deepEqual(r.items.map((i) => [i.descripcion, i.valorUnitario]), [["Servicio OC", 250]]);
});

test("OC legado: tolerancia fija de un céntimo (la del servidor), no uno por línea", () => {
  const cot = { _id: "cL", tipo: "venta", items: [1, 2, 3].map((n) => ({ descripcion: `Ítem ${n}`, cantidad: 1, precio: 100, ocGenerada: "ocL" })) };
  const prellenar = (subtotal) => prellenadoDesdeOC({ oc: { _id: "ocL", cotizacion: "cL", subtotal, descripcion: "OC legado", partidas: [] }, partidas: [], cotizaciones: [cot] });
  assert.deepEqual(prellenar(300.02).items.map((i) => [i.descripcion, i.valorUnitario]), [["OC legado", 300.02]]);
  assert.deepEqual(prellenar(300.01).items.map((i) => i.descripcion), ["Ítem 1", "Ítem 2", "Ítem 3"]);
});

test("OC legado sin cotización: línea por el subtotal; moneda de la OC", () => {
  const oc = { _id: "oc9", numeroOrden: "", codigo: "OC-0009", subtotal: 80, moneda: "USD", titulo: "Suelta", partidas: [] };
  const r = prellenadoDesdeOC({ oc, partidas: [], cotizaciones: [] });
  assert.deepEqual(r.items.map((i) => [i.descripcion, i.valorUnitario, i.unidad]), [["Suelta", 80, "NIU"]]);
  assert.equal(r.moneda, "USD");
  assert.equal(r.numeroOrdenCompra, "OC-0009");
});

test("OC legado con subtotal 0: el servidor no compara, los montos quedan editables", () => {
  const oc = { _id: "oc9", subtotal: 0, titulo: "Sin monto", partidas: [] };
  const r = prellenadoDesdeOC({ oc, partidas: [], cotizaciones: [] });
  assert.equal(r.montosFijos, false);
  assert.equal(r.items[0].descripcion, "Sin monto");
  assert.equal(r.items[0].valorUnitario, "");
  assert.equal(r.moneda, "PEN");
});

test("ocLegadoLibre: solo OC sin partidas, sin facturar, no reservada y no anulada", () => {
  const libre = { partidas: [], estadoFacturacion: { estado: "sin facturar", reservada: false } };
  assert.equal(ocLegadoLibre(libre), true);
  assert.equal(ocLegadoLibre({ ...libre, partidas: [{ _id: "p1" }] }), false);
  assert.equal(ocLegadoLibre({ ...libre, anulado: true }), false);
  assert.equal(ocLegadoLibre({ ...libre, estadoFacturacion: { estado: "sin facturar", reservada: true } }), false);
  assert.equal(ocLegadoLibre({ ...libre, estadoFacturacion: { estado: "facturada" } }), false);
  assert.equal(ocLegadoLibre({ ...libre, estadoFacturacion: { estado: "pagada" } }), false);
  assert.equal(ocLegadoLibre({ partidas: [] }), false);
});

test("noEnviado: ANULADO sin la NC que lo anuló", () => {
  assert.equal(noEnviado({ estado: "ANULADO", anuladoPor: null, sunat: { mensaje: "No enviado: …" } }), true);
  assert.equal(noEnviado({ estado: "ANULADO", anuladoPor: "nc1" }), false);
  assert.equal(noEnviado({ estado: "ACEPTADO" }), false);
});

test("estado por partida, partidas facturadas y números de factura de la OC", () => {
  const oc = {
    partidas: [{ _id: "p1" }, { _id: "p2" }, { _id: "p3" }],
    estadoFacturacion: {
      estado: "facturada parcial",
      numerosFactura: "F001-15,  F001-21",
      partidas: [
        { _id: "p1", estado: "pagada", factura: { numeroFactura: "F001-15" } },
        { _id: "p2", estado: "facturada", factura: { numeroFactura: "F001-21" } },
        { _id: "p3", estado: "reservada", factura: null },
      ],
    },
  };
  assert.equal(estadoDePartida(oc, { _id: "p2" }).estado, "facturada");
  assert.equal(estadoDePartida(oc, { _id: "p9" }), undefined);
  assert.equal(partidasFacturadas(oc), 2);
  assert.deepEqual(numerosFacturaDe(oc), ["F001-15", "F001-21"]);
  assert.deepEqual(numerosFacturaDe({}), []);
  assert.equal(partidasFacturadas({}), 0);
});

test("numerosFacturaPorCadena: todas las facturas con número de cada cadena", () => {
  const m = numerosFacturaPorCadena([
    { numeroDocumento: 7, numeroFactura: "F001-1" },
    { numeroDocumento: 7, numeroFactura: "F001-2" },
    { numeroDocumento: 8, numeroFactura: "" },
    { numeroDocumento: null, numeroFactura: "F001-3" },
    { numeroDocumento: 0, numeroFactura: "F001-4" },
  ]);
  assert.equal(m.get(7), "F001-1, F001-2");
  assert.equal(m.has(8), false);
  assert.equal(m.get(0), "F001-4");
  assert.equal(m.size, 2);
});

test("ocsDeCotizacion: OC con una partida de la cotización; legado por su cotización; vigentes sin anuladas", () => {
  const ocs = [
    { _id: "o1", cotizacion: "cA", partidas: [{ _id: "p1", cotizacion: "cA" }] },
    { _id: "o2", cotizacion: { _id: "cB" }, partidas: [{ _id: "p2", cotizacion: "cB" }, { _id: "p3", cotizacion: { _id: "cA" } }] },
    { _id: "o3", cotizacion: "cA", partidas: [{ _id: "p4", cotizacion: "cC" }] },
    { _id: "o4", cotizacion: { _id: "cA" }, partidas: [] },
    { _id: "o5", cotizacion: "cA", anulado: true, partidas: [{ _id: "p5", cotizacion: "cA" }] },
    { _id: "o6", cotizacion: "cB" },
  ];
  assert.deepEqual(ocsDeCotizacion(ocs, "cA").map((o) => o._id), ["o1", "o2", "o4", "o5"]);
  assert.deepEqual(ocsDeCotizacion(ocs, { _id: "cA" }, { vigentes: true }).map((o) => o._id), ["o1", "o2", "o4"]);
  assert.deepEqual(ocsDeCotizacion(null, "cA"), []);
});

test("facturasDeCotizacion: de sus OC sin partidasOC o con una partida suya; sin OC, por la cadena", () => {
  const ocs = [
    { _id: "o1", partidas: [{ _id: "p1", cotizacion: "cA" }, { _id: "p2", cotizacion: "cB" }] },
    { _id: "o4", partidas: [] },
  ];
  const facturas = [
    { _id: "f1", ordenCompra: { _id: "o1" }, partidasOC: ["p1"] },
    { _id: "f2", ordenCompra: "o1", partidasOC: ["p2"] },
    { _id: "f3", ordenCompra: "o1", partidasOC: [] },
    { _id: "f4", ordenCompra: "o4" },
    { _id: "f5", ordenCompra: "o9", partidasOC: [] },
    { _id: "f6", ordenCompra: null, numeroDocumento: 7 },
    { _id: "f7", numeroDocumento: 8 },
  ];
  assert.deepEqual(facturasDeCotizacion(facturas, ocs, { _id: "cA", numeroDocumento: 7 }).map((f) => f._id), ["f1", "f3", "f4", "f6"]);
  assert.deepEqual(facturasDeCotizacion(facturas, [], { _id: "cA" }).map((f) => f._id), []);
});
