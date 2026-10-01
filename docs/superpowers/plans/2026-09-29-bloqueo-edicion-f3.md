# Bloqueo de edición — Fase 3 (Compras y Tesorería) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aplicar el bloqueo de edición a Compras y Tesorería: la licitación (cuadro comparativo) solo la edita quien pulsó "Editar"; las acciones sobre solicitudes de compra, licitaciones, OC a proveedor y facturas de proveedor toman un bloqueo temporal y chocan con "En edición por …" si otro está editando.

**Architecture:** Igual que Fases 1–2: entidades nuevas en `ENTIDADES_BLOQUEO`, `exigeBloqueo` en las rutas, `useBloqueoEdicion`/`BarraEdicion` en el cuadro comparativo y `conBloqueo` en las acciones de tablas. Tests del backend adaptados con un helper `escribir()` (toma → escribe → suelta).

**Tech Stack:** igual que Fases 0–2.

**Spec:** `docs/superpowers/specs/2026-09-28-bloqueo-edicion-design.md`

## Global Constraints

- Misma rama `feature/bloqueo-edicion` (Fases 0–2 sin mergear). Commits con `-m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`. Tests backend con `MONGO_URI_TEST=mongodb://localhost:27018/sipapp-intales-test?replicaSet=rs0`.
- Los pendientes menores de todas las fases se resuelven **al final** (pedido del usuario); no se tocan aquí.
- Entidades nuevas: `solicitudCompra`, `licitacion`, `ordenCompraProveedor` (roles `ROLES_COMPRAS` = vendedor, jefatura, admin) y `facturaProveedor` (roles `ROLES_TESORERIA` = facturacion, jefatura, admin).
- Rutas protegidas (documentos existentes): SC `PATCH /:id/lineas/:lineaId` y `/anular`; licitación `PUT /:id` (**con versión**), `POST /:id/proveedores`, `PATCH /:id/anular`, `POST` y `DELETE` de archivos de proveedor, `POST /:id/adjudicar`; OCP `PATCH /:id/anular`; factura de proveedor `PATCH /:id/anular`, `POST` y `DELETE` de archivos.
- Fuera de alcance, decidido al explorar: **configuración** y **cuentas de tesorería** (interruptores de un solo campo, no hay formulario que pise datos); **crear** licitación (toma líneas de SC con reserva atómica ya existente), crear SC, crear factura de proveedor; movimientos de tesorería (transacciones).
- En el cuadro comparativo, "Guardar cuadro", "+ Invitar proveedor" y "Generar OC(s)" guardan el cuadro: exigen estar editando. Invitar y adjudicar se hacen con el bloqueo del propio cuadro (no piden uno nuevo, que chocaría con el propio).
- `useBloqueoEdicion`: si la versión mostrada llega después del montaje (el cuadro carga la licitación asíncronamente), se anota la **primera** versión conocida; nunca se reemplaza después (eso lo decide `versionTrasAccion`).

## Review Focus

1. Editar el cuadro comparativo, invitar un proveedor y generar OC(s) funciona de corrido con un solo "Editar" (sin 423 contra el propio bloqueo) — Playwright en Task 4.
2. Un cuadro abierto antes de que otro lo guardara: al pulsar "Editar" avisa "cambió" (la versión se anotó al cargar) — test del hook no aplica (React); Playwright en Task 4.
3. Anular una línea de SC / una licitación / una OCP / una factura de proveedor mientras otro edita ese documento → "En edición por …" — test de cobertura en Task 1 y Playwright en Task 4.
4. Los tests de concurrencia (reservas atómicas) siguen probando la reserva con dos peticiones simultáneas que comparten bloqueo — Task 1.

---

### Task 1: Backend — entidades, rutas protegidas y tests adaptados

**Files:**
- Modify: `Backend/src/utils/entidadesBloqueo.js`, `Backend/src/routes/solicitudesCompra.js`, `Backend/src/routes/licitaciones.js`, `Backend/src/routes/ordenesCompraProveedor.js`, `Backend/src/routes/facturasProveedor.js`, `Backend/test/helpers.js`, `Backend/test/escenarios.js`, y los tests que escriben en esas rutas (`adjudicar`, `concurrencia`, `facturasProveedor`, `licitaciones`, `ordenesCompraProveedor`, `solicitudesCompra`, y los que montan esas rutas o usan `escenarioOCP`).
- Test: `Backend/test/bloqueoCompras.test.js`

**Interfaces:**
- Produces: `escribir(srv, entidad, documento, metodo, ruta, opciones?)` en `test/helpers.js` (toma el bloqueo con un usuario fijo, escribe con `X-Bloqueo`/`X-Version`, suelta; requiere `/api/bloqueos` montado).

- [ ] **Step 1: Helper** — al final de `Backend/test/helpers.js`:
```js
// Escritura sobre un documento con bloqueo de edición: toma el bloqueo, escribe y lo suelta.
const USUARIO_BLOQUEO = { id: new mongoose.Types.ObjectId().toString(), nombre: "Tester" };
export async function escribir(srv, entidad, documento, metodo, ruta, opciones = {}) {
  const t = await srv.api("POST", "/api/bloqueos", { body: { entidad, documento: String(documento) }, usuario: USUARIO_BLOQUEO });
  if (t.status !== 201) throw new Error(`No se pudo tomar el bloqueo de ${entidad}: ${JSON.stringify(t.data)}`);
  try {
    return await srv.api(metodo, ruta, { ...opciones, headers: { ...(opciones.headers || {}), "X-Bloqueo": t.data.clave, "X-Version": t.data.version } });
  } finally {
    await srv.api("DELETE", `/api/bloqueos/${t.data.clave}`, { usuario: USUARIO_BLOQUEO });
  }
}
```

- [ ] **Step 2: Escribir el test que falla** — `Backend/test/bloqueoCompras.test.js`:
```js
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { conectar, desconectar, limpiar, levantar, escribir } from "./helpers.js";
import { escenarioOCP } from "./escenarios.js";
import bloqueosRoutes from "../src/routes/bloqueos.js";
import solicitudesRoutes from "../src/routes/solicitudesCompra.js";
import licitacionesRoutes from "../src/routes/licitaciones.js";
import ocpRoutes from "../src/routes/ordenesCompraProveedor.js";
import facturasProveedorRoutes from "../src/routes/facturasProveedor.js";

let srv;
before(async () => {
  await conectar();
  srv = await levantar({
    "/api/bloqueos": bloqueosRoutes, "/api/solicitudes-compra": solicitudesRoutes, "/api/licitaciones": licitacionesRoutes,
    "/api/ordenes-compra-proveedor": ocpRoutes, "/api/facturas-proveedor": facturasProveedorRoutes,
  });
});
after(async () => { await srv.cerrar(); await desconectar(); });
beforeEach(limpiar);

const RUTAS = [
  ["PATCH", "/api/solicitudes-compra/:id/lineas/x"], ["PATCH", "/api/solicitudes-compra/:id/lineas/x/anular"],
  ["PUT", "/api/licitaciones/:id"], ["POST", "/api/licitaciones/:id/proveedores"], ["PATCH", "/api/licitaciones/:id/anular"],
  ["POST", "/api/licitaciones/:id/proveedores/x/archivos"], ["DELETE", "/api/licitaciones/:id/proveedores/x/archivos/y"],
  ["POST", "/api/licitaciones/:id/adjudicar"],
  ["PATCH", "/api/ordenes-compra-proveedor/:id/anular"],
  ["PATCH", "/api/facturas-proveedor/:id/anular"], ["POST", "/api/facturas-proveedor/:id/archivos"], ["DELETE", "/api/facturas-proveedor/:id/archivos/y"],
];

test("ninguna ruta de escritura de Compras/Tesorería acepta cambios sin bloqueo", async () => {
  for (const [metodo, ruta] of RUTAS) {
    const r = await srv.api(metodo, ruta.replace(":id", new mongoose.Types.ObjectId().toString()), { body: { motivo: "x" } });
    assert.equal(r.status, 423, `${metodo} ${ruta} respondió ${r.status}`);
  }
});

test("con el bloqueo, anular la OCP sigue su curso (escenario completo con escribir)", async () => {
  const { ocp } = await escenarioOCP(srv);
  const r = await escribir(srv, "ordenCompraProveedor", ocp._id, "PATCH", `/api/ordenes-compra-proveedor/${ocp._id}/anular`, { body: { motivo: "prueba" } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
});
```

- [ ] **Step 3: Correr y verificar que falla** — Run: `cd Backend && node --test test/bloqueoCompras.test.js` — Expected: FAIL (`... respondió 404/400` distinto de 423).

- [ ] **Step 4: Entidades y rutas**
1. `entidadesBloqueo.js`: imports `SolicitudCompra`, `Licitacion`, `OrdenCompraProveedor`, `FacturaProveedor` (modelos), `import { ROLES_COMPRAS } from "../middleware/puedeComprar.js";`, `import { ROLES_TESORERIA } from "../middleware/puedeTesoreria.js";` y agregar
```js
  solicitudCompra: { modelo: SolicitudCompra, roles: ROLES_COMPRAS },
  licitacion: { modelo: Licitacion, roles: ROLES_COMPRAS },
  ordenCompraProveedor: { modelo: OrdenCompraProveedor, roles: ROLES_COMPRAS },
  facturaProveedor: { modelo: FacturaProveedor, roles: ROLES_TESORERIA },
```
2. En cada router, import `import exigeBloqueo from "../middleware/exigeBloqueo.js";` y reemplazos exactos:

| Archivo | Antes | Después |
|---|---|---|
| solicitudesCompra.js | `router.patch("/:id/lineas/:lineaId", async` | `router.patch("/:id/lineas/:lineaId", exigeBloqueo("solicitudCompra"), async` |
| solicitudesCompra.js | `router.patch("/:id/lineas/:lineaId/anular", async` | `router.patch("/:id/lineas/:lineaId/anular", exigeBloqueo("solicitudCompra"), async` |
| licitaciones.js | `router.post("/:id/proveedores", async` | `router.post("/:id/proveedores", exigeBloqueo("licitacion"), async` |
| licitaciones.js | `router.put("/:id", async` | `router.put("/:id", exigeBloqueo("licitacion", { version: true }), async` |
| licitaciones.js | `router.patch("/:id/anular", async` | `router.patch("/:id/anular", exigeBloqueo("licitacion"), async` |
| licitaciones.js | `router.post("/:id/proveedores/:provId/archivos", uploadArchivoCompra.single("archivo"),` | `router.post("/:id/proveedores/:provId/archivos", exigeBloqueo("licitacion"), uploadArchivoCompra.single("archivo"),` |
| licitaciones.js | `router.delete("/:id/proveedores/:provId/archivos/:archivoId", async` | `router.delete("/:id/proveedores/:provId/archivos/:archivoId", exigeBloqueo("licitacion"), async` |
| licitaciones.js | `router.post("/:id/adjudicar", async` | `router.post("/:id/adjudicar", exigeBloqueo("licitacion"), async` |
| ordenesCompraProveedor.js | `router.patch("/:id/anular", async` | `router.patch("/:id/anular", exigeBloqueo("ordenCompraProveedor"), async` |
| facturasProveedor.js | `router.patch("/:id/anular", async` | `router.patch("/:id/anular", exigeBloqueo("facturaProveedor"), async` |
| facturasProveedor.js | `router.post("/:id/archivos", uploadArchivoTesoreria.single("archivo"),` | `router.post("/:id/archivos", exigeBloqueo("facturaProveedor"), uploadArchivoTesoreria.single("archivo"),` |
| facturasProveedor.js | `router.delete("/:id/archivos/:archivoId", async` | `router.delete("/:id/archivos/:archivoId", exigeBloqueo("facturaProveedor"), async` |

- [ ] **Step 5: Adaptar los tests existentes** (mecánico):
1. En todo `test/*.test.js` cuyo `levantar({...})` monte alguno de `solicitudesCompra`, `licitaciones`, `ordenesCompraProveedor` o `facturasProveedor`, agregar `"/api/bloqueos": bloqueosRoutes` (import `import bloqueosRoutes from "../src/routes/bloqueos.js";`) e importar `escribir` desde `./helpers.js`.
2. Toda llamada `srv.api("M", \`/api/<prefijo>/${X}…\`, …)` con `M` ∈ PUT/PATCH/DELETE, o `M` = POST y ruta `/api/licitaciones/${X}/…` o `/api/facturas-proveedor/${X}/archivos`, pasa a `escribir(srv, "<entidad>", X, "M", \`…\`, …)` con el mapeo `solicitudes-compra → solicitudCompra`, `licitaciones → licitacion`, `ordenes-compra-proveedor → ordenCompraProveedor`, `facturas-proveedor → facturaProveedor`. `test/escenarios.js` (adjudicar de `escenarioOCP`) igual, importando `escribir` desde `./helpers.js`.
3. `test/concurrencia.test.js`, "dos adjudicaciones simultáneas": las dos peticiones comparten el mismo bloqueo, para seguir probando la reserva atómica:
```js
  const h = await bloqueoDe(srv, "licitacion", lic._id);
  const [a, b] = await Promise.all([
    srv.api("POST", `/api/licitaciones/${lic._id}/adjudicar`, { body, headers: h }),
    srv.api("POST", `/api/licitaciones/${lic._id}/adjudicar`, { body, headers: h }),
  ]);
```
(import `bloqueoDe`; el resto del test igual). El test de "dos envíos simultáneos" (crear licitación) no cambia.

- [ ] **Step 6: Correr** — Run: `cd Backend && npm test` — Expected: PASS (todas).

- [ ] **Step 7: Commit**
```bash
git -C Backend add src/utils/entidadesBloqueo.js src/routes/solicitudesCompra.js src/routes/licitaciones.js src/routes/ordenesCompraProveedor.js src/routes/facturasProveedor.js test/
git -C Backend commit -m "feat(bloqueo): Compras y Tesorería exigen el bloqueo de edición" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Frontend — hook (versión tardía) y cuadro comparativo

**Files:**
- Modify: `Frontend/src/hooks/useBloqueoEdicion.js`, `Frontend/src/components/compras/ModalCuadroComparativo.jsx`, `Frontend/src/components/compras/ModalEnviarProveedores.jsx`, `Frontend/src/components/compras/ModalGenerarOCP.jsx`, `Frontend/src/components/compras/ArchivosProveedor.jsx`

- [ ] **Step 1: Hook — primera versión conocida.** En `useBloqueoEdicion.js`, después del `useEffect` de `[documento]` que fija `version.current = versionMostrada`, agregar:
```js
  // Pantallas que cargan el documento después de montar (cuadro comparativo): se
  // anota la primera versión conocida; las siguientes las decide versionTrasAccion.
  useEffect(() => { if (version.current == null && versionMostrada) version.current = versionMostrada; }, [versionMostrada]);
```

- [ ] **Step 2: `ModalCuadroComparativo.jsx`**
1. Imports: `import useBloqueoEdicion from "../../hooks/useBloqueoEdicion";`, `import BarraEdicion from "../BarraEdicion";`.
2. Después de `const [aviso, setAviso] = useState("");` (antes del `useEffect` y del `if (!lic || !borrador) return`): `const bloqueo = useBloqueoEdicion("licitacion", licitacionId, lic?.updatedAt);`.
3. En `guardar`: `const r = await fetchAuth(\`/licitaciones/${lic._id}\`, { method: "PUT", body: JSON.stringify(body) });` → `const r = await bloqueo.fetch(\`/licitaciones/${lic._id}\`, { method: "PUT", body: JSON.stringify(body) });`.
4. La tabla del cuadro queda de solo lectura hasta "Editar": envolver el elemento `<table` … `</table>` del cuadro con `<fieldset disabled={!bloqueo.editando} className="min-w-0">` … `</fieldset>`.
5. Pie: antes de `{error && <p className="text-sm text-red-500 mr-auto">{error}</p>}` insertar `<BarraEdicion bloqueo={bloqueo} onCancelar={onClose} className="mr-auto" />`; los tres botones (`onClick={invitar}`, `onClick={guardar}`, `onClick={abrirGenerar}`) pasan de `disabled={guardando}` a `disabled={guardando || !bloqueo.editando}`.
6. Pasar el bloqueo a los hijos: `<ArchivosProveedor licitacionId={lic._id} proveedor={p} puedeBorrar onCambio={setLic} />` → `<ArchivosProveedor licitacionId={lic._id} proveedor={p} puedeBorrar onCambio={setLic} bloqueo={bloqueo} />`; `<ModalEnviarProveedores licitacion={lic}` → `<ModalEnviarProveedores licitacion={lic} bloqueo={bloqueo}`; `<ModalGenerarOCP licitacion={lic}` → `<ModalGenerarOCP licitacion={lic} bloqueo={bloqueo}`.

- [ ] **Step 3: Hijos del cuadro** (cada uno acepta la prop opcional `bloqueo`; sin ella toma uno temporal con `conBloqueo`, import `import { conBloqueo } from "../../utils/bloqueoApi";`):
- `ModalEnviarProveedores.jsx`: agregar `bloqueo` a las props y reemplazar la llamada `fetchAuth(\`/licitaciones/${licitacion._id}/proveedores\`, opciones)` por
```js
(bloqueo ? bloqueo.fetch(`/licitaciones/${licitacion._id}/proveedores`, opciones)
  : conBloqueo("licitacion", licitacion._id, (h) => fetchAuth(`/licitaciones/${licitacion._id}/proveedores`, { ...opciones, headers: h })))
```
  (con las mismas `opciones` que hoy se pasan en línea; extraerlas a una constante `opciones` justo antes).
- `ModalGenerarOCP.jsx`: igual con `` `/licitaciones/${licitacion._id}/adjudicar` ``.
- `ArchivosProveedor.jsx`: agregar `bloqueo` a las props; `const r = await uploadAuth(base, fd);` → `const r = await (bloqueo ? bloqueo.upload(base, fd) : conBloqueo("licitacion", licitacionId, (h) => uploadAuth(base, fd, h)));` y `const r = await fetchAuth(\`${base}/${archivo._id}\`, { method: "DELETE" });` → `const r = await (bloqueo ? bloqueo.fetch(\`${base}/${archivo._id}\`, { method: "DELETE" }) : conBloqueo("licitacion", licitacionId, (h) => fetchAuth(\`${base}/${archivo._id}\`, { method: "DELETE", headers: h })));`. Si hoy el error no muestra `mensaje` del servidor, mostrarlo cuando `r.status === 423`.

- [ ] **Step 4: Verificar** — Run: `cd Frontend && npx eslint src/hooks/useBloqueoEdicion.js src/components/compras/ && npm test && npm run build` — Expected: sin errores nuevos; tests y build OK.

- [ ] **Step 5: Commit**
```bash
git -C Frontend add src/hooks/useBloqueoEdicion.js src/components/compras/ModalCuadroComparativo.jsx src/components/compras/ModalEnviarProveedores.jsx src/components/compras/ModalGenerarOCP.jsx src/components/compras/ArchivosProveedor.jsx
git -C Frontend commit -m "feat(bloqueo): cuadro comparativo con botón Editar; invitar, adjudicar y archivos con el bloqueo del cuadro" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Frontend — acciones de tablas (SC, licitaciones, OCP, facturas de proveedor)

**Files:**
- Modify: `Frontend/src/components/compras/TablaPorProcesar.jsx`, `Frontend/src/components/compras/TablaLicitaciones.jsx`, `Frontend/src/components/compras/TablaCompras.jsx`, `Frontend/src/components/tesoreria/TablaPorPagar.jsx`, `Frontend/src/components/tesoreria/ModalFacturaProveedor.jsx`

- [ ] **Step 1: Envolver cada escritura con `conBloqueo`** (import `import { conBloqueo } from "../../utils/bloqueoApi";`). Patrón: `fetchAuth(url, opciones)` → `conBloqueo("<entidad>", <id>, (h) => fetchAuth(url, { ...opciones, headers: h }))`:

| Archivo | Llamada | Entidad | id |
|---|---|---|---|
| TablaPorProcesar.jsx | `` fetchAuth(`/solicitudes-compra/${fila.sc._id}/lineas/${fila._id}` `` | `solicitudCompra` | `fila.sc._id` |
| TablaPorProcesar.jsx | `` fetchAuth(`/solicitudes-compra/${anulando.sc._id}/lineas/${anulando._id}/anular` `` | `solicitudCompra` | `anulando.sc._id` |
| TablaLicitaciones.jsx | `` fetchAuth(`/licitaciones/${anulando._id}/anular` `` | `licitacion` | `anulando._id` |
| TablaCompras.jsx | `` fetchAuth(`/ordenes-compra-proveedor/${anulando._id}/anular` `` | `ordenCompraProveedor` | `anulando._id` |
| TablaPorPagar.jsx | `` fetchAuth(`/facturas-proveedor/${anulando._id}/anular` `` | `facturaProveedor` | `anulando._id` |
| ModalFacturaProveedor.jsx | `` uploadAuth(`/facturas-proveedor/${fp._id}/archivos`, fd) `` | `facturaProveedor` | `fp._id` (usar `(h) => uploadAuth(url, fd, h)`) |

Donde el manejo de error actual muestre un texto fijo, usar el `mensaje` del servidor cuando `r.status === 423`.

- [ ] **Step 2: Verificar** — Run: `cd Frontend && npx eslint src/components/compras/ src/components/tesoreria/ && npm test && npm run build` — Expected: sin errores nuevos; tests y build OK.

- [ ] **Step 3: Commit**
```bash
git -C Frontend add src/components/compras/TablaPorProcesar.jsx src/components/compras/TablaLicitaciones.jsx src/components/compras/TablaCompras.jsx src/components/tesoreria/TablaPorPagar.jsx src/components/tesoreria/ModalFacturaProveedor.jsx
git -C Frontend commit -m "feat(bloqueo): acciones de Compras y Tesorería con bloqueo temporal" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Verificación con dos sesiones, revisión y documentación

- [ ] **Step 1: Suites** — `cd Backend && npm test`; `cd Frontend && npm test && npm run build` — Expected: PASS.
- [ ] **Step 2: Playwright con dos sesiones** (base E2E; `e2e_jefa` y `e2e_asis`/vendedor con permiso de Compras; crear por API una SC y una licitación si no hay):
1. Jefatura abre el cuadro comparativo: tabla deshabilitada, "Editar" visible, botones Guardar/Invitar/Generar deshabilitados.
2. Pulsa "Editar", cambia un precio, "Guardar cuadro" → guardado; "+ Invitar proveedor" y luego "Generar OC(s)" funcionan con el mismo bloqueo (sin 423 propio).
3. Con jefatura editando otra licitación, la otra sesión intenta "Anular" esa licitación desde la tabla → "En edición por …".
4. Un cuadro abierto antes de que el otro lo guarde: "Editar" → "Este documento cambió…".
5. Anular una OCP y una factura de proveedor sin nadie editando → funciona (bloqueo temporal).
- [ ] **Step 3: Revisión final** con un revisor fresco (diffs de esta fase); Critical/Important → un solo pase de corrección con tests; Minor → al final (lista del spec).
- [ ] **Step 4: Documentar** — sección Estado del spec (Fase 3), memoria, `graphify update .`.
