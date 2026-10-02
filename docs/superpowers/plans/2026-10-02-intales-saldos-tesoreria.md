# Saldos de tesorería y movimientos manuales — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Saldo inicial y saldo calculado por cuenta de tesorería, ingreso/egreso manual sin documento, transferencias
entre cuentas propias y la regla de saldo insuficiente (caja y detracciones bloquean; banco pide confirmar sobregiro).

**Architecture:** El saldo nunca se guarda: `utils/saldosCuentas.js` lo calcula por agregación (inicial + ingresos −
egresos ± transferencias, sin anulados) y `verificarSaldo` mide contra el **mínimo del saldo acumulado** desde la fecha
del egreso. `registrarMovimiento` (pagos, autodetracción, "Ya se pagó") y las rutas nuevas de movimientos manuales y
transferencias llaman a `verificarSaldo` dentro de la transacción, después de escribir en la cuenta (candado). El panel
envía con `enviarConSobregiro` y pregunta con un diálogo propio (nunca `window.confirm`).

**Tech Stack:** Node 24 ESM, Express 4, Mongoose 8 (MongoDB replica set rs0), node:test; React 19 + Vite + Tailwind.

**Spec:** diseño aprobado el 2026-10-01 en la memoria `project_intales_movimientos_manuales.md` y
`docs/ESTADO-PROYECTO.md` §5 (lecciones de Micronegocios). Implementación de referencia revisada:
`SIPAPP-MICRONEGOCIOS/backend-micronegocios/src/utils/tesoreria/saldos.js`, `routes/tesoreria.js`,
`routes/cuentasTesoreria.js`, `frontend-escritorio/src/lib/sobregiro.jsx`.

## Global Constraints

- Ramas `feature/movimientos-manuales` en Backend y Frontend (worktrees `C:\SIP-APP\SIPAPP-INTALES-saldos\`), base
  `feature/revision-compras`. Sin merge ni push.
- Tests backend: `MONGO_URI_TEST="mongodb://localhost:27017/sipapp-intales-test-saldos?replicaSet=rs0" npm test`.
- Tests frontend: `npm test` y `npm run build`; lint solo de archivos tocados (errores previos conocidos en
  `EmitirComprobante.jsx` y otros listados en ESTADO-PROYECTO §1).
- Fechas `YYYY-MM-DD` → medianoche Lima (`aFechaLima`); TC USD con `tipoCambioDelDia` (SUNAT del día).
- Nunca `alert/confirm/prompt`: diálogos propios (`ConfirmacionAccion`, `PromptAccion`).
- Errores de negocio `400 { mensaje }`; saldo insuficiente `409 { mensaje }`; sobregiro de banco
  `409 { mensaje, codigo: "SOBREGIRO" }`, se permite con `confirmarSobregiro: true` en la **raíz** del body.
- Handlers async con try/catch + `next(err)`. Sin scripts de migración (no está en producción).
- Movimientos manuales: conceptos `aporte`, `prestamo`, `retiro`, `gasto_bancario`, `otros` (con descripción; `otros`
  la exige). Registran y anulan: `admin`, `jefatura`, `tesorero`. El `contador` (y `facturacion`) solo leen.
- Se anulan con motivo; aparecen en el libro de movimientos con su concepto.
- El saldo inicial (monto ≥ 0, fecha, TC si la cuenta es USD) solo se edita mientras la cuenta no tenga movimientos.
  El saldo inicial **no cuenta** para un saldo a una fecha anterior a la suya.
- Commits en español terminados con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. Egreso con fecha pasada cuando ya hay egresos posteriores: debe fallar si algún saldo posterior queda negativo
   (mínimo del saldo acumulado) — test en Task 2.
2. Dos egresos simultáneos de la misma caja que juntos superan el saldo: solo uno pasa (candado en la cuenta dentro de
   la transacción) — test en Task 2.
3. "Ya se pagó" desde un banco sin saldo: 409 `SOBREGIRO`; el reintento del panel manda `confirmarSobregiro` en la raíz
   y debe registrar; desde caja, 409 sin opción — test en Task 3.
4. Movimiento manual anulado: deja de contar en el saldo; un anulado no se vuelve a anular; el contador no puede anular
   ni registrar — test en Task 4.
5. Cuenta USD con saldo inicial en el reporte de diferencia de cambio al cierre: el inicial entra con su TC y solo si su
   fecha es ≤ la del cierre — test en Task 5.

---

### Task 1: `errorHttp` con datos extra (codigo) en la respuesta

**Files:**
- Modify: `Backend/src/utils/errorHttp.js`, `Backend/src/middleware/manejarErrores.js`
- Test: `Backend/test/manejarErrores.test.js`

**Interfaces:**
- Produces: `errorHttp(status, mensaje, extra = {})` → el handler responde `{ mensaje, ...extra }`.

- [ ] **Step 1: test que falla**

```js
test("errorHttp con extra: el handler responde también sus campos (codigo)", async () => {
  const res = respuestaFalsa();
  manejarErrores(errorHttp(409, "La cuenta BCP quedará en −S/ 10.00", { codigo: "SOBREGIRO" }), { method: "POST", originalUrl: "/x" }, res, () => {});
  assert.equal(res.statusCode, 409);
  assert.deepEqual(res.body, { mensaje: "La cuenta BCP quedará en −S/ 10.00", codigo: "SOBREGIRO" });
});
```
(usar el doble de `res` que ya tenga el archivo; si no tiene, `{ status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; } }`).

- [ ] **Step 2:** correr `node --test test/manejarErrores.test.js` → FALLA (body sin `codigo`).
- [ ] **Step 3: implementación**

```js
// errorHttp.js
export function errorHttp(status, mensaje, extra = {}) {
  return Object.assign(new Error(mensaje), { status, expose: true, extra });
}
// manejarErrores.js, al final:
res.status(status).json({ mensaje, ...(err.status ? err.extra : {}) });
```
- [ ] **Step 4:** el test pasa. **Step 5:** commit `feat(tesoreria): errorHttp con datos extra (codigo) en la respuesta`.

### Task 2: saldo inicial, saldo por cuenta y `verificarSaldo`

**Files:**
- Modify: `Backend/src/models/CuentaTesoreria.js`, `Backend/src/models/MovimientoTesoreria.js` (índices),
  `Backend/src/routes/cuentasTesoreria.js`
- Create: `Backend/src/utils/saldosCuentas.js`
- Test: `Backend/test/saldosCuentas.test.js`

**Interfaces:**
- Produces: `saldoCuenta(cuenta, { hasta?: Date, session? }) → Promise<number>`;
  `verificarSaldo({ cuenta, monto, fecha, confirmarSobregiro, session }) → Promise<void>` (lanza 409);
  `GET /cuentas-tesoreria` → cada cuenta con `saldo` y `tieneMovimientos`;
  campos `saldoInicial` (Number ≥ 0, default 0), `fechaSaldoInicial` (Date|null), `tipoCambioSaldoInicial` (Number|null).

- [ ] **Step 1: tests que fallan** (`test/saldosCuentas.test.js`, monta `/api/cuentas-tesoreria`)

```js
test("saldo inicial al crear; USD toma el TC compra SUNAT de su fecha; solo jefatura/admin", async () => {
  await TipoCambioDia.create({ fecha: "2026-09-01", fechaSunat: "2026-09-01", compra: 3.5, venta: 3.52, provisional: false, consultadoEn: new Date() });
  const r = await srv.api("POST", "/api/cuentas-tesoreria", { body: { nombre: "BCP $", tipo: "banco", moneda: "USD", saldoInicial: 1000, fechaSaldoInicial: "2026-09-01" }, rol: "jefatura" });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  assert.equal(r.data.tipoCambioSaldoInicial, 3.5);
  assert.equal(new Date(r.data.fechaSaldoInicial).toISOString(), "2026-09-01T05:00:00.000Z");
  const lista = await srv.api("GET", "/api/cuentas-tesoreria", { rol: "contador" });
  assert.equal(lista.data[0].saldo, 1000);
  assert.equal(lista.data[0].tieneMovimientos, false);
});

test("saldo inicial: validaciones (negativo, sin fecha, fecha inválida) → 400", async () => {
  const base = { nombre: "Caja", tipo: "caja", moneda: "PEN" };
  for (const extra of [{ saldoInicial: -1, fechaSaldoInicial: "2026-09-01" }, { saldoInicial: 50 }, { saldoInicial: 50, fechaSaldoInicial: "2026-02-30" }, { saldoInicial: "abc", fechaSaldoInicial: "2026-09-01" }]) {
    assert.equal((await srv.api("POST", "/api/cuentas-tesoreria", { body: { ...base, ...extra } })).status, 400, JSON.stringify(extra));
  }
});

test("el saldo inicial solo se edita mientras la cuenta no tenga movimientos", async () => {
  const c = await CuentaTesoreria.create({ nombre: "Caja", tipo: "caja", moneda: "PEN" });
  const ok = await srv.api("PUT", `/api/cuentas-tesoreria/${c._id}`, { body: { saldoInicial: 300, fechaSaldoInicial: "2026-09-01" } });
  assert.equal(ok.status, 200);
  assert.equal(ok.data.saldoInicial, 300);
  await MovimientoTesoreria.create({ codigo: "MOV-9", tipo: "ingreso", fecha: new Date(), monto: 5, cuenta: c._id, medio: "efectivo", conceptoManual: "aporte" });
  const no = await srv.api("PUT", `/api/cuentas-tesoreria/${c._id}`, { body: { saldoInicial: 400 } });
  assert.equal(no.status, 400);
  assert.match(no.data.mensaje, /movimientos/);
});

test("saldoCuenta: inicial + ingresos − egresos ± transferencias, sin anulados; el inicial no cuenta antes de su fecha", async () => {
  const caja = await CuentaTesoreria.create({ nombre: "Caja", tipo: "caja", saldoInicial: 100, fechaSaldoInicial: f("2026-09-10") });
  const banco = await CuentaTesoreria.create({ nombre: "BCP", tipo: "banco" });
  await MovimientoTesoreria.create([
    mov("ingreso", 50, "2026-09-11", caja), mov("egreso", 30, "2026-09-12", caja),
    { ...mov("transferencia", 20, "2026-09-13", caja), cuentaDestino: banco._id },
    { ...mov("egreso", 999, "2026-09-12", caja), anulado: true },
  ]);
  assert.equal(await saldoCuenta(caja), 100);
  assert.equal(await saldoCuenta(banco), 20);
  assert.equal(await saldoCuenta(caja, { hasta: f("2026-09-09") }), 0);
  assert.equal(await saldoCuenta(caja, { hasta: f("2026-09-12") }), 120);
});

test("verificarSaldo: caja/detracciones 409 sin opción; banco 409 SOBREGIRO salvo confirmarSobregiro", async () => {
  const caja = await CuentaTesoreria.create({ nombre: "Caja", tipo: "caja", saldoInicial: 100, fechaSaldoInicial: f("2026-09-01") });
  const banco = await CuentaTesoreria.create({ nombre: "BCP", tipo: "banco", saldoInicial: 100, fechaSaldoInicial: f("2026-09-01") });
  await verificarSaldo({ cuenta: caja, monto: 100, fecha: f("2026-09-05") });
  await assert.rejects(verificarSaldo({ cuenta: caja, monto: 100.01, fecha: f("2026-09-05"), confirmarSobregiro: true }), (e) => e.status === 409 && !e.extra?.codigo);
  await assert.rejects(verificarSaldo({ cuenta: banco, monto: 150, fecha: f("2026-09-05") }), (e) => e.status === 409 && e.extra.codigo === "SOBREGIRO");
  await verificarSaldo({ cuenta: banco, monto: 150, fecha: f("2026-09-05"), confirmarSobregiro: true });
});

test("verificarSaldo: egreso con fecha pasada se mide contra el mínimo del saldo acumulado", async () => {
  const caja = await CuentaTesoreria.create({ nombre: "Caja", tipo: "caja", saldoInicial: 100, fechaSaldoInicial: f("2026-09-01") });
  await MovimientoTesoreria.create([mov("egreso", 80, "2026-09-20", caja)]);
  // Al 05/09 hay 100, pero el 20/09 quedarían −30.
  await assert.rejects(verificarSaldo({ cuenta: caja, monto: 50, fecha: f("2026-09-05") }), (e) => e.status === 409);
  await verificarSaldo({ cuenta: caja, monto: 20, fecha: f("2026-09-05") });
});

test("verificarSaldo: un saldo inicial posterior no cubre un egreso anterior a su fecha", async () => {
  const caja = await CuentaTesoreria.create({ nombre: "Caja", tipo: "caja", saldoInicial: 500, fechaSaldoInicial: f("2026-09-15") });
  await assert.rejects(verificarSaldo({ cuenta: caja, monto: 10, fecha: f("2026-09-10") }), (e) => e.status === 409);
});
```
Helpers del archivo: `const f = (d) => new Date(\`${d}T00:00:00-05:00\`)`;
`let n = 0; const mov = (tipo, monto, fecha, cuenta) => ({ codigo: \`MOV-T${++n}\`, tipo, monto, fecha: f(fecha), cuenta: cuenta._id, medio: "efectivo", conceptoManual: tipo === "transferencia" ? "transferencia" : "otros", descripcion: "t" })`.
(El modelo de Task 4 ya permite `conceptoManual`; en esta tarea se agrega el campo al schema junto con el índice para que
los fixtures sean válidos.)

- [ ] **Step 2:** correr el archivo → FALLA (no existe `saldosCuentas.js`, campos ausentes).
- [ ] **Step 3: implementación**

`CuentaTesoreria.js`: agregar
```js
    // Dinero que ya había al empezar a usar el sistema; editable solo mientras la cuenta no tenga
    // movimientos (después se usa un ingreso o egreso manual). En USD guarda el TC compra SUNAT de su fecha.
    saldoInicial: { type: Number, default: 0, min: 0 },
    fechaSaldoInicial: { type: Date, default: null },
    tipoCambioSaldoInicial: { type: Number, default: null },
```
`MovimientoTesoreria.js`: `conceptoManual` (enum `["aporte","prestamo","retiro","gasto_bancario","otros","transferencia"]`),
`descripcion` (String, trim, maxlength 250, default ""); `concepto`, `documento.tipo` y `documento.id` requeridos solo si
no hay `conceptoManual` (`required: function () { return !this.conceptoManual; }`); índices `{ cuenta: 1, fecha: 1 }` y
`{ cuentaDestino: 1, fecha: 1 }`.

`utils/saldosCuentas.js`: `saldoCuenta` (agregación con `$switch` por tipo y lado, sin anulados; el inicial cuenta si no
hay `hasta` o `hasta >= fechaSaldoInicial`) y `verificarSaldo`:
```js
export async function verificarSaldo({ cuenta, monto, fecha, confirmarSobregiro = false, session = null }) {
  // Candado: dos egresos simultáneos de la misma cuenta chocan y el perdedor se reintenta viendo al otro.
  await CuentaTesoreria.collection.updateOne({ _id: cuenta._id }, { $set: { updatedAt: new Date() } }, { session });
  let saldo = await saldoCuenta(cuenta, { hasta: fecha, session });
  const id = new mongoose.Types.ObjectId(cuenta._id);
  const posteriores = await MovimientoTesoreria.find({ anulado: false, fecha: { $gt: fecha }, $or: [{ cuenta: id }, { cuentaDestino: id }] },
    "tipo cuenta cuentaDestino monto fecha", { session }).lean();
  const eventos = posteriores.map((m) => ({ fecha: m.fecha, monto: efecto(m, id) }));
  if (cuenta.fechaSaldoInicial && cuenta.fechaSaldoInicial > fecha) eventos.push({ fecha: cuenta.fechaSaldoInicial, monto: cuenta.saldoInicial || 0 });
  eventos.sort((a, b) => a.fecha - b.fecha);
  let acumulado = saldo;
  for (const e of eventos) { acumulado += e.monto; saldo = Math.min(saldo, acumulado); }
  saldo = round2(saldo);
  if (saldo - monto >= -0.009) return;
  const S = (n) => `${cuenta.moneda === "USD" ? "US$" : "S/"} ${round2(n).toFixed(2)}`;
  if (cuenta.tipo === "banco") {
    if (confirmarSobregiro === true) return;
    throw errorHttp(409, `La cuenta ${cuenta.nombre} quedará en −${S(monto - saldo)}`, { codigo: "SOBREGIRO" });
  }
  throw errorHttp(409, `Saldo insuficiente en ${cuenta.nombre}: disponible ${S(saldo)}, falta ${S(monto - saldo)}. Registra el saldo inicial, un ingreso o una transferencia`);
}
```
`routes/cuentasTesoreria.js`: función `leerSaldoInicial(body, moneda)` que valida (`saldoInicial` número finito ≥ 0,
fecha `YYYY-MM-DD` real y obligatoria si el monto > 0) y, si la cuenta es USD y el monto > 0, toma
`(await tipoCambioDelDia(fecha)).compra`; POST la aplica; PUT la aplica solo si no existe ningún movimiento de la cuenta
(400 "La cuenta ya tiene movimientos: usa un ingreso o egreso manual"). GET agrega `saldo` y `tieneMovimientos`.

- [ ] **Step 4:** el archivo pasa. Agregar el test de concurrencia (Review Focus 2) en Task 4, donde ya hay ruta.
- [ ] **Step 5:** commit `feat(tesoreria): saldo inicial y saldo calculado por cuenta`.

### Task 3: saldo insuficiente en pagos, autodetracción y "Ya se pagó"

**Files:**
- Modify: `Backend/src/utils/movimientos.js` (`registrarMovimiento`), `Backend/src/routes/facturasProveedor.js`
  (`b.pago`), fixtures de tests existentes que pagan desde cuentas sin saldo
- Test: `Backend/test/saldosCuentas.test.js` (montar también facturas-proveedor, movimientos-tesoreria, bloqueos)

**Interfaces:**
- Consumes: `verificarSaldo` (Task 2).
- Produces: `registrarMovimiento(datos)` acepta `datos.confirmarSobregiro`.

- [ ] **Step 1: tests que fallan**

```js
test("pago desde caja sin saldo → 409; desde banco → SOBREGIRO y con confirmarSobregiro en la raíz → 201", async () => {
  const fp = await facturaContado(118);  // POST /facturas-proveedor sin OC, 100 + 18 IGV, sin impuesto
  const caja = await CuentaTesoreria.create({ nombre: "Caja", tipo: "caja" });
  const banco = await CuentaTesoreria.create({ nombre: "BCP", tipo: "banco" });
  const pago = (cuenta, extra = {}) => srv.api("POST", "/api/movimientos-tesoreria", { body: { documento: { tipo: "facturaProveedor", id: fp._id }, concepto: "neto", monto: 118, fecha: "2026-09-29", cuenta: cuenta._id, medio: "transferencia", ...extra } });
  const r1 = await pago(caja, { confirmarSobregiro: true });
  assert.equal(r1.status, 409);
  assert.equal(r1.data.codigo, undefined);
  const r2 = await pago(banco);
  assert.equal(r2.status, 409);
  assert.equal(r2.data.codigo, "SOBREGIRO");
  assert.equal((await pago(banco, { confirmarSobregiro: true })).status, 201);
  assert.equal(await saldoCuenta(await CuentaTesoreria.findById(banco._id)), -118);
});

test("Ya se pagó desde un banco sin saldo: SOBREGIRO y el reintento con confirmarSobregiro en la raíz registra", async () => {
  const banco = await CuentaTesoreria.create({ nombre: "BCP", tipo: "banco" });
  const body = { ...comprobanteContado(118), pago: { cuenta: banco._id, medio: "transferencia", fecha: "2026-09-29" } };
  const r1 = await srv.api("POST", "/api/facturas-proveedor", { body });
  assert.equal(r1.status, 409);
  assert.equal(r1.data.codigo, "SOBREGIRO");
  assert.equal(await FacturaProveedor.countDocuments(), 0);
  const r2 = await srv.api("POST", "/api/facturas-proveedor", { body: { ...body, confirmarSobregiro: true } });
  assert.equal(r2.status, 201, JSON.stringify(r2.data));
  assert.equal(r2.data.estado, "pagada");
});

test("autodetracción (transferencia a detracciones) también exige saldo en la cuenta de origen", async () => { /* cobro de venta con detracción quienDeposita=nosotros desde caja sin saldo → 409 */ });
```
- [ ] **Step 2:** correr → FALLA (se registran sin control).
- [ ] **Step 3: implementación** — en `registrarMovimiento`, antes del `create`:
```js
  if (tipo === "egreso" || tipo === "transferencia") {
    await verificarSaldo({ cuenta: cta, monto, fecha, confirmarSobregiro: datos.confirmarSobregiro, session });
  }
```
En `facturasProveedor.js` (bloque `if (b.pago)`): pasar
`confirmarSobregiro: b.confirmarSobregiro === true || b.pago.confirmarSobregiro === true`.
Fixtures existentes que pagan desde cuentas sin saldo (comprobantesCompra, costosFabricacion, movimientosTesoreria,
notasCredito, notasCreditoVenta, resumenTributario, revisionCompras, tesoreriaVistas, ventasTesoreria, diferenciaCambio):
dar `saldoInicial` con `fechaSaldoInicial` 2020-01-01 a las cuentas en PEN; en `diferenciaCambio.test.js` (cuenta USD
cuyo saldo es parte del reporte) mandar `confirmarSobregiro: true` en el helper de pagos para no cambiar los esperados.
- [ ] **Step 4:** suite completa en verde. **Step 5:** commit `feat(tesoreria): saldo insuficiente en pagos, autodetracción y "Ya se pagó"`.

### Task 4: ingreso/egreso manual, transferencias entre cuentas y anulación

**Files:**
- Modify: `Backend/src/routes/movimientosTesoreria.js`, `Backend/src/utils/movimientos.js` (`anularMovimiento`),
  `Backend/src/middleware/puedeTesoreria.js` (`ROLES_MOVIMIENTO_MANUAL`)
- Test: `Backend/test/movimientosManuales.test.js`

**Interfaces:**
- Consumes: `verificarSaldo`, `tipoCambioDelDia`, `Configuracion.obtener` (`tcCobros`/`tcPagos`).
- Produces: `POST /movimientos-tesoreria/manual` body `{ tipo: "ingreso"|"egreso", cuenta, conceptoManual, descripcion,
  monto, fecha, medio?, numeroOperacion?, confirmarSobregiro? }`;
  `POST /movimientos-tesoreria/transferencia` body `{ cuenta, cuentaDestino, monto, fecha, descripcion?, numeroOperacion?, confirmarSobregiro? }`;
  `GET /movimientos-tesoreria` devuelve `conceptoManual` y `descripcion`; `PATCH /:id/anular` funciona para manuales.

- [ ] **Step 1: tests que fallan**

```js
test("ingreso manual: aporte a caja; contador y facturación no registran", async () => {
  const r = await manual({ tipo: "ingreso", cuenta: caja._id, conceptoManual: "aporte", descripcion: "Aporte socio", monto: 500, fecha: "2026-09-20" }, "tesorero");
  assert.equal(r.status, 201, JSON.stringify(r.data));
  assert.equal(r.data.codigo, "MOV-0001");
  assert.equal(r.data.conceptoManual, "aporte");
  assert.equal(new Date(r.data.fecha).toISOString(), "2026-09-20T05:00:00.000Z");
  for (const rol of ["contador", "facturacion"]) assert.equal((await manual({ tipo: "ingreso", cuenta: caja._id, conceptoManual: "aporte", monto: 1, fecha: "2026-09-20" }, rol)).status, 403);
  assert.equal((await srv.api("GET", "/api/movimientos-tesoreria", { rol: "contador" })).data[0].conceptoManual, "aporte");
});

test("validaciones del movimiento manual → 400", async () => {
  const ok = { tipo: "ingreso", cuenta: caja._id, conceptoManual: "aporte", monto: 10, fecha: "2026-09-20" };
  for (const malo of [{ tipo: "otro" }, { conceptoManual: "x" }, { conceptoManual: "otros", descripcion: " " }, { monto: 0 }, { monto: "abc" },
    { fecha: "2026-13-01" }, { cuenta: "nope" }, { cuenta: inactiva._id }, { medio: "trueque" }]) {
    assert.equal((await manual({ ...ok, ...malo })).status, 400, JSON.stringify(malo));
  }
});

test("egreso manual: caja sin saldo 409; banco SOBREGIRO y confirmado; gasto bancario", async () => { /* … */ });

test("dos egresos simultáneos de la misma caja que juntos superan el saldo: solo uno pasa", async () => {
  await manual({ tipo: "ingreso", cuenta: caja._id, conceptoManual: "aporte", monto: 100, fecha: "2026-09-01" });
  const eg = () => manual({ tipo: "egreso", cuenta: caja._id, conceptoManual: "retiro", monto: 70, fecha: "2026-09-02" });
  const rs = await Promise.all([eg(), eg(), eg()]);
  assert.equal(rs.filter((r) => r.status === 201).length, 1);
  assert.ok(rs.filter((r) => r.status !== 201).every((r) => r.status === 409));
});

test("egreso manual en USD toma el TC SUNAT del día (pagos → venta); ingreso → compra", async () => { /* TipoCambioDia 2026-09-25 3.48/3.49 */ });

test("transferencia entre cuentas: misma moneda, distintas, con saldo en el origen", async () => { /* 400 misma cuenta / otra moneda; 409 sin saldo; 201 y saldos */ });

test("anular un movimiento manual: con motivo, deja de contar; contador no anula; no se anula dos veces", async () => { /* … */ });
```
- [ ] **Step 2:** correr → FALLA (404 de rutas inexistentes).
- [ ] **Step 3: implementación** (rutas en `movimientosTesoreria.js`, antes de `/:id/anular`):
  - `soloRoles(ROLES_MOVIMIENTO_MANUAL, "Solo admin, jefatura o tesorería registran movimientos manuales.")`.
  - Validar body (`tipo`, `conceptoManual`, `descripcion` ≤ 250, obligatoria en `otros`, `monto` > 0 redondeado a 2,
    fecha `YYYY-MM-DD` real, `medio` ∈ transferencia/deposito/efectivo/cheque (por defecto efectivo), cuenta ObjectId).
  - TC: si la cuenta (leída antes de la transacción) es USD → `tipoCambioDelDia(fecha)`, ingreso `cfg.tcCobros`,
    egreso `cfg.tcPagos`, transferencia `compra`; guardar `tipoCambio`, `tipoCambioDoc` (= el mismo), `fuenteTc`.
  - Dentro de `conTransaccion`: releer la cuenta activa, `verificarSaldo` en egresos y transferencias, `siguienteCodigo("MOV")`, `create`.
  - `anularMovimiento`: si `mov.conceptoManual`, anular sin recalcular documento; la ruta exige `ROLES_MOVIMIENTO_MANUAL`
    para anular manuales (403 para el resto).
- [ ] **Step 4:** archivo y suite en verde. **Step 5:** commit `feat(tesoreria): ingreso/egreso manual y transferencias entre cuentas`.

### Task 5: diferencia de cambio al cierre con el saldo inicial

**Files:** Modify `Backend/src/utils/diferenciaCambioCierre.js`; Test `Backend/test/diferenciaCambio.test.js`

- [ ] **Step 1: test que falla**

```js
test("cierre: la cuenta USD suma su saldo inicial con su TC (solo si su fecha es ≤ la del cierre)", async () => {
  await CuentaTesoreria.updateOne({ _id: bcpUsd._id }, { saldoInicial: 1000, fechaSaldoInicial: new Date("2026-09-02T05:00:00Z"), tipoCambioSaldoInicial: 3.5 });
  const r = await srv.api("GET", "/api/tesoreria/diferencia-cambio?fecha=2026-09-25");
  const p = r.data.partidas.find((x) => x.tipo === "cuenta" && String(x.cuenta.id) === String(bcpUsd._id));
  assert.equal(p.saldoMe, 1000);
  assert.equal(p.librosSoles, 3500);
  assert.equal(p.cierreSoles, 3480);
  assert.equal(p.diferencia, -20);
  const antes = await srv.api("GET", "/api/tesoreria/diferencia-cambio?fecha=2026-09-01");  // TipoCambioDia 2026-09-01 sembrado en el test
  assert.equal(antes.data.partidas.some((x) => x.tipo === "cuenta"), false);
});
```
- [ ] **Step 2:** FALLA (cuenta sin movimientos se omite). **Step 3:** arrancar `saldoMe`/`librosSoles` con el inicial
  (`saldoInicial × tipoCambioSaldoInicial`) si `fechaSaldoInicial <= hasta`; omitir la cuenta solo si no hay ni inicial
  ni movimientos. **Step 4:** verde. **Step 5:** commit `feat(tesoreria): diferencia de cambio al cierre con saldo inicial`.

### Task 6: frontend — utilidades (sobregiro, conceptos, roles, opción de cuenta con saldo)

**Files:**
- Create: `Frontend/src/utils/sobregiro.js`, `Frontend/src/utils/sobregiro.test.js`
- Modify: `Frontend/src/utils/tesoreria.js` (+ test), `Frontend/src/utils/roles.js` (+ test)

**Interfaces:**
- Produces: `enviarConSobregiro(enviar, body, confirmar) → Promise<Response>` (`enviar(body)` hace el fetch;
  `confirmar(mensaje) → Promise<boolean>`); `CONCEPTOS_MANUALES` (`[{ valor, label }]`), `etiquetaConceptoManual(valor)`;
  `textoCuenta(c)` → `"BCP Soles (PEN) · saldo S/ 1,200.00"`; `puedeMovimientoManual(rol)`.

- [ ] **Step 1: tests que fallan**

```js
test("enviarConSobregiro: sin 409 SOBREGIRO devuelve la respuesta tal cual", async () => {
  const llamadas = [];
  const r = await enviarConSobregiro(async (b) => { llamadas.push(b); return respuesta(201, {}); }, { a: 1 }, async () => true);
  assert.equal(r.status, 201); assert.equal(llamadas.length, 1);
});
test("enviarConSobregiro: SOBREGIRO pregunta y reintenta con confirmarSobregiro en la raíz", async () => {
  const llamadas = [];
  const enviar = async (b) => { llamadas.push(b); return llamadas.length === 1 ? respuesta(409, { mensaje: "La cuenta BCP quedará en −S/ 5.00", codigo: "SOBREGIRO" }) : respuesta(201, {}); };
  let pregunta = "";
  const r = await enviarConSobregiro(enviar, { pago: { cuenta: "x" } }, async (m) => { pregunta = m; return true; });
  assert.equal(r.status, 201);
  assert.deepEqual(llamadas[1], { pago: { cuenta: "x" }, confirmarSobregiro: true });
  assert.match(pregunta, /quedará en −S\/ 5.00/);
});
test("enviarConSobregiro: si el usuario cancela, devuelve el 409 sin reintentar; 409 de caja no pregunta", async () => { /* … */ });
test("puedeMovimientoManual: admin, jefatura y tesorero", () => { /* contador, facturacion → false */ });
test("textoCuenta y etiquetaConceptoManual", () => { /* … */ });
```
(`respuesta = (status, data) => ({ status, ok: status < 400, clone() { return this; }, json: async () => data })`.)
- [ ] **Step 2:** FALLA. **Step 3:** implementar. **Step 4:** `npm test` verde. **Step 5:** commit
  `feat(tesoreria): utilidades de sobregiro, conceptos manuales y saldo de cuenta`.

### Task 7: frontend — pantallas

**Files:**
- Create: `Frontend/src/hooks/useConfirmar.jsx`, `Frontend/src/components/tesoreria/ModalMovimientoManual.jsx`
- Modify: `PanelConfiguracion.jsx` (saldo inicial al crear y editable sin movimientos; columnas saldo inicial/fecha/TC y
  saldo actual), `TablaMovimientos.jsx` (tarjetas de saldo por cuenta, botones "Ingreso / egreso" y "Transferencia"
  según rol, concepto y descripción en el libro y en el Excel, "Anular" de manuales solo para quien registra),
  `ModalMovimiento.jsx` y `ModalFacturaProveedor.jsx` (saldo en el selector de cuenta; envío con `enviarConSobregiro` y
  diálogo propio).

- [ ] **Step 1:** implementar (sin lógica nueva fuera de las utilidades de Task 6).
- [ ] **Step 2:** `npm test`, `npm run build`, `npx eslint` de los archivos tocados → sin errores nuevos.
- [ ] **Step 3:** commit `feat(tesoreria): saldos, movimientos manuales y confirmación de sobregiro en el panel`.

### Task 8: documentación

**Files:** `docs/contabilidad/HANDOFF-contabilidad.md`, `docs/ESTADO-PROYECTO.md` (ambos repos), ledger
`docs/superpowers/sdd/2026-10-02-intales-saldos-tesoreria-progress.md`, copia del plan en Frontend.

- [ ] Nota en el HANDOFF: cada `conceptoManual` necesita su cuenta PCGE para el motor C1 (aporte 50/52, préstamo 45x/
  16x, retiro 50/14x, gasto bancario 6391, otros: a elegir; transferencia entre cuentas 10x↔10x) — solo nota, sin código.
- [ ] ESTADO-PROYECTO §5: la tarea queda en la rama, sin mergear. Commit `docs: saldos de tesorería y movimientos manuales`.
