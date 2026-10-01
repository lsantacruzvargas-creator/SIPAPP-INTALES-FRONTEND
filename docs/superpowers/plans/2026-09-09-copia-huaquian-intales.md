# Copia de SIPAPP-HUAQUIAN a SIPAPP-INTALES — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar el código de `SIPAPP-INTALES` (Backend + Frontend) por una copia completa del código de `SIPAPP-HUAQUIAN`, rebrandeada para Intales (fabricaciones mecánicas), preservando el historial git existente de ambos repos, sin el subsistema `InformeTecnico` (Intales usa el modelo `Informe` legado y administrativo), y con soporte de imagen por ítem en Cotizaciones tipo venta/suministro.

**Architecture:** Copia 1:1 del árbol `Backend/src` y `Frontend/src`+`electron/`+`public/` de Huaquian sobre los directorios (hoy vacíos) de Intales, seguida de una pasada de remoción quirúrgica de `InformeTecnico` (6 archivos backend, 7 archivos frontend) y una pasada de rebranding (nombres, `.env`, `package.json`, localStorage, logos placeholder). Se añade `imagenes: [String]` al `itemSchema` de `Cotizacion` con un endpoint de subida dedicado, mirror exacto del patrón ya probado en `informes-tecnicos/subir-imagen`. Infraestructura local/Electron con `multer.diskStorage`, igual que Huaquian (no R2/Railway).

**Tech Stack:** Node.js ESM + Express 4 + Mongoose 8 + JWT + bcryptjs + multer (diskStorage) · React 19 + Vite 8 + Tailwind v4 + React Router 7 + Electron 42 + electron-builder + jsPDF/jspdf-autotable + ExcelJS

**Spec:** Este plan mismo — no hay spec previo por separado. Decisiones de alcance confirmadas por el usuario el 2026-09-09 (ver resumen abajo).

## Decisiones de alcance confirmadas (usuario, 2026-09-09)

- **Alcance:** copia completa 1:1 del código de Huaquian, con dos excepciones explícitas: (a) sin `InformeTecnico` (15 plantillas de equipo) — Intales usa el modelo `Informe` legado, generado por personal administrativo, no por técnicos; (b) Cotizaciones de Intales necesitan imagen por ítem cuando `tipo` es venta/suministro.
- **Infraestructura:** local/Electron, igual que Huaquian (`multer.diskStorage`, sin R2/Railway/Cloudflare Pages — eso era de la versión vieja de Intales, se abandona).
- **Historial git:** se mantiene el historial existente de `Backend/` y `Frontend/` (remotos `SIPAPP-INTALES-BACKEND`/`-FRONTEND` ya configurados) — el código de Huaquian entra como commit nuevo encima, no se reinicia el repo.
- **Rubro Intales:** fabricaciones mecánicas. Comparte la cadena de negocio (Empresa → Cotización → OT/sub-OT → Informe → OC → Factura) y probablemente los 11 roles de Huaquian (no se pidió reducirlos — copia 1:1).
- **PENDIENTE, fuera de este plan (Task 14):** el usuario **todavía no tiene** el formato propio de cotización de Intales (ni logos de marca). Este plan deja el formato de Huaquian (estándar/Gloria/Alicorp, con sus logos) como base temporal funcional, y agrega el campo de imagen por ítem al modelo — pero **no** diseña el layout/PDF final de Intales. Eso requiere una sesión de brainstorming aparte cuando el usuario tenga la plantilla.

## Global Constraints

- Nunca tocar el servidor de desarrollo en vivo del usuario — toda verificación de backend corre en una instancia aislada en un puerto alterno (`PORT=5041`, incrementando si ya está en uso), contra la misma `MONGO_URI`, y se mata el proceso al terminar.
- Limpieza de datos de prueba SIEMPRE por `_id` exacto capturado en el test — nunca por filtro de valores de campo.
- `.xlsx`/`.ico`/`.png`/`.jpg`/`.pdf` deben quedar marcados `binary` en `.gitattributes` (ver Task 4) — sin esto, `core.autocrlf` los corrompe en cada checkout.
- Seed/creación de documentos en lote: siempre `for...of` + `await doc.save()`, nunca `Promise.all` (race condition en los hooks `pre("save")` que generan códigos únicos).
- `findByIdAndUpdate` no dispara `pre("save")` — los campos derivados (totales, `numeroDocumento`, etc.) que ya vienen resueltos así en Huaquian se copian tal cual, sin tocar esa lógica.
- No usar `window.alert`/`confirm`/`prompt` en ningún código nuevo (regla global del usuario, ya respetada por el código de Huaquian que se copia).

---

## File Structure

```
Backend/
  src/                      ← se reemplaza completo (copiado de Huaquian, menos InformeTecnico)
    config/db.js
    controllers/            (2 archivos: guia.controller.js, comprobante.controller.js)
    middleware/authMiddleware.js, upload.js  ← upload.js gana un 3er storage (cotizaciones)
    models/                 (25 archivos, menos InformeTecnico.js)
    routes/                 (28 archivos, menos informesTecnicos.js) + cotizaciones.js modificado
    scripts/backfillEstadoCadena.js
    services/hub.service.js + 1 más
    utils/                  (15 archivos, con 3 editados: bloqueadoPorCadena.js,
                              recalcularInformesAprobados.js, sincronizarEstadoCadena.js)
    index.js                ← editado: quita mount de informesTecnicosRoutes
  .env, .env.example, .gitattributes, package.json  ← rebrandeados
  scripts/bootstrapAdmin.js  ← NUEVO, crea el primer usuario admin de Intales

Frontend/
  src/                      ← se reemplaza completo (copiado de Huaquian, menos InformeTecnico)
    components/             (49 - 5 = 44 archivos; DetalleOrdenTrabajo.jsx y
                              DetalleSubOT.jsx editados para quitar el trigger de Informe Técnico)
    context/, pages/, utils/, assets/
  electron/main.cjs, offline.html
  public/                   ← copiado, logos quedan como placeholder de Huaquian (Task 14 los reemplaza)
  package.json               ← rebrandeado (name, build.appId, build.productName, build.publish.repo)
  .env, .env.example
```

---

## Task 1: Backend — copiar el árbol `Backend/src` de Huaquian, excluyendo InformeTecnico

**Files:**
- Create: todo `Backend/src/**` (destino), copiado de `C:\SIP-APP\SIPAPP-HUAQUIAN\Backend\src`
- Excluir: `models/InformeTecnico.js`, `routes/informesTecnicos.js`

**Interfaces:**
- Produces: árbol `Backend/src/*` completo en Intales, listo para que Task 2 quite las referencias residuales y Task 3 le agregue el endpoint de imágenes de cotización.

- [ ] **Step 1: Copiar el árbol completo con robocopy, excluyendo los 2 archivos de InformeTecnico**

```powershell
robocopy "C:\SIP-APP\SIPAPP-HUAQUIAN\Backend\src" "C:\SIP-APP\SIPAPP-INTALES\Backend\src" /E /XF InformeTecnico.js informesTecnicos.js
```

Nota: `robocopy` devuelve código de salida ≥8 solo si hubo error real; 1-3 es éxito con copias/no-cambios, no lo interpretes como falla.

- [ ] **Step 2: Copiar los archivos de configuración/manifiesto de Backend (sin `.env` real, ese es Task 4)**

```powershell
Copy-Item "C:\SIP-APP\SIPAPP-HUAQUIAN\Backend\.env.example" "C:\SIP-APP\SIPAPP-INTALES\Backend\.env.example"
Copy-Item "C:\SIP-APP\SIPAPP-HUAQUIAN\Backend\package.json" "C:\SIP-APP\SIPAPP-INTALES\Backend\package.json"
Copy-Item "C:\SIP-APP\SIPAPP-HUAQUIAN\Backend\.gitignore" "C:\SIP-APP\SIPAPP-INTALES\Backend\.gitignore" -ErrorAction SilentlyContinue
```

- [ ] **Step 3: Verificar que no quedó ningún InformeTecnico copiado**

```powershell
Get-ChildItem -Recurse "C:\SIP-APP\SIPAPP-INTALES\Backend\src" -Include "InformeTecnico.js","informesTecnicos.js"
```

Expected: ninguna salida (0 archivos).

- [ ] **Step 4: Instalar dependencias**

```powershell
cd C:\SIP-APP\SIPAPP-INTALES\Backend
npm install
```

Expected: instala sin errores (mismo `package.json` que Huaquian: express, mongoose, jsonwebtoken, bcryptjs, multer, helmet, cors, express-mongo-sanitize, express-rate-limit, dotenv, nodemon).

---

## Task 2: Backend — quitar referencias residuales a InformeTecnico

**Files:**
- Modify: `Backend/src/index.js`
- Modify: `Backend/src/models/CategoriaMaterial.js`
- Modify: `Backend/src/utils/bloqueadoPorCadena.js`
- Modify: `Backend/src/utils/recalcularInformesAprobados.js`
- Modify: `Backend/src/utils/sincronizarEstadoCadena.js`

**Interfaces:**
- Consumes: árbol copiado en Task 1.
- Produces: backend que arranca sin `import ... from "./routes/informesTecnicos.js"` y sin ningún `mongoose.model("InformeTecnico")` colgante.

- [ ] **Step 1: Ubicar cada referencia exacta**

```powershell
cd C:\SIP-APP\SIPAPP-INTALES\Backend
Select-String -Path "src\index.js","src\models\CategoriaMaterial.js","src\utils\bloqueadoPorCadena.js","src\utils\recalcularInformesAprobados.js","src\utils\sincronizarEstadoCadena.js" -Pattern "InformeTecnico"
```

- [ ] **Step 2: En `src/index.js`, quitar el import y el `app.use` de `informesTecnicosRoutes`**

Quitar la línea `import informesTecnicosRoutes from "./routes/informesTecnicos.js";` y la línea `app.use("/api/informes-tecnicos", informesTecnicosRoutes);` (verificar el path exacto del mount con el Select-String del Step 1 antes de borrar — puede no ser literalmente `/api/informes-tecnicos`).

- [ ] **Step 3: En los 4 archivos restantes, revisar cada match uno por uno**

Cada uno probablemente hace `mongoose.model("InformeTecnico")` o filtra por `tipoDocumento === "informeTecnico"` dentro de una lista de tipos de documento de la cadena (junto a Cotizacion/OrdenTrabajo/OrdenCompra/Factura) — quitar solo la rama de `InformeTecnico`, dejando intactas las de los demás documentos de la cadena. No adivines el código sin leer el archivo primero — el Select-String del Step 1 te da la línea exacta de cada match.

- [ ] **Step 4: Arrancar el backend aislado y confirmar que no crashea**

```powershell
cd C:\SIP-APP\SIPAPP-INTALES\Backend
$env:PORT=5041; node src/index.js
```

Expected: log `Servidor corriendo en puerto 5041` (o el mensaje equivalente de `index.js`), sin excepción de módulo no encontrado ni de modelo Mongoose sin registrar. Ctrl+C para detener.

- [ ] **Step 5: Commit (local, sin push todavía — el push es Task 6)**

```powershell
git add src/index.js src/models/CategoriaMaterial.js src/utils/bloqueadoPorCadena.js src/utils/recalcularInformesAprobados.js src/utils/sincronizarEstadoCadena.js
git commit -m "chore: quita referencias a InformeTecnico (no aplica a Intales)"
```

---

## Task 3: Backend — imagen por ítem en Cotización

**Files:**
- Modify: `Backend/src/models/Cotizacion.js` (itemSchema)
- Modify: `Backend/src/middleware/upload.js` (nuevo storage + export)
- Modify: `Backend/src/routes/cotizaciones.js` (nuevo endpoint)

**Interfaces:**
- Produces: `POST /api/cotizaciones/subir-imagen` — recibe `multipart/form-data` con campo `imagen`, devuelve `{ url: "/uploads/cotizaciones/<archivo>" }`. `Cotizacion.items[].imagenes` es `[String]` de URLs, igual forma que ya usa `Informe.items[].imagenes`.

- [ ] **Step 1: Agregar `imagenes` al itemSchema de Cotizacion**

En `Backend/src/models/Cotizacion.js`, dentro de `itemSchema` (junto a `descripcion`, `subItems`, etc.):

```js
    imagenes: [{ type: String }],
```

- [ ] **Step 2: Agregar el storage de imágenes de cotización en `upload.js`**

Al final de `Backend/src/middleware/upload.js`, siguiendo el mismo patrón que `uploadsDir`/`uploadsOCDir`:

```js
const uploadsCotizacionesDir = path.join(__dirname, "../../uploads/cotizaciones");
if (!fs.existsSync(uploadsCotizacionesDir)) fs.mkdirSync(uploadsCotizacionesDir, { recursive: true });

const storageCotizaciones = multer.diskStorage({
  destination: (_, __, cb) => cb(null, uploadsCotizacionesDir),
  filename: (_, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
  },
});

export const uploadCotizacionImagen = multer({
  storage: storageCotizaciones,
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_, file, cb) => {
    cb(null, TIPOS_IMAGEN_PERMITIDOS.includes(file.mimetype));
  },
});
```

- [ ] **Step 3: Agregar el endpoint en `routes/cotizaciones.js`**

Cerca del import de rutas existente, agregar:

```js
import { uploadCotizacionImagen } from "../middleware/upload.js";
```

Y como ruta (antes de las rutas con `:id`, mismo criterio de orden que usa el resto del router):

```js
router.post("/subir-imagen", uploadCotizacionImagen.single("imagen"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No se recibió ninguna imagen" });
  res.json({ url: `/uploads/cotizaciones/${req.file.filename}` });
});
```

- [ ] **Step 4: Smoke test aislado del endpoint**

```powershell
cd C:\SIP-APP\SIPAPP-INTALES\Backend
$env:PORT=5041; node src/index.js
```

En otra terminal, con un JWT firmado a mano con el `JWT_SECRET` real (patrón establecido — nunca hace falta loguearse de verdad) y una imagen de prueba:

```powershell
node -e "
const jwt = require('jsonwebtoken');
require('dotenv').config();
console.log(jwt.sign({ id: '000000000000000000000000', rol: 'admin' }, process.env.JWT_SECRET, { expiresIn: '5m' }));
"
```

```powershell
curl.exe -X POST http://localhost:5041/api/cotizaciones/subir-imagen -H "Authorization: Bearer <token>" -F "imagen=@C:\ruta\a\una\imagen.png"
```

Expected: `200` con `{ "url": "/uploads/cotizaciones/<timestamp>-<random>.png" }`, y el archivo aparece físicamente en `Backend/uploads/cotizaciones/`.

- [ ] **Step 5: Limpieza — borrar el archivo subido de prueba**

```powershell
Remove-Item "C:\SIP-APP\SIPAPP-INTALES\Backend\uploads\cotizaciones\*" -Force
taskkill /F /PID <pid del node de arriba>
```

- [ ] **Step 6: Commit**

```powershell
git add src/models/Cotizacion.js src/middleware/upload.js src/routes/cotizaciones.js
git commit -m "feat: soporte de imagen por item en Cotizacion (venta/suministro)"
```

---

## Task 4: Backend — rebranding

**Files:**
- Modify: `Backend/package.json`
- Modify: `Backend/.env.example`
- Create: `Backend/.env` (real, con valores de Intales — NO se commitea)
- Modify: `Backend/.gitattributes` (si Huaquian tenía uno en Backend — verificar, puede que solo esté en Frontend)

**Interfaces:**
- Produces: backend identificable como Intales en logs/manifiesto, `.env` con credenciales propias de Intales.

- [ ] **Step 1: Renombrar en `package.json`**

```json
"name": "sipapp-intales-backend",
```//no otros cambios necesarios en Backend/package.json — no tiene productName/appId (eso es solo Frontend/electron-builder).

- [ ] **Step 2: Completar `Backend/.env` con valores reales de Intales**

Copiar `.env.example` a `.env` y pedirle al usuario (o completar junto con él) cada valor — **no inventar credenciales**:

```
PORT=5000
MONGO_URI=<cluster/base de Mongo de Intales — ¿nuevo cluster Atlas o base nueva en el mismo cluster de Huaquian?>
JWT_SECRET=<generar uno nuevo, distinto al de Huaquian>
JWT_EXPIRES_IN=<mismo valor que Huaquian, ej. "8h" — confirmar>
FRONTEND_URL=<URL del frontend de Intales en dev, ej. http://localhost:5173>
HUB_BASE_URL=<confirmar con el usuario si Intales emite comprobantes SUNAT vía el mismo hub — no asumir>
HUB_API_KEY=<idem>
RAZON_SOCIAL_EMISOR=<razón social real de Intales>
RUC_EMISOR=<RUC real de Intales>
SUNAT_ENVIRONMENT=<beta o produccion>
APIPERU_TOKEN=<confirmar si aplica>
```

Este step queda **bloqueado hasta que el usuario confirme** MONGO_URI, si aplica facturación SUNAT para Intales (no se preguntó todavía), y los datos fiscales reales. No avanzar a Task 7 (smoke test) sin al menos `MONGO_URI` y `JWT_SECRET` reales.

- [ ] **Step 3: Verificar `.gitattributes`**

```powershell
Get-Content "C:\SIP-APP\SIPAPP-HUAQUIAN\Backend\.gitattributes" -ErrorAction SilentlyContinue
```

Si existe (Backend no maneja `.xlsx`/imágenes propias como Frontend, así que puede no tener uno — confirmar), copiarlo igual que Task 1 Step 2.

- [ ] **Step 4: Commit**

```powershell
git add package.json .env.example .gitattributes 2>$null
git commit -m "chore: rebranding de package.json y .env.example para Intales"
```

`.env` real NUNCA se commitea (ya debe estar en `.gitignore`, verificar).

---

## Task 5: Backend — bootstrap del primer usuario admin

Huaquian no tiene `seed.js` (el `seed.js` con roles/datos de ejemplo era de la versión vieja de Intales, no existe en el código que se está copiando). `POST /api/usuarios` requiere `soloAdmin`, así que hace falta un script one-off que inserte el primer admin directo en Mongo.

**Files:**
- Create: `Backend/scripts/bootstrapAdmin.js`

**Interfaces:**
- Consumes: `Usuario` model (`Backend/src/models/Usuario.js`) — `nombre`, `username`, `password` (se hashea solo, vía `pre("save")`), `rol` (enum incluye `"admin"`).
- Produces: un documento `Usuario` con `rol: "admin"` en la base de Intales, para poder loguearse por primera vez y crear al resto desde la UI.

- [ ] **Step 1: Escribir el script**

```js
// Backend/scripts/bootstrapAdmin.js
import "dotenv/config";
import { setServers } from "dns";
import mongoose from "mongoose";
import Usuario from "../src/models/Usuario.js";

setServers(["8.8.8.8", "8.8.4.4"]);

const [, , nombre, username, password] = process.argv;
if (!nombre || !username || !password) {
  console.error("Uso: node scripts/bootstrapAdmin.js \"Nombre Apellido\" usuario contraseña");
  process.exit(1);
}

await mongoose.connect(process.env.MONGO_URI);

const existente = await Usuario.findOne({ username: username.toLowerCase() });
if (existente) {
  console.error(`Ya existe un usuario con username "${username}".`);
  process.exit(1);
}

const admin = new Usuario({ nombre, username, password, rol: "admin" });
await admin.save();
console.log(`Admin creado: ${admin.codigo} / ${admin.username}`);

await mongoose.disconnect();
```

- [ ] **Step 2: Ejecutar contra la base de Intales (una sola vez)**

```powershell
cd C:\SIP-APP\SIPAPP-INTALES\Backend
node scripts/bootstrapAdmin.js "Luis Alberto" admin <contraseña-elegida-por-el-usuario>
```

Expected: `Admin creado: USR-0001 / admin`.

- [ ] **Step 3: Verificar login contra la instancia aislada**

```powershell
$env:PORT=5041; node src/index.js
```

```powershell
curl.exe -X POST http://localhost:5041/api/auth/login -H "Content-Type: application/json" -d "{\"username\":\"admin\",\"password\":\"<misma-contraseña>\"}"
```

Expected: `200` con `{ token, usuario: { rol: "admin", ... } }`.

- [ ] **Step 4: Commit**

```powershell
git add scripts/bootstrapAdmin.js
git commit -m "feat: script de bootstrap del primer usuario admin"
```

---

## Task 6: Backend — commit final y verificación de remoto

**Files:** (ninguno nuevo — task de integración)

- [ ] **Step 1: Confirmar que el remoto sigue siendo el de Intales**

```powershell
cd C:\SIP-APP\SIPAPP-INTALES\Backend
git remote -v
```

Expected: `origin  https://github.com/lsantacruzvargas-creator/SIPAPP-INTALES-BACKEND.git` (fetch y push).

- [ ] **Step 2: Revisar el estado completo antes de commitear lo que falte**

```powershell
git status
git add -A
git status
```

Confirmar que lo que se está por commitear es: eliminación de los archivos viejos del ERP simple (ya aparecían "deleted") + adición del árbol completo de Huaquian adaptado. No debe aparecer `.env` real ni `node_modules/`.

- [ ] **Step 3: Commit final de integración (si queda algo suelto de Tasks 1-5)**

```powershell
git commit -m "feat: copia completa del backend de Huaquian, adaptado a Intales"
```

- [ ] **Step 4: NO hacer push todavía** — confirmar con el usuario antes de empujar a `SIPAPP-INTALES-BACKEND` (acción visible/compartida, requiere su aprobación explícita por las reglas de este entorno).

---

## Task 7: Backend — smoke test end-to-end en instancia aislada

**Files:** (ninguno nuevo — script de verificación temporal, no se commitea)

- [ ] **Step 1: Levantar la instancia aislada**

```powershell
cd C:\SIP-APP\SIPAPP-INTALES\Backend
$env:PORT=5041; node src/index.js
```

- [ ] **Step 2: Script de smoke test — firma JWT de admin, crea Empresa → Cotización (con un ítem con imagen) → OT → Informe, verifica cada paso con asserts, y limpia por `_id`**

```js
// scratchpad: smoke-intales.mjs — ejecutar con `node smoke-intales.mjs`, NUNCA contra el server del usuario
import jwt from "jsonwebtoken";
import "dotenv/config";

const BASE = "http://localhost:5041/api";
const token = jwt.sign({ id: "000000000000000000000000", rol: "admin" }, process.env.JWT_SECRET, { expiresIn: "5m" });
const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
const ids = {};

async function req(method, path, body) {
  const res = await fetch(`${BASE}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

// 1. Empresa
let r = await req("POST", "/empresas", { razonSocial: "Cliente Smoke Test SAC", ruc: "20999999999" });
console.assert(r.status === 201 || r.status === 200, "crear empresa", r);
ids.empresa = r.data._id;

// 2. Cotizacion con un item que trae imagenes[]
r = await req("POST", "/cotizaciones", {
  titulo: "Smoke test", tipo: "venta", empresa: ids.empresa,
  items: [{ descripcion: "Pieza mecanizada", cantidad: 1, precio: 100, imagenes: ["/uploads/cotizaciones/fake-smoke.png"] }],
});
console.assert(r.status === 201 || r.status === 200, "crear cotizacion con imagen en item", r);
console.assert(r.data.items[0].imagenes[0] === "/uploads/cotizaciones/fake-smoke.png", "imagen persistida en el item", r.data);
ids.cotizacion = r.data._id;

// 3. Limpieza — SIEMPRE por _id exacto
if (ids.cotizacion) await req("DELETE", `/cotizaciones/${ids.cotizacion}`);
if (ids.empresa) await req("DELETE", `/empresas/${ids.empresa}`);

console.log("Smoke test OK", ids);
```

Ajustar los endpoints exactos (`/empresas`, `/cotizaciones`, método de borrado — puede ser `DELETE` real o `PATCH /:id/anular` según lo que uses en Huaquian) leyendo `routes/empresas.js` y `routes/cotizaciones.js` antes de correrlo — no asumas sin confirmar contra el código real copiado.

- [ ] **Step 3: Correr el script y revisar que todos los `console.assert` pasen sin imprimir nada (assert silencioso = OK)**

```powershell
node smoke-intales.mjs
```

- [ ] **Step 4: Matar la instancia aislada**

```powershell
taskkill /F /PID <pid>
```

---

## Task 8: Frontend — copiar el árbol `Frontend/src`+`electron/`+`public/` de Huaquian, excluyendo InformeTecnico

**Files:**
- Create: todo `Frontend/src/**`, `Frontend/electron/**`, `Frontend/public/**` (destino)
- Excluir: `src/components/FormInformeTecnico.jsx`, `src/components/ModalSeleccionarTipoInforme.jsx`, `src/components/VistaInformeTecnico.jsx`, `src/utils/informesTecnicos.js`, `src/utils/informeTecnicoExcel.js`

**Interfaces:**
- Produces: árbol `Frontend/src/*` completo en Intales, listo para que Task 9 quite el trigger embebido de Informe Técnico dentro de `DetalleOrdenTrabajo.jsx`/`DetalleSubOT.jsx`.

- [ ] **Step 1: Copiar `src/` excluyendo los 5 archivos de InformeTecnico**

```powershell
robocopy "C:\SIP-APP\SIPAPP-HUAQUIAN\Frontend\src" "C:\SIP-APP\SIPAPP-INTALES\Frontend\src" /E /XF FormInformeTecnico.jsx ModalSeleccionarTipoInforme.jsx VistaInformeTecnico.jsx informesTecnicos.js informeTecnicoExcel.js
```

- [ ] **Step 2: Copiar `electron/` y `public/` completos (no tienen nada de InformeTecnico)**

```powershell
robocopy "C:\SIP-APP\SIPAPP-HUAQUIAN\Frontend\electron" "C:\SIP-APP\SIPAPP-INTALES\Frontend\electron" /E
robocopy "C:\SIP-APP\SIPAPP-HUAQUIAN\Frontend\public" "C:\SIP-APP\SIPAPP-INTALES\Frontend\public" /E
```

- [ ] **Step 3: Copiar manifiestos de configuración (package.json se rebrandea en Task 11, copiarlo tal cual por ahora)**

```powershell
Copy-Item "C:\SIP-APP\SIPAPP-HUAQUIAN\Frontend\package.json" "C:\SIP-APP\SIPAPP-INTALES\Frontend\package.json"
Copy-Item "C:\SIP-APP\SIPAPP-HUAQUIAN\Frontend\index.html" "C:\SIP-APP\SIPAPP-INTALES\Frontend\index.html"
Copy-Item "C:\SIP-APP\SIPAPP-HUAQUIAN\Frontend\vite.config.js" "C:\SIP-APP\SIPAPP-INTALES\Frontend\vite.config.js"
Copy-Item "C:\SIP-APP\SIPAPP-HUAQUIAN\Frontend\.gitattributes" "C:\SIP-APP\SIPAPP-INTALES\Frontend\.gitattributes"
Copy-Item "C:\SIP-APP\SIPAPP-HUAQUIAN\Frontend\.env.example" "C:\SIP-APP\SIPAPP-INTALES\Frontend\.env.example" -ErrorAction SilentlyContinue
```

- [ ] **Step 4: Verificar que no quedó nada de InformeTecnico**

```powershell
Get-ChildItem -Recurse "C:\SIP-APP\SIPAPP-INTALES\Frontend\src" -Include "*InformeTecnico*","informesTecnicos.js","informeTecnicoExcel.js"
```

Expected: ninguna salida.

- [ ] **Step 5: Instalar dependencias**

```powershell
cd C:\SIP-APP\SIPAPP-INTALES\Frontend
npm install
```

---

## Task 9: Frontend — quitar el trigger embebido de Informe Técnico

**Files:**
- Modify: `Frontend/src/components/DetalleOrdenTrabajo.jsx`
- Modify: `Frontend/src/components/DetalleSubOT.jsx`

**Interfaces:**
- Consumes: árbol copiado en Task 8.
- Produces: detalle de OT/sub-OT sin la pestaña/botón que abre `ModalSeleccionarTipoInforme`/`FormInformeTecnico` (ya no existen tras Task 8).

- [ ] **Step 1: Ubicar cada referencia exacta**

```powershell
cd C:\SIP-APP\SIPAPP-INTALES\Frontend
Select-String -Path "src\components\DetalleOrdenTrabajo.jsx","src\components\DetalleSubOT.jsx" -Pattern "InformeTecnico|informesTecnicos"
```

- [ ] **Step 2: Leer el contexto de cada match antes de borrar**

Revisar si es un `import`, un botón/tab de UI, o una llamada a `fetch`/`fetchAuth` hacia `/informes-tecnicos`. Quitar el import y el bloque de UI correspondiente (probablemente un botón "Generar Informe Técnico" o una pestaña dentro de un stepper) sin tocar el resto del detalle de OT (Cotización/OC/Factura/Informe legado deben seguir intactos).

- [ ] **Step 3: Levantar el frontend y confirmar que compila y navega sin error de import faltante**

```powershell
cd C:\SIP-APP\SIPAPP-INTALES\Frontend
npm run dev
```

Abrir `http://localhost:5173`, revisar la consola del navegador — no debe haber error de módulo no encontrado. (Login fallará hasta que el backend con el admin bootstrapeado — Task 5 — esté corriendo apuntando al mismo `MONGO_URI`.)

- [ ] **Step 4: Commit**

```powershell
git add src/components/DetalleOrdenTrabajo.jsx src/components/DetalleSubOT.jsx
git commit -m "chore: quita el trigger de Informe Tecnico del detalle de OT (no aplica a Intales)"
```

---

## Task 10: Frontend — imagen por ítem en el formulario de Cotización

**Files:**
- Modify: el componente de ítems de cotización de Huaquian (localizar primero — probablemente `FormCotizacion.jsx` o `DetalleCotizacion.jsx`, ver Step 1)
- Modify: `Frontend/src/utils/fetchAuth.js` (confirmar si ya expone un helper `uploadAuth` genérico — Huaquian ya lo usa en `FormInformeTecnico.jsx`, debería seguir existiendo ahí tras la copia)

**Interfaces:**
- Consumes: `POST /api/cotizaciones/subir-imagen` (Task 3) → `{ url: string }`. Helper `uploadAuth(path, formData)` ya existente en `fetchAuth.js`.
- Produces: cada ítem de una cotización `tipo: "venta"` (o el valor que el usuario use para "suministro" — confirmar en Step 1 si existe un tercer valor de `tipo` o si "suministro" es sinónimo de "venta" en la UI) muestra un input de imagen y una miniatura, guardando la URL en `item.imagenes`.

- [ ] **Step 1: Ubicar el componente real de ítems de cotización y confirmar el valor exacto de `tipo` para venta/suministro**

```powershell
cd C:\SIP-APP\SIPAPP-INTALES\Frontend
Select-String -Path "src\components\*.jsx" -Pattern "cotizacion.*items|itemSchema|agregarItem" -List
Select-String -Path "src\components\*.jsx" -Pattern "\"venta\"|'venta'|tipo ===" -List
```

Leer el componente encontrado completo antes de editarlo — no asumir su estructura.

- [ ] **Step 2: Agregar el input de imagen por ítem, mirror del patrón de `FormInformeTecnico.jsx` (`subir` con `uploadAuth`, límite de espacio, preview + botón eliminar)**

Estructura de referencia (adaptar nombres de variables al componente real localizado en el Step 1 — no es un archivo nuevo, es una inserción dentro del `map` de ítems existente):

```jsx
const subirImagenItem = async (indice, files) => {
  const archivos = Array.from(files).slice(0, 1); // una imagen por item, confirmado con el usuario
  if (!archivos.length) return;
  const fd = new FormData();
  fd.append("imagen", archivos[0]);
  const res = await uploadAuth("/cotizaciones/subir-imagen", fd);
  if (!res.ok) return;
  const { url } = await res.json();
  setItems((prev) => prev.map((it, i) => (i === indice ? { ...it, imagenes: [url] } : it)));
};

const eliminarImagenItem = (indice) =>
  setItems((prev) => prev.map((it, i) => (i === indice ? { ...it, imagenes: [] } : it)));
```

Y en el JSX de cada ítem, condicionado a `tipo === "venta"` (o el valor confirmado en Step 1):

```jsx
{tipo === "venta" && (
  <div className="flex items-center gap-2">
    {item.imagenes?.[0] ? (
      <div className="relative">
        <img src={item.imagenes[0]} alt="" className="w-16 h-16 object-cover rounded border" />
        <button type="button" onClick={() => eliminarImagenItem(indice)} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-5 h-5 text-xs">×</button>
      </div>
    ) : (
      <label className="text-xs text-blue-600 cursor-pointer">
        + Imagen
        <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => subirImagenItem(indice, e.target.files)} />
      </label>
    )}
  </div>
)}
```

- [ ] **Step 3: Confirmar que `imagenes` viaja en el `body` al guardar la cotización (PUT/POST completos ya mandan `items` tal cual, no hace falta tocar la llamada de guardado)**

- [ ] **Step 4: Probar manualmente en el navegador**: crear una cotización tipo venta, subir una imagen a un ítem, guardar, recargar el detalle y confirmar que la imagen persiste.

- [ ] **Step 5: Commit**

```powershell
git add <archivo del componente editado en Step 1-2>
git commit -m "feat: imagen por item en Cotizacion (venta/suministro)"
```

---

## Task 11: Frontend — rebranding

**Files:**
- Modify: `Frontend/package.json`
- Modify: `Frontend/src/utils/fetchAuth.js` (claves de `localStorage`)
- Grep-and-review: strings de marca "Huaquian"/"HUAQUIAN" en componentes de UI (título, sidebar, login)

**Interfaces:**
- Produces: frontend/instalador identificable como Intales; sesión guardada en `localStorage` bajo claves `intales_token`/`intales_usuario` (mismo patrón que ya usaba la versión vieja de Intales).

- [ ] **Step 1: Rebrandear `package.json`**

```json
{
  "main": "electron/main.cjs",
  "description": "ERP SIP App Intales",
  "author": "Intales",
  "build": {
    "appId": "com.intales.sipapp",
    "productName": "SIPAPP Intales",
    "directories": { "output": "dist-electron" },
    "files": ["dist/**/*", "electron/**/*"],
    "win": { "target": "nsis", "icon": "public/icon.ico" },
    "publish": {
      "provider": "github",
      "owner": "lsantacruzvargas-creator",
      "repo": "SIPAPP-INTALES-FRONTEND",
      "releaseType": "release"
    }
  },
  "name": "sipapp-intales",
  ...
}
```

(mantener el resto de campos — `version`, `scripts`, `dependencies`, `devDependencies` — tal cual se copiaron en Task 8, solo cambian los campos de arriba)

- [ ] **Step 2: Cambiar las claves de `localStorage` en `fetchAuth.js`**

```powershell
Select-String -Path "src\utils\fetchAuth.js" -Pattern "localStorage"
```

Cambiar cualquier clave `huaquian_token`/`huaquian_usuario` (o el nombre real que use Huaquian — confirmar con el grep) a `intales_token`/`intales_usuario`.

- [ ] **Step 3: Buscar y revisar strings de marca visibles en la UI**

```powershell
Select-String -Path "src\components\*.jsx","src\pages\*.jsx" -Pattern "Huaquian|HUAQUIAN" -List
```

Revisar cada archivo listado (probablemente `Login.jsx`, `Sidebar.jsx`, el `<title>` en `index.html`) y reemplazar por "Intales" — no hacer un reemplazo ciego global, algunos matches pueden ser nombres de archivo/ruta de logo que Task 14 todavía no reemplazó (dejar esos intactos hasta tener el logo real de Intales).

- [ ] **Step 4: `index.html` — título de la pestaña**

```powershell
Select-String -Path "index.html" -Pattern "<title>"
```

Cambiar a algo como `<title>SIPAPP Intales</title>`.

- [ ] **Step 5: Commit**

```powershell
git add package.json src/utils/fetchAuth.js index.html <otros archivos tocados en Step 3>
git commit -m "chore: rebranding de Huaquian a Intales (package.json, localStorage, strings de UI)"
```

---

## Task 12: Frontend — commit final y verificación de remoto

- [ ] **Step 1: Confirmar remoto**

```powershell
cd C:\SIP-APP\SIPAPP-INTALES\Frontend
git remote -v
```

Expected: `origin  https://github.com/lsantacruzvargas-creator/SIPAPP-INTALES-FRONTEND.git`.

- [ ] **Step 2: Revisar y commitear lo que falte**

```powershell
git status
git add -A
git status
git commit -m "feat: copia completa del frontend de Huaquian, adaptado a Intales"
```

Confirmar que no se está commiteando `node_modules/`, `dist/`, ni `.env` real.

- [ ] **Step 3: NO hacer push todavía** — pedir confirmación explícita del usuario antes de empujar a `SIPAPP-INTALES-FRONTEND`.

---

## Task 13: Verificación manual conjunta (backend + frontend corriendo juntos)

- [ ] **Step 1: Levantar backend real (puerto de Intales definitivo, ej. 5000 — confirmar en `.env` de Task 4) y frontend (`npm run dev`)**

- [ ] **Step 2: Login con el admin bootstrapeado en Task 5**

- [ ] **Step 3: Recorrido manual del flujo completo**: crear Empresa → Cotización (tipo venta, con imagen en un ítem, confirmar que persiste) → generar OT desde la cotización → crear Informe (legado, no técnico) con imágenes en sus ítems → generar OC → generar Factura. Confirmar que en cada paso el `numeroDocumento` se sincroniza en toda la cadena (patrón `sincronizarCadena.js`, ya copiado tal cual de Huaquian).

- [ ] **Step 4: Reportar al usuario cualquier módulo que dependa de datos/config que este plan no cubrió** (p. ej. si `HUB_BASE_URL`/`RUC_EMISOR` quedaron vacíos porque Task 4 Step 2 se dejó pendiente, la emisión de comprobantes SUNAT fallará — es esperado hasta que el usuario confirme si Intales factura electrónicamente).

---

## Task 14 (BLOQUEADO — no implementar sin que el usuario lo pida): formato propio de cotización de Intales

El usuario confirmó que **todavía no tiene** la plantilla/formato final de cotización de Intales, ni logos de marca para reemplazar los de Huaquian (`Frontend/public/assets/logos/*`, usados por `Frontend/src/utils/cotizacionPdf.js`). Este plan copia el formato de Huaquian (estándar/Gloria/Alicorp) como base funcional temporal — **no** diseña el layout final.

Cuando el usuario tenga la plantilla:
1. Traer los logos de Intales (mismo rol que los archivos documentados en `Frontend/public/assets/logos/README.md`) y actualizar ese README.
2. Sesión de **brainstorming** (skill `superpowers:brainstorming`) para definir el formato de cotización propio de Intales — probablemente reemplaza los 3 formatos actuales (estándar/Gloria/Alicorp) por uno solo, con la imagen por ítem ya soportada por este plan (Tasks 3 y 10) integrada al layout del PDF.
3. Revisar el skill `pdf-cotizacion-recetas` (jsPDF + jspdf-autotable) antes de tocar `cotizacionPdf.js` — tiene recetas ya probadas para mezclar negrita/normal en celdas, altura de línea real, ocultar ceros, y cargar logos desde `/public`.

---

## Self-Review

**Spec coverage:**
- Copia completa 1:1 → Tasks 1, 8 (backend/frontend completos).
- Sin InformeTecnico → Tasks 1/2 (backend), 8/9 (frontend).
- Imagen por ítem en Cotización venta/suministro → Tasks 3 (backend) y 10 (frontend).
- Infra local/Electron → ya es la infra nativa del código copiado, sin tarea aparte (Huaquian ya usa `multer.diskStorage` y `electron-builder`, no se toca).
- Historial git preservado → Tasks 6 y 12 (commit sobre el repo existente, sin `git init`/reset).
- Rebranding → Tasks 4 (backend) y 11 (frontend).
- Bootstrap de acceso inicial → Task 5.
- Verificación → Tasks 7 (smoke aislado) y 13 (manual conjunta).
- Formato propio de cotización + logos (bloqueado por falta de insumos del usuario) → Task 14, explícitamente marcada como no-implementar-todavía.

**Placeholder scan:** los únicos puntos dejados abiertos a propósito son datos que el usuario debe proveer (RUC, credenciales de hub SUNAT, si Intales emite comprobantes electrónicos, cluster Mongo) — están señalados explícitamente como bloqueantes en Task 4 Step 2, no como código a medio escribir.

**Consistencia de tipos:** `imagenes` es `[String]` tanto en `Cotizacion.itemSchema` (Task 3) como en el `Informe.itemSchema` ya existente — mismo shape, mismo endpoint pattern (`POST .../subir-imagen` → `{ url }`) en ambos módulos.
