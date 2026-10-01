# Bloqueo de edición — Fase 4 (Almacén y catálogos) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aplicar el bloqueo de edición a Almacén y catálogos: el "Editar" de cada fila (formulario de Almacén o modal) toma el registro y quien llegue después lo ve con "En edición por …"; las acciones de fila (activar, eliminar, cambiar tarifa, atender/pagar requerimientos, anular servicios) toman un bloqueo temporal.

**Architecture:** Igual que Fases 1–3: entidades nuevas en `ENTIDADES_BLOQUEO`, `exigeBloqueo` en las rutas de escritura sobre registros existentes y `conBloqueo` en las acciones de fila. Nuevo: `useBloqueoEdicion(entidad, id, version, { autoEditar: true })` toma el registro apenas se abre su formulario (el "Editar" de la fila ya expresó la intención), para no pedir un segundo clic.

**Tech Stack:** igual que Fases 0–3.

**Spec:** `docs/superpowers/specs/2026-09-28-bloqueo-edicion-design.md`

## Global Constraints

- Misma rama `feature/bloqueo-edicion` (Fases 0–3 sin mergear). Commits con `-m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`. Tests backend con `MONGO_URI_TEST=mongodb://localhost:27018/sipapp-intales-test?replicaSet=rs0`.
- Los pendientes menores de todas las fases se resuelven **al final**; no se tocan aquí.
- No commitear `Frontend/package.json` ni `package-lock.json` (cambio ajeno: dependencia `motion`).
- Entidades nuevas y roles (= unión de los roles de sus rutas de escritura):

| Entidad | Modelo | Roles |
|---|---|---|
| `requerimiento` | Requerimiento | admin, almacenero, jefatura, coordinadora |
| `servicioExterno` | ServicioExterno | `null` (la ruta ya excluye técnicos con `puedeVer`) |
| `material`, `categoriaMaterial`, `categoriaComponente`, `tipoComponente`, `ubicacion` | los suyos | admin, almacenero, coordinadora, jefatura |
| `catalogoServicio` | CatalogoServicio | admin, jefatura, asistente, coordinadora |
| `centroCosto`, `maquina` | los suyos | admin, jefatura |
| `empresa` | Empresa | `null` (PUT sin filtro de rol; DELETE solo admin en su ruta) |
| `personal` | Personal | admin |
| `usuario` | Usuario | admin, jefatura (jefatura solo cambia la tarifa/hora) |

- Rutas protegidas. **Con versión** (guardados de formulario): `PUT` de material, ubicación, categoría de material, categoría de componente, tipo de componente, catálogo de servicios, empresa, personal y usuario. **Sin versión** (acciones puntuales): requerimientos `PATCH /:id/anular`, `/:id/items/:itemId/{salida,devolucion,rechazar,vincular-material,pagar}`; servicios externos `PATCH /:id/{anular,pagar}`; `PUT` de centro de costo y máquina (solo cambios de un campo desde la tabla); `DELETE` de categoría de material, categoría de componente, tipo de componente, catálogo de servicios, personal, empresa, usuario; `PATCH /usuarios/:id/tarifa-hora`.
- `exigeBloqueo` va **después** del guardia de rol de cada ruta (un rol sin permiso sigue recibiendo 403).
- Fuera de alcance, decidido al explorar: **tipo de cambio** y **movimientos de almacén** (no tienen escrituras sobre `/:id`); crear registros.
- El `PUT /materiales/:id` lo usan el formulario y el interruptor "Activo" de la tabla: el interruptor manda como `X-Version` la versión que devuelve el bloqueo temporal recién tomado (siempre la actual).
- Toda acción de fila muestra el mensaje del 423 ("En edición por …") en la pantalla; nunca `alert`.

## Review Focus

1. Un rol sin permiso sobre el catálogo (almacenero en centros de costo) no puede tomar el registro: `POST /bloqueos` → 403 — test en Task 1.
2. Eliminar una categoría que otro está editando → 423 con su nombre, y la categoría sigue existiendo — test en Task 1.
3. Guardar un formulario de catálogo con la versión vieja (otro guardó antes) → 409 "cambió" — test en Task 1 (material).
4. Pagar varios ítems del mismo requerimiento seguidos no choca consigo mismo (cada pago toma y suelta su bloqueo en serie) y, si alguno falla por 423, la pantalla lo dice — Task 5 y Playwright en Task 6.
5. Abrir el modal de una empresa que otro está editando la muestra en solo lectura con "En edición por …" y sin botón Guardar habilitado — Playwright en Task 6.

---

### Task 1: Backend — entidades y rutas de Almacén y catálogos

**Files:**
- Modify: `Backend/src/utils/entidadesBloqueo.js`
- Modify: `Backend/src/routes/{requerimientos,serviciosExternos,materiales,categoriasMaterial,categoriasComponente,tiposComponente,catalogoServicios,personal,ubicaciones,centrosCosto,maquinas,empresas,usuarios}.js`
- Create: `Backend/test/bloqueoAlmacen.test.js`
- Modify: `Backend/test/{centrosCosto,empresas,origenCompras,tesoreriaVistas}.test.js`

**Interfaces:**
- Consumes: `exigeBloqueo(entidad, { param, version })`, helpers `escribir`, `bloqueoDe`, `levantar`.
- Produces: entidades `requerimiento`, `servicioExterno`, `material`, `categoriaMaterial`, `categoriaComponente`, `tipoComponente`, `ubicacion`, `catalogoServicio`, `centroCosto`, `maquina`, `empresa`, `personal`, `usuario` (nombres exactos que usa el frontend).

- [ ] **Step 1: Test que falla — `Backend/test/bloqueoAlmacen.test.js`**

```js
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { conectar, desconectar, limpiar, levantar, escribir, bloqueoDe } from "./helpers.js";
import bloqueosRoutes from "../src/routes/bloqueos.js";
import requerimientosRoutes from "../src/routes/requerimientos.js";
import serviciosExternosRoutes from "../src/routes/serviciosExternos.js";
import materialesRoutes from "../src/routes/materiales.js";
import categoriasMaterialRoutes from "../src/routes/categoriasMaterial.js";
import categoriasComponenteRoutes from "../src/routes/categoriasComponente.js";
import tiposComponenteRoutes from "../src/routes/tiposComponente.js";
import catalogoServiciosRoutes from "../src/routes/catalogoServicios.js";
import personalRoutes from "../src/routes/personal.js";
import ubicacionesRoutes from "../src/routes/ubicaciones.js";
import centrosCostoRoutes from "../src/routes/centrosCosto.js";
import maquinasRoutes from "../src/routes/maquinas.js";
import empresasRoutes from "../src/routes/empresas.js";
import usuariosRoutes from "../src/routes/usuarios.js";
import Material from "../src/models/Material.js";
import CategoriaMaterial from "../src/models/CategoriaMaterial.js";

let srv;
before(async () => {
  await conectar();
  srv = await levantar({
    "/api/bloqueos": bloqueosRoutes, "/api/requerimientos": requerimientosRoutes,
    "/api/servicios-externos": serviciosExternosRoutes, "/api/materiales": materialesRoutes,
    "/api/categorias-material": categoriasMaterialRoutes, "/api/categorias-componente": categoriasComponenteRoutes,
    "/api/tipos-componente": tiposComponenteRoutes, "/api/catalogo-servicios": catalogoServiciosRoutes,
    "/api/personal": personalRoutes, "/api/ubicaciones": ubicacionesRoutes, "/api/centros-costo": centrosCostoRoutes,
    "/api/maquinas": maquinasRoutes, "/api/empresas": empresasRoutes, "/api/usuarios": usuariosRoutes,
  });
});
after(async () => { await srv.cerrar(); await desconectar(); });
beforeEach(limpiar);

const RUTAS = [
  ["PATCH", "/api/requerimientos/:id/anular"], ["PATCH", "/api/requerimientos/:id/items/x/salida"],
  ["PATCH", "/api/requerimientos/:id/items/x/devolucion"], ["PATCH", "/api/requerimientos/:id/items/x/rechazar"],
  ["PATCH", "/api/requerimientos/:id/items/x/vincular-material"], ["PATCH", "/api/requerimientos/:id/items/x/pagar"],
  ["PATCH", "/api/servicios-externos/:id/anular"], ["PATCH", "/api/servicios-externos/:id/pagar"],
  ["PUT", "/api/materiales/:id"],
  ["PUT", "/api/categorias-material/:id"], ["DELETE", "/api/categorias-material/:id"],
  ["PUT", "/api/categorias-componente/:id"], ["DELETE", "/api/categorias-componente/:id"],
  ["PUT", "/api/tipos-componente/:id"], ["DELETE", "/api/tipos-componente/:id"],
  ["PUT", "/api/catalogo-servicios/:id"], ["DELETE", "/api/catalogo-servicios/:id"],
  ["PUT", "/api/personal/:id"], ["DELETE", "/api/personal/:id"],
  ["PUT", "/api/ubicaciones/:id"], ["PUT", "/api/centros-costo/:id"], ["PUT", "/api/maquinas/:id"],
  ["PUT", "/api/empresas/:id"], ["DELETE", "/api/empresas/:id"],
  ["PATCH", "/api/usuarios/:id/tarifa-hora"], ["PUT", "/api/usuarios/:id"], ["DELETE", "/api/usuarios/:id"],
];

test("ninguna ruta de escritura de Almacén y catálogos acepta cambios sin bloqueo", async () => {
  for (const [metodo, ruta] of RUTAS) {
    const r = await srv.api(metodo, ruta.replace(":id", new mongoose.Types.ObjectId().toString()), { body: { motivo: "x" } });
    assert.equal(r.status, 423, `${metodo} ${ruta} respondió ${r.status}`);
  }
});

test("un rol sin permiso sobre el catálogo no puede tomar el registro", async () => {
  const cc = await srv.api("POST", "/api/centros-costo", { body: { nombre: "Taller" } });
  const r = await srv.api("POST", "/api/bloqueos", { body: { entidad: "centroCosto", documento: cc.data._id }, rol: "almacenero" });
  assert.equal(r.status, 403);
});

test("eliminar una categoría que otro está editando responde 423 con su nombre y no la borra", async () => {
  const cat = await CategoriaMaterial.create({ nombre: "Eléctricos" });
  await bloqueoDe(srv, "categoriaMaterial", cat._id, { usuario: { id: new mongoose.Types.ObjectId().toString(), nombre: "Ana" } });
  const r = await escribir(srv, "categoriaMaterial", cat._id, "DELETE", `/api/categorias-material/${cat._id}`).catch((e) => e);
  assert.match(String(r.message), /En edición por Ana/);
  const sinBloqueo = await srv.api("DELETE", `/api/categorias-material/${cat._id}`);
  assert.equal(sinBloqueo.status, 423);
  assert.match(sinBloqueo.data.mensaje, /Ana/);
  assert.ok(await CategoriaMaterial.findById(cat._id));
});

test("guardar el formulario de un material con la versión vieja responde 409", async () => {
  const m = await Material.create({ codigo: "M-1", nombre: "Filtro", descripcion: "Filtro", tipoMaterial: "Repuesto" });
  const h = await bloqueoDe(srv, "material", m._id);
  await Material.updateOne({ _id: m._id }, { $set: { nombre: "Filtro 2" } });
  const r = await srv.api("PUT", `/api/materiales/${m._id}`, { body: { nombre: "Mío" }, headers: h });
  assert.equal(r.status, 409);
  assert.equal(r.data.cambio, true);
});

test("con el bloqueo, los guardados de catálogo siguen su curso", async () => {
  const m = await Material.create({ codigo: "M-2", nombre: "Filtro", descripcion: "Filtro", tipoMaterial: "Repuesto" });
  const r = await escribir(srv, "material", m._id, "PUT", `/api/materiales/${m._id}`, { body: { activo: false } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.activo, false);
  const cat = await CategoriaMaterial.create({ nombre: "Borrar" });
  const d = await escribir(srv, "categoriaMaterial", cat._id, "DELETE", `/api/categorias-material/${cat._id}`);
  assert.equal(d.status, 200, JSON.stringify(d.data));
});
```

Ajustar los campos obligatorios de `Material.create` a los reales del modelo si el `create` falla por validación (no es parte de lo que se prueba).

- [ ] **Step 2: Correr y verificar que falla**

Run: `cd Backend && MONGO_URI_TEST=... node --test --test-concurrency=1 test/bloqueoAlmacen.test.js`
Expected: FAIL — rutas responden 200/404/400 en vez de 423; `POST /bloqueos` con `centroCosto` → 400 (entidad desconocida).

- [ ] **Step 3: Entidades — `Backend/src/utils/entidadesBloqueo.js`**

Agregar imports de los 13 modelos y, al final del objeto:

```js
  requerimiento: { modelo: Requerimiento, roles: ["admin", "almacenero", "jefatura", "coordinadora"] },
  // null: la ruta ya excluye a los técnicos (puedeVer) y anular no filtra más.
  servicioExterno: { modelo: ServicioExterno, roles: null },
  material: { modelo: Material, roles: ROLES_ALMACEN },
  categoriaMaterial: { modelo: CategoriaMaterial, roles: ROLES_ALMACEN },
  categoriaComponente: { modelo: CategoriaComponente, roles: ROLES_ALMACEN },
  tipoComponente: { modelo: TipoComponente, roles: ROLES_ALMACEN },
  ubicacion: { modelo: Ubicacion, roles: ROLES_ALMACEN },
  catalogoServicio: { modelo: CatalogoServicio, roles: ["admin", "jefatura", "asistente", "coordinadora"] },
  centroCosto: { modelo: CentroCosto, roles: ["admin", "jefatura"] },
  maquina: { modelo: Maquina, roles: ["admin", "jefatura"] },
  // null: cualquiera edita una empresa; eliminarla lo filtra su ruta (solo admin).
  empresa: { modelo: Empresa, roles: null },
  personal: { modelo: Personal, roles: ["admin"] },
  // jefatura solo llega a la tarifa/hora; el resto de la cuenta lo filtra su ruta.
  usuario: { modelo: Usuario, roles: ["admin", "jefatura"] },
```

con `const ROLES_ALMACEN = ["admin", "almacenero", "coordinadora", "jefatura"];` antes del objeto.

- [ ] **Step 4: Rutas** — importar `exigeBloqueo` y agregarlo después del guardia de rol:

```js
// requerimientos.js
router.patch("/:id/anular", puedeAtender, exigeBloqueo("requerimiento"), async (req, res, next) => {
router.patch("/:id/items/:itemId/salida", puedeAtender, exigeBloqueo("requerimiento"), …
router.patch("/:id/items/:itemId/devolucion", puedeAtender, exigeBloqueo("requerimiento"), …
router.patch("/:id/items/:itemId/rechazar", puedeAtender, exigeBloqueo("requerimiento"), …
router.patch("/:id/items/:itemId/vincular-material", puedeAtender, exigeBloqueo("requerimiento"), …
router.patch("/:id/items/:itemId/pagar", puedePagar, exigeBloqueo("requerimiento"), …
// serviciosExternos.js
router.patch("/:id/anular", exigeBloqueo("servicioExterno"), …
router.patch("/:id/pagar", puedePagar, exigeBloqueo("servicioExterno"), …
// materiales.js, ubicaciones.js, categoriasMaterial.js, categoriasComponente.js, tiposComponente.js,
// catalogoServicios.js, personal.js, empresas.js, usuarios.js — PUT /:id con versión:
router.put("/:id", puedeEditar, exigeBloqueo("material", { version: true }), …
// DELETE /:id (sin versión):
router.delete("/:id", puedeEditar, exigeBloqueo("categoriaMaterial"), …
// centrosCosto.js y maquinas.js — PUT sin versión:
router.put("/:id", puedeEditar, exigeBloqueo("centroCosto"), …
// empresas.js
router.put("/:id", exigeBloqueo("empresa", { version: true }), …
router.delete("/:id", soloAdmin, exigeBloqueo("empresa"), …
// usuarios.js
router.patch("/:id/tarifa-hora", puedeEditarTarifa, exigeBloqueo("usuario"), …
router.put("/:id", soloAdmin, exigeBloqueo("usuario", { version: true }), …
router.delete("/:id", soloAdmin, exigeBloqueo("usuario"), …
```

- [ ] **Step 5: Correr el test nuevo** — Expected: PASS 5/5.

- [ ] **Step 6: Adaptar tests existentes** con `escribir(srv, entidad, id, metodo, ruta, opciones)`:
  - `centrosCosto.test.js` (2 PUT → `centroCosto`), `empresas.test.js` (PUT → `empresa`), `origenCompras.test.js` (anular/rechazar requerimiento → `requerimiento`; anular servicio → `servicioExterno`; las rutas `/procesar` inexistentes siguen dando 404 sin bloqueo), `tesoreriaVistas.test.js` (pagar → `requerimiento`, rol jefatura en `opciones`). Montar `bloqueosRoutes` en `/api/bloqueos` en cada archivo que no lo tenga.

- [ ] **Step 7: Suite completa** — Run: `npm test` (con `MONGO_URI_TEST`). Expected: todo verde (118 + 5).

- [ ] **Step 8: Commit** `feat(bloqueo): Almacén y catálogos exigen el bloqueo de edición`.

### Task 2: Frontend — `autoEditar` en `useBloqueoEdicion`

**Files:** Modify `Frontend/src/hooks/useBloqueoEdicion.js`

**Interfaces:** Produces `useBloqueoEdicion(entidad, documento, versionMostrada, { autoEditar = false } = {})`: con `autoEditar`, la primera vez que un documento queda en `lectura` llama a `editar()` una sola vez (ref por documento). Si está ocupado queda en `ocupado` con el aviso; cuando se libera vuelve a `lectura` y muestra "Editar" (no se retoma solo).

- [ ] **Step 1:** Agregar el parámetro y el efecto:

```js
export default function useBloqueoEdicion(entidad, documento, versionMostrada, { autoEditar = false } = {}) {
  …
  const autoIntentado = useRef(null);
  …
  // Formularios que se abren desde el "Editar" de una fila (catálogos): la
  // intención ya está expresada, se toma sin un segundo clic. Solo una vez por
  // documento: si estaba ocupado y se libera, queda el botón "Editar".
  useEffect(() => {
    if (!autoEditar || estado !== "lectura" || autoIntentado.current === documento) return;
    autoIntentado.current = documento;
    editar();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- editar cambia en cada render
  }, [autoEditar, estado, documento]);
```

- [ ] **Step 2:** `npm run lint` sin errores nuevos en el archivo; `npm test` (frontend) 22/22. La lógica se verifica con Playwright en Task 6 (el hook no tiene tests unitarios; su lógica pura vive en `utils/bloqueo.js`).
- [ ] **Step 3: Commit** `feat(bloqueo): useBloqueoEdicion puede tomar el documento al abrir el formulario`.

### Task 3: Frontend — modales de catálogo (empresa, usuario, personal, catálogo de servicios)

**Files:** Modify `Frontend/src/components/ModalEmpresa.jsx`, `Frontend/src/pages/Usuarios.jsx`, `Frontend/src/components/ModalCatalogoServicio.jsx`, `Frontend/src/pages/Empresas.jsx`, `Frontend/src/pages/CatalogoServicios.jsx`

Patrón en cada modal (ejemplo `ModalCatalogoServicio`):

```jsx
import useBloqueoEdicion from "../hooks/useBloqueoEdicion";
import BarraEdicion from "./BarraEdicion";
…
const bloqueo = useBloqueoEdicion("catalogoServicio", grupoServicio?._id, grupoServicio?.updatedAt, { autoEditar: true });
const soloLectura = esEdicion && !bloqueo.editando;
…
const res = esEdicion
  ? await bloqueo.fetch(`/catalogo-servicios/${grupoServicio._id}`, { method: "PUT", body: JSON.stringify(datos) })
  : await fetchAuth("/catalogo-servicios", { method: "POST", body: JSON.stringify(datos) });
if (res.ok) { if (esEdicion) await bloqueo.terminar(); onGuardado(await res.json()); }
…
{esEdicion && <BarraEdicion bloqueo={bloqueo} onCancelar={onClose} className="mx-6 mt-4" />}
<fieldset disabled={soloLectura} className="contents"> …campos… </fieldset>
<button onClick={guardar} disabled={guardando || soloLectura}>…</button>
```

- `bloqueo.fetch` ya muestra el 423/409 en la barra (`mensaje`); el `setError` del modal queda para los demás errores (no duplicar: si `res.status` es 409/423, no llamar `setError`).
- `ModalEmpresa` usa `<form onSubmit>`: el fieldset envuelve el contenido del form; el botón de búsqueda por RUC queda dentro (deshabilitado en lectura).
- `Usuarios.jsx`: `ModalUsuario` (`"usuario"`) y `ModalPersonal` (`"personal"`), mismo patrón.
- Eliminar: `Empresas.eliminar` y `CatalogoServicios.eliminar` pasan a `conBloqueo(entidad, id, (h) => fetchAuth(url, { method: "DELETE", headers: h }))`; si no `ok`, mostrar `d.mensaje` (Empresas ya tiene `AvisoAccion`; CatalogoServicios agrega un `AvisoAccion` con el error).

- [ ] Steps: editar los 5 archivos → `npm run lint` (sin errores nuevos) → `npm run build` OK → commit `feat(bloqueo): modales de empresa, usuario, personal y catálogo de servicios con bloqueo`.

### Task 4: Frontend — Almacén (ubicaciones, materiales, categorías, tipos y categorías de componente)

**Files:** Modify `Frontend/src/pages/Almacen.jsx`

En cada sección con formulario de edición en línea (`editando` = id), agregar el hook con la versión del registro de la lista:

```jsx
const versionEditando = lista.find((x) => x._id === editando)?.updatedAt;
const bloqueo = useBloqueoEdicion("ubicacion", editando, versionEditando, { autoEditar: true });
const soloLectura = !!editando && !bloqueo.editando;
```

- Encima del formulario, si `editando`: `<BarraEdicion bloqueo={bloqueo} onCancelar={cancelar} className="mb-3" />`.
- "Guardar" deshabilitado con `soloLectura`; el PUT usa `bloqueo.fetch(url, { method: "PUT", body })`; al terminar bien, `cancelar()` (el cambio de `editando` a `null` suelta el bloqueo en la limpieza del hook).
- `SeccionComponentes` tiene dos formularios: dos hooks (`"tipoComponente"` con `editandoTipo`, `"categoriaComponente"` con `editandoCat`).
- `SeccionMateriales.cambiarActivo`: `conBloqueo("material", m._id, (h, d) => fetchAuth(url, { method: "PUT", headers: cabecerasBloqueo(h["X-Bloqueo"], d.version), body }))`; error → `setError(d.mensaje)`.
- Eliminar categoría de material, tipo y categoría de componente: `conBloqueo` + mostrar `mensaje` en el error de la sección.
- `SeccionUbicaciones` no tenía `error`: agregar `const [error, setError] = useState("")` y su `<p>` como en las otras secciones.

- [ ] Steps: editar → lint → build → commit `feat(bloqueo): Almacén edita ubicaciones, materiales y categorías con bloqueo`.

### Task 5: Frontend — acciones de fila (centros de costo, máquinas, tarifas, requerimientos, servicios externos)

**Files:** Modify `Frontend/src/pages/{CentrosCosto,Maquinas,TarifasPersonal,Requerimientos}.jsx`, `Frontend/src/components/TablaServiciosExternos.jsx`

- `CentrosCosto.actualizar`, `Maquinas.guardarTarifa` / `toggleActivo`, `TarifasPersonal.guardar`: `conBloqueo(entidad, id, (h) => fetchAuth(url, { method, headers: h, body }))`; si no `ok`, mostrar `d.mensaje` (TarifasPersonal agrega estado `error` y su `<p>`; Maquinas usa su `error`).
- `Requerimientos.jsx`: `PanelSalida.confirmar`, `PanelDevolucion.confirmar` y `FilaItem.accion` con `conBloqueo("requerimiento", requerimientoId, …)`; `FilaItem` agrega estado `error` visible bajo la fila. `pagarSeleccionados`: cada pago con `conBloqueo` en serie (requerimiento o servicio); contar los que fallan y, si hay alguno, mostrar "N no se pudieron marcar: {primer mensaje}" en lugar del éxito.
- `TablaServiciosExternos.anular`: `conBloqueo("servicioExterno", id, …)`; si falla, mostrar el mensaje (estado `error` sobre la tabla).

- [ ] Steps: editar → lint → build → commit `feat(bloqueo): acciones de Almacén y catálogos con bloqueo temporal`.

### Task 6: Verificación y documentación

- [ ] Backend `npm test` verde; frontend `npm test`, `npm run lint` (sin errores nuevos respecto a `main`), `npm run build`.
- [ ] Playwright con dos sesiones (e2e_jefa y e2e_sup/otro admin): (a) A abre "Editar" de una empresa → B abre la misma: solo lectura con "En edición por …" y Guardar deshabilitado; A guarda → B ve "Editar" en ≤ 30 s. (b) A edita un material en Almacén → B pulsa "Activo" de ese material → "En edición por …". (c) Pagar dos ítems del mismo requerimiento seguidos → ambos pagados.
- [ ] Revisor final (Agent, opus) sobre el rango de la fase; Critical/Important con test RED→GREEN; menores al ledger y a la sección Estado del spec.
- [ ] Spec: sección "Estado — Fase 4"; memoria `project_compras_fases.md`; `graphify update .`; borrar el workspace del plan.
