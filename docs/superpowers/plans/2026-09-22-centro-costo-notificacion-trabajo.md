# Centro de Costo + Notificación de Trabajo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar una segunda dimensión de costo (horas hombre, horas máquina) a la cadena Cotización→OT existente, etiquetada por centro de costo, con reconocimiento de costo diferido para materiales/servicios (solo al pagar) e inmediato para HH/HM, y un card de reporte por OT que compara el costo de fabricación contra la OC.

**Architecture:** 3 catálogos nuevos/ampliados (`CentroCosto`, `Maquina`, `Usuario.tarifaHora`), 1 documento nuevo en la cadena (`NotificacionTrabajo`, con ciclo de vida abierta/cerrada y anulación por línea), 2 campos de autoetiquetado en modelos existentes (`Requerimiento.items[].centroCosto`, `ServicioExterno.centroCosto`), y un cálculo 100% client-side (sin endpoint de agregación) para el card de Reporte, siguiendo el mismo patrón que `Dashboard.jsx`/`ListaOrdenesCompra.jsx` ya usan para totales derivados.

**Tech Stack:** Node.js ESM + Express + Mongoose (Backend) · React + Vite + Tailwind (Frontend) — mismo stack ya establecido, sin dependencias nuevas. Sin framework de tests en este proyecto — verificación vía `node --check` (backend) y `npx vite build` (frontend), mismo criterio usado en toda la sesión que originó este plan.

**Spec:** `docs/superpowers/specs/2026-09-22-centro-costo-notificacion-trabajo-design.md` — el plan argumenta desde esa spec; cada tarea cita la sección que implementa.

## Global Constraints

- Sin framework de tests — cada tarea se verifica con `node --check <archivo>` (backend) o `npx vite build --mode production` (Frontend), nunca inventar un test runner nuevo.
- Nunca commitear automáticamente — este proyecto no commitea salvo pedido explícito del usuario (regla de la sesión, no del código). Saltar los pasos "Commit" de la plantilla estándar de esta skill.
- `findByIdAndUpdate` no dispara `pre("save")` — ninguna ruta de este plan lo usa para `NotificacionTrabajo` (todas pasan por `.save()` o por instancias ya cargadas + `.save()`), pero si se cambia el enfoque durante la implementación, recalcular `codigo` manualmente si hiciera falta.
- Nombre de ruta/archivo `notificacionesTrabajo.js` (`/notificaciones-trabajo`) es deliberadamente distinto de `routes/notificaciones.js` (sistema de campana/alertas ya existente) — no confundir ni reusar ese archivo.
- Antes de escribir cada ruta nueva, confirmar cómo `src/index.js` monta las rutas existentes (algunas importan `authMiddleware` dentro del propio archivo de rutas) y seguir ese mismo estilo — no asumir sin leer.
- Confirmar contra el código real, no asumir: si `Requerimiento.items[].montoUnitario`/`ServicioExterno.costo` son unitarios (spec ya confirmó que `montoUnitario` lo es, por el comentario "sin IGV" + el nombre; `ServicioExterno.costo` queda por confirmar en la Task 7).

---

## File Structure

```
Backend/
  src/models/CentroCosto.js           ← NUEVO
  src/models/Maquina.js               ← NUEVO
  src/models/NotificacionTrabajo.js   ← NUEVO
  src/models/Usuario.js               ← +tarifaHora
  src/models/Requerimiento.js         ← itemRequerimientoSchema +centroCosto
  src/models/ServicioExterno.js       ← +centroCosto
  src/routes/centrosCosto.js          ← NUEVO
  src/routes/maquinas.js              ← NUEVO
  src/routes/notificacionesTrabajo.js ← NUEVO
  src/routes/usuarios.js              ← +PATCH /:id/tarifa-hora, +tarifaHora en GET /lista
  src/routes/requerimientos.js        ← autoasigna centroCosto en POST /
  src/routes/serviciosExternos.js     ← autoasigna centroCosto en POST /
  src/index.js                        ← monta las 3 rutas nuevas
  seed.js                             ← seed de los 4 CentroCosto

Frontend/
  src/pages/CentrosCosto.jsx          ← NUEVO (admin)
  src/pages/Maquinas.jsx              ← NUEVO (admin + jefatura)
  src/pages/Usuarios.jsx              ← +input tarifaHora (admin + jefatura)
  src/components/ModalNotificacionTrabajo.jsx ← NUEVO
  src/components/ModalDetalleNotificacionTrabajo.jsx ← NUEVO (anular línea, jefatura)
  src/components/ModalReporteCosto.jsx ← NUEVO
  src/components/DetalleOrdenTrabajo.jsx ← +card Notificación de Trabajo, +card Reporte, +fetch notificaciones
  src/components/DetalleSubOT.jsx     ← +card Notificación de Trabajo (mismo criterio que Servicios Externos ahí)
  src/App.jsx                         ← +rutas /centros-costo, /maquinas
  src/components/Sidebar.jsx          ← +ítems de menú (gate de rol)
```

---

## Task 1: Backend — catálogo `CentroCosto`

**Files:**
- Create: `Backend/src/models/CentroCosto.js`
- Create: `Backend/src/routes/centrosCosto.js`
- Modify: `Backend/src/index.js`
- Modify: `Backend/seed.js`

**Interfaces:**
- Produces: `CentroCosto` documents `{ _id, nombre, tipo: "material"|"servicio"|"hh"|"hm", activo }`. Consumido por Task 5 (Requerimiento), Task 6 (ServicioExterno), Task 8 (NotificacionTrabajo).

- [ ] **Step 1: Crear el modelo** (ver spec, sección "`src/models/CentroCosto.js`")

- [ ] **Step 2: Crear las rutas** — `GET /` (cualquier autenticado), `POST /` y `PUT /:id` (`admin` únicamente). Sin `DELETE`, solo `activo: false` vía `PUT`.

- [ ] **Step 3: Leer `src/index.js` completo** — confirmar el estilo real de montaje de rutas (import + `app.use("/api/...", router)`) antes de agregar la línea nueva para `centrosCosto.js`.

- [ ] **Step 4: Montar la ruta en `src/index.js`**

- [ ] **Step 5: Leer `Backend/seed.js` completo**, agregar el seed de los 4 centros — usar `findOneAndUpdate(..., { upsert: true })` por `{ tipo }` para que sea idempotente (correr el seed dos veces no duplica), no `for...of` + `.save()` a ciegas si ya existen:

```js
const CENTROS_COSTO = [
  { nombre: "Compras Materiales", tipo: "material" },
  { nombre: "Servicios Externos", tipo: "servicio" },
  { nombre: "HH", tipo: "hh" },
  { nombre: "HM", tipo: "hm" },
];
for (const c of CENTROS_COSTO) {
  await CentroCosto.findOneAndUpdate({ tipo: c.tipo }, c, { upsert: true, new: true });
}
```

- [ ] **Step 6: Verificar sintaxis**

```powershell
cd C:\SIP-APP\SIPAPP-INTALES\Backend
node --check src/models/CentroCosto.js
node --check src/routes/centrosCosto.js
node --check src/index.js
node --check seed.js
```
Expected: sin salida (todos OK).

- [ ] **Step 7: Correr el seed contra la base real del usuario** (confirmar con el usuario antes si el seed no es claramente idempotente/seguro de re-correr — revisar qué hace el resto de `seed.js` con el admin ya existente para el mismo criterio de seguridad)

```powershell
node seed.js
```
Expected: no falla, y `db.centrocostos.find()` (o el nombre de colección que Mongoose derive) tiene 4 documentos.

---

## Task 2: Backend — catálogo `Maquina`

**Files:**
- Create: `Backend/src/models/Maquina.js`
- Create: `Backend/src/routes/maquinas.js`
- Modify: `Backend/src/index.js`

**Interfaces:**
- Produces: `Maquina` documents `{ _id, nombre, tarifaHora, activo }`. Consumido por Task 8 (NotificacionTrabajo, líneas `tipo: "maquina"`).

- [ ] **Step 1: Crear el modelo** (ver spec)

- [ ] **Step 2: Crear las rutas** — `GET /` (cualquier autenticado), `POST /` y `PUT /:id` restringidos a `["admin", "jefatura"]` (a diferencia de `centrosCosto.js`, acá jefatura sí puede escribir — incluye la tarifa).

- [ ] **Step 3: Montar en `src/index.js`**

- [ ] **Step 4: Verificar sintaxis**

```powershell
node --check src/models/Maquina.js
node --check src/routes/maquinas.js
node --check src/index.js
```

---

## Task 3: Backend — `Usuario.tarifaHora`

**Files:**
- Modify: `Backend/src/models/Usuario.js`
- Modify: `Backend/src/routes/usuarios.js`

**Interfaces:**
- Consumes: nada nuevo.
- Produces: `Usuario.tarifaHora` (Number). Nueva ruta `PATCH /usuarios/:id/tarifa-hora`. `GET /usuarios/lista` ahora incluye `tarifaHora` en la proyección. Consumido por Task 8 (NotificacionTrabajo, líneas `tipo: "hombre"`).

- [ ] **Step 1: Agregar el campo al modelo** (junto a `iniciales`, ver spec)

- [ ] **Step 2: Agregar `puedeEditarTarifa` y la ruta `PATCH /:id/tarifa-hora`** (ver código completo en la spec) — colocarla ANTES de `router.put("/:id", soloAdmin, ...)` para que Express no la intercepte con una ruta más genérica (revisar el orden real de rutas en el archivo antes de decidir dónde insertarla).

- [ ] **Step 3: Ampliar la proyección de `GET /lista`** de `"nombre rol"` a `"nombre rol tarifaHora"`.

- [ ] **Step 4: Verificar sintaxis**

```powershell
node --check src/models/Usuario.js
node --check src/routes/usuarios.js
```

---

## Task 4: Backend — modelo `NotificacionTrabajo`

**Files:**
- Create: `Backend/src/models/NotificacionTrabajo.js`

**Interfaces:**
- Consumes: `CentroCosto` (Task 1), `Usuario.tarifaHora` (Task 3), `Maquina.tarifaHora` (Task 2).
- Produces: `NotificacionTrabajo` documents con `codigo` autogenerado (`NT-0001`), `items[]` con `_id` propio por línea (necesario para `PATCH /:id/items/:itemId/anular` en Task 8).

- [ ] **Step 1: Crear el modelo completo** (ver spec, sección "`src/models/NotificacionTrabajo.js`" — copiar tal cual, incluye el `pre("save")` del código autogenerado)

- [ ] **Step 2: Verificar sintaxis**

```powershell
node --check src/models/NotificacionTrabajo.js
```

---

## Task 5: Backend — `Requerimiento.items[].centroCosto` (autoasignado)

**Files:**
- Modify: `Backend/src/models/Requerimiento.js`
- Modify: `Backend/src/routes/requerimientos.js`

**Interfaces:**
- Consumes: `CentroCosto` (Task 1).
- Produces: `Requerimiento.items[].centroCosto` poblable (ObjectId ref CentroCosto).

- [ ] **Step 1: Agregar el campo a `itemRequerimientoSchema`** (ver spec — junto a `costoTransporte`)

- [ ] **Step 2: Importar `CentroCosto` en `routes/requerimientos.js`**

```js
import CentroCosto from "../models/CentroCosto.js";
```

- [ ] **Step 3: En `POST /`, antes de `new Requerimiento(body).save()`, resolver y asignar el centro** — solo a los ítems `esSolicitudCompra`, no a los de stock:

```js
const centroMaterial = await CentroCosto.findOne({ tipo: "material", activo: true });
if (centroMaterial) {
  body.items = body.items.map((it) => it.esSolicitudCompra
    ? { ...it, centroCosto: centroMaterial._id }
    : it
  );
}
```

- [ ] **Step 4: Agregar `{ path: "items.centroCosto", select: "nombre tipo" }` al array `populate`** del archivo (para que el reporte/las tablas puedan mostrar el nombre sin una consulta aparte)

- [ ] **Step 5: Verificar sintaxis**

```powershell
node --check src/models/Requerimiento.js
node --check src/routes/requerimientos.js
```

---

## Task 6: Backend — `ServicioExterno.centroCosto` (autoasignado)

**Files:**
- Modify: `Backend/src/models/ServicioExterno.js`
- Modify: `Backend/src/routes/serviciosExternos.js`

**Interfaces:**
- Consumes: `CentroCosto` (Task 1).
- Produces: `ServicioExterno.centroCosto` poblable.

- [ ] **Step 1: Leer `ServicioExterno.js` completo** — confirmar si `costo` es unitario o total (revisar cómo se usa en `TablaServiciosExternos.jsx`/`routes/serviciosExternos.js` antes de asumir para el cálculo del reporte en Task 11)

- [ ] **Step 2: Agregar el campo `centroCosto`** al documento (no hay sub-items acá, es un documento plano)

- [ ] **Step 3: Importar `CentroCosto` en `routes/serviciosExternos.js`, asignar en `POST /`**

```js
const centroServicio = await CentroCosto.findOne({ tipo: "servicio", activo: true });
```
Agregar `centroCosto: centroServicio?._id || null` al `new ServicioExterno({...})`.

- [ ] **Step 4: Agregar `{ path: "centroCosto", select: "nombre tipo" }` al array `populate`**

- [ ] **Step 5: Verificar sintaxis**

```powershell
node --check src/models/ServicioExterno.js
node --check src/routes/serviciosExternos.js
```

---

## Task 7: Backend — rutas `NotificacionTrabajo`

**Files:**
- Create: `Backend/src/routes/notificacionesTrabajo.js`
- Modify: `Backend/src/index.js`

**Interfaces:**
- Consumes: `NotificacionTrabajo` (Task 4), `CentroCosto` (Task 1), `Usuario` (Task 3), `Maquina` (Task 2), `notificar`/`notificarAlerta` (`utils/notificar.js`, ya existente).
- Produces: `GET /notificaciones-trabajo?ordenTrabajo=|ordenTrabajoPadre=`, `POST /`, `PATCH /:id/abrir`, `PUT /:id`, `PATCH /:id/items/:itemId/anular`.

- [ ] **Step 1: Crear el archivo de rutas completo** (código íntegro en la spec, sección "`src/routes/notificacionesTrabajo.js`") — copiar tal cual, incluyendo los 3 middlewares (`puedeCrear`, `puedeGestionar`, `puedeVer`)

- [ ] **Step 2: Montar en `src/index.js`** con el path `/api/notificaciones-trabajo`

- [ ] **Step 3: Verificar sintaxis**

```powershell
node --check src/routes/notificacionesTrabajo.js
node --check src/index.js
```

- [ ] **Step 4: Arranque limpio en puerto aislado** (nunca el puerto real del usuario)

```powershell
cd C:\SIP-APP\SIPAPP-INTALES\Backend
$env:PORT=5041; node src/index.js
```
Expected: arranca sin error, log de conexión a Mongo OK. Matar el proceso después.

---

## Task 8: Frontend — catálogos `CentrosCosto.jsx` y `Maquinas.jsx`

**Files:**
- Create: `Frontend/src/pages/CentrosCosto.jsx`
- Create: `Frontend/src/pages/Maquinas.jsx`
- Modify: `Frontend/src/App.jsx`
- Modify: `Frontend/src/components/Sidebar.jsx`

**Interfaces:**
- Consumes: `GET/POST/PUT /centros-costo`, `GET/POST/PUT /maquinas` (Tasks 1-2).

- [ ] **Step 1: Leer una página de catálogo simple ya existente como referencia de layout** (ej. `Frontend/src/pages/TipoCambio.jsx` o similar — tabla + form de alta inline) antes de escribir las nuevas, para mantener el mismo lenguaje visual del resto de la app.

- [ ] **Step 2: Crear `CentrosCosto.jsx`** — tabla nombre/tipo/activo, form de alta (nombre + select tipo), toggle activo/inactivo. Gate de acceso: solo renderizar si `getUsuario()?.rol === "admin"`.

- [ ] **Step 3: Crear `Maquinas.jsx`** — tabla nombre/tarifaHora (editable inline)/activo, form de alta. Gate: `["admin", "jefatura"].includes(getUsuario()?.rol)`.

- [ ] **Step 4: Leer `App.jsx` completo**, agregar las 2 rutas nuevas con el mismo patrón de `roles` que ya usan otras rutas protegidas.

- [ ] **Step 5: Leer `Sidebar.jsx` completo**, agregar los 2 ítems de menú con sus respectivos gates de rol (mismo patrón que el resto de ítems, ej. `esAdmin`, `esJefatura`).

- [ ] **Step 6: Build**

```powershell
cd C:\SIP-APP\SIPAPP-INTALES\Frontend
npx vite build --mode production
```
Expected: build limpio, sin errores.

---

## Task 9: Frontend — `Usuario.tarifaHora` en `Usuarios.jsx`

**Files:**
- Modify: `Frontend/src/pages/Usuarios.jsx`

**Interfaces:**
- Consumes: `PATCH /usuarios/:id/tarifa-hora` (Task 3).

- [ ] **Step 1: Leer `Usuarios.jsx` completo** — confirmar la estructura real de la tabla/fila antes de insertar la columna nueva.

- [ ] **Step 2: Agregar columna "Tarifa/hora"** — input numérico habilitado solo si `["admin", "jefatura"].includes(rolActual)`, con su propio `onBlur`/botón que hace `PATCH /usuarios/:id/tarifa-hora` (independiente del form general de edición de usuario, que sigue siendo `admin`-only vía el backend).

- [ ] **Step 3: Build**

```powershell
npx vite build --mode production
```

---

## Task 10: Frontend — `ModalNotificacionTrabajo.jsx`

**Files:**
- Create: `Frontend/src/components/ModalNotificacionTrabajo.jsx`

**Interfaces:**
- Consumes: `GET /usuarios/lista` (filtrado a roles técnico), `GET /maquinas`, `POST /notificaciones-trabajo` (Task 7).
- Produces: se monta desde `DetalleOrdenTrabajo.jsx`/`DetalleSubOT.jsx` (Task 12) como `<ModalNotificacionTrabajo ot={ot} onClose={...} onCreado={...} />`.

- [ ] **Step 1: Leer `ModalRequerimiento.jsx` completo** como base — mismo patrón: estado local `items[]`, botones para agregar líneas, envío único al guardar.

- [ ] **Step 2: Construir el modal** — dos botones "+ Agregar técnico" / "+ Agregar máquina"; cada línea del `items[]` local: `{ key, tipo, recurso: id, recursoLabel, horas }` (sin tarifa/costo — esos los calcula el backend). El selector de técnico filtra `GET /usuarios/lista` por rol técnico (mismo filtro que ya usa `ModalRequerimiento.jsx`); el de máquina lista `GET /maquinas` con `activo: true`.

- [ ] **Step 3: Al guardar**, `POST /notificaciones-trabajo` con `{ ordenTrabajo: ot._id, items: items.map(it => ({ tipo: it.tipo, recurso: it.recurso, horas: it.horas })) }`. Mismo patrón de rectángulo verde de éxito (`exito` state + `setTimeout(() => onCreado(data), 1800)`) que el resto de modales de este proyecto (ver `ModalCrearOrdenCompra.jsx`), con el botón deshabilitado `disabled={guardando || !!exito}` (bug ya corregido en el resto de modales de esta sesión — no reintroducirlo acá).

- [ ] **Step 4: Gate**: el botón "+ Nueva notificación de trabajo" que abre este modal (en Task 12) solo se renderiza si `["supervisor", "admin"].includes(rolActual)`.

- [ ] **Step 5: Build**

```powershell
npx vite build --mode production
```

---

## Task 11: Frontend — `ModalDetalleNotificacionTrabajo.jsx` (ver líneas, reabrir, anular)

**Files:**
- Create: `Frontend/src/components/ModalDetalleNotificacionTrabajo.jsx`

**Interfaces:**
- Consumes: `PATCH /notificaciones-trabajo/:id/abrir`, `PUT /notificaciones-trabajo/:id`, `PATCH /notificaciones-trabajo/:id/items/:itemId/anular` (Task 7).

- [ ] **Step 1: Construir el modal** — lista de líneas (tipo, recurso, horas, tarifa, costo, estado anulado/no), con:
  - Botón "Reabrir" (si `estado === "cerrada"`) — visible solo `["jefatura", "admin"].includes(rolActual)`.
  - Botón "Anular" por línea (si no está ya anulada) — visible solo jefatura/admin, abre `PromptAccion` (componente ya existente en el proyecto, pide motivo) → `PATCH .../items/:itemId/anular`.
  - Si `estado === "abierta"` y el rol es supervisor/admin: permitir agregar más líneas (reusa el mismo bloque de UI de `ModalNotificacionTrabajo.jsx` para agregar técnico/máquina) y un botón "Guardar" que hace `PUT /notificaciones-trabajo/:id` con el array completo de items (existentes + nuevos).

- [ ] **Step 2: Build**

```powershell
npx vite build --mode production
```

---

## Task 12: Frontend — cards en `DetalleOrdenTrabajo.jsx` / `DetalleSubOT.jsx`

**Files:**
- Modify: `Frontend/src/components/DetalleOrdenTrabajo.jsx`
- Modify: `Frontend/src/components/DetalleSubOT.jsx`

**Interfaces:**
- Consumes: `ModalNotificacionTrabajo.jsx` (Task 10), `ModalDetalleNotificacionTrabajo.jsx` (Task 11), `GET /notificaciones-trabajo?ordenTrabajo=|ordenTrabajoPadre=`.

- [ ] **Step 1: En `cargarRelaciones()` de `DetalleOrdenTrabajo.jsx`**, agregar el fetch de notificaciones de trabajo (mismo patrón `?ordenTrabajoPadre=` ya usado para servicios/informes) a un nuevo state `notificacionesTrabajo`.

- [ ] **Step 2: Agregar el card "Notificación de Trabajo"** en la sección de Relaciones — gate `puedeVerServicios` (ya existe en el archivo, mismo criterio que Servicios Externos: todos menos técnico). Muestra el conteo (`notificacionesTrabajo.length`) y, si hay alguna con `estado === "abierta"`, un badge distintivo. Botón "+ Nueva notificación de trabajo" (gate supervisor/admin, ver Task 10) y click en el card abre `ModalDetalleNotificacionTrabajo.jsx` por cada una, o una lista intermedia si hay más de una (mismo criterio que el card de GRE cuando hay múltiples guías, ver el bloque `gres.length === 1 ? ... : ...` ya existente en este archivo).

- [ ] **Step 3: Repetir en `DetalleSubOT.jsx`** — mismo patrón, sin el fetch `?ordenTrabajoPadre=` (esa vista es solo de la sub-OT propia, mismo criterio que ya sigue `TablaServiciosExternos` ahí).

- [ ] **Step 4: Build**

```powershell
npx vite build --mode production
```

---

## Task 13: Frontend — cálculo del reporte + card "Reporte"

**Files:**
- Create: `Frontend/src/components/ModalReporteCosto.jsx`
- Modify: `Frontend/src/components/DetalleOrdenTrabajo.jsx`

**Interfaces:**
- Consumes: `oc`, `requerimientos`, `servicios`, `notificacionesTrabajo` (todos ya cargados en `DetalleOrdenTrabajo.jsx` a esta altura del plan), `tipoCambio` (revisar si `DetalleOrdenTrabajo.jsx` ya lo fetchea — si no, agregar `GET /tipo-cambio`, mismo endpoint que ya usan `ListaOrdenesCompra.jsx`/`ListaCotizaciones.jsx`).

- [ ] **Step 1: Implementar el cálculo** en `DetalleOrdenTrabajo.jsx` (fórmulas exactas en la spec, sección "Reporte por OT — cálculo") — confirmar antes si `ServicioExterno.costo`/`cantidad` se multiplican igual que `Requerimiento.items[].montoUnitario` (ver Task 6, Step 1).

- [ ] **Step 2: Agregar el card "Reporte"** — gate `["jefatura", "vendedor"].includes(rolActual)`, muestra Margen (S/ o US$ según `oc?.moneda`) y %. Click abre `ModalReporteCosto.jsx`.

- [ ] **Step 3: `ModalReporteCosto.jsx`** — tabla de solo lectura: Materiales pagados / Servicios pagados / HH / HM / Total costo / OC (subtotal) / Margen — mismos números ya calculados en Step 1, pasados como props.

- [ ] **Step 4: Build**

```powershell
npx vite build --mode production
```
Expected: build limpio. Este es el último task del plan — al pasar, el feature completo (catálogos + documento + reporte) está integrado.

---
