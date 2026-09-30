import { test } from "node:test";
import assert from "node:assert/strict";
import {
  crearFila, lineasDeSCs, ordenarProveedores, totalesOCP, proveedorMasBarato,
  filtrarOCPs, aplanarItemsOCP, FILTROS_VACIOS,
} from "./compras.js";

test("lineasDeSCs aplana solo el estado pedido y conserva la SC", () => {
  const scs = [
    { _id: "sc1", codigo: "SC-0001", items: [{ _id: "a", estadoCompra: "por_procesar" }, { _id: "b", estadoCompra: "adjudicado" }] },
    { _id: "sc2", codigo: "SC-0002", items: [{ _id: "c", estadoCompra: "por_procesar" }] },
  ];
  const filas = lineasDeSCs(scs);
  assert.deepEqual(filas.map((f) => f._id), ["a", "c"]);
  assert.equal(filas[1].sc.codigo, "SC-0002");
});

test("ordenarProveedores pone primero a los que venden más tipos de las líneas", () => {
  const prov = (razonSocial, tipoArticulos) => ({ _id: razonSocial, razonSocial, tipoArticulos });
  const lista = [
    prov("Zeta", []),
    prov("Beta", [{ _id: "t1", nombre: "Eléctricos" }]),
    prov("Alfa", [{ _id: "t1" }, { _id: "t2" }]),
    prov("Gamma", ["t2"]),
  ];
  const { sugeridos, otros, totalTipos } = ordenarProveedores(lista, ["t1", "t2", null, "t1"]);
  assert.equal(totalTipos, 2);
  assert.deepEqual(sugeridos.map((s) => [s.proveedor.razonSocial, s.coincidencias]), [["Alfa", 2], ["Beta", 1], ["Gamma", 1]]);
  assert.deepEqual(otros.map((o) => o.proveedor.razonSocial), ["Zeta"]);
});

test("totalesOCP con y sin IGV", () => {
  assert.deepEqual(totalesOCP([{ cantidad: "4", precioUnitario: "10" }]), { subtotal: 40, igv: 7.2, total: 47.2 });
  assert.deepEqual(totalesOCP([{ cantidad: 2, precioUnitario: 50 }], false), { subtotal: 100, igv: 0, total: 100 });
});

test("proveedorMasBarato compara USD convertido a soles", () => {
  const proveedores = [
    { _id: "A", moneda: "PEN", precios: [{ itemId: "i1", precioUnitario: 12 }] },
    { _id: "B", moneda: "USD", precios: [{ itemId: "i1", precioUnitario: 3 }] },
  ];
  assert.equal(proveedorMasBarato(proveedores, "i1", 3.8), "B");
  assert.equal(proveedorMasBarato(proveedores, "i1", 4.5), "A");
  assert.equal(proveedorMasBarato(proveedores, "i9", 3.8), null);
});

test("filtros de la pestaña Compras por OC, proveedor, texto, fechas y estado", () => {
  const ocps = [
    { codigo: "OCP-0001", fecha: "2026-09-10T15:00:00Z", anulada: false, proveedor: { _id: "p1" },
      items: [{ descripcion: "Cable 4mm", tipoArticulo: { _id: "t1" }, centroCosto: { _id: "c1" } }, { descripcion: "Pernos", tipoArticulo: { _id: "t2" }, centroCosto: { _id: "c1" } }] },
    { codigo: "OCP-0002", fecha: "2026-09-20T15:00:00Z", anulada: true, proveedor: { _id: "p2" },
      items: [{ descripcion: "Cable 6mm", tipoArticulo: { _id: "t1" }, centroCosto: { _id: "c2" } }] },
  ];
  const f = (extra) => ({ ...FILTROS_VACIOS, ...extra });
  assert.equal(filtrarOCPs(ocps, f({ codigo: "0002" })).length, 1);
  assert.equal(filtrarOCPs(ocps, f({ proveedor: "p1" }))[0].codigo, "OCP-0001");
  assert.equal(filtrarOCPs(ocps, f({ texto: "cable" })).length, 2);
  assert.equal(filtrarOCPs(ocps, f({ desde: "2026-09-15" })).length, 1);
  assert.equal(filtrarOCPs(ocps, f({ hasta: "2026-09-10" })).length, 1);
  assert.equal(filtrarOCPs(ocps, f({ estado: "vigente" })).length, 1);
  const items = aplanarItemsOCP(ocps, f({ texto: "cable" }));
  assert.deepEqual(items.map((i) => [i.ocp.codigo, i.descripcion]), [["OCP-0001", "Cable 4mm"], ["OCP-0002", "Cable 6mm"]]);
  assert.equal(aplanarItemsOCP(ocps, f({ centroCosto: "c1" })).length, 2);
});

test("crearFila: las tareas de una misma clave corren una tras otra; claves distintas no se esperan", async () => {
  const enFila = crearFila();
  const orden = [];
  const tarea = (nombre, ms) => () => new Promise((r) => setTimeout(() => { orden.push(nombre); r(nombre); }, ms));
  const a1 = enFila("sc1", tarea("a1", 30));
  const a2 = enFila("sc1", tarea("a2", 1));
  const b1 = enFila("sc2", tarea("b1", 5));
  assert.deepEqual(await Promise.all([a1, a2, b1]), ["a1", "a2", "b1"]);
  assert.deepEqual(orden, ["b1", "a1", "a2"]);
  const falla = enFila("sc1", () => Promise.reject(new Error("x")));
  await assert.rejects(falla);
  assert.equal(await enFila("sc1", async () => "sigue"), "sigue");
});
