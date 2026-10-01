# Comprobantes de compra — Fase 4: notas de crédito y débito — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Registrar notas de crédito (07) y débito (08) del proveedor ligadas a su comprobante de origen: la NC rebaja el saldo del origen (lo que sobra queda como saldo a favor del proveedor, aplicable a otro comprobante suyo) y la ND es un documento más por pagar; el costo de fabricación descuenta las NC.

**Architecture:** `FacturaProveedor` gana los tipos 07/08, `documentoOrigen` y `saldoAFavor`. Aplicar una NC crea un `MovimientoTesoreria` **sin dinero** (`tipo: "aplicacion"`, `medio: "nota_credito"`, `notaCredito`) sobre el documento destino, así el cálculo de saldos existente (`pagadoPorConcepto`) lo descuenta sin cambios; el saldo a favor de la NC se deriva de esos movimientos. `costosOT` descuenta las NC del costo y no cuenta las aplicaciones como pago.

**Tech Stack:** Node 24 ESM + Express 4 + Mongoose 8 (`node:test`), React 19 + Vite + Tailwind.

**Spec:** `docs/superpowers/specs/2026-09-30-comprobantes-compra-design.md` (regla 4 y 5, "Por pagar", costos: "Notas de crédito aplicadas rebajan el costo").

## Global Constraints

- Rama `feature/comprobantes-compra`. Commits con `-m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`. Tests backend con `MONGO_URI_TEST="mongodb://localhost:27017/sipapp-intales-test?replicaSet=rs0"`.
- Origen de NC/ND: mismo proveedor y **misma moneda**, no anulado, tipo distinto de 07/08.
- NC: sin impuesto (detracción/retención), `netoAPagar = 0`; al registrarla se aplica `min(total NC, saldoNeto del origen)`; `saldoAFavor = total − aplicado`.
- ND: documento por pagar propio (saldo, condición, vencimiento, "Ya se pagó"); copia `centroCosto` y `ordenTrabajo` del origen.
- Crédito fiscal de NC/ND = el de su origen.
- Aplicar saldo a favor: destino del mismo proveedor y moneda, no anulado, no NC; `monto ≤ min(saldoAFavor, saldoNeto destino)`.
- Anular una NC anula sus aplicaciones; no se anula un comprobante con NC aplicadas ("Anula primero la nota de crédito X"); una aplicación no se anula suelta desde Movimientos.
- Detracción del origen: no se recalcula; el formulario avisa.
- Las aplicaciones no suman a ingresos/egresos (no mueven dinero) ni cuentan como pago en costos.

## Review Focus

1. NC mayor que el saldo del origen → aplica el saldo y deja el resto a favor; aplicar ese resto a otra factura del mismo proveedor — test en Task 2.
2. NC de otro proveedor o moneda, u origen anulado → 400 sin registrar nada — test en Task 1.
3. Anular el origen con una NC aplicada → 400 con el código de la NC; anular la NC devuelve el saldo al origen — test en Task 2.
4. Costo de fabricación: factura de S/ 300 + NC de S/ 100 y el resto pagado → consumido 200, comprometido 0 — test en Task 3.
5. Por pagar: la NC no aparece como deuda ni con "Registrar pago"; muestra "Saldo a favor" y "Aplicar a…" — Playwright en Task 5.

---

### Task 1: Modelo y registro de NC/ND (con aplicación automática de la NC)

**Files:**
- Modify: `Backend/src/models/FacturaProveedor.js`, `Backend/src/models/MovimientoTesoreria.js`, `Backend/src/utils/comprobantesCompra.js`, `Backend/src/utils/saldosTesoreria.js` (`recalcularFacturaProveedor`), `Backend/src/routes/facturasProveedor.js`
- Create: `Backend/src/utils/notasCredito.js`
- Test: `Backend/test/notasCredito.test.js`

**Interfaces:**
- Produces:
  - `TIPOS_COMPRA` incluye `"07", "08"`; `creditoFiscalDe` recibe opcional `origen` (para 07/08 devuelve el del origen).
  - `aplicarNotaCredito(nc, destino, monto, usuario, session) → Promise<MovimientoTesoreria>`; `saldoAFavorDe(ncId, total, session) → number`.
  - FP: `documentoOrigen`, `saldoAFavor` (solo 07), `aplicadoNC` (en destinos: suma de aplicaciones vigentes, moneda del doc).

- [ ] **Step 1: Tests que fallan** — `Backend/test/notasCredito.test.js`:

```js
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { conectar, desconectar, limpiar, levantar } from "./helpers.js";
import { escenarioBase } from "./escenarios.js";
import bloqueosRoutes from "../src/routes/bloqueos.js";
import facturasProveedorRoutes from "../src/routes/facturasProveedor.js";
import movimientosRoutes from "../src/routes/movimientosTesoreria.js";
import CuentaTesoreria from "../src/models/CuentaTesoreria.js";
import FacturaProveedor from "../src/models/FacturaProveedor.js";

let srv, bcp, base;
before(async () => {
  await conectar();
  srv = await levantar({ "/api/bloqueos": bloqueosRoutes, "/api/facturas-proveedor": facturasProveedorRoutes, "/api/movimientos-tesoreria": movimientosRoutes });
});
after(async () => { await srv.cerrar(); await desconectar(); });
beforeEach(async () => {
  await limpiar();
  bcp = await CuentaTesoreria.create({ nombre: "BCP Soles", tipo: "banco", moneda: "PEN" });
  base = await escenarioBase({ lineas: 1 });
});

let n = 0;
const registrar = (extra) => srv.api("POST", "/api/facturas-proveedor", {
  body: { proveedor: base.provA._id, centroCosto: base.centro._id, tipoComprobante: "01", serie: "F001", numero: String(++n),
    fechaEmision: "2026-09-28", subtotal: 300, igv: 54, condicion: "contado", impuesto: { tipo: "ninguno" }, ...extra },
});
const factura = async (extra) => (await registrar(extra)).data;
const nota = (origen, extra) => registrar({ tipoComprobante: "07", serie: "FC01", documentoOrigen: origen._id, subtotal: 100, igv: 18, ...extra });

test("NC: se aplica al origen y le baja el saldo; no es deuda; crédito fiscal del origen", async () => {
  const f = await factura();
  const r = await nota(f);
  assert.equal(r.status, 201, JSON.stringify(r.data));
  assert.equal(r.data.netoAPagar, 0);
  assert.equal(r.data.saldoAFavor, 0);
  assert.equal(r.data.creditoFiscal, true);
  const origen = await FacturaProveedor.findById(f._id);
  assert.equal(origen.saldoNeto, 236);
  assert.equal(origen.aplicadoNC, 118);
});

test("NC mayor que el saldo del origen: aplica el saldo y deja el resto a favor", async () => {
  const f = await factura({ subtotal: 100, igv: 18 });
  await srv.api("POST", "/api/movimientos-tesoreria", { body: { documento: { tipo: "facturaProveedor", id: f._id }, concepto: "neto", monto: 100, fecha: "2026-09-29", cuenta: bcp._id, medio: "transferencia", numeroOperacion: "OP" } });
  const r = await nota(f, { subtotal: 100, igv: 18 });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  assert.equal(r.data.saldoAFavor, 100);
  assert.equal((await FacturaProveedor.findById(f._id)).saldoNeto, 0);
});

test("ND: documento por pagar ligado al origen, con su centro de costo", async () => {
  const f = await factura();
  const r = await registrar({ tipoComprobante: "08", serie: "FD01", documentoOrigen: f._id, subtotal: 50, igv: 9, centroCosto: undefined });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  assert.equal(r.data.saldoNeto, 59);
  assert.equal(String(r.data.centroCosto?._id || r.data.centroCosto), String(base.centro._id));
});

test("NC/ND inválidas → 400 sin registrar nada", async () => {
  const f = await factura();
  const usd = await factura({ moneda: "USD", tipoCambio: 3.7 });
  assert.equal((await registrar({ tipoComprobante: "07", serie: "FC01" })).status, 400);
  assert.equal((await nota(f, { proveedor: base.provB._id })).status, 400);
  assert.equal((await nota(usd)).status, 400);
  assert.equal((await nota(f, { impuesto: { tipo: "detraccion", codigoSunat: "037", quienDeposita: "nosotros" } })).status, 400);
  const nc = (await nota(f)).data;
  assert.equal((await nota(nc)).status, 400);
  assert.equal(await FacturaProveedor.countDocuments({ tipoComprobante: "07" }), 1);
});
```

- [ ] **Step 2: Correr** — Expected: FAIL (tipo inválido).

- [ ] **Step 3: Modelos**
  - `FacturaProveedor.js`: enum `["01", "02", "03", "07", "08", "12", "14"]` y:

```js
    // 07/08: comprobante que modifican (mismo proveedor y moneda).
    documentoOrigen: { type: mongoose.Schema.Types.ObjectId, ref: "FacturaProveedor", default: null },
    // 07: lo que queda de la NC por aplicar a otro comprobante del proveedor (moneda del doc).
    saldoAFavor: { type: Number, default: 0 },
    // Destinos: cuánto de su neto se canceló con notas de crédito (parte de pagadoNeto).
    aplicadoNC: { type: Number, default: 0 },
```

  - `MovimientoTesoreria.js`: `tipo` agrega `"aplicacion"`; `medio` agrega `"nota_credito"`; campo `notaCredito: { type: mongoose.Schema.Types.ObjectId, ref: "FacturaProveedor", default: null }` (comentario: aplicación de una NC, sin dinero ni cuenta).

- [ ] **Step 4: `utils/comprobantesCompra.js`** — `TIPOS_COMPRA = ["01", "02", "03", "07", "08", "12", "14"]`; `export const TIPOS_NOTA = ["07", "08"];` y en `creditoFiscalDe({ tipoComprobante, igv, ticketConRuc, origen })`: si `TIPOS_NOTA.includes(tipoComprobante)` → `origen ? creditoFiscalDe(origen) : false` (el `creditoFiscal` guardado del origen tiene prioridad si existe: `origen.creditoFiscal ?? creditoFiscalDe(origen)`).

- [ ] **Step 5: `Backend/src/utils/notasCredito.js`**

```js
import MovimientoTesoreria from "../models/MovimientoTesoreria.js";
import FacturaProveedor from "../models/FacturaProveedor.js";
import { round2 } from "./impuesto.js";
import { errorHttp } from "./errorHttp.js";
import { recalcularFacturaProveedor, sincronizarOCP } from "./saldosTesoreria.js";

// Lo aplicado de una NC (movimientos "aplicacion" vigentes que salieron de ella).
export async function aplicadoDeNota(ncId, session) {
  const movs = await MovimientoTesoreria.find({ notaCredito: ncId, anulado: false }, "monto", { session });
  return round2(movs.reduce((s, m) => s + m.monto, 0));
}

// Aplica parte de una NC al neto de un comprobante: un movimiento sin dinero ni cuenta
// que el cálculo de saldos descuenta como un pago. Recalcula destino y NC.
export async function aplicarNotaCredito(nc, destino, monto, usuario, session) {
  monto = round2(monto);
  if (!(monto > 0)) throw errorHttp(400, "El monto a aplicar debe ser mayor a 0");
  if (destino.anulada || ["07"].includes(destino.tipoComprobante)) throw errorHttp(400, "No se puede aplicar a ese comprobante");
  if (String(destino.proveedor) !== String(nc.proveedor) || destino.moneda !== nc.moneda) {
    throw errorHttp(400, "La nota de crédito solo se aplica a comprobantes del mismo proveedor y moneda");
  }
  if (monto > nc.saldoAFavor + 0.009) throw errorHttp(400, `Supera el saldo a favor de la nota (${nc.saldoAFavor})`);
  if (monto > destino.saldoNeto + 0.009) throw errorHttp(400, `Supera el saldo del comprobante (${destino.saldoNeto})`);
  const [mov] = await MovimientoTesoreria.create([{
    tipo: "aplicacion", medio: "nota_credito", concepto: "neto", monto, moneda: destino.moneda, tipoCambio: destino.tipoCambio,
    fecha: nc.fechaEmision, documento: { tipo: "facturaProveedor", id: destino._id }, notaCredito: nc._id,
    numeroOperacion: `${nc.serie}-${nc.numero}`, registradoPor: usuario,
  }], { session });
  await recalcularFacturaProveedor(destino, session);
  if (destino.ordenCompraProveedor) await sincronizarOCP(destino.ordenCompraProveedor, session, usuario);
  await recalcularFacturaProveedor(await FacturaProveedor.findById(nc._id, null, { session }), session);
  return mov;
}
```

(Si `MovimientoTesoreria.create` exige `codigo` por pre-save, usar el mismo mecanismo de código que `registrarMovimiento` en `utils/movimientos.js` — revisar y replicar.)

- [ ] **Step 6: `recalcularFacturaProveedor`** (`utils/saldosTesoreria.js`) — al inicio, para NC:

```js
  if (fp.tipoComprobante === "07") {
    // Una NC no se paga: su "saldo" es lo que queda por aplicar a favor de INTALES.
    const aplicado = fp.anulada ? 0 : await aplicadoDeNota(fp._id, session);
    Object.assign(fp, { netoAPagar: 0, pagadoNeto: 0, pagadoImpuesto: 0, saldoNeto: 0, saldoImpuesto: 0 });
    fp.saldoAFavor = fp.anulada ? 0 : round2(fp.total - aplicado);
    fp.estado = fp.anulada ? "anulada" : fp.saldoAFavor <= TOL ? "pagada" : aplicado > 0 ? "parcial" : "pendiente";
    await fp.save({ session });
    return;
  }
```

  y, para el resto, `fp.aplicadoNC` = suma de movimientos vigentes `tipo: "aplicacion"` del documento (ampliar `pagadoPorConcepto` o una consulta aparte). Importar `aplicadoDeNota` de `./notasCredito.js` (cuidar el import circular: si da problemas, mover `aplicadoDeNota` a `saldosTesoreria.js`).

- [ ] **Step 7: Ruta `POST /facturas-proveedor`** — tras validar el tipo:

```js
      const esNota = TIPOS_NOTA.includes(b.tipoComprobante);
      let origen = null;
      if (esNota) {
        origen = b.documentoOrigen ? await FacturaProveedor.findById(b.documentoOrigen, null, { session }) : null;
        if (!origen || origen.anulada || TIPOS_NOTA.includes(origen.tipoComprobante)) throw errorHttp(400, "Elige el comprobante que modifica la nota (vigente, que no sea otra nota)");
      }
```

  Para NC/ND: `proveedor` y `moneda` se exigen iguales a los del origen (`String(b.proveedor || origen.proveedor) !== String(origen.proveedor)` o `moneda !== origen.moneda` → 400 "La nota debe ser del mismo proveedor y moneda que su comprobante"); el proveedor y el tipo de cambio por defecto son los del origen; `centroCosto` y `ordenTrabajo` por defecto los del origen (la regla "sin OC exige centro de costo" se cumple con el del origen); NC con `imp.tipo !== "ninguno"` → 400 "Una nota de crédito no lleva detracción ni retención"; NC con `b.pago` → 400; `creditoFiscal: creditoFiscalDe({ ..., origen })`; guardar `documentoOrigen`. Después de `recalcularFacturaProveedor(nueva)`, si es NC:

```js
      if (b.tipoComprobante === "07") {
        const aplicar = round2(Math.min(nueva.total, origen.saldoNeto));
        if (aplicar > 0) await aplicarNotaCredito(nueva, origen, aplicar, req.usuario.nombre, session);
        return FacturaProveedor.findById(nueva._id, null, { session });
      }
```

  (Antes de aplicar, `nueva.saldoAFavor` = total: el recálculo de la NC sin aplicaciones lo deja así.)
- [ ] **Step 8: Correr** — Expected: PASS 4/4; suite completa verde.
- [ ] **Step 9: Commit** `feat(compras): notas de crédito y débito ligadas a su comprobante; la NC se aplica sola al origen`.

### Task 2: Aplicar saldo a favor y anulaciones

**Files:**
- Modify: `Backend/src/routes/facturasProveedor.js` (`POST /:id/aplicar`, anular), `Backend/src/utils/movimientos.js` (`anularMovimiento`)
- Test: `Backend/test/notasCredito.test.js`

**Interfaces:**
- Produces: `POST /api/facturas-proveedor/:id/aplicar { documento, monto }` → la NC actualizada.

- [ ] **Step 1: Tests que fallan**

```js
test("aplicar el saldo a favor a otra factura del proveedor; topes y otro proveedor → 400", async () => {
  const f1 = await factura({ subtotal: 100, igv: 18 });
  await srv.api("POST", "/api/movimientos-tesoreria", { body: { documento: { tipo: "facturaProveedor", id: f1._id }, concepto: "neto", monto: 118, fecha: "2026-09-29", cuenta: bcp._id, medio: "transferencia", numeroOperacion: "OP" } });
  const nc = (await nota(f1, { subtotal: 100, igv: 18 })).data;
  assert.equal(nc.saldoAFavor, 118);
  const f2 = await factura();
  const otra = await factura({ proveedor: base.provB._id });
  assert.equal((await srv.api("POST", `/api/facturas-proveedor/${nc._id}/aplicar`, { body: { documento: otra._id, monto: 50 } })).status, 400);
  assert.equal((await srv.api("POST", `/api/facturas-proveedor/${nc._id}/aplicar`, { body: { documento: f2._id, monto: 200 } })).status, 400);
  const ok = await srv.api("POST", `/api/facturas-proveedor/${nc._id}/aplicar`, { body: { documento: f2._id, monto: 118 } });
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  assert.equal(ok.data.saldoAFavor, 0);
  assert.equal((await FacturaProveedor.findById(f2._id)).saldoNeto, 236);
});

test("anular: el origen con NC aplicada no se anula; anular la NC devuelve el saldo; la aplicación no se anula suelta", async () => {
  const f = await factura();
  const nc = (await nota(f)).data;
  const anularOrigen = await escribirAnular(f._id);
  assert.equal(anularOrigen.status, 400);
  assert.match(anularOrigen.data.mensaje, /nota de crédito/);
  const movs = await srv.api("GET", `/api/movimientos-tesoreria?documentoRef=${f._id}`);
  const aplicacion = (movs.data.movimientos || movs.data).find((m) => m.tipo === "aplicacion");
  assert.equal((await srv.api("PATCH", `/api/movimientos-tesoreria/${aplicacion._id}/anular`, { body: { motivo: "x" } })).status, 400);
  assert.equal((await escribirAnular(nc._id)).status, 200);
  assert.equal((await FacturaProveedor.findById(f._id)).saldoNeto, 354);
  assert.equal((await escribirAnular(f._id)).status, 200);
});
```

  con el helper `const escribirAnular = (id) => escribir(srv, "facturaProveedor", id, "PATCH", `/api/facturas-proveedor/${id}/anular`, { body: { motivo: "prueba" } });` (importar `escribir` de `./helpers.js`; ajustar el acceso a la lista de movimientos a la forma real de `GET /movimientos-tesoreria`).
- [ ] **Step 2: Correr** — Expected: FAIL.
- [ ] **Step 3: Implementar**
  - `POST /:id/aplicar` (sin bloqueo, como los pagos — regla 9): en `conTransaccion`, cargar NC (debe ser 07 vigente) y destino; `aplicarNotaCredito(nc, destino, Number(req.body.monto), usuario, session)`; responder la NC releída y poblada; `notificar` "Aplicó la nota de crédito".
  - Anular (ruta existente): si el documento a anular tiene movimientos vigentes `tipo: "aplicacion"` → 400 `Anula primero la nota de crédito ${codigos}` (buscar las NC por `notaCredito`); si el documento es una NC: anular sus aplicaciones (`MovimientoTesoreria.updateMany({ notaCredito: nc._id, anulado: false }, { anulado: true, motivoAnulacion: "Se anuló la nota de crédito", anuladoPor, fechaAnulacion })`) y recalcular cada destino (+ `sincronizarOCP`) antes de anular la NC. El chequeo "Tiene pagos registrados" no debe contar las aplicaciones que salen de la propia NC (no están sobre ella).
  - `anularMovimiento`: si `mov.tipo === "aplicacion"` → 400 "Una aplicación de nota de crédito se revierte anulando la nota".
- [ ] **Step 4: Correr** — Expected: PASS 6/6; suite verde.
- [ ] **Step 5: Commit** `feat(compras): aplicar el saldo a favor de una NC y revertirlo al anularla`.

### Task 3: Costos de fabricación descuentan las NC

**Files:**
- Modify: `Backend/src/utils/costosOT.js`
- Test: `Backend/test/costosFabricacion.test.js`

- [ ] **Step 1: Test que falla**

```js
test("nota de crédito: rebaja el costo y no cuenta como pago", async () => {
  const { base, ocp } = await escenarioOCP(srv);
  const fp = await factura(ocp);
  const nc = await srv.api("POST", "/api/facturas-proveedor", { body: { tipoComprobante: "07", serie: "FC01", numero: "1", documentoOrigen: fp._id,
    proveedor: fp.proveedor?._id || fp.proveedor, fechaEmision: "2026-09-29", subtotal: 100, igv: 18, condicion: "contado", impuesto: { tipo: "ninguno" } } });
  assert.equal(nc.status, 201, JSON.stringify(nc.data));
  let c = await costoDe(base.otId);
  assert.equal(c.comprometido.materiales, 200);
  assert.equal(c.consumido.materiales, 0);
  await pagar(fp, "neto", 236);
  c = await costoDe(base.otId);
  assert.equal(c.consumido.materiales, 200);
  assert.equal(c.comprometido.materiales, 0);
});
```

- [ ] **Step 2: Correr** — Expected: FAIL (cuenta 300 y la aplicación como pago).
- [ ] **Step 3: Implementar en `costosOT.js`**
  - `fraccionPagada(fp)`: descontar `aplicadoNC` de lo pagado y de la obligación (la parte cancelada con NC no es pago ni deuda):

```js
  const nc = num(fp.aplicadoNC);
  const pagado = num(fp.pagadoNeto) - nc + aDoc(fp.pagadoImpuesto);
  const obligacion = num(fp.netoAPagar) - nc + aDoc(fp.pagadoImpuesto) + aDoc(fp.saldoImpuesto);
```

  - Agrupar las NC vigentes (`tipoComprobante: "07"`) por `documentoOrigen` y su base (`subtotal`).
  - OCP: `baseNC = Σ subtotal de NC cuyos orígenes son FPs de la OCP`; `costoNeto = ocp.subtotal − baseNC`; `pagadoBase = Σ (fp.subtotal − fp.flete − baseNC de esa fp) × fraccionPagada(fp)`; `fraccion = costoNeto > 0 ? min(1, pagadoBase / costoNeto) : 0`; cada línea cuesta `it.subtotal × (costoNeto / ocp.subtotal) × tc`.
  - Comprobante sin OC con OT ("otros"): costo `(subtotal − baseNC de ese fp) × tc`.
  - Excluir de "otros" los propios 07 (no son gasto) y tratar las 08 como "otros" de su OT (copiada del origen).
- [ ] **Step 4: Correr** — PASS; suite verde. **Step 5: Commit** `feat(costos): las notas de crédito rebajan el costo de fabricación`.

### Task 4: Frontend — registrar NC/ND, saldo a favor y "Aplicar a…"

**Files:**
- Modify: `Frontend/src/utils/tesoreria.js` (+ tests), `Frontend/src/components/tesoreria/ModalFacturaProveedor.jsx`, `Frontend/src/components/tesoreria/TablaPorPagar.jsx`
- Create: `Frontend/src/components/tesoreria/ModalAplicarNota.jsx`

**Interfaces:**
- Produces: `TIPOS_COMPROBANTE_COMPRA` con 07 "Nota de crédito" y 08 "Nota de débito"; `vistaPreviaNota({ totalNota, saldoOrigen })` → `{ aplicar, aFavor }`; `origenesPosibles(facturas, { proveedor, moneda })`.

- [ ] **Step 1: Tests que fallan** (`tesoreria.test.js`):

```js
test("vistaPreviaNota: aplica hasta el saldo del origen y el resto queda a favor", () => {
  assert.deepEqual(vistaPreviaNota({ totalNota: 118, saldoOrigen: 354 }), { aplicar: 118, aFavor: 0 });
  assert.deepEqual(vistaPreviaNota({ totalNota: 118, saldoOrigen: 18 }), { aplicar: 18, aFavor: 100 });
});

test("origenesPosibles: mismo proveedor y moneda, vigentes, sin notas", () => {
  const fs = [
    { _id: "a", proveedor: { _id: "p1" }, moneda: "PEN", tipoComprobante: "01", anulada: false },
    { _id: "b", proveedor: { _id: "p1" }, moneda: "USD", tipoComprobante: "01", anulada: false },
    { _id: "c", proveedor: { _id: "p2" }, moneda: "PEN", tipoComprobante: "01", anulada: false },
    { _id: "d", proveedor: { _id: "p1" }, moneda: "PEN", tipoComprobante: "07", anulada: false },
    { _id: "e", proveedor: "p1", moneda: "PEN", tipoComprobante: "03", anulada: true },
  ];
  assert.deepEqual(origenesPosibles(fs, { proveedor: "p1", moneda: "PEN" }).map((f) => f._id), ["a"]);
});
```

- [ ] **Step 2–3: Implementar** en `utils/tesoreria.js` (las dos funciones; 07/08 en `TIPOS_COMPROBANTE_COMPRA`; `creditoFiscalDe` con `origen` como en el backend).
- [ ] **Step 4: `ModalFacturaProveedor.jsx`** — con tipo 07/08 (solo modo "Sin OC"): selector **"Comprobante que modifica"** con `origenesPosibles` (lista de `/tesoreria/por-pagar` → `facturas`); al elegirlo se fija proveedor/moneda/TC/centro de costo del origen; NC: oculta impuesto y "Ya se pagó", muestra "Se aplicará S/ X; quedará S/ Y a favor" con `vistaPreviaNota` y, si el origen tiene detracción, "La detracción no se recalcula; ajústala a mano si corresponde"; ND: igual que una factura. `body.documentoOrigen`. Crédito fiscal mostrado = el del origen.
- [ ] **Step 5: `TablaPorPagar.jsx`** — filas de NC: en vez de saldo/“Registrar pago”, "Saldo a favor S/ X" y botón **"Aplicar a…"** (si `saldoAFavor > 0`) que abre `ModalAplicarNota` (destinos = `origenesPosibles` con saldo, monto por defecto `min(saldoAFavor, saldo destino)`, POST `/facturas-proveedor/:id/aplicar`, errores en línea); las NC no suman a los subtotales de deuda. En filas con `aplicadoNC > 0`, nota "NC aplicadas S/ X".
- [ ] **Step 6:** `npm test`, eslint sin errores nuevos, build. **Step 7: Commit** `feat(tesoreria): registrar notas de crédito/débito, ver saldo a favor y aplicarlo`.

### Task 5: Verificación

- [ ] Suites verdes; Playwright: factura → NC parcial (baja el saldo); NC mayor que el saldo → "Saldo a favor" en Por pagar → "Aplicar a…" otra factura; anular el origen con NC → mensaje; anular la NC → saldo vuelve; ND por pagar.
- [ ] Revisor final (opus); Critical/Important con test RED→GREEN; menores al spec; spec "Estado — Fase 4"; memoria; copiar docs a los repos; push de la rama.
