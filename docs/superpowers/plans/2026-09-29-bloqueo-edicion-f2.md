# Bloqueo de edición — Fase 2 (Facturación) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que una factura de venta solo la edite (guardar, anular, cambiar impuesto) quien pulsó "Editar"; los demás la ven en solo lectura con "En edición por {usuario}", sin trabar los cobros de Tesorería.

**Architecture:** Reutiliza la infraestructura de la Fase 0 (`BloqueoEdicion`, `/api/bloqueos`, `exigeBloqueo`, `useBloqueoEdicion`, `BarraEdicion`, `conBloqueo`). Se agrega la entidad `factura` al catálogo, se protegen sus 3 rutas de escritura y se integra en `DetalleFactura` y en el cambio de impuesto de Tesorería.

**Tech Stack:** igual que Fases 0–1.

**Spec:** `docs/superpowers/specs/2026-09-28-bloqueo-edicion-design.md` · Plan previo: `docs/superpowers/plans/2026-09-28-bloqueo-edicion-f0-f1.md`

## Global Constraints

- Se trabaja sobre la rama `feature/bloqueo-edicion` (Fases 0–1, sin mergear) en ambos repos. Commits con `-m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`.
- Tests backend: `cd Backend && npm test` con `MONGO_URI_TEST=mongodb://localhost:27018/sipapp-intales-test?replicaSet=rs0`.
- Alcance Fase 2 (decidido al explorar): **solo la factura de venta**. En CPE no hay nada que bloquear: emitir factura/boleta/notas **crea** documentos, los comprobantes emitidos no se editan, y `PATCH /cpe/:id/vincular-factura` es el último paso de una creación (enlaza el comprobante recién emitido con la factura recién creada).
- Los cobros de Tesorería (`MovimientoTesoreria`) **no** exigen bloqueo (ya corren en transacción); si recalculan una factura que alguien edita, al guardar recibirá 409 "cambió" (esperado, spec).
- `PUT /facturas/:id` exige versión; `PATCH /:id/anular` y `PATCH /:id/impuesto` solo el bloqueo. El 409 de vista previa del recálculo (`{ recalculo }`) sigue igual y no se confunde con el 409 de versión (`{ cambio: true }`).
- "Registrar cobro" en el detalle debe seguir disponible en solo lectura (no es una edición de la factura).
- Nunca `alert/confirm/prompt`; lint sin errores nuevos; build OK.

## Review Focus

1. "Registrar cobro" funciona desde el detalle sin pulsar "Editar" — Playwright en Task 3.
2. Cambiar el subtotal con recálculo (409 de vista previa → confirmar) funciona con el bloqueo tomado y no dispara "cambió" — test en Task 1 (PUT con versión) y Playwright en Task 3.
3. Cambiar el impuesto desde Tesorería → Por cobrar mientras otro edita la factura muestra "En edición por …" — Playwright en Task 3.
4. Un cobro registrado mientras alguien edita la factura hace que su guardado dé "cambió" en vez de pisar saldos — Playwright en Task 3.

---

### Task 1: Backend — entidad `factura` y rutas protegidas

**Files:**
- Modify: `Backend/src/utils/entidadesBloqueo.js`, `Backend/src/routes/facturas.js`, `Backend/test/helpers.js`, `Backend/test/ventasTesoreria.test.js`
- Test: `Backend/test/bloqueoFacturacion.test.js`

**Interfaces:**
- Produces: entidad `factura` `{ modelo: Factura, roles: ["admin", "facturacion", "jefatura"] }`; helper de tests `bloqueoDe(srv, entidad, documento, opciones?) → { "X-Bloqueo", "X-Version" }` (requiere `/api/bloqueos` montado en `srv`).

- [ ] **Step 1: Helper de tests** — al final de `Backend/test/helpers.js`:
```js
// Toma el bloqueo de edición de un documento y devuelve las cabeceras para escribir en él.
export async function bloqueoDe(srv, entidad, documento, opciones = {}) {
  const r = await srv.api("POST", "/api/bloqueos", { body: { entidad, documento: String(documento) }, ...opciones });
  if (r.status !== 201) throw new Error(`No se pudo tomar el bloqueo: ${JSON.stringify(r.data)}`);
  return { "X-Bloqueo": r.data.clave, "X-Version": r.data.version };
}
```

- [ ] **Step 2: Escribir el test que falla** — `Backend/test/bloqueoFacturacion.test.js`:
```js
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { conectar, desconectar, limpiar, levantar, bloqueoDe } from "./helpers.js";
import bloqueosRoutes from "../src/routes/bloqueos.js";
import facturasRoutes from "../src/routes/facturas.js";

let srv;
before(async () => { await conectar(); srv = await levantar({ "/api/bloqueos": bloqueosRoutes, "/api/facturas": facturasRoutes }); });
after(async () => { await srv.cerrar(); await desconectar(); });
beforeEach(limpiar);

const RUTAS = [["PUT", "/api/facturas/:id"], ["PATCH", "/api/facturas/:id/anular"], ["PATCH", "/api/facturas/:id/impuesto"]];

test("ninguna ruta de escritura de facturas de venta acepta cambios sin bloqueo", async () => {
  for (const [metodo, ruta] of RUTAS) {
    const r = await srv.api(metodo, ruta.replace(":id", new mongoose.Types.ObjectId().toString()), { body: { motivo: "x", tipo: "ninguno" } });
    assert.equal(r.status, 423, `${metodo} ${ruta} respondió ${r.status}`);
  }
});

test("con el bloqueo y la versión, editar la factura sigue su curso", async () => {
  const f = (await srv.api("POST", "/api/facturas", { body: { numeroFactura: "F001-9", subtotal: 100 } })).data;
  const r = await srv.api("PUT", `/api/facturas/${f._id}`, { body: { descripcion: "con bloqueo" }, headers: await bloqueoDe(srv, "factura", f._id) });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.descripcion, "con bloqueo");
  assert.equal((await srv.api("POST", "/api/bloqueos", { body: { entidad: "factura", documento: f._id }, rol: "vendedor" })).status, 403);
});
```

- [ ] **Step 3: Correr y verificar que falla** — Run: `cd Backend && node --test test/bloqueoFacturacion.test.js` — Expected: FAIL (`PUT /api/facturas/:id respondió 404` o `Este tipo de documento no tiene bloqueo`).

- [ ] **Step 4: Implementar**
1. `entidadesBloqueo.js`: import `import Factura from "../models/Factura.js";` y en `ENTIDADES_BLOQUEO` agregar
```js
  factura: { modelo: Factura, roles: ["admin", "facturacion", "jefatura"] },
```
2. `routes/facturas.js`: import `import exigeBloqueo from "../middleware/exigeBloqueo.js";` (después del último import) y:

| Antes | Después |
|---|---|
| `router.put("/:id", puedeEditar, async` | `router.put("/:id", puedeEditar, exigeBloqueo("factura", { version: true }), async` |
| `router.patch("/:id/anular", puedeEditar, async` | `router.patch("/:id/anular", puedeEditar, exigeBloqueo("factura"), async` |
| `router.patch("/:id/impuesto", puedeMarcarPago, async` | `router.patch("/:id/impuesto", puedeMarcarPago, exigeBloqueo("factura"), async` |

3. `test/ventasTesoreria.test.js`: montar `"/api/bloqueos": bloqueosRoutes` (import `import bloqueosRoutes from "../src/routes/bloqueos.js";`), importar `bloqueoDe` desde `./helpers.js`, y en cada `srv.api("PUT", `/api/facturas/${f._id}`…` y `srv.api("PATCH", `/api/facturas/${f._id}/impuesto` | /anular`…` agregar `headers: await bloqueoDe(srv, "factura", f._id)` a las opciones (el PATCH de impuesto con `rol: "facturacion"` usa también `{ rol: "facturacion" }` en `bloqueoDe`). En el test del recálculo (409 de vista previa y luego confirmar), tomar el bloqueo una vez (`const h = await bloqueoDe(...)`) y usar `h` en las dos llamadas.

- [ ] **Step 5: Correr** — Run: `cd Backend && npm test` — Expected: PASS.

- [ ] **Step 6: Commit**
```bash
git -C Backend add src/utils/entidadesBloqueo.js src/routes/facturas.js test/helpers.js test/ventasTesoreria.test.js test/bloqueoFacturacion.test.js
git -C Backend commit -m "feat(bloqueo): facturas de venta exigen el bloqueo de edición" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Frontend — detalle de factura e impuesto desde Tesorería

**Files:**
- Modify: `Frontend/src/components/DetalleFactura.jsx`, `Frontend/src/components/tesoreria/ModalImpuestoVenta.jsx`

- [ ] **Step 1: `DetalleFactura.jsx`**
1. Imports: `import useBloqueoEdicion from "../hooks/useBloqueoEdicion";`, `import BarraEdicion from "./BarraEdicion";`.
2. Después de `const [recalculo, setRecalculo] = useState(null);`: `const bloqueo = useBloqueoEdicion("factura", inicial._id, inicial.updatedAt);`.
3. Cabecera: antes de `{!inicial.anulado && !cadenaCerrada && puedeEditar && <BotonAnular onAnular={anular} />}` insertar `{!inicial.anulado && !cadenaCerrada && <BarraEdicion bloqueo={bloqueo} puedeEditar={puedeEditar} onCancelar={onClose} />}`; y `<button onClick={() => guardar()} disabled={guardando}` → `<button onClick={() => guardar()} disabled={guardando || !bloqueo.editando}`.
4. El formulario se envuelve en un `<fieldset>` interno, y "Registrar cobro" queda **fuera** (se cobra sin pulsar Editar). Reemplazar
```jsx
          <fieldset disabled={inicial.anulado || cadenaCerrada || !puedeEditar} className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-5 self-start">
```
por
```jsx
          <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-5 self-start">
          <fieldset disabled={inicial.anulado || cadenaCerrada || !puedeEditar || !bloqueo.editando} className="space-y-5 min-w-0">
```
   quitar del recuadro de cálculos el bloque `{puedeCobrar && !inicial.anulado && (inicial.saldoNeto > 0.009 || inicial.saldoImpuesto > 0.009) && ( <button …>Registrar cobro</button> )}`, y reemplazar
```jsx
            {error && <p className="text-xs text-red-500">{error}</p>}
          </fieldset>
```
   por
```jsx
            {error && <p className="text-xs text-red-500">{error}</p>}
          </fieldset>
          {puedeCobrar && !inicial.anulado && (inicial.saldoNeto > 0.009 || inicial.saldoImpuesto > 0.009) && (
            <button type="button" onClick={() => setCobrando(true)}
              className="w-full bg-purple-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-purple-700">
              Registrar cobro
            </button>
          )}
          </div>
```
5. `guardar`: `const res = await fetchAuth(\`/facturas/${inicial._id}\`, {` → `const res = await bloqueo.fetch(\`/facturas/${inicial._id}\`, {`; y `      onGuardada(data);` (dentro de `guardar`) → `      await bloqueo.terminar(data.updatedAt);\n      onGuardada(data);`.
6. `anular`: `fetchAuth(\`/facturas/${inicial._id}/anular\`` → `bloqueo.fetch(\`/facturas/${inicial._id}/anular\``.

- [ ] **Step 2: `ModalImpuestoVenta.jsx`** — import `import { conBloqueo } from "../../utils/bloqueoApi";` y reemplazar
```js
      const r = await fetchAuth(`/facturas/${factura._id}/impuesto`, { method: "PATCH", body: JSON.stringify({ ...form, quienDeposita: quien }) });
```
por
```js
      const r = await conBloqueo("factura", factura._id, (h) => fetchAuth(`/facturas/${factura._id}/impuesto`, { method: "PATCH", headers: h, body: JSON.stringify({ ...form, quienDeposita: quien }) }));
```
(el `setError(data.mensaje …)` existente ya muestra "En edición por …").

- [ ] **Step 3: Verificar** — Run: `cd Frontend && npx eslint src/components/DetalleFactura.jsx src/components/tesoreria/ModalImpuestoVenta.jsx && npm test && npm run build` — Expected: sin errores nuevos; tests y build OK.

- [ ] **Step 4: Commit**
```bash
git -C Frontend add src/components/DetalleFactura.jsx src/components/tesoreria/ModalImpuestoVenta.jsx
git -C Frontend commit -m "feat(bloqueo): factura de venta con botón Editar; cobros siguen disponibles en lectura" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Verificación con dos sesiones y documentación

- [ ] **Step 1: Suites** — Run: `cd Backend && npm test` y `cd Frontend && npm test && npm run build` — Expected: PASS.
- [ ] **Step 2: Playwright con dos sesiones** (base E2E en el replica set; `e2e_jefa` y `e2e_fact`, ambos con permiso sobre facturas):
1. Jefatura abre una factura: "Solo lectura" + "Editar"; campos deshabilitados; **"Registrar cobro" habilitado**.
2. Pulsa "Editar", cambia el subtotal → aparece la confirmación del recálculo → confirma → guarda sin "cambió" y vuelve a lectura.
3. Jefatura edita de nuevo; facturación abre la misma factura → "En edición por E2E jefatura…"; desde Tesorería → Por cobrar → "Impuesto" sobre esa factura → "En edición por …".
4. Con jefatura editando, facturación registra un cobro de esa factura; jefatura guarda → "Este documento cambió…" (no pisa saldos).
Expected: cada paso como se indica; desvío = bug con test, fix y suite verde.
- [ ] **Step 3: Documentar** — sección "Estado" del spec (Fase 2 entregada y la decisión sobre CPE), memoria del proyecto, `graphify update .`.
