# Bloqueo de edición — Fase 0 (infraestructura) + Fase 1 (Comercial) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que un documento de Comercial (cotización, OC del cliente, OT/sub-OT, informe, notificación de trabajo, ingreso de equipo) solo lo edite quien pulsó "Editar"; los demás lo ven en solo lectura con "En edición por {usuario} desde las {hh:mm}", y el servidor rechaza toda escritura sin bloqueo.

**Architecture:** Colección `BloqueoEdicion` (un registro por documento, con vencimiento renovado por latido) + rutas `/api/bloqueos` + middleware `exigeBloqueo(entidad, { version })` en cada ruta de escritura. Frontend: hook `useBloqueoEdicion` (tomar, latido, soltar, `fetch`/`upload` con cabeceras), componente `<BarraEdicion>` y `conBloqueo()` para acciones sobre otros documentos. Las Fases 2–4 (Facturación, Compras/Tesorería, Almacén/catálogos) usan esta misma infraestructura en planes posteriores.

**Tech Stack:** Node 24 + Express 4 + Mongoose 8 (ESM), MongoDB replica set; React 19 + Vite + Tailwind 3. Tests `node:test`.

**Spec:** `docs/superpowers/specs/2026-09-28-bloqueo-edicion-design.md`

## Global Constraints

- Repos separados `Backend/` y `Frontend/`. Antes de la Task 1 crear la rama `feature/bloqueo-edicion` en ambos (desde `main`). Todo commit termina con la línea `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` (segundo `-m`).
- Tests backend: `cd Backend && npm test` con `MONGO_URI_TEST` apuntando a un replica set (hoy `mongodb://localhost:27018/sipapp-intales-test?replicaSet=rs0`).
- Tiempos del spec: bloqueo dura **2 min** y se renueva con cada latido; latido cada **60 s**; sin actividad por **15 min** deja de renovarse; mientras está ocupado por otro, la pantalla consulta cada **30 s**.
- Respuestas: documento tomado por otro o sin bloqueo → **423** `{ mensaje, bloqueo: true }`; versión desactualizada → **409** `{ mensaje, cambio: true }`; bloqueo vencido en el latido → **410**.
- Hora de los avisos en `America/Lima`, formato `HH:mm` 24 h.
- La verificación de versión (`X-Version`) aplica solo a los guardados de formulario (PUT de cotización, OC, OT, ingreso de equipo); las acciones puntuales (anular, estado, archivos, confirmaciones, generar/quitar OT, abrir/anular notificación) solo exigen el bloqueo (`X-Bloqueo`) — así una subida de varios archivos seguidos no choca consigo misma.
- Crear documentos (POST a la colección, `POST /ordenes-trabajo/:id/sub-ot`) no exige bloqueo.
- Regla 7 del spec (anular/eliminar descarta el bloqueo) sin código de servidor: quien anula o elimina ya tiene el bloqueo (propio o temporal vía `conBloqueo`) y la pantalla lo suelta al terminar; si ese aviso no llega, vence en ≤ 2 min.
- Nunca `window.alert/confirm/prompt`; los mensajes 423/409 se ven en la `BarraEdicion` o en el error del formulario.
- Frontend: la lógica pura va en `src/utils/bloqueo.js` con tests `node:test`; lint sin errores nuevos (hay 52 preexistentes en otros archivos); `npm run build` OK.

## Review Focus

1. Cerrar el detalle, la pestaña o la app de Electron sin guardar suelta el bloqueo (DELETE con `keepalive`) o, si ese aviso no llega, vence en ≤ 2 min — verificado en la Task 10 (Playwright, cerrar la página).
2. La misma persona abre el mismo documento en dos ventanas: la segunda ve "En edición por ti en otra ventana" — test en Task 1.
3. Alguien vuelve tras 15 min de inactividad, otro ya editó y guardó: al guardar recibe 409 y no pisa los cambios — test en Task 2 (middleware) y Task 10 (Playwright).
4. Acciones desde solo lectura (anular, subir archivo) toman un bloqueo temporal; si otro está editando fallan con "En edición por {usuario}" — test de cobertura en Task 5 y Playwright en Task 10.
5. Subir varios archivos seguidos mientras se edita no produce 409 (acciones sin versión) — test en Task 2.

## Estructura de archivos

**Backend — crear:** `src/models/BloqueoEdicion.js`, `src/utils/bloqueo.js`, `src/utils/entidadesBloqueo.js`, `src/routes/bloqueos.js`, `src/middleware/exigeBloqueo.js`, `test/bloqueos.test.js`, `test/exigeBloqueo.test.js`, `test/bloqueoComercial.test.js`.
**Backend — modificar:** `src/index.js`, `test/helpers.js`, `src/routes/cotizaciones.js`, `src/routes/ordenesCompra.js`, `src/routes/ordenesTrabajo.js`, `src/routes/informes.js`, `src/routes/notificacionesTrabajo.js`, `src/routes/ingresosEquipo.js`.
**Frontend — crear:** `src/utils/bloqueo.js` (+ `bloqueo.test.js`), `src/utils/bloqueoApi.js`, `src/hooks/useBloqueoEdicion.js`, `src/components/BarraEdicion.jsx`.
**Frontend — modificar:** `src/utils/fetchAuth.js`, `src/components/DetalleCotizacion.jsx`, `src/components/TarjetaArchivosRelacionados.jsx`, `src/components/ModalNuevaCotizacion.jsx`, `src/components/ModalNuevaOT.jsx`, `src/components/DetalleOrdenCompra.jsx`, `src/pages/ListaOrdenesCompra.jsx`, `src/components/DetalleOrdenTrabajo.jsx`, `src/components/DetalleSubOT.jsx`, `src/components/ModalDetalleNotificacionTrabajo.jsx`, `src/pages/IngresoEquipos.jsx`.

---

## BACKEND

### Task 1: Modelo, catálogo de entidades y rutas `/api/bloqueos`

**Files:**
- Create: `Backend/src/models/BloqueoEdicion.js`, `Backend/src/utils/bloqueo.js`, `Backend/src/utils/entidadesBloqueo.js`, `Backend/src/routes/bloqueos.js`
- Modify: `Backend/test/helpers.js`, `Backend/src/index.js`
- Test: `Backend/test/bloqueos.test.js`

**Interfaces:**
- Produces:
  - `BloqueoEdicion { entidad, documento, usuario, usuarioNombre, clave, tomadoEn, ultimaActividad, expiraEn }`.
  - `utils/bloqueo.js`: `DURACION_BLOQUEO_MS = 120000`, `INACTIVIDAD_MAX_MS = 900000`, `mensajeOcupado({ ocupado, usuarioNombre, tomadoEn, propio }) → string`.
  - `utils/entidadesBloqueo.js`: `ENTIDADES_BLOQUEO = { cotizacion, ordenCompra, ordenTrabajo, informe, notificacionTrabajo, ingresoEquipo }`, cada una `{ modelo, roles | null }`.
  - `GET /api/bloqueos/:entidad/:documento → { ocupado, usuarioNombre?, tomadoEn?, propio?, version }`.
  - `POST /api/bloqueos { entidad, documento } → 201 { clave, expiraEn, version } | 423 { ocupado, usuarioNombre, tomadoEn, propio, mensaje }`.
  - `PUT /api/bloqueos/:clave { activo } → { expiraEn } | 410`.
  - `DELETE /api/bloqueos/:clave → { ok: true }` (idempotente).
  - `test/helpers.js`: `token(rol, nombre, id)` y `srv.api(metodo, ruta, { body, rol, formData, headers, usuario: { id, nombre } })`.

- [ ] **Step 1: Helper de tests con usuario estable y cabeceras** — en `Backend/test/helpers.js` reemplazar
```js
export function token(rol = "admin", nombre = "Tester") {
  return jwt.sign({ id: new mongoose.Types.ObjectId().toString(), nombre, rol }, process.env.JWT_SECRET);
}
```
por
```js
export function token(rol = "admin", nombre = "Tester", id = new mongoose.Types.ObjectId().toString()) {
  return jwt.sign({ id, nombre, rol }, process.env.JWT_SECRET);
}
```
y en `levantar` reemplazar
```js
  const api = async (metodo, ruta, { body, rol = "admin", formData } = {}) => {
    const headers = { Authorization: `Bearer ${token(rol)}` };
```
por
```js
  const api = async (metodo, ruta, { body, rol = "admin", formData, headers: extra = {}, usuario } = {}) => {
    const headers = { Authorization: `Bearer ${token(rol, usuario?.nombre, usuario?.id)}`, ...extra };
```

- [ ] **Step 2: Escribir el test que falla**

`Backend/test/bloqueos.test.js`:
```js
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { conectar, desconectar, limpiar, levantar } from "./helpers.js";
import bloqueosRoutes from "../src/routes/bloqueos.js";
import BloqueoEdicion from "../src/models/BloqueoEdicion.js";
import Cotizacion from "../src/models/Cotizacion.js";
import { mensajeOcupado } from "../src/utils/bloqueo.js";

let srv, cot;
const ana = { id: new mongoose.Types.ObjectId().toString(), nombre: "Ana" };
const luis = { id: new mongoose.Types.ObjectId().toString(), nombre: "Luis" };
before(async () => { await conectar(); srv = await levantar({ "/api/bloqueos": bloqueosRoutes }); });
after(async () => { await srv.cerrar(); await desconectar(); });
beforeEach(async () => {
  await limpiar();
  const { insertedId } = await Cotizacion.collection.insertOne({ codigo: "COT-T", updatedAt: new Date("2026-09-28T15:00:00Z") });
  cot = insertedId.toString();
});

const tomar = (usuario, rol = "jefatura") => srv.api("POST", "/api/bloqueos", { body: { entidad: "cotizacion", documento: cot }, usuario, rol });

test("mensajeOcupado usa la hora de Lima y distingue la otra ventana propia", () => {
  assert.equal(mensajeOcupado({ ocupado: true, usuarioNombre: "Ana", tomadoEn: "2026-09-28T15:32:00Z" }), "En edición por Ana desde las 10:32");
  assert.equal(mensajeOcupado({ ocupado: true, propio: true }), "En edición por ti en otra ventana");
});

test("tomar da la clave y la versión; otro usuario recibe 423 con quién lo edita; la misma persona, 'otra ventana'", async () => {
  const r = await tomar(ana);
  assert.equal(r.status, 201, JSON.stringify(r.data));
  assert.ok(r.data.clave);
  assert.equal(r.data.version, "2026-09-28T15:00:00.000Z");
  const otro = await tomar(luis);
  assert.equal(otro.status, 423);
  assert.match(otro.data.mensaje, /^En edición por Ana desde las \d{2}:\d{2}$/);
  const mismo = await tomar(ana);
  assert.equal(mismo.status, 423);
  assert.equal(mismo.data.mensaje, "En edición por ti en otra ventana");
  const estado = await srv.api("GET", `/api/bloqueos/cotizacion/${cot}`, { usuario: luis });
  assert.deepEqual([estado.data.ocupado, estado.data.usuarioNombre, estado.data.propio], [true, "Ana", false]);
});

test("dos tomas simultáneas: gana una sola", async () => {
  const [a, b] = await Promise.all([tomar(ana), tomar(luis)]);
  assert.deepEqual([a.status, b.status].sort(), [201, 423]);
  assert.equal(await BloqueoEdicion.countDocuments(), 1);
});

test("un bloqueo vencido se puede tomar", async () => {
  await tomar(ana);
  await BloqueoEdicion.updateOne({}, { $set: { expiraEn: new Date(Date.now() - 1000) } });
  assert.equal((await tomar(luis)).status, 201);
});

test("el latido extiende con actividad reciente y deja de extender tras 15 min sin actividad", async () => {
  const { clave } = (await tomar(ana)).data;
  await BloqueoEdicion.updateOne({ clave }, { $set: { expiraEn: new Date(Date.now() + 5000) } });
  const r1 = await srv.api("PUT", `/api/bloqueos/${clave}`, { body: { activo: true }, usuario: ana });
  assert.equal(r1.status, 200);
  assert.ok(new Date(r1.data.expiraEn) - Date.now() > 100000);
  const hace16 = new Date(Date.now() - 16 * 60 * 1000);
  const expira = new Date(Date.now() + 30000);
  await BloqueoEdicion.updateOne({ clave }, { $set: { ultimaActividad: hace16, expiraEn: expira } });
  const r2 = await srv.api("PUT", `/api/bloqueos/${clave}`, { body: { activo: false }, usuario: ana });
  assert.equal(new Date(r2.data.expiraEn).getTime(), expira.getTime());
  await BloqueoEdicion.updateOne({ clave }, { $set: { expiraEn: new Date(Date.now() - 1000) } });
  assert.equal((await srv.api("PUT", `/api/bloqueos/${clave}`, { body: { activo: true }, usuario: ana })).status, 410);
  assert.equal((await srv.api("PUT", `/api/bloqueos/${clave}`, { body: { activo: true }, usuario: luis })).status, 410);
});

test("soltar libera el documento para otro", async () => {
  const { clave } = (await tomar(ana)).data;
  assert.equal((await srv.api("DELETE", `/api/bloqueos/${clave}`, { usuario: ana })).status, 200);
  assert.equal((await srv.api("GET", `/api/bloqueos/cotizacion/${cot}`, { usuario: luis })).data.ocupado, false);
  assert.equal((await tomar(luis)).status, 201);
});

test("permisos y validaciones: rol sin edición 403, entidad desconocida 400, documento inexistente 404", async () => {
  assert.equal((await tomar(ana, "vendedor")).status, 403);
  assert.equal((await srv.api("POST", "/api/bloqueos", { body: { entidad: "xyz", documento: cot } })).status, 400);
  assert.equal((await srv.api("POST", "/api/bloqueos", { body: { entidad: "cotizacion", documento: new mongoose.Types.ObjectId().toString() } })).status, 404);
});
```

- [ ] **Step 3: Correr y verificar que falla** — Run: `cd Backend && node --test test/bloqueos.test.js` — Expected: FAIL (`Cannot find module '../src/routes/bloqueos.js'`).

- [ ] **Step 4: Implementar**

`Backend/src/models/BloqueoEdicion.js`:
```js
import mongoose from "mongoose";

// Quién está editando qué documento (spec 2026-09-28-bloqueo-edicion). Un registro
// por documento; si no se renueva (latido) vence solo. El índice TTL lo borra
// después, pero toda consulta trata expiraEn <= ahora como libre.
const bloqueoEdicionSchema = new mongoose.Schema({
  entidad: { type: String, required: true },
  documento: { type: mongoose.Schema.Types.ObjectId, required: true },
  usuario: { type: mongoose.Schema.Types.ObjectId, required: true },
  usuarioNombre: { type: String, default: "" },
  clave: { type: String, required: true },
  tomadoEn: { type: Date, required: true },
  ultimaActividad: { type: Date, required: true },
  expiraEn: { type: Date, required: true },
});

bloqueoEdicionSchema.index({ entidad: 1, documento: 1 }, { unique: true });
bloqueoEdicionSchema.index({ expiraEn: 1 }, { expireAfterSeconds: 0 });
bloqueoEdicionSchema.index({ clave: 1 });

export default mongoose.model("BloqueoEdicion", bloqueoEdicionSchema);
```

`Backend/src/utils/bloqueo.js`:
```js
export const DURACION_BLOQUEO_MS = 2 * 60 * 1000;
export const INACTIVIDAD_MAX_MS = 15 * 60 * 1000;

const horaLima = (d) => new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(d));

export function mensajeOcupado({ ocupado = true, usuarioNombre, tomadoEn, propio }) {
  if (!ocupado) return "El documento se acaba de liberar — vuelve a intentarlo";
  if (propio) return "En edición por ti en otra ventana";
  return `En edición por ${usuarioNombre} desde las ${horaLima(tomadoEn)}`;
}
```

`Backend/src/utils/entidadesBloqueo.js`:
```js
import Cotizacion from "../models/Cotizacion.js";
import OrdenCompra from "../models/OrdenCompra.js";
import OrdenTrabajo from "../models/OrdenTrabajo.js";
import Informe from "../models/Informe.js";
import NotificacionTrabajo from "../models/NotificacionTrabajo.js";
import IngresoEquipo from "../models/IngresoEquipo.js";

// Documentos con bloqueo de edición. `roles`: quién puede TOMAR el documento —
// la unión de los roles de sus rutas de escritura (cada ruta sigue validando su
// propio permiso). null = cualquier usuario autenticado (la ruta no filtra por rol).
export const ENTIDADES_BLOQUEO = {
  cotizacion: { modelo: Cotizacion, roles: ["admin", "asistente", "facturacion", "jefatura", "coordinadora", "planner"] },
  ordenCompra: { modelo: OrdenCompra, roles: ["admin", "asistente", "facturacion", "jefatura", "coordinadora"] },
  ordenTrabajo: {
    modelo: OrdenTrabajo,
    roles: ["admin", "jefatura", "supervisor", "planner", "coordinadora", "asistente", "tecnico", "tecnico_prueba", "tecnico_intervencion"],
  },
  informe: { modelo: Informe, roles: null },
  notificacionTrabajo: { modelo: NotificacionTrabajo, roles: ["admin", "jefatura", "supervisor"] },
  ingresoEquipo: { modelo: IngresoEquipo, roles: null },
};
```

`Backend/src/routes/bloqueos.js`:
```js
import { Router } from "express";
import crypto from "crypto";
import mongoose from "mongoose";
import authMiddleware from "../middleware/authMiddleware.js";
import BloqueoEdicion from "../models/BloqueoEdicion.js";
import { ENTIDADES_BLOQUEO } from "../utils/entidadesBloqueo.js";
import { errorHttp } from "../utils/errorHttp.js";
import { DURACION_BLOQUEO_MS, INACTIVIDAD_MAX_MS, mensajeOcupado } from "../utils/bloqueo.js";

const router = Router();
router.use(authMiddleware);

function configDe(entidad) {
  const c = ENTIDADES_BLOQUEO[entidad];
  if (!c) throw errorHttp(400, "Este tipo de documento no tiene bloqueo de edición");
  return c;
}

const vigente = (b) => !!b && b.expiraEn > new Date();
const estadoDe = (b, usuarioId) => (vigente(b)
  ? { ocupado: true, usuarioNombre: b.usuarioNombre, tomadoEn: b.tomadoEn, propio: String(b.usuario) === String(usuarioId) }
  : { ocupado: false });

async function documentoDe(modelo, id) {
  if (!mongoose.isValidObjectId(id)) throw errorHttp(400, "Documento inválido");
  const doc = await modelo.findById(id, "updatedAt");
  if (!doc) throw errorHttp(404, "Documento no encontrado");
  return doc;
}

router.get("/:entidad/:documento", async (req, res, next) => {
  try {
    const doc = await documentoDe(configDe(req.params.entidad).modelo, req.params.documento);
    const b = await BloqueoEdicion.findOne({ entidad: req.params.entidad, documento: doc._id });
    res.json({ ...estadoDe(b, req.usuario.id), version: doc.updatedAt?.toISOString() || null });
  } catch (err) { next(err); }
});

// Tomar es atómico: solo coincide si no hay bloqueo vigente; si lo hay, el upsert
// choca con el índice único (entidad, documento) y se responde quién lo tiene.
router.post("/", async (req, res, next) => {
  try {
    const { entidad, documento } = req.body;
    const { modelo, roles } = configDe(entidad);
    if (roles && !roles.includes(req.usuario.rol)) {
      return res.status(403).json({ mensaje: "No tienes permiso para editar este documento." });
    }
    const doc = await documentoDe(modelo, documento);
    const ahora = new Date();
    try {
      const b = await BloqueoEdicion.findOneAndUpdate(
        { entidad, documento: doc._id, expiraEn: { $lte: ahora } },
        { $set: {
          usuario: req.usuario.id, usuarioNombre: req.usuario.nombre, clave: crypto.randomUUID(),
          tomadoEn: ahora, ultimaActividad: ahora, expiraEn: new Date(ahora.getTime() + DURACION_BLOQUEO_MS),
        } },
        { upsert: true, new: true }
      );
      return res.status(201).json({ clave: b.clave, expiraEn: b.expiraEn, version: doc.updatedAt?.toISOString() || null });
    } catch (err) {
      if (err.code !== 11000) throw err;
    }
    const estado = estadoDe(await BloqueoEdicion.findOne({ entidad, documento: doc._id }), req.usuario.id);
    res.status(423).json({ ...estado, mensaje: mensajeOcupado(estado) });
  } catch (err) { next(err); }
});

router.put("/:clave", async (req, res, next) => {
  try {
    const b = await BloqueoEdicion.findOne({ clave: req.params.clave, usuario: req.usuario.id });
    if (!vigente(b)) return res.status(410).json({ mensaje: "Tu edición se liberó" });
    const ahora = new Date();
    if (req.body.activo) b.ultimaActividad = ahora;
    if (ahora - b.ultimaActividad < INACTIVIDAD_MAX_MS) b.expiraEn = new Date(ahora.getTime() + DURACION_BLOQUEO_MS);
    await b.save();
    res.json({ expiraEn: b.expiraEn });
  } catch (err) { next(err); }
});

router.delete("/:clave", async (req, res, next) => {
  try {
    await BloqueoEdicion.deleteOne({ clave: req.params.clave, usuario: req.usuario.id });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

export default router;
```

En `Backend/src/index.js`, junto a las demás rutas (después del import de `tiposArticuloRoutes` y de su `app.use`):
```js
import bloqueosRoutes from "./routes/bloqueos.js";
```
```js
app.use("/api/bloqueos", bloqueosRoutes);
```

- [ ] **Step 5: Correr** — Run: `cd Backend && npm test` — Expected: PASS (incluidas las 96 anteriores).

- [ ] **Step 6: Commit**
```bash
git -C Backend add src/models/BloqueoEdicion.js src/utils/bloqueo.js src/utils/entidadesBloqueo.js src/routes/bloqueos.js src/index.js test/helpers.js test/bloqueos.test.js
git -C Backend commit -m "feat(bloqueo): colección y rutas para tomar, renovar y soltar el bloqueo de edición" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Middleware `exigeBloqueo`

**Files:**
- Create: `Backend/src/middleware/exigeBloqueo.js`
- Test: `Backend/test/exigeBloqueo.test.js`

**Interfaces:**
- Consumes: Task 1.
- Produces: `exigeBloqueo(entidad, { param = "id", version = false } = {})` → middleware Express. Cabeceras: `X-Bloqueo` (clave), `X-Version` (ISO `updatedAt`, solo si `version`).

- [ ] **Step 1: Escribir el test que falla**

`Backend/test/exigeBloqueo.test.js`:
```js
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { Router } from "express";
import mongoose from "mongoose";
import { conectar, desconectar, limpiar, levantar } from "./helpers.js";
import authMiddleware from "../src/middleware/authMiddleware.js";
import exigeBloqueo from "../src/middleware/exigeBloqueo.js";
import bloqueosRoutes from "../src/routes/bloqueos.js";
import Cotizacion from "../src/models/Cotizacion.js";

const ana = { id: new mongoose.Types.ObjectId().toString(), nombre: "Ana" };
const luis = { id: new mongoose.Types.ObjectId().toString(), nombre: "Luis" };
let srv, cot;

const prueba = Router();
prueba.use(authMiddleware);
prueba.put("/:id", exigeBloqueo("cotizacion", { version: true }), async (req, res) => {
  await Cotizacion.updateOne({ _id: req.params.id }, { $set: { updatedAt: new Date() } });
  res.json({ ok: true });
});
prueba.patch("/:id/accion", exigeBloqueo("cotizacion"), async (req, res) => {
  await Cotizacion.updateOne({ _id: req.params.id }, { $set: { updatedAt: new Date() } });
  res.json({ ok: true });
});

before(async () => { await conectar(); srv = await levantar({ "/api/bloqueos": bloqueosRoutes, "/api/prueba": prueba }); });
after(async () => { await srv.cerrar(); await desconectar(); });
beforeEach(async () => {
  await limpiar();
  cot = (await Cotizacion.collection.insertOne({ codigo: "COT-T", updatedAt: new Date("2026-09-28T15:00:00Z") })).insertedId.toString();
});

const tomar = async (usuario) => (await srv.api("POST", "/api/bloqueos", { body: { entidad: "cotizacion", documento: cot }, usuario, rol: "jefatura" })).data;
const cab = (clave, version) => ({ "X-Bloqueo": clave, ...(version ? { "X-Version": version } : {}) });

test("sin bloqueo → 423 'Pulsa Editar'; con el bloqueo de otro → 423 con su nombre", async () => {
  const sin = await srv.api("PUT", `/api/prueba/${cot}`, { usuario: luis, body: {} });
  assert.equal(sin.status, 423);
  assert.match(sin.data.mensaje, /Pulsa «Editar»/);
  await tomar(ana);
  const ajena = await srv.api("PUT", `/api/prueba/${cot}`, { usuario: luis, body: {}, headers: cab("otra-clave", "2026-09-28T15:00:00.000Z") });
  assert.equal(ajena.status, 423);
  assert.match(ajena.data.mensaje, /En edición por Ana/);
});

test("con el bloqueo y la versión vigente pasa; con versión vieja → 409 'cambió'", async () => {
  const { clave, version } = await tomar(ana);
  const ok = await srv.api("PUT", `/api/prueba/${cot}`, { usuario: ana, body: {}, headers: cab(clave, version) });
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  const vieja = await srv.api("PUT", `/api/prueba/${cot}`, { usuario: ana, body: {}, headers: cab(clave, version) });
  assert.equal(vieja.status, 409);
  assert.equal(vieja.data.cambio, true);
});

test("las acciones sin versión no chocan consigo mismas (varios archivos seguidos)", async () => {
  const { clave } = await tomar(ana);
  for (let i = 0; i < 3; i++) {
    const r = await srv.api("PATCH", `/api/prueba/${cot}/accion`, { usuario: ana, body: {}, headers: cab(clave) });
    assert.equal(r.status, 200);
  }
});

test("un bloqueo vencido no autoriza a guardar", async () => {
  const { clave, version } = await tomar(ana);
  await mongoose.model("BloqueoEdicion").updateOne({ clave }, { $set: { expiraEn: new Date(Date.now() - 1000) } });
  assert.equal((await srv.api("PUT", `/api/prueba/${cot}`, { usuario: ana, body: {}, headers: cab(clave, version) })).status, 423);
});
```

- [ ] **Step 2: Correr y verificar que falla** — Run: `cd Backend && node --test test/exigeBloqueo.test.js` — Expected: FAIL (`Cannot find module '../src/middleware/exigeBloqueo.js'`).

- [ ] **Step 3: Implementar** — `Backend/src/middleware/exigeBloqueo.js`:
```js
import BloqueoEdicion from "../models/BloqueoEdicion.js";
import { ENTIDADES_BLOQUEO } from "../utils/entidadesBloqueo.js";
import { mensajeOcupado } from "../utils/bloqueo.js";

// Toda escritura sobre un documento existente exige su bloqueo de edición vigente
// (cabecera X-Bloqueo). Con { version: true } —guardados de formulario— además
// exige que el documento no haya cambiado desde que se abrió (X-Version).
export default function exigeBloqueo(entidad, { param = "id", version = false } = {}) {
  const { modelo } = ENTIDADES_BLOQUEO[entidad];
  return async (req, res, next) => {
    try {
      const documento = req.params[param];
      const b = await BloqueoEdicion.findOne({ entidad, documento });
      const vigente = !!b && b.expiraEn > new Date();
      if (!vigente || b.clave !== req.get("X-Bloqueo")) {
        const mensaje = vigente
          ? mensajeOcupado({ usuarioNombre: b.usuarioNombre, tomadoEn: b.tomadoEn, propio: String(b.usuario) === String(req.usuario.id) })
          : "Pulsa «Editar» antes de guardar: el documento no está tomado para edición";
        return res.status(423).json({ mensaje, bloqueo: true });
      }
      if (version) {
        const doc = await modelo.findById(documento, "updatedAt");
        if (!doc) return res.status(404).json({ mensaje: "Documento no encontrado" });
        if (doc.updatedAt?.toISOString() !== req.get("X-Version")) {
          return res.status(409).json({ mensaje: "Este documento cambió desde que lo abriste — ciérralo y vuelve a abrirlo", cambio: true });
        }
      }
      next();
    } catch (err) { next(err); }
  };
}
```

- [ ] **Step 4: Correr** — Run: `cd Backend && npm test` — Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git -C Backend add src/middleware/exigeBloqueo.js test/exigeBloqueo.test.js
git -C Backend commit -m "feat(bloqueo): middleware exigeBloqueo (423 sin bloqueo, 409 versión desactualizada)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 3: Rutas de Comercial protegidas + test de cobertura

**Files:**
- Modify: `Backend/src/routes/cotizaciones.js`, `ordenesCompra.js`, `ordenesTrabajo.js`, `informes.js`, `notificacionesTrabajo.js`, `ingresosEquipo.js` (todos en `Backend/src/routes/`)
- Test: `Backend/test/bloqueoComercial.test.js`

**Interfaces:**
- Consumes: `exigeBloqueo` (Task 2), `/api/bloqueos` (Task 1).
- Produces: toda ruta PUT/PATCH/DELETE y todo POST sobre `/:id/...` de Comercial exige bloqueo (salvo `POST /ordenes-trabajo/:id/sub-ot`, que crea). PUT `/:id` de cotización, OC, OT e ingreso de equipo exige además versión.

- [ ] **Step 1: Escribir el test que falla**

`Backend/test/bloqueoComercial.test.js`:
```js
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { conectar, desconectar, limpiar, levantar } from "./helpers.js";
import bloqueosRoutes from "../src/routes/bloqueos.js";
import cotizacionesRoutes from "../src/routes/cotizaciones.js";
import ordenesCompraRoutes from "../src/routes/ordenesCompra.js";
import ordenesTrabajoRoutes from "../src/routes/ordenesTrabajo.js";
import informesRoutes from "../src/routes/informes.js";
import notificacionesRoutes from "../src/routes/notificacionesTrabajo.js";
import ingresosRoutes from "../src/routes/ingresosEquipo.js";
import Cotizacion from "../src/models/Cotizacion.js";

let srv;
before(async () => {
  await conectar();
  srv = await levantar({
    "/api/bloqueos": bloqueosRoutes, "/api/cotizaciones": cotizacionesRoutes, "/api/ordenes-compra": ordenesCompraRoutes,
    "/api/ordenes-trabajo": ordenesTrabajoRoutes, "/api/informes": informesRoutes,
    "/api/notificaciones-trabajo": notificacionesRoutes, "/api/ingresos-equipo": ingresosRoutes,
  });
});
after(async () => { await srv.cerrar(); await desconectar(); });
beforeEach(limpiar);

// Todas las rutas que modifican un documento existente de Comercial.
const RUTAS = [
  ["PUT", "/api/cotizaciones/:id"], ["POST", "/api/cotizaciones/:id/archivos"], ["DELETE", "/api/cotizaciones/:id/archivos/x"],
  ["PATCH", "/api/cotizaciones/:id/anular"], ["PATCH", "/api/cotizaciones/:id/desanular"], ["PATCH", "/api/cotizaciones/:id/cerrar-cadena"],
  ["PATCH", "/api/cotizaciones/:id/items/0/generar-ot"], ["PATCH", "/api/cotizaciones/:id/items/0/quitar-ot"],
  ["PUT", "/api/ordenes-compra/:id"], ["POST", "/api/ordenes-compra/:id/documento"], ["PATCH", "/api/ordenes-compra/:id/anular"],
  ["PATCH", "/api/ordenes-compra/:id/desanular"], ["PATCH", "/api/ordenes-compra/:id/cerrar-cadena"], ["PATCH", "/api/ordenes-compra/:id/confirmaciones"],
  ["PATCH", "/api/ordenes-trabajo/:id/vincular-cotizacion"], ["PUT", "/api/ordenes-trabajo/:id"], ["PATCH", "/api/ordenes-trabajo/:id/estado"],
  ["PATCH", "/api/ordenes-trabajo/:id/estado-prueba"], ["PATCH", "/api/ordenes-trabajo/:id/encargados"], ["POST", "/api/ordenes-trabajo/:id/archivos"],
  ["DELETE", "/api/ordenes-trabajo/:id/archivos/x"], ["PATCH", "/api/ordenes-trabajo/:id/anular"], ["PATCH", "/api/ordenes-trabajo/:id/desanular"],
  ["PATCH", "/api/ordenes-trabajo/:id/cerrar-cadena"],
  ["PATCH", "/api/informes/:id/anular"],
  ["PATCH", "/api/notificaciones-trabajo/:id/abrir"], ["PUT", "/api/notificaciones-trabajo/:id"], ["PATCH", "/api/notificaciones-trabajo/:id/items/x/anular"],
  ["PUT", "/api/ingresos-equipo/:id"], ["DELETE", "/api/ingresos-equipo/:id"],
];

test("ninguna ruta de escritura de Comercial acepta cambios sin bloqueo", async () => {
  for (const [metodo, ruta] of RUTAS) {
    const r = await srv.api(metodo, ruta.replace(":id", new mongoose.Types.ObjectId().toString()), { body: { motivo: "x" } });
    assert.equal(r.status, 423, `${metodo} ${ruta} respondió ${r.status}`);
  }
});

test("con el bloqueo tomado la ruta sigue su curso normal", async () => {
  const id = (await Cotizacion.collection.insertOne({ codigo: "COT-B", anulado: false, estadoCadena: "abierto", items: [], updatedAt: new Date() })).insertedId.toString();
  const { clave } = (await srv.api("POST", "/api/bloqueos", { body: { entidad: "cotizacion", documento: id } })).data;
  const r = await srv.api("PATCH", `/api/cotizaciones/${id}/anular`, { body: { motivo: "prueba" }, headers: { "X-Bloqueo": clave } });
  assert.notEqual(r.status, 423, JSON.stringify(r.data));
});
```

- [ ] **Step 2: Correr y verificar que falla** — Run: `cd Backend && node --test test/bloqueoComercial.test.js` — Expected: FAIL (`PUT /api/cotizaciones/:id respondió 404` o similar distinto de 423).

- [ ] **Step 3: Enganchar el middleware** — en cada archivo agregar el import `import exigeBloqueo from "../middleware/exigeBloqueo.js";` después del último `import`, y hacer estos reemplazos exactos (cada texto aparece una sola vez):

`cotizaciones.js`:
| Antes | Después |
|---|---|
| `router.put("/:id", async (req, res, next) => {` | `router.put("/:id", exigeBloqueo("cotizacion", { version: true }), async (req, res, next) => {` |
| `router.post("/:id/archivos", uploadArchivoCotizacion.single("archivo"),` | `router.post("/:id/archivos", exigeBloqueo("cotizacion"), uploadArchivoCotizacion.single("archivo"),` |
| `router.delete("/:id/archivos/:archivoId", async` | `router.delete("/:id/archivos/:archivoId", exigeBloqueo("cotizacion"), async` |
| `router.patch("/:id/anular", puedeAnular, async` | `router.patch("/:id/anular", puedeAnular, exigeBloqueo("cotizacion"), async` |
| `router.patch("/:id/desanular", soloAdmin, async` | `router.patch("/:id/desanular", soloAdmin, exigeBloqueo("cotizacion"), async` |
| `router.patch("/:id/cerrar-cadena", soloAdmin, async` | `router.patch("/:id/cerrar-cadena", soloAdmin, exigeBloqueo("cotizacion"), async` |
| `router.patch("/:id/items/:index/generar-ot", puedeGenerarOTDesdeItem, async` | `router.patch("/:id/items/:index/generar-ot", puedeGenerarOTDesdeItem, exigeBloqueo("cotizacion"), async` |
| `router.patch("/:id/items/:index/quitar-ot", puedeEditar, async` | `router.patch("/:id/items/:index/quitar-ot", puedeEditar, exigeBloqueo("cotizacion"), async` |

`ordenesCompra.js` (entidad `"ordenCompra"`):
| Antes | Después |
|---|---|
| `router.put("/:id", async (req, res, next) => {` | `router.put("/:id", exigeBloqueo("ordenCompra", { version: true }), async (req, res, next) => {` |
| `router.post("/:id/documento", uploadPdf.single("documento"),` | `router.post("/:id/documento", exigeBloqueo("ordenCompra"), uploadPdf.single("documento"),` |
| `router.patch("/:id/anular", puedeAnular, async` | `router.patch("/:id/anular", puedeAnular, exigeBloqueo("ordenCompra"), async` |
| `router.patch("/:id/desanular", soloAdmin, async` | `router.patch("/:id/desanular", soloAdmin, exigeBloqueo("ordenCompra"), async` |
| `router.patch("/:id/cerrar-cadena", soloAdmin, async` | `router.patch("/:id/cerrar-cadena", soloAdmin, exigeBloqueo("ordenCompra"), async` |
| `router.patch("/:id/confirmaciones", puedeConfirmarHesActa, async` | `router.patch("/:id/confirmaciones", puedeConfirmarHesActa, exigeBloqueo("ordenCompra"), async` |

`ordenesTrabajo.js` (entidad `"ordenTrabajo"`; **no** tocar `POST /:id/sub-ot`, que crea):
| Antes | Después |
|---|---|
| `router.patch("/:id/vincular-cotizacion", async` | `router.patch("/:id/vincular-cotizacion", exigeBloqueo("ordenTrabajo"), async` |
| `router.put("/:id", async (req, res, next) => {` | `router.put("/:id", exigeBloqueo("ordenTrabajo", { version: true }), async (req, res, next) => {` |
| `router.patch("/:id/estado", (req, res, next) =>` | `router.patch("/:id/estado", exigeBloqueo("ordenTrabajo"), (req, res, next) =>` |
| `router.patch("/:id/estado-prueba", (req, res, next) =>` | `router.patch("/:id/estado-prueba", exigeBloqueo("ordenTrabajo"), (req, res, next) =>` |
| `router.patch("/:id/encargados", async` | `router.patch("/:id/encargados", exigeBloqueo("ordenTrabajo"), async` |
| `router.delete("/:id/archivos/:archivoId", async` | `router.delete("/:id/archivos/:archivoId", exigeBloqueo("ordenTrabajo"), async` |
| `router.post("/:id/archivos", uploadArchivoOT.single("archivo"),` | `router.post("/:id/archivos", exigeBloqueo("ordenTrabajo"), uploadArchivoOT.single("archivo"),` |
| `router.patch("/:id/anular", puedeAnular, async` | `router.patch("/:id/anular", puedeAnular, exigeBloqueo("ordenTrabajo"), async` |
| `router.patch("/:id/desanular", soloAdmin, async` | `router.patch("/:id/desanular", soloAdmin, exigeBloqueo("ordenTrabajo"), async` |
| `router.patch("/:id/cerrar-cadena", soloAdmin, async` | `router.patch("/:id/cerrar-cadena", soloAdmin, exigeBloqueo("ordenTrabajo"), async` |

`informes.js`: `router.patch("/:id/anular", async` → `router.patch("/:id/anular", exigeBloqueo("informe"), async`.

`notificacionesTrabajo.js` (entidad `"notificacionTrabajo"`):
| Antes | Después |
|---|---|
| `router.patch("/:id/abrir", puedeGestionar, async` | `router.patch("/:id/abrir", puedeGestionar, exigeBloqueo("notificacionTrabajo"), async` |
| `router.put("/:id", puedeCrear, async` | `router.put("/:id", puedeCrear, exigeBloqueo("notificacionTrabajo"), async` |
| `router.patch("/:id/items/:itemId/anular", puedeGestionar, async` | `router.patch("/:id/items/:itemId/anular", puedeGestionar, exigeBloqueo("notificacionTrabajo"), async` |

`ingresosEquipo.js` (entidad `"ingresoEquipo"`):
| Antes | Después |
|---|---|
| `router.put("/:id", async (req, res, next) => {` | `router.put("/:id", exigeBloqueo("ingresoEquipo", { version: true }), async (req, res, next) => {` |
| `router.delete("/:id", async (req, res, next) => {` | `router.delete("/:id", exigeBloqueo("ingresoEquipo"), async (req, res, next) => {` |

- [ ] **Step 4: Correr** — Run: `cd Backend && npm test` — Expected: PASS (el test de cobertura verifica las 30 rutas).

- [ ] **Step 5: Commit**
```bash
git -C Backend add src/routes/cotizaciones.js src/routes/ordenesCompra.js src/routes/ordenesTrabajo.js src/routes/informes.js src/routes/notificacionesTrabajo.js src/routes/ingresosEquipo.js test/bloqueoComercial.test.js
git -C Backend commit -m "feat(bloqueo): rutas de Comercial exigen el bloqueo de edición" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## FRONTEND

### Task 4: Lógica pura, API de bloqueos y cabeceras en `uploadAuth`

**Files:**
- Create: `Frontend/src/utils/bloqueo.js`, `Frontend/src/utils/bloqueo.test.js`, `Frontend/src/utils/bloqueoApi.js`
- Modify: `Frontend/src/utils/fetchAuth.js`

**Interfaces:**
- Produces:
  - `utils/bloqueo.js`: `mensajeOcupado(estado)`, `huboActividad(ultimaMs, ahoraMs)`, `avisoDeRespuesta(status, data) → { tipo: "ocupado" | "cambio", mensaje } | null`, `cabecerasBloqueo(clave, version?)`.
  - `utils/bloqueoApi.js`: `tomarBloqueo(entidad, documento) → { r, data }`, `soltarBloqueo(clave, { alCerrar })`, `conBloqueo(entidad, documento, fn: (cabeceras) => Promise<Response>) → Response`.
  - `uploadAuth(endpoint, formData, headers = {})`.

- [ ] **Step 1: Escribir el test que falla**

`Frontend/src/utils/bloqueo.test.js`:
```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { mensajeOcupado, huboActividad, avisoDeRespuesta, cabecerasBloqueo } from "./bloqueo.js";

test("mensajeOcupado: hora de Lima y otra ventana propia", () => {
  assert.equal(mensajeOcupado({ ocupado: true, usuarioNombre: "Ana", tomadoEn: "2026-09-28T15:32:00Z" }), "En edición por Ana desde las 10:32");
  assert.equal(mensajeOcupado({ ocupado: true, propio: true }), "En edición por ti en otra ventana");
});

test("huboActividad: dentro del último minuto", () => {
  assert.equal(huboActividad(1000, 50000), true);
  assert.equal(huboActividad(1000, 62000), false);
});

test("avisoDeRespuesta distingue ocupado (423) y cambio (409 con cambio)", () => {
  assert.deepEqual(avisoDeRespuesta(423, { mensaje: "En edición por Ana desde las 10:32" }), { tipo: "ocupado", mensaje: "En edición por Ana desde las 10:32" });
  assert.deepEqual(avisoDeRespuesta(409, { cambio: true, mensaje: "cambió" }), { tipo: "cambio", mensaje: "cambió" });
  assert.equal(avisoDeRespuesta(409, { recalculo: {} }), null);
  assert.equal(avisoDeRespuesta(200, {}), null);
});

test("cabecerasBloqueo incluye la versión solo si la hay", () => {
  assert.deepEqual(cabecerasBloqueo("k1"), { "X-Bloqueo": "k1" });
  assert.deepEqual(cabecerasBloqueo("k1", "2026-09-28T15:00:00.000Z"), { "X-Bloqueo": "k1", "X-Version": "2026-09-28T15:00:00.000Z" });
});
```

- [ ] **Step 2: Correr y verificar que falla** — Run: `cd Frontend && npm test` — Expected: FAIL (`Cannot find module './bloqueo.js'`).

- [ ] **Step 3: Implementar**

`Frontend/src/utils/bloqueo.js`:
```js
// Espejo del mensaje del backend (utils/bloqueo.js) para el estado consultado.
const horaLima = (d) => new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(d));

export function mensajeOcupado({ ocupado = true, usuarioNombre, tomadoEn, propio }) {
  if (!ocupado) return "";
  if (propio) return "En edición por ti en otra ventana";
  return `En edición por ${usuarioNombre} desde las ${horaLima(tomadoEn)}`;
}

export const ACTIVIDAD_RECIENTE_MS = 60 * 1000;
export const huboActividad = (ultimaMs, ahoraMs) => ahoraMs - ultimaMs < ACTIVIDAD_RECIENTE_MS;

export function avisoDeRespuesta(status, data) {
  if (status === 423) return { tipo: "ocupado", mensaje: data?.mensaje || "El documento lo está editando otra persona" };
  if (status === 409 && data?.cambio) return { tipo: "cambio", mensaje: data.mensaje };
  return null;
}

export const cabecerasBloqueo = (clave, version) => ({ "X-Bloqueo": clave, ...(version ? { "X-Version": version } : {}) });
```

`Frontend/src/utils/bloqueoApi.js`:
```js
import { fetchAuth } from "./fetchAuth";
import { cabecerasBloqueo } from "./bloqueo";

export async function tomarBloqueo(entidad, documento) {
  const r = await fetchAuth("/bloqueos", { method: "POST", body: JSON.stringify({ entidad, documento }) });
  return { r, data: await r.clone().json().catch(() => ({})) };
}

// alCerrar: la ventana se está cerrando — keepalive deja que la petición salga igual.
export const soltarBloqueo = (clave, { alCerrar = false } = {}) =>
  fetchAuth(`/bloqueos/${clave}`, { method: "DELETE", keepalive: alCerrar }).catch(() => null);

// Acción puntual sobre un documento que no se está editando (anular, subir un
// archivo, vincular): toma el bloqueo, ejecuta fn(cabeceras) y lo suelta. Si otro
// lo tiene devuelve su respuesta 423 ("En edición por …").
export async function conBloqueo(entidad, documento, fn) {
  const { r, data } = await tomarBloqueo(entidad, documento);
  if (!r.ok) return r;
  try {
    return await fn(cabecerasBloqueo(data.clave));
  } finally {
    await soltarBloqueo(data.clave);
  }
}
```

En `Frontend/src/utils/fetchAuth.js` reemplazar
```js
export const uploadAuth = (endpoint, formData) => {
  const token = sessionStorage.getItem("token");
  return fetch(`${API}${endpoint}`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  });
};
```
por
```js
export const uploadAuth = (endpoint, formData, headers = {}) => {
  const token = sessionStorage.getItem("token");
  return fetch(`${API}${endpoint}`, {
    method: "POST",
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
    body: formData,
  });
};
```

- [ ] **Step 4: Correr** — Run: `cd Frontend && npm test && npx eslint src/utils/bloqueo.js src/utils/bloqueoApi.js src/utils/fetchAuth.js` — Expected: PASS y lint limpio.

- [ ] **Step 5: Commit**
```bash
git -C Frontend add src/utils/bloqueo.js src/utils/bloqueo.test.js src/utils/bloqueoApi.js src/utils/fetchAuth.js
git -C Frontend commit -m "feat(bloqueo): lógica pura, API de bloqueos y cabeceras en uploadAuth" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Hook `useBloqueoEdicion` y componente `<BarraEdicion>`

**Files:**
- Create: `Frontend/src/hooks/useBloqueoEdicion.js`, `Frontend/src/components/BarraEdicion.jsx`

**Interfaces:**
- Consumes: Task 4.
- Produces:
  - `useBloqueoEdicion(entidad, documento, versionMostrada) → { estado, mensaje, editando, editar(), cancelar(), terminar(nuevaVersion?), fetch(url, opciones), upload(url, formData) }`. `estado`: `"cargando" | "lectura" | "editando" | "ocupado" | "liberado" | "desactualizado"`. Sin `documento` (formulario nuevo) queda en `"cargando"` y no hace nada.
  - `<BarraEdicion bloqueo puedeEditar onCancelar className />`.

- [ ] **Step 1: Hook** — `Frontend/src/hooks/useBloqueoEdicion.js`:
```js
import { useState, useEffect, useRef, useCallback } from "react";
import { fetchAuth, uploadAuth } from "../utils/fetchAuth";
import { tomarBloqueo, soltarBloqueo, conBloqueo } from "../utils/bloqueoApi";
import { mensajeOcupado, huboActividad, avisoDeRespuesta, cabecerasBloqueo } from "../utils/bloqueo";

const LATIDO_MS = 60 * 1000;
const CONSULTA_OCUPADO_MS = 30 * 1000;
const EVENTOS_ACTIVIDAD = ["keydown", "mousedown", "input"];

// Bloqueo de edición de un documento (spec 2026-09-28-bloqueo-edicion): "Editar"
// lo toma, un latido lo mantiene mientras hay actividad, y se suelta al guardar,
// cancelar o cerrar. fetch/upload agregan las cabeceras; si no se está editando,
// toman un bloqueo temporal solo para esa acción.
export default function useBloqueoEdicion(entidad, documento, versionMostrada) {
  const [estado, setEstado] = useState("cargando");
  const [mensaje, setMensaje] = useState("");
  const clave = useRef(null);
  const version = useRef(versionMostrada);
  const ultimaActividad = useRef(Date.now());

  // La versión mostrada cambia al guardar o al elegir otro documento; mientras se
  // edita manda la releída tras cada escritura propia (refrescarVersion).
  useEffect(() => { if (!clave.current) version.current = versionMostrada; }, [versionMostrada]);

  const consultar = useCallback(() => fetchAuth(`/bloqueos/${entidad}/${documento}`).then(async (r) => {
    if (!r.ok || clave.current) return;
    const d = await r.json();
    if (d.ocupado) { setEstado("ocupado"); setMensaje(mensajeOcupado(d)); return; }
    setEstado((e) => (e === "ocupado" || e === "cargando" ? "lectura" : e));
    setMensaje((m) => (d.ocupado ? m : ""));
  }), [entidad, documento]);

  useEffect(() => { if (documento) consultar(); }, [documento, consultar]);

  // Al cambiar de documento o cerrar el detalle se suelta el bloqueo propio.
  useEffect(() => () => {
    if (clave.current) { soltarBloqueo(clave.current); clave.current = null; }
  }, [documento]);

  // Mientras otro lo edita se revisa cada 30 s, para habilitar "Editar" cuando lo suelte.
  useEffect(() => {
    if (estado !== "ocupado") return undefined;
    const t = setInterval(consultar, CONSULTA_OCUPADO_MS);
    return () => clearInterval(t);
  }, [estado, consultar]);

  useEffect(() => {
    if (estado !== "editando") return undefined;
    const marcar = () => { ultimaActividad.current = Date.now(); };
    EVENTOS_ACTIVIDAD.forEach((e) => window.addEventListener(e, marcar, true));
    const latido = setInterval(async () => {
      const r = await fetchAuth(`/bloqueos/${clave.current}`, {
        method: "PUT", body: JSON.stringify({ activo: huboActividad(ultimaActividad.current, Date.now()) }),
      }).catch(() => null);
      if (r?.status === 410) {
        clave.current = null;
        setEstado("liberado");
        setMensaje("Tu edición se liberó tras 15 min sin actividad.");
      }
    }, LATIDO_MS);
    const alCerrarVentana = () => { if (clave.current) soltarBloqueo(clave.current, { alCerrar: true }); };
    window.addEventListener("beforeunload", alCerrarVentana);
    return () => {
      clearInterval(latido);
      EVENTOS_ACTIVIDAD.forEach((e) => window.removeEventListener(e, marcar, true));
      window.removeEventListener("beforeunload", alCerrarVentana);
    };
  }, [estado]);

  const editar = async () => {
    setMensaje("");
    const { r, data } = await tomarBloqueo(entidad, documento);
    if (r.status === 423) { setEstado("ocupado"); setMensaje(data.mensaje); return; }
    if (!r.ok) { setMensaje(data.mensaje || "No se pudo tomar el documento para editar."); return; }
    if (version.current && data.version && data.version !== version.current) {
      await soltarBloqueo(data.clave);
      setEstado("desactualizado");
      setMensaje("Este documento cambió desde que lo abriste — ciérralo y vuelve a abrirlo para editar la versión actual.");
      return;
    }
    version.current = data.version;
    clave.current = data.clave;
    ultimaActividad.current = Date.now();
    setEstado("editando");
  };

  const soltar = async (nuevaVersion) => {
    if (nuevaVersion) version.current = nuevaVersion;
    const c = clave.current;
    clave.current = null;
    setEstado("lectura");
    setMensaje("");
    if (c) await soltarBloqueo(c);
  };

  // Tras una escritura propia se relee la versión, para que el próximo guardado no choque consigo mismo.
  const refrescarVersion = async () => {
    const r = await fetchAuth(`/bloqueos/${entidad}/${documento}`);
    if (r.ok) version.current = (await r.json()).version;
  };

  const ejecutar = async (llamar) => {
    const res = clave.current
      ? await llamar(cabecerasBloqueo(clave.current, version.current))
      : await conBloqueo(entidad, documento, (h) => llamar(cabecerasBloqueo(h["X-Bloqueo"], version.current)));
    const aviso = avisoDeRespuesta(res.status, await res.clone().json().catch(() => null));
    if (aviso) setMensaje(aviso.mensaje);
    else if (res.ok) await refrescarVersion();
    return res;
  };

  return {
    estado, mensaje, editando: estado === "editando",
    editar,
    cancelar: () => soltar(),
    terminar: soltar,
    fetch: (url, opciones = {}) => ejecutar((h) => fetchAuth(url, { ...opciones, headers: { ...opciones.headers, ...h } })),
    upload: (url, formData) => ejecutar((h) => uploadAuth(url, formData, h)),
  };
}
```

- [ ] **Step 2: Barra** — `Frontend/src/components/BarraEdicion.jsx`:
```jsx
const ESTILO = {
  editando: "bg-blue-50 text-blue-800 border-blue-200",
  ocupado: "bg-amber-50 text-amber-800 border-amber-200",
  liberado: "bg-amber-50 text-amber-800 border-amber-200",
  desactualizado: "bg-amber-50 text-amber-800 border-amber-200",
  lectura: "bg-white/90 text-gray-600 border-gray-200",
};

// Cabecera de edición de un documento: "Editar", el aviso "En edición por …" o
// "Estás editando" con "Cancelar edición" (que descarta: onCancelar cierra el detalle).
export default function BarraEdicion({ bloqueo, puedeEditar = true, onCancelar, className = "" }) {
  const { estado, mensaje } = bloqueo;
  if (estado === "cargando") return null;
  return (
    <div className={`flex flex-wrap items-center gap-2 rounded-lg border px-3 py-1.5 text-xs ${ESTILO[estado] || ESTILO.lectura} ${className}`}>
      {estado === "editando" && <span className="font-semibold">Estás editando</span>}
      {estado === "lectura" && !mensaje && <span>Solo lectura</span>}
      {mensaje && <span>{mensaje}</span>}
      {puedeEditar && (estado === "lectura" || estado === "liberado") && (
        <button type="button" onClick={bloqueo.editar}
          className="ml-1 bg-blue-600 text-white px-3 py-1 rounded-md font-semibold hover:bg-blue-700">Editar</button>
      )}
      {estado === "editando" && (
        <button type="button" onClick={async () => { await bloqueo.cancelar(); onCancelar?.(); }}
          className="ml-1 border border-gray-300 bg-white text-gray-700 px-3 py-1 rounded-md hover:bg-gray-50">Cancelar edición</button>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Verificar** — Run: `cd Frontend && npx eslint src/hooks/useBloqueoEdicion.js src/components/BarraEdicion.jsx && npm run build` — Expected: sin errores; build OK.

- [ ] **Step 4: Commit**
```bash
git -C Frontend add src/hooks/useBloqueoEdicion.js src/components/BarraEdicion.jsx
git -C Frontend commit -m "feat(bloqueo): hook useBloqueoEdicion y BarraEdicion" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
> **Patrón de integración (Tasks 6–9).** En cada pantalla:
> 1. `import useBloqueoEdicion from "../hooks/useBloqueoEdicion";` y `import BarraEdicion from "./BarraEdicion";` (desde `pages/`: `"../components/BarraEdicion"`).
> 2. Crear el hook junto a los demás `useState`: `const bloqueo = useBloqueoEdicion("<entidad>", <doc>._id, <doc>.updatedAt);`.
> 3. `<BarraEdicion bloqueo={bloqueo} puedeEditar={<permiso de la pantalla>} onCancelar={onClose} />` justo antes del botón "Guardar" de la cabecera.
> 4. Ese botón: `disabled={guardando || !bloqueo.editando}`; el `<fieldset disabled={…}>` suma `|| !bloqueo.editando`.
> 5. Cada `fetchAuth(\`/<ruta del documento>…\`, opciones)` que escribe pasa a `bloqueo.fetch(\`…\`, opciones)` (mismos argumentos); cada `uploadAuth(url, fd)` sobre el documento pasa a `bloqueo.upload(url, fd)`. Escrituras sobre **otro** documento usan `conBloqueo("<entidad>", id, (h) => fetchAuth(url, { ...opciones, headers: { ...opciones.headers, ...h } }))`.
> 6. Tras un guardado de formulario exitoso: `await bloqueo.terminar(actualizada.updatedAt);` (suelta y vuelve a lectura).
> Verificación de cada task: `npx eslint <archivos>` sin errores nuevos (comparar con `git show HEAD:<archivo> | npx eslint --stdin --stdin-filename <archivo>`) y `npm run build`.

### Task 6: Cotizaciones (detalle, archivos y alta con adjuntos)

**Files:**
- Modify: `Frontend/src/components/DetalleCotizacion.jsx`, `Frontend/src/components/TarjetaArchivosRelacionados.jsx`, `Frontend/src/components/ModalNuevaCotizacion.jsx`, `Frontend/src/components/ModalNuevaOT.jsx`

**Interfaces:**
- Consumes: Tasks 4–5.
- Produces: `TarjetaArchivosRelacionados` acepta la prop opcional `bloqueo` (objeto del hook).

- [ ] **Step 1: `TarjetaArchivosRelacionados.jsx`** — agregar `bloqueo` a las props desestructuradas de `export default function TarjetaArchivosRelacionados({` y reemplazar
```js
      const res = await uploadAuth(`/${endpoint}/${ordenId}/archivos`, fd);
      if (!res.ok) setError(`No se pudo subir "${file.name}" — formato o tamaño no permitido (máx. 20 MB).`);
      else ultimaOrden = await res.json();
```
por
```js
      const url = `/${endpoint}/${ordenId}/archivos`;
      const res = await (bloqueo ? bloqueo.upload(url, fd) : uploadAuth(url, fd));
      if (res.status === 423) { setError((await res.json().catch(() => ({}))).mensaje); break; }
      if (!res.ok) setError(`No se pudo subir "${file.name}" — formato o tamaño no permitido (máx. 20 MB).`);
      else ultimaOrden = await res.json();
```
y
```js
    const res = await fetchAuth(`/${endpoint}/${ordenId}/archivos/${archivo._id}`, { method: "DELETE" });
    if (res.ok) onCambio?.(await res.json());
```
por
```js
    const url = `/${endpoint}/${ordenId}/archivos/${archivo._id}`;
    const res = await (bloqueo ? bloqueo.fetch(url, { method: "DELETE" }) : fetchAuth(url, { method: "DELETE" }));
    if (res.ok) onCambio?.(await res.json());
    else if (res.status === 423) setError((await res.json().catch(() => ({}))).mensaje);
```

- [ ] **Step 2: `DetalleCotizacion.jsx`** — aplicar el patrón con entidad `"cotizacion"`, documento `cot` (`useBloqueoEdicion("cotizacion", cot._id, cot.updatedAt)`, declarado después de `const [cot, setCot]`) y permiso `puedeEditar`:
1. Imports (hook, `BarraEdicion`, y `import { conBloqueo } from "../utils/bloqueoApi";`).
2. `<fieldset disabled={cot.anulado || cadenaCerrada || !puedeEditar} className="contents">` → `<fieldset disabled={cot.anulado || cadenaCerrada || !puedeEditar || !bloqueo.editando} className="contents">`.
3. Antes de `{!cot.anulado && !cadenaCerrada && puedeEditar && (` (el bloque del botón "Guardar cambios") insertar
```jsx
            {!cot.anulado && !cadenaCerrada && <BarraEdicion bloqueo={bloqueo} puedeEditar={puedeEditar} onCancelar={onClose} />}
```
   y en ese botón `<button onClick={guardar} disabled={guardando}` → `<button onClick={guardar} disabled={guardando || !bloqueo.editando}`.
4. Cambiar a `bloqueo.fetch(` las llamadas `fetchAuth(\`/cotizaciones/${cot._id}\``, `fetchAuth(\`/cotizaciones/${ultimaCot._id}/items/${idx}/generar-ot\``, `fetchAuth(\`/cotizaciones/${cot._id}/items/${idx}/quitar-ot\``, `fetchAuth(\`/cotizaciones/${cot._id}/anular\``, `fetchAuth(\`/cotizaciones/${cot._id}/desanular\``, `fetchAuth(\`/cotizaciones/${cot._id}/cerrar-cadena\``.
5. La vinculación de una OT (otro documento), en `vincularOT` — reemplazar
```js
    const res = await fetchAuth(`/ordenes-trabajo/${orden._id}/vincular-cotizacion`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cotizacion: cot._id }),
    });
    setReasignandoOT(false);
```
   por
```js
    const res = await conBloqueo("ordenTrabajo", orden._id, (h) => fetchAuth(`/ordenes-trabajo/${orden._id}/vincular-cotizacion`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...h },
      body: JSON.stringify({ cotizacion: cot._id }),
    }));
    setReasignandoOT(false);
    if (res.status === 423) setError((await res.json().catch(() => ({}))).mensaje);
```
6. `guardar` (el del botón) — reemplazar
```js
  const guardar = async () => {
    setGuardando(true);
    await persistir();
    setGuardando(false);
  };
```
   por
```js
  const guardar = async () => {
    setGuardando(true);
    const actualizada = await persistir();
    if (actualizada) await bloqueo.terminar(actualizada.updatedAt);
    setGuardando(false);
  };
```
7. `<TarjetaArchivosRelacionados` de la cotización: agregar la prop `bloqueo={bloqueo}` después de `endpoint="cotizaciones"`.

- [ ] **Step 3: Altas con adjuntos** — los archivos pendientes se suben con un bloqueo del documento recién creado.
En `ModalNuevaCotizacion.jsx` (import `import { conBloqueo } from "../utils/bloqueoApi";`) reemplazar
```js
      for (const pendiente of archivosPendientes) {
        const fd = new FormData();
        fd.append("archivo", pendiente.file);
        await uploadAuth(`/cotizaciones/${nueva._id}/archivos`, fd);
      }
```
por
```js
      if (archivosPendientes.length) {
        await conBloqueo("cotizacion", nueva._id, async (h) => {
          for (const pendiente of archivosPendientes) {
            const fd = new FormData();
            fd.append("archivo", pendiente.file);
            await uploadAuth(`/cotizaciones/${nueva._id}/archivos`, fd, h);
          }
          return new Response(null, { status: 204 });
        });
      }
```
En `ModalNuevaOT.jsx` lo mismo con `"ordenTrabajo"` y `` `/ordenes-trabajo/${nueva._id}/archivos` ``.

- [ ] **Step 4: Verificar** — Run: `cd Frontend && npx eslint src/components/DetalleCotizacion.jsx src/components/TarjetaArchivosRelacionados.jsx src/components/ModalNuevaCotizacion.jsx src/components/ModalNuevaOT.jsx && npm run build` — Expected: sin errores nuevos; build OK.

- [ ] **Step 5: Commit**
```bash
git -C Frontend add src/components/DetalleCotizacion.jsx src/components/TarjetaArchivosRelacionados.jsx src/components/ModalNuevaCotizacion.jsx src/components/ModalNuevaOT.jsx
git -C Frontend commit -m "feat(bloqueo): cotizaciones con botón Editar y bloqueo en archivos y altas" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Órdenes de compra del cliente

**Files:**
- Modify: `Frontend/src/components/DetalleOrdenCompra.jsx`, `Frontend/src/pages/ListaOrdenesCompra.jsx`

- [ ] **Step 1: `DetalleOrdenCompra.jsx`** — patrón con `"ordenCompra"`, documento `orden` (`useBloqueoEdicion("ordenCompra", orden._id, orden.updatedAt)`) y permiso `puedeEditar`:
1. Imports.
2. `<fieldset disabled={orden.anulado || cadenaCerrada || !puedeEditar}` → `<fieldset disabled={orden.anulado || cadenaCerrada || !puedeEditar || !bloqueo.editando}`.
3. Antes de `<button onClick={guardar} disabled={guardando}` insertar `<BarraEdicion bloqueo={bloqueo} puedeEditar={puedeEditar} onCancelar={onClose} />` y en el botón `disabled={guardando || !bloqueo.editando}`.
4. A `bloqueo.fetch(` las llamadas a `` `/ordenes-compra/${orden._id}/confirmaciones` ``, `` `/ordenes-compra/${orden._id}` `` (PUT), `` `/ordenes-compra/${orden._id}/anular` ``, `` `/ordenes-compra/${orden._id}/desanular` `` y `` `/ordenes-compra/${orden._id}/cerrar-cadena` ``.
5. En `guardar` reemplazar `if (res.ok) { onGuardada(await res.json()); }` por
```js
    if (res.ok) { const actualizada = await res.json(); await bloqueo.terminar(actualizada.updatedAt); onGuardada(actualizada); }
```

- [ ] **Step 2: `ListaOrdenesCompra.jsx`** — la subida del PDF de la OC desde la lista (import `import { conBloqueo } from "../utils/bloqueoApi";`): reemplazar
```js
    const res = await uploadAuth(`/ordenes-compra/${id}/documento`, fd);
    if (res.ok) {
```
por
```js
    const res = await conBloqueo("ordenCompra", id, (h) => uploadAuth(`/ordenes-compra/${id}/documento`, fd, h));
    if (res.status === 423) { setAviso((await res.json().catch(() => ({}))).mensaje); return; }
    if (res.ok) {
```
La página no tiene hoy un aviso de errores: agregar `import AvisoAccion from "../components/AvisoAccion";` (junto a `import TablaScroll …`), el estado `const [aviso, setAviso] = useState("");` después de `const [mes, setMes]           = useState("");`, y antes del último `    </div>
  );
}` del archivo:
```jsx
      {aviso && <AvisoAccion mensaje={aviso} onCerrar={() => setAviso("")} />}
```

- [ ] **Step 3: Verificar** — Run: `cd Frontend && npx eslint src/components/DetalleOrdenCompra.jsx src/pages/ListaOrdenesCompra.jsx && npm run build` — Expected: sin errores nuevos; build OK.

- [ ] **Step 4: Commit**
```bash
git -C Frontend add src/components/DetalleOrdenCompra.jsx src/pages/ListaOrdenesCompra.jsx
git -C Frontend commit -m "feat(bloqueo): órdenes de compra del cliente con botón Editar" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Órdenes de trabajo, sub-OT y notificaciones de trabajo

**Files:**
- Modify: `Frontend/src/components/DetalleOrdenTrabajo.jsx`, `Frontend/src/components/DetalleSubOT.jsx`, `Frontend/src/components/ModalDetalleNotificacionTrabajo.jsx`

- [ ] **Step 1: `DetalleOrdenTrabajo.jsx`** — patrón con `"ordenTrabajo"`, documento `ot` (declarar el hook después de `const [ot, setOt]`) y permiso `puedeEditarCampos`:
1. Imports.
2. `<fieldset disabled={ot.anulado || cadenaCerrada || !puedeEditarCampos}` → `<fieldset disabled={ot.anulado || cadenaCerrada || !puedeEditarCampos || !bloqueo.editando}`.
3. Antes de `<button onClick={guardar} disabled={guardando}` insertar `<BarraEdicion bloqueo={bloqueo} puedeEditar={puedeEditarCampos} onCancelar={onClose} />` y en el botón `disabled={guardando || !bloqueo.editando}`.
4. A `bloqueo.fetch(` las llamadas a `` `/ordenes-trabajo/${ot._id}` `` (PUT), `/estado`, `/encargados`, `/anular`, `/desanular`, `/cerrar-cadena` y `/vincular-cotizacion` (todas con `${ot._id}`). Estado y encargados los usan técnicos que no editan campos: como van por `bloqueo.fetch`, toman un bloqueo temporal si nadie edita, y si alguien edita reciben "En edición por …".
5. En `guardar` reemplazar
```js
      setOt(actualizada);
      onGuardada?.(actualizada);
```
   (el de `guardar`, primera aparición dentro de esa función) por
```js
      setOt(actualizada);
      await bloqueo.terminar(actualizada.updatedAt);
      onGuardada?.(actualizada);
```
6. `<TarjetaArchivosRelacionados` de la OT: agregar `bloqueo={bloqueo}`.

- [ ] **Step 2: `DetalleSubOT.jsx`** — los mismos cambios 1–5 (sin tarjeta de archivos), con `ot` y `puedeEditarCampos`.

- [ ] **Step 3: `ModalDetalleNotificacionTrabajo.jsx`** — entidad `"notificacionTrabajo"`, documento `notificacion` (hook después de `const [notificacion, setNotificacion]`):
1. Imports (`import BarraEdicion from "./BarraEdicion";`).
2. Reemplazar `{notificacion.estado === "abierta" && puedeEditar && (` (el bloque "Agregar líneas") por
```jsx
          {notificacion.estado === "abierta" && puedeEditar && <BarraEdicion bloqueo={bloqueo} className="mt-4" />}
          {notificacion.estado === "abierta" && puedeEditar && bloqueo.editando && (
```
3. A `bloqueo.fetch(` las llamadas a `/abrir`, `/items/${confirmandoAnular._id}/anular` y el PUT `` `/notificaciones-trabajo/${notificacion._id}` ``.
4. En `guardar` reemplazar
```js
      setNotificacion(actualizada);
      onActualizada(actualizada);
      setNuevasLineas([]);
```
   por
```js
      setNotificacion(actualizada);
      onActualizada(actualizada);
      setNuevasLineas([]);
      await bloqueo.terminar(actualizada.updatedAt);
```

- [ ] **Step 4: Verificar** — Run: `cd Frontend && npx eslint src/components/DetalleOrdenTrabajo.jsx src/components/DetalleSubOT.jsx src/components/ModalDetalleNotificacionTrabajo.jsx && npm run build` — Expected: sin errores nuevos; build OK.

- [ ] **Step 5: Commit**
```bash
git -C Frontend add src/components/DetalleOrdenTrabajo.jsx src/components/DetalleSubOT.jsx src/components/ModalDetalleNotificacionTrabajo.jsx
git -C Frontend commit -m "feat(bloqueo): OT, sub-OT y notificaciones de trabajo con botón Editar" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Ingresos de equipo

**Files:**
- Modify: `Frontend/src/pages/IngresoEquipos.jsx`

- [ ] **Step 1: Integrar** (entidad `"ingresoEquipo"`; el formulario sirve para crear y editar: solo al editar hay bloqueo):
1. Imports: `import useBloqueoEdicion from "../hooks/useBloqueoEdicion";`, `import BarraEdicion from "../components/BarraEdicion";`.
2. Después de `const [seleccionado, setSeleccionado] = useState(null);`:
```js
  const bloqueo = useBloqueoEdicion("ingresoEquipo", seleccionado?._id, seleccionado?.updatedAt);
  const soloLectura = !!seleccionado && !bloqueo.editando;
```
3. Envolver el contenido del cuerpo del modal: justo después de `<div className="p-6 space-y-4 overflow-y-auto">` abrir `<fieldset disabled={soloLectura} className="contents">`, y cerrarlo con `</fieldset>` justo antes de `{error && <p className="text-xs text-red-500">{error}</p>}` de ese cuerpo.
4. Antes de `<button onClick={guardar} disabled={guardando}` (pie del modal) insertar `{seleccionado && <BarraEdicion bloqueo={bloqueo} onCancelar={cerrar} className="mr-auto" />}` y en el botón `disabled={guardando || soloLectura}`.
5. En `guardar` reemplazar
```js
    const res = await fetchAuth(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, garantia: form.garantia === "true" }),
    });
    if (res.ok) {
      const data = await res.json();
```
   por
```js
    const opciones = {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, garantia: form.garantia === "true" }),
    };
    const res = await (seleccionado ? bloqueo.fetch(url, opciones) : fetchAuth(url, opciones));
    if (res.ok) {
      const data = await res.json();
      if (seleccionado) await bloqueo.terminar(data.updatedAt);
```

- [ ] **Step 2: Verificar** — Run: `cd Frontend && npx eslint src/pages/IngresoEquipos.jsx && npm test && npm run build` — Expected: sin errores nuevos; tests y build OK.

- [ ] **Step 3: Commit**
```bash
git -C Frontend add src/pages/IngresoEquipos.jsx
git -C Frontend commit -m "feat(bloqueo): ingresos de equipo con botón Editar" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Verificación con dos sesiones y documentación

**Files:**
- Modify: `docs/superpowers/specs/2026-09-28-bloqueo-edicion-design.md` (sección "Estado")

- [ ] **Step 1: Suites completas** — Run: `cd Backend && npm test` y `cd Frontend && npm test && npm run build` — Expected: todo PASS.

- [ ] **Step 2: Recorrido Playwright con dos sesiones** (backend y frontend de prueba contra la base E2E del replica set; usuarios `e2e_jefa` y `e2e_fact` o equivalentes con permiso de edición en Comercial). Abrir dos páginas del navegador (una por usuario):
1. **Ana** abre una cotización: ve "Solo lectura" y "Editar"; el formulario está deshabilitado. Pulsa "Editar" → "Estás editando", formulario habilitado.
2. **Luis** abre la misma cotización: ve "En edición por Ana desde las HH:MM" y no tiene "Editar"; intentar anularla responde el mismo aviso.
3. **Ana** guarda un cambio → vuelve a "Solo lectura". En ≤ 30 s **Luis** ve "Editar" disponible; lo pulsa y edita.
4. **Luis** cierra la página sin guardar → en ≤ 2 min **Ana** puede tomarla (el DELETE con `keepalive` suele liberarla al instante).
5. **Ana** edita, **Luis** (con permiso) modifica y guarda la misma cotización después de que el bloqueo de Ana vence (forzar el vencimiento en la base: `expiraEn` en el pasado); al volver, Ana pulsa "Editar" → "Este documento cambió desde que lo abriste".
6. Repetir 1–2 con una OT (incluido "Cambiar estado" por un técnico mientras otro edita → aviso), una OC del cliente, una notificación de trabajo y un ingreso de equipo.
7. Consola del navegador sin errores nuevos (los 423/409 esperados aparecen como respuestas de red).
Expected: cada paso se comporta como se indica. Todo desvío es un bug: test que lo reproduzca, fix, suite verde.

- [ ] **Step 3: Documentar** — agregar al spec `## Estado (fecha)`: Fases 0 y 1 entregadas, decisiones tomadas en la ejecución, pendientes (Fases 2–4 con sus planes). Actualizar la memoria del proyecto. Run: `graphify update .` en la raíz.
