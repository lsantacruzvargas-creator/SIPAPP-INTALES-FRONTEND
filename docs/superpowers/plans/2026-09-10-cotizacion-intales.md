# Formato de Cotización Intales — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar el formulario y el PDF de Cotización de Intales (heredados 1:1 de Huaquian) por el formato real único de Intales, extraído de `formato-cotizacion-INTALES.xlsx`, eliminando por completo los formatos Gloria/Alicorp (inalcanzables para Intales).

**Architecture:** Cambios de modelo en `Usuario` (+4 campos de firma) y `Cotizacion` (+`rq`/`creadoPor`/campos de ítem, -campos Gloria/Alicorp/no-usados, nuevo formato de `codigo`), un endpoint de lectura nuevo para exponer `ruc`/`razonSocial` del emisor al frontend, recorte del formulario en las 3 superficies ya tocadas por el plan de copia original (`TablaItemsCotizacion.jsx`, `DetalleCotizacion.jsx`, `ModalNuevaCotizacion.jsx`, `pages/Cotizaciones.jsx`), reescritura completa de `cotizacionPdf.js` con jsPDF+autoTable, y borrado de todo el código Gloria/Alicorp.

**Tech Stack:** Node.js ESM + Express + Mongoose (Backend) · React + jsPDF + jspdf-autotable (Frontend) — mismo stack ya establecido en el proyecto, sin dependencias nuevas.

**Spec:** `docs/superpowers/specs/2026-09-10-cotizacion-intales-design.md` — el plan argumenta desde esa spec; cada tarea abajo cita la sección de la spec que implementa.

## Global Constraints

- Nunca tocar el servidor de desarrollo en vivo del usuario — toda verificación de backend corre en una instancia aislada en un puerto alterno, nunca el 5000 (el usuario puede tener su propio servidor corriendo ahí — ya pasó una vez en esta sesión).
- Limpieza de datos de prueba SIEMPRE por `_id` exacto capturado en el test, nunca por filtro de valores de campo.
- `.png`/`.jpg`/`.jpeg` deben quedar marcados `binary` en `.gitattributes` (ya existe y ya los cubre, ver plan de copia original — solo verificar que los 5 logos nuevos caen bajo esos patrones, no hace falta tocar el archivo).
- `findByIdAndUpdate` no dispara `pre("save")` — si alguna ruta de Cotización recalcula campos derivados vía ese método, revisar si necesita el mismo tratamiento manual que ya usa el resto del proyecto (no se detectó ninguno nuevo en este plan, pero verificar al tocar `routes/cotizaciones.js`).
- Seed/creación de documentos en lote: `for...of` + `await doc.save()`, nunca `Promise.all` (no aplica directamente a este plan — no hay generación en lote — pero si algún test de verificación crea varias cotizaciones, seguir este patrón).
- Trabajo directo sobre `main` en ambos repos (mismo consentimiento ya dado por el usuario para el plan de copia original — sigue vigente para este plan, mismos repos).

---

## File Structure

```
Backend/
  src/models/Usuario.js          ← +4 campos (cargo, correo, telefono, iniciales)
  src/models/Cotizacion.js       ← itemSchema +codigo/+diasEntrega/-4 campos Gloria;
                                     documento +rq/+creadoPor/-16 campos no usados;
                                     pre("save") reescrito (nuevo formato de código)
  src/routes/usuarios.js         ← acepta los 4 campos nuevos en POST/PUT
  src/routes/cotizaciones.js     ← setea creadoPor en POST, populate en GET;
                                     nueva ruta GET /emisor (ruc+razonSocial)

Frontend/
  public/assets/logos/           ← +5 archivos nuevos (intales_logo.png,
                                     lexacaucho_logo.jpeg, majuflex_logo.png,
                                     rodilex_logo.png, bcp_logo_intales.png)
  src/pages/Usuarios.jsx         ← +4 inputs (cargo, correo, telefono, iniciales)
  src/utils/cotizacionPdf.js     ← reescritura completa del layout
  src/pages/EmitirGuia.jsx       ← desacoplado de HUAQUIAN, constante local propia
  src/components/TablaItemsCotizacion.jsx  ← +columnas Código/Días de entrega,
                                     quita gate tipo==="venta" en imagen
  src/components/DetalleCotizacion.jsx     ← quita ramas Gloria/Alicorp, +RQ,
                                     recorta campos del formulario
  src/components/ModalNuevaCotizacion.jsx  ← idem
  src/pages/Cotizaciones.jsx               ← idem
  src/utils/cotizacionItems.js             ← quita funciones Gloria

  BORRAR: src/components/TablaItemsCotizacionGloria.jsx
  BORRAR: src/components/TablaItemsCotizacionAlicorp.jsx
  BORRAR: src/utils/cotizacionGloriaPdf.js
  BORRAR: src/utils/cotizacionAlicorpPdf.js
```

---

## Task 1: Backend — extender `Usuario` con datos de firma

**Files:**
- Modify: `Backend/src/models/Usuario.js`
- Modify: `Backend/src/routes/usuarios.js`

**Interfaces:**
- Produces: `Usuario` documents con `cargo`/`correo`/`telefono`/`iniciales` (todos string,
  opcionales). Consumido por Task 4 (código de cotización) y Task 8 (firma del PDF).

- [ ] **Step 1: Leer `Usuario.js` completo, agregar los 4 campos**

En el schema, junto a `activo`:

```js
cargo:     { type: String, trim: true, default: "" },
correo:    { type: String, trim: true, default: "" },
telefono:  { type: String, trim: true, default: "" },
iniciales: { type: String, trim: true, default: "" },
```

- [ ] **Step 2: Leer `routes/usuarios.js` completo — confirmar cómo arma el body el `POST /` y la ruta de edición actuales**

No asumir la forma exacta sin leerlo. Si construyen el documento campo por campo (whitelist,
como ya se confirmó que hacen los payloads de Cotización en el plan de copia original), agregar
los 4 campos nuevos explícitamente ahí. Si en cambio hacen `new Usuario(req.body)` o
`findByIdAndUpdate(id, req.body)` sin whitelist, los campos ya pasan solos — confirmar cuál es
el caso real antes de tocar nada.

- [ ] **Step 3: Verificar arranque limpio**

```powershell
cd C:\SIP-APP\SIPAPP-INTALES\Backend
$env:PORT=5041; node src/index.js
```

Expected: arranque limpio, sin error de sintaxis/import. Matar el proceso, confirmar que no
queda ninguno corriendo.

- [ ] **Step 4: Commit**

```powershell
git add src/models/Usuario.js src/routes/usuarios.js
git commit -m "feat: agrega cargo/correo/telefono/iniciales a Usuario (firma de cotizacion)"
```

---

## Task 2: Backend — modelo de Cotización

**Files:**
- Modify: `Backend/src/models/Cotizacion.js`

**Interfaces:**
- Consumes: `Usuario.iniciales` (Task 1) para el nuevo formato de `codigo`.
- Produces: `Cotizacion.items[].codigo` (string), `.items[].diasEntrega` (number),
  `.rq` (string), `.creadoPor` (ObjectId ref Usuario). `codigo` del documento con formato
  `NNNNN-YYYY-INT/INICIALES`.

- [ ] **Step 1: `itemSchema` — agregar `codigo` y `diasEntrega`, quitar `fechaEntrega`/`grupo`/`personas`/`horas`/`tarifaHora`**

```js
const itemSchema = new mongoose.Schema(
  {
    descripcion: { type: String, required: true },
    subItems: [{ type: String, trim: true }],
    imagenes: [{ type: String }],
    codigo: { type: String, trim: true, default: "" },
    unidad: { type: String, default: "und" },
    cantidad: { type: Number, default: 0 },
    diasEntrega: { type: Number },
    precio: { type: Number, default: 0 },
    moneda: { type: String, enum: ["PEN", "USD"], default: "PEN" },
    descuento: { type: Number, default: 0 },
    subtotal: { type: Number },
    otGenerada: { type: mongoose.Schema.Types.ObjectId, ref: "OrdenTrabajo", default: null },
  },
  { _id: false }
);
```

(Se quitó el comentario de Gloria/Alicorp junto con los campos — ya no aplica.)

- [ ] **Step 2: Documento — agregar `rq`/`creadoPor`, quitar `titulo` y los 15 campos no usados**

Agregar, cerca de `atencion`:

```js
rq: { type: String, trim: true, default: "" },
creadoPor: { type: mongoose.Schema.Types.ObjectId, ref: "Usuario", default: null },
```

Quitar del schema (leer el archivo real antes de borrar — usar esta lista como checklist, no
como diff literal, porque el orden/formato exacto de cada línea puede variar):
`titulo` (con su `required: true`), `numeroCotizacion`, `asesorComercial`, `numeroCelular`,
`numeroSolicitudPedido`, `numeroPeticionOferta`, `tiempoGarantia`, `descuentoPorcentaje`,
`gastosGeneralesPorcentaje`, `utilidadPorcentaje`, `textoBreveServicio`, `area`, `omAviso`,
`numeroGuia`, `jefeSupervisorSolicitante`, `compradorResponsable`, `numeroGuiaEmision`,
`numeroGuiaRemision`.

**No tocar:** `codigo`, `numeroDocumento`, `anulado`/`motivoAnulacion`/`anuladoPor`/
`fechaAnulacion`, `estadoCadena`, `codigoSap`, `fechaSalida`, `tipo`, `empresa`,
`condicionPago`, `plazoEntrega`, `lugarEntrega`, `validezOferta`, `fecha`, `fechaRecibida`,
`moneda`, `items`, `subtotal`/`igv`/`total`, `encargado`, `planta`, `personaContacto`,
`aprobado`/`aprobadoPor`/`fechaAprobacion`, `enviado`/`enviadoPor`/`fechaEnvio`,
`informeEnviado`/`informeEnviadoPor`/`fechaInformeEnviado`.

- [ ] **Step 3: Reescribir el hook `pre("save")` para el nuevo formato de `codigo`**

Reemplazar el bloque completo del hook actual (busca `cotizacionSchema.pre("save"`) por:

```js
cotizacionSchema.pre("save", async function (next) {
  if (this.isNew) {
    if (!this.numeroDocumento) {
      this.numeroDocumento = await siguienteNumeroDocumento();
    }
    const correlativo = (await this.constructor.countDocuments({})) + 1;
    const anio = (this.fecha || new Date()).getFullYear();
    let iniciales = "";
    if (this.creadoPor) {
      const Usuario = mongoose.model("Usuario");
      const usuario = await Usuario.findById(this.creadoPor, "iniciales");
      iniciales = usuario?.iniciales || "";
    }
    this.codigo = `${String(correlativo).padStart(5, "0")}-${anio}-INT/${iniciales}`;
  }
  next();
});
```

- [ ] **Step 4: Verificar arranque limpio**

```powershell
$env:PORT=5041; node src/index.js
```

Matar el proceso al terminar.

- [ ] **Step 5: Commit**

```powershell
git add src/models/Cotizacion.js
git commit -m "feat: nuevo formato de Cotizacion para Intales (modelo)"
```

---

## Task 3: Backend — rutas de Cotización (`creadoPor` + endpoint de emisor)

**Files:**
- Modify: `Backend/src/routes/cotizaciones.js`

**Interfaces:**
- Produces: `POST /api/cotizaciones` setea `creadoPor` al usuario autenticado. `GET
  /api/cotizaciones` y `GET /api/cotizaciones/:id` (si existe — confirmar, el plan de copia
  original encontró que esta ruta puede no tener `GET /:id`) devuelven `creadoPor` populado
  con `nombre cargo correo telefono`. Nueva ruta `GET /api/cotizaciones/emisor` → `{ ruc,
  razonSocial }`.

- [ ] **Step 1: Leer `routes/cotizaciones.js` completo — confirmar el nombre real del campo de usuario autenticado**

`authMiddleware.js` deja al usuario logueado en algún campo de `req` (ej. `req.usuario` o
`req.user` — confirmar leyendo ese archivo, no asumir).

- [ ] **Step 2: En `POST /` (creación), setear `creadoPor`**

Ubicar dónde se arma el nuevo documento y agregar `creadoPor: req.<campo real>._id` (o
equivalente) antes de `.save()`.

- [ ] **Step 3: Agregar `.populate("creadoPor", "nombre cargo correo telefono")` a cada GET que devuelva cotizaciones completas**

Revisar cada `router.get(...)` del archivo — aplicar el populate donde el frontend necesite
armar el PDF (al menos donde se devuelve el detalle completo de una cotización).

- [ ] **Step 4: Nueva ruta de solo lectura para el emisor**

```js
import { getEmisor } from "../utils/emisorSunat.js";
```

```js
router.get("/emisor", (req, res) => {
  const { ruc, razonSocial } = getEmisor();
  res.json({ ruc, razonSocial });
});
```

Ubicarla junto a las demás rutas sin `:id`, antes de cualquier ruta con parámetro dinámico
(mismo criterio de orden que el resto del router). Si `RUC_EMISOR`/`RAZON_SOCIAL_EMISOR` no
están configuradas, `getEmisor()` lanza un error con `status: 500` y mensaje explicativo — el
error handler global ya propaga ese mensaje (ver fix del plan de copia original), así que no
hace falta un try/catch especial acá salvo que el resto del archivo ya envuelva sus rutas así
(seguir el patrón existente).

- [ ] **Step 5: Verificación aislada — smoke test real**

```powershell
$env:PORT=5041; node src/index.js
```

Firmar un JWT de prueba (patrón ya usado en todo este proyecto — `jwt.sign({...}, JWT_SECRET)`
sin loguearse de verdad), y:

```powershell
curl.exe http://localhost:5041/api/cotizaciones/emisor -H "Authorization: Bearer <token>"
```

Expected: `200` con `{ "ruc": "...", "razonSocial": "..." }` reales (los que ya están en
`.env`). Crear una Cotización de prueba vía `POST /api/cotizaciones` con el JWT y confirmar
que el `codigo` devuelto tiene el formato `NNNNN-YYYY-INT/...` (las iniciales pueden salir
vacías si el usuario de prueba no tiene `iniciales` seteadas — está bien, no es un error).
Limpiar el documento de prueba por su `_id` exacto. Matar el proceso al terminar.

- [ ] **Step 6: Commit**

```powershell
git add src/routes/cotizaciones.js
git commit -m "feat: creadoPor en Cotizacion + endpoint de emisor para el PDF"
```

---

## Task 4: Frontend — extraer los 5 logos de la plantilla Excel

**Files:**
- Create: `Frontend/public/assets/logos/intales_logo.png`
- Create: `Frontend/public/assets/logos/lexacaucho_logo.jpeg`
- Create: `Frontend/public/assets/logos/majuflex_logo.png`
- Create: `Frontend/public/assets/logos/rodilex_logo.png`
- Create: `Frontend/public/assets/logos/bcp_logo_intales.png`
- Modify: `Frontend/public/assets/logos/README.md`

**Interfaces:**
- Produces: 5 archivos de imagen listos para que Task 8 (rewrite de `cotizacionPdf.js`) los
  cargue vía `cargarImagen()` (ya existente, lee desde `/public` por URL, no por import).

- [ ] **Step 1: Extraer las imágenes embebidas del xlsx**

El archivo `formato-cotizacion-INTALES.xlsx` (raíz de `SIPAPP-INTALES`) es un ZIP — sus
imágenes viven en `xl/media/`. Extraerlas:

```powershell
cd C:\SIP-APP\SIPAPP-INTALES
Expand-Archive -Path "formato-cotizacion-INTALES.xlsx" -DestinationPath "$env:TEMP\cotizacion_xlsx" -Force
Get-ChildItem "$env:TEMP\cotizacion_xlsx\xl\media"
```

Expected: 5 archivos — `image1.png` (logo Intales), `image2.jpeg` (Lexacaucho), `image3.png`
(Majuflex), `image4.png` (Rodilex), `image5.png` (BCP). Confirmar visualmente cuál es cuál
antes de copiar (abrir cada uno) — el orden de `image1`...`image5` ya se confirmó en el
brainstorming de este plan, pero verificar de nuevo no cuesta nada.

- [ ] **Step 2: Copiar y renombrar a `public/assets/logos/`**

```powershell
Copy-Item "$env:TEMP\cotizacion_xlsx\xl\media\image1.png" "C:\SIP-APP\SIPAPP-INTALES\Frontend\public\assets\logos\intales_logo.png"
Copy-Item "$env:TEMP\cotizacion_xlsx\xl\media\image2.jpeg" "C:\SIP-APP\SIPAPP-INTALES\Frontend\public\assets\logos\lexacaucho_logo.jpeg"
Copy-Item "$env:TEMP\cotizacion_xlsx\xl\media\image3.png" "C:\SIP-APP\SIPAPP-INTALES\Frontend\public\assets\logos\majuflex_logo.png"
Copy-Item "$env:TEMP\cotizacion_xlsx\xl\media\image4.png" "C:\SIP-APP\SIPAPP-INTALES\Frontend\public\assets\logos\rodilex_logo.png"
Copy-Item "$env:TEMP\cotizacion_xlsx\xl\media\image5.png" "C:\SIP-APP\SIPAPP-INTALES\Frontend\public\assets\logos\bcp_logo_intales.png"
```

No borrar los logos viejos de Huaquian todavía (`logo_huaquian.jpg`, `huaquian_header.png`,
etc.) — quedan como código muerto hasta que una tarea futura los limpie explícitamente, no es
parte de este plan.

- [ ] **Step 3: Actualizar `public/assets/logos/README.md`**

Agregar una sección nueva documentando los 5 archivos agregados, mismo estilo que las
entradas existentes de Huaquian (qué representa cada uno, de dónde salió — de
`formato-cotizacion-INTALES.xlsx`, extraído el 2026-09-10 — y en qué archivo se usan
(`utils/cotizacionPdf.js`, ver Task 8 de este plan)).

- [ ] **Step 4: Commit**

```powershell
cd C:\SIP-APP\SIPAPP-INTALES\Frontend
git add public/assets/logos/
git commit -m "feat: agrega los 5 logos reales de Intales (extraidos de la plantilla de cotizacion)"
```

---

## Task 5: Frontend — perfil de Usuario (cargo/correo/teléfono/iniciales)

**Files:**
- Modify: `Frontend/src/pages/Usuarios.jsx`

**Interfaces:**
- Consumes: `Usuario` model ya extendido (Task 1).
- Produces: formulario de alta/edición de usuario con 4 inputs nuevos, enviados en el mismo
  payload que ya arma la pantalla.

- [ ] **Step 1: Leer `Usuarios.jsx` completo — confirmar el patrón de estado del formulario**

Este proyecto usa "un solo objeto `useState` + `handleChange` genérico" para formularios (regla
global del usuario) — confirmar que este archivo ya sigue ese patrón antes de agregar los 4
campos nuevos al mismo objeto de estado.

- [ ] **Step 2: Agregar 4 inputs (Cargo, Correo, Teléfono, Iniciales) al formulario**

Mismo estilo/estructura que los inputs de `nombre`/`usuario` ya existentes en el mismo
formulario — copiar el patrón visual exacto, solo cambiando el `name`/label.

- [ ] **Step 3: Confirmar que el payload de guardado (crear/editar usuario) incluye los 4 campos nuevos**

Si el payload se arma campo por campo (whitelist), agregar los 4 explícitamente. Si se manda
el objeto de estado completo, ya viajan solos.

- [ ] **Step 4: `npm run build`**

Confirmar que compila sin errores.

- [ ] **Step 5: Commit**

```powershell
git add src/pages/Usuarios.jsx
git commit -m "feat: cargo/correo/telefono/iniciales en el formulario de Usuarios"
```

---

## Task 6: Frontend — recorte del formulario de Cotización (3 superficies)

**Files:**
- Modify: `Frontend/src/components/DetalleCotizacion.jsx`
- Modify: `Frontend/src/components/ModalNuevaCotizacion.jsx`
- Modify: `Frontend/src/pages/Cotizaciones.jsx`

**Interfaces:**
- Consumes: `Cotizacion.rq` (Task 2), sigue usando `empresa`/`planta`/`personaContacto`/
  `atencion`/`fecha`/`moneda`/`condicionPago` tal cual ya existían.
- Produces: formulario reducido a exactamente: Empresa → Planta → Persona de contacto / Atención
  / RQ / Fecha (solo lectura) / Moneda / Forma de pago, sin ninguna rama Gloria/Alicorp.

- [ ] **Step 1: En los 3 archivos, ubicar y quitar toda rama `esGloria`/`esAlicorp`**

```powershell
cd C:\SIP-APP\SIPAPP-INTALES\Frontend
Select-String -Path "src\components\DetalleCotizacion.jsx","src\components\ModalNuevaCotizacion.jsx","src\pages\Cotizaciones.jsx" -Pattern "esGloria|esAlicorp|TablaItemsCotizacionGloria|TablaItemsCotizacionAlicorp"
```

Leer el contexto de cada match antes de borrar — quitar el condicional completo (imports,
renderizado condicional, y cualquier campo que solo existiera para esas ramas: `codigoSap`
usado como uno de los criterios de detección, `textoBreveServicio`, `gastosGeneralesPorcentaje`,
`utilidadPorcentaje`, etc. — cruzar contra la lista de campos eliminados del modelo en la
Task 2).

- [ ] **Step 2: Quitar del formulario los campos ya eliminados del modelo**

Cruzar contra la lista de la Task 2 (`titulo`, `numeroCotizacion`, `asesorComercial`,
`numeroCelular`, `numeroSolicitudPedido`, `numeroPeticionOferta`, `tiempoGarantia`, `area`,
`omAviso`, `numeroGuia`, `jefeSupervisorSolicitante`, `compradorResponsable`) — cualquier input
o referencia a estos en los 3 archivos se quita.

- [ ] **Step 3: Agregar el input de RQ**

Mismo patrón visual que el input de `atencion` ya existente (texto libre, mismo tipo de label).

- [ ] **Step 4: Confirmar/ajustar el campo "Tiempo de entrega" global**

Si alguno de los 3 archivos todavía muestra un input editable para `plazoEntrega` como "tiempo
de entrega" de la cotización completa, reemplazarlo por texto fijo "DÍAS HÁBILES" (no editable)
— o quitarlo del todo si el layout de la plantilla no lo necesita como campo de formulario,
solo como texto en el PDF (ver spec, sección "Formulario de Cotización"). Verificar contra el
archivo real antes de decidir cuál de las dos.

- [ ] **Step 5: `npm run build`**

Confirmar que compila.

- [ ] **Step 6: Commit**

```powershell
git add src/components/DetalleCotizacion.jsx src/components/ModalNuevaCotizacion.jsx src/pages/Cotizaciones.jsx
git commit -m "feat: recorta el formulario de Cotizacion al formato unico de Intales"
```

---

## Task 7: Frontend — columnas de ítem (Código, Días de entrega)

**Files:**
- Modify: `Frontend/src/components/TablaItemsCotizacion.jsx`

**Interfaces:**
- Consumes: `itemSchema.codigo`/`.diasEntrega` (Task 2).
- Produces: 2 columnas nuevas en la tabla de ítems; el gate `tipo==="venta"` sobre la imagen
  desaparece (con un solo formato, la imagen por ítem aplica siempre).

- [ ] **Step 1: Leer el archivo completo — ubicar la estructura actual de columnas**

Confirmar el orden real de columnas antes de insertar las nuevas (la spec sugiere Código antes
de Cantidad, y Días de entrega cerca de Precio Total, pero seguir el orden que ya tiene la
plantilla real: Código/Cant./U.M./Descripción/P.Unit./P.Total, con el tiempo de entrega
representado como fila aparte debajo de la descripción, no como columna — replicar esa
disposición en el formulario si es razonable, o al menos no contradecirla en el PDF de la
Task 8).

- [ ] **Step 2: Agregar input de Código (texto libre) por ítem**

Mismo patrón que el resto de inputs por ítem ya existentes (`descripcion`, `cantidad`, etc.) —
usar el `handleItem` genérico ya presente en el archivo (confirmado en el plan de copia
original que este archivo ya tiene ese helper).

- [ ] **Step 3: Agregar input numérico de Días de entrega por ítem**

`<input type="number" min="0" .../>`, mismo patrón de `handleItem`.

- [ ] **Step 4: Quitar el condicionamiento `tipo === "venta"` sobre el bloque de imagen**

El plan de copia original lo agregó porque en ese momento el único formato "venta" tenía
imagen y "servicio" no se había definido con imagen. Con un solo formato para todos los
clientes (decisión de este plan), la imagen por ítem aplica siempre — quitar el `if`/ternario
que lo condiciona, dejando el bloque de imagen igual para todos los `tipo`.

- [ ] **Step 5: `npm run build`**

- [ ] **Step 6: Commit**

```powershell
git add src/components/TablaItemsCotizacion.jsx
git commit -m "feat: columnas Codigo y Dias de entrega por item, imagen ya no depende de tipo"
```

---

## Task 8: Frontend — reescritura de `cotizacionPdf.js`

**Files:**
- Modify: `Frontend/src/utils/cotizacionPdf.js`
- Modify: `Frontend/src/pages/EmitirGuia.jsx`

**Interfaces:**
- Consumes: `GET /api/cotizaciones/emisor` (Task 3), `Cotizacion.creadoPor` populado (Task 3),
  `Cotizacion.rq`/`items[].codigo`/`items[].diasEntrega`/`items[].imagenes` (Task 2), los 5
  logos (Task 4).
- Produces: `exportarCotizacionPdf(cotizacion)` — misma firma que hoy, consumida sin cambios
  por `DetalleCotizacion.jsx`/`Cotizaciones.jsx`/`ModalCotizacion.jsx` (si sigue vivo, ver Step
  5).

Este es el archivo más grande de reescribir — leer la spec completa (sección "PDF") antes de
empezar, no solo este brief.

- [ ] **Step 1: Leer `cotizacionPdf.js` completo tal cual está hoy**

Entender su estructura real (imports, `cargarImagen()`, la constante `HUAQUIAN`, `BANCOS`,
`exportarCotizacionPdf`, y cómo usa `autoTable` para la tabla de ítems actual) antes de
reescribir nada — no asumir la estructura desde la spec, la spec describe el resultado
deseado, no necesariamente el código intermedio.

- [ ] **Step 2: Quitar la constante `HUAQUIAN`, reemplazar por una llamada a `GET /api/cotizaciones/emisor`**

`exportarCotizacionPdf` pasa a ser `async` si no lo era (revisar — probablemente ya lo es, dado
que usa `cargarImagen()` con promesas). Al principio de la función, hacer `fetchAuth("/cotizaciones/emisor")`
(usar el helper `fetchAuth` ya existente del proyecto, no un `fetch` crudo) y desestructurar
`{ ruc, razonSocial }`.

- [ ] **Step 3: Actualizar `BANCOS` con las cuentas reales de Intales**

```js
const BANCOS = {
  bcpCuentaDolares: "191-9134985-1-83",
  bcpCciDolares:    "002-191-009134985183-51",
  bcpCuentaSoles:   "191-9291696-0-12",
  bcpCciSoles:      "002-191-009291696012-50",
  bnCuentaDetraccion: "00-057-103825",
};
```

- [ ] **Step 4: Reescribir el layout completo del PDF**

Seguir la sección "PDF (`cotizacionPdf.js`) — reescritura completa" de la spec
(`docs/superpowers/specs/2026-09-10-cotizacion-intales-design.md`) punto por punto:
encabezado con los 5 logos (Intales + Lexacaucho + Majuflex + Rodilex, más BCP en el bloque
bancario del pie), bloque cliente (Señores/RUC/Dirección de la planta/Atención/RQ/Fecha), tabla
de ítems vía `autoTable` (Código/Cant./U.M./Descripción con sub-ítems/P.Unit./P.Total, con la
línea de "Tiempo de entrega: {diasEntrega} días hábiles" y la imagen del ítem debajo, solo si
`item.imagenes[0]` existe — usar `cargarImagen()` ya existente, que resuelve `null` sin romper
si la imagen falla), pie (Moneda con símbolo/Forma de pago/"Tiempo de entrega: DÍAS HÁBILES"
fijo, junto a Subtotal/IGV/Total ya calculados, más los 2 avisos fijos de validez de oferta y
condiciones de transporte), cierre (texto fijo "EN CASO DE SER FAVORECIDOS, GENERAR LA OC A
NOMBRE DE: {razonSocial} / RUC {ruc}" + firma dinámica de `cotizacion.creadoPor` — con
fallback razonable si `creadoPor` viene `null`, no debe crashear), bloque bancario con los
datos ya actualizados en el Step 3.

- [ ] **Step 5: Desacoplar `EmitirGuia.jsx` de la constante `HUAQUIAN` eliminada**

`EmitirGuia.jsx:6` importa `{ HUAQUIAN }` — reemplazar por una constante local dentro del
propio archivo:

```js
const INTALES_DOMICILIO = {
  direccion: "CAL. LAS FRAGUAS NRO. 190 URB. NARANJAL INDUSTRIAL, LIMA - LIMA - INDEPENDENCIA",
  ubigeo: "150112",
};
```

(valores reales, ya consultados contra SUNAT vía `apiperu.dev` durante el brainstorming de
este plan — ver spec). Actualizar los usos de `HUAQUIAN.direccion`/`HUAQUIAN.ubigeo` en ese
archivo para usar `INTALES_DOMICILIO` en su lugar.

- [ ] **Step 6: Confirmar si `ModalCotizacion.jsx` sigue vivo**

```powershell
Select-String -Path "src\**\*.jsx" -Pattern "ModalCotizacion" -Exclude "ModalCotizacion.jsx"
```

Si no hay ningún import real (ya se sospechaba código muerto desde la revisión final del plan
de copia original), dejarlo tal cual sin actualizar sus referencias a `HUAQUIAN` — un archivo
muerto no bloquea el build de todas formas (nada lo importa). Si SÍ apareciera algún import
real que antes se pasó por alto, actualizarlo igual que `EmitirGuia.jsx` en el Step 5.

- [ ] **Step 7: `npm run build`**

Confirmar que compila sin errores de import.

- [ ] **Step 8: Commit**

```powershell
git add src/utils/cotizacionPdf.js src/pages/EmitirGuia.jsx
git commit -m "feat: PDF de cotizacion con el formato real de Intales"
```

---

## Task 9: Frontend — borrar Gloria/Alicorp

**Files:**
- Delete: `Frontend/src/components/TablaItemsCotizacionGloria.jsx`
- Delete: `Frontend/src/components/TablaItemsCotizacionAlicorp.jsx`
- Delete: `Frontend/src/utils/cotizacionGloriaPdf.js`
- Delete: `Frontend/src/utils/cotizacionAlicorpPdf.js`
- Modify: `Frontend/src/utils/cotizacionItems.js`

**Interfaces:**
- Consumes: Task 6 ya quitó toda referencia a estos componentes/branches desde
  `DetalleCotizacion.jsx`/`ModalNuevaCotizacion.jsx`/`Cotizaciones.jsx` — este task solo borra
  los archivos que quedaron sin ningún consumidor.

- [ ] **Step 1: Confirmar que no queda ninguna referencia antes de borrar**

```powershell
cd C:\SIP-APP\SIPAPP-INTALES\Frontend
Select-String -Path "src\**\*.jsx","src\**\*.js" -Pattern "TablaItemsCotizacionGloria|TablaItemsCotizacionAlicorp|cotizacionGloriaPdf|cotizacionAlicorpPdf"
```

Expected: cero matches fuera de los propios archivos a borrar (si Task 6 se hizo bien, ya no
hay imports). Si aparece algo inesperado, DETENERSE y reportar — no borrar un archivo que
todavía tiene un consumidor real.

- [ ] **Step 2: Borrar los 4 archivos**

```powershell
Remove-Item "src\components\TablaItemsCotizacionGloria.jsx"
Remove-Item "src\components\TablaItemsCotizacionAlicorp.jsx"
Remove-Item "src\utils\cotizacionGloriaPdf.js"
Remove-Item "src\utils\cotizacionAlicorpPdf.js"
```

- [ ] **Step 3: Limpiar `cotizacionItems.js` — quitar funciones Gloria-específicas**

Leer el archivo completo, ubicar y quitar `calcularGloria`, `calcSubtotalGloria`, y cualquier
otra función que solo exista para procesar `grupo`/`personas`/`horas`/`tarifaHora` (campos ya
eliminados del modelo en la Task 2). Dejar intactas las funciones genéricas (`itemVacioVenta`,
`itemDesdeDb`, etc., ya mencionadas en el plan de copia original) — solo tocar lo
Gloria-específico.

- [ ] **Step 4: `npm run build`**

Confirmar que compila sin errores de import (la ausencia de los 4 archivos borrados no debe
romper nada, dado el Step 1).

- [ ] **Step 5: Commit**

```powershell
git add -A
git commit -m "chore: borra los formatos Gloria y Alicorp (inalcanzables para Intales)"
```

---

## Task 10: Verificación end-to-end

**Files:** (ninguno nuevo — verificación pura, no se commitea)

- [ ] **Step 1: Levantar backend aislado (puerto distinto de 5000, nunca el del usuario) + frontend real**

```powershell
cd C:\SIP-APP\SIPAPP-INTALES\Backend
$env:PORT=5041; node src/index.js
```
```powershell
cd C:\SIP-APP\SIPAPP-INTALES\Frontend
npm run dev
```

- [ ] **Step 2: Recorrido manual real en navegador**

Login con un usuario admin real (el creado en el plan de copia original, o uno nuevo si hace
falta). Editar el perfio del usuario logueado para cargarle cargo/correo/teléfono/iniciales
(Task 5). Crear una Empresa con al menos una planta y un contacto (si el flujo de creación de
Empresa sigue bloqueado por `APIPERU_TOKEN` como se documentó en el plan de copia original,
usar el mismo workaround que se usó ahí — API directa — dado que el token ya está cargado
ahora, probar primero si el flujo normal de UI ya funciona). Crear una Cotización: confirmar
que el formulario muestra exactamente Empresa/Planta/Contacto/Atención/RQ/Fecha/Moneda/Forma
de pago, sin nada de Gloria/Alicorp. Agregar un ítem con Código, Cantidad, U.M., Descripción,
Precio Unitario, Días de entrega, y subir una imagen. Guardar. Confirmar que el `codigo`
generado tiene el formato `NNNNN-{año}-INT/{iniciales}`. Exportar el PDF y revisar visualmente
que calza con la plantilla: 4 logos arriba, datos del cliente, tabla de ítems con el tiempo de
entrega y la imagen debajo de cada uno, pie con moneda/forma de pago/subtotal/igv/total, firma
con el nombre/cargo/correo/teléfono del usuario logueado, y el bloque bancario con el logo BCP.

- [ ] **Step 3: Revisar la consola del navegador en cada paso** — cero errores nuevos.

- [ ] **Step 4: Limpieza**

Anular y luego borrar por `_id` exacto la Cotización y la Empresa de prueba (mismo patrón ya
usado en el plan de copia original — anular vía API, luego hard-delete directo por Mongoose si
la ruta no expone un DELETE real). Matar ambos procesos (backend y `npm run dev`). Confirmar
que no queda ningún archivo de imagen de prueba huérfano en `Backend/uploads/cotizaciones/`.

---

## Self-Review

**Spec coverage:**
- Modelo `Usuario` (+4 campos) → Task 1.
- Modelo `Cotizacion` (campos + nuevo `codigo`) → Task 2.
- `creadoPor` + endpoint de emisor → Task 3.
- 5 logos reales → Task 4.
- Formulario de Usuario → Task 5.
- Formulario de Cotización recortado + RQ → Task 6.
- Columnas Código/Días de entrega + imagen sin gate de `tipo` → Task 7.
- PDF completo + desacople de `EmitirGuia.jsx` → Task 8.
- Borrado de Gloria/Alicorp → Task 9.
- Verificación real → Task 10.

**Placeholder scan:** los únicos puntos donde el plan pide "leer el archivo real antes de
decidir" (Task 1 Step 2, Task 3 Step 1, Task 6 Step 4, Task 7 Step 1) son casos donde el
código real no se leyó al escribir este plan — están marcados explícitamente como
verificaciones a hacer, no como pasos a adivinar a ciegas, siguiendo el mismo patrón que ya
funcionó bien en el plan de copia original.

**Consistencia de tipos:** `codigo`/`diasEntrega` por ítem, `rq`/`creadoPor` a nivel
documento, y `ruc`/`razonSocial` del endpoint de emisor se nombran igual en todas las tareas
que los tocan (Backend y Frontend).
