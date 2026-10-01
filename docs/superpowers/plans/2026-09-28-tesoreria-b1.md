# Tesorería operativa (B1) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tesorería con facturas de proveedor (varias por OCP, con o sin OC, con flete), detracción/retención según quién deposita, libro único de movimientos (pagos, cobros, transferencias, comprobantes de retención) con transacciones de MongoDB, cobro de facturas de venta sobre el mismo libro, y conciliación contra la propuesta SIRE (API vía HUB o archivo).

**Architecture:** Nuevas colecciones `CuentaTesoreria`, `Configuracion`, `FacturaProveedor`, `MovimientoTesoreria`, `PropuestaSire`; bloque `impuesto` compartido. Toda escritura de dinero pasa por `conTransaccion()`. Los saldos de cada factura y el estado de pago de la OCP y de sus orígenes se recalculan dentro de la misma transacción desde los movimientos. Frontend: página `/tesoreria` con 5 pestañas y componentes en `Frontend/src/components/tesoreria/`.

**Tech Stack:** Node 24 + Express 4 + Mongoose 8 (ESM), MongoDB 8.2 local como replica set `rs0`; React 19 + Vite + Tailwind 3; xlsx; `adm-zip` (nueva). Tests `node:test`.

**Spec:** `docs/superpowers/specs/2026-09-28-tesoreria-b1-design.md`

## Global Constraints

- Repos separados `Backend/` y `Frontend/`. Antes de la Task 1 crear la rama `feature/tesoreria-b1` en ambos. Todo commit termina con la línea `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` (segundo `-m`).
- **MongoDB local debe ser replica set `rs0`** (Task 0). Sin eso las transacciones fallan con "Transaction numbers are only allowed on a replica set member or mongos".
- Tests: `mongodb://localhost:27017/sipapp-intales-test?replicaSet=rs0` (helper). Nunca contra la base de dev.
- Todo handler `async` con `try/catch → next(err)`. Dentro de `conTransaccion` los errores de negocio se lanzan con `errorHttp(status, mensaje)` (el handler global responde `err.message` cuando hay `err.status`).
- Dentro de una transacción **no** usar `Promise.all` con la misma sesión (MongoDB no admite operaciones paralelas en una sesión): todo secuencial y con `{ session }`.
- Roles de Tesorería: `facturacion`, `jefatura`, `admin` (middleware `puedeTesoreria`). Configuración y cuentas: escritura solo `jefatura`, `admin`.
- Códigos nuevos con contador atómico: `FP-NNNN`, `MOV-NNNN` (`siguienteCodigo`).
- Impuesto: detracción con el Catálogo 54 ya existente (`DETRACCION_BIENES_SERVICIOS` en `Backend/src/utils/catalogos.js` y `Frontend/src/utils/catalogosSunat.js`), monto en S/ redondeado a entero; retención 3 % a 2 decimales; umbral total > S/ 700 (solo para la *sugerencia*; el usuario puede forzar).
- Facturas de venta (`Factura`) no tienen campo `moneda`: se tratan como PEN.
- Nunca `window.alert/confirm/prompt`; usar `ConfirmacionAccion` / `PromptAccion`. Cargas de tablas con `useCallback(() => fetchAuth(...).then(...))` (regla lint `set-state-in-effect`).
- Nueva dependencia backend: `adm-zip@^0.6.0` (misma versión que IMAQUITEC).

## Review Focus

1. Una transacción que falla a mitad (p. ej. el segundo `save`) no deja nada escrito: ni movimiento, ni saldos, ni contador consumido — test en Task 4.
2. Anular un movimiento vuelve la factura, la OCP y el origen al estado anterior (el origen deja de estar "pagado") — test en Task 4.
3. En ventas, marcar como cobrada una factura sigue cerrando la cadena (`cerrarCadena`) y deshacerlo la reabre — test en Task 5.
4. Factura de proveedor en USD con detracción: el impuesto queda en S/ redondeado a entero y el neto en USD descuenta el equivalente — test en Task 2.
5. El cruce SIRE normaliza el número (ceros a la izquierda) y la serie (mayúsculas/espacios) antes de comparar — test en Task 7.

## Estructura de archivos

**Backend — crear:** `src/utils/transaccion.js`, `src/utils/errorHttp.js`, `src/utils/codigos.js`, `src/utils/impuesto.js`, `src/utils/saldosTesoreria.js`, `src/utils/conciliacionSire.js`, `src/utils/sireParser.js`, `src/services/sireHub.service.js`, `src/middleware/puedeTesoreria.js`, `src/models/CuentaTesoreria.js`, `src/models/Configuracion.js`, `src/models/impuestoSchema.js`, `src/models/FacturaProveedor.js`, `src/models/MovimientoTesoreria.js`, `src/models/PropuestaSire.js`, `src/routes/cuentasTesoreria.js`, `src/routes/configuracion.js`, `src/routes/facturasProveedor.js`, `src/routes/movimientosTesoreria.js`, `src/routes/tesoreria.js`, `src/routes/sire.js`, `src/scripts/prepararTesoreria.js`, `test/fixtures/` y un `test/*.test.js` por task.
**Backend — modificar:** `package.json`, `src/index.js`, `test/helpers.js`, `test/escenarios.js`, `src/middleware/upload.js`, `src/models/Factura.js`, `src/models/OrdenCompraProveedor.js`, `src/utils/sincronizarEstadoCadena.js`, `src/routes/facturas.js`, `src/routes/ordenesCompraProveedor.js`, `src/routes/requerimientos.js`, `src/routes/serviciosExternos.js`.
**Frontend — crear:** `src/utils/tesoreria.js` (+ `tesoreria.test.js`), `src/pages/Tesoreria.jsx`, `src/components/tesoreria/` (`TablaPorPagar.jsx`, `TablaPorCobrar.jsx`, `TablaMovimientos.jsx`, `PanelSire.jsx`, `PanelConfiguracion.jsx`, `ModalFacturaProveedor.jsx`, `ModalMovimiento.jsx`, `ModalImpuestoVenta.jsx`).
**Frontend — modificar:** `src/App.jsx`, `src/components/Sidebar.jsx`, `src/pages/ListaFacturas.jsx`, `src/components/DetalleFactura.jsx`, `src/pages/Requerimientos.jsx`.

---

## BACKEND

### Task 0: MongoDB local como replica set `rs0` (entorno — requiere confirmación del usuario)

**Files:** ninguno del repo. Cambia `mongod.cfg` del servicio MongoDB de Windows.

- [ ] **Step 1: Pedir confirmación** al usuario antes de tocar el servicio (reinicia MongoDB; las apps conectadas se desconectan unos segundos).
- [ ] **Step 2: Localizar el archivo de configuración**

Run (PowerShell como administrador): `Get-CimInstance Win32_Service -Filter "Name='MongoDB'" | Select-Object PathName`
Expected: una ruta con `--config "C:\Program Files\MongoDB\Server\8.2\bin\mongod.cfg"` (o similar).

- [ ] **Step 3: Agregar el replica set** — en ese `mongod.cfg` agregar al final (respetar indentación YAML de 2 espacios):
```yaml
replication:
  replSetName: rs0
```
- [ ] **Step 4: Reiniciar e iniciar el replica set**

Run: `Restart-Service MongoDB` y luego
`mongosh --quiet --eval "try { rs.status().ok } catch (e) { rs.initiate({ _id: 'rs0', members: [{ _id: 0, host: 'localhost:27017' }] }).ok }"`
Expected: `1`.

- [ ] **Step 5: Verificar desde Node**

Run: `cd Backend && node -e "import('mongoose').then(async m=>{await m.default.connect('mongodb://localhost:27017/sipapp-intales?replicaSet=rs0');console.log((await m.default.connection.db.admin().command({hello:1})).setName);process.exit(0)})"`
Expected: `rs0`.

- [ ] **Step 6: Actualizar `.env` de desarrollo** (no versionado): `MONGO_URI=mongodb://localhost:27017/sipapp-intales?replicaSet=rs0`. Ledger: anotar que la guía de instalación on-premise debe incluir estos mismos pasos.

---

### Task 1: Infraestructura — transacción, errores, códigos atómicos, cuentas y configuración

**Files:**
- Create: `Backend/src/utils/transaccion.js`, `Backend/src/utils/errorHttp.js`, `Backend/src/utils/codigos.js`, `Backend/src/middleware/puedeTesoreria.js`, `Backend/src/models/CuentaTesoreria.js`, `Backend/src/models/Configuracion.js`, `Backend/src/routes/cuentasTesoreria.js`, `Backend/src/routes/configuracion.js`
- Modify: `Backend/test/helpers.js` (URI con replica set), `Backend/src/index.js`
- Test: `Backend/test/infraTesoreria.test.js`

**Interfaces:**
- Produces: `conTransaccion(fn: (session) => Promise<T>) → Promise<T>`; `errorHttp(status, mensaje) → Error`; `siguienteCodigo(prefijo, session) → Promise<"PREFIJO-NNNN">`; `puedeTesoreria`, `soloJefaturaAdmin`; modelos `CuentaTesoreria { nombre, tipo: banco|caja|detracciones, moneda: PEN|USD, activo }`, `Configuracion { clave: "general", esAgenteRetencion }` con estático `Configuracion.obtener(session?)`; rutas `GET/POST/PUT /api/cuentas-tesoreria`, `GET/PUT /api/configuracion`.

- [ ] **Step 1: URI de test con replica set** — en `Backend/test/helpers.js` cambiar la constante:
```js
const URI = process.env.MONGO_URI_TEST || "mongodb://localhost:27017/sipapp-intales-test?replicaSet=rs0";
```

- [ ] **Step 2: Escribir el test que falla**

`Backend/test/infraTesoreria.test.js`:
```js
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { conectar, desconectar, limpiar, levantar } from "./helpers.js";
import { conTransaccion } from "../src/utils/transaccion.js";
import { errorHttp } from "../src/utils/errorHttp.js";
import { siguienteCodigo } from "../src/utils/codigos.js";
import CuentaTesoreria from "../src/models/CuentaTesoreria.js";
import Counter from "../src/models/Counter.js";
import cuentasRoutes from "../src/routes/cuentasTesoreria.js";
import configuracionRoutes from "../src/routes/configuracion.js";

let srv;
before(async () => { await conectar(); srv = await levantar({ "/api/cuentas-tesoreria": cuentasRoutes, "/api/configuracion": configuracionRoutes }); });
after(async () => { await srv.cerrar(); await desconectar(); });
beforeEach(limpiar);

test("siguienteCodigo es correlativo por prefijo", async () => {
  assert.equal(await siguienteCodigo("FP"), "FP-0001");
  assert.equal(await siguienteCodigo("FP"), "FP-0002");
  assert.equal(await siguienteCodigo("MOV"), "MOV-0001");
});

test("conTransaccion revierte todo (incluido el contador) si algo falla", async () => {
  await assert.rejects(conTransaccion(async (session) => {
    await siguienteCodigo("FP", session);
    await new CuentaTesoreria({ nombre: "Caja", tipo: "caja", moneda: "PEN" }).save({ session });
    throw errorHttp(400, "falla a propósito");
  }), /falla a propósito/);
  assert.equal(await CuentaTesoreria.countDocuments(), 0);
  assert.equal(await Counter.countDocuments({ _id: "codigo-FP" }), 0);
});

test("cuentas: jefatura crea, facturacion lista, vendedor no entra", async () => {
  const ok = await srv.api("POST", "/api/cuentas-tesoreria", { body: { nombre: "BCP Soles", tipo: "banco", moneda: "PEN" }, rol: "jefatura" });
  assert.equal(ok.status, 201);
  assert.equal((await srv.api("POST", "/api/cuentas-tesoreria", { body: { nombre: "X", tipo: "banco", moneda: "PEN" }, rol: "facturacion" })).status, 403);
  assert.equal((await srv.api("GET", "/api/cuentas-tesoreria", { rol: "facturacion" })).data.length, 1);
  assert.equal((await srv.api("GET", "/api/cuentas-tesoreria", { rol: "vendedor" })).status, 403);
  assert.equal((await srv.api("POST", "/api/cuentas-tesoreria", { body: { nombre: "Y", tipo: "otro", moneda: "PEN" } })).status, 400);
});

test("configuración: agente de retención apagado por defecto y editable por jefatura", async () => {
  assert.equal((await srv.api("GET", "/api/configuracion", { rol: "facturacion" })).data.esAgenteRetencion, false);
  const r = await srv.api("PUT", "/api/configuracion", { body: { esAgenteRetencion: true }, rol: "jefatura" });
  assert.equal(r.data.esAgenteRetencion, true);
  assert.equal((await srv.api("PUT", "/api/configuracion", { body: { esAgenteRetencion: false }, rol: "facturacion" })).status, 403);
});
```

- [ ] **Step 3: Correr y verificar que falla** — Run: `cd Backend && node --test test/infraTesoreria.test.js` — Expected: FAIL `Cannot find module '../src/utils/transaccion.js'`.

- [ ] **Step 4: Implementar**

`Backend/src/utils/errorHttp.js`:
```js
// Error de negocio con status HTTP: el handler global responde su mensaje tal cual.
export function errorHttp(status, mensaje) {
  return Object.assign(new Error(mensaje), { status });
}
```

`Backend/src/utils/transaccion.js`:
```js
import mongoose from "mongoose";

// Todo lo que mueve dinero corre aquí: o se escribe completo o no se escribe
// nada. Requiere que MongoDB sea replica set (rs0), también en el servidor
// del cliente — ver spec 2026-09-28-tesoreria-b1-design.md.
export async function conTransaccion(fn) {
  const session = await mongoose.startSession();
  try {
    let resultado;
    await session.withTransaction(async () => { resultado = await fn(session); });
    return resultado;
  } finally {
    await session.endSession();
  }
}
```

`Backend/src/utils/codigos.js`:
```js
import Counter from "../models/Counter.js";

// Correlativo atómico por prefijo. Dentro de una transacción el incremento se
// revierte junto con lo demás si la transacción aborta.
export async function siguienteCodigo(prefijo, session) {
  const c = await Counter.findByIdAndUpdate(
    `codigo-${prefijo}`,
    { $inc: { seq: 1 } },
    { new: true, upsert: true, session }
  );
  return `${prefijo}-${String(c.seq).padStart(4, "0")}`;
}
```

`Backend/src/middleware/puedeTesoreria.js`:
```js
// Tesorería (decisión del usuario, 2026-09-28): facturación + jefatura + admin.
export const ROLES_TESORERIA = ["facturacion", "jefatura", "admin"];

export default function puedeTesoreria(req, res, next) {
  if (!ROLES_TESORERIA.includes(req.usuario.rol)) {
    return res.status(403).json({ mensaje: "No tienes permiso para operar Tesorería." });
  }
  next();
}

export function soloJefaturaAdmin(req, res, next) {
  if (!["jefatura", "admin"].includes(req.usuario.rol)) {
    return res.status(403).json({ mensaje: "Solo jefatura o admin pueden cambiar esta configuración." });
  }
  next();
}
```

`Backend/src/models/CuentaTesoreria.js`:
```js
import mongoose from "mongoose";

// De dónde sale o a dónde entra el dinero. B2 la mapeará a la cuenta 10x.
const cuentaTesoreriaSchema = new mongoose.Schema(
  {
    nombre: { type: String, required: true, trim: true },
    tipo: { type: String, enum: ["banco", "caja", "detracciones"], required: true },
    moneda: { type: String, enum: ["PEN", "USD"], default: "PEN" },
    activo: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export default mongoose.model("CuentaTesoreria", cuentaTesoreriaSchema);
```

`Backend/src/models/Configuracion.js`:
```js
import mongoose from "mongoose";

// Documento único de configuración de la empresa.
const configuracionSchema = new mongoose.Schema(
  {
    clave: { type: String, default: "general", unique: true },
    // Si SUNAT designó a INTALES agente de retención del IGV: habilita la
    // retención del 3 % al registrar facturas de proveedor.
    esAgenteRetencion: { type: Boolean, default: false },
  },
  { timestamps: true }
);

configuracionSchema.statics.obtener = function (session) {
  return this.findOneAndUpdate(
    { clave: "general" },
    { $setOnInsert: { clave: "general" } },
    { new: true, upsert: true, session }
  );
};

export default mongoose.model("Configuracion", configuracionSchema);
```

`Backend/src/routes/cuentasTesoreria.js`:
```js
import { Router } from "express";
import authMiddleware from "../middleware/authMiddleware.js";
import puedeTesoreria, { soloJefaturaAdmin } from "../middleware/puedeTesoreria.js";
import CuentaTesoreria from "../models/CuentaTesoreria.js";

const router = Router();
router.use(authMiddleware, puedeTesoreria);

const TIPOS = ["banco", "caja", "detracciones"];

router.get("/", async (req, res, next) => {
  try {
    res.json(await CuentaTesoreria.find().sort({ nombre: 1 }));
  } catch (err) { next(err); }
});

router.post("/", soloJefaturaAdmin, async (req, res, next) => {
  try {
    const nombre = String(req.body.nombre || "").trim();
    if (!nombre) return res.status(400).json({ mensaje: "Falta el nombre" });
    if (!TIPOS.includes(req.body.tipo)) return res.status(400).json({ mensaje: "Tipo de cuenta inválido" });
    if (!["PEN", "USD"].includes(req.body.moneda)) return res.status(400).json({ mensaje: "Moneda inválida" });
    const cuenta = await new CuentaTesoreria({ nombre, tipo: req.body.tipo, moneda: req.body.moneda }).save();
    res.status(201).json(cuenta);
  } catch (err) { next(err); }
});

router.put("/:id", soloJefaturaAdmin, async (req, res, next) => {
  try {
    const update = {};
    if (req.body.nombre !== undefined) {
      const nombre = String(req.body.nombre).trim();
      if (!nombre) return res.status(400).json({ mensaje: "El nombre no puede quedar vacío" });
      update.nombre = nombre;
    }
    if (req.body.activo !== undefined) update.activo = !!req.body.activo;
    const cuenta = await CuentaTesoreria.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!cuenta) return res.status(404).json({ mensaje: "Cuenta no encontrada" });
    res.json(cuenta);
  } catch (err) { next(err); }
});

export default router;
```

`Backend/src/routes/configuracion.js`:
```js
import { Router } from "express";
import authMiddleware from "../middleware/authMiddleware.js";
import puedeTesoreria, { soloJefaturaAdmin } from "../middleware/puedeTesoreria.js";
import Configuracion from "../models/Configuracion.js";

const router = Router();
router.use(authMiddleware, puedeTesoreria);

router.get("/", async (req, res, next) => {
  try {
    res.json(await Configuracion.obtener());
  } catch (err) { next(err); }
});

router.put("/", soloJefaturaAdmin, async (req, res, next) => {
  try {
    const config = await Configuracion.obtener();
    if (req.body.esAgenteRetencion !== undefined) config.esAgenteRetencion = !!req.body.esAgenteRetencion;
    await config.save();
    res.json(config);
  } catch (err) { next(err); }
});

export default router;
```

En `Backend/src/index.js`, junto a las rutas de Compras:
```js
import cuentasTesoreriaRoutes from "./routes/cuentasTesoreria.js";
import configuracionRoutes from "./routes/configuracion.js";
```
```js
app.use("/api/cuentas-tesoreria", cuentasTesoreriaRoutes);
app.use("/api/configuracion", configuracionRoutes);
```

- [ ] **Step 5: Correr** — Run: `cd Backend && npm test` — Expected: PASS (todas, incluidas las 46 anteriores).

- [ ] **Step 6: Commit**
```bash
git -C Backend add test/helpers.js test/infraTesoreria.test.js src/utils/transaccion.js src/utils/errorHttp.js src/utils/codigos.js src/middleware/puedeTesoreria.js src/models/CuentaTesoreria.js src/models/Configuracion.js src/routes/cuentasTesoreria.js src/routes/configuracion.js src/index.js
git -C Backend commit -m "feat(tesoreria): transacciones, códigos atómicos, cuentas de tesorería y configuración" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Cálculo de impuesto y partes (neto / impuesto)

**Files:**
- Create: `Backend/src/utils/impuesto.js`, `Backend/src/models/impuestoSchema.js`
- Test: `Backend/test/impuesto.test.js`

**Interfaces:**
- Produces:
  - `impuestoSchema` (sub-schema `_id:false`: `tipo`, `codigoSunat`, `tasa`, `monto`, `quienDeposita`).
  - `calcularImpuesto({ tipo, codigoSunat, total, moneda, tipoCambio }) → { tasa, monto }` (monto en S/; detracción entera; retención 2 decimales). Lanza `errorHttp(400)` si el código no existe o no tiene porcentaje.
  - `partes({ lado: "compra"|"venta", total, moneda, tipoCambio, impuesto }) → { neto, impuesto }` (neto en la moneda del documento, impuesto en S/).
  - `tipoMovimientoEsperado({ lado, concepto, impuesto }) → "egreso"|"ingreso"|"transferencia"|"retencion"`.
  - `UMBRAL_IMPUESTO = 700`, `TASA_RETENCION = 0.03`, `round2`.

- [ ] **Step 1: Escribir el test que falla**

`Backend/test/impuesto.test.js`:
```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { calcularImpuesto, partes, tipoMovimientoEsperado } from "../src/utils/impuesto.js";

const det = (quienDeposita, monto = 142) => ({ tipo: "detraccion", codigoSunat: "037", tasa: 0.12, monto, quienDeposita });

test("detracción: 12 % del total, redondeado a entero en soles", () => {
  assert.deepEqual(calcularImpuesto({ tipo: "detraccion", codigoSunat: "037", total: 1180 }), { tasa: 0.12, monto: 142 });
  assert.equal(calcularImpuesto({ tipo: "detraccion", codigoSunat: "037", total: 1187.5 }).monto, 143); // 142.5 → 143
  assert.equal(calcularImpuesto({ tipo: "detraccion", codigoSunat: "027", total: 1000 }).monto, 40);
});

test("detracción en USD se calcula sobre el total en soles", () => {
  assert.equal(calcularImpuesto({ tipo: "detraccion", codigoSunat: "037", total: 1000, moneda: "USD", tipoCambio: 3.8 }).monto, 456);
});

test("retención 3 % a dos decimales; código de detracción inválido → error 400", () => {
  assert.deepEqual(calcularImpuesto({ tipo: "retencion", total: 1180 }), { tasa: 0.03, monto: 35.4 });
  assert.throws(() => calcularImpuesto({ tipo: "detraccion", codigoSunat: "999", total: 1000 }), (e) => e.status === 400);
  assert.deepEqual(calcularImpuesto({ tipo: "ninguno", total: 1000 }), { tasa: 0, monto: 0 });
});

test("los 6 casos de la tabla de la spec", () => {
  assert.deepEqual(partes({ lado: "compra", total: 1180, impuesto: det("nosotros") }), { neto: 1038, impuesto: 142 });
  assert.deepEqual(partes({ lado: "compra", total: 1180, impuesto: det("proveedor") }), { neto: 1180, impuesto: 0 });
  assert.deepEqual(partes({ lado: "venta", total: 1180, impuesto: det("cliente") }), { neto: 1038, impuesto: 142 });
  assert.deepEqual(partes({ lado: "venta", total: 1180, impuesto: det("nosotros") }), { neto: 1180, impuesto: 142 });
  const retVenta = { tipo: "retencion", tasa: 0.03, monto: 35.4, quienDeposita: "cliente" };
  assert.deepEqual(partes({ lado: "venta", total: 1180, impuesto: retVenta }), { neto: 1144.6, impuesto: 35.4 });
  const retCompra = { tipo: "retencion", tasa: 0.03, monto: 35.4, quienDeposita: "nosotros" };
  assert.deepEqual(partes({ lado: "compra", total: 1180, impuesto: retCompra }), { neto: 1144.6, impuesto: 35.4 });
});

test("compra en USD con detracción: el neto en USD descuenta el equivalente", () => {
  assert.deepEqual(partes({ lado: "compra", total: 1000, moneda: "USD", tipoCambio: 3.8, impuesto: det("nosotros", 456) }), { neto: 880, impuesto: 456 });
});

test("sin impuesto el neto es el total", () => {
  assert.deepEqual(partes({ lado: "compra", total: 500, impuesto: { tipo: "ninguno", monto: 0 } }), { neto: 500, impuesto: 0 });
});

test("tipo de movimiento según lado, parte y quién deposita", () => {
  assert.equal(tipoMovimientoEsperado({ lado: "compra", concepto: "impuesto", impuesto: det("nosotros") }), "egreso");
  assert.equal(tipoMovimientoEsperado({ lado: "venta", concepto: "neto", impuesto: det("cliente") }), "ingreso");
  assert.equal(tipoMovimientoEsperado({ lado: "venta", concepto: "impuesto", impuesto: det("cliente") }), "ingreso");
  assert.equal(tipoMovimientoEsperado({ lado: "venta", concepto: "impuesto", impuesto: det("nosotros") }), "transferencia");
  assert.equal(tipoMovimientoEsperado({ lado: "venta", concepto: "impuesto", impuesto: { tipo: "retencion", quienDeposita: "cliente" } }), "retencion");
});
```

- [ ] **Step 2: Correr y verificar que falla** — Run: `cd Backend && node --test test/impuesto.test.js` — Expected: FAIL `Cannot find module '../src/utils/impuesto.js'`.

- [ ] **Step 3: Implementar**

`Backend/src/models/impuestoSchema.js`:
```js
import mongoose from "mongoose";

// Detracción o retención de un comprobante. `monto` siempre en S/.
// quienDeposita: compras → nosotros | proveedor; ventas → cliente | nosotros.
export const impuestoSchema = new mongoose.Schema(
  {
    tipo: { type: String, enum: ["ninguno", "detraccion", "retencion"], default: "ninguno" },
    codigoSunat: { type: String, default: "" },
    tasa: { type: Number, default: 0 },
    monto: { type: Number, default: 0 },
    quienDeposita: { type: String, enum: ["nosotros", "proveedor", "cliente"], default: "nosotros" },
  },
  { _id: false }
);
```

`Backend/src/utils/impuesto.js`:
```js
import { DETRACCION_BIENES_SERVICIOS } from "./catalogos.js";
import { errorHttp } from "./errorHttp.js";

export const UMBRAL_IMPUESTO = 700;
export const TASA_RETENCION = 0.03;
export const round2 = (n) => Math.round(Number(n) * 100) / 100;

export function calcularImpuesto({ tipo, codigoSunat, total, moneda = "PEN", tipoCambio = 1 }) {
  if (!tipo || tipo === "ninguno") return { tasa: 0, monto: 0 };
  const totalSoles = moneda === "USD" ? Number(total) * Number(tipoCambio) : Number(total);
  if (tipo === "detraccion") {
    const bien = DETRACCION_BIENES_SERVICIOS.find((c) => c.codigo === codigoSunat);
    if (!bien?.porcentaje) throw errorHttp(400, `Código de detracción inválido: ${codigoSunat || "(vacío)"}`);
    const tasa = bien.porcentaje / 100;
    // SUNAT: el depósito va sin decimales; .5 o más sube. round2 primero para
    // que el error binario (1187.5 × 0.12 = 142.4999…) no baje el redondeo.
    return { tasa, monto: Math.round(round2(totalSoles * tasa)) };
  }
  if (tipo === "retencion") return { tasa: TASA_RETENCION, monto: round2(totalSoles * TASA_RETENCION) };
  throw errorHttp(400, "Tipo de impuesto inválido");
}

// ¿El impuesto se descuenta de lo que se paga/cobra al tercero? En compras
// cuando deposita INTALES (o retiene); en ventas cuando deposita/retiene el cliente.
function seDescuenta(lado, quienDeposita) {
  return lado === "compra" ? quienDeposita === "nosotros" : quienDeposita === "cliente";
}

export function partes({ lado, total, moneda = "PEN", tipoCambio = 1, impuesto }) {
  if (!impuesto || impuesto.tipo === "ninguno" || !impuesto.monto) return { neto: round2(total), impuesto: 0 };
  const enMonedaDoc = moneda === "USD" ? impuesto.monto / Number(tipoCambio) : impuesto.monto;
  const neto = seDescuenta(lado, impuesto.quienDeposita) ? round2(total - enMonedaDoc) : round2(total);
  // Si el proveedor se autodetrae, INTALES no mueve dinero por el impuesto.
  const parteImpuesto = lado === "compra" && impuesto.quienDeposita === "proveedor" ? 0 : impuesto.monto;
  return { neto, impuesto: parteImpuesto };
}

export function tipoMovimientoEsperado({ lado, concepto, impuesto }) {
  if (lado === "compra") return "egreso";
  if (concepto === "neto") return "ingreso";
  if (impuesto.tipo === "retencion") return "retencion";
  return impuesto.quienDeposita === "cliente" ? "ingreso" : "transferencia";
}
```

- [ ] **Step 4: Correr** — Run: `cd Backend && npm test` — Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git -C Backend add src/utils/impuesto.js src/models/impuestoSchema.js test/impuesto.test.js
git -C Backend commit -m "feat(tesoreria): cálculo de detracción/retención y partes neto/impuesto" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 3: Facturas de proveedor (con OCP, sin OC, flete) y bloqueo de anular OCP

**Files:**
- Create: `Backend/src/models/FacturaProveedor.js`, `Backend/src/models/MovimientoTesoreria.js`, `Backend/src/utils/saldosTesoreria.js`, `Backend/src/routes/facturasProveedor.js`
- Modify: `Backend/src/models/OrdenCompraProveedor.js`, `Backend/src/middleware/upload.js`, `Backend/src/routes/ordenesCompraProveedor.js`, `Backend/src/utils/compras.js`, `Backend/src/index.js`, `Backend/test/escenarios.js`, `Backend/test/ordenesCompraProveedor.test.js`
- Test: `Backend/test/facturasProveedor.test.js`

**Interfaces:**
- Consumes: `conTransaccion`, `errorHttp`, `siguienteCodigo`, `Configuracion.obtener` (Task 1); `calcularImpuesto`, `partes`, `round2`, `impuestoSchema` (Task 2); OCP de la Spec A.
- Produces:
  - Modelos `FacturaProveedor` (campos de la spec, `anulada` en vez de `anulado`) y `MovimientoTesoreria` (campos de la spec; `documento: { tipo, id, cuotaId }`).
  - `OrdenCompraProveedor.montoFacturado`, `saldoPorFacturar` (base sin IGV, sin flete).
  - En `utils/saldosTesoreria.js`: `pagadoPorConcepto(tipoDoc, id, session) → { neto, impuesto }`, `recalcularFacturaProveedor(fp, session)`, `aplicarFlete(fp, signo, session)`, `sincronizarOCP(ocpId, session)`.
  - `POST /api/facturas-proveedor` body `{ ordenCompraProveedor?, esFleteDe?, proveedor?, tipoComprobante, serie, numero, fechaEmision, moneda?, tipoCambio?, subtotal, igv, flete?, condicion, fechaVencimiento?, impuesto: { tipo, codigoSunat?, quienDeposita? }, centroCosto?, ordenTrabajo? }`; `GET /`, `GET /:id`, `PATCH /:id/anular { motivo }`, `POST /:id/archivos`, `DELETE /:id/archivos/:archivoId`.
  - `test/escenarios.js`: `escenarioOCP(srv)` → `{ base, ocp }` (OCP en PEN, 2 líneas: 1 × 100 y 2 × 100 → subtotal 300).

- [ ] **Step 1: Escenario compartido** — al final de `Backend/test/escenarios.js` agregar:
```js
// OCP adjudicada a A en soles: línea 1 = 1 × 100, línea 2 = 2 × 100 (subtotal 300).
export async function escenarioOCP(srv) {
  const base = await escenarioBase({ lineas: 2 });
  const lic = await crearLicitacion(srv, base);
  const r = await srv.api("POST", `/api/licitaciones/${lic._id}/adjudicar`, {
    body: { ordenes: [{ proveedorId: lic.proveedores[0]._id, moneda: "PEN", formaPago: "Factura a 30 días",
      items: lic.items.map((it) => ({ itemId: it._id, cantidad: it.cantidad, precioUnitario: 100 })) }] },
  });
  if (r.status !== 201) throw new Error(`No se pudo adjudicar: ${JSON.stringify(r.data)}`);
  return { base, ocp: r.data[0] };
}
```

- [ ] **Step 2: Escribir el test que falla**

`Backend/test/facturasProveedor.test.js`:
```js
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { conectar, desconectar, limpiar, levantar } from "./helpers.js";
import { escenarioOCP } from "./escenarios.js";
import licitacionesRoutes from "../src/routes/licitaciones.js";
import facturasProveedorRoutes from "../src/routes/facturasProveedor.js";
import ordenesCompraProveedorRoutes from "../src/routes/ordenesCompraProveedor.js";
import OrdenCompraProveedor from "../src/models/OrdenCompraProveedor.js";
import Requerimiento from "../src/models/Requerimiento.js";

let srv;
before(async () => {
  await conectar();
  srv = await levantar({
    "/api/licitaciones": licitacionesRoutes,
    "/api/facturas-proveedor": facturasProveedorRoutes,
    "/api/ordenes-compra-proveedor": ordenesCompraProveedorRoutes,
  });
});
after(async () => { await srv.cerrar(); await desconectar(); });
beforeEach(limpiar);

const factura = (ocp, extra = {}) => ({
  ordenCompraProveedor: ocp._id, tipoComprobante: "01", serie: "F001", numero: "123",
  fechaEmision: "2026-09-28", subtotal: 300, igv: 54, condicion: "credito", fechaVencimiento: "2026-10-28",
  impuesto: { tipo: "detraccion", codigoSunat: "037", quienDeposita: "nosotros" }, ...extra,
});

test("registra una factura de la OCP con detracción y actualiza lo facturado", async () => {
  const { ocp } = await escenarioOCP(srv);
  const r = await srv.api("POST", "/api/facturas-proveedor", { body: factura(ocp), rol: "facturacion" });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  assert.equal(r.data.codigo, "FP-0001");
  assert.equal(r.data.total, 354);
  assert.equal(r.data.impuesto.monto, 42);
  assert.equal(r.data.netoAPagar, 312);
  assert.equal(r.data.saldoImpuesto, 42);
  assert.equal(r.data.estado, "pendiente");
  const o = await OrdenCompraProveedor.findById(ocp._id);
  assert.equal(o.montoFacturado, 300);
  assert.equal(o.saldoPorFacturar, 0);
  assert.equal((await srv.api("POST", "/api/facturas-proveedor", { body: factura(ocp), rol: "vendedor" })).status, 403);
});

test("no permite facturar por encima de la OCP ni repetir el comprobante (con ceros a la izquierda)", async () => {
  const { ocp } = await escenarioOCP(srv);
  await srv.api("POST", "/api/facturas-proveedor", { body: factura(ocp, { subtotal: 200, igv: 36 }) });
  const excede = await srv.api("POST", "/api/facturas-proveedor", { body: factura(ocp, { numero: "124", subtotal: 150, igv: 27 }) });
  assert.equal(excede.status, 400);
  const dup = await srv.api("POST", "/api/facturas-proveedor", { body: factura(ocp, { numero: "000123", subtotal: 50, igv: 9 }) });
  assert.equal(dup.status, 400);
});

test("sin OC exige centro de costo; retención exige ser agente", async () => {
  const { base } = await escenarioOCP(srv);
  const sinOc = { proveedor: base.provB._id, tipoComprobante: "01", serie: "E001", numero: "9", fechaEmision: "2026-09-28", subtotal: 100, igv: 18, condicion: "contado", impuesto: { tipo: "ninguno" } };
  assert.equal((await srv.api("POST", "/api/facturas-proveedor", { body: sinOc })).status, 400);
  const ok = await srv.api("POST", "/api/facturas-proveedor", { body: { ...sinOc, centroCosto: base.centro._id } });
  assert.equal(ok.status, 201);
  const ret = await srv.api("POST", "/api/facturas-proveedor", { body: { ...sinOc, numero: "10", centroCosto: base.centro._id, subtotal: 1000, igv: 180, impuesto: { tipo: "retencion" } } });
  assert.equal(ret.status, 400);
});

test("el flete de la factura se reparte en el costo de las líneas y se revierte al anular", async () => {
  const { base, ocp } = await escenarioOCP(srv);
  const r = await srv.api("POST", "/api/facturas-proveedor", { body: factura(ocp, { subtotal: 330, igv: 59.4, flete: 30 }) });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  let rq = await Requerimiento.findById(base.rq._id);
  assert.deepEqual(rq.items.map((i) => i.costoTransporte), [10, 20]);
  const anul = await srv.api("PATCH", `/api/facturas-proveedor/${r.data._id}/anular`, { body: { motivo: "Error de digitación" } });
  assert.equal(anul.status, 200);
  rq = await Requerimiento.findById(base.rq._id);
  assert.deepEqual(rq.items.map((i) => i.costoTransporte), [0, 0]);
  assert.equal((await OrdenCompraProveedor.findById(ocp._id)).montoFacturado, 0);
});

test("factura de un transportista por el flete de la OCP", async () => {
  const { base, ocp } = await escenarioOCP(srv);
  const r = await srv.api("POST", "/api/facturas-proveedor", {
    body: { esFleteDe: ocp._id, proveedor: base.provB._id, tipoComprobante: "01", serie: "T001", numero: "5", fechaEmision: "2026-09-28", subtotal: 60, igv: 10.8, condicion: "contado", impuesto: { tipo: "ninguno" } },
  });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  const rq = await Requerimiento.findById(base.rq._id);
  assert.deepEqual(rq.items.map((i) => i.costoTransporte), [20, 40]);
  assert.equal((await OrdenCompraProveedor.findById(ocp._id)).montoFacturado, 0);
});

test("anular una OCP con facturas vigentes se bloquea", async () => {
  const { ocp } = await escenarioOCP(srv);
  await srv.api("POST", "/api/facturas-proveedor", { body: factura(ocp) });
  const r = await srv.api("PATCH", `/api/ordenes-compra-proveedor/${ocp._id}/anular`, { body: { motivo: "x" } });
  assert.equal(r.status, 400);
  assert.match(r.data.mensaje, /facturas/);
});
```

En `Backend/test/ordenesCompraProveedor.test.js` **reemplazar** el test `"anular con el origen ya pagado → 400 y no toca nada"` completo por (la regla cambia: el bloqueo es por factura, spec B1):
```js
test("anular una OCP sin facturas sigue permitido aunque el origen figure pagado por el flujo anterior", async () => {
  const { base, ocp } = await escenarioAdjudicado();
  await Requerimiento.updateOne({ _id: base.rq._id }, { $set: { "items.0.estadoPago": "pagado" } });
  const r = await srv.api("PATCH", `/api/ordenes-compra-proveedor/${ocp._id}/anular`, { body: { motivo: "Error" } });
  assert.equal(r.status, 200);
});
```

- [ ] **Step 3: Correr y verificar que falla** — Run: `cd Backend && npm test` — Expected: FAIL (`Cannot find module '../src/routes/facturasProveedor.js'`).

- [ ] **Step 4: Modelos**

`Backend/src/models/MovimientoTesoreria.js`:
```js
import mongoose from "mongoose";

// Libro único de dinero de Tesorería. Nunca se borra: se anula con motivo y
// los saldos del documento se recalculan en la misma transacción.
const movimientoTesoreriaSchema = new mongoose.Schema(
  {
    codigo: { type: String, unique: true },
    tipo: { type: String, enum: ["egreso", "ingreso", "transferencia", "retencion"], required: true },
    fecha: { type: Date, required: true },
    monto: { type: Number, required: true, min: 0.01 },
    moneda: { type: String, enum: ["PEN", "USD"], default: "PEN" },
    tipoCambio: { type: Number, default: 1 },
    cuenta: { type: mongoose.Schema.Types.ObjectId, ref: "CuentaTesoreria", default: null },
    cuentaDestino: { type: mongoose.Schema.Types.ObjectId, ref: "CuentaTesoreria", default: null },
    medio: { type: String, enum: ["transferencia", "deposito", "efectivo", "cheque", "comprobante_retencion"], required: true },
    numeroOperacion: { type: String, default: "", trim: true },
    concepto: { type: String, enum: ["neto", "impuesto"], required: true },
    documento: {
      tipo: { type: String, enum: ["facturaProveedor", "facturaVenta"], required: true },
      id: { type: mongoose.Schema.Types.ObjectId, required: true },
      cuotaId: { type: mongoose.Schema.Types.ObjectId, default: null },
    },
    registradoPor: { type: String, default: "" },
    anulado: { type: Boolean, default: false },
    motivoAnulacion: { type: String, default: "" },
    anuladoPor: { type: String, default: "" },
    fechaAnulacion: { type: Date, default: null },
  },
  { timestamps: true }
);

movimientoTesoreriaSchema.index({ "documento.tipo": 1, "documento.id": 1 });

export default mongoose.model("MovimientoTesoreria", movimientoTesoreriaSchema);
```

`Backend/src/models/FacturaProveedor.js`:
```js
import mongoose from "mongoose";
import { impuestoSchema } from "./impuestoSchema.js";

const archivoSchema = new mongoose.Schema({
  nombre: { type: String, required: true },
  url: { type: String, required: true },
  mimetype: { type: String, default: "" },
  tamano: { type: Number, default: 0 },
  subidoPor: { type: String, default: "" },
  fecha: { type: Date, default: Date.now },
});

// Comprobante del proveedor. Los saldos son derivados: los recalcula
// saldosTesoreria.recalcularFacturaProveedor() dentro de cada transacción.
const facturaProveedorSchema = new mongoose.Schema(
  {
    codigo: { type: String, unique: true },
    tipoComprobante: { type: String, enum: ["01", "02", "03"], required: true },
    serie: { type: String, required: true, trim: true, uppercase: true },
    numero: { type: String, required: true, trim: true },
    fechaEmision: { type: Date, required: true },
    proveedor: { type: mongoose.Schema.Types.ObjectId, ref: "Empresa", required: true },
    proveedorRuc: { type: String, default: "" },
    proveedorRazonSocial: { type: String, default: "" },
    ordenCompraProveedor: { type: mongoose.Schema.Types.ObjectId, ref: "OrdenCompraProveedor", default: null },
    // Factura de un transportista por el flete de esta OCP.
    esFleteDe: { type: mongoose.Schema.Types.ObjectId, ref: "OrdenCompraProveedor", default: null },
    centroCosto: { type: mongoose.Schema.Types.ObjectId, ref: "CentroCosto", default: null },
    ordenTrabajo: { type: mongoose.Schema.Types.ObjectId, ref: "OrdenTrabajo", default: null },
    moneda: { type: String, enum: ["PEN", "USD"], default: "PEN" },
    tipoCambio: { type: Number, default: 1 },
    subtotal: { type: Number, required: true },
    igv: { type: Number, default: 0 },
    total: { type: Number, required: true },
    flete: { type: Number, default: 0 }, // base sin IGV incluida en el subtotal
    condicion: { type: String, enum: ["contado", "credito"], default: "contado" },
    fechaVencimiento: { type: Date, default: null },
    impuesto: { type: impuestoSchema, default: () => ({}) },
    netoAPagar: { type: Number, default: 0 },
    pagadoNeto: { type: Number, default: 0 },
    pagadoImpuesto: { type: Number, default: 0 },
    saldoNeto: { type: Number, default: 0 },
    saldoImpuesto: { type: Number, default: 0 },
    estado: { type: String, enum: ["pendiente", "parcial", "pagada", "anulada"], default: "pendiente" },
    archivos: [archivoSchema],
    registradoPor: { type: String, default: "" },
    anulada: { type: Boolean, default: false },
    motivoAnulacion: { type: String, default: "" },
    anuladoPor: { type: String, default: "" },
    fechaAnulacion: { type: Date, default: null },
  },
  { timestamps: true }
);

facturaProveedorSchema.index(
  { proveedor: 1, tipoComprobante: 1, serie: 1, numero: 1 },
  { unique: true, partialFilterExpression: { anulada: false } }
);

export default mongoose.model("FacturaProveedor", facturaProveedorSchema);
```

En `Backend/src/models/OrdenCompraProveedor.js`, después de `total: { type: Number, default: 0 },` agregar:
```js
    // Derivados (Tesorería B1): base facturada sin IGV ni flete, y lo que falta.
    montoFacturado: { type: Number, default: 0 },
    saldoPorFacturar: { type: Number, default: null },
```

Al final de `Backend/src/middleware/upload.js` agregar:
```js
const uploadsTesoreriaDir = path.join(__dirname, "../../uploads/tesoreria");
if (!fs.existsSync(uploadsTesoreriaDir)) fs.mkdirSync(uploadsTesoreriaDir, { recursive: true });

const storageTesoreria = multer.diskStorage({
  destination: (_, __, cb) => cb(null, uploadsTesoreriaDir),
  filename: (_, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
  },
});

// PDF/imagen de las facturas de proveedor registradas en Tesorería.
export const uploadArchivoTesoreria = multer({
  storage: storageTesoreria,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_, file, cb) => {
    cb(null, extensionValida(file, EXTENSIONES_POR_MIMETYPE_OT));
  },
});
```

- [ ] **Step 5: Saldos, flete y sincronización de la OCP**

`Backend/src/utils/saldosTesoreria.js`:
```js
import MovimientoTesoreria from "../models/MovimientoTesoreria.js";
import FacturaProveedor from "../models/FacturaProveedor.js";
import OrdenCompraProveedor from "../models/OrdenCompraProveedor.js";
import SolicitudCompra from "../models/SolicitudCompra.js";
import Requerimiento from "../models/Requerimiento.js";
import ServicioExterno from "../models/ServicioExterno.js";
import { partes, round2 } from "./impuesto.js";

const TOL = 0.009;
const TOL_FACTURADO = 0.1;

export async function pagadoPorConcepto(tipoDoc, id, session) {
  const movs = await MovimientoTesoreria.find(
    { "documento.tipo": tipoDoc, "documento.id": id, anulado: false },
    "concepto monto",
    { session }
  );
  return movs.reduce((acc, m) => ({ ...acc, [m.concepto]: round2(acc[m.concepto] + m.monto) }), { neto: 0, impuesto: 0 });
}

export async function recalcularFacturaProveedor(fp, session) {
  const p = partes({ lado: "compra", total: fp.total, moneda: fp.moneda, tipoCambio: fp.tipoCambio, impuesto: fp.impuesto });
  const pag = await pagadoPorConcepto("facturaProveedor", fp._id, session);
  fp.netoAPagar = p.neto;
  fp.pagadoNeto = pag.neto;
  fp.pagadoImpuesto = pag.impuesto;
  fp.saldoNeto = round2(p.neto - pag.neto);
  fp.saldoImpuesto = round2(p.impuesto - pag.impuesto);
  if (fp.anulada) fp.estado = "anulada";
  else if (fp.saldoNeto <= TOL && fp.saldoImpuesto <= TOL) fp.estado = "pagada";
  else fp.estado = pag.neto + pag.impuesto > 0 ? "parcial" : "pendiente";
  await fp.save({ session });
}

// Reparte el flete (en S/, base sin IGV) entre las líneas de la OCP en
// proporción a su subtotal y lo suma (signo 1) o resta (signo -1) al
// costoTransporte del origen, que el reporte de costo por OT ya usa.
export async function aplicarFlete(fp, signo, session) {
  const ocpId = fp.esFleteDe || fp.ordenCompraProveedor;
  const monto = fp.esFleteDe ? fp.subtotal : fp.flete;
  if (!ocpId || !monto) return;
  const fleteSoles = fp.moneda === "USD" ? monto * fp.tipoCambio : monto;
  const ocp = await OrdenCompraProveedor.findById(ocpId, "items", { session });
  const base = ocp.items.reduce((s, it) => s + it.subtotal, 0) || 1;
  for (const it of ocp.items) {
    const parte = round2((signo * fleteSoles * it.subtotal) / base);
    const sc = await SolicitudCompra.findById(it.solicitudCompra, "origen requerimiento servicioExterno items", { session });
    const linea = sc?.items.id(it.lineaId);
    if (!linea) continue;
    if (sc.origen === "requerimiento") {
      await Requerimiento.updateOne({ _id: sc.requerimiento, "items._id": linea.origenItemId }, { $inc: { "items.$.costoTransporte": parte } }, { session });
    } else if (sc.origen === "servicio") {
      await ServicioExterno.updateOne({ _id: sc.servicioExterno }, { $inc: { costoTransporte: parte } }, { session });
    }
  }
}

// Recalcula lo facturado de la OCP y, si está completamente facturada y todas
// sus facturas pagadas, marca sus orígenes como pagados (y lo revierte si no).
export async function sincronizarOCP(ocpId, session, usuario = "") {
  const ocp = await OrdenCompraProveedor.findById(ocpId, null, { session });
  if (!ocp) return;
  const fps = await FacturaProveedor.find({ ordenCompraProveedor: ocpId, anulada: false }, null, { session });
  ocp.montoFacturado = round2(fps.reduce((s, f) => s + f.subtotal - f.flete, 0));
  ocp.saldoPorFacturar = round2(ocp.subtotal - ocp.montoFacturado);
  await ocp.save({ session });

  const pagada = fps.length > 0 && ocp.saldoPorFacturar <= TOL_FACTURADO && fps.every((f) => f.estado === "pagada");
  let fechaPago = null;
  if (pagada) {
    const ultimo = await MovimientoTesoreria.findOne(
      { "documento.tipo": "facturaProveedor", "documento.id": { $in: fps.map((f) => f._id) }, anulado: false },
      "fecha", { session }
    ).sort({ fecha: -1 });
    fechaPago = ultimo?.fecha || new Date();
  }
  const estado = pagada
    ? { estadoPago: "pagado", pagadoPor: usuario, fechaPago }
    : { estadoPago: "pendiente_pago", pagadoPor: "", fechaPago: null };

  for (const it of ocp.items) {
    const sc = await SolicitudCompra.findById(it.solicitudCompra, "origen requerimiento servicioExterno items", { session });
    const linea = sc?.items.id(it.lineaId);
    if (!linea) continue;
    if (sc.origen === "requerimiento") {
      await Requerimiento.updateOne(
        { _id: sc.requerimiento, "items._id": linea.origenItemId },
        { $set: { "items.$.estadoPago": estado.estadoPago, "items.$.pagadoPor": estado.pagadoPor, "items.$.fechaPago": estado.fechaPago } },
        { session }
      );
    } else if (sc.origen === "servicio") {
      await ServicioExterno.updateOne({ _id: sc.servicioExterno }, { $set: estado }, { session });
    }
  }
}
```

- [ ] **Step 6: Rutas de facturas de proveedor**

`Backend/src/routes/facturasProveedor.js`:
```js
import { Router } from "express";
import authMiddleware from "../middleware/authMiddleware.js";
import puedeTesoreria from "../middleware/puedeTesoreria.js";
import { uploadArchivoTesoreria } from "../middleware/upload.js";
import FacturaProveedor from "../models/FacturaProveedor.js";
import OrdenCompraProveedor from "../models/OrdenCompraProveedor.js";
import MovimientoTesoreria from "../models/MovimientoTesoreria.js";
import Empresa from "../models/Empresa.js";
import Configuracion from "../models/Configuracion.js";
import { conTransaccion } from "../utils/transaccion.js";
import { errorHttp } from "../utils/errorHttp.js";
import { siguienteCodigo } from "../utils/codigos.js";
import { calcularImpuesto, round2 } from "../utils/impuesto.js";
import { recalcularFacturaProveedor, aplicarFlete, sincronizarOCP } from "../utils/saldosTesoreria.js";
import { notificar } from "../utils/notificar.js";

const router = Router();
router.use(authMiddleware, puedeTesoreria);

export const populateFP = [
  { path: "ordenCompraProveedor", select: "codigo moneda subtotal total formaPago" },
  { path: "esFleteDe", select: "codigo" },
  { path: "centroCosto", select: "nombre" },
  { path: "ordenTrabajo", select: "codigo numeroOT" },
];

const TIPOS = ["01", "02", "03"];
const numeroNormalizado = (n) => String(n || "").trim().replace(/^0+(?=\d)/, "");

router.get("/", async (req, res, next) => {
  try {
    res.json(await FacturaProveedor.find().populate(populateFP).sort({ fechaEmision: -1 }));
  } catch (err) { next(err); }
});

router.get("/:id", async (req, res, next) => {
  try {
    const fp = await FacturaProveedor.findById(req.params.id).populate(populateFP);
    if (!fp) return res.status(404).json({ mensaje: "Factura no encontrada" });
    res.json(fp);
  } catch (err) { next(err); }
});

router.post("/", async (req, res, next) => {
  try {
    const fp = await conTransaccion(async (session) => {
      const b = req.body;
      if (!TIPOS.includes(b.tipoComprobante)) throw errorHttp(400, "Tipo de comprobante inválido");
      const serie = String(b.serie || "").trim().toUpperCase();
      const numero = numeroNormalizado(b.numero);
      if (!serie || !numero) throw errorHttp(400, "Falta la serie o el número del comprobante");
      const fechaEmision = new Date(b.fechaEmision);
      if (Number.isNaN(fechaEmision.getTime())) throw errorHttp(400, "Fecha de emisión inválida");
      const subtotal = round2(b.subtotal);
      if (!(subtotal > 0)) throw errorHttp(400, "El subtotal debe ser mayor a 0");
      const igv = b.tipoComprobante === "02" ? 0 : round2(b.igv ?? 0);
      if (!(igv >= 0)) throw errorHttp(400, "IGV inválido");
      const flete = b.esFleteDe ? 0 : round2(b.flete || 0);
      if (flete < 0 || flete > subtotal) throw errorHttp(400, "El flete no puede superar el subtotal");
      const total = round2(subtotal + igv);
      if (b.esFleteDe && b.ordenCompraProveedor) throw errorHttp(400, "Una factura de flete de transportista no se liga como factura de la OC");

      const ocpId = b.esFleteDe || b.ordenCompraProveedor;
      const ocp = ocpId ? await OrdenCompraProveedor.findById(ocpId, null, { session }) : null;
      if (ocpId && (!ocp || ocp.anulada)) throw errorHttp(400, "La OC no existe o está anulada");
      if (!ocpId && !b.centroCosto) throw errorHttp(400, "Una factura sin OC necesita centro de costo");

      const proveedorId = b.ordenCompraProveedor ? ocp.proveedor : b.proveedor;
      const empresa = proveedorId ? await Empresa.findById(proveedorId, "razonSocial ruc", { session }) : null;
      if (!empresa) throw errorHttp(400, "Proveedor no encontrado");
      const moneda = b.ordenCompraProveedor ? ocp.moneda : (b.moneda === "USD" ? "USD" : "PEN");
      const tipoCambio = moneda === "USD" ? Number(b.tipoCambio) : 1;
      if (!(tipoCambio > 0)) throw errorHttp(400, "Falta el tipo de cambio");

      const imp = b.impuesto || { tipo: "ninguno" };
      if (imp.tipo === "retencion" && !(await Configuracion.obtener(session)).esAgenteRetencion) {
        throw errorHttp(400, "INTALES no está configurada como agente de retención");
      }
      const { tasa, monto } = calcularImpuesto({ tipo: imp.tipo, codigoSunat: imp.codigoSunat, total, moneda, tipoCambio });
      const quienDeposita = imp.tipo === "detraccion" && imp.quienDeposita === "proveedor" ? "proveedor" : "nosotros";

      const dup = await FacturaProveedor.exists({ proveedor: empresa._id, tipoComprobante: b.tipoComprobante, serie, numero, anulada: false }).session(session);
      if (dup) throw errorHttp(400, `El comprobante ${serie}-${numero} de este proveedor ya está registrado`);

      if (b.ordenCompraProveedor) {
        const previas = await FacturaProveedor.find({ ordenCompraProveedor: ocp._id, anulada: false }, "subtotal flete", { session });
        const facturado = previas.reduce((s, f) => s + f.subtotal - f.flete, 0);
        if (facturado + subtotal - flete > ocp.subtotal + 0.1) {
          throw errorHttp(400, `Excede lo pendiente de facturar de ${ocp.codigo} (${round2(ocp.subtotal - facturado)})`);
        }
      }

      const condicion = b.condicion === "credito" ? "credito" : "contado";
      const fechaVencimiento = condicion === "contado" ? fechaEmision : new Date(b.fechaVencimiento);
      if (Number.isNaN(fechaVencimiento.getTime())) throw errorHttp(400, "Fecha de vencimiento inválida");

      const nueva = new FacturaProveedor({
        codigo: await siguienteCodigo("FP", session),
        tipoComprobante: b.tipoComprobante, serie, numero, fechaEmision,
        proveedor: empresa._id, proveedorRuc: empresa.ruc || "", proveedorRazonSocial: empresa.razonSocial,
        ordenCompraProveedor: b.ordenCompraProveedor || null, esFleteDe: b.esFleteDe || null,
        centroCosto: b.centroCosto || null, ordenTrabajo: b.ordenTrabajo || null,
        moneda, tipoCambio, subtotal, igv, total, flete, condicion, fechaVencimiento,
        impuesto: { tipo: imp.tipo || "ninguno", codigoSunat: imp.tipo === "detraccion" ? imp.codigoSunat : "", tasa, monto, quienDeposita },
        registradoPor: req.usuario.nombre,
      });
      await recalcularFacturaProveedor(nueva, session);
      await aplicarFlete(nueva, 1, session);
      if (b.ordenCompraProveedor) await sincronizarOCP(ocp._id, session, req.usuario.nombre);
      return nueva;
    });
    await fp.populate(populateFP);
    await notificar(req, { accion: "Registró", entidad: "la factura de proveedor", codigo: `${fp.codigo} (${fp.serie}-${fp.numero})` });
    res.status(201).json(fp);
  } catch (err) { next(err); }
});

router.patch("/:id/anular", async (req, res, next) => {
  try {
    const motivo = String(req.body.motivo || "").trim();
    if (!motivo) return res.status(400).json({ mensaje: "El motivo de anulación es obligatorio" });
    const fp = await conTransaccion(async (session) => {
      const doc = await FacturaProveedor.findById(req.params.id, null, { session });
      if (!doc) throw errorHttp(404, "Factura no encontrada");
      if (doc.anulada) throw errorHttp(400, "La factura ya está anulada");
      const conPagos = await MovimientoTesoreria.exists({ "documento.tipo": "facturaProveedor", "documento.id": doc._id, anulado: false }).session(session);
      if (conPagos) throw errorHttp(400, "Tiene pagos registrados — anúlalos primero en Movimientos");
      Object.assign(doc, { anulada: true, motivoAnulacion: motivo, anuladoPor: req.usuario.nombre, fechaAnulacion: new Date() });
      await recalcularFacturaProveedor(doc, session);
      await aplicarFlete(doc, -1, session);
      if (doc.ordenCompraProveedor) await sincronizarOCP(doc.ordenCompraProveedor, session, req.usuario.nombre);
      return doc;
    });
    await fp.populate(populateFP);
    await notificar(req, { accion: "Anuló", entidad: "la factura de proveedor", codigo: fp.codigo });
    res.json(fp);
  } catch (err) { next(err); }
});

router.post("/:id/archivos", uploadArchivoTesoreria.single("archivo"), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ mensaje: "Archivo inválido — solo imágenes, PDF, Word o Excel (máx. 20 MB)." });
    const fp = await FacturaProveedor.findByIdAndUpdate(req.params.id, {
      $push: { archivos: { nombre: req.file.originalname, url: `/uploads/tesoreria/${req.file.filename}`, mimetype: req.file.mimetype, tamano: req.file.size, subidoPor: req.usuario.nombre } },
    }, { new: true }).populate(populateFP);
    if (!fp) return res.status(404).json({ mensaje: "Factura no encontrada" });
    res.status(201).json(fp);
  } catch (err) { next(err); }
});

router.delete("/:id/archivos/:archivoId", async (req, res, next) => {
  try {
    const fp = await FacturaProveedor.findByIdAndUpdate(req.params.id, { $pull: { archivos: { _id: req.params.archivoId } } }, { new: true }).populate(populateFP);
    if (!fp) return res.status(404).json({ mensaje: "Factura no encontrada" });
    res.json(fp);
  } catch (err) { next(err); }
});

export default router;
```

En `Backend/src/index.js`:
```js
import facturasProveedorRoutes from "./routes/facturasProveedor.js";
```
```js
app.use("/api/facturas-proveedor", facturasProveedorRoutes);
```

- [ ] **Step 7: Anular OCP se bloquea por facturas (reemplaza el bloqueo por "pagado")**

En `Backend/src/routes/ordenesCompraProveedor.js`:
1. Cambiar el import `import { origenYaPagado, limpiarOrigen } from "../utils/compras.js";` por
```js
import { limpiarOrigen } from "../utils/compras.js";
import FacturaProveedor from "../models/FacturaProveedor.js";
```
2. Reemplazar el bloque
```js
    // Spec B (Tesorería) cambiará este bloqueo a "tiene factura registrada".
    for (const { sc, linea } of afectadas) {
      if (await origenYaPagado(sc, linea)) {
        return res.status(400).json({ mensaje: "Ya fue marcada como pagada — no se puede anular." });
      }
    }
```
por
```js
    if (await FacturaProveedor.exists({ ordenCompraProveedor: ocp._id, anulada: false })) {
      return res.status(400).json({ mensaje: "Tiene facturas registradas — anúlalas primero en Tesorería." });
    }
```
3. En `Backend/src/utils/compras.js` borrar la función `origenYaPagado` (queda sin uso).

- [ ] **Step 8: Correr** — Run: `cd Backend && npm test` — Expected: PASS.

- [ ] **Step 9: Commit**
```bash
git -C Backend add test/escenarios.js test/facturasProveedor.test.js test/ordenesCompraProveedor.test.js src/models/FacturaProveedor.js src/models/MovimientoTesoreria.js src/models/OrdenCompraProveedor.js src/utils/saldosTesoreria.js src/utils/compras.js src/routes/facturasProveedor.js src/routes/ordenesCompraProveedor.js src/middleware/upload.js src/index.js
git -C Backend commit -m "feat(tesoreria): facturas de proveedor con detracción, flete y tope por OCP" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Movimientos de tesorería (pagos de compras) con transacción y origen pagado

**Files:**
- Create: `Backend/src/utils/movimientos.js`, `Backend/src/routes/movimientosTesoreria.js`
- Modify: `Backend/src/index.js`
- Test: `Backend/test/movimientosTesoreria.test.js`

**Interfaces:**
- Consumes: Tasks 1–3.
- Produces:
  - `registrarMovimiento(datos, usuario, session) → MovimientoTesoreria` y `anularMovimiento(id, motivo, usuario, session) → MovimientoTesoreria` en `utils/movimientos.js`; `recalcularDocumento(lado, doc, session)` interno que Task 5 extiende a ventas.
  - `POST /api/movimientos-tesoreria` body `{ documento: { tipo, id, cuotaId? }, concepto, monto, fecha, cuenta?, cuentaDestino?, medio, numeroOperacion? }`, `GET /api/movimientos-tesoreria`, `PATCH /api/movimientos-tesoreria/:id/anular { motivo }`.

- [ ] **Step 1: Escribir el test que falla**

`Backend/test/movimientosTesoreria.test.js`:
```js
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { conectar, desconectar, limpiar, levantar } from "./helpers.js";
import { escenarioOCP } from "./escenarios.js";
import licitacionesRoutes from "../src/routes/licitaciones.js";
import facturasProveedorRoutes from "../src/routes/facturasProveedor.js";
import movimientosRoutes from "../src/routes/movimientosTesoreria.js";
import CuentaTesoreria from "../src/models/CuentaTesoreria.js";
import FacturaProveedor from "../src/models/FacturaProveedor.js";
import MovimientoTesoreria from "../src/models/MovimientoTesoreria.js";
import Requerimiento from "../src/models/Requerimiento.js";
import { conTransaccion } from "../src/utils/transaccion.js";
import { registrarMovimiento } from "../src/utils/movimientos.js";

let srv, bcp, bn;
before(async () => {
  await conectar();
  srv = await levantar({ "/api/licitaciones": licitacionesRoutes, "/api/facturas-proveedor": facturasProveedorRoutes, "/api/movimientos-tesoreria": movimientosRoutes });
});
after(async () => { await srv.cerrar(); await desconectar(); });
beforeEach(async () => {
  await limpiar();
  bcp = await CuentaTesoreria.create({ nombre: "BCP Soles", tipo: "banco", moneda: "PEN" });
  bn = await CuentaTesoreria.create({ nombre: "BN Detracciones", tipo: "detracciones", moneda: "PEN" });
});

async function facturaConDetraccion() {
  const esc = await escenarioOCP(srv);
  const r = await srv.api("POST", "/api/facturas-proveedor", {
    body: { ordenCompraProveedor: esc.ocp._id, tipoComprobante: "01", serie: "F001", numero: "1", fechaEmision: "2026-09-28",
      subtotal: 300, igv: 54, condicion: "contado", impuesto: { tipo: "detraccion", codigoSunat: "037", quienDeposita: "nosotros" } },
  });
  return { ...esc, fp: r.data };
}
const pago = (fp, concepto, monto, extra = {}) => ({
  documento: { tipo: "facturaProveedor", id: fp._id }, concepto, monto, fecha: "2026-09-29",
  cuenta: bcp._id, medio: "transferencia", numeroOperacion: "OP-1", ...extra,
});

test("pagar neto e impuesto deja la factura pagada y el origen como pagado", async () => {
  const { base, fp } = await facturaConDetraccion();
  const p1 = await srv.api("POST", "/api/movimientos-tesoreria", { body: pago(fp, "neto", 200), rol: "facturacion" });
  assert.equal(p1.status, 201, JSON.stringify(p1.data));
  assert.equal(p1.data.codigo, "MOV-0001");
  assert.equal(p1.data.tipo, "egreso");
  assert.equal((await FacturaProveedor.findById(fp._id)).estado, "parcial");
  await srv.api("POST", "/api/movimientos-tesoreria", { body: pago(fp, "neto", 112) });
  await srv.api("POST", "/api/movimientos-tesoreria", { body: pago(fp, "impuesto", 42, { numeroOperacion: "CONST-99" }) });
  const doc = await FacturaProveedor.findById(fp._id);
  assert.equal(doc.estado, "pagada");
  const rq = await Requerimiento.findById(base.rq._id);
  assert.ok(rq.items.every((i) => i.estadoPago === "pagado"));
});

test("no se paga más que el saldo ni el neto desde la cuenta de detracciones; la detracción exige constancia", async () => {
  const { fp } = await facturaConDetraccion();
  assert.equal((await srv.api("POST", "/api/movimientos-tesoreria", { body: pago(fp, "neto", 312.5) })).status, 400);
  assert.equal((await srv.api("POST", "/api/movimientos-tesoreria", { body: pago(fp, "neto", 10, { cuenta: bn._id }) })).status, 400);
  assert.equal((await srv.api("POST", "/api/movimientos-tesoreria", { body: pago(fp, "impuesto", 42, { numeroOperacion: "" }) })).status, 400);
  assert.equal((await srv.api("POST", "/api/movimientos-tesoreria", { body: pago(fp, "neto", 10), rol: "vendedor" })).status, 403);
});

test("anular un movimiento revierte la factura y el origen", async () => {
  const { base, fp } = await facturaConDetraccion();
  await srv.api("POST", "/api/movimientos-tesoreria", { body: pago(fp, "neto", 312) });
  const imp = await srv.api("POST", "/api/movimientos-tesoreria", { body: pago(fp, "impuesto", 42, { numeroOperacion: "C-1" }) });
  const r = await srv.api("PATCH", `/api/movimientos-tesoreria/${imp.data._id}/anular`, { body: { motivo: "Constancia equivocada" } });
  assert.equal(r.status, 200);
  const doc = await FacturaProveedor.findById(fp._id);
  assert.equal(doc.estado, "parcial");
  assert.equal(doc.saldoImpuesto, 42);
  const rq = await Requerimiento.findById(base.rq._id);
  assert.ok(rq.items.every((i) => i.estadoPago === "pendiente_pago"));
});

test("si la transacción falla después de registrar el movimiento, no queda nada escrito", async () => {
  const { fp } = await facturaConDetraccion();
  await assert.rejects(conTransaccion(async (session) => {
    await registrarMovimiento(pago(fp, "neto", 100), "Tester", session);
    throw new Error("falla a propósito");
  }), /falla a propósito/);
  assert.equal(await MovimientoTesoreria.countDocuments(), 0);
  const doc = await FacturaProveedor.findById(fp._id);
  assert.equal(doc.pagadoNeto, 0);
  const siguiente = await srv.api("POST", "/api/movimientos-tesoreria", { body: pago(fp, "neto", 10) });
  assert.equal(siguiente.data.codigo, "MOV-0001");
});
```

- [ ] **Step 2: Correr y verificar que falla** — Run: `cd Backend && node --test test/movimientosTesoreria.test.js` — Expected: FAIL (`Cannot find module '../src/routes/movimientosTesoreria.js'`).

- [ ] **Step 3: Servicio de movimientos**

`Backend/src/utils/movimientos.js`:
```js
import MovimientoTesoreria from "../models/MovimientoTesoreria.js";
import FacturaProveedor from "../models/FacturaProveedor.js";
import CuentaTesoreria from "../models/CuentaTesoreria.js";
import { errorHttp } from "./errorHttp.js";
import { siguienteCodigo } from "./codigos.js";
import { round2, tipoMovimientoEsperado } from "./impuesto.js";
import { recalcularFacturaProveedor, sincronizarOCP } from "./saldosTesoreria.js";

const MEDIOS = ["transferencia", "deposito", "efectivo", "cheque"];

async function cargarDocumento(documento, session) {
  if (documento?.tipo === "facturaProveedor") {
    const doc = await FacturaProveedor.findById(documento.id, null, { session });
    if (!doc) throw errorHttp(404, "Factura no encontrada");
    if (doc.anulada) throw errorHttp(400, "La factura está anulada");
    return { lado: "compra", doc };
  }
  throw errorHttp(400, "Tipo de documento inválido");
}

async function recalcularDocumento(lado, doc, session, usuario) {
  if (lado === "compra") {
    await recalcularFacturaProveedor(doc, session);
    if (doc.ordenCompraProveedor) await sincronizarOCP(doc.ordenCompraProveedor, session, usuario);
  }
}

export async function registrarMovimiento(datos, usuario, session) {
  const { documento, concepto, cuenta, cuentaDestino, medio } = datos;
  const monto = round2(datos.monto);
  const numeroOperacion = String(datos.numeroOperacion || "").trim();
  if (!["neto", "impuesto"].includes(concepto)) throw errorHttp(400, "Concepto inválido");
  if (!(monto > 0)) throw errorHttp(400, "El monto debe ser mayor a 0");
  const fecha = new Date(datos.fecha);
  if (Number.isNaN(fecha.getTime())) throw errorHttp(400, "Fecha inválida");

  const { lado, doc } = await cargarDocumento(documento, session);
  await recalcularDocumento(lado, doc, session, usuario);
  const saldo = concepto === "neto" ? doc.saldoNeto : doc.saldoImpuesto;
  if (monto > saldo + 0.009) throw errorHttp(400, `El monto supera el saldo pendiente (${saldo})`);

  const tipo = tipoMovimientoEsperado({ lado, concepto, impuesto: doc.impuesto });
  const cta = cuenta ? await CuentaTesoreria.findById(cuenta, null, { session }) : null;
  if (tipo === "retencion") {
    if (!numeroOperacion) throw errorHttp(400, "Falta el número del comprobante de retención");
  } else {
    if (!cta || !cta.activo) throw errorHttp(400, "Elige una cuenta activa");
    if (!MEDIOS.includes(medio)) throw errorHttp(400, "Medio de pago inválido");
    if (concepto === "neto" && cta.tipo === "detracciones") throw errorHttp(400, "Los fondos de detracciones no se usan para el neto");
  }
  let destino = null;
  if (tipo === "transferencia") {
    destino = await CuentaTesoreria.findById(cuentaDestino, null, { session });
    if (!destino || destino.tipo !== "detracciones") throw errorHttp(400, "La autodetracción se transfiere a una cuenta de detracciones");
    if (cta.tipo === "detracciones") throw errorHttp(400, "La cuenta de origen no puede ser de detracciones");
  }
  if (lado === "venta" && concepto === "impuesto" && tipo === "ingreso" && doc.impuesto.tipo === "detraccion" && cta.tipo !== "detracciones") {
    throw errorHttp(400, "La detracción del cliente entra a la cuenta de detracciones");
  }
  if (concepto === "impuesto" && doc.impuesto.tipo === "detraccion" && !numeroOperacion) {
    throw errorHttp(400, "Falta el número de constancia de depósito de la detracción");
  }

  const [mov] = await MovimientoTesoreria.create([{
    codigo: await siguienteCodigo("MOV", session),
    tipo, fecha, monto,
    moneda: concepto === "neto" ? doc.moneda || "PEN" : "PEN",
    tipoCambio: doc.tipoCambio || 1,
    cuenta: cta?._id || null,
    cuentaDestino: destino?._id || null,
    medio: tipo === "retencion" ? "comprobante_retencion" : medio,
    numeroOperacion, concepto,
    documento: { tipo: documento.tipo, id: doc._id, cuotaId: documento.cuotaId || null },
    registradoPor: usuario,
  }], { session });
  await recalcularDocumento(lado, doc, session, usuario);
  return mov;
}

export async function anularMovimiento(id, motivo, usuario, session) {
  const mov = await MovimientoTesoreria.findById(id, null, { session });
  if (!mov) throw errorHttp(404, "Movimiento no encontrado");
  if (mov.anulado) throw errorHttp(400, "El movimiento ya está anulado");
  Object.assign(mov, { anulado: true, motivoAnulacion: motivo, anuladoPor: usuario, fechaAnulacion: new Date() });
  await mov.save({ session });
  const { lado, doc } = await cargarDocumento(mov.documento, session);
  await recalcularDocumento(lado, doc, session, usuario);
  return mov;
}
```

`Backend/src/routes/movimientosTesoreria.js`:
```js
import { Router } from "express";
import authMiddleware from "../middleware/authMiddleware.js";
import puedeTesoreria from "../middleware/puedeTesoreria.js";
import MovimientoTesoreria from "../models/MovimientoTesoreria.js";
import { conTransaccion } from "../utils/transaccion.js";
import { registrarMovimiento, anularMovimiento } from "../utils/movimientos.js";
import { notificar } from "../utils/notificar.js";

const router = Router();
router.use(authMiddleware, puedeTesoreria);

const populate = [
  { path: "cuenta", select: "nombre tipo moneda" },
  { path: "cuentaDestino", select: "nombre tipo moneda" },
];

router.get("/", async (req, res, next) => {
  try {
    res.json(await MovimientoTesoreria.find().populate(populate).sort({ fecha: -1, _id: -1 }));
  } catch (err) { next(err); }
});

router.post("/", async (req, res, next) => {
  try {
    const mov = await conTransaccion((session) => registrarMovimiento(req.body, req.usuario.nombre, session));
    await mov.populate(populate);
    await notificar(req, { accion: "Registró", entidad: "el movimiento de tesorería", codigo: mov.codigo });
    res.status(201).json(mov);
  } catch (err) { next(err); }
});

router.patch("/:id/anular", async (req, res, next) => {
  try {
    const motivo = String(req.body.motivo || "").trim();
    if (!motivo) return res.status(400).json({ mensaje: "El motivo de anulación es obligatorio" });
    const mov = await conTransaccion((session) => anularMovimiento(req.params.id, motivo, req.usuario.nombre, session));
    await mov.populate(populate);
    await notificar(req, { accion: "Anuló", entidad: "el movimiento de tesorería", codigo: mov.codigo });
    res.json(mov);
  } catch (err) { next(err); }
});

export default router;
```

En `Backend/src/index.js`:
```js
import movimientosTesoreriaRoutes from "./routes/movimientosTesoreria.js";
```
```js
app.use("/api/movimientos-tesoreria", movimientosTesoreriaRoutes);
```

- [ ] **Step 4: Correr** — Run: `cd Backend && npm test` — Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git -C Backend add src/utils/movimientos.js src/routes/movimientosTesoreria.js src/index.js test/movimientosTesoreria.test.js
git -C Backend commit -m "feat(tesoreria): libro de movimientos con transacción; la OCP pagada marca su origen" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Facturas de venta sobre el libro de movimientos (impuesto, cobros, cuotas, cierre de cadena)

**Files:**
- Modify: `Backend/src/models/Factura.js`, `Backend/src/utils/saldosTesoreria.js`, `Backend/src/utils/movimientos.js`, `Backend/src/utils/sincronizarEstadoCadena.js`, `Backend/src/routes/facturas.js`
- Test: `Backend/test/ventasTesoreria.test.js`

**Interfaces:**
- Consumes: Tasks 1–4.
- Produces: `Factura.impuesto`, `Factura.pagadoNeto`, `pagadoImpuesto`, `saldoNeto`, `saldoImpuesto`; `recalcularFacturaVenta(f, session?)`; `impuestoVentaPorDefecto(total)`; `cerrarCadena(numeroDocumento, cerrado, session?)`; `PATCH /api/facturas/:id/impuesto { tipo, codigoSunat?, quienDeposita }`. Se **retiran** `PATCH /facturas/:id/estado-pago`, `/detraccion-pagada` y `/cuotas/:cuotaId/pagar`.

- [ ] **Step 1: Escribir el test que falla**

`Backend/test/ventasTesoreria.test.js`:
```js
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { conectar, desconectar, limpiar, levantar } from "./helpers.js";
import facturasRoutes from "../src/routes/facturas.js";
import movimientosRoutes from "../src/routes/movimientosTesoreria.js";
import CuentaTesoreria from "../src/models/CuentaTesoreria.js";
import Factura from "../src/models/Factura.js";

let srv, bcp, bn;
before(async () => { await conectar(); srv = await levantar({ "/api/facturas": facturasRoutes, "/api/movimientos-tesoreria": movimientosRoutes }); });
after(async () => { await srv.cerrar(); await desconectar(); });
beforeEach(async () => {
  await limpiar();
  bcp = await CuentaTesoreria.create({ nombre: "BCP Soles", tipo: "banco", moneda: "PEN" });
  bn = await CuentaTesoreria.create({ nombre: "BN Detracciones", tipo: "detracciones", moneda: "PEN" });
});

const crear = (extra = {}) => srv.api("POST", "/api/facturas", { body: { numeroFactura: "F001-1", subtotal: 1000, ...extra } });
const cobro = (f, concepto, monto, extra = {}) => ({
  documento: { tipo: "facturaVenta", id: f._id }, concepto, monto, fecha: "2026-09-29", cuenta: bcp._id, medio: "transferencia", numeroOperacion: "OP", ...extra,
});

test("una factura de venta > S/ 700 nace con detracción 037 del cliente", async () => {
  const r = await crear();
  assert.equal(r.status, 201);
  assert.equal(r.data.total, 1180);
  assert.equal(r.data.impuesto.tipo, "detraccion");
  assert.equal(r.data.impuesto.monto, 142);
  assert.equal(r.data.impuesto.quienDeposita, "cliente");
  assert.equal(r.data.totalAPagar, 1038);
});

test("cobrar neto y detracción cierra la cadena; anular un cobro la reabre", async () => {
  const f = (await crear()).data;
  await srv.api("POST", "/api/movimientos-tesoreria", { body: cobro(f, "neto", 1038) });
  const imp = await srv.api("POST", "/api/movimientos-tesoreria", { body: cobro(f, "impuesto", 142, { cuenta: bn._id, numeroOperacion: "CONST" }) });
  assert.equal(imp.status, 201, JSON.stringify(imp.data));
  let doc = await Factura.findById(f._id);
  assert.equal(doc.estadoPago, "pagado");
  assert.equal(doc.detraccionPagada, true);
  assert.equal(doc.montoPagado, 1038);
  assert.equal(doc.estadoCadena, "cerrado");
  await srv.api("PATCH", `/api/movimientos-tesoreria/${imp.data._id}/anular`, { body: { motivo: "x" } });
  doc = await Factura.findById(f._id);
  assert.equal(doc.estadoPago, "pago parcial");
  assert.equal(doc.estadoCadena, "abierto");
});

test("si el cliente pagó todo, la detracción se registra como transferencia a nuestra cuenta BN", async () => {
  const f = (await crear()).data;
  const cambio = await srv.api("PATCH", `/api/facturas/${f._id}/impuesto`, { body: { tipo: "detraccion", codigoSunat: "037", quienDeposita: "nosotros" }, rol: "facturacion" });
  assert.equal(cambio.data.totalAPagar, 1180);
  const mal = await srv.api("POST", "/api/movimientos-tesoreria", { body: cobro(f, "impuesto", 142, { cuenta: bn._id, cuentaDestino: bn._id }) });
  assert.equal(mal.status, 400);
  const ok = await srv.api("POST", "/api/movimientos-tesoreria", { body: cobro(f, "impuesto", 142, { cuentaDestino: bn._id, numeroOperacion: "AUTO-1" }) });
  assert.equal(ok.status, 201, JSON.stringify(ok.data));
  assert.equal(ok.data.tipo, "transferencia");
  const conMovs = await srv.api("PATCH", `/api/facturas/${f._id}/impuesto`, { body: { tipo: "ninguno" } });
  assert.equal(conMovs.status, 400);
});

test("los cobros se reparten en las cuotas en orden", async () => {
  const f = (await crear({ cuotas: [{ monto: 590, fechaVencimiento: "2026-10-30" }, { monto: 590, fechaVencimiento: "2026-11-30" }] })).data;
  await srv.api("PATCH", `/api/facturas/${f._id}/impuesto`, { body: { tipo: "ninguno" } });
  await srv.api("POST", "/api/movimientos-tesoreria", { body: cobro(f, "neto", 700) });
  const doc = await Factura.findById(f._id);
  assert.deepEqual(doc.cuotas.map((c) => [c.montoPagado, c.pagado]), [[590, true], [110, false]]);
  assert.equal(doc.estadoPago, "pago parcial");
});

test("las rutas manuales de pago de ventas ya no existen", async () => {
  const f = (await crear()).data;
  assert.equal((await srv.api("PATCH", `/api/facturas/${f._id}/estado-pago`, { body: { montoPagado: 1 } })).status, 404);
  assert.equal((await srv.api("PATCH", `/api/facturas/${f._id}/detraccion-pagada`, { body: { pagada: true } })).status, 404);
});
```

- [ ] **Step 2: Correr y verificar que falla** — Run: `cd Backend && node --test test/ventasTesoreria.test.js` — Expected: FAIL (`r.data.impuesto` undefined).

- [ ] **Step 3: Modelo `Factura`** — en `Backend/src/models/Factura.js`:
1. Import: `import { impuestoSchema } from "./impuestoSchema.js";`
2. Después de `detraccionPagada:  { type: Boolean, default: false },` agregar:
```js
  // Tesorería B1: impuesto real de la venta (reemplaza la detracción fija) y
  // saldos derivados de MovimientoTesoreria — montoPagado, estadoPago,
  // detraccion, detraccionPagada, totalAPagar y cuotas[].montoPagado se
  // recalculan en saldosTesoreria.recalcularFacturaVenta(); no se escriben a mano.
  impuesto:           { type: impuestoSchema, default: () => ({}) },
  pagadoNeto:         { type: Number, default: 0 },
  pagadoImpuesto:     { type: Number, default: 0 },
  saldoNeto:          { type: Number, default: 0 },
  saldoImpuesto:      { type: Number, default: 0 },
```

- [ ] **Step 4: Cadena con sesión** — reemplazar el cuerpo de `cerrarCadena` en `Backend/src/utils/sincronizarEstadoCadena.js` por:
```js
export async function cerrarCadena(numeroDocumento, cerrado, session) {
  if (numeroDocumento == null) return;
  const set = { $set: { estadoCadena: cerrado ? "cerrado" : "abierto" } };
  // Secuencial: dentro de una transacción no se permiten operaciones paralelas en la sesión.
  for (const Modelo of [Cotizacion, OrdenTrabajo, Informe, OrdenCompra, Factura]) {
    await Modelo.updateMany({ numeroDocumento }, set, { session });
  }
}
```

- [ ] **Step 5: Recalcular ventas** — en `Backend/src/utils/saldosTesoreria.js`:
1. Imports: `import Factura from "../models/Factura.js";`, `import { cerrarCadena } from "./sincronizarEstadoCadena.js";` y cambiar el import de impuesto a `import { partes, round2, calcularImpuesto, UMBRAL_IMPUESTO } from "./impuesto.js";`
2. Agregar al final:
```js
// Sin indicación, la venta de servicios de INTALES sobre el umbral lleva
// detracción "demás servicios" (037) depositada por el cliente — el mismo
// criterio que la regla fija anterior, ahora editable por factura.
export function impuestoVentaPorDefecto(total) {
  if (total <= UMBRAL_IMPUESTO) return { tipo: "ninguno", codigoSunat: "", tasa: 0, monto: 0, quienDeposita: "cliente" };
  const { tasa, monto } = calcularImpuesto({ tipo: "detraccion", codigoSunat: "037", total });
  return { tipo: "detraccion", codigoSunat: "037", tasa, monto, quienDeposita: "cliente" };
}

export async function recalcularFacturaVenta(f, session) {
  const p = partes({ lado: "venta", total: f.total, impuesto: f.impuesto });
  const pag = await pagadoPorConcepto("facturaVenta", f._id, session);
  const antesPagada = f.estadoPago === "pagado";
  f.totalAPagar = p.neto;
  f.detraccion = f.impuesto?.tipo === "detraccion" ? f.impuesto.monto : 0;
  f.pagadoNeto = pag.neto;
  f.pagadoImpuesto = pag.impuesto;
  f.montoPagado = pag.neto;
  f.saldoNeto = round2(p.neto - pag.neto);
  f.saldoImpuesto = round2(p.impuesto - pag.impuesto);
  f.detraccionPagada = p.impuesto > 0 && f.saldoImpuesto <= TOL;
  let resto = pag.neto;
  for (const c of [...f.cuotas].sort((a, b) => a.numero - b.numero)) {
    const aplicado = round2(Math.min(resto, c.monto));
    c.montoPagado = aplicado;
    c.pagado = aplicado >= c.monto - TOL;
    c.fechaPago = c.pagado ? c.fechaPago || new Date() : null;
    resto = round2(resto - aplicado);
  }
  const pagada = !f.anulado && f.saldoNeto <= TOL && f.saldoImpuesto <= TOL && p.neto + p.impuesto > 0;
  f.estadoPago = pagada ? "pagado" : pag.neto + pag.impuesto > 0 ? "pago parcial" : "sin pago";
  if (pagada !== antesPagada) f.estadoCadena = pagada ? "cerrado" : "abierto";
  await f.save({ session });
  if (pagada !== antesPagada) await cerrarCadena(f.numeroDocumento, pagada, session);
}
```

- [ ] **Step 6: Movimientos también para ventas** — en `Backend/src/utils/movimientos.js`:
1. Imports: `import Factura from "../models/Factura.js";` y agregar `recalcularFacturaVenta` al import de `saldosTesoreria.js`.
2. En `cargarDocumento`, antes del `throw` final:
```js
  if (documento?.tipo === "facturaVenta") {
    const doc = await Factura.findById(documento.id, null, { session });
    if (!doc) throw errorHttp(404, "Factura no encontrada");
    if (doc.anulado) throw errorHttp(400, "La factura está anulada");
    return { lado: "venta", doc };
  }
```
3. En `recalcularDocumento` agregar la rama:
```js
  if (lado === "venta") await recalcularFacturaVenta(doc, session);
```
4. En la construcción del movimiento, la moneda del neto: `doc.moneda || "PEN"` ya cubre ventas (Factura no tiene `moneda`).

- [ ] **Step 7: Rutas de facturas de venta** — en `Backend/src/routes/facturas.js`:
1. Imports: `import MovimientoTesoreria from "../models/MovimientoTesoreria.js";`, `import { recalcularFacturaVenta, impuestoVentaPorDefecto } from "../utils/saldosTesoreria.js";`, `import { calcularImpuesto } from "../utils/impuesto.js";`
2. Reemplazar la función `calcular` por:
```js
function calcular(subtotal) {
  const sub   = Math.round(Number(subtotal) * 100) / 100;
  const igv   = Math.round(sub * 0.18 * 100) / 100;
  const total = Math.round((sub + igv) * 100) / 100;
  return { subtotal: sub, igv, total };
}

// Los campos de cobro son derivados de Tesorería: nunca se aceptan del body.
const CAMPOS_DERIVADOS = ["montoPagado", "estadoPago", "detraccion", "detraccionPagada", "totalAPagar", "impuesto",
  "pagadoNeto", "pagadoImpuesto", "saldoNeto", "saldoImpuesto", "estadoCadena"];
const sinDerivados = (body) => { const b = { ...body }; for (const c of CAMPOS_DERIVADOS) delete b[c]; return b; };
```
3. En `router.post("/")`: cambiar `const body = { ...req.body };` por `const body = sinDerivados(req.body);`, después de `Object.assign(body, calcular(body.subtotal ?? 0));` agregar `body.impuesto = impuestoVentaPorDefecto(body.total);`, en el bloque de cuotas borrar las líneas `body.estadoPago = "sin pago";` y `body.montoPagado = 0;`, y reemplazar
```js
    const factura = await new Factura(body).save();
    await factura.populate(populate);
```
por
```js
    const factura = await new Factura(body).save();
    await recalcularFacturaVenta(factura);
    await factura.populate(populate);
```
4. En `/importar`: después de `const calc = calcular(sub);` agregar `const impuesto = impuestoVentaPorDefecto(calc.total);`, en el `new Factura({ … })` agregar la propiedad `impuesto,` después de `...calc,`, y después de `await factura.save();` agregar `await recalcularFacturaVenta(factura);`.
5. En `router.put("/:id")`: cambiar `const body = { ...req.body };` por `const body = sinDerivados(req.body);` y reemplazar
```js
    const factura = await Factura.findByIdAndUpdate(req.params.id, body, { new: true }).populate(populate);
    if (!factura) return res.status(404).json({ mensaje: "No encontrada" });
```
por
```js
    const factura = await Factura.findByIdAndUpdate(req.params.id, body, { new: true });
    if (!factura) return res.status(404).json({ mensaje: "No encontrada" });
    if (body.subtotal !== undefined && factura.impuesto?.tipo !== "ninguno") {
      const { tasa, monto } = calcularImpuesto({ tipo: factura.impuesto.tipo, codigoSunat: factura.impuesto.codigoSunat, total: factura.total });
      factura.impuesto.tasa = tasa;
      factura.impuesto.monto = monto;
    }
    await recalcularFacturaVenta(factura);
    await factura.populate(populate);
```
6. **Borrar** los handlers completos `router.patch("/:id/estado-pago", …)`, `router.patch("/:id/detraccion-pagada", …)` y `router.patch("/:id/cuotas/:cuotaId/pagar", …)` con sus comentarios, y borrar `import { cerrarCadena } …` si queda sin uso (verificar con `grep -n cerrarCadena src/routes/facturas.js`).
7. Agregar (antes de `export default router;`), reutilizando el middleware existente `puedeMarcarPago`:
```js
// Cambiar el impuesto de una venta (detracción/retención y quién deposita):
// solo mientras no tenga cobros registrados en Tesorería.
router.patch("/:id/impuesto", puedeMarcarPago, async (req, res, next) => {
  try {
    const factura = await Factura.findById(req.params.id);
    if (!factura) return res.status(404).json({ mensaje: "No encontrada" });
    if (factura.anulado) return res.status(400).json({ mensaje: "Documento anulado, no se puede modificar" });
    if (await MovimientoTesoreria.exists({ "documento.tipo": "facturaVenta", "documento.id": factura._id, anulado: false })) {
      return res.status(400).json({ mensaje: "Tiene cobros registrados — anúlalos antes de cambiar el impuesto" });
    }
    const tipo = ["ninguno", "detraccion", "retencion"].includes(req.body.tipo) ? req.body.tipo : null;
    if (!tipo) return res.status(400).json({ mensaje: "Tipo de impuesto inválido" });
    const { tasa, monto } = calcularImpuesto({ tipo, codigoSunat: req.body.codigoSunat, total: factura.total });
    const quienDeposita = tipo === "detraccion" && req.body.quienDeposita === "nosotros" ? "nosotros" : "cliente";
    factura.impuesto = { tipo, codigoSunat: tipo === "detraccion" ? req.body.codigoSunat : "", tasa, monto, quienDeposita };
    await recalcularFacturaVenta(factura);
    await factura.populate(populate);
    await notificar(req, { accion: "Cambió el impuesto de", entidad: "la Factura", codigo: factura.numeroFactura || factura.codigo });
    res.json(factura);
  } catch (err) { next(err); }
});
```
El `calcularImpuesto` lanza errores con `status: 400` que el `catch` pasa a `next(err)`.

- [ ] **Step 8: Correr** — Run: `cd Backend && npm test` — Expected: PASS.

- [ ] **Step 9: Commit**
```bash
git -C Backend add src/models/Factura.js src/utils/saldosTesoreria.js src/utils/movimientos.js src/utils/sincronizarEstadoCadena.js src/routes/facturas.js test/ventasTesoreria.test.js
git -C Backend commit -m "feat(tesoreria): cobros de ventas en el libro de movimientos con impuesto por factura" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Vistas de Tesorería (por pagar / por cobrar) y pagos antiguos de Requerimientos

**Files:**
- Create: `Backend/src/routes/tesoreria.js`
- Modify: `Backend/src/routes/requerimientos.js`, `Backend/src/routes/serviciosExternos.js`, `Backend/src/routes/movimientosTesoreria.js`, `Backend/src/index.js`
- Test: `Backend/test/tesoreriaVistas.test.js`

**Interfaces:**
- Produces: `GET /api/tesoreria/por-pagar → { ocps: [{ _id, codigo, fecha, proveedor, moneda, total, subtotal, formaPago, montoFacturado, saldoPorFacturar, saldoNeto, saldoImpuesto, proximoVencimiento, hayServicios, facturas: [ids] }], facturas: FacturaProveedor[] }`; `GET /api/movimientos-tesoreria` agrega a cada movimiento `documentoRef: { codigo, comprobante, tercero }`; `GET /api/tesoreria/por-cobrar → Factura[]` (no anuladas, pobladas). Los `/pagar` de Requerimientos y Servicios Externos responden 400 cuando el origen tiene OCP.

- [ ] **Step 1: Escribir el test que falla**

`Backend/test/tesoreriaVistas.test.js`:
```js
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { conectar, desconectar, limpiar, levantar } from "./helpers.js";
import { escenarioOCP } from "./escenarios.js";
import licitacionesRoutes from "../src/routes/licitaciones.js";
import facturasProveedorRoutes from "../src/routes/facturasProveedor.js";
import tesoreriaRoutes from "../src/routes/tesoreria.js";
import requerimientosRoutes from "../src/routes/requerimientos.js";
import movimientosRoutes from "../src/routes/movimientosTesoreria.js";
import CuentaTesoreria from "../src/models/CuentaTesoreria.js";

let srv;
before(async () => {
  await conectar();
  srv = await levantar({ "/api/licitaciones": licitacionesRoutes, "/api/facturas-proveedor": facturasProveedorRoutes, "/api/tesoreria": tesoreriaRoutes, "/api/requerimientos": requerimientosRoutes, "/api/movimientos-tesoreria": movimientosRoutes });
});
after(async () => { await srv.cerrar(); await desconectar(); });
beforeEach(limpiar);

test("por pagar lista OCP con y sin factura con sus saldos", async () => {
  const { ocp } = await escenarioOCP(srv);
  const antes = await srv.api("GET", "/api/tesoreria/por-pagar", { rol: "facturacion" });
  assert.equal(antes.data.ocps.length, 1);
  assert.equal(antes.data.ocps[0].saldoPorFacturar, 300);
  assert.equal(antes.data.ocps[0].hayServicios, false);
  assert.equal(antes.data.ocps[0].items, undefined);
  await srv.api("POST", "/api/facturas-proveedor", { body: { ordenCompraProveedor: ocp._id, tipoComprobante: "01", serie: "F001", numero: "1", fechaEmision: "2026-09-28", subtotal: 300, igv: 54, condicion: "credito", fechaVencimiento: "2026-10-28", impuesto: { tipo: "ninguno" } } });
  const despues = await srv.api("GET", "/api/tesoreria/por-pagar");
  const fila = despues.data.ocps[0];
  assert.equal(fila.saldoPorFacturar, 0);
  assert.equal(fila.saldoNeto, 354);
  assert.equal(new Date(fila.proximoVencimiento).toISOString().slice(0, 10), "2026-10-28");
  assert.equal(despues.data.facturas.length, 1);
  assert.equal((await srv.api("GET", "/api/tesoreria/por-pagar", { rol: "vendedor" })).status, 403);
});

test("el pago manual antiguo de Requerimientos se bloquea si el ítem ya tiene OCP", async () => {
  const { base } = await escenarioOCP(srv);
  const item = base.rq.items[0];
  const r = await srv.api("PATCH", `/api/requerimientos/${base.rq._id}/items/${item._id}/pagar`, { rol: "jefatura" });
  assert.equal(r.status, 400);
  assert.match(r.data.mensaje, /Tesorería/);
});

test("el libro de movimientos indica el comprobante y el tercero de cada movimiento", async () => {
  const { ocp } = await escenarioOCP(srv);
  const fp = (await srv.api("POST", "/api/facturas-proveedor", { body: { ordenCompraProveedor: ocp._id, tipoComprobante: "01", serie: "F001", numero: "7", fechaEmision: "2026-09-28", subtotal: 300, igv: 54, condicion: "contado", impuesto: { tipo: "ninguno" } } })).data;
  const cta = await CuentaTesoreria.create({ nombre: "BCP Soles", tipo: "banco", moneda: "PEN" });
  await srv.api("POST", "/api/movimientos-tesoreria", { body: { documento: { tipo: "facturaProveedor", id: fp._id }, concepto: "neto", monto: 100, fecha: "2026-09-29", cuenta: cta._id, medio: "transferencia", numeroOperacion: "OP1" } });
  const r = await srv.api("GET", "/api/movimientos-tesoreria");
  assert.deepEqual(r.data[0].documentoRef, { codigo: fp.codigo, comprobante: "F001-7", tercero: fp.proveedorRazonSocial });
  assert.equal(r.data[0].cuenta.nombre, "BCP Soles");
});
```

- [ ] **Step 2: Correr y verificar que falla** — Run: `cd Backend && node --test test/tesoreriaVistas.test.js` — Expected: FAIL (`Cannot find module '../src/routes/tesoreria.js'`).

- [ ] **Step 3: Rutas de vistas**

`Backend/src/routes/tesoreria.js`:
```js
import { Router } from "express";
import authMiddleware from "../middleware/authMiddleware.js";
import puedeTesoreria from "../middleware/puedeTesoreria.js";
import OrdenCompraProveedor from "../models/OrdenCompraProveedor.js";
import FacturaProveedor from "../models/FacturaProveedor.js";
import Factura from "../models/Factura.js";
import { populateFP } from "./facturasProveedor.js";
import { round2 } from "../utils/impuesto.js";

const router = Router();
router.use(authMiddleware, puedeTesoreria);

router.get("/por-pagar", async (req, res, next) => {
  try {
    const [ocps, facturas] = [
      await OrdenCompraProveedor.find({ anulada: false }, "codigo fecha proveedor proveedorRazonSocial proveedorRuc moneda subtotal total formaPago montoFacturado saldoPorFacturar items.tipo").sort({ fecha: -1 }),
      await FacturaProveedor.find({ anulada: false }).populate(populateFP).sort({ fechaEmision: -1 }),
    ];
    const filas = ocps.map((o) => {
      const propias = facturas.filter((f) => String(f.ordenCompraProveedor?._id || f.ordenCompraProveedor) === String(o._id));
      const pendientes = propias.filter((f) => f.estado !== "pagada" && f.fechaVencimiento);
      const { items, ...ocp } = o.toObject();
      return {
        ...ocp,
        // Sugerencia de detracción al registrar la factura (servicios > S/ 700).
        hayServicios: items.some((i) => i.tipo === "servicio"),
        saldoPorFacturar: o.saldoPorFacturar ?? o.subtotal,
        saldoNeto: round2(propias.reduce((s, f) => s + f.saldoNeto, 0)),
        saldoImpuesto: round2(propias.reduce((s, f) => s + f.saldoImpuesto, 0)),
        proximoVencimiento: pendientes.length ? new Date(Math.min(...pendientes.map((f) => f.fechaVencimiento.getTime()))) : null,
        facturas: propias.map((f) => f._id),
      };
    });
    res.json({ ocps: filas, facturas });
  } catch (err) { next(err); }
});

router.get("/por-cobrar", async (req, res, next) => {
  try {
    const facturas = await Factura.find({ anulado: { $ne: true } })
      .populate({ path: "empresa", select: "alias razonSocial ruc" })
      .sort({ fechaEmision: -1 });
    res.json(facturas);
  } catch (err) { next(err); }
});

export default router;
```

En `Backend/src/index.js`:
```js
import tesoreriaRoutes from "./routes/tesoreria.js";
```
```js
app.use("/api/tesoreria", tesoreriaRoutes);
```

- [ ] **Step 4: Pagos antiguos solo sin OCP**

En `Backend/src/routes/requerimientos.js`:
1. Import: `import SolicitudCompra from "../models/SolicitudCompra.js";`
2. En `router.patch("/:id/items/:itemId/pagar", …)`, después de `if (!item) return res.status(404)…` agregar:
```js
    const enCompras = await SolicitudCompra.exists({ requerimiento: requerimiento._id, items: { $elemMatch: { origenItemId: item._id, ordenCompraProveedor: { $ne: null } } } });
    if (enCompras) return res.status(400).json({ mensaje: "Este ítem tiene OC a proveedor — se paga desde Tesorería" });
```

En `Backend/src/routes/serviciosExternos.js`:
1. Import: `import SolicitudCompra from "../models/SolicitudCompra.js";`
2. En `router.patch("/:id/pagar", …)`, después de `if (!existente) return res.status(404)…` agregar:
```js
    if (await SolicitudCompra.exists({ servicioExterno: existente._id, "items.ordenCompraProveedor": { $ne: null } })) {
      return res.status(400).json({ mensaje: "Este servicio tiene OC a proveedor — se paga desde Tesorería" });
    }
```

- [ ] **Step 5: Referencia del documento en el libro de movimientos**

En `Backend/src/routes/movimientosTesoreria.js`, imports `import FacturaProveedor from "../models/FacturaProveedor.js";` y `import Factura from "../models/Factura.js";`, y reemplazar el `router.get("/", …)` por:
```js
// El movimiento guarda solo { tipo, id } del documento (dos colecciones), así
// que el comprobante y el tercero se resuelven aquí para el libro.
router.get("/", async (req, res, next) => {
  try {
    const movs = await MovimientoTesoreria.find().populate(populate).sort({ fecha: -1, _id: -1 }).lean();
    const ids = (tipo) => movs.filter((m) => m.documento.tipo === tipo).map((m) => m.documento.id);
    const [fps, fvs] = await Promise.all([
      FacturaProveedor.find({ _id: { $in: ids("facturaProveedor") } }, "codigo serie numero proveedorRazonSocial").lean(),
      Factura.find({ _id: { $in: ids("facturaVenta") } }, "codigo numeroFactura empresa").populate({ path: "empresa", select: "razonSocial" }).lean(),
    ]);
    const refs = new Map([
      ...fps.map((f) => [String(f._id), { codigo: f.codigo, comprobante: `${f.serie}-${f.numero}`, tercero: f.proveedorRazonSocial }]),
      ...fvs.map((f) => [String(f._id), { codigo: f.codigo, comprobante: f.numeroFactura, tercero: f.empresa?.razonSocial || "" }]),
    ]);
    res.json(movs.map((m) => ({ ...m, documentoRef: refs.get(String(m.documento.id)) || null })));
  } catch (err) { next(err); }
});
```

- [ ] **Step 6: Correr** — Run: `cd Backend && npm test` — Expected: PASS.

- [ ] **Step 7: Commit**
```bash
git -C Backend add src/routes/tesoreria.js src/routes/requerimientos.js src/routes/serviciosExternos.js src/routes/movimientosTesoreria.js src/index.js test/tesoreriaVistas.test.js
git -C Backend commit -m "feat(tesoreria): vistas por pagar/por cobrar; pagos antiguos solo sin OCP" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Conciliación con el SIRE (HUB + archivo)

**Files:**
- Create: `Backend/src/services/sireHub.service.js`, `Backend/src/utils/sireParser.js`, `Backend/src/utils/conciliacionSire.js`, `Backend/src/models/PropuestaSire.js`, `Backend/src/routes/sire.js`, `Backend/test/fixtures/sire.js`
- Modify: `Backend/package.json` (dependencia `adm-zip`), `Backend/src/index.js`
- Test: `Backend/test/sire.test.js`

**Interfaces:**
- Produces:
  - `sireHub.service.js`: `solicitarDescargaPeriodo({ tipo: "RCE"|"RVIE", ruc, periodo }) → numTicket`, `consultarEstadoTicket({ ruc, numTicket, perIni, perFin }) → { terminado, estado, mensaje, archivoReporte }`, `descargarArchivo({ tipo, ruc, periodo, numTicket, nomArchivoReporte, codTipoArchivoReporte }) → Buffer` (portado de SIPAPP-IMAQUITEC; usa `HUB_BASE_URL`/`HUB_API_KEY`).
  - `sireParser.js`: `leerPropuesta(buffer) → [{ rucContraparte, razonSocial, tipo, serie, numero, fechaEmision, moneda, baseImponible, igv, total }]` — acepta ZIP (todos los .txt) o TXT; mapea columnas **por nombre de cabecera**.
  - `conciliacionSire.js`: `clave({ rucContraparte, tipo, serie, numero })`, `conciliar(propuesta[], registros[]) → [{ estado: "coincide"|"difiere"|"solo_sire"|"solo_sistema", clave, sire?, sistema?, diferencias: string[] }]`.
  - `PropuestaSire { libro, periodo, origen, estado: descargando|lista|error, numTicket, mensaje, fechaDescarga, descargadoPor, comprobantes[] }`.
  - Rutas: `POST /api/sire/:libro/:periodo/descargar`, `GET /api/sire/:libro/:periodo/estado`, `POST /api/sire/:libro/:periodo/archivo` (multipart `archivo`), `GET /api/sire/:libro/:periodo/conciliacion`.

- [ ] **Step 1: Dependencia** — Run: `cd Backend && npm install adm-zip@^0.6.0` — Expected: `added 1 package`.

- [ ] **Step 2: Fixtures y test que falla**

`Backend/test/fixtures/sire.js`:
```js
import AdmZip from "adm-zip";

// Cabeceras con el mismo texto que la propuesta SIRE (se leen por nombre, no
// por posición). Verificar contra un archivo real de INTALES en la Task 15.
const CAB_RCE = "RUC|Apellidos y Nombres o Razón social|Periodo|CAR SUNAT|Fecha de emisión|Fecha Vcto/Pago|Tipo CP/Doc.|Serie del CDP|Año|Nro CP o Doc. Nro Inicial (Rango)|Nro Final (Rango)|Tipo Doc Identidad|Nro Doc Identidad|Apellidos Nombres/ Razón  Social|BI Gravado DG|IGV / IPM DG|Total CP|Moneda|Tipo de Cambio";
const CAB_RVIE = "RUC|Apellidos y Nombres o Razón social|Periodo|CAR SUNAT|Fecha de emisión|Fecha Vcto/Pago|Tipo CP/Doc.|Serie del CDP|Nro CP o Doc. Nro Inicial (Rango)|Nro Final (Rango)|Tipo Doc Identidad|Nro Doc Identidad|Apellidos Nombres/ Razón  Social|BI Gravada|IGV / IPM|Total CP|Moneda|Tipo Cambio";

export const lineaRce = ({ ruc = "20100000001", serie = "F001", numero = "00000123", total = "354.00", igv = "54.00", base = "300.00", fecha = "28/09/2026" } = {}) =>
  `20600000000|INTALES SAC|202609|X|${fecha}||01|${serie}|2026|${numero}||6|${ruc}|PROVEEDOR A SAC|${base}|${igv}|${total}|PEN|1.000`;

export const lineaRvie = ({ ruc = "20100000003", serie = "F001", numero = "1", total = "1180.00" } = {}) =>
  `20600000000|INTALES SAC|202609|X|28/09/2026||01|${serie}|${numero}||6|${ruc}|CLIENTE SA|1000.00|180.00|${total}|PEN|1.000`;

export const zipDe = (cabecera, lineas) => {
  const zip = new AdmZip();
  zip.addFile("propuesta.txt", Buffer.from([cabecera, ...lineas].join("\r\n"), "latin1"));
  zip.addFile("vacio.txt", Buffer.from("", "latin1"));
  return zip.toBuffer();
};
export { CAB_RCE, CAB_RVIE };
```

`Backend/test/sire.test.js`:
```js
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { conectar, desconectar, limpiar, levantar } from "./helpers.js";
import { escenarioOCP } from "./escenarios.js";
import { CAB_RCE, lineaRce, zipDe } from "./fixtures/sire.js";
import { leerPropuesta } from "../src/utils/sireParser.js";
import { conciliar } from "../src/utils/conciliacionSire.js";
import licitacionesRoutes from "../src/routes/licitaciones.js";
import facturasProveedorRoutes from "../src/routes/facturasProveedor.js";
import sireRoutes from "../src/routes/sire.js";

let srv, hub;
before(async () => {
  await conectar();
  // HUB falso: sync → ticket, ticket → terminado, archivo → ZIP de ejemplo.
  const app = express();
  app.post("/v1/sire/compras/sync", (req, res) => res.json({ numTicket: "T-1" }));
  app.get("/v1/sire/ticket/T-1", (req, res) => res.json({ terminado: true, estado: "06", mensaje: "OK", archivoReporte: { nomArchivoReporte: "x.zip", codTipoArchivoReporte: "00" } }));
  app.get("/v1/sire/compras/archivo", (req, res) => res.send(zipDe(CAB_RCE, [lineaRce(), lineaRce({ numero: "999", ruc: "20999999999" })])));
  hub = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
  process.env.HUB_BASE_URL = `http://127.0.0.1:${hub.address().port}`;
  process.env.HUB_API_KEY = "test";
  process.env.RUC_EMISOR = "20600000000";
  srv = await levantar({ "/api/licitaciones": licitacionesRoutes, "/api/facturas-proveedor": facturasProveedorRoutes, "/api/sire": sireRoutes });
});
after(async () => { await srv.cerrar(); await new Promise((r) => hub.close(r)); await desconectar(); });
beforeEach(limpiar);

test("el parser lee todos los .txt del ZIP por nombre de columna", () => {
  const filas = leerPropuesta(zipDe(CAB_RCE, [lineaRce()]));
  assert.equal(filas.length, 1);
  assert.deepEqual(
    { ruc: filas[0].rucContraparte, tipo: filas[0].tipo, serie: filas[0].serie, numero: filas[0].numero, total: filas[0].total, igv: filas[0].igv, fecha: filas[0].fechaEmision.slice(0, 10) },
    { ruc: "20100000001", tipo: "01", serie: "F001", numero: "123", total: 354, igv: 54, fecha: "2026-09-28" }
  );
});

test("conciliar clasifica en los cuatro resultados y normaliza serie y número", () => {
  const sire = [
    { rucContraparte: "20100000001", tipo: "01", serie: "F001", numero: "123", total: 354, igv: 54, fechaEmision: "2026-09-28", moneda: "PEN" },
    { rucContraparte: "20100000001", tipo: "01", serie: "f001 ", numero: "0000124", total: 100, igv: 18, fechaEmision: "2026-09-28", moneda: "PEN" },
    { rucContraparte: "20999999999", tipo: "01", serie: "E001", numero: "1", total: 50, igv: 9, fechaEmision: "2026-09-28", moneda: "PEN" },
  ];
  const sistema = [
    { rucContraparte: "20100000001", tipo: "01", serie: "F001", numero: "123", total: 354, igv: 54, fechaEmision: "2026-09-28", moneda: "PEN" },
    { rucContraparte: "20100000001", tipo: "01", serie: "F001", numero: "124", total: 118, igv: 18, fechaEmision: "2026-09-28", moneda: "PEN" },
    { rucContraparte: "20100000002", tipo: "01", serie: "F002", numero: "7", total: 10, igv: 0, fechaEmision: "2026-09-28", moneda: "PEN" },
  ];
  const r = conciliar(sire, sistema);
  const por = Object.fromEntries(r.map((x) => [x.clave, x]));
  assert.equal(por["20100000001|01|F001|123"].estado, "coincide");
  assert.equal(por["20100000001|01|F001|124"].estado, "difiere");
  assert.deepEqual(por["20100000001|01|F001|124"].diferencias, ["total"]);
  assert.equal(por["20999999999|01|E001|1"].estado, "solo_sire");
  assert.equal(por["20100000002|01|F002|7"].estado, "solo_sistema");
});

test("descarga por el HUB y concilia contra las facturas de proveedor registradas", async () => {
  const { ocp } = await escenarioOCP(srv);
  await srv.api("POST", "/api/facturas-proveedor", { body: { ordenCompraProveedor: ocp._id, tipoComprobante: "01", serie: "F001", numero: "123", fechaEmision: "2026-09-28", subtotal: 300, igv: 54, condicion: "contado", impuesto: { tipo: "ninguno" } } });
  const inicio = await srv.api("POST", "/api/sire/RCE/202609/descargar", { rol: "facturacion" });
  assert.equal(inicio.status, 200, JSON.stringify(inicio.data));
  const estado = await srv.api("GET", "/api/sire/RCE/202609/estado");
  assert.equal(estado.data.estado, "lista");
  assert.equal(estado.data.totalComprobantes, 2);
  const conc = await srv.api("GET", "/api/sire/RCE/202609/conciliacion");
  assert.deepEqual(conc.data.map((c) => c.estado).sort(), ["coincide", "solo_sire"]);
});

test("carga manual del archivo reemplaza la propuesta del periodo", async () => {
  const fd = new FormData();
  fd.append("archivo", new Blob([zipDe(CAB_RCE, [lineaRce()])], { type: "application/zip" }), "propuesta.zip");
  const r = await srv.api("POST", "/api/sire/RCE/202609/archivo", { formData: fd });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  assert.equal(r.data.totalComprobantes, 1);
  assert.equal(r.data.origen, "archivo");
});
```

- [ ] **Step 3: Correr y verificar que falla** — Run: `cd Backend && node --test test/sire.test.js` — Expected: FAIL (`Cannot find module '../src/utils/sireParser.js'`).

- [ ] **Step 4: Cliente del HUB** — `Backend/src/services/sireHub.service.js` (portado de `SIPAPP-IMAQUITEC/Backend/src/services/sireHub.service.js`, solo las funciones usadas):
```js
// Cliente del HUB SUNAT para SIRE (mismo HUB que la GRE/CPE): el HUB resuelve
// las credenciales SOL por RUC; el ERP solo manda su API key (HUB_API_KEY).
// Portado de SIPAPP-IMAQUITEC/Backend/src/services/sireHub.service.js.
const BASE = () => process.env.HUB_BASE_URL;
const KEY = () => process.env.HUB_API_KEY;

async function _call(url, options = {}, { binary = false } = {}) {
  const res = await fetch(url, {
    ...options,
    headers: { Authorization: `Bearer ${KEY()}`, ...(binary ? {} : { "Content-Type": "application/json" }), ...options.headers },
  });
  if (binary) {
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw Object.assign(new Error(`Hub SUNAT: ${body?.error || `HTTP ${res.status}`}`), { status: 502 });
    }
    return Buffer.from(await res.arrayBuffer());
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(`Hub SUNAT: ${body?.error || `HTTP ${res.status}`}`), { status: 502 });
  return body;
}

const ruta = (tipo) => (tipo === "RCE" ? "compras" : "ventas");

export async function solicitarDescargaPeriodo({ tipo, ruc, periodo }) {
  const body = await _call(`${BASE()}/v1/sire/${ruta(tipo)}/sync`, { method: "POST", body: JSON.stringify({ ruc, periodo }) });
  return body.numTicket;
}

export async function consultarEstadoTicket({ ruc, numTicket, perIni, perFin }) {
  const qs = new URLSearchParams({ ruc, perIni, perFin }).toString();
  const body = await _call(`${BASE()}/v1/sire/ticket/${numTicket}?${qs}`);
  return { terminado: body.terminado, estado: body.estado, mensaje: body.mensaje, archivoReporte: body.archivoReporte };
}

export async function descargarArchivo({ tipo, ruc, periodo, numTicket, nomArchivoReporte, codTipoArchivoReporte }) {
  const qs = new URLSearchParams({ ruc, periodo, numTicket, nomArchivoReporte, codTipoArchivoReporte }).toString();
  return _call(`${BASE()}/v1/sire/${ruta(tipo)}/archivo?${qs}`, {}, { binary: true });
}
```

- [ ] **Step 5: Parser por cabecera** — `Backend/src/utils/sireParser.js`:
```js
import AdmZip from "adm-zip";
import { errorHttp } from "./errorHttp.js";

const norm = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
const numero = (v) => Number(String(v || "").replace(/,/g, "")) || 0;

// El ZIP de SUNAT trae varios .txt (uno puede venir vacío): se leen todos.
function textos(buffer) {
  const esZip = buffer.length > 2 && buffer[0] === 0x50 && buffer[1] === 0x4b;
  if (!esZip) return [buffer.toString("latin1")];
  const zip = new AdmZip(buffer);
  return zip.getEntries().filter((e) => e.entryName.toLowerCase().endsWith(".txt")).map((e) => zip.readAsText(e, "latin1"));
}

// Índice de columna por nombre de cabecera. La razón social y el documento de
// identidad de la CONTRAPARTE son las últimas columnas con ese nombre (las
// primeras son las de la propia empresa).
function mapaColumnas(cabecera) {
  const h = cabecera.split("|").map(norm);
  const primera = (f) => h.findIndex(f);
  const ultima = (f) => h.length - 1 - [...h].reverse().findIndex(f);
  const idx = {
    fechaEmision: primera((c) => c.startsWith("fecha de emision")),
    tipo: primera((c) => c.startsWith("tipo cp")),
    serie: primera((c) => c.startsWith("serie")),
    numero: primera((c) => c.startsWith("nro cp") || c.includes("nro inicial")),
    rucContraparte: ultima((c) => c.includes("nro doc identidad")),
    razonSocial: ultima((c) => c.includes("razon social")),
    baseImponible: primera((c) => c.startsWith("bi grav")),
    igv: primera((c) => c.startsWith("igv")),
    total: primera((c) => c.startsWith("total cp")),
    moneda: primera((c) => c === "moneda"),
  };
  const faltan = ["fechaEmision", "tipo", "serie", "numero", "rucContraparte", "total"].filter((k) => idx[k] < 0 || idx[k] >= h.length);
  if (faltan.length) throw errorHttp(400, `Formato SIRE no reconocido: faltan columnas ${faltan.join(", ")}`);
  return idx;
}

const fechaIso = (v) => {
  const [d, m, a] = String(v || "").split("/");
  return a ? `${a}-${m.padStart(2, "0")}-${d.padStart(2, "0")}T12:00:00-05:00` : null;
};

export function leerPropuesta(buffer) {
  const filas = [];
  for (const texto of textos(buffer)) {
    const lineas = texto.split(/\r?\n/).filter((l) => l.trim());
    if (lineas.length < 2) continue;
    const idx = mapaColumnas(lineas[0]);
    for (const linea of lineas.slice(1)) {
      const c = linea.split("|");
      filas.push({
        rucContraparte: c[idx.rucContraparte]?.trim() || "",
        razonSocial: idx.razonSocial >= 0 ? c[idx.razonSocial]?.trim() || "" : "",
        tipo: c[idx.tipo]?.trim() || "",
        serie: c[idx.serie]?.trim().toUpperCase() || "",
        numero: String(c[idx.numero] || "").trim().replace(/^0+(?=\d)/, ""),
        fechaEmision: fechaIso(c[idx.fechaEmision]),
        moneda: idx.moneda >= 0 ? c[idx.moneda]?.trim() || "PEN" : "PEN",
        baseImponible: idx.baseImponible >= 0 ? numero(c[idx.baseImponible]) : 0,
        igv: idx.igv >= 0 ? numero(c[idx.igv]) : 0,
        total: numero(c[idx.total]),
      });
    }
  }
  return filas;
}
```

- [ ] **Step 6: Conciliación pura** — `Backend/src/utils/conciliacionSire.js`:
```js
const TOLERANCIA = 0.1;

export const clave = ({ rucContraparte, tipo, serie, numero }) =>
  [String(rucContraparte).trim(), String(tipo).trim(), String(serie).trim().toUpperCase(), String(numero).trim().replace(/^0+(?=\d)/, "")].join("|");

function diferencias(a, b) {
  const d = [];
  if (Math.abs(Number(a.total) - Number(b.total)) > TOLERANCIA) d.push("total");
  if (Math.abs(Number(a.igv) - Number(b.igv)) > TOLERANCIA) d.push("igv");
  if (String(a.fechaEmision).slice(0, 10) !== String(b.fechaEmision).slice(0, 10)) d.push("fecha");
  if ((a.moneda || "PEN") !== (b.moneda || "PEN")) d.push("moneda");
  return d;
}

export function conciliar(propuesta, registros) {
  const delSistema = new Map(registros.map((r) => [clave(r), r]));
  const resultado = [];
  for (const s of propuesta) {
    const k = clave(s);
    const r = delSistema.get(k);
    if (!r) { resultado.push({ estado: "solo_sire", clave: k, sire: s, diferencias: [] }); continue; }
    delSistema.delete(k);
    const d = diferencias(s, r);
    resultado.push({ estado: d.length ? "difiere" : "coincide", clave: k, sire: s, sistema: r, diferencias: d });
  }
  for (const [k, r] of delSistema) resultado.push({ estado: "solo_sistema", clave: k, sistema: r, diferencias: [] });
  return resultado;
}
```
Las fechas se comparan como `YYYY-MM-DD` de hora Lima: al armar los registros del sistema usar `fechaLima()` (Step 8).

- [ ] **Step 7: Modelo** — `Backend/src/models/PropuestaSire.js`:
```js
import mongoose from "mongoose";

// Propuesta SIRE descargada (compras RCE / ventas RVIE) de un periodo.
// Una por libro y periodo; descargarla de nuevo la reemplaza.
const comprobanteSchema = new mongoose.Schema({
  rucContraparte: String, razonSocial: String, tipo: String, serie: String, numero: String,
  fechaEmision: String, moneda: String, baseImponible: Number, igv: Number, total: Number,
}, { _id: false });

const propuestaSireSchema = new mongoose.Schema(
  {
    libro: { type: String, enum: ["RCE", "RVIE"], required: true },
    periodo: { type: String, required: true, match: /^\d{6}$/ },
    origen: { type: String, enum: ["api", "archivo"], required: true },
    estado: { type: String, enum: ["descargando", "lista", "error"], default: "descargando" },
    numTicket: { type: String, default: "" },
    mensaje: { type: String, default: "" },
    fechaDescarga: { type: Date, default: null },
    descargadoPor: { type: String, default: "" },
    comprobantes: [comprobanteSchema],
  },
  { timestamps: true }
);

propuestaSireSchema.index({ libro: 1, periodo: 1 }, { unique: true });

export default mongoose.model("PropuestaSire", propuestaSireSchema);
```

- [ ] **Step 8: Rutas** — `Backend/src/routes/sire.js`:
```js
import { Router } from "express";
import multer from "multer";
import authMiddleware from "../middleware/authMiddleware.js";
import puedeTesoreria from "../middleware/puedeTesoreria.js";
import PropuestaSire from "../models/PropuestaSire.js";
import FacturaProveedor from "../models/FacturaProveedor.js";
import Comprobante from "../models/Comprobante.js";
import { getEmisor } from "../utils/emisorSunat.js";
import { leerPropuesta } from "../utils/sireParser.js";
import { conciliar } from "../utils/conciliacionSire.js";
import { solicitarDescargaPeriodo, consultarEstadoTicket, descargarArchivo } from "../services/sireHub.service.js";

const router = Router();
router.use(authMiddleware, puedeTesoreria);

// El archivo SIRE no se guarda en disco: solo se lee y se normaliza.
const uploadMemoria = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

const fechaLima = (d) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" }).format(new Date(d));
const resumen = (p) => ({ libro: p.libro, periodo: p.periodo, origen: p.origen, estado: p.estado, mensaje: p.mensaje, fechaDescarga: p.fechaDescarga, totalComprobantes: p.comprobantes.length });

function validar(req, res) {
  const { libro, periodo } = req.params;
  if (!["RCE", "RVIE"].includes(libro) || !/^\d{6}$/.test(periodo)) {
    res.status(400).json({ mensaje: "Libro o periodo inválido (RCE|RVIE y AAAAMM)" });
    return false;
  }
  return true;
}

async function guardarPropuesta({ libro, periodo, origen, comprobantes, usuario, numTicket = "" }) {
  return PropuestaSire.findOneAndUpdate(
    { libro, periodo },
    { $set: { origen, estado: "lista", mensaje: "", numTicket, comprobantes, fechaDescarga: new Date(), descargadoPor: usuario } },
    { upsert: true, new: true }
  );
}

router.post("/:libro/:periodo/descargar", async (req, res, next) => {
  try {
    if (!validar(req, res)) return;
    const { libro, periodo } = req.params;
    const { ruc } = getEmisor();
    const numTicket = await solicitarDescargaPeriodo({ tipo: libro, ruc, periodo });
    const p = await PropuestaSire.findOneAndUpdate(
      { libro, periodo },
      { $set: { origen: "api", estado: "descargando", numTicket, mensaje: "Solicitud enviada a SUNAT", descargadoPor: req.usuario.nombre } },
      { upsert: true, new: true }
    );
    res.json(resumen(p));
  } catch (err) { next(err); }
});

router.get("/:libro/:periodo/estado", async (req, res, next) => {
  try {
    if (!validar(req, res)) return;
    const { libro, periodo } = req.params;
    const p = await PropuestaSire.findOne({ libro, periodo });
    if (!p) return res.json({ libro, periodo, estado: "sin_datos", totalComprobantes: 0 });
    if (p.estado !== "descargando") return res.json(resumen(p));
    const { ruc } = getEmisor();
    const est = await consultarEstadoTicket({ ruc, numTicket: p.numTicket, perIni: periodo, perFin: periodo });
    if (!est.terminado) {
      p.mensaje = est.mensaje || "SUNAT sigue procesando";
      await p.save();
      return res.json(resumen(p));
    }
    if (!est.archivoReporte) {
      p.estado = "error";
      p.mensaje = "SUNAT terminó el ticket sin archivo";
      await p.save();
      return res.json(resumen(p));
    }
    const zip = await descargarArchivo({ tipo: libro, ruc, periodo, numTicket: p.numTicket, ...est.archivoReporte });
    const guardada = await guardarPropuesta({ libro, periodo, origen: "api", comprobantes: leerPropuesta(zip), usuario: p.descargadoPor, numTicket: p.numTicket });
    res.json(resumen(guardada));
  } catch (err) { next(err); }
});

router.post("/:libro/:periodo/archivo", uploadMemoria.single("archivo"), async (req, res, next) => {
  try {
    if (!validar(req, res)) return;
    if (!req.file) return res.status(400).json({ mensaje: "Adjunta el ZIP o TXT descargado del SIRE" });
    const { libro, periodo } = req.params;
    const p = await guardarPropuesta({ libro, periodo, origen: "archivo", comprobantes: leerPropuesta(req.file.buffer), usuario: req.usuario.nombre });
    res.status(201).json(resumen(p));
  } catch (err) { next(err); }
});

async function registrosDelSistema(libro, periodo) {
  const desde = new Date(`${periodo.slice(0, 4)}-${periodo.slice(4)}-01T00:00:00-05:00`);
  const hasta = new Date(desde); hasta.setMonth(hasta.getMonth() + 1);
  if (libro === "RCE") {
    const fps = await FacturaProveedor.find({ anulada: false, fechaEmision: { $gte: desde, $lt: hasta } });
    return fps.map((f) => ({ rucContraparte: f.proveedorRuc, razonSocial: f.proveedorRazonSocial, tipo: f.tipoComprobante, serie: f.serie, numero: f.numero, fechaEmision: fechaLima(f.fechaEmision), moneda: f.moneda, igv: f.igv, total: f.total, id: f._id }));
  }
  const cps = await Comprobante.find({ environment: "produccion", tipoDoc: { $in: ["01", "03", "07", "08"] }, estado: { $in: ["ACEPTADO", "ANULADO"] }, fechaEmision: { $gte: desde, $lt: hasta } });
  return cps.map((c) => ({ rucContraparte: c.receptor?.numDoc, razonSocial: c.receptor?.nombre, tipo: c.tipoDoc, serie: c.serie, numero: String(c.correlativo), fechaEmision: fechaLima(c.fechaEmision), moneda: c.totales?.moneda || "PEN", igv: c.totales?.totalIGV || 0, total: c.totales?.totalPagar || 0, id: c._id }));
}

router.get("/:libro/:periodo/conciliacion", async (req, res, next) => {
  try {
    if (!validar(req, res)) return;
    const { libro, periodo } = req.params;
    const p = await PropuestaSire.findOne({ libro, periodo, estado: "lista" });
    if (!p) return res.status(404).json({ mensaje: "Aún no hay propuesta SIRE descargada para ese periodo" });
    const sire = p.comprobantes.map((c) => ({ ...c.toObject(), fechaEmision: c.fechaEmision ? fechaLima(c.fechaEmision) : "" }));
    res.json(conciliar(sire, await registrosDelSistema(libro, periodo)));
  } catch (err) { next(err); }
});

export default router;
```

En `Backend/src/index.js`:
```js
import sireRoutes from "./routes/sire.js";
```
```js
app.use("/api/sire", sireRoutes);
```

- [ ] **Step 9: Correr** — Run: `cd Backend && npm test` — Expected: PASS.

- [ ] **Step 10: Commit**
```bash
git -C Backend add package.json package-lock.json src/services/sireHub.service.js src/utils/sireParser.js src/utils/conciliacionSire.js src/models/PropuestaSire.js src/routes/sire.js src/index.js test/fixtures/sire.js test/sire.test.js
git -C Backend commit -m "feat(tesoreria): conciliación SIRE (HUB o archivo) contra facturas registradas" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Script de preparación de Tesorería

**Files:**
- Create: `Backend/src/scripts/prepararTesoreria.js`
- Test: `Backend/test/prepararTesoreria.test.js`

**Interfaces:**
- Produces: `prepararTesoreria() → { cuentasCreadas, facturasVenta }`; ejecutable con `node src/scripts/prepararTesoreria.js`.

- [ ] **Step 1: Escribir el test que falla**

`Backend/test/prepararTesoreria.test.js`:
```js
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { conectar, desconectar } from "./helpers.js";
import { prepararTesoreria } from "../src/scripts/prepararTesoreria.js";
import CuentaTesoreria from "../src/models/CuentaTesoreria.js";
import Configuracion from "../src/models/Configuracion.js";
import Factura from "../src/models/Factura.js";

before(conectar);
after(desconectar);

test("siembra cuentas y configuración, arma el impuesto de ventas existentes; idempotente", async () => {
  // Factura "de antes": detracción fija sin bloque impuesto, sin saldos.
  await Factura.collection.insertOne({ codigo: "FAC-001", numeroFactura: "F001-1", subtotal: 1000, igv: 180, total: 1180, detraccion: 142, totalAPagar: 1038, montoPagado: 1038, estadoPago: "pagado", cuotas: [], anulado: false });
  const r1 = await prepararTesoreria();
  assert.equal(r1.cuentasCreadas, 5);
  assert.equal(r1.facturasVenta, 1);
  const f = await Factura.findOne({ codigo: "FAC-001" });
  assert.equal(f.impuesto.tipo, "detraccion");
  assert.equal(f.impuesto.monto, 142);
  assert.equal(f.saldoNeto, 1038); // los pagos manuales anteriores no se migran (versión 0)
  assert.equal((await Configuracion.obtener()).esAgenteRetencion, false);
  const r2 = await prepararTesoreria();
  assert.equal(r2.cuentasCreadas, 0);
  assert.equal(await CuentaTesoreria.countDocuments(), 5);
});
```

- [ ] **Step 2: Correr y verificar que falla** — Run: `cd Backend && node --test test/prepararTesoreria.test.js` — Expected: FAIL (`Cannot find module`).

- [ ] **Step 3: Implementar** — `Backend/src/scripts/prepararTesoreria.js`:
```js
// Preparación de Tesorería (spec B1). Idempotente. Versión 0: los pagos
// manuales anteriores de ventas NO se migran a movimientos.
// Uso: node src/scripts/prepararTesoreria.js
import "dotenv/config";
import mongoose from "mongoose";
import { pathToFileURL } from "url";
import connectDB from "../config/db.js";
import CuentaTesoreria from "../models/CuentaTesoreria.js";
import Configuracion from "../models/Configuracion.js";
import Factura from "../models/Factura.js";
import { recalcularFacturaVenta, impuestoVentaPorDefecto } from "../utils/saldosTesoreria.js";

const CUENTAS = [
  { nombre: "Caja", tipo: "caja", moneda: "PEN" },
  { nombre: "BCP Soles", tipo: "banco", moneda: "PEN" },
  { nombre: "BCP Dólares", tipo: "banco", moneda: "USD" },
  { nombre: "Banco de la Nación – Detracciones", tipo: "detracciones", moneda: "PEN" },
  { nombre: "Sin especificar", tipo: "banco", moneda: "PEN" },
];

export async function prepararTesoreria() {
  let cuentasCreadas = 0;
  for (const c of CUENTAS) {
    const r = await CuentaTesoreria.updateOne({ nombre: c.nombre }, { $setOnInsert: c }, { upsert: true });
    cuentasCreadas += r.upsertedCount;
  }
  await Configuracion.obtener();

  const facturas = await Factura.find({ anulado: { $ne: true } });
  for (const f of facturas) {
    if (!f.impuesto?.tipo || (f.impuesto.tipo === "ninguno" && f.detraccion > 0)) {
      f.impuesto = impuestoVentaPorDefecto(f.total);
    }
    await recalcularFacturaVenta(f);
  }
  return { cuentasCreadas, facturasVenta: facturas.length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await connectDB();
  console.log(await prepararTesoreria());
  await mongoose.disconnect();
}
```

- [ ] **Step 4: Correr** — Run: `cd Backend && npm test` — Expected: PASS (suite completa).

- [ ] **Step 5: Commit**
```bash
git -C Backend add src/scripts/prepararTesoreria.js test/prepararTesoreria.test.js
git -C Backend commit -m "feat(tesoreria): script de preparación (cuentas, configuración, impuesto de ventas)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## FRONTEND

> Convenciones para todas las tasks de frontend: `fetchAuth(ruta, opciones)` antepone `/api` y pone `Content-Type: application/json`; `uploadAuth(ruta, formData)` hace POST multipart. Estado de formularios en un solo objeto + `set(campo)`. Cargas con `useCallback(() => fetchAuth(...).then(...))` y `useEffect(() => { cargar(); }, [cargar])`. Clases de inputs: `const INP = "border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300";`. Verificación de cada task de componentes: `npm run lint` (sin errores nuevos: los de `cotizacionPdf.js` y `Requerimientos.jsx` ya existían) y `npm run build`.

### Task 9: Lógica pura de Tesorería (`utils/tesoreria.js`)

**Files:**
- Create: `Frontend/src/utils/tesoreria.js`, `Frontend/src/utils/tesoreria.test.js`

**Interfaces:**
- Consumes: `DETRACCION_BIENES_SERVICIOS` (`utils/catalogosSunat.js`), `round2` (`utils/compras.js`).
- Produces: `UMBRAL_IMPUESTO`, `CODIGO_SERVICIOS`, `CODIGOS_DETRACCION`, `calcularImpuesto`, `partes`, `tipoMovimientoEsperado` (espejo exacto del backend, Task 2); `sugerirImpuesto({ total, moneda, tipoCambio, hayServicios, esAgenteRetencion, noAplicaRetencion }) → { tipo, codigoSunat }`; `impuestoVentaPorDefecto(total) → { tipo, codigoSunat, tasa, monto }`; `etiquetaImpuesto(impuesto) → string`; `diasCredito(formaPago) → number`; `sumarDias("YYYY-MM-DD", n) → "YYYY-MM-DD"`; `vencimientoDe(f, lado)`; `semaforo(fechaVencimiento, pendiente: boolean, hoyIso) → "vencida"|"por_vencer"|"al_dia"|null`; `FILTROS_TESORERIA`; `filtrarFacturas(lista, filtros, { lado, hoyIso })`; `totalesMovimientos(movs) → { ingresos, egresos }` (S/); `cuentasPara({ cuentas, lado, concepto, impuesto }) → { origen, destino }`; `periodoDeMes("YYYY-MM") → "AAAAMM"`.

- [ ] **Step 1: Escribir el test que falla**

`Frontend/src/utils/tesoreria.test.js`:
```js
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  calcularImpuesto, partes, tipoMovimientoEsperado, sugerirImpuesto, impuestoVentaPorDefecto, etiquetaImpuesto,
  diasCredito, sumarDias, vencimientoDe, semaforo, filtrarFacturas, FILTROS_TESORERIA, totalesMovimientos, cuentasPara, periodoDeMes,
} from "./tesoreria.js";

test("calcularImpuesto replica al backend: detracción entera en soles y retención 3 %", () => {
  assert.deepEqual(calcularImpuesto({ tipo: "detraccion", codigoSunat: "037", total: 1187.5 }), { tasa: 0.12, monto: 143 });
  assert.deepEqual(calcularImpuesto({ tipo: "detraccion", codigoSunat: "037", total: 1000, moneda: "USD", tipoCambio: 3.75 }), { tasa: 0.12, monto: 450 });
  assert.deepEqual(calcularImpuesto({ tipo: "retencion", total: 1180 }), { tasa: 0.03, monto: 35.4 });
  assert.deepEqual(calcularImpuesto({ tipo: "detraccion", codigoSunat: "002", total: 1000 }), { tasa: 0, monto: 0 });
  assert.deepEqual(calcularImpuesto({ tipo: "ninguno", total: 1000 }), { tasa: 0, monto: 0 });
});

test("partes descuenta el impuesto según quién deposita", () => {
  const det = { tipo: "detraccion", monto: 450, quienDeposita: "nosotros" };
  assert.deepEqual(partes({ lado: "compra", total: 1000, moneda: "USD", tipoCambio: 3.75, impuesto: det }), { neto: 880, impuesto: 450 });
  assert.deepEqual(partes({ lado: "compra", total: 1000, impuesto: { ...det, quienDeposita: "proveedor" } }), { neto: 1000, impuesto: 0 });
  assert.deepEqual(partes({ lado: "venta", total: 1180, impuesto: { tipo: "detraccion", monto: 142, quienDeposita: "cliente" } }), { neto: 1038, impuesto: 142 });
  assert.deepEqual(partes({ lado: "venta", total: 1180, impuesto: { tipo: "detraccion", monto: 142, quienDeposita: "nosotros" } }), { neto: 1180, impuesto: 142 });
  assert.equal(tipoMovimientoEsperado({ lado: "venta", concepto: "impuesto", impuesto: { tipo: "detraccion", quienDeposita: "nosotros" } }), "transferencia");
  assert.equal(tipoMovimientoEsperado({ lado: "venta", concepto: "impuesto", impuesto: { tipo: "retencion", quienDeposita: "cliente" } }), "retencion");
});

test("sugerirImpuesto: servicios > S/ 700 → detracción 037; si no, retención solo si somos agentes", () => {
  assert.deepEqual(sugerirImpuesto({ total: 800, hayServicios: true, esAgenteRetencion: true }), { tipo: "detraccion", codigoSunat: "037" });
  assert.deepEqual(sugerirImpuesto({ total: 800, hayServicios: false, esAgenteRetencion: true }), { tipo: "retencion", codigoSunat: "" });
  assert.deepEqual(sugerirImpuesto({ total: 800, hayServicios: false, esAgenteRetencion: true, noAplicaRetencion: true }), { tipo: "ninguno", codigoSunat: "" });
  assert.deepEqual(sugerirImpuesto({ total: 700, hayServicios: true, esAgenteRetencion: true }), { tipo: "ninguno", codigoSunat: "" });
  assert.deepEqual(sugerirImpuesto({ total: 200, moneda: "USD", tipoCambio: 3.8, hayServicios: true }), { tipo: "detraccion", codigoSunat: "037" });
});

test("impuesto de venta por defecto y etiqueta", () => {
  assert.deepEqual(impuestoVentaPorDefecto(1180), { tipo: "detraccion", codigoSunat: "037", tasa: 0.12, monto: 142 });
  assert.equal(impuestoVentaPorDefecto(700).tipo, "ninguno");
  assert.equal(etiquetaImpuesto({ tipo: "detraccion", tasa: 0.12 }), "Detracción 12%");
  assert.equal(etiquetaImpuesto({ tipo: "retencion", tasa: 0.03 }), "Retención 3%");
  assert.equal(etiquetaImpuesto(undefined), "Sin detracción / retención");
});

test("crédito, vencimiento y semáforo", () => {
  assert.equal(diasCredito("Factura a 30 días"), 30);
  assert.equal(diasCredito("CONTADO"), 0);
  assert.equal(sumarDias("2026-09-28", 30), "2026-10-28");
  assert.equal(semaforo("2026-09-27T05:00:00.000Z", true, "2026-09-28"), "vencida");
  assert.equal(semaforo("2026-10-05T05:00:00.000Z", true, "2026-09-28"), "por_vencer");
  assert.equal(semaforo("2026-10-20T05:00:00.000Z", true, "2026-09-28"), "al_dia");
  assert.equal(semaforo("2026-09-27T05:00:00.000Z", false, "2026-09-28"), null);
  const venta = { fechaCancelacion: "2026-11-30", cuotas: [{ numero: 1, pagado: true, fechaVencimiento: "2026-10-01" }, { numero: 2, pagado: false, fechaVencimiento: "2026-10-31" }] };
  assert.equal(vencimientoDe(venta, "venta"), "2026-10-31");
  assert.equal(vencimientoDe({ fechaVencimiento: "2026-10-10" }, "compra"), "2026-10-10");
});

test("filtrarFacturas por tercero, estado, vencimiento y fechas en ambos lados", () => {
  const fps = [
    { proveedorRazonSocial: "ACME SAC", proveedorRuc: "20100000001", estado: "pendiente", fechaEmision: "2026-09-01", fechaVencimiento: "2026-09-20", saldoNeto: 10, saldoImpuesto: 0 },
    { proveedorRazonSocial: "BETA SAC", proveedorRuc: "20100000002", estado: "pagada", fechaEmision: "2026-09-15", fechaVencimiento: "2026-09-30", saldoNeto: 0, saldoImpuesto: 0 },
  ];
  const hoyIso = "2026-09-28";
  assert.equal(filtrarFacturas(fps, { ...FILTROS_TESORERIA, tercero: "acme" }, { lado: "compra", hoyIso }).length, 1);
  assert.equal(filtrarFacturas(fps, { ...FILTROS_TESORERIA, tercero: "20100000002" }, { lado: "compra", hoyIso }).length, 1);
  assert.equal(filtrarFacturas(fps, { ...FILTROS_TESORERIA, estado: "pagada" }, { lado: "compra", hoyIso })[0].proveedorRazonSocial, "BETA SAC");
  assert.equal(filtrarFacturas(fps, { ...FILTROS_TESORERIA, vencimiento: "vencida" }, { lado: "compra", hoyIso }).length, 1);
  assert.equal(filtrarFacturas(fps, { ...FILTROS_TESORERIA, desde: "2026-09-10" }, { lado: "compra", hoyIso }).length, 1);
  const ventas = [{ empresa: { razonSocial: "CLIENTE SA", ruc: "20300000003" }, estadoPago: "pago parcial", fechaEmision: "2026-09-02", cuotas: [], saldoNeto: 5, saldoImpuesto: 0 }];
  assert.equal(filtrarFacturas(ventas, { ...FILTROS_TESORERIA, estado: "parcial", tercero: "cliente" }, { lado: "venta", hoyIso }).length, 1);
});

test("totales de movimientos en soles sin anulados ni transferencias", () => {
  const movs = [
    { tipo: "ingreso", monto: 100, moneda: "PEN", tipoCambio: 1 },
    { tipo: "egreso", monto: 10, moneda: "USD", tipoCambio: 3.75 },
    { tipo: "egreso", monto: 50, moneda: "PEN", tipoCambio: 1, anulado: true },
    { tipo: "transferencia", monto: 40, moneda: "PEN", tipoCambio: 1 },
  ];
  assert.deepEqual(totalesMovimientos(movs), { ingresos: 100, egresos: 37.5 });
});

test("cuentasPara filtra la cuenta de detracciones según la parte", () => {
  const cuentas = [
    { _id: "bcp", tipo: "banco", activo: true }, { _id: "caja", tipo: "caja", activo: true },
    { _id: "bn", tipo: "detracciones", activo: true }, { _id: "viejo", tipo: "banco", activo: false },
  ];
  const ids = (l) => l.map((c) => c._id);
  const detCliente = { tipo: "detraccion", quienDeposita: "cliente" };
  assert.deepEqual(ids(cuentasPara({ cuentas, lado: "compra", concepto: "neto", impuesto: detCliente }).origen), ["bcp", "caja"]);
  assert.deepEqual(ids(cuentasPara({ cuentas, lado: "venta", concepto: "impuesto", impuesto: detCliente }).origen), ["bn"]);
  const auto = cuentasPara({ cuentas, lado: "venta", concepto: "impuesto", impuesto: { tipo: "detraccion", quienDeposita: "nosotros" } });
  assert.deepEqual([ids(auto.origen), ids(auto.destino)], [["bcp", "caja"], ["bn"]]);
  assert.deepEqual(cuentasPara({ cuentas, lado: "venta", concepto: "impuesto", impuesto: { tipo: "retencion", quienDeposita: "cliente" } }), { origen: [], destino: [] });
  assert.equal(periodoDeMes("2026-09"), "202609");
});
```

- [ ] **Step 2: Correr y verificar que falla** — Run: `cd Frontend && npm test` — Expected: FAIL (`Cannot find module './tesoreria.js'`).

- [ ] **Step 3: Implementar** — `Frontend/src/utils/tesoreria.js`:
```js
import { DETRACCION_BIENES_SERVICIOS } from "./catalogosSunat.js";
import { round2 } from "./compras.js";

// Espejo de Backend/src/utils/impuesto.js: el backend recalcula siempre; esto
// es solo la vista previa de los formularios.
export const UMBRAL_IMPUESTO = 700;
export const TASA_RETENCION = 0.03;
export const CODIGO_SERVICIOS = "037";
export const CODIGOS_DETRACCION = DETRACCION_BIENES_SERVICIOS.filter((c) => c.porcentaje);

const aSoles = (total, moneda, tipoCambio) => (moneda === "USD" ? Number(total) * Number(tipoCambio || 1) : Number(total));

export function calcularImpuesto({ tipo, codigoSunat, total, moneda = "PEN", tipoCambio = 1 }) {
  if (!tipo || tipo === "ninguno") return { tasa: 0, monto: 0 };
  const soles = aSoles(total, moneda, tipoCambio);
  if (tipo === "detraccion") {
    const bien = CODIGOS_DETRACCION.find((c) => c.codigo === codigoSunat);
    if (!bien) return { tasa: 0, monto: 0 };
    const tasa = bien.porcentaje / 100;
    return { tasa, monto: Math.round(round2(soles * tasa)) };
  }
  return { tasa: TASA_RETENCION, monto: round2(soles * TASA_RETENCION) };
}

const seDescuenta = (lado, quienDeposita) => (lado === "compra" ? quienDeposita === "nosotros" : quienDeposita === "cliente");

export function partes({ lado, total, moneda = "PEN", tipoCambio = 1, impuesto }) {
  if (!impuesto || impuesto.tipo === "ninguno" || !impuesto.monto) return { neto: round2(total), impuesto: 0 };
  const enMonedaDoc = moneda === "USD" ? impuesto.monto / Number(tipoCambio) : impuesto.monto;
  const neto = seDescuenta(lado, impuesto.quienDeposita) ? round2(total - enMonedaDoc) : round2(total);
  const parteImpuesto = lado === "compra" && impuesto.quienDeposita === "proveedor" ? 0 : impuesto.monto;
  return { neto, impuesto: parteImpuesto };
}

export function tipoMovimientoEsperado({ lado, concepto, impuesto }) {
  if (lado === "compra") return "egreso";
  if (concepto === "neto") return "ingreso";
  if (impuesto?.tipo === "retencion") return "retencion";
  return impuesto?.quienDeposita === "cliente" ? "ingreso" : "transferencia";
}

export function sugerirImpuesto({ total, moneda = "PEN", tipoCambio = 1, hayServicios, esAgenteRetencion, noAplicaRetencion = false }) {
  if (aSoles(total, moneda, tipoCambio) <= UMBRAL_IMPUESTO) return { tipo: "ninguno", codigoSunat: "" };
  if (hayServicios) return { tipo: "detraccion", codigoSunat: CODIGO_SERVICIOS };
  if (esAgenteRetencion && !noAplicaRetencion) return { tipo: "retencion", codigoSunat: "" };
  return { tipo: "ninguno", codigoSunat: "" };
}

export function impuestoVentaPorDefecto(total) {
  if (Number(total) <= UMBRAL_IMPUESTO) return { tipo: "ninguno", codigoSunat: "", tasa: 0, monto: 0 };
  return { tipo: "detraccion", codigoSunat: CODIGO_SERVICIOS, ...calcularImpuesto({ tipo: "detraccion", codigoSunat: CODIGO_SERVICIOS, total }) };
}

export function etiquetaImpuesto(impuesto) {
  const pct = `${Math.round((impuesto?.tasa || 0) * 100)}%`;
  if (impuesto?.tipo === "detraccion") return `Detracción ${pct}`;
  if (impuesto?.tipo === "retencion") return `Retención ${pct}`;
  return "Sin detracción / retención";
}

export function diasCredito(formaPago) {
  const m = /(\d+)\s*d[ií]as/i.exec(String(formaPago || ""));
  return m ? Number(m[1]) : 0;
}

export function sumarDias(fechaIso, dias) {
  const [a, m, d] = fechaIso.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d + dias)).toISOString().slice(0, 10);
}

// Venta: la primera cuota impaga manda; sin cuotas, la fecha de cancelación.
export function vencimientoDe(f, lado) {
  if (lado === "compra") return f.fechaVencimiento || null;
  const cuota = [...(f.cuotas || [])].sort((a, b) => a.numero - b.numero).find((c) => !c.pagado);
  return cuota?.fechaVencimiento || f.fechaCancelacion || null;
}

export function semaforo(fechaVencimiento, pendiente, hoyIso) {
  if (!fechaVencimiento || !pendiente) return null;
  const venc = String(fechaVencimiento).slice(0, 10);
  if (venc < hoyIso) return "vencida";
  if (venc <= sumarDias(hoyIso, 7)) return "por_vencer";
  return "al_dia";
}

const ESTADO_VENTA = { "sin pago": "pendiente", "pago parcial": "parcial", pagado: "pagada" };
const estadoDe = (f, lado) => (lado === "compra" ? f.estado : ESTADO_VENTA[f.estadoPago] || "pendiente");
const terceroDe = (f, lado) => (lado === "compra"
  ? `${f.proveedorRazonSocial || ""} ${f.proveedorRuc || ""}`
  : `${f.empresa?.alias || ""} ${f.empresa?.razonSocial || ""} ${f.empresa?.ruc || ""}`).toLowerCase();

export const FILTROS_TESORERIA = { tercero: "", estado: "", vencimiento: "", desde: "", hasta: "" };

export function filtrarFacturas(lista, f, { lado, hoyIso }) {
  return lista.filter((x) => {
    const emision = String(x.fechaEmision || "").slice(0, 10);
    const pendiente = x.saldoNeto > 0.009 || x.saldoImpuesto > 0.009;
    return (!f.tercero || terceroDe(x, lado).includes(f.tercero.toLowerCase()))
      && (!f.estado || estadoDe(x, lado) === f.estado)
      && (!f.vencimiento || semaforo(vencimientoDe(x, lado), pendiente, hoyIso) === f.vencimiento)
      && (!f.desde || emision >= f.desde)
      && (!f.hasta || emision <= f.hasta);
  });
}

export function totalesMovimientos(movs) {
  return movs.filter((m) => !m.anulado).reduce((t, m) => {
    const soles = round2(m.monto * (m.moneda === "USD" ? m.tipoCambio : 1));
    if (m.tipo === "ingreso") t.ingresos = round2(t.ingresos + soles);
    if (m.tipo === "egreso") t.egresos = round2(t.egresos + soles);
    return t;
  }, { ingresos: 0, egresos: 0 });
}

// Mismas reglas que valida registrarMovimiento en el backend.
export function cuentasPara({ cuentas, lado, concepto, impuesto }) {
  const activas = cuentas.filter((c) => c.activo);
  const noBN = activas.filter((c) => c.tipo !== "detracciones");
  const bn = activas.filter((c) => c.tipo === "detracciones");
  const tipo = tipoMovimientoEsperado({ lado, concepto, impuesto });
  if (tipo === "retencion") return { origen: [], destino: [] };
  if (tipo === "transferencia") return { origen: noBN, destino: bn };
  if (lado === "venta" && concepto === "impuesto" && impuesto?.tipo === "detraccion") return { origen: bn, destino: [] };
  return { origen: noBN, destino: [] };
}

export const periodoDeMes = (mes) => String(mes || "").replace("-", "");
```

- [ ] **Step 4: Correr** — Run: `cd Frontend && npm test` — Expected: PASS (los tests de `compras.test.js` y `tesoreria.test.js`).

- [ ] **Step 5: Commit**
```bash
git -C Frontend add src/utils/tesoreria.js src/utils/tesoreria.test.js
git -C Frontend commit -m "feat(tesoreria): lógica pura de impuesto, vencimientos, filtros y cuentas" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Registrar pago/cobro y libro de movimientos

**Files:**
- Create: `Frontend/src/components/tesoreria/ModalMovimiento.jsx`, `Frontend/src/components/tesoreria/TablaMovimientos.jsx`

**Interfaces:**
- Consumes: `POST /movimientos-tesoreria`, `GET /movimientos-tesoreria` (con `documentoRef`, Task 6), `PATCH /movimientos-tesoreria/:id/anular`, `GET /cuentas-tesoreria`; Task 9.
- Produces: `<ModalMovimiento lado="compra"|"venta" documento={FacturaProveedor|Factura} onClose onGuardado={(mov) => …} />` (carga las cuentas por sí mismo); `<TablaMovimientos />`.

- [ ] **Step 1: Modal de pago/cobro** — `Frontend/src/components/tesoreria/ModalMovimiento.jsx`:
```jsx
import { useState, useEffect } from "react";
import { fetchAuth } from "../../utils/fetchAuth";
import { fechaHoyLima } from "../../utils/fecha";
import { money } from "../../utils/compras";
import { cuentasPara, tipoMovimientoEsperado, etiquetaImpuesto } from "../../utils/tesoreria";

const INP = "border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300 w-full";
const MEDIOS = [
  { valor: "transferencia", label: "Transferencia" }, { valor: "deposito", label: "Depósito" },
  { valor: "efectivo", label: "Efectivo" }, { valor: "cheque", label: "Cheque" },
];

// Registra un pago (compras) o cobro (ventas) de UNA parte del comprobante:
// el neto o el impuesto (detracción / retención), cada una con su saldo.
export default function ModalMovimiento({ lado, documento, onClose, onGuardado }) {
  const d = documento;
  const moneda = d.moneda || "PEN";
  const concepto0 = d.saldoNeto > 0.009 ? "neto" : "impuesto";
  const [cuentas, setCuentas] = useState([]);
  const [form, setForm] = useState({
    concepto: concepto0, monto: String(concepto0 === "neto" ? d.saldoNeto : d.saldoImpuesto), fecha: fechaHoyLima(),
    cuenta: "", cuentaDestino: "", medio: "transferencia", numeroOperacion: "",
  });
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchAuth("/cuentas-tesoreria").then(async (r) => { if (r.ok) setCuentas(await r.json()); });
  }, []);

  const set = (campo) => (e) => setForm((f) => ({ ...f, [campo]: e.target.value }));
  const elegirConcepto = (concepto) => setForm((f) => ({
    ...f, concepto, cuenta: "", cuentaDestino: "", monto: String(concepto === "neto" ? d.saldoNeto : d.saldoImpuesto),
  }));

  const tipo = tipoMovimientoEsperado({ lado, concepto: form.concepto, impuesto: d.impuesto });
  const { origen, destino } = cuentasPara({ cuentas, lado, concepto: form.concepto, impuesto: d.impuesto });
  const esDetraccion = form.concepto === "impuesto" && d.impuesto?.tipo === "detraccion";
  const etiquetaOperacion = tipo === "retencion" ? "N° de comprobante de retención"
    : esDetraccion ? "N° de constancia de depósito" : "N° de operación";
  const verbo = lado === "compra" ? "pago" : "cobro";

  const guardar = async () => {
    setGuardando(true);
    setError("");
    const body = {
      documento: { tipo: lado === "compra" ? "facturaProveedor" : "facturaVenta", id: d._id },
      concepto: form.concepto, monto: Number(form.monto), fecha: form.fecha, medio: form.medio, numeroOperacion: form.numeroOperacion,
    };
    if (tipo !== "retencion") body.cuenta = form.cuenta;
    if (tipo === "transferencia") body.cuentaDestino = form.cuentaDestino;
    const r = await fetchAuth("/movimientos-tesoreria", { method: "POST", body: JSON.stringify(body) });
    const data = await r.json().catch(() => ({}));
    setGuardando(false);
    if (!r.ok) return setError(data.mensaje || `No se pudo registrar el ${verbo}.`);
    onGuardado(data);
  };

  const parte = (concepto, titulo, saldo, mon) => (
    <label className={`flex-1 border rounded-lg p-3 cursor-pointer ${form.concepto === concepto ? "border-purple-500 bg-purple-50" : "border-gray-200"} ${saldo <= 0.009 ? "opacity-40 cursor-not-allowed" : ""}`}>
      <input type="radio" className="sr-only" disabled={saldo <= 0.009} checked={form.concepto === concepto} onChange={() => elegirConcepto(concepto)} />
      <p className="text-xs text-gray-500">{titulo}</p>
      <p className="font-semibold text-gray-800">{money(saldo, mon)}</p>
      <p className="text-[11px] text-gray-400">saldo</p>
    </label>
  );

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4" style={{ zIndex: 60 }}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 space-y-4">
        <div>
          <h3 className="text-lg font-bold text-gray-800">Registrar {verbo}</h3>
          <p className="text-xs text-gray-400">{d.codigo} · {d.serie ? `${d.serie}-${d.numero}` : d.numeroFactura}</p>
        </div>
        <div className="flex gap-3">
          {parte("neto", lado === "compra" ? "Neto al proveedor" : "Neto del cliente", d.saldoNeto, moneda)}
          {d.impuesto?.tipo !== "ninguno" && parte("impuesto", etiquetaImpuesto(d.impuesto), d.saldoImpuesto, "PEN")}
        </div>
        {tipo === "transferencia" && (
          <p className="text-xs text-amber-700 bg-amber-50 rounded-lg p-2">El cliente pagó el total: la detracción se transfiere de nuestra cuenta a la cuenta de detracciones.</p>
        )}
        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs text-gray-500">Monto
            <input type="number" min="0" step="0.01" value={form.monto} onChange={set("monto")} className={INP} />
          </label>
          <label className="text-xs text-gray-500">Fecha
            <input type="date" value={form.fecha} onChange={set("fecha")} className={INP} />
          </label>
          {tipo !== "retencion" && (
            <>
              <label className="text-xs text-gray-500">{tipo === "transferencia" ? "Cuenta de origen" : "Cuenta"}
                <select value={form.cuenta} onChange={set("cuenta")} className={INP}>
                  <option value="">Elegir…</option>
                  {origen.map((c) => <option key={c._id} value={c._id}>{c.nombre} ({c.moneda})</option>)}
                </select>
              </label>
              <label className="text-xs text-gray-500">Medio
                <select value={form.medio} onChange={set("medio")} className={INP}>
                  {MEDIOS.map((m) => <option key={m.valor} value={m.valor}>{m.label}</option>)}
                </select>
              </label>
            </>
          )}
          {tipo === "transferencia" && (
            <label className="text-xs text-gray-500">Cuenta de detracciones
              <select value={form.cuentaDestino} onChange={set("cuentaDestino")} className={INP}>
                <option value="">Elegir…</option>
                {destino.map((c) => <option key={c._id} value={c._id}>{c.nombre}</option>)}
              </select>
            </label>
          )}
          <label className="text-xs text-gray-500 col-span-2">{etiquetaOperacion}
            <input value={form.numeroOperacion} onChange={set("numeroOperacion")} className={INP} />
          </label>
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Cancelar</button>
          <button onClick={guardar} disabled={guardando || !(Number(form.monto) > 0)}
            className="bg-purple-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-50">
            {guardando ? "Guardando…" : `Registrar ${verbo}`}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Libro de movimientos** — `Frontend/src/components/tesoreria/TablaMovimientos.jsx`:
```jsx
import { useState, useEffect, useCallback } from "react";
import * as XLSX from "xlsx";
import { fetchAuth } from "../../utils/fetchAuth";
import { formatearFecha } from "../../utils/fecha";
import { money } from "../../utils/compras";
import { totalesMovimientos } from "../../utils/tesoreria";
import TablaScroll from "../TablaScroll";
import PromptAccion from "../PromptAccion";

const INP = "border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300";
const fecha = (d) => formatearFecha(d, { day: "2-digit", month: "2-digit", year: "numeric" });
const TIPOS = { egreso: "Egreso", ingreso: "Ingreso", transferencia: "Transferencia", retencion: "Retención" };
const COLOR = { egreso: "text-red-600", ingreso: "text-emerald-600", transferencia: "text-blue-600", retencion: "text-amber-600" };

export default function TablaMovimientos() {
  const [movs, setMovs] = useState([]);
  const [filtros, setFiltros] = useState({ cuenta: "", desde: "", hasta: "" });
  const [anulando, setAnulando] = useState(null);
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState("");

  const cargar = useCallback(() => fetchAuth("/movimientos-tesoreria").then(async (r) => {
    if (r.ok) setMovs(await r.json());
  }), []);
  useEffect(() => { cargar(); }, [cargar]);

  const set = (campo) => (e) => setFiltros((f) => ({ ...f, [campo]: e.target.value }));
  const cuentas = [...new Map(movs.flatMap((m) => [m.cuenta, m.cuentaDestino]).filter(Boolean).map((c) => [c._id, c])).values()];
  const filtrados = movs.filter((m) => {
    const dia = String(m.fecha).slice(0, 10);
    return (!filtros.cuenta || m.cuenta?._id === filtros.cuenta || m.cuentaDestino?._id === filtros.cuenta)
      && (!filtros.desde || dia >= filtros.desde) && (!filtros.hasta || dia <= filtros.hasta);
  });
  const totales = totalesMovimientos(filtrados);

  const anular = async (motivo) => {
    setProcesando(true);
    setError("");
    const r = await fetchAuth(`/movimientos-tesoreria/${anulando._id}/anular`, { method: "PATCH", body: JSON.stringify({ motivo }) });
    if (r.ok) await cargar();
    else setError((await r.json().catch(() => ({}))).mensaje || "No se pudo anular el movimiento.");
    setProcesando(false);
    setAnulando(null);
  };

  const exportarExcel = () => {
    const filas = filtrados.map((m) => ({
      "CÓDIGO": m.codigo, FECHA: fecha(m.fecha), TIPO: TIPOS[m.tipo], CONCEPTO: m.concepto,
      DOCUMENTO: m.documentoRef?.comprobante || "", TERCERO: m.documentoRef?.tercero || "",
      CUENTA: m.cuenta?.nombre || "", DESTINO: m.cuentaDestino?.nombre || "", MEDIO: m.medio,
      "N° OPERACIÓN": m.numeroOperacion, MONEDA: m.moneda, MONTO: m.monto, ESTADO: m.anulado ? "Anulado" : "Vigente",
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(filas), "Movimientos");
    XLSX.writeFile(wb, "movimientos-tesoreria.xlsx");
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-center">
        <select value={filtros.cuenta} onChange={set("cuenta")} className={INP}>
          <option value="">Todas las cuentas</option>
          {cuentas.map((c) => <option key={c._id} value={c._id}>{c.nombre}</option>)}
        </select>
        <input type="date" value={filtros.desde} onChange={set("desde")} className={INP} />
        <input type="date" value={filtros.hasta} onChange={set("hasta")} className={INP} />
        <span className="text-sm text-emerald-700">Ingresos {money(totales.ingresos)}</span>
        <span className="text-sm text-red-600">Egresos {money(totales.egresos)}</span>
        <button onClick={exportarExcel} className="ml-auto border border-gray-300 text-gray-600 px-4 py-2 rounded-lg text-sm hover:bg-gray-50">Exportar Excel</button>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <TablaScroll className="overflow-x-auto">
          <table className="w-full text-sm" style={{ minWidth: "1000px" }}>
            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
              <tr>{["Código", "Fecha", "Tipo", "Documento", "Tercero", "Parte", "Cuenta", "N° operación", "Monto", ""].map((h) => <th key={h} className="px-3 py-2 text-left">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtrados.length === 0 && <tr><td colSpan={10} className="px-3 py-8 text-center text-gray-400">Sin movimientos</td></tr>}
              {filtrados.map((m) => (
                <tr key={m._id} className={m.anulado ? "opacity-40 line-through" : ""}>
                  <td className="px-3 py-2 font-medium">{m.codigo}</td>
                  <td className="px-3 py-2">{fecha(m.fecha)}</td>
                  <td className={`px-3 py-2 ${COLOR[m.tipo]}`}>{TIPOS[m.tipo]}</td>
                  <td className="px-3 py-2">{m.documentoRef?.comprobante || "—"}</td>
                  <td className="px-3 py-2">{m.documentoRef?.tercero || "—"}</td>
                  <td className="px-3 py-2">{m.concepto === "neto" ? "Neto" : "Impuesto"}</td>
                  <td className="px-3 py-2">{m.cuenta?.nombre || "—"}{m.cuentaDestino ? ` → ${m.cuentaDestino.nombre}` : ""}</td>
                  <td className="px-3 py-2">{m.numeroOperacion || "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{money(m.monto, m.moneda)}</td>
                  <td className="px-3 py-2 text-right">
                    {!m.anulado && <button onClick={() => setAnulando(m)} className="text-xs text-red-500 hover:text-red-700">Anular</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TablaScroll>
      </div>
      {anulando && (
        <PromptAccion titulo={`Anular ${anulando.codigo}`} placeholder="Motivo de la anulación"
          onCancelar={() => setAnulando(null)} onConfirmar={anular} procesando={procesando} textoConfirmar="Anular" />
      )}
    </div>
  );
}
```

- [ ] **Step 3: Verificar** — Run: `cd Frontend && npm run lint` — Expected: sin errores en `src/components/tesoreria/`.

- [ ] **Step 4: Commit**
```bash
git -C Frontend add src/components/tesoreria/ModalMovimiento.jsx src/components/tesoreria/TablaMovimientos.jsx
git -C Frontend commit -m "feat(tesoreria): modal de pago/cobro y libro de movimientos" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Facturas de proveedor — modal de registro y pestaña Por pagar

**Files:**
- Create: `Frontend/src/components/tesoreria/ModalFacturaProveedor.jsx`, `Frontend/src/components/tesoreria/TablaPorPagar.jsx`

**Interfaces:**
- Consumes: `GET /tesoreria/por-pagar` (filas OCP con `hayServicios`, Task 6), `POST /facturas-proveedor`, `POST /facturas-proveedor/:id/archivos` (campo `archivo`), `PATCH /facturas-proveedor/:id/anular`; Tasks 9–10.
- Produces: `<ModalFacturaProveedor ocpId? precarga? catalogos={{ proveedores, centrosCosto, esAgenteRetencion, tipoCambio }} onClose onGuardada />` — `precarga` = fila `sire` de la conciliación; `<TablaPorPagar recarga={number} onRegistrarFactura={({ ocpId? }) => …} />`.

- [ ] **Step 1: Modal de registro** — `Frontend/src/components/tesoreria/ModalFacturaProveedor.jsx`:
```jsx
import { useState, useEffect } from "react";
import { fetchAuth, uploadAuth } from "../../utils/fetchAuth";
import { fechaHoyLima } from "../../utils/fecha";
import { money, round2, nombreEmpresa } from "../../utils/compras";
import { calcularImpuesto, partes, sugerirImpuesto, diasCredito, sumarDias, CODIGOS_DETRACCION } from "../../utils/tesoreria";

const INP = "border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300 w-full";
const TIPOS = [{ valor: "01", label: "Factura" }, { valor: "02", label: "Recibo por honorarios" }, { valor: "03", label: "Boleta" }];

function desdeOCP(o, fechaEmision) {
  const dias = diasCredito(o.formaPago);
  return {
    modo: "oc", ordenCompraProveedor: o._id, proveedor: String(o.proveedor), moneda: o.moneda,
    subtotal: String(o.saldoPorFacturar), hayServicios: !!o.hayServicios,
    condicion: dias > 0 ? "credito" : "contado", fechaVencimiento: dias > 0 ? sumarDias(fechaEmision, dias) : "",
  };
}

function desdeSire(s, proveedores) {
  const prov = proveedores.find((p) => p.ruc === s.rucContraparte);
  return {
    modo: "sinOc", proveedor: prov?._id || "", tipoComprobante: ["01", "02", "03"].includes(s.tipo) ? s.tipo : "01",
    serie: s.serie, numero: s.numero, fechaEmision: String(s.fechaEmision || "").slice(0, 10) || fechaHoyLima(),
    moneda: s.moneda === "USD" ? "USD" : "PEN", subtotal: String(s.baseImponible || round2(s.total - s.igv)), conIgv: s.igv > 0,
  };
}

export default function ModalFacturaProveedor({ ocpId, precarga, catalogos, onClose, onGuardada }) {
  const hoy = fechaHoyLima();
  const [ocps, setOcps] = useState([]);
  const [archivo, setArchivo] = useState(null);
  const [form, setForm] = useState(() => ({
    modo: "sinOc", ordenCompraProveedor: "", esFleteDe: "", proveedor: "", tipoComprobante: "01", serie: "", numero: "",
    fechaEmision: hoy, moneda: "PEN", tipoCambio: String(catalogos.tipoCambio || ""), subtotal: "", conIgv: true, flete: "0",
    condicion: "contado", fechaVencimiento: "", centroCosto: "", hayServicios: false,
    impuestoManual: false, impuestoTipo: "ninguno", codigoSunat: "", quienDeposita: "nosotros", noAplicaRetencion: false,
    ...(precarga ? desdeSire(precarga, catalogos.proveedores) : {}),
  }));
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchAuth("/tesoreria/por-pagar").then((r) => (r.ok ? r.json() : { ocps: [] })).then((d) => {
      setOcps(d.ocps);
      const o = ocpId && d.ocps.find((x) => x._id === ocpId);
      if (o) setForm((f) => ({ ...f, ...desdeOCP(o, f.fechaEmision) }));
    });
  }, [ocpId]);

  const set = (campo) => (e) => {
    const v = e.target.type === "checkbox" ? e.target.checked : e.target.value;
    setForm((f) => ({ ...f, [campo]: v }));
  };
  const elegirOCP = (e) => {
    const o = ocps.find((x) => x._id === e.target.value);
    setForm((f) => (o ? { ...f, ...desdeOCP(o, f.fechaEmision) } : { ...f, ordenCompraProveedor: "" }));
  };
  const elegirImpuesto = (campo) => (e) => setForm((f) => ({ ...f, impuestoManual: true, [campo]: e.target.value }));

  const subtotal = round2(form.subtotal || 0);
  const igv = form.tipoComprobante === "02" || !form.conIgv ? 0 : round2(subtotal * 0.18);
  const total = round2(subtotal + igv);
  const tipoCambio = form.moneda === "USD" ? Number(form.tipoCambio) : 1;
  const sugerido = sugerirImpuesto({ total, moneda: form.moneda, tipoCambio, hayServicios: form.hayServicios, esAgenteRetencion: catalogos.esAgenteRetencion, noAplicaRetencion: form.noAplicaRetencion });
  const imp = form.impuestoManual ? { tipo: form.impuestoTipo, codigoSunat: form.codigoSunat } : sugerido;
  const { tasa, monto } = calcularImpuesto({ ...imp, total, moneda: form.moneda, tipoCambio });
  const quienDeposita = imp.tipo === "detraccion" ? form.quienDeposita : "nosotros";
  const resumen = partes({ lado: "compra", total, moneda: form.moneda, tipoCambio, impuesto: { tipo: imp.tipo, monto, quienDeposita } });
  const ocpsConSaldo = ocps.filter((o) => o.saldoPorFacturar > 0.1);

  const guardar = async () => {
    setGuardando(true);
    setError("");
    const body = {
      tipoComprobante: form.tipoComprobante, serie: form.serie, numero: form.numero, fechaEmision: form.fechaEmision,
      moneda: form.moneda, tipoCambio, subtotal, igv, flete: Number(form.flete) || 0,
      condicion: form.condicion, fechaVencimiento: form.fechaVencimiento,
      impuesto: { tipo: imp.tipo, codigoSunat: imp.codigoSunat, quienDeposita },
    };
    if (form.modo === "oc") body.ordenCompraProveedor = form.ordenCompraProveedor;
    else body.proveedor = form.proveedor;
    if (form.modo === "flete") body.esFleteDe = form.esFleteDe;
    if (form.modo === "sinOc") body.centroCosto = form.centroCosto;
    const r = await fetchAuth("/facturas-proveedor", { method: "POST", body: JSON.stringify(body) });
    let fp = await r.json().catch(() => ({}));
    if (!r.ok) {
      setGuardando(false);
      return setError(fp.mensaje || "No se pudo registrar la factura.");
    }
    if (archivo) {
      const fd = new FormData();
      fd.append("archivo", archivo);
      const ra = await uploadAuth(`/facturas-proveedor/${fp._id}/archivos`, fd);
      if (ra.ok) fp = await ra.json();
    }
    setGuardando(false);
    onGuardada(fp);
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4" style={{ zIndex: 50 }}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[92vh] overflow-y-auto p-6 space-y-4">
        <h3 className="text-lg font-bold text-gray-800">Registrar factura de proveedor</h3>
        <div className="flex gap-4 text-sm">
          {[["oc", "De una OC"], ["sinOc", "Sin OC"], ["flete", "Flete de transportista"]].map(([valor, label]) => (
            <label key={valor} className="flex items-center gap-1.5">
              <input type="radio" checked={form.modo === valor} onChange={() => setForm((f) => ({ ...f, modo: valor, hayServicios: valor === "oc" && f.hayServicios }))} />{label}
            </label>
          ))}
        </div>
        {precarga && !form.proveedor && (
          <p className="text-xs text-amber-700 bg-amber-50 rounded-lg p-2">El RUC {precarga.rucContraparte} no está registrado en Empresas: regístralo como proveedor primero.</p>
        )}
        <div className="grid grid-cols-3 gap-3">
          {form.modo === "oc" && (
            <label className="text-xs text-gray-500 col-span-3">Orden de compra
              <select value={form.ordenCompraProveedor} onChange={elegirOCP} className={INP}>
                <option value="">Elegir…</option>
                {ocpsConSaldo.map((o) => <option key={o._id} value={o._id}>{o.codigo} — {o.proveedorRazonSocial} — por facturar {money(o.saldoPorFacturar, o.moneda)}</option>)}
              </select>
            </label>
          )}
          {form.modo === "flete" && (
            <label className="text-xs text-gray-500 col-span-3">Flete de la OC
              <select value={form.esFleteDe} onChange={set("esFleteDe")} className={INP}>
                <option value="">Elegir…</option>
                {ocps.map((o) => <option key={o._id} value={o._id}>{o.codigo} — {o.proveedorRazonSocial}</option>)}
              </select>
            </label>
          )}
          {form.modo !== "oc" && (
            <label className="text-xs text-gray-500 col-span-2">{form.modo === "flete" ? "Transportista" : "Proveedor"}
              <select value={form.proveedor} onChange={set("proveedor")} className={INP}>
                <option value="">Elegir…</option>
                {catalogos.proveedores.map((p) => <option key={p._id} value={p._id}>{nombreEmpresa(p)}</option>)}
              </select>
            </label>
          )}
          {form.modo === "sinOc" && (
            <label className="text-xs text-gray-500">Centro de costo
              <select value={form.centroCosto} onChange={set("centroCosto")} className={INP}>
                <option value="">Elegir…</option>
                {catalogos.centrosCosto.map((c) => <option key={c._id} value={c._id}>{c.nombre}</option>)}
              </select>
            </label>
          )}
          <label className="text-xs text-gray-500">Comprobante
            <select value={form.tipoComprobante} onChange={set("tipoComprobante")} className={INP}>
              {TIPOS.map((t) => <option key={t.valor} value={t.valor}>{t.label}</option>)}
            </select>
          </label>
          <label className="text-xs text-gray-500">Serie<input value={form.serie} onChange={set("serie")} className={INP} /></label>
          <label className="text-xs text-gray-500">Número<input value={form.numero} onChange={set("numero")} className={INP} /></label>
          <label className="text-xs text-gray-500">Emisión<input type="date" value={form.fechaEmision} onChange={set("fechaEmision")} className={INP} /></label>
          <label className="text-xs text-gray-500">Moneda
            <select value={form.moneda} onChange={set("moneda")} disabled={form.modo === "oc"} className={INP}>
              <option value="PEN">PEN</option><option value="USD">USD</option>
            </select>
          </label>
          {form.moneda === "USD" && (
            <label className="text-xs text-gray-500">Tipo de cambio<input type="number" step="0.001" value={form.tipoCambio} onChange={set("tipoCambio")} className={INP} /></label>
          )}
          <label className="text-xs text-gray-500">Subtotal (sin IGV)<input type="number" step="0.01" min="0" value={form.subtotal} onChange={set("subtotal")} className={INP} /></label>
          {form.modo !== "flete" && (
            <label className="text-xs text-gray-500">Flete incluido (sin IGV)<input type="number" step="0.01" min="0" value={form.flete} onChange={set("flete")} className={INP} /></label>
          )}
          <label className="text-xs text-gray-500 flex items-end gap-1.5 pb-2">
            <input type="checkbox" checked={form.conIgv} disabled={form.tipoComprobante === "02"} onChange={set("conIgv")} />IGV 18 % ({money(igv, form.moneda)})
          </label>
          <label className="text-xs text-gray-500">Condición
            <select value={form.condicion} onChange={set("condicion")} className={INP}>
              <option value="contado">Contado</option><option value="credito">Crédito</option>
            </select>
          </label>
          {form.condicion === "credito" && (
            <label className="text-xs text-gray-500">Vencimiento<input type="date" value={form.fechaVencimiento} onChange={set("fechaVencimiento")} className={INP} /></label>
          )}
        </div>

        <div className="rounded-xl bg-gray-50 border border-gray-100 p-4 space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <label className="text-xs text-gray-500">Impuesto
              <select value={imp.tipo} onChange={elegirImpuesto("impuestoTipo")} className={INP}>
                <option value="ninguno">Ninguno</option><option value="detraccion">Detracción</option>
                {catalogos.esAgenteRetencion && <option value="retencion">Retención 3 %</option>}
              </select>
            </label>
            {imp.tipo === "detraccion" && (
              <>
                <label className="text-xs text-gray-500">Bien o servicio
                  <select value={imp.codigoSunat} onChange={elegirImpuesto("codigoSunat")} className={INP}>
                    <option value="">Elegir…</option>
                    {CODIGOS_DETRACCION.map((c) => <option key={c.codigo} value={c.codigo}>{c.codigo} — {c.descripcion} ({c.porcentaje}%)</option>)}
                  </select>
                </label>
                <label className="text-xs text-gray-500">Deposita
                  <select value={form.quienDeposita} onChange={set("quienDeposita")} className={INP}>
                    <option value="nosotros">INTALES (se descuenta al proveedor)</option>
                    <option value="proveedor">El proveedor (autodetracción)</option>
                  </select>
                </label>
              </>
            )}
            {catalogos.esAgenteRetencion && imp.tipo !== "detraccion" && (
              <label className="text-xs text-gray-500 col-span-2 flex items-end gap-1.5 pb-2">
                <input type="checkbox" checked={form.noAplicaRetencion} onChange={set("noAplicaRetencion")} />Buen contribuyente / agente de retención → no aplica
              </label>
            )}
          </div>
          {!form.impuestoManual && sugerido.tipo !== "ninguno" && <p className="text-[11px] text-gray-400">Sugerido según el total y el tipo de compra.</p>}
          <div className="flex justify-between text-sm pt-2 border-t border-gray-200">
            <span>Total {money(total, form.moneda)}</span>
            <span>Impuesto {money(monto)} ({Math.round(tasa * 100)} %)</span>
            <span className="font-bold text-purple-700">Neto a pagar {money(resumen.neto, form.moneda)}</span>
          </div>
        </div>

        <label className="text-xs text-gray-500 block">PDF de la factura (opcional)
          <input type="file" accept="application/pdf,image/*" onChange={(e) => setArchivo(e.target.files?.[0] || null)} className="block mt-1 text-sm" />
        </label>
        {error && <p className="text-xs text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Cancelar</button>
          <button onClick={guardar} disabled={guardando || !(subtotal > 0)}
            className="bg-purple-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-50">
            {guardando ? "Guardando…" : "Registrar factura"}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Pestaña Por pagar** — `Frontend/src/components/tesoreria/TablaPorPagar.jsx`:
```jsx
import { useState, useEffect, useCallback } from "react";
import { fetchAuth } from "../../utils/fetchAuth";
import { formatearFecha, fechaHoyLima } from "../../utils/fecha";
import { money } from "../../utils/compras";
import { FILTROS_TESORERIA, filtrarFacturas, semaforo, etiquetaImpuesto } from "../../utils/tesoreria";
import TablaScroll from "../TablaScroll";
import PromptAccion from "../PromptAccion";
import ModalMovimiento from "./ModalMovimiento";

const INP = "border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300";
const fecha = (d) => (d ? formatearFecha(d, { day: "2-digit", month: "2-digit", year: "numeric" }) : "—");
const COLOR_VENC = { vencida: "text-red-600 font-semibold", por_vencer: "text-amber-600", al_dia: "text-gray-600" };
const Check = ({ ok, visible = true }) => (visible ? <span className={ok ? "text-emerald-600" : "text-gray-300"}>{ok ? "☑" : "☐"}</span> : <span className="text-gray-300">—</span>);

export default function TablaPorPagar({ recarga, onRegistrarFactura }) {
  const [datos, setDatos] = useState({ ocps: [], facturas: [] });
  const [vista, setVista] = useState("oc");
  const [filtros, setFiltros] = useState(FILTROS_TESORERIA);
  const [pagando, setPagando] = useState(null);
  const [anulando, setAnulando] = useState(null);
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState("");
  const hoyIso = fechaHoyLima();

  const cargar = useCallback(() => fetchAuth("/tesoreria/por-pagar").then(async (r) => {
    if (r.ok) setDatos(await r.json());
  }), []);
  useEffect(() => { cargar(); }, [cargar, recarga]);

  const set = (campo) => (e) => setFiltros((f) => ({ ...f, [campo]: e.target.value }));
  const facturas = filtrarFacturas(datos.facturas, filtros, { lado: "compra", hoyIso });
  const ocps = datos.ocps.filter((o) => !filtros.tercero || `${o.proveedorRazonSocial} ${o.proveedorRuc}`.toLowerCase().includes(filtros.tercero.toLowerCase()));

  const anular = async (motivo) => {
    setProcesando(true);
    setError("");
    const r = await fetchAuth(`/facturas-proveedor/${anulando._id}/anular`, { method: "PATCH", body: JSON.stringify({ motivo }) });
    if (r.ok) await cargar();
    else setError((await r.json().catch(() => ({}))).mensaje || "No se pudo anular la factura.");
    setProcesando(false);
    setAnulando(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-center">
        <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm">
          {[["oc", "Por OC"], ["factura", "Por factura"]].map(([v, l]) => (
            <button key={v} onClick={() => setVista(v)} className={`px-3 py-2 ${vista === v ? "bg-purple-600 text-white" : "text-gray-600"}`}>{l}</button>
          ))}
        </div>
        <input value={filtros.tercero} onChange={set("tercero")} placeholder="Proveedor o RUC" className={INP} />
        {vista === "factura" && (
          <>
            <select value={filtros.estado} onChange={set("estado")} className={INP}>
              <option value="">Todo estado</option><option value="pendiente">Pendiente</option><option value="parcial">Parcial</option><option value="pagada">Pagada</option>
            </select>
            <select value={filtros.vencimiento} onChange={set("vencimiento")} className={INP}>
              <option value="">Todo vencimiento</option><option value="vencida">Vencidas</option><option value="por_vencer">Por vencer (≤ 7 días)</option>
            </select>
            <input type="date" value={filtros.desde} onChange={set("desde")} className={INP} />
            <input type="date" value={filtros.hasta} onChange={set("hasta")} className={INP} />
          </>
        )}
        <button onClick={() => onRegistrarFactura({})} className="ml-auto bg-purple-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-purple-700">+ Factura sin OC</button>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <TablaScroll className="overflow-x-auto">
          {vista === "oc" ? (
            <table className="w-full text-sm" style={{ minWidth: "1000px" }}>
              <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                <tr>{["OC", "Fecha", "Proveedor", "Total", "Facturado", "Por facturar", "Saldo neto", "Saldo impuesto", "Próx. vencimiento", ""].map((h) => <th key={h} className="px-3 py-2 text-left">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {ocps.length === 0 && <tr><td colSpan={10} className="px-3 py-8 text-center text-gray-400">Sin órdenes de compra vigentes</td></tr>}
                {ocps.map((o) => {
                  const sem = semaforo(o.proximoVencimiento, o.saldoNeto + o.saldoImpuesto > 0.009, hoyIso);
                  return (
                    <tr key={o._id}>
                      <td className="px-3 py-2 font-medium">{o.codigo}</td>
                      <td className="px-3 py-2">{fecha(o.fecha)}</td>
                      <td className="px-3 py-2">{o.proveedorRazonSocial}</td>
                      <td className="px-3 py-2 tabular-nums">{money(o.total, o.moneda)}</td>
                      <td className="px-3 py-2 tabular-nums">{money(o.montoFacturado || 0, o.moneda)}</td>
                      <td className="px-3 py-2 tabular-nums">{money(o.saldoPorFacturar, o.moneda)}</td>
                      <td className="px-3 py-2 tabular-nums">{money(o.saldoNeto, o.moneda)}</td>
                      <td className="px-3 py-2 tabular-nums">{money(o.saldoImpuesto)}</td>
                      <td className={`px-3 py-2 ${COLOR_VENC[sem] || "text-gray-400"}`}>{fecha(o.proximoVencimiento)}</td>
                      <td className="px-3 py-2 text-right">
                        {o.saldoPorFacturar > 0.1 && <button onClick={() => onRegistrarFactura({ ocpId: o._id })} className="text-xs text-purple-600 hover:text-purple-800">+ Registrar factura</button>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <table className="w-full text-sm" style={{ minWidth: "1200px" }}>
              <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                <tr>{["FP", "Comprobante", "Proveedor", "OC", "Emisión", "Vence", "Total", "Impuesto", "☐ Imp.", "Neto", "☐ Neto", "Saldo", ""].map((h) => <th key={h} className="px-3 py-2 text-left">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {facturas.length === 0 && <tr><td colSpan={13} className="px-3 py-8 text-center text-gray-400">Sin facturas</td></tr>}
                {facturas.map((f) => {
                  const pendiente = f.saldoNeto > 0.009 || f.saldoImpuesto > 0.009;
                  const sem = semaforo(f.fechaVencimiento, pendiente, hoyIso);
                  const hayImpuesto = f.impuesto?.tipo !== "ninguno" && f.impuesto?.quienDeposita !== "proveedor";
                  return (
                    <tr key={f._id}>
                      <td className="px-3 py-2 font-medium">{f.codigo}</td>
                      <td className="px-3 py-2">{f.serie}-{f.numero}</td>
                      <td className="px-3 py-2">{f.proveedorRazonSocial}</td>
                      <td className="px-3 py-2">{f.ordenCompraProveedor?.codigo || (f.esFleteDe ? `Flete ${f.esFleteDe.codigo || ""}` : "—")}</td>
                      <td className="px-3 py-2">{fecha(f.fechaEmision)}</td>
                      <td className={`px-3 py-2 ${COLOR_VENC[sem] || "text-gray-400"}`}>{fecha(f.fechaVencimiento)}</td>
                      <td className="px-3 py-2 tabular-nums">{money(f.total, f.moneda)}</td>
                      <td className="px-3 py-2 text-xs">{f.impuesto?.tipo === "ninguno" ? "—" : `${etiquetaImpuesto(f.impuesto)} ${money(f.impuesto.monto)}${f.impuesto.quienDeposita === "proveedor" ? " (proveedor)" : ""}`}</td>
                      <td className="px-3 py-2 text-center"><Check ok={f.saldoImpuesto <= 0.009} visible={hayImpuesto} /></td>
                      <td className="px-3 py-2 tabular-nums">{money(f.netoAPagar, f.moneda)}</td>
                      <td className="px-3 py-2 text-center"><Check ok={f.saldoNeto <= 0.009} /></td>
                      <td className="px-3 py-2 tabular-nums">{money(f.saldoNeto, f.moneda)}{f.saldoImpuesto > 0.009 ? ` + ${money(f.saldoImpuesto)}` : ""}</td>
                      <td className="px-3 py-2 text-right whitespace-nowrap space-x-2">
                        {pendiente && <button onClick={() => setPagando(f)} className="text-xs text-purple-600 hover:text-purple-800">Registrar pago</button>}
                        {f.pagadoNeto + f.pagadoImpuesto === 0 && <button onClick={() => setAnulando(f)} className="text-xs text-red-500 hover:text-red-700">Anular</button>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </TablaScroll>
      </div>

      {pagando && <ModalMovimiento lado="compra" documento={pagando} onClose={() => setPagando(null)} onGuardado={() => { setPagando(null); cargar(); }} />}
      {anulando && (
        <PromptAccion titulo={`Anular ${anulando.codigo}`} placeholder="Motivo de la anulación"
          onCancelar={() => setAnulando(null)} onConfirmar={anular} procesando={procesando} textoConfirmar="Anular" />
      )}
    </div>
  );
}
```
- [ ] **Step 3: Verificar** — Run: `cd Frontend && npm run lint` — Expected: sin errores en `src/components/tesoreria/`.

- [ ] **Step 4: Commit**
```bash
git -C Frontend add src/components/tesoreria/ModalFacturaProveedor.jsx src/components/tesoreria/TablaPorPagar.jsx
git -C Frontend commit -m "feat(tesoreria): registro de facturas de proveedor y pestaña por pagar" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Por cobrar y limpieza de pagos manuales en Facturas

**Files:**
- Create: `Frontend/src/components/tesoreria/TablaPorCobrar.jsx`, `Frontend/src/components/tesoreria/ModalImpuestoVenta.jsx`
- Modify: `Frontend/src/pages/ListaFacturas.jsx`, `Frontend/src/components/DetalleFactura.jsx`, `Frontend/src/components/ModalCrearFactura.jsx`

**Interfaces:**
- Consumes: `GET /tesoreria/por-cobrar`, `PATCH /facturas/:id/impuesto`; Tasks 9–10. Ya **no** existen `PATCH /facturas/:id/estado-pago`, `/detraccion-pagada` ni `/cuotas/:cuotaId/pagar` (Task 5).
- Produces: `<TablaPorCobrar />`; `<ModalImpuestoVenta factura onClose onGuardada />`.

- [ ] **Step 1: Modal de impuesto de venta** — `Frontend/src/components/tesoreria/ModalImpuestoVenta.jsx`:
```jsx
import { useState } from "react";
import { fetchAuth } from "../../utils/fetchAuth";
import { money } from "../../utils/compras";
import { calcularImpuesto, partes, CODIGOS_DETRACCION } from "../../utils/tesoreria";

const INP = "border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300 w-full";

// Solo mientras la factura no tenga cobros (el backend lo valida también).
export default function ModalImpuestoVenta({ factura, onClose, onGuardada }) {
  const [form, setForm] = useState({
    tipo: factura.impuesto?.tipo || "ninguno",
    codigoSunat: factura.impuesto?.codigoSunat || "037",
    quienDeposita: factura.impuesto?.quienDeposita === "nosotros" ? "nosotros" : "cliente",
  });
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const set = (campo) => (e) => setForm((f) => ({ ...f, [campo]: e.target.value }));

  const { monto } = calcularImpuesto({ tipo: form.tipo, codigoSunat: form.codigoSunat, total: factura.total });
  const quien = form.tipo === "detraccion" ? form.quienDeposita : "cliente";
  const { neto } = partes({ lado: "venta", total: factura.total, impuesto: { tipo: form.tipo, monto, quienDeposita: quien } });

  const guardar = async () => {
    setGuardando(true);
    setError("");
    const r = await fetchAuth(`/facturas/${factura._id}/impuesto`, { method: "PATCH", body: JSON.stringify({ ...form, quienDeposita: quien }) });
    const data = await r.json().catch(() => ({}));
    setGuardando(false);
    if (!r.ok) return setError(data.mensaje || "No se pudo cambiar el impuesto.");
    onGuardada(data);
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4" style={{ zIndex: 60 }}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
        <h3 className="text-lg font-bold text-gray-800">Impuesto de {factura.numeroFactura || factura.codigo}</h3>
        <label className="text-xs text-gray-500 block">Tipo
          <select value={form.tipo} onChange={set("tipo")} className={INP}>
            <option value="ninguno">Ninguno</option><option value="detraccion">Detracción</option><option value="retencion">Retención 3 % (cliente agente)</option>
          </select>
        </label>
        {form.tipo === "detraccion" && (
          <>
            <label className="text-xs text-gray-500 block">Bien o servicio
              <select value={form.codigoSunat} onChange={set("codigoSunat")} className={INP}>
                {CODIGOS_DETRACCION.map((c) => <option key={c.codigo} value={c.codigo}>{c.codigo} — {c.descripcion} ({c.porcentaje}%)</option>)}
              </select>
            </label>
            <label className="text-xs text-gray-500 block">¿Quién deposita?
              <select value={form.quienDeposita} onChange={set("quienDeposita")} className={INP}>
                <option value="cliente">El cliente (nos paga el neto)</option>
                <option value="nosotros">Nosotros (el cliente pagó el total)</option>
              </select>
            </label>
          </>
        )}
        <div className="flex justify-between text-sm border-t border-gray-100 pt-3">
          <span>Impuesto {money(monto)}</span>
          <span className="font-bold text-emerald-700">Neto a cobrar {money(neto)}</span>
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Cancelar</button>
          <button onClick={guardar} disabled={guardando} className="bg-purple-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-50">
            {guardando ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Pestaña Por cobrar** — `Frontend/src/components/tesoreria/TablaPorCobrar.jsx`:
```jsx
import { useState, useEffect, useCallback } from "react";
import { fetchAuth } from "../../utils/fetchAuth";
import { formatearFecha, fechaHoyLima } from "../../utils/fecha";
import { money } from "../../utils/compras";
import { FILTROS_TESORERIA, filtrarFacturas, semaforo, vencimientoDe, etiquetaImpuesto } from "../../utils/tesoreria";
import TablaScroll from "../TablaScroll";
import ModalMovimiento from "./ModalMovimiento";
import ModalImpuestoVenta from "./ModalImpuestoVenta";

const INP = "border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300";
const fecha = (d) => (d ? formatearFecha(d, { day: "2-digit", month: "2-digit", year: "numeric" }) : "—");
const COLOR_VENC = { vencida: "text-red-600 font-semibold", por_vencer: "text-amber-600", al_dia: "text-gray-600" };
const Check = ({ ok, visible = true }) => (visible ? <span className={ok ? "text-emerald-600" : "text-gray-300"}>{ok ? "☑" : "☐"}</span> : <span className="text-gray-300">—</span>);

export default function TablaPorCobrar() {
  const [facturas, setFacturas] = useState([]);
  const [filtros, setFiltros] = useState(FILTROS_TESORERIA);
  const [cobrando, setCobrando] = useState(null);
  const [editandoImpuesto, setEditandoImpuesto] = useState(null);
  const hoyIso = fechaHoyLima();

  const cargar = useCallback(() => fetchAuth("/tesoreria/por-cobrar").then(async (r) => {
    if (r.ok) setFacturas(await r.json());
  }), []);
  useEffect(() => { cargar(); }, [cargar]);

  const set = (campo) => (e) => setFiltros((f) => ({ ...f, [campo]: e.target.value }));
  const filtradas = filtrarFacturas(facturas, filtros, { lado: "venta", hoyIso });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-center">
        <input value={filtros.tercero} onChange={set("tercero")} placeholder="Cliente o RUC" className={INP} />
        <select value={filtros.estado} onChange={set("estado")} className={INP}>
          <option value="">Todo estado</option><option value="pendiente">Sin cobro</option><option value="parcial">Parcial</option><option value="pagada">Cobrada</option>
        </select>
        <select value={filtros.vencimiento} onChange={set("vencimiento")} className={INP}>
          <option value="">Todo vencimiento</option><option value="vencida">Vencidas</option><option value="por_vencer">Por vencer (≤ 7 días)</option>
        </select>
        <input type="date" value={filtros.desde} onChange={set("desde")} className={INP} />
        <input type="date" value={filtros.hasta} onChange={set("hasta")} className={INP} />
      </div>
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <TablaScroll className="overflow-x-auto">
          <table className="w-full text-sm" style={{ minWidth: "1200px" }}>
            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
              <tr>{["Factura", "Cliente", "Emisión", "Vence", "Cuotas", "Total", "Impuesto", "☐ Imp.", "Neto", "☐ Neto", "Saldo", ""].map((h) => <th key={h} className="px-3 py-2 text-left">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtradas.length === 0 && <tr><td colSpan={12} className="px-3 py-8 text-center text-gray-400">Sin facturas</td></tr>}
              {filtradas.map((f) => {
                const pendiente = f.saldoNeto > 0.009 || f.saldoImpuesto > 0.009;
                const venc = vencimientoDe(f, "venta");
                const sem = semaforo(venc, pendiente, hoyIso);
                const hayImpuesto = f.impuesto?.tipo && f.impuesto.tipo !== "ninguno";
                const sinCobros = (f.pagadoNeto || 0) + (f.pagadoImpuesto || 0) === 0;
                return (
                  <tr key={f._id}>
                    <td className="px-3 py-2 font-medium">{f.numeroFactura || f.codigo}</td>
                    <td className="px-3 py-2">{f.empresa?.razonSocial || "—"}</td>
                    <td className="px-3 py-2">{fecha(f.fechaEmision)}</td>
                    <td className={`px-3 py-2 ${COLOR_VENC[sem] || "text-gray-400"}`}>{fecha(venc)}</td>
                    <td className="px-3 py-2 text-xs">{f.cuotas?.length ? `${f.cuotas.filter((c) => c.pagado).length}/${f.cuotas.length}` : "—"}</td>
                    <td className="px-3 py-2 tabular-nums">{money(f.total)}</td>
                    <td className="px-3 py-2 text-xs">{hayImpuesto ? `${etiquetaImpuesto(f.impuesto)} ${money(f.impuesto.monto)}${f.impuesto.quienDeposita === "nosotros" ? " (nosotros)" : ""}` : "—"}</td>
                    <td className="px-3 py-2 text-center"><Check ok={f.saldoImpuesto <= 0.009} visible={hayImpuesto} /></td>
                    <td className="px-3 py-2 tabular-nums">{money(f.totalAPagar)}</td>
                    <td className="px-3 py-2 text-center"><Check ok={f.saldoNeto <= 0.009} /></td>
                    <td className="px-3 py-2 tabular-nums">{money(f.saldoNeto)}{f.saldoImpuesto > 0.009 ? ` + ${money(f.saldoImpuesto)}` : ""}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap space-x-2">
                      {pendiente && <button onClick={() => setCobrando(f)} className="text-xs text-purple-600 hover:text-purple-800">Registrar cobro</button>}
                      {sinCobros && <button onClick={() => setEditandoImpuesto(f)} className="text-xs text-gray-500 hover:text-gray-700">Impuesto</button>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TablaScroll>
      </div>
      {cobrando && <ModalMovimiento lado="venta" documento={cobrando} onClose={() => setCobrando(null)} onGuardado={() => { setCobrando(null); cargar(); }} />}
      {editandoImpuesto && <ModalImpuestoVenta factura={editandoImpuesto} onClose={() => setEditandoImpuesto(null)} onGuardada={() => { setEditandoImpuesto(null); cargar(); }} />}
    </div>
  );
}
```

- [ ] **Step 3: `ListaFacturas.jsx` — quitar los controles manuales de pago**
1. Borrar las funciones completas `CeldaMontoPagado` y `CeldaMontoPagadoCuota` (con sus comentarios, líneas ~63–138).
2. `TablaFacturas`: firma `function TablaFacturas({ titulo, acento, facturas, onSelect, vacioMsg })`; borrar `const rolActual = getUsuario()?.rol;`.
3. Encabezado `Detracción 12% (S/)` → `Detracción / Retención (S/)`.
4. Reemplazar el `<td>` de la detracción (el que tiene `onClick={e => e.stopPropagation()}` y el checkbox "Detracción pagada") por:
```jsx
                      <td className={`${TD_NUM} text-gray-400`}>
                        <div className="flex flex-col items-end gap-0.5">
                          <span>{Number(f.impuesto?.monto ?? f.detraccion ?? 0).toLocaleString("es-PE", { minimumFractionDigits: 2 })}</span>
                          {f.impuesto?.tipo && f.impuesto.tipo !== "ninguno" && (
                            <span className={`text-[11px] ${f.saldoImpuesto > 0.009 ? "text-gray-400" : "text-emerald-600"}`}>
                              {f.impuesto.tipo === "retencion" ? "Retención" : "Detracción"} {f.saldoImpuesto > 0.009 ? "pendiente" : "✓"}
                            </span>
                          )}
                        </div>
                      </td>
```
5. Reemplazar el `<td>` de "Estado pago" de la fila principal por:
```jsx
                      <td className="px-3 py-2 text-center">
                        <div className="flex flex-col items-center gap-1 min-w-[110px]">
                          <DotChip chip={badgePago(f.estadoPago)} dot={dotPago(f.estadoPago)}>
                            {f.estadoPago}
                          </DotChip>
                          <span className="text-[11px] text-gray-400 tabular-nums">
                            Cobrado {Number(f.montoPagado ?? 0).toLocaleString("es-PE", { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                      </td>
```
6. En `filasCuotas`, reemplazar el último `<td>` (el que renderiza `CeldaMontoPagadoCuota`) por:
```jsx
                        <td className="px-3 py-2 text-center text-xs tabular-nums text-gray-500">
                          {Number(c.montoPagado ?? 0).toLocaleString("es-PE", { minimumFractionDigits: 2 })}
                        </td>
```
7. En `ListaFacturas()`: borrar los estados `avisoPermiso`, `confirmandoPago`, `procesandoPago`; las funciones `ejecutarPagoMonto`, `handlePagoMonto`, `ejecutarCuotaPagoMonto`, `handleCuotaPagoMonto`, `ejecutarDetraccionPagoCheck`, `handleDetraccionPagoCheck` (con sus comentarios); las props `handlePagoMonto`, `handleCuotaPagoMonto`, `handleDetraccionPagoCheck` de los dos `<TablaFacturas>`; y los bloques JSX `{confirmandoPago && (…)}` y `{avisoPermiso && …}`.
8. En `filaFactura` (Excel): `"Detracción 12%"` → `"Detracción / Retención": Number(f.impuesto?.monto ?? f.detraccion ?? 0).toFixed(2),`.
9. Debajo del título "Facturas" agregar el aviso (import `Link` de `react-router-dom`):
```jsx
          <p className="text-xs text-gray-400 mt-0.5">Los cobros se registran en <Link to="/tesoreria" className="text-purple-600 hover:underline">Tesorería</Link>.</p>
```
10. Imports: quitar `getUsuario` del import de `fetchAuth`, y `ConfirmacionAccion` y `AvisoAccion` si `npm run lint` los marca sin uso.

- [ ] **Step 4: `DetalleFactura.jsx` — resumen de solo lectura + "Registrar cobro"**
1. Imports: `import { round2 } from "../utils/compras";`, `import { calcularImpuesto, partes, etiquetaImpuesto } from "../utils/tesoreria";`, `import ModalMovimiento from "./tesoreria/ModalMovimiento";`.
2. Reemplazar la función `calcular` por:
```js
function calcular(sub, impuesto) {
  const s = round2(Number(sub) || 0);
  const igv = round2(s * 0.18);
  const total = round2(s + igv);
  const tipo = impuesto?.tipo || "ninguno";
  const { monto } = calcularImpuesto({ tipo, codigoSunat: impuesto?.codigoSunat, total });
  const quienDeposita = impuesto?.quienDeposita || "cliente";
  return { igv, total, detraccion: monto, totalAPagar: partes({ lado: "venta", total, impuesto: { tipo, monto, quienDeposita } }).neto };
}
```
   y cada llamada `calcular(X)` del archivo pasa a `calcular(X, inicial.impuesto)`.
3. En `guardar()` borrar del `payload` las líneas `montoPagado: inicial.montoPagado,` y `estadoPago: inicial.estadoPago,`.
4. Estado: `const [cobrando, setCobrando] = useState(false);` y `const puedeCobrar = ["admin", "jefatura", "facturacion"].includes(getUsuario()?.rol);`.
5. Etiqueta `Detracción 12%` del bloque de cálculos → `{etiquetaImpuesto(inicial.impuesto)}`.
6. Después del bloque `Total a pagar` (dentro del recuadro de cálculos) agregar:
```jsx
              <div className="grid grid-cols-2 gap-3 pt-3 border-t border-gray-200 text-sm">
                <div>
                  <p className="text-xs text-gray-400">Neto cobrado</p>
                  <p className="font-semibold text-gray-700">{money(inicial.pagadoNeto ?? 0)} <span className="text-xs text-gray-400">saldo {money(inicial.saldoNeto ?? 0)}</span></p>
                </div>
                {inicial.impuesto?.tipo && inicial.impuesto.tipo !== "ninguno" && (
                  <div>
                    <p className="text-xs text-gray-400">{etiquetaImpuesto(inicial.impuesto)} depositada</p>
                    <p className="font-semibold text-gray-700">{money(inicial.pagadoImpuesto ?? 0)} <span className="text-xs text-gray-400">saldo {money(inicial.saldoImpuesto ?? 0)}</span></p>
                  </div>
                )}
              </div>
              {puedeCobrar && !inicial.anulado && (inicial.saldoNeto > 0.009 || inicial.saldoImpuesto > 0.009) && (
                <button type="button" onClick={() => setCobrando(true)}
                  className="w-full bg-purple-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-purple-700">
                  Registrar cobro
                </button>
              )}
```
7. Antes de `{buscadorOC && …}` agregar:
```jsx
    {cobrando && (
      <ModalMovimiento lado="venta" documento={inicial} onClose={() => setCobrando(false)}
        onGuardado={() => { setCobrando(false); onClose(); }} />
    )}
```
   (`onClose` de `DetalleDocumento` recarga la lista en `ListaFacturas`.)

- [ ] **Step 5: `ModalCrearFactura.jsx` — vista previa con la misma regla del backend**
Import `import { impuestoVentaPorDefecto } from "../utils/tesoreria";` y reemplazar
```js
  // R.S. 178-2005/SUNAT: aplica solo si el total (con IGV) es >= S/ 701, y el
  // depósito se hace en números enteros (sin decimales).
  const detraccion = total >= 701 ? Math.round(total * 0.12) : 0;
```
por
```js
  const detraccion = impuestoVentaPorDefecto(total).monto;
```

- [ ] **Step 6: Verificar** — Run: `cd Frontend && npm test && npm run lint && npm run build` — Expected: tests PASS; lint sin errores nuevos; build OK.

- [ ] **Step 7: Commit**
```bash
git -C Frontend add src/components/tesoreria/TablaPorCobrar.jsx src/components/tesoreria/ModalImpuestoVenta.jsx src/pages/ListaFacturas.jsx src/components/DetalleFactura.jsx src/components/ModalCrearFactura.jsx
git -C Frontend commit -m "feat(tesoreria): por cobrar; facturas de venta sin pagos manuales" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Pestañas SIRE y Configuración

**Files:**
- Create: `Frontend/src/components/tesoreria/PanelSire.jsx`, `Frontend/src/components/tesoreria/PanelConfiguracion.jsx`

**Interfaces:**
- Consumes: `/sire/:libro/:periodo/{descargar,estado,archivo,conciliacion}` (Task 7), `GET/POST/PUT /cuentas-tesoreria`, `GET/PUT /configuracion` (Task 1); Task 9.
- Produces: `<PanelSire onRegistrarFactura={({ precarga }) => …} />`; `<PanelConfiguracion onCambio={() => …} />`.

- [ ] **Step 1: SIRE** — `Frontend/src/components/tesoreria/PanelSire.jsx`:
```jsx
import { useState, useEffect, useCallback } from "react";
import { fetchAuth, uploadAuth } from "../../utils/fetchAuth";
import { fechaHoyLima, formatearFechaHora } from "../../utils/fecha";
import { money } from "../../utils/compras";
import { periodoDeMes } from "../../utils/tesoreria";
import TablaScroll from "../TablaScroll";

const INP = "border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300";
const RESULTADOS = {
  coincide: { label: "Coincide", cls: "bg-emerald-50 text-emerald-700" },
  difiere: { label: "Difiere", cls: "bg-amber-50 text-amber-700" },
  solo_sire: { label: "Solo en SIRE", cls: "bg-red-50 text-red-700" },
  solo_sistema: { label: "Solo en el sistema", cls: "bg-blue-50 text-blue-700" },
};
const CAMPOS = [["fecha", "fechaEmision"], ["total", "total"], ["igv", "igv"], ["moneda", "moneda"]];

export default function PanelSire({ onRegistrarFactura }) {
  const [libro, setLibro] = useState("RCE");
  const [mes, setMes] = useState(fechaHoyLima().slice(0, 7));
  const [estado, setEstado] = useState(null);
  const [filas, setFilas] = useState([]);
  const [filtro, setFiltro] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState("");
  const base = `/sire/${libro}/${periodoDeMes(mes)}`;

  const cargar = useCallback(() => fetchAuth(`${base}/estado`).then(async (r) => {
    const est = await r.json().catch(() => null);
    setEstado(r.ok ? est : null);
    if (!r.ok) setError(est?.mensaje || "No se pudo consultar el estado del SIRE.");
    if (est?.estado === "lista") {
      const rc = await fetchAuth(`${base}/conciliacion`);
      setFilas(rc.ok ? await rc.json() : []);
    } else setFilas([]);
  }), [base]);
  useEffect(() => { cargar(); }, [cargar]);

  const accion = async (fn) => {
    setOcupado(true);
    setError("");
    const r = await fn();
    if (!r.ok) setError((await r.json().catch(() => ({}))).mensaje || "La operación con el SIRE falló.");
    await cargar();
    setOcupado(false);
  };
  const descargar = () => accion(() => fetchAuth(`${base}/descargar`, { method: "POST" }));
  const subir = (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const fd = new FormData();
    fd.append("archivo", file);
    accion(() => uploadAuth(`${base}/archivo`, fd));
  };

  const visibles = filas.filter((f) => !filtro || f.estado === filtro);
  const conteo = (e) => filas.filter((f) => f.estado === e).length;
  const celda = (f, [clave, campo]) => {
    const dato = f.sire?.[campo] ?? f.sistema?.[campo];
    const difiere = f.diferencias.includes(clave);
    const texto = campo === "total" || campo === "igv" ? money(dato || 0, f.sire?.moneda || f.sistema?.moneda || "PEN") : String(dato ?? "—").slice(0, 10);
    return (
      <td key={clave} className={`px-3 py-2 ${difiere ? "bg-amber-100 font-semibold" : ""}`}>
        {texto}{difiere && f.sistema ? <span className="block text-[11px] text-gray-500">sistema: {String(f.sistema[campo]).slice(0, 10)}</span> : null}
      </td>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-center">
        <select value={libro} onChange={(e) => setLibro(e.target.value)} className={INP}>
          <option value="RCE">Compras (RCE)</option><option value="RVIE">Ventas (RVIE)</option>
        </select>
        <input type="month" value={mes} onChange={(e) => setMes(e.target.value)} className={INP} />
        <button onClick={descargar} disabled={ocupado} className="bg-purple-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-50">Descargar de SUNAT</button>
        {estado?.estado === "descargando" && <button onClick={() => accion(() => fetchAuth(`${base}/estado`))} disabled={ocupado} className="border border-gray-300 px-4 py-2 rounded-lg text-sm">Actualizar estado</button>}
        <label className="border border-gray-300 text-gray-600 px-4 py-2 rounded-lg text-sm hover:bg-gray-50 cursor-pointer">
          Subir archivo<input type="file" accept=".zip,.txt" className="hidden" onChange={subir} disabled={ocupado} />
        </label>
        <span className="text-xs text-gray-500">
          {!estado || estado.estado === "sin_datos" ? "Sin propuesta descargada"
            : `${estado.estado === "lista" ? "Lista" : estado.estado === "error" ? "Error" : "Descargando"} · ${estado.origen === "archivo" ? "archivo" : "API"} · ${estado.totalComprobantes} comprobantes${estado.fechaDescarga ? ` · ${formatearFechaHora(estado.fechaDescarga)}` : ""}${estado.mensaje ? ` · ${estado.mensaje}` : ""}`}
        </span>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      {filas.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setFiltro("")} className={`px-3 py-1 rounded-full text-xs ${!filtro ? "bg-gray-800 text-white" : "bg-gray-100"}`}>Todos ({filas.length})</button>
          {Object.entries(RESULTADOS).map(([k, r]) => (
            <button key={k} onClick={() => setFiltro(k)} className={`px-3 py-1 rounded-full text-xs ${filtro === k ? "ring-2 ring-gray-800" : ""} ${r.cls}`}>{r.label} ({conteo(k)})</button>
          ))}
        </div>
      )}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <TablaScroll className="overflow-x-auto">
          <table className="w-full text-sm" style={{ minWidth: "1000px" }}>
            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
              <tr>{["Resultado", "RUC", "Razón social", "Comprobante", "Fecha", "Total", "IGV", "Moneda", ""].map((h) => <th key={h} className="px-3 py-2 text-left">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {visibles.length === 0 && <tr><td colSpan={9} className="px-3 py-8 text-center text-gray-400">Sin comprobantes para conciliar</td></tr>}
              {visibles.map((f) => {
                const d = f.sire || f.sistema;
                return (
                  <tr key={f.clave}>
                    <td className="px-3 py-2"><span className={`px-2 py-0.5 rounded-full text-xs ${RESULTADOS[f.estado].cls}`}>{RESULTADOS[f.estado].label}</span></td>
                    <td className="px-3 py-2">{d.rucContraparte}</td>
                    <td className="px-3 py-2">{d.razonSocial || "—"}</td>
                    <td className="px-3 py-2">{d.tipo} {d.serie}-{d.numero}</td>
                    {CAMPOS.map((c) => celda(f, c))}
                    <td className="px-3 py-2 text-right">
                      {f.estado === "solo_sire" && libro === "RCE" && (
                        <button onClick={() => onRegistrarFactura({ precarga: f.sire })} className="text-xs text-purple-600 hover:text-purple-800">Registrar factura</button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TablaScroll>
      </div>
    </div>
  );
}
```
Nota: el `GET …/estado` avanza el ticket en el backend cuando está `descargando`; por eso "Actualizar estado" usa `accion` con ese GET.

- [ ] **Step 2: Configuración** — `Frontend/src/components/tesoreria/PanelConfiguracion.jsx`:
```jsx
import { useState, useEffect, useCallback } from "react";
import { fetchAuth } from "../../utils/fetchAuth";

const INP = "border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300";
const VACIA = { nombre: "", tipo: "banco", moneda: "PEN" };
const TIPOS = { banco: "Banco", caja: "Caja", detracciones: "Detracciones (Banco de la Nación)" };

export default function PanelConfiguracion({ onCambio }) {
  const [cuentas, setCuentas] = useState([]);
  const [config, setConfig] = useState({ esAgenteRetencion: false });
  const [nueva, setNueva] = useState(VACIA);
  const [error, setError] = useState("");

  const cargar = useCallback(() => Promise.all([fetchAuth("/cuentas-tesoreria"), fetchAuth("/configuracion")]).then(async ([rc, rg]) => {
    if (rc.ok) setCuentas(await rc.json());
    if (rg.ok) setConfig(await rg.json());
  }), []);
  useEffect(() => { cargar(); }, [cargar]);

  const guardar = async (ruta, metodo, body) => {
    setError("");
    const r = await fetchAuth(ruta, { method: metodo, body: JSON.stringify(body) });
    if (!r.ok) return setError((await r.json().catch(() => ({}))).mensaje || "No se pudo guardar.");
    await cargar();
    onCambio();
  };
  const set = (campo) => (e) => setNueva((n) => ({ ...n, [campo]: e.target.value }));
  const crear = async () => { await guardar("/cuentas-tesoreria", "POST", nueva); setNueva(VACIA); };

  return (
    <div className="space-y-6 max-w-3xl">
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={!!config.esAgenteRetencion} onChange={(e) => guardar("/configuracion", "PUT", { esAgenteRetencion: e.target.checked })} />
        INTALES es agente de retención (habilita la retención del 3 % en compras)
      </label>
      <div className="space-y-2">
        <h3 className="text-sm font-bold text-gray-700 uppercase">Cuentas de tesorería</h3>
        <table className="w-full text-sm bg-white rounded-xl border border-gray-100">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500"><tr><th className="px-3 py-2 text-left">Nombre</th><th className="px-3 py-2 text-left">Tipo</th><th className="px-3 py-2 text-left">Moneda</th><th className="px-3 py-2 text-left">Activa</th></tr></thead>
          <tbody className="divide-y divide-gray-100">
            {cuentas.map((c) => (
              <tr key={c._id}>
                <td className="px-3 py-2">{c.nombre}</td>
                <td className="px-3 py-2">{TIPOS[c.tipo]}</td>
                <td className="px-3 py-2">{c.moneda}</td>
                <td className="px-3 py-2"><input type="checkbox" checked={c.activo} onChange={(e) => guardar(`/cuentas-tesoreria/${c._id}`, "PUT", { activo: e.target.checked })} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex flex-wrap gap-2 items-center">
          <input value={nueva.nombre} onChange={set("nombre")} placeholder="Nombre de la cuenta" className={INP} />
          <select value={nueva.tipo} onChange={set("tipo")} className={INP}>{Object.entries(TIPOS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          <select value={nueva.moneda} onChange={set("moneda")} className={INP}><option value="PEN">PEN</option><option value="USD">USD</option></select>
          <button onClick={crear} disabled={!nueva.nombre.trim()} className="bg-purple-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-50">Agregar cuenta</button>
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>
    </div>
  );
}
```
- [ ] **Step 3: Verificar** — Run: `cd Frontend && npm run lint` — Expected: sin errores en `src/components/tesoreria/`.

- [ ] **Step 4: Commit**
```bash
git -C Frontend add src/components/tesoreria/PanelSire.jsx src/components/tesoreria/PanelConfiguracion.jsx
git -C Frontend commit -m "feat(tesoreria): conciliación SIRE y configuración de cuentas" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: Página Tesorería, ruta, menú y pagos antiguos en Requerimientos

**Files:**
- Create: `Frontend/src/pages/Tesoreria.jsx`
- Modify: `Frontend/src/App.jsx`, `Frontend/src/components/Sidebar.jsx`, `Frontend/src/pages/Requerimientos.jsx`

**Interfaces:**
- Consumes: Tasks 10–13; `GET /empresas?tipo=proveedor`, `GET /centros-costo`, `GET /configuracion`, `GET /tipo-cambio`.

- [ ] **Step 1: Página** — `Frontend/src/pages/Tesoreria.jsx`:
```jsx
import { useState, useEffect, useCallback } from "react";
import { fetchAuth, getUsuario } from "../utils/fetchAuth";
import TablaPorPagar from "../components/tesoreria/TablaPorPagar";
import TablaPorCobrar from "../components/tesoreria/TablaPorCobrar";
import TablaMovimientos from "../components/tesoreria/TablaMovimientos";
import PanelSire from "../components/tesoreria/PanelSire";
import PanelConfiguracion from "../components/tesoreria/PanelConfiguracion";
import ModalFacturaProveedor from "../components/tesoreria/ModalFacturaProveedor";

const TABS = [
  { id: "por-pagar", label: "Por pagar" },
  { id: "por-cobrar", label: "Por cobrar" },
  { id: "movimientos", label: "Movimientos" },
  { id: "sire", label: "SIRE" },
  { id: "configuracion", label: "Configuración", soloJefatura: true },
];

// El modal de factura vive aquí porque lo abren dos pestañas (Por pagar y SIRE).
export default function Tesoreria() {
  const puedeConfigurar = ["jefatura", "admin"].includes(getUsuario()?.rol);
  const [tab, setTab] = useState("por-pagar");
  const [catalogos, setCatalogos] = useState({ proveedores: [], centrosCosto: [], esAgenteRetencion: false, tipoCambio: 3.75 });
  const [modalFactura, setModalFactura] = useState(null);
  const [recarga, setRecarga] = useState(0);

  const cargarCatalogos = useCallback(() => Promise.all([
    fetchAuth("/empresas?tipo=proveedor"), fetchAuth("/centros-costo"), fetchAuth("/configuracion"), fetchAuth("/tipo-cambio"),
  ]).then(async ([rP, rC, rG, rT]) => {
    setCatalogos({
      proveedores: rP.ok ? await rP.json() : [],
      centrosCosto: rC.ok ? (await rC.json()).filter((c) => c.activo) : [],
      esAgenteRetencion: rG.ok ? !!(await rG.json()).esAgenteRetencion : false,
      tipoCambio: rT.ok ? (await rT.json()).valor : 3.75,
    });
  }), []);
  useEffect(() => { cargarCatalogos(); }, [cargarCatalogos]);

  const facturaGuardada = () => {
    setModalFactura(null);
    setRecarga((n) => n + 1);
    setTab("por-pagar");
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-800">Tesorería</h1>
        <p className="text-sm text-gray-400 mt-0.5">Cuentas por pagar y por cobrar, pagos, detracciones y retenciones, conciliación con el SIRE</p>
      </div>
      <div className="flex border-b border-gray-200 gap-1 flex-wrap">
        {TABS.filter((t) => !t.soloJefatura || puedeConfigurar).map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2.5 text-sm font-medium transition border-b-2 -mb-px ${
              tab === t.id ? "border-purple-600 text-purple-700" : "border-transparent text-gray-500 hover:text-gray-700"
            }`}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === "por-pagar" && <TablaPorPagar recarga={recarga} onRegistrarFactura={setModalFactura} />}
      {tab === "por-cobrar" && <TablaPorCobrar />}
      {tab === "movimientos" && <TablaMovimientos />}
      {tab === "sire" && <PanelSire onRegistrarFactura={setModalFactura} />}
      {tab === "configuracion" && puedeConfigurar && <PanelConfiguracion onCambio={cargarCatalogos} />}
      {modalFactura && (
        <ModalFacturaProveedor ocpId={modalFactura.ocpId} precarga={modalFactura.precarga} catalogos={catalogos}
          onClose={() => setModalFactura(null)} onGuardada={facturaGuardada} />
      )}
    </div>
  );
}
```
Tras registrar desde SIRE se vuelve a "Por pagar" a propósito: la conciliación se recarga al volver a abrir la pestaña SIRE.

- [ ] **Step 2: Ruta** — en `Frontend/src/App.jsx`: `import Tesoreria from "./pages/Tesoreria";` junto a `import Compras …`, y después del `<Route path="/compras" …/>`:
```jsx
      <Route
        path="/tesoreria"
        element={
          <ProtectedRoute roles={["admin", "jefatura", "facturacion"]}>
            <Layout><Tesoreria /></Layout>
          </ProtectedRoute>
        }
      />
```

- [ ] **Step 3: Menú** — en `Frontend/src/components/Sidebar.jsx`, debajo de la entrada `/compras`:
```jsx
    { to: "/tesoreria", label: "Tesorería", Icon: IconReceipt, show: esAdmin || esFacturacion || esJefatura },
```
y en el comentario de la matriz de roles agregar la línea `// - Tesorería (por pagar/cobrar, movimientos, SIRE): admin, jefatura y facturacion.`

- [ ] **Step 4: Requerimientos — pagos antiguos solo sin OC a proveedor**

En `Frontend/src/pages/Requerimientos.jsx` reemplazar
```js
  const itemsPendientePago = itemsCompra.filter((it) => it.estadoPago === "pendiente_pago");
  const itemsPagados = itemsCompra.filter((it) => it.estadoPago === "pagado");
```
por
```js
  // Con solicitud de compra el pago va por Tesorería (OC a proveedor → factura
  // → movimiento); aquí quedan solo los pagos antiguos.
  const itemsLegacy = itemsCompra.filter((it) => !it.solicitudCompra);
  const itemsPendientePago = itemsLegacy.filter((it) => it.estadoPago === "pendiente_pago");
  const itemsPagados = itemsLegacy.filter((it) => it.estadoPago === "pagado");
```
y
```js
  const serviciosPendientePago = serviciosActivos.filter((s) => s.estadoPago === "pendiente_pago");
  const serviciosPagados = serviciosActivos.filter((s) => s.estadoPago === "pagado");
```
por
```js
  const serviciosLegacy = serviciosActivos.filter((s) => !s.solicitudCompra);
  const serviciosPendientePago = serviciosLegacy.filter((s) => s.estadoPago === "pendiente_pago");
  const serviciosPagados = serviciosLegacy.filter((s) => s.estadoPago === "pagado");
  const hayPagosMateriales = itemsPendientePago.length + itemsPagados.length > 0;
  const tabsMateriales = hayPagosMateriales ? TABS_MATERIALES : TABS_MATERIALES.filter((t) => t.id === "activos" || t.id === "completados");
  const tabsServicios = serviciosPendientePago.length + serviciosPagados.length > 0 ? TABS_SERVICIOS : [];
```
y en el render de pestañas `(seccion === "materiales" ? TABS_MATERIALES : TABS_SERVICIOS)` → `(seccion === "materiales" ? tabsMateriales : tabsServicios)`. Si `tabMateriales` apunta a una pestaña oculta, el render de esas listas ya muestra su mensaje de vacío: no hace falta forzar el cambio de pestaña.

- [ ] **Step 5: Verificar** — Run: `cd Frontend && npm test && npm run lint && npm run build` — Expected: PASS; sin errores nuevos de lint; build OK.

- [ ] **Step 6: Commit**
```bash
git -C Frontend add src/pages/Tesoreria.jsx src/App.jsx src/components/Sidebar.jsx src/pages/Requerimientos.jsx
git -C Frontend commit -m "feat(tesoreria): página Tesorería con 5 pestañas y menú; requerimientos solo pagos antiguos" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 15: Verificación de punta a punta, datos y documentación

**Files:**
- Modify: `docs/superpowers/specs/2026-09-28-tesoreria-b1-design.md` (sección "Estado"), memoria `project_compras_fases.md`

- [ ] **Step 1: Suites completas** — Run: `cd Backend && npm test` y `cd Frontend && npm test && npm run lint && npm run build` — Expected: todo PASS (lint solo con los errores preexistentes).

- [ ] **Step 2: Preparar la base de dev** — con Mongo local en `rs0` y el `.env` apuntando a `?replicaSet=rs0`: Run: `cd Backend && node src/scripts/prepararTesoreria.js` dos veces — Expected: primera `{ cuentasCreadas: 5, facturasVenta: N }`, segunda `{ cuentasCreadas: 0, … }`.

- [ ] **Step 3: Recorrido Playwright** (backend `npm run dev`, frontend `npm run dev`, usuario `facturacion`):
1. Tesorería → Por pagar (Por OC): una OCP de servicios con saldo → "+ Registrar factura" → la sugerencia es Detracción 037; registrar; en *Por factura* aparece con ☐ Imp. y ☐ Neto.
2. "Registrar pago" → Neto desde BCP Soles → ☑ Neto; de nuevo → Impuesto con constancia → ☑ Imp.; la OCP queda sin saldo y en Requerimientos/Compras el origen figura pagado.
3. Movimientos: aparecen los dos egresos con su comprobante; anular uno con motivo → el ☑ vuelve a ☐.
4. Por cobrar: una factura de venta > S/ 700 → Registrar cobro del neto y de la detracción a la cuenta de detracciones → en Facturas la fila pasa a "Facturas cerradas".
5. SIRE: Compras, periodo actual, "Subir archivo" con un ZIP de prueba (generado con `test/fixtures/sire.js`: `node -e "import('./test/fixtures/sire.js').then(m=>require('fs').writeFileSync('propuesta.zip', m.zipDe(m.CAB_RCE,[m.lineaRce()])))"` desde `Backend/`) → la conciliación muestra los resultados; "Registrar factura" en un `solo_sire` abre el modal precargado.
6. Tomar capturas de cada pestaña; revisar la consola (sin errores).
Expected: cada paso se comporta como se indica. Todo desvío es un bug que se corrige con su test antes de seguir.

- [ ] **Step 4: Archivo SIRE real** — pedir al usuario un ZIP de propuesta RCE real de INTALES y subirlo en el Step 3.5; si el parser rechaza columnas, ajustar solo los predicados de `mapaColumnas` en `sireParser.js` agregando el caso real a `test/sire.test.js`. Si el usuario todavía no tiene el archivo, dejarlo anotado como pendiente en el spec.

- [ ] **Step 5: Grafo y documentación** — Run: `graphify update .` en la raíz. Agregar al spec una sección `## Estado (fecha)` con lo entregado, rulings y pendientes (archivo SIRE real si aplica; B2, B3 y C). Actualizar la memoria `project_compras_fases.md` con el estado de B1.

- [ ] **Step 6: Commit final** (solo si hubo fixes en los Steps 3–4; los docs no están versionados)
```bash
git -C Backend status --short
git -C Frontend status --short
```
