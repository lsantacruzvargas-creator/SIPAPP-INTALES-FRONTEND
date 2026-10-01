# Comprobantes de compra — Fase 1: Costos de fabricación comprometido/consumido — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el costo de fabricación de cada OT muestre lo comprado con OC a proveedor como **comprometido** mientras no se paga y como **consumido** cuando Tesorería lo paga (HH/HM siempre consumido), sin depender del "Marcar como pagado" manual; y que el reporte y la tarjeta de la OC se puedan ver en S/ o US$ con el tipo de cambio SUNAT de una fecha elegida.

**Architecture:** Una sola función de servidor `costosPorOT()` (`Backend/src/utils/costosOT.js`) calcula, por OT padre (sumando sus sub-OT), comprometido y consumido a partir de las líneas de OCP, la fracción pagada de sus comprobantes (`FacturaProveedor`), el flete repartido, los comprobantes sin OC ligados a la OT, los ítems antiguos sin OCP y las notificaciones HH/HM. La usan el reporte y una ruta nueva por OT; el frontend deja de calcular.

**Tech Stack:** Node 24 ESM + Express 4 + Mongoose 8 (`node:test`), React 19 + Vite + Tailwind, `xlsx`.

**Spec:** `docs/superpowers/specs/2026-09-30-comprobantes-compra-design.md` (sección "Costos de fabricación: comprometido y consumido").

## Global Constraints

- Rama nueva `feature/comprobantes-compra` en Backend y Frontend, creada desde `main`. Commits con `-m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`.
- Tests backend: `MONGO_URI_TEST="mongodb://localhost:27017/sipapp-intales-test?replicaSet=rs0" npm test` (el mongod local ya es replica set `rs0`).
- Costos en **soles y sin IGV**. Margen = subtotal de la OC del cliente − (comprometido + consumido).
- Notas de crédito: no existen aún (Fase 4); su efecto en costos se agrega en esa fase.
- Tipo de cambio por fecha (adelantado de la Fase 2 a pedido del usuario): **primero la BD (`TipoCambioDia`), después apiperu**; toda respuesta de apiperu se guarda, salvo "hoy" sin publicación del día y las consultas fallidas. **Si apiperu falla, se usa el último TC guardado (≤ esa fecha); si no hay ninguno, el TC vigente del módulo Tipo de Cambio; solo si tampoco hay, error** (confirmado con el usuario). La pantalla indica la fecha real del TC usado.
- Selector de moneda: "S/ | US$" + "Tipo de cambio al: [fecha]" (por defecto hoy, Lima). Convierte costos **y** el subtotal de la OC del cliente con el TC venta de esa fecha; el margen se calcula después de convertir. El Excel exporta en la moneda elegida con columnas Moneda y TC.
- Nunca `alert/confirm/prompt`; fechas con `utils/fecha` (hora Lima).

## Review Focus

1. Factura con detracción pagada solo en el neto (la detracción pendiente): la fracción pagada no debe pasar de lo realmente pagado ni superar 1 — test en Task 2.
2. OCP facturada en dos facturas parciales, una pagada y otra no: consumido = solo la parte de la pagada — test en Task 2.
3. OCP en USD creada antes de guardar su tipo de cambio: se usa el TC vigente — test en Task 1/2.
4. OT sin OC del cliente: margen "—" (null), no 0 — test en Task 4 (`costoEn`).
5. La tarjeta de la OC y el reporte dan los mismos números para la misma OT — test en Task 2 (ruta por OT = fila del reporte).
6. OC del cliente en USD vista en S/ (o al revés): el margen compara montos en la misma moneda — test en Task 4.
7. Fecha sin publicación SUNAT (domingo) o apiperu caído: se usa el último día hábil / se avisa y se queda en S/ — tests en Task 3.

---

### Task 1: La OCP guarda su tipo de cambio

**Files:**
- Modify: `Backend/src/models/OrdenCompraProveedor.js` (campo `tipoCambio`)
- Modify: `Backend/src/routes/licitaciones.js:308-340` (guardar `tipoCambio` al crear la OCP)
- Test: `Backend/test/costosFabricacion.test.js` (nuevo)

**Interfaces:**
- Produces: `OrdenCompraProveedor.tipoCambio: Number | null` (TC usado al adjudicar; `1` en PEN).

- [ ] **Step 0: Rama**

```bash
git -C Backend checkout -b feature/comprobantes-compra main
git -C Frontend checkout -b feature/comprobantes-compra main
```

- [ ] **Step 1: Test que falla** — crear `Backend/test/costosFabricacion.test.js`:

```js
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { conectar, desconectar, limpiar, levantar, escribir } from "./helpers.js";
import { escenarioBase, crearLicitacion, escenarioOCP } from "./escenarios.js";
import bloqueosRoutes from "../src/routes/bloqueos.js";
import licitacionesRoutes from "../src/routes/licitaciones.js";
import facturasProveedorRoutes from "../src/routes/facturasProveedor.js";
import movimientosRoutes from "../src/routes/movimientosTesoreria.js";
import ocpRoutes from "../src/routes/ordenesCompraProveedor.js";
import reportesRoutes from "../src/routes/reportes.js";
import CuentaTesoreria from "../src/models/CuentaTesoreria.js";
import TipoCambio from "../src/models/TipoCambio.js";
import OrdenTrabajo from "../src/models/OrdenTrabajo.js";
import OrdenCompra from "../src/models/OrdenCompra.js";
import OrdenCompraProveedor from "../src/models/OrdenCompraProveedor.js";
import Requerimiento from "../src/models/Requerimiento.js";
import NotificacionTrabajo from "../src/models/NotificacionTrabajo.js";

let srv, bcp;
before(async () => {
  await conectar();
  srv = await levantar({
    "/api/bloqueos": bloqueosRoutes, "/api/licitaciones": licitacionesRoutes, "/api/facturas-proveedor": facturasProveedorRoutes,
    "/api/movimientos-tesoreria": movimientosRoutes, "/api/ordenes-compra-proveedor": ocpRoutes, "/api/reportes": reportesRoutes,
  });
});
after(async () => { await srv.cerrar(); await desconectar(); });
beforeEach(async () => {
  await limpiar();
  bcp = await CuentaTesoreria.create({ nombre: "BCP Soles", tipo: "banco", moneda: "PEN" });
});

test("la OCP guarda el tipo de cambio con que se adjudicó (USD) y 1 en soles", async () => {
  await TipoCambio.create({ valor: 3.8 });
  const base = await escenarioBase({ lineas: 1 });
  const lic = await crearLicitacion(srv, base);
  const r = await escribir(srv, "licitacion", lic._id, "POST", `/api/licitaciones/${lic._id}/adjudicar`, {
    body: { ordenes: [{ proveedorId: lic.proveedores[0]._id, moneda: "USD", formaPago: "Contado",
      items: lic.items.map((it) => ({ itemId: it._id, cantidad: it.cantidad, precioUnitario: 10 })) }] },
  });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  assert.equal((await OrdenCompraProveedor.findById(r.data[0]._id)).tipoCambio, 3.8);
});

test("la OCP en soles guarda tipo de cambio 1", async () => {
  const { ocp } = await escenarioOCP(srv);
  assert.equal((await OrdenCompraProveedor.findById(ocp._id)).tipoCambio, 1);
});
```

- [ ] **Step 2: Correr y ver que falla**

Run: `cd Backend && MONGO_URI_TEST="mongodb://localhost:27017/sipapp-intales-test?replicaSet=rs0" node --test --test-concurrency=1 test/costosFabricacion.test.js`
Expected: FAIL — `tipoCambio` es `undefined`.

- [ ] **Step 3: Implementar**

En `OrdenCompraProveedor.js`, junto a `moneda`:

```js
    // TC con que se adjudicó (para costear en soles); 1 en PEN. null = OCP anterior a este campo.
    tipoCambio: { type: Number, default: null },
```

En `routes/licitaciones.js`, en el `new OrdenCompraProveedor({ ... })` de la adjudicación (la variable `tipoCambio` ya existe en la línea 308):

```js
          tipoCambio: orden.moneda === "USD" ? tipoCambio : 1,
```

(usar el nombre real de la variable de la orden en ese bucle; si la moneda viene en otra variable, ajustar).

- [ ] **Step 4: Correr** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(costos): la OC a proveedor guarda su tipo de cambio`.

### Task 2: `costosPorOT()` y rutas del reporte

**Files:**
- Create: `Backend/src/utils/costosOT.js`
- Modify: `Backend/src/routes/reportes.js:154-249` (reemplazar el cálculo; agregar ruta por OT antes de `router.use(puedeVer)`)
- Test: `Backend/test/costosFabricacion.test.js`

**Interfaces:**
- Produces:
  - `fraccionPagada(fp) → number` en [0, 1].
  - `costosPorOT({ otIds?: ObjectId[] }) → Promise<Array<FilaCosto>>`, donde
    `FilaCosto = { otId, numeroOT, titulo, empresa, numeroOrdenCompra, ocSubtotal|null, ocMoneda: "PEN"|"USD"|null, comprometido: { materiales, servicios, flete, otros, total }, consumido: { hh, hm, materiales, servicios, flete, otros, total }, costoTotal }` (costos en S/, redondeados a 2 decimales; `ocSubtotal` en la moneda de la OC del cliente; el margen lo calcula el frontend tras convertir, Task 4).
  - `GET /api/reportes/costos-fabricacion` → `FilaCosto[]` (solo OT con `costoTotal > 0`, orden descendente).
  - `GET /api/reportes/costos-fabricacion/:otId` → `FilaCosto` de esa OT padre; roles `admin, jefatura, vendedor, facturacion`; 404 si no existe.

- [ ] **Step 1: Tests que fallan** — agregar a `costosFabricacion.test.js`:

```js
const ID = () => new mongoose.Types.ObjectId();
const pagar = (fp, concepto, monto) => srv.api("POST", "/api/movimientos-tesoreria", {
  body: { documento: { tipo: "facturaProveedor", id: fp._id }, concepto, monto, fecha: "2026-09-29", cuenta: bcp._id, medio: "transferencia", numeroOperacion: "OP" },
});
const factura = async (ocp, extra = {}) => (await srv.api("POST", "/api/facturas-proveedor", {
  body: { ordenCompraProveedor: ocp._id, tipoComprobante: "01", serie: "F001", numero: String(Math.random()).slice(2, 8), fechaEmision: "2026-09-28",
    subtotal: 300, igv: 54, condicion: "contado", impuesto: { tipo: "ninguno" }, ...extra },
})).data;
const costoDe = async (otId, rol = "jefatura") => (await srv.api("GET", `/api/reportes/costos-fabricacion/${otId}`, { rol })).data;

test("OCP sin facturar: todo comprometido; nada consumido", async () => {
  const { base } = await escenarioOCP(srv);
  const c = await costoDe(base.otId);
  assert.equal(c.comprometido.materiales, 300);
  assert.equal(c.consumido.total, 0);
  assert.equal(c.costoTotal, 300);
});

test("factura pagada a medias reparte en proporción; pagada completa pasa todo a consumido", async () => {
  const { base, ocp } = await escenarioOCP(srv);
  const fp = await factura(ocp);
  assert.equal((await pagar(fp, "neto", 177)).status, 201);
  let c = await costoDe(base.otId);
  assert.equal(c.consumido.materiales, 150);
  assert.equal(c.comprometido.materiales, 150);
  await pagar(fp, "neto", 177);
  c = await costoDe(base.otId);
  assert.equal(c.consumido.materiales, 300);
  assert.equal(c.comprometido.total, 0);
});

test("detracción pendiente: solo cuenta lo pagado (neto) sobre el total a pagar", async () => {
  const { base, ocp } = await escenarioOCP(srv);
  const fp = await factura(ocp, { impuesto: { tipo: "detraccion", codigoSunat: "037", quienDeposita: "nosotros" } });
  await pagar(fp, "neto", fp.netoAPagar);
  const c = await costoDe(base.otId);
  const esperado = Math.round(300 * (fp.netoAPagar / 354) * 100) / 100;
  assert.equal(c.consumido.materiales, esperado);
  assert.equal(Math.round((c.consumido.materiales + c.comprometido.materiales) * 100) / 100, 300);
});

test("OCP en dos facturas parciales: consumido solo la parte de la pagada", async () => {
  const { base, ocp } = await escenarioOCP(srv);
  const f1 = await factura(ocp, { subtotal: 100, igv: 18 });
  await factura(ocp, { subtotal: 200, igv: 36 });
  await pagar(f1, "neto", 118);
  const c = await costoDe(base.otId);
  assert.equal(c.consumido.materiales, 100);
  assert.equal(c.comprometido.materiales, 200);
});

test("flete de la factura: comprometido hasta que se paga", async () => {
  const { base, ocp } = await escenarioOCP(srv);
  const fp = await factura(ocp, { subtotal: 330, igv: 59.4, flete: 30 });
  let c = await costoDe(base.otId);
  assert.equal(c.comprometido.flete, 30);
  await pagar(fp, "neto", 389.4);
  c = await costoDe(base.otId);
  assert.equal(c.consumido.flete, 30);
  assert.equal(c.consumido.materiales, 300);
});

test("comprobante sin OC ligado a la OT cuenta como 'otros'", async () => {
  const base = await escenarioBase({ lineas: 1 });
  const fp = (await srv.api("POST", "/api/facturas-proveedor", {
    body: { proveedor: base.provA._id, centroCosto: base.centro._id, ordenTrabajo: base.otId, tipoComprobante: "01", serie: "F009", numero: "7",
      fechaEmision: "2026-09-28", subtotal: 100, igv: 18, condicion: "contado", impuesto: { tipo: "ninguno" } },
  })).data;
  let c = await costoDe(base.otId);
  assert.equal(c.comprometido.otros, 100);
  await pagar(fp, "neto", 118);
  c = await costoDe(base.otId);
  assert.equal(c.consumido.otros, 100);
});

test("ítems antiguos sin OCP: pagado → consumido, pendiente de pago → comprometido; HH/HM → consumido; sub-OT suma al padre", async () => {
  const padre = (await OrdenTrabajo.collection.insertOne({ numeroOT: "OT-P", anulado: false, ordenPadre: null })).insertedId;
  const hija = (await OrdenTrabajo.collection.insertOne({ numeroOT: "OT-P-1", anulado: false, ordenPadre: padre })).insertedId;
  await Requerimiento.collection.insertOne({ ordenTrabajo: hija, anulado: false, items: [
    { _id: ID(), esSolicitudCompra: true, cantidad: 2, montoUnitario: 10, costoTransporte: 5, estadoPago: "pagado" },
    { _id: ID(), esSolicitudCompra: true, cantidad: 1, montoUnitario: 40, costoTransporte: 0, estadoPago: "pendiente_pago" },
  ] });
  await NotificacionTrabajo.collection.insertOne({ ordenTrabajo: padre, items: [
    { tipo: "hombre", costoTotal: 60, anulado: false }, { tipo: "maquina", costoTotal: 25, anulado: false }, { tipo: "hombre", costoTotal: 99, anulado: true },
  ] });
  const c = await costoDe(padre);
  assert.equal(c.consumido.materiales, 25);
  assert.equal(c.comprometido.materiales, 40);
  assert.equal(c.consumido.hh, 60);
  assert.equal(c.consumido.hm, 25);
  assert.equal(c.costoTotal, 150);
});

test("OCP anulada no cuenta", async () => {
  const { base, ocp } = await escenarioOCP(srv);
  const r = await escribir(srv, "ordenCompraProveedor", ocp._id, "PATCH", `/api/ordenes-compra-proveedor/${ocp._id}/anular`, { body: { motivo: "x" } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal((await costoDe(base.otId)).costoTotal, 0);
});

test("OCP en USD sin TC guardado usa el TC vigente", async () => {
  await TipoCambio.create({ valor: 3.5 });
  const { base, ocp } = await escenarioOCP(srv);
  await OrdenCompraProveedor.updateOne({ _id: ocp._id }, { $set: { moneda: "USD", tipoCambio: null } });
  assert.equal((await costoDe(base.otId)).comprometido.materiales, 1050);
});

test("OC del cliente (subtotal y moneda); sin OC → null; la ruta por OT coincide con el reporte; roles", async () => {
  const { base } = await escenarioOCP(srv);
  assert.equal((await costoDe(base.otId)).ocSubtotal, null);
  const cot = ID();
  await OrdenTrabajo.updateOne({ _id: base.otId }, { $set: { cotizacion: cot } });
  await OrdenCompra.collection.insertOne({ cotizacion: cot, numeroOrden: "OC-CLI-1", subtotal: 1000, moneda: "USD", anulado: false });
  const c = await costoDe(base.otId);
  assert.equal(c.ocSubtotal, 1000);
  assert.equal(c.ocMoneda, "USD");
  assert.equal(c.numeroOrdenCompra, "OC-CLI-1");
  const lista = (await srv.api("GET", "/api/reportes/costos-fabricacion", { rol: "jefatura" })).data;
  assert.deepEqual(lista.find((f) => String(f.otId) === String(base.otId)), c);
  assert.equal((await srv.api("GET", `/api/reportes/costos-fabricacion/${base.otId}`, { rol: "vendedor" })).status, 200);
  assert.equal((await srv.api("GET", `/api/reportes/costos-fabricacion/${base.otId}`, { rol: "tecnico" })).status, 403);
  assert.equal((await srv.api("GET", `/api/reportes/costos-fabricacion/${ID()}`)).status, 404);
});
```

(Si `POST /facturas-proveedor` con `flete` exige campos adicionales o el pago devuelve otro status, ajustar el test a la API real, sin cambiar lo que se mide.)

- [ ] **Step 2: Correr y ver que fallan** — Expected: FAIL (404 en la ruta por OT).

- [ ] **Step 3: Implementar `Backend/src/utils/costosOT.js`**

```js
import OrdenTrabajo from "../models/OrdenTrabajo.js";
import OrdenCompra from "../models/OrdenCompra.js";
import OrdenCompraProveedor from "../models/OrdenCompraProveedor.js";
import FacturaProveedor from "../models/FacturaProveedor.js";
import SolicitudCompra from "../models/SolicitudCompra.js";
import Requerimiento from "../models/Requerimiento.js";
import ServicioExterno from "../models/ServicioExterno.js";
import NotificacionTrabajo from "../models/NotificacionTrabajo.js";
import { valorTipoCambio } from "./compras.js";

const r2 = (n) => Math.round(n * 100) / 100;
const num = (v) => Number(v) || 0;

// Fracción pagada de un comprobante: lo pagado (neto + impuesto) sobre todo lo que
// hay que pagar por él (neto al proveedor + impuesto a SUNAT/Banco de la Nación).
export function fraccionPagada(fp) {
  if (fp.anulada) return 0;
  const pagado = num(fp.pagadoNeto) + num(fp.pagadoImpuesto);
  const obligacion = num(fp.netoAPagar) + num(fp.pagadoImpuesto) + num(fp.saldoImpuesto);
  if (obligacion <= 0) return fp.estado === "pagada" ? 1 : 0;
  return Math.min(1, pagado / obligacion);
}

const vacio = () => ({
  comprometido: { materiales: 0, servicios: 0, flete: 0, otros: 0 },
  consumido: { hh: 0, hm: 0, materiales: 0, servicios: 0, flete: 0, otros: 0 },
});

// Ítems antiguos (sin OCP): el flujo manual previo marcaba el pago en el origen.
const fraccionLegado = (estadoPago) => (estadoPago === "pagado" ? 1 : estadoPago === "pendiente_pago" ? 0 : null);

// Costo de fabricación por OT padre (suma sus sub-OT), en soles y sin IGV:
// comprometido = comprado/encargado y aún no pagado; consumido = pagado + HH/HM.
export async function costosPorOT({ otIds = null } = {}) {
  const padres = await OrdenTrabajo.find(
    { ordenPadre: null, anulado: { $ne: true }, ...(otIds ? { _id: { $in: otIds } } : {}) },
    "numeroOT titulo empresa cotizacion",
  ).populate("empresa", "codigo razonSocial alias ruc");
  const subs = await OrdenTrabajo.find({ ordenPadre: { $in: padres.map((p) => p._id) } }, "ordenPadre");
  const padreDe = new Map(padres.map((p) => [String(p._id), String(p._id)]));
  for (const s of subs) padreDe.set(String(s._id), String(s.ordenPadre));
  const ots = [...padreDe.keys()];
  const acc = new Map(padres.map((p) => [String(p._id), vacio()]));
  const sumar = (otId, seccion, concepto, monto) => {
    const p = padreDe.get(String(otId));
    if (p && monto) acc.get(p)[seccion][concepto] += monto;
  };
  const repartir = (otId, concepto, costo, fraccion) => {
    sumar(otId, "consumido", concepto, costo * fraccion);
    sumar(otId, "comprometido", concepto, costo * (1 - fraccion));
  };

  const [ocps, fps, scs, requerimientos, servicios, notificaciones, tcVigente] = await Promise.all([
    OrdenCompraProveedor.find({ anulada: false, "items.ordenTrabajo": { $in: ots } }),
    FacturaProveedor.find({ anulada: false }),
    SolicitudCompra.find({ "items.ordenCompraProveedor": { $ne: null } }, "origen servicioExterno items.origenItemId items.ordenCompraProveedor"),
    Requerimiento.find({ anulado: { $ne: true }, ordenTrabajo: { $in: ots } }, "ordenTrabajo items"),
    ServicioExterno.find({ anulado: { $ne: true }, ordenTrabajo: { $in: ots } }, "ordenTrabajo costo cantidad costoTransporte estadoPago"),
    NotificacionTrabajo.find({ ordenTrabajo: { $in: ots } }, "ordenTrabajo items"),
    valorTipoCambio(),
  ]);

  // Líneas de OCP: costo × fracción pagada de la OCP (lo no facturado cuenta como no pagado).
  const fpsPorOCP = new Map();
  for (const fp of fps) {
    if (!fp.ordenCompraProveedor) continue;
    const k = String(fp.ordenCompraProveedor);
    if (!fpsPorOCP.has(k)) fpsPorOCP.set(k, []);
    fpsPorOCP.get(k).push(fp);
  }
  for (const ocp of ocps) {
    const tc = ocp.moneda === "USD" ? ocp.tipoCambio || tcVigente : 1;
    const pagadoBase = (fpsPorOCP.get(String(ocp._id)) || [])
      .reduce((s, fp) => s + (num(fp.subtotal) - num(fp.flete)) * fraccionPagada(fp), 0);
    const fraccion = ocp.subtotal > 0 ? Math.min(1, pagadoBase / ocp.subtotal) : 0;
    for (const it of ocp.items) {
      if (it.ordenTrabajo) repartir(it.ordenTrabajo, it.tipo === "servicio" ? "servicios" : "materiales", num(it.subtotal) * tc, fraccion);
    }
  }

  // Flete (en S/, ya repartido por línea de origen al registrar el comprobante).
  const otDeDoc = new Map([
    ...requerimientos.map((r) => [String(r._id), r.ordenTrabajo]),
    ...servicios.map((s) => [String(s._id), s.ordenTrabajo]),
  ]);
  for (const fp of fps) {
    const fraccion = fraccionPagada(fp);
    for (const rf of fp.repartoFlete || []) {
      const ot = otDeDoc.get(String(rf.docId));
      if (ot) repartir(ot, "flete", num(rf.monto), fraccion);
    }
    // Comprobante sin OC ligado directamente a la OT (ticket, recibo, factura suelta).
    if (!fp.ordenCompraProveedor && !fp.esFleteDe && fp.ordenTrabajo) {
      repartir(fp.ordenTrabajo, "otros", num(fp.subtotal) * (fp.moneda === "USD" ? num(fp.tipoCambio) : 1), fraccion);
    }
  }

  // Ítems antiguos sin OCP (los cubiertos por una OCP ya se contaron arriba).
  const conOCP = new Set();
  for (const sc of scs) {
    for (const l of sc.items) {
      if (!l.ordenCompraProveedor) continue;
      if (sc.origen === "requerimiento" && l.origenItemId) conOCP.add(String(l.origenItemId));
      if (sc.origen === "servicio" && sc.servicioExterno) conOCP.add(String(sc.servicioExterno));
    }
  }
  for (const r of requerimientos) {
    for (const it of r.items || []) {
      if (!it.esSolicitudCompra || conOCP.has(String(it._id))) continue;
      const f = fraccionLegado(it.estadoPago);
      if (f != null) repartir(r.ordenTrabajo, "materiales", num(it.montoUnitario) * num(it.cantidad) + num(it.costoTransporte), f);
    }
  }
  for (const s of servicios) {
    if (conOCP.has(String(s._id))) continue;
    const f = fraccionLegado(s.estadoPago);
    if (f != null) repartir(s.ordenTrabajo, "servicios", num(s.costo) * num(s.cantidad) + num(s.costoTransporte), f);
  }

  // HH y HM: ya se trabajaron → consumido.
  for (const n of notificaciones) {
    for (const it of n.items || []) {
      if (it.anulado) continue;
      if (it.tipo === "hombre") sumar(n.ordenTrabajo, "consumido", "hh", num(it.costoTotal));
      else if (it.tipo === "maquina") sumar(n.ordenTrabajo, "consumido", "hm", num(it.costoTotal));
    }
  }

  const cots = padres.map((p) => p.cotizacion).filter(Boolean);
  const ocsCliente = await OrdenCompra.find({ anulado: { $ne: true }, cotizacion: { $in: cots } }, "numeroOrden codigo cotizacion subtotal monto moneda");
  const ocPorCot = new Map();
  for (const oc of ocsCliente) if (!ocPorCot.has(String(oc.cotizacion))) ocPorCot.set(String(oc.cotizacion), oc);

  return padres.map((p) => {
    const c = acc.get(String(p._id));
    const redondear = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, r2(v)]));
    const comprometido = redondear(c.comprometido);
    const consumido = redondear(c.consumido);
    comprometido.total = r2(Object.values(comprometido).reduce((s, v) => s + v, 0));
    consumido.total = r2(Object.values(consumido).reduce((s, v) => s + v, 0));
    const costoTotal = r2(comprometido.total + consumido.total);
    const oc = p.cotizacion ? ocPorCot.get(String(p.cotizacion)) : null;
    const ocSubtotal = oc ? r2(num(oc.subtotal ?? oc.monto)) : null;
    return {
      otId: p._id, numeroOT: p.numeroOT, titulo: p.titulo,
      empresa: p.empresa ? { _id: p.empresa._id, codigo: p.empresa.codigo, razonSocial: p.empresa.razonSocial, alias: p.empresa.alias, ruc: p.empresa.ruc } : null,
      numeroOrdenCompra: oc?.numeroOrden || oc?.codigo || null,
      ocSubtotal, ocMoneda: oc ? oc.moneda || "PEN" : null, comprometido, consumido, costoTotal,
    };
  });
}
```

- [ ] **Step 4: Rutas en `Backend/src/routes/reportes.js`**

Import: `import { costosPorOT } from "../utils/costosOT.js";` y `import mongoose from "mongoose";` si no está.

Antes de `router.use(puedeVer);`:

```js
// Tarjeta "Costo de fabricación" de la OC del cliente: la ven también vendedores.
const puedeVerCostoOT = (req, res, next) => {
  if (!["admin", "jefatura", "vendedor", "facturacion"].includes(req.usuario.rol)) {
    return res.status(403).json({ mensaje: "No tienes permiso para ver el costo de fabricación." });
  }
  next();
};
router.get("/costos-fabricacion/:otId", puedeVerCostoOT, async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.otId)) return res.status(400).json({ mensaje: "OT inválida" });
    const [fila] = await costosPorOT({ otIds: [req.params.otId] });
    if (!fila) return res.status(404).json({ mensaje: "OT no encontrada" });
    res.json(fila);
  } catch (err) { next(err); }
});
```

Reemplazar el cuerpo de `router.get("/costos-fabricacion", …)` (líneas 164-249) por:

```js
router.get("/costos-fabricacion", async (req, res, next) => {
  try {
    const filas = await costosPorOT();
    res.json(filas.filter((f) => f.costoTotal > 0).sort((a, b) => b.costoTotal - a.costoTotal));
  } catch (err) { next(err); }
});
```

Actualizar el comentario de la sección 3 (criterio comprometido/consumido) y quitar los imports que queden sin uso (`ServicioExterno`, `Requerimiento`, `NotificacionTrabajo` si ya no se usan en el archivo).

- [ ] **Step 5: Correr el test** — Expected: PASS 12/12.
- [ ] **Step 6: Suite completa** — `npm test` (con `MONGO_URI_TEST`). Expected: verde.
- [ ] **Step 7: Commit** `feat(costos): costo de fabricación comprometido y consumido por OT`.

### Task 3: Tipo de cambio SUNAT por fecha (histórico con caché)

**Files:**
- Create: `Backend/src/models/TipoCambioDia.js`, `Backend/src/utils/tipoCambioDia.js`, `Backend/test/tipoCambioDia.test.js`
- Modify: `Backend/src/routes/sunat.js` (ruta `GET /tipo-cambio` acepta `?fecha=`; usa la caché; "hoy" en hora Lima)

**Interfaces:**
- Produces:
  - `tipoCambioDelDia(fecha: "YYYY-MM-DD", { consultar, hoy }) → Promise<{ fecha, fechaSunat|null, compra, venta, fuente: "bd" | "apiperu" | "respaldo" | "vigente" }>`; `consultar(fecha)` → `{ compra, venta, fecha_sunat }` (en producción, apiperu.dev). Si apiperu falla: último `TipoCambioDia` con `fecha ≤` la pedida (`fuente: "respaldo"`), si no el `TipoCambio` vigente (`fuente: "vigente"`); si no hay ninguno, `errorHttp(502)`. `errorHttp(400)` si la fecha es inválida o futura.
  - `GET /api/sunat/tipo-cambio?fecha=YYYY-MM-DD` (sin fecha = hoy Lima) → `{ compra, venta, fecha: fechaSunat, fechaConsulta, fuente }` (mantiene `fecha` para `TipoCambio.jsx`).

- [ ] **Step 1: Tests que fallan** — `Backend/test/tipoCambioDia.test.js`:

```js
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { conectar, desconectar, limpiar } from "./helpers.js";
import TipoCambioDia from "../src/models/TipoCambioDia.js";
import TipoCambio from "../src/models/TipoCambio.js";
import { tipoCambioDelDia } from "../src/utils/tipoCambioDia.js";

before(conectar);
after(desconectar);
beforeEach(limpiar);

const apiperu = (respuestas) => {
  const llamadas = [];
  const consultar = async (fecha) => { llamadas.push(fecha); const r = respuestas[fecha]; if (!r) throw new Error("caído"); return r; };
  return { consultar, llamadas };
};

test("la primera consulta va a apiperu y se guarda; la segunda sale de la BD sin llamar", async () => {
  const api = apiperu({ "2026-09-25": { compra: 3.74, venta: 3.76, fecha_sunat: "2026-09-25" } });
  const a = await tipoCambioDelDia("2026-09-25", { consultar: api.consultar, hoy: "2026-09-30" });
  assert.equal(a.venta, 3.76);
  assert.equal(a.fuente, "apiperu");
  const b = await tipoCambioDelDia("2026-09-25", { consultar: api.consultar, hoy: "2026-09-30" });
  assert.equal(b.fuente, "bd");
  assert.equal(api.llamadas.length, 1);
});

test("día sin publicación (domingo): se guarda con el último día hábil de SUNAT", async () => {
  const api = apiperu({ "2026-09-27": { compra: 3.7, venta: 3.72, fecha_sunat: "2026-09-26" } });
  const r = await tipoCambioDelDia("2026-09-27", { consultar: api.consultar, hoy: "2026-09-30" });
  assert.equal(r.fechaSunat, "2026-09-26");
  assert.ok(await TipoCambioDia.findOne({ fecha: "2026-09-27" }));
});

test("hoy sin publicación del día no se guarda (se usa el último día publicado)", async () => {
  const api = apiperu({ "2026-09-30": { compra: 3.7, venta: 3.71, fecha_sunat: "2026-09-29" } });
  const r = await tipoCambioDelDia("2026-09-30", { consultar: api.consultar, hoy: "2026-09-30" });
  assert.equal(r.venta, 3.71);
  assert.equal(r.fechaSunat, "2026-09-29");
  assert.equal(await TipoCambioDia.countDocuments({ fecha: "2026-09-30" }), 0);
});

test("apiperu caído: se usa el último TC guardado; sin guardados, el vigente; sin ninguno, error — y la falla no se guarda", async () => {
  const caido = apiperu({});
  await TipoCambioDia.create({ fecha: "2026-09-20", fechaSunat: "2026-09-20", compra: 3.6, venta: 3.62 });
  await TipoCambioDia.create({ fecha: "2026-09-25", fechaSunat: "2026-09-25", compra: 3.7, venta: 3.73 });
  const r = await tipoCambioDelDia("2026-09-28", { consultar: caido.consultar, hoy: "2026-09-30" });
  assert.equal(r.fuente, "respaldo");
  assert.equal(r.venta, 3.73);
  assert.equal(r.fechaSunat, "2026-09-25");
  assert.equal(await TipoCambioDia.countDocuments({ fecha: "2026-09-28" }), 0);
  await TipoCambioDia.deleteMany({});
  await assert.rejects(() => tipoCambioDelDia("2026-09-28", { consultar: caido.consultar, hoy: "2026-09-30" }), /No se pudo obtener/);
  await TipoCambio.create({ valor: 3.8 });
  const v = await tipoCambioDelDia("2026-09-28", { consultar: caido.consultar, hoy: "2026-09-30" });
  assert.equal(v.fuente, "vigente");
  assert.equal(v.venta, 3.8);
});

test("fecha inválida o futura → error 400", async () => {
  const api = apiperu({});
  await assert.rejects(() => tipoCambioDelDia("30/09/2026", { consultar: api.consultar, hoy: "2026-09-30" }), /Fecha inválida/);
  await assert.rejects(() => tipoCambioDelDia("2026-10-05", { consultar: api.consultar, hoy: "2026-09-30" }), /futura/);
});
```

- [ ] **Step 2: Correr** `node --test --test-concurrency=1 test/tipoCambioDia.test.js` (con `MONGO_URI_TEST`) — Expected: FAIL (módulos no existen).

- [ ] **Step 3: Modelo `Backend/src/models/TipoCambioDia.js`**

```js
import mongoose from "mongoose";

// TC SUNAT por fecha consultada: se guarda cada respuesta de apiperu para no pagar
// la misma consulta dos veces. `fechaSunat` puede ser anterior (día sin publicación).
const tipoCambioDiaSchema = new mongoose.Schema(
  {
    fecha: { type: String, required: true, unique: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    fechaSunat: { type: String, required: true },
    compra: { type: Number, required: true },
    venta: { type: Number, required: true },
  },
  { timestamps: true }
);

export default mongoose.model("TipoCambioDia", tipoCambioDiaSchema);
```

- [ ] **Step 4: `Backend/src/utils/tipoCambioDia.js`**

```js
import TipoCambioDia from "../models/TipoCambioDia.js";
import TipoCambio from "../models/TipoCambio.js";
import { errorHttp } from "./errorHttp.js";

export const hoyLima = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" }).format(new Date());

// apiperu.dev: si SUNAT no publicó esa fecha devuelve el último día hábil en `fecha_sunat`.
export async function consultarApiperu(fecha) {
  const r = await fetch("https://api.apiperu.dev/tipo-de-cambio", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json", Authorization: `Bearer ${process.env.APIPERU_TOKEN}` },
    body: JSON.stringify({ fecha, moneda: "USD" }),
  });
  if (!r.ok) throw new Error(`apiperu ${r.status}`);
  const { data } = await r.json();
  return data;
}

// Si apiperu no responde: el último TC guardado hasta esa fecha; si no hay, el vigente
// del módulo Tipo de Cambio (decisión del usuario). null si no hay ninguno.
async function respaldo(fecha) {
  const previo = await TipoCambioDia.findOne({ fecha: { $lte: fecha } }).sort({ fecha: -1 });
  if (previo) return { fecha, fechaSunat: previo.fechaSunat, compra: previo.compra, venta: previo.venta, fuente: "respaldo" };
  const vigente = await TipoCambio.findOne({}, "valor");
  if (vigente?.valor > 0) return { fecha, fechaSunat: null, compra: vigente.valor, venta: vigente.valor, fuente: "vigente" };
  return null;
}

// Primero la BD, después apiperu. Se guarda toda respuesta, salvo "hoy" cuando SUNAT
// aún no publicó el del día (se vuelve a preguntar más tarde) y las consultas fallidas.
export async function tipoCambioDelDia(fecha, { consultar = consultarApiperu, hoy = hoyLima() } = {}) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha || "")) throw errorHttp(400, "Fecha inválida (YYYY-MM-DD)");
  if (fecha > hoy) throw errorHttp(400, "No hay tipo de cambio de una fecha futura");
  const guardado = await TipoCambioDia.findOne({ fecha });
  if (guardado) return { fecha, fechaSunat: guardado.fechaSunat, compra: guardado.compra, venta: guardado.venta, fuente: "bd" };
  const data = await consultar(fecha).catch(() => null);
  const compra = Number(data?.compra);
  const venta = Number(data?.venta);
  const fechaSunat = data?.fecha_sunat || fecha;
  if (!(venta > 0) || !(compra > 0)) {
    const r = await respaldo(fecha);
    if (r) return r;
    throw errorHttp(502, "No se pudo obtener el tipo de cambio SUNAT de esa fecha");
  }
  if (!(fecha === hoy && fechaSunat !== fecha)) {
    await TipoCambioDia.updateOne({ fecha }, { $setOnInsert: { fecha, fechaSunat, compra, venta } }, { upsert: true });
  }
  return { fecha, fechaSunat, compra, venta, fuente: "apiperu" };
}
```

- [ ] **Step 5: Ruta en `routes/sunat.js`** — reemplazar el `router.get("/tipo-cambio", …)` actual (que usa la fecha UTC) por:

```js
// TC venta/compra SUNAT de una fecha (sin fecha = hoy, hora Lima). Primero la BD;
// solo si falta se consulta apiperu y se guarda (ver utils/tipoCambioDia.js).
router.get("/tipo-cambio", async (req, res, next) => {
  try {
    const tc = await tipoCambioDelDia(req.query.fecha || hoyLima());
    res.json({ compra: tc.compra, venta: tc.venta, fecha: tc.fechaSunat, fechaConsulta: tc.fecha, fuente: tc.fuente });
  } catch (err) { next(err); }
});
```

con `import { tipoCambioDelDia, hoyLima } from "../utils/tipoCambioDia.js";`. El manejador global responde `err.status` de `errorHttp` con su `mensaje`.

- [ ] **Step 6: Correr** — Expected: PASS 5/5; suite completa verde.
- [ ] **Step 7: Commit** `feat(tc): tipo de cambio SUNAT por fecha con histórico en BD antes de consultar apiperu`.

### Task 4: Reportes → selector de moneda, dos tablas y Excel

**Files:**
- Create: `Frontend/src/utils/costos.js`, `Frontend/src/utils/costos.test.js`, `Frontend/src/components/SelectorMonedaTC.jsx`
- Modify: `Frontend/src/pages/Reportes.jsx` (sección 3, `filaCostoFabricacion` y exportación)

**Interfaces:**
- Consumes: `FilaCosto` (Task 2); `GET /sunat/tipo-cambio?fecha=` (Task 3).
- Produces:
  - `convertir(monto, de, a, tc) → number` ("PEN"/"USD"; redondeo a 2 decimales; sin `tc` válido devuelve `monto`).
  - `costoEn(c, moneda, tc) → FilaCosto convertida + { moneda, margen|null }` (costos desde S/; `ocSubtotal` desde `c.ocMoneda`; `margen = ocSubtotal − costoTotal` ya en la misma moneda).
  - `filaResumenCosto(c, nombreEmpresa, tc)`, `filaComprometido(c)`, `filaConsumido(c)` sobre filas ya convertidas (incluyen "Moneda"; el resumen incluye "TC").
  - `<SelectorMonedaTC moneda fecha onCambio={({ moneda, fecha, tc, error }) => …} />`.

- [ ] **Step 1: Test que falla** — `Frontend/src/utils/costos.test.js`:

```js
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
```

- [ ] **Step 2: Correr** `cd Frontend && npm test` — Expected: FAIL (módulo no existe).

- [ ] **Step 3: `Frontend/src/utils/costos.js`**

```js
const r2 = (n) => Math.round(n * 100) / 100;

export function convertir(monto, de, a, tc) {
  if (monto == null) return monto;
  if (de === a || !(tc > 0)) return monto;
  return r2(de === "PEN" ? monto / tc : monto * tc);
}

const mapa = (o, f) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, f(v)]));

// Costo de fabricación (S/) y OC del cliente (su moneda) llevados a la moneda elegida
// con el TC de una fecha; el margen se calcula ya en la misma moneda.
export function costoEn(c, moneda, tc) {
  const desdeSoles = (v) => convertir(v, "PEN", moneda, tc);
  const comprometido = mapa(c.comprometido, desdeSoles);
  const consumido = mapa(c.consumido, desdeSoles);
  const costoTotal = desdeSoles(c.costoTotal);
  const ocMoneda = c.ocMoneda || "PEN";
  const sinTC = ocMoneda !== moneda && !(tc > 0);
  const ocSubtotal = c.ocSubtotal == null || sinTC ? null : convertir(c.ocSubtotal, ocMoneda, moneda, tc);
  return { ...c, moneda, comprometido, consumido, costoTotal, ocSubtotal, margen: ocSubtotal == null ? null : r2(ocSubtotal - costoTotal) };
}

// Filas del reporte "Costos de fabricación" (tabla y Excel) sobre filas ya convertidas:
// comprometido = comprado y aún no pagado; consumido = pagado por Tesorería + HH/HM.
export const filaResumenCosto = (c, nombreEmpresa, tc) => ({
  "N° OT": c.numeroOT,
  "N° Orden de Compra": c.numeroOrdenCompra || "—",
  "Titulo": c.titulo,
  "Empresa": nombreEmpresa(c.empresa),
  "Moneda": c.moneda,
  "TC": c.moneda === "USD" ? tc : "",
  "OC sin IGV": c.ocSubtotal ?? "—",
  "Comprometido": c.comprometido.total,
  "Consumido": c.consumido.total,
  "Costo total": c.costoTotal,
  "Margen": c.margen ?? "—",
});

export const filaComprometido = (c) => ({
  "N° OT": c.numeroOT,
  "Moneda": c.moneda,
  "Materiales": c.comprometido.materiales,
  "Servicios": c.comprometido.servicios,
  "Flete": c.comprometido.flete,
  "Otros": c.comprometido.otros,
  "Total comprometido": c.comprometido.total,
});

export const filaConsumido = (c) => ({
  "N° OT": c.numeroOT,
  "Moneda": c.moneda,
  "HH": c.consumido.hh,
  "HM": c.consumido.hm,
  "Materiales": c.consumido.materiales,
  "Servicios": c.consumido.servicios,
  "Flete": c.consumido.flete,
  "Otros": c.consumido.otros,
  "Total consumido": c.consumido.total,
});
```

- [ ] **Step 4: `Frontend/src/components/SelectorMonedaTC.jsx`**

```jsx
import { useEffect, useState } from "react";
import { fetchAuth } from "../utils/fetchAuth";
import { fechaHoyLima, formatearFecha } from "../utils/fecha";

// "S/ | US$" + "Tipo de cambio al: [fecha]". En US$ pide el TC venta SUNAT de esa
// fecha (el backend lo saca de su histórico o lo consulta una sola vez). Si falla,
// avisa y la pantalla sigue en soles.
export default function SelectorMonedaTC({ moneda, fecha, onCambio }) {
  const [info, setInfo] = useState("");
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    let vigente = true;
    fetchAuth(`/sunat/tipo-cambio?fecha=${fecha}`)
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!vigente) return;
        if (!r.ok) { setInfo(d.mensaje || "No se pudo obtener el tipo de cambio"); onCambio({ moneda, fecha, tc: null, error: true }); return; }
        const origen = d.fuente === "vigente" ? "TC vigente del sistema"
          : `${d.fuente === "respaldo" ? "último guardado" : "SUNAT"}, ${formatearFecha(`${d.fecha}T12:00:00-05:00`)}`;
        setInfo(`TC venta ${d.venta} (${origen})`);
        onCambio({ moneda, fecha, tc: d.venta, error: false });
      })
      .catch(() => { if (vigente) { setInfo("Sin conexión con el servidor"); onCambio({ moneda, fecha, tc: null, error: true }); } })
      .finally(() => { if (vigente) setCargando(false); });
    return () => { vigente = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onCambio cambia en cada render del padre
  }, [moneda, fecha]);

  const elegir = (m) => { setCargando(true); onCambio({ moneda: m, fecha, tc: null, error: false }); };
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <div className="inline-flex rounded-lg border border-gray-200 overflow-hidden">
        {["PEN", "USD"].map((m) => (
          <button key={m} type="button" onClick={() => elegir(m)}
            className={`px-3 py-1 font-semibold ${moneda === m ? "bg-gray-900 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}>
            {m === "PEN" ? "S/" : "US$"}
          </button>
        ))}
      </div>
      <label className="text-gray-500">Tipo de cambio al</label>
      <input type="date" value={fecha} max={fechaHoyLima()}
        onChange={(e) => { setCargando(true); onCambio({ moneda, fecha: e.target.value || fechaHoyLima(), tc: null, error: false }); }}
        className="border border-gray-200 rounded-lg px-2 py-1" />
      <span className={info.startsWith("TC") ? "text-gray-400" : "text-red-500"}>{cargando ? "Consultando…" : info}</span>
    </div>
  );
}
```

(Verificar que `utils/fecha` exporte `fechaHoyLima` y `formatearFecha`; usar los nombres reales del módulo.)

- [ ] **Step 5: `Reportes.jsx`**
  - Estado: `const [vista, setVista] = useState({ moneda: "PEN", fecha: fechaHoyLima(), tc: null, error: false });` — si `vista.moneda === "USD" && !vista.tc`, se muestra en S/ (y el selector muestra el aviso).
  - `const monedaVista = vista.moneda === "USD" && vista.tc ? "USD" : "PEN";` y `const costos = data.costosFabricacion.map((c) => costoEn(c, monedaVista, vista.tc));`
  - Encabezado de la sección 3: `<SelectorMonedaTC moneda={vista.moneda} fecha={vista.fecha} onCambio={setVista} />`.
  - La tabla actual pasa a ser el **resumen** (columnas N° OT, N° OC, Título, Empresa, OC sin IGV, Comprometido, Consumido, Costo total, Margen) sobre `costos`, con `money(v, monedaVista)` y margen en verde/rojo/gris como hoy.
  - Debajo, dos `Seccion`: **"Costo comprometido"** (acento `bg-amber-500`, ayuda "Comprado con OC y aún no pagado por Tesorería", filas con `comprometido.total > 0`, columnas de `filaComprometido` sin "Moneda") y **"Costo consumido"** (acento `bg-emerald-500`, ayuda "Pagado por Tesorería + horas hombre y máquina", filas con `consumido.total > 0`, columnas de `filaConsumido` sin "Moneda").
  - Exportación: reemplazar `filaCostoFabricacion` por `(c) => filaResumenCosto(c, nombreEmpresa, vista.tc)` sobre `costos`, y agregar las hojas `["Costo comprometido", costos.filter((c) => c.comprometido.total > 0).map(filaComprometido)]` y `["Costo consumido", costos.filter((c) => c.consumido.total > 0).map(filaConsumido)]` después de "Costos de Fabricacion".
- [ ] **Step 6:** `npm test` (verde), `npx eslint src/pages/Reportes.jsx src/utils/costos.js src/components/SelectorMonedaTC.jsx` (sin errores nuevos), `npm run build`.
- [ ] **Step 7: Commit** `feat(costos): Reportes muestra costo comprometido y consumido en S/ o US$ al TC de una fecha`.

### Task 5: Tarjeta "Costo de fabricación" de la OC del cliente

**Files:**
- Modify: `Frontend/src/components/DetalleOrdenCompra.jsx` (carga ~189-200, cálculo ~285-306, tarjeta ~620-635, `ModalReporteCosto` ~645-657)
- Modify: `Frontend/src/components/ModalReporteCosto.jsx`

**Interfaces:**
- Consumes: `GET /reportes/costos-fabricacion/:otId` (Task 2), `costoEn` y `SelectorMonedaTC` (Task 4), `GET /sunat/tipo-cambio?fecha=` (Task 3).

- [ ] **Step 1: `DetalleOrdenCompra.jsx`**
  - Reemplazar las cargas de `requerimientos`, `servicios` y `notificacionesTrabajo` (dentro de `if (puedeVerReporte)`) por `fetchAuth(`/reportes/costos-fabricacion/${found._id}`).then((r) => (r.ok ? r.json() : null)).then(setCostos);` con `const [costos, setCostos] = useState(null);`. Antes, `grep` que esos tres estados no se usen en otra parte del archivo; si no, eliminarlos.
  - Vista de moneda: `const [vista, setVista] = useState({ moneda: orden.moneda || "PEN", fecha: fechaHoyLima(), tc: null, error: false });` — la tarjeta abre en la moneda de la OC.
  - Reemplazar el bloque de cálculo (costoHH … margenPct) por:

```js
  // Costo de fabricación (spec 2026-09-30): lo calcula el servidor en soles
  // (comprometido + consumido); se muestra en la moneda elegida al TC de una fecha.
  const monedaVista = vista.moneda === "USD" && !vista.tc ? "PEN" : vista.moneda;
  const costoVista = costos ? costoEn(costos, monedaVista, vista.tc) : null;
  const margen = costoVista?.margen ?? null;
  const margenPct = margen != null && costoVista.ocSubtotal > 0 ? (margen / costoVista.ocSubtotal) * 100 : null;
```

  - La tarjeta necesita el TC de la fecha también en S/ cuando la OC del cliente es en USD. Pedirlo al abrir (el selector del modal luego actualiza `vista`):

```js
  useEffect(() => {
    if (vista.tc || vista.error) return;
    fetchAuth(`/sunat/tipo-cambio?fecha=${vista.fecha}`)
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null)
      .then((d) => setVista((v) => ({ ...v, tc: d?.venta || null, error: !d })));
  }, [vista.tc, vista.error, vista.fecha]);
```
  - Tarjeta: margen con `money(margen, monedaVista)` (o "—" si `margen == null`), y una línea `Consumido {money(costoVista?.consumido.total, monedaVista)} · Comprometido {money(costoVista?.comprometido.total, monedaVista)}`.
  - `ModalReporteCosto`: pasar `costos`, `vista`, `onCambioVista={setVista}`, `onClose`.
- [ ] **Step 2: `ModalReporteCosto.jsx`** — props `{ costos, vista, onCambioVista, onClose }`; arriba `<SelectorMonedaTC moneda={vista.moneda} fecha={vista.fecha} onCambio={onCambioVista} />`; convertir con `costoEn(costos, monedaVista, vista.tc)`; dos bloques con `Fila`:
  - "Consumido (pagado)": Horas hombre (HH), Horas máquina (HM), Materiales, Servicios externos, Flete, Otros gastos, **Total consumido**.
  - "Comprometido (por pagar)": Materiales, Servicios externos, Flete, Otros gastos, **Total comprometido**.
  - Recuadro superior: Subtotal sin IGV (OC) vs Costo total; recuadro de margen como hoy ("Sin OC para comparar" si `margen == null`). Si `costos` es null: "Calculando…". Actualizar el comentario de cabecera.
- [ ] **Step 3:** `npm test`, eslint de los archivos tocados (sin errores nuevos), `npm run build`.
- [ ] **Step 4: Commit** `feat(costos): la tarjeta de la OC muestra consumido y comprometido en S/ o US$ al TC de una fecha`.

### Task 6: Verificación y documentación

- [ ] Backend `npm test` verde; frontend `npm test`, eslint sin errores nuevos, `npm run build`.
- [ ] Playwright (backend `PORT=8090`, `MONGO_URI=mongodb://localhost:27017/sipapp-intales-e2e?replicaSet=rs0`): una OT con OCP sin pagar → Reportes la muestra en "Costo comprometido"; registrar y pagar su factura en Tesorería → pasa a "Costo consumido"; la tarjeta de la OC del cliente muestra los mismos montos; cambiar a US$ y a otra fecha convierte con el TC de esa fecha (la segunda vez sin consultar apiperu: `fuente: "bd"`); exportar Excel con las tres hojas, moneda y TC.
- [ ] Revisor final (Agent, opus) sobre el rango de la fase; Critical/Important con test RED→GREEN; menores al spec.
- [ ] Spec: sección "Estado — Fase 1"; memoria; `graphify update .`.
