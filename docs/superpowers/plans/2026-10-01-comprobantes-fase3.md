# Comprobantes de compra — Fase 3: tickets, recibos de servicios, crédito fiscal, retención 4ta y "Ya se pagó" — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que Tesorería registre tickets/POS (12) y recibos de servicios públicos (14) además de factura, recibo por honorarios y boleta; que cada comprobante quede marcado con su crédito fiscal; que el recibo por honorarios pueda llevar la retención de 4ta (8 %, manual); y que un comprobante al contado se pueda registrar ya pagado.

**Architecture:** Se amplía `FacturaProveedor` (enfoque A del spec): nuevos tipos, `ticketConRuc` y `creditoFiscal` derivado en el servidor con una función pura compartida; la retención de 4ta es un tipo más de `impuesto` (mismo flujo de neto/impuesto/pagos); "Ya se pagó" llama a `registrarMovimiento` dentro de la transacción del registro.

**Tech Stack:** Node 24 ESM + Express 4 + Mongoose 8 (`node:test`), React 19 + Vite + Tailwind.

**Spec:** `docs/superpowers/specs/2026-09-30-comprobantes-compra-design.md` (reglas 1, 2, 3 y 6; pantalla "Registrar comprobante").

## Global Constraints

- Rama `feature/comprobantes-compra` (Backend y Frontend), al día con `main`. Commits con `-m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`.
- Tests backend: `MONGO_URI_TEST="mongodb://localhost:27017/sipapp-intales-test?replicaSet=rs0" npm test`.
- Tipos de esta fase: `01, 02, 03, 12, 14` (07/08 son de la Fase 4). Etiquetas: Factura, Recibo por honorarios, Boleta, Ticket / ticket POS, Recibo de servicios públicos.
- `creditoFiscal` **nunca** viene del cliente. Regla: 01 y 14 → IGV > 0; 12 → `ticketConRuc` y IGV > 0; 02 y 03 → false.
- Retención 4ta: **manual** (casilla), solo tipo 02, 8 % del total en soles, `quienDeposita: "nosotros"`; no se combina con detracción/retención.
- "Ya se pagó": solo condición contado; paga el **neto**; el impuesto (detracción/retención) queda pendiente como hoy.
- Sin migración (el sistema no está en producción): los comprobantes sin `creditoFiscal` lo derivan al leerse con `creditoFiscalDe`.
- Nunca `alert/confirm/prompt`; fechas en hora Lima.

## Review Focus

1. Ticket sin RUC con IGV: se registra, pero sin crédito fiscal — test en Task 1.
2. Recibo por honorarios con "Retener 4ta": el emisor cobra total − 8 % y el 8 % queda por pagar a SUNAT; pagarlo cierra el comprobante — test en Task 2.
3. Retención 4ta pedida en una factura o junto con detracción → 400 — test en Task 2.
4. "Ya se pagó" en un comprobante a crédito o sin cuenta → 400 y no se registra nada (transacción) — test en Task 3.
5. "Ya se pagó" con detracción: el neto queda pagado y la detracción sigue pendiente — test en Task 3.

---

### Task 1: Tipos 12 y 14, ticket con RUC y crédito fiscal

**Files:**
- Create: `Backend/src/utils/comprobantesCompra.js`
- Modify: `Backend/src/models/FacturaProveedor.js` (enum, `ticketConRuc`, `creditoFiscal`), `Backend/src/routes/facturasProveedor.js` (tipos, campos)
- Test: `Backend/test/comprobantesCompra.test.js` (nuevo)

**Interfaces:**
- Produces: `TIPOS_COMPRA = ["01", "02", "03", "12", "14"]`; `creditoFiscalDe({ tipoComprobante, igv, ticketConRuc }) → boolean`.

- [ ] **Step 1: Test que falla** — `Backend/test/comprobantesCompra.test.js`:

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
import MovimientoTesoreria from "../src/models/MovimientoTesoreria.js";
import { creditoFiscalDe } from "../src/utils/comprobantesCompra.js";

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
  body: { proveedor: base.provA._id, centroCosto: base.centro._id, tipoComprobante: "01", serie: "T001", numero: String(++n),
    fechaEmision: "2026-09-28", subtotal: 100, igv: 18, condicion: "contado", impuesto: { tipo: "ninguno" }, ...extra },
});

test("creditoFiscalDe: factura y recibo de servicios con IGV sí; ticket solo con RUC; boleta y RH no", () => {
  assert.equal(creditoFiscalDe({ tipoComprobante: "01", igv: 18 }), true);
  assert.equal(creditoFiscalDe({ tipoComprobante: "01", igv: 0 }), false);
  assert.equal(creditoFiscalDe({ tipoComprobante: "14", igv: 9 }), true);
  assert.equal(creditoFiscalDe({ tipoComprobante: "12", igv: 18, ticketConRuc: true }), true);
  assert.equal(creditoFiscalDe({ tipoComprobante: "12", igv: 18, ticketConRuc: false }), false);
  assert.equal(creditoFiscalDe({ tipoComprobante: "03", igv: 18 }), false);
  assert.equal(creditoFiscalDe({ tipoComprobante: "02", igv: 0 }), false);
});

test("se registran ticket y recibo de servicios; el crédito fiscal lo decide el servidor (no el cliente)", async () => {
  const ticket = await registrar({ tipoComprobante: "12", ticketConRuc: false, creditoFiscal: true });
  assert.equal(ticket.status, 201, JSON.stringify(ticket.data));
  assert.equal(ticket.data.creditoFiscal, false);
  assert.equal(ticket.data.ticketConRuc, false);
  const ticketRuc = await registrar({ tipoComprobante: "12", ticketConRuc: true });
  assert.equal(ticketRuc.data.creditoFiscal, true);
  const luz = await registrar({ tipoComprobante: "14", serie: "S001" });
  assert.equal(luz.status, 201);
  assert.equal(luz.data.creditoFiscal, true);
  const boleta = await registrar({ tipoComprobante: "03" });
  assert.equal(boleta.data.creditoFiscal, false);
});

test("ticketConRuc solo en tickets; tipo desconocido → 400", async () => {
  assert.equal((await registrar({ tipoComprobante: "01", ticketConRuc: true })).status, 400);
  assert.equal((await registrar({ tipoComprobante: "04" })).status, 400);
});
```

- [ ] **Step 2: Correr** `node --test --test-concurrency=1 test/comprobantesCompra.test.js` (con `MONGO_URI_TEST`) — Expected: FAIL (módulo no existe).

- [ ] **Step 3: `Backend/src/utils/comprobantesCompra.js`**

```js
// Tabla 10 SUNAT — comprobantes de compra que registra Tesorería (Fase 3; 07/08 en la Fase 4).
export const TIPOS_COMPRA = ["01", "02", "03", "12", "14"];

// Crédito fiscal de IGV según el tipo (spec 2026-09-30, regla 1). El ticket solo da
// crédito si identifica a INTALES (RUC) y muestra el IGV desglosado.
export function creditoFiscalDe({ tipoComprobante, igv, ticketConRuc }) {
  if (!(Number(igv) > 0)) return false;
  if (tipoComprobante === "01" || tipoComprobante === "14") return true;
  if (tipoComprobante === "12") return !!ticketConRuc;
  return false;
}
```

- [ ] **Step 4: Modelo** — en `FacturaProveedor.js`: `tipoComprobante: { type: String, enum: ["01", "02", "03", "12", "14"], required: true }` y, junto a él:

```js
    // Solo tipo 12: el ticket identifica a INTALES (RUC) y desglosa el IGV.
    ticketConRuc: { type: Boolean, default: false },
    // Derivado en el servidor (creditoFiscalDe); nunca viene del cliente.
    creditoFiscal: { type: Boolean, default: false },
```

- [ ] **Step 5: Ruta** — en `routes/facturasProveedor.js`: reemplazar `const TIPOS = ["01", "02", "03"];` por `import { TIPOS_COMPRA, creditoFiscalDe } from "../utils/comprobantesCompra.js";` y usar `TIPOS_COMPRA` en la validación. Antes de calcular el impuesto:

```js
      if (b.ticketConRuc && b.tipoComprobante !== "12") throw errorHttp(400, "«Trae RUC de INTALES» solo aplica a tickets");
      const ticketConRuc = b.tipoComprobante === "12" && !!b.ticketConRuc;
```

y en `new FacturaProveedor({ … })`: `ticketConRuc, creditoFiscal: creditoFiscalDe({ tipoComprobante: b.tipoComprobante, igv, ticketConRuc }),`.

- [ ] **Step 6: Correr** — Expected: PASS 3/3; suite completa verde.
- [ ] **Step 7: Commit** `feat(compras): tickets y recibos de servicios; crédito fiscal derivado en el servidor`.

### Task 2: Retención de 4ta categoría (manual, recibos por honorarios)

**Files:**
- Modify: `Backend/src/models/impuestoSchema.js` (enum), `Backend/src/utils/impuesto.js` (`calcularImpuesto`), `Backend/src/routes/facturasProveedor.js` (validación)
- Test: `Backend/test/comprobantesCompra.test.js`

**Interfaces:**
- Produces: `impuesto.tipo: "retencion4ta"`; `TASA_RETENCION_4TA = 0.08`.

- [ ] **Step 1: Tests que fallan** — agregar:

```js
test("RH con retención de 4ta: el emisor cobra total − 8 % y el 8 % queda por pagar a SUNAT", async () => {
  const rh = await registrar({ tipoComprobante: "02", igv: 0, subtotal: 2000, impuesto: { tipo: "retencion4ta" } });
  assert.equal(rh.status, 201, JSON.stringify(rh.data));
  assert.equal(rh.data.impuesto.tipo, "retencion4ta");
  assert.equal(rh.data.impuesto.monto, 160);
  assert.equal(rh.data.netoAPagar, 1840);
  assert.equal(rh.data.saldoImpuesto, 160);
  const pagoNeto = await srv.api("POST", "/api/movimientos-tesoreria", { body: { documento: { tipo: "facturaProveedor", id: rh.data._id }, concepto: "neto", monto: 1840, fecha: "2026-09-29", cuenta: bcp._id, medio: "transferencia", numeroOperacion: "OP1" } });
  assert.equal(pagoNeto.status, 201, JSON.stringify(pagoNeto.data));
  const pagoSunat = await srv.api("POST", "/api/movimientos-tesoreria", { body: { documento: { tipo: "facturaProveedor", id: rh.data._id }, concepto: "impuesto", monto: 160, fecha: "2026-09-29", cuenta: bcp._id, medio: "transferencia", numeroOperacion: "PDT-1" } });
  assert.equal(pagoSunat.status, 201, JSON.stringify(pagoSunat.data));
  assert.equal((await FacturaProveedor.findById(rh.data._id)).estado, "pagada");
});

test("retención de 4ta solo en recibos por honorarios", async () => {
  const enFactura = await registrar({ tipoComprobante: "01", impuesto: { tipo: "retencion4ta" } });
  assert.equal(enFactura.status, 400);
  assert.match(enFactura.data.mensaje, /recibos por honorarios/);
});
```

- [ ] **Step 2: Correr** — Expected: FAIL (tipo de impuesto inválido).

- [ ] **Step 3: Implementar**
  - `models/impuestoSchema.js`: `enum: ["ninguno", "detraccion", "retencion", "retencion4ta"]`.
  - `utils/impuesto.js`: `export const TASA_RETENCION_4TA = 0.08;` y en `calcularImpuesto`, antes del `throw` final:

```js
  // Renta de 4ta categoría retenida al emisor de un recibo por honorarios (8 %).
  if (tipo === "retencion4ta") return { tasa: TASA_RETENCION_4TA, monto: round2(totalSoles * TASA_RETENCION_4TA) };
```

  - `routes/facturasProveedor.js`, tras `const imp = b.impuesto || { tipo: "ninguno" };`:

```js
      if (imp.tipo === "retencion4ta" && b.tipoComprobante !== "02") {
        throw errorHttp(400, "La retención de 4ta categoría solo aplica a recibos por honorarios");
      }
```

  (`quienDeposita` ya queda en `"nosotros"` para todo lo que no es detracción.)
- [ ] **Step 4: Correr** — Expected: PASS 5/5; suite completa verde.
- [ ] **Step 5: Commit** `feat(compras): retención de 4ta categoría en recibos por honorarios`.

### Task 3: "Ya se pagó" (registrar y pagar en un paso)

**Files:**
- Modify: `Backend/src/routes/facturasProveedor.js`
- Test: `Backend/test/comprobantesCompra.test.js`

**Interfaces:**
- Consumes: `registrarMovimiento(datos, usuario, session)` de `utils/movimientos.js`.
- Produces: body `pago: { cuenta, medio, numeroOperacion, fecha? }` opcional en `POST /facturas-proveedor`.

- [ ] **Step 1: Tests que fallan** — agregar:

```js
test("'Ya se pagó': registra el comprobante y el pago del neto en un paso", async () => {
  const r = await registrar({ tipoComprobante: "12", ticketConRuc: true, pago: { cuenta: bcp._id, medio: "efectivo", numeroOperacion: "" } });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  assert.equal(r.data.estado, "pagada");
  const movs = await MovimientoTesoreria.find({ "documento.id": r.data._id });
  assert.equal(movs.length, 1);
  assert.equal(movs[0].monto, 118);
  assert.equal(movs[0].concepto, "neto");
});

test("'Ya se pagó' con detracción: el neto queda pagado y la detracción pendiente", async () => {
  const r = await registrar({ subtotal: 1000, igv: 180, impuesto: { tipo: "detraccion", codigoSunat: "037", quienDeposita: "nosotros" }, pago: { cuenta: bcp._id, medio: "transferencia", numeroOperacion: "OP9" } });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  assert.equal(r.data.saldoNeto, 0);
  assert.ok(r.data.saldoImpuesto > 0);
  assert.equal(r.data.estado, "parcial");
});

test("'Ya se pagó' a crédito o sin cuenta → 400 y no queda nada registrado", async () => {
  const credito = await registrar({ condicion: "credito", fechaVencimiento: "2026-10-28", pago: { cuenta: bcp._id, medio: "transferencia" } });
  assert.equal(credito.status, 400);
  const sinCuenta = await registrar({ pago: { medio: "efectivo" } });
  assert.equal(sinCuenta.status, 400);
  assert.equal(await FacturaProveedor.countDocuments(), 0);
});
```

- [ ] **Step 2: Correr** — Expected: FAIL (el pago se ignora: estado "pendiente").

- [ ] **Step 3: Implementar** — en `routes/facturasProveedor.js` importar `registrarMovimiento` de `../utils/movimientos.js`; validar antes de crear (junto a la condición):

```js
      if (b.pago && condicion !== "contado") throw errorHttp(400, "«Ya se pagó» es solo para comprobantes al contado");
      if (b.pago && !b.pago.cuenta) throw errorHttp(400, "Elige la cuenta con la que se pagó");
```

  y después de `await aplicarFlete(nueva, 1, session);` / `sincronizarOCP`:

```js
      // "Ya se pagó": el pago del neto va en la misma transacción (si falla, no se registra nada).
      if (b.pago) {
        await registrarMovimiento({
          documento: { tipo: "facturaProveedor", id: nueva._id }, concepto: "neto", monto: nueva.saldoNeto,
          fecha: b.pago.fecha || b.fechaEmision, cuenta: b.pago.cuenta, medio: b.pago.medio, numeroOperacion: b.pago.numeroOperacion,
        }, req.usuario.nombre, session);
        return FacturaProveedor.findById(nueva._id, null, { session });
      }
```

  (la validación `condicion` debe ir después de calcular `condicion`; `registrarMovimiento` ya valida medio, cuenta activa y que no sea de detracciones.)
- [ ] **Step 4: Correr** — Expected: PASS 8/8; suite completa verde.
- [ ] **Step 5: Commit** `feat(tesoreria): «Ya se pagó» registra el comprobante y su pago en un paso`.

### Task 4: Formulario "Registrar comprobante"

**Files:**
- Modify: `Frontend/src/utils/tesoreria.js` (+ tests en `tesoreria.test.js`), `Frontend/src/components/tesoreria/ModalFacturaProveedor.jsx`

**Interfaces:**
- Produces (frontend): `TIPOS_COMPROBANTE_COMPRA` (`[{ valor, label }]`), `creditoFiscalDe` (espejo del backend), `calcularImpuesto` y `etiquetaImpuesto` con `retencion4ta`.

- [ ] **Step 1: Tests que fallan** — en `tesoreria.test.js`:

```js
import { TIPOS_COMPROBANTE_COMPRA, creditoFiscalDe } from "./tesoreria.js";

test("tipos de comprobante de compra y crédito fiscal (espejo del backend)", () => {
  assert.deepEqual(TIPOS_COMPROBANTE_COMPRA.map((t) => t.valor), ["01", "02", "03", "12", "14"]);
  assert.equal(creditoFiscalDe({ tipoComprobante: "12", igv: 18, ticketConRuc: false }), false);
  assert.equal(creditoFiscalDe({ tipoComprobante: "14", igv: 9 }), true);
});

test("retención de 4ta: 8 % del total en soles y su etiqueta", () => {
  assert.deepEqual(calcularImpuesto({ tipo: "retencion4ta", total: 2000 }), { tasa: 0.08, monto: 160 });
  assert.equal(etiquetaImpuesto({ tipo: "retencion4ta", tasa: 0.08 }), "Retención 4ta 8%");
});
```

  (agregar `calcularImpuesto` y `etiquetaImpuesto` al import existente si no están.)
- [ ] **Step 2: Correr** `npm test` — Expected: FAIL.
- [ ] **Step 3: `utils/tesoreria.js`**

```js
export const TIPOS_COMPROBANTE_COMPRA = [
  { valor: "01", label: "Factura" },
  { valor: "02", label: "Recibo por honorarios" },
  { valor: "03", label: "Boleta" },
  { valor: "12", label: "Ticket / ticket POS" },
  { valor: "14", label: "Recibo de servicios públicos" },
];

// Espejo de Backend/src/utils/comprobantesCompra.js (el servidor decide; esto es la vista previa).
export function creditoFiscalDe({ tipoComprobante, igv, ticketConRuc }) {
  if (!(Number(igv) > 0)) return false;
  if (tipoComprobante === "01" || tipoComprobante === "14") return true;
  if (tipoComprobante === "12") return !!ticketConRuc;
  return false;
}
```

  En `calcularImpuesto`, antes del final: `if (tipo === "retencion4ta") return { tasa: 0.08, monto: round2(soles * 0.08) };`. En `etiquetaImpuesto`: `if (impuesto?.tipo === "retencion4ta") return \`Retención 4ta ${pct}\`;`.
- [ ] **Step 4: `ModalFacturaProveedor.jsx`**
  - Reemplazar la constante local `TIPOS` por `TIPOS_COMPROBANTE_COMPRA` (y en la precarga desde SIRE aceptar también 12 y 14).
  - Estado del form: `ticketConRuc: false`, `retener4ta: false`, `yaPagado: false`, `pagoCuenta: ""`, `pagoMedio: "transferencia"`, `pagoOperacion: ""`; cargar cuentas con `fetchAuth("/cuentas-tesoreria")` (como `ModalMovimiento`) en estado `cuentas`.
  - Tipo 12: casilla **"Trae RUC de INTALES e IGV desglosado"** (`ticketConRuc`) con ayuda "Sin esto el ticket no da crédito fiscal".
  - Tipo 02: el bloque de impuesto muestra solo la casilla **"Retener 4ta (8 %)"**; si está marcada, `imp = { tipo: "retencion4ta", codigoSunat: "" }` (sin sugerencia automática), y se muestra el neto al emisor.
  - Línea informativa: "Crédito fiscal: Sí/No" con `creditoFiscalDe({ tipoComprobante, igv, ticketConRuc })`.
  - Condición contado: casilla **"Ya se pagó"**; al marcarla, selects de cuenta (`cuentasPara({ cuentas, lado: "compra", concepto: "neto", impuesto: { tipo: imp.tipo } }).origen`), medio y nº de operación; aviso `avisoMoneda` si la cuenta es de otra moneda. Botón "Registrar" deshabilitado si "Ya se pagó" sin cuenta.
  - `guardar`: agregar `ticketConRuc` al body; si `yaPagado`, `body.pago = { cuenta, medio, numeroOperacion }`.
  - Título del modal y del botón: "Registrar comprobante" (antes "factura").
- [ ] **Step 5:** `npm test`, eslint de los archivos (sin errores nuevos), `npm run build`.
- [ ] **Step 6: Commit** `feat(tesoreria): el formulario registra tickets, recibos de servicios, retención 4ta y «Ya se pagó»`.

### Task 5: Verificación

- [ ] Suites verdes; Playwright (e2e en 27018): registrar un ticket sin RUC "Ya se pagó" en efectivo → aparece pagado y sin crédito fiscal; RH con retención 4ta → por pagar con neto y 8 %; recibo de luz con IGV.
- [ ] Revisor final (Agent, opus); Critical/Important con test RED→GREEN; menores al spec; spec "Estado — Fase 3"; memoria; `graphify update .`.
