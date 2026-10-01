# Centro de Costo + Notificación de Trabajo — Design Spec

**Contexto:** El cliente pidió poder ver, por Orden de Trabajo, el costo real de fabricación
desglosado por centro de costo — hoy la cadena Cotización→OT→Requerimientos/Servicios
Externos→OC→Factura ya captura compras de material y servicios de terceros, pero no hay forma
de cargar horas hombre (HH) ni horas máquina (HM), ni de comparar el costo interno total contra
lo que se factura (la OC) para ver el margen real de una OT. Este spec diseña esa segunda
dimensión de costo, construida a partir de una sesión de brainstorming con el usuario
(2026-09-16/22) — ver decisiones confirmadas abajo, ya cerradas, no re-discutir en la
implementación.

**Alcance:** Un sub-proyecto coherente: 2 catálogos nuevos (`CentroCosto`, `Maquina`), 1 campo
nuevo en `Usuario` (`tarifaHora`), 1 documento nuevo en la cadena (`NotificacionTrabajo`), 2
campos nuevos de etiquetado en `Requerimiento`/`ServicioExterno` (`centroCosto`, autoasignado),
y un card de reporte (OC vs costo de fabricación) en el detalle de la OT.

## Decisiones confirmadas con el usuario (2026-09-16/22)

1. **`CentroCosto` es un catálogo real y editable** (no un enum hardcodeado) — arranca con 4
   valores semilla: "Compras Materiales" (`tipo: "material"`), "Servicios Externos"
   (`tipo: "servicio"`), "HH" (`tipo: "hh"`), "HM" (`tipo: "hm"`). El campo `tipo` es interno,
   sirve para que el backend autoasigne el centro correcto sin mostrar un selector.
2. **Autoasignado en todos lados, sin selector visible** — ni en `ModalRequerimiento.jsx`, ni en
   `ModalServicioExterno.jsx`, ni en el form de Notificación de Trabajo. El selector se agrega
   más adelante SOLO si el catálogo llega a tener más de un centro por `tipo` (no ahora).
3. **Tarifa de horas hombre**: NO es insertable a mano en el momento de registrar — vive en un
   campo nuevo `Usuario.tarifaHora`, mantenido exclusivamente por **jefatura** (+admin como
   excepción, mismo criterio que el resto del proyecto). El "recurso" de horas hombre es un
   `Usuario` real (rol técnico), NO el catálogo separado `Personal.js` — confirmado leyendo
   `ModalRequerimiento.jsx`/`routes/usuarios.js`: "Solicitado por" ya se llena desde
   `GET /usuarios/lista`, filtrando por rol técnico, no desde `/personal`. `Personal.js` queda
   fuera de este spec, no se toca.
4. **Tarifa de horas máquina**: sale de un catálogo nuevo `Maquina` (`nombre` + `tarifaHora`),
   también mantenido por **jefatura** (+admin).
5. **Snapshot, no referencia viva**: `RegistroHoras`/ítems de `NotificacionTrabajo` copian la
   tarifa vigente al momento de guardar — si jefatura sube una tarifa después, no cambia el
   costo de notificaciones ya guardadas. Mismo criterio que
   `Requerimiento.items[].montoUnitario` (copiado de la Empresa elegida en "Procesar solicitud",
   ver `routes/requerimientos.js`).
6. **Quién carga las horas**: el **supervisor** (+admin) — elige técnico(s)/máquina(s) usados y
   la cantidad de horas de cada uno. No elige centro de costo ni tarifa (autoasignados/
   auto-calculados).
7. **Granularidad del centro de costo**: por LÍNEA/ítem, no una sola vez por OT — una OT puede
   tener ítems de material, de servicio, y de horas de varios técnicos/máquinas distintos, cada
   uno con su propio centro (aunque hoy, por la decisión #2, todos los ítems de un mismo tipo
   caen en el mismo centro).
8. **Reconocimiento de costo** (afecta el cálculo del reporte, no el guardado):
   - **HH y HM cuentan apenas se notifica** (inmediato, sin gate de pago — es trabajo interno ya
     incurrido, no hay pago a terceros de por medio).
   - **Compras de material y Servicios Externos solo cuentan cuando llegan a
     `estadoPago: "pagado"`** — no en `"por_procesar"` ni `"pendiente_pago"`. Antes de eso es un
     compromiso, no un costo realizado.
9. **"Notificación de Trabajo"** es un documento nuevo en la cadena — card en el panel de
   Relaciones de la OT (`DetalleOrdenTrabajo.jsx`/`DetalleSubOT.jsx`), junto a
   Cotización/OT/Informe/OC/Factura/GRE. Visible para **todos los roles menos técnico** (mismo
   criterio que `TablaServiciosExternos`, ver `puedeVerServicios`).
10. **Ciclo de vida de `NotificacionTrabajo`**:
    - El supervisor arma la notificación (agrega líneas de técnico/máquina + horas) en el
      cliente, sin persistir nada hasta apretar "Guardar".
    - Al guardar (`POST`), `estado` queda `"cerrada"` automáticamente — ya no es editable por el
      supervisor.
    - Solo **jefatura** (+admin) puede `PATCH /:id/abrir` → pasa a `"abierta"`; a partir de ahí
      el **supervisor** retoma la edición (agrega/corrige líneas) hasta volver a guardar.
    - **No hay `anulado` a nivel de documento completo** — la anulación es **por línea/ítem**:
      solo **jefatura** (+admin) puede `PATCH /:id/items/:itemId/anular` (con motivo). Esa línea
      queda excluida del cálculo del reporte; el resto de la notificación sigue contando, sin
      importar si el documento está `"abierta"` o `"cerrada"`.
11. **Card "Reporte"** en el detalle de la OT: visible solo para **jefatura** y **vendedor**.
    Compara `OC.subtotal` (sin IGV — no `OC.total`, para no mezclar un lado con IGV y el otro
    sin) contra el costo de fabricación (HH + HM + materiales pagados + servicios pagados). Si
    la OC está en USD (la OC ya hereda `moneda` de su cotización, ver spec/sesión anterior de
    este mismo proyecto), el costo interno (siempre en S/) se convierte a US$ con el Tipo de
    Cambio compartido (mismo que ya usan `ListaOrdenesCompra.jsx`/`ListaCotizaciones.jsx`) antes
    de comparar. Card compacto (Margen S/ o US$ y %) que al hacer click abre un modal con el
    desglose por categoría.

## Cambios de modelo — Backend

### `src/models/CentroCosto.js` (nuevo)

```js
import mongoose from "mongoose";

const centroCostoSchema = new mongoose.Schema(
  {
    nombre: { type: String, required: true, trim: true },
    // Uso interno — permite autoasignar el centro correcto sin mostrar un
    // selector en los formularios (ver spec, decisión #2). No se expone
    // como algo que el usuario final elija directamente.
    tipo: { type: String, enum: ["material", "servicio", "hh", "hm"], required: true },
    activo: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export default mongoose.model("CentroCosto", centroCostoSchema);
```

**Seed inicial** (agregar a `Backend/seed.js`, siguiendo el patrón ya establecido de ese
archivo — revisar su forma real antes de asumir cómo inserta catálogos, no adivinar):
4 documentos, uno por cada `tipo`, con nombre "Compras Materiales"/"Servicios Externos"/"HH"/
"HM" respectivamente.

### `src/models/Maquina.js` (nuevo)

```js
import mongoose from "mongoose";

const maquinaSchema = new mongoose.Schema(
  {
    nombre: { type: String, required: true, trim: true },
    tarifaHora: { type: Number, default: 0 },
    activo: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export default mongoose.model("Maquina", maquinaSchema);
```

### `src/models/Usuario.js` — agregar campo

Junto a `iniciales`:
```js
// Costo por hora de este usuario cuando trabaja como técnico en una OT —
// mantenido exclusivamente por jefatura/admin, ver PATCH /usuarios/:id/tarifa-hora.
// Snapshot al registrar horas (RegistroHoras/NotificacionTrabajo), no referencia viva.
tarifaHora: { type: Number, default: 0 },
```

### `src/models/NotificacionTrabajo.js` (nuevo)

```js
import mongoose from "mongoose";
import Empresa from "./Empresa.js"; // no se usa acá — placeholder eliminado si no hace falta

const itemNotificacionSchema = new mongoose.Schema(
  {
    tipo: { type: String, enum: ["hombre", "maquina"], required: true },
    // Ref condicional por `tipo` — Usuario si "hombre", Maquina si "maquina".
    // Mongoose no valida el tipo de ref dinámicamente; la ruta debe verificar
    // que el `recurso` exista en la colección correcta antes de guardar.
    recurso: { type: mongoose.Schema.Types.ObjectId, required: true },
    recursoNombre: { type: String, default: "" }, // snapshot legible, evita un populate roto si se borra el recurso
    centroCosto: { type: mongoose.Schema.Types.ObjectId, ref: "CentroCosto" },
    horas: { type: Number, required: true, min: 0.01 },
    tarifaHora: { type: Number, required: true }, // snapshot
    costoTotal: { type: Number, required: true }, // horas * tarifaHora, calculado en la ruta
    anulado: { type: Boolean, default: false },
    motivoAnulacion: { type: String, default: "" },
    anuladoPor: { type: String, default: "" },
    fechaAnulacion: { type: Date, default: null },
  },
  { _id: true }
);

const notificacionTrabajoSchema = new mongoose.Schema(
  {
    codigo: { type: String, unique: true },
    ordenTrabajo: { type: mongoose.Schema.Types.ObjectId, ref: "OrdenTrabajo", required: true },
    fecha: { type: Date, default: Date.now },
    items: [itemNotificacionSchema],
    estado: { type: String, enum: ["abierta", "cerrada"], default: "cerrada" },
    registradoPor: { type: String, default: "" },
  },
  { timestamps: true }
);

notificacionTrabajoSchema.pre("save", async function (next) {
  if (this.isNew && !this.codigo) {
    const ultimo = await this.constructor.findOne({ codigo: /^NT-/ }).sort({ _id: -1 });
    const num = ultimo?.codigo ? parseInt(ultimo.codigo.split("-")[1]) + 1 : 1;
    this.codigo = `NT-${String(num).padStart(4, "0")}`;
  }
  next();
});

export default mongoose.model("NotificacionTrabajo", notificacionTrabajoSchema);
```

Quitar el `import Empresa` de arriba si al implementar no termina haciendo falta (se dejó como
recordatorio de que NO se necesita, para que el implementador no lo agregue por reflejo copiando
otros modelos de la cadena).

**Sobre `recurso`/`recursoNombre`**: como el `ref` depende de `tipo` (Usuario vs Maquina), un
`.populate()` directo no funciona igual que en el resto del proyecto — o se usa
`refPath`/`Schema.Types.ObjectId` con populate manual en la ruta (dos populates condicionales
según `item.tipo`), o se resuelve en la propia ruta antes de responder (como ya hace
`adjuntarStock()` en `routes/requerimientos.js` para inyectar `stock` sobre documentos
poblados). `recursoNombre` es el fallback legible para la UI sin depender de que el populate
funcione.

### `src/models/Requerimiento.js` — agregar campo a `itemRequerimientoSchema`

```js
// Autoasignado al crear — nunca se muestra en ModalRequerimiento.jsx (ver
// spec, decisión #2). Sirve para que el reporte de costo por OT pueda sumar
// "Compras Materiales" sin tener que inferirlo de otro lado.
centroCosto: { type: mongoose.Schema.Types.ObjectId, ref: "CentroCosto", default: null },
```

### `src/models/ServicioExterno.js` — agregar campo a nivel de documento

```js
centroCosto: { type: mongoose.Schema.Types.ObjectId, ref: "CentroCosto", default: null },
```

## Cambios de rutas — Backend

### `src/routes/centrosCosto.js` (nuevo) — catálogo simple

`GET /` (cualquier usuario autenticado, para poblar selects/reportes), `POST /` y
`PUT /:id` (activo/inactivo, editar nombre) restringidos a `admin`. No se expone `DELETE` — se
desactiva (`activo: false`), mismo patrón que `Personal`/`CategoriaMaterial`.

### `src/routes/maquinas.js` (nuevo) — catálogo con tarifa

`GET /` (cualquier usuario autenticado). `POST /` y `PUT /:id` restringidos a
`["admin", "jefatura"]` — acá SÍ incluye la tarifa, a diferencia de `centrosCosto.js`.

### `src/routes/usuarios.js` — nueva ruta acotada

```js
const puedeEditarTarifa = (req, res, next) => {
  if (!["admin", "jefatura"].includes(req.usuario.rol)) {
    return res.status(403).json({ mensaje: "No tienes permiso para editar tarifas." });
  }
  next();
};

router.patch("/:id/tarifa-hora", puedeEditarTarifa, async (req, res, next) => {
  try {
    const tarifaHora = Number(req.body.tarifaHora);
    if (isNaN(tarifaHora) || tarifaHora < 0) {
      return res.status(400).json({ mensaje: "Ingresa una tarifa válida." });
    }
    const usuario = await Usuario.findByIdAndUpdate(
      req.params.id,
      { tarifaHora },
      { new: true, select: "-password" }
    );
    if (!usuario) return res.status(404).json({ mensaje: "Usuario no encontrado" });
    res.json(usuario);
  } catch (err) { next(err); }
});
```

Deliberadamente **no** se amplía el gate `soloAdmin` de `GET /`/`POST /`/`PUT /:id` existentes
— jefatura sigue sin poder crear/editar cuentas de usuario completas, solo esta tarifa puntual.
También agregar `tarifaHora` a la proyección de `GET /lista` (hoy `"nombre rol"`) para que el
selector de técnicos en la Notificación de Trabajo pueda mostrar/usar la tarifa sin una segunda
consulta — revisar si conviene devolverla solo cuando el rol del que consulta es
`admin`/`jefatura`/`supervisor` (los únicos que la necesitan) o si no vale la pena filtrar.

### `src/routes/requerimientos.js` — autoasignar centro de costo al crear

En `POST /`, antes de `new Requerimiento(body).save()`: buscar
`await CentroCosto.findOne({ tipo: "material", activo: true })` y, si existe, asignarlo a
`item.centroCosto` de cada ítem de `esSolicitudCompra` (los de stock no aplican — no son una
compra). Si no existe (catálogo vacío/no sembrado todavía), no debe romper el guardado —
dejar `centroCosto: null` y seguir. Import nuevo: `import CentroCosto from "../models/CentroCosto.js";`.

### `src/routes/serviciosExternos.js` — autoasignar centro de costo al crear

Mismo patrón en `POST /`: `await CentroCosto.findOne({ tipo: "servicio", activo: true })`,
asignar a `centroCosto` del documento nuevo antes de `.save()`.

### `src/routes/notificacionesTrabajo.js` (nuevo)

Nombre de archivo/ruta (`/notificaciones-trabajo`) deliberadamente distinto de
`routes/notificaciones.js` (que ya existe — es el sistema de campana/alertas,
`notificar`/`notificarAlerta`, un concepto completamente distinto). No confundir los dos.

```js
import { Router } from "express";
import mongoose from "mongoose";
import authMiddleware from "../middleware/authMiddleware.js";
import NotificacionTrabajo from "../models/NotificacionTrabajo.js";
import CentroCosto from "../models/CentroCosto.js";
import Usuario from "../models/Usuario.js";
import Maquina from "../models/Maquina.js";
import OrdenTrabajo from "../models/OrdenTrabajo.js";
import { notificar, notificarAlerta } from "../utils/notificar.js";

const router = Router();
router.use(authMiddleware);

const puedeCrear = (req, res, next) => {
  if (!["supervisor", "admin"].includes(req.usuario.rol)) {
    return res.status(403).json({ mensaje: "No tienes permiso para notificar trabajo." });
  }
  next();
};

const puedeGestionar = (req, res, next) => {
  if (!["jefatura", "admin"].includes(req.usuario.rol)) {
    return res.status(403).json({ mensaje: "Solo Jefatura puede hacer esto." });
  }
  next();
};

// Ver la lista/detalle: todos menos técnico (ver spec, decisión #9) — mismo
// criterio que puedeVer en routes/serviciosExternos.js.
const puedeVer = (req, res, next) => {
  if (["tecnico", "tecnico_prueba", "tecnico_intervencion"].includes(req.usuario.rol)) {
    return res.status(403).json({ mensaje: "No tienes permiso para ver las notificaciones de trabajo." });
  }
  next();
};
router.use(puedeVer);

router.get("/", async (req, res, next) => {
  try {
    const { ordenTrabajo, ordenTrabajoPadre } = req.query;
    let filtro = {};
    if (ordenTrabajoPadre) {
      const subs = await OrdenTrabajo.find({ ordenPadre: ordenTrabajoPadre }, "_id");
      filtro = { ordenTrabajo: { $in: [ordenTrabajoPadre, ...subs.map((s) => s._id)] } };
    } else if (ordenTrabajo) {
      filtro = { ordenTrabajo };
    }
    const notificaciones = await NotificacionTrabajo.find(filtro).sort({ createdAt: -1 });
    res.json(notificaciones);
  } catch (err) { next(err); }
});

router.post("/", puedeCrear, async (req, res, next) => {
  try {
    const { ordenTrabajo, items } = req.body;
    if (!ordenTrabajo) return res.status(400).json({ mensaje: "Falta la Orden de Trabajo" });
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ mensaje: "Agrega al menos una línea de horas" });
    }

    const ot = await OrdenTrabajo.findById(ordenTrabajo, "anulado numeroOT");
    if (!ot) return res.status(404).json({ mensaje: "Orden de Trabajo no encontrada" });
    if (ot.anulado) return res.status(400).json({ mensaje: "No se puede notificar trabajo en una OT anulada" });

    const [centroHH, centroHM] = await Promise.all([
      CentroCosto.findOne({ tipo: "hh", activo: true }),
      CentroCosto.findOne({ tipo: "hm", activo: true }),
    ]);

    const itemsResueltos = [];
    for (const it of items) {
      if (!it.horas || it.horas <= 0) return res.status(400).json({ mensaje: "Todas las líneas necesitan horas válidas" });
      if (it.tipo === "hombre") {
        const usuario = await Usuario.findById(it.recurso, "nombre tarifaHora");
        if (!usuario) return res.status(404).json({ mensaje: "Técnico no encontrado" });
        itemsResueltos.push({
          tipo: "hombre", recurso: usuario._id, recursoNombre: usuario.nombre,
          centroCosto: centroHH?._id || null,
          horas: Number(it.horas), tarifaHora: usuario.tarifaHora || 0,
          costoTotal: Number(it.horas) * (usuario.tarifaHora || 0),
        });
      } else if (it.tipo === "maquina") {
        const maquina = await Maquina.findById(it.recurso, "nombre tarifaHora");
        if (!maquina) return res.status(404).json({ mensaje: "Máquina no encontrada" });
        itemsResueltos.push({
          tipo: "maquina", recurso: maquina._id, recursoNombre: maquina.nombre,
          centroCosto: centroHM?._id || null,
          horas: Number(it.horas), tarifaHora: maquina.tarifaHora || 0,
          costoTotal: Number(it.horas) * (maquina.tarifaHora || 0),
        });
      } else {
        return res.status(400).json({ mensaje: `Tipo de línea inválido: ${it.tipo}` });
      }
    }

    const notificacion = await new NotificacionTrabajo({
      ordenTrabajo, items: itemsResueltos, estado: "cerrada",
      registradoPor: req.usuario.nombre,
    }).save();
    await notificar(req, { accion: "Notificó", entidad: "trabajo en", codigo: notificacion.codigo });
    await notificarAlerta(req, `Usuario ${req.usuario.nombre} notificó trabajo (${notificacion.codigo}) en la OT ${ot.numeroOT || "—"}`);
    res.status(201).json(notificacion);
  } catch (err) { next(err); }
});

// Jefatura reabre — el supervisor retoma la edición después (ver PUT /:id).
router.patch("/:id/abrir", puedeGestionar, async (req, res, next) => {
  try {
    const notificacion = await NotificacionTrabajo.findByIdAndUpdate(
      req.params.id, { estado: "abierta" }, { new: true }
    );
    if (!notificacion) return res.status(404).json({ mensaje: "Notificación no encontrada" });
    await notificar(req, { accion: "Reabrió", entidad: "la Notificación de trabajo", codigo: notificacion.codigo });
    res.json(notificacion);
  } catch (err) { next(err); }
});

// El supervisor edita SOLO si estado === "abierta" — reusa la misma lógica
// de resolución de tarifa que POST / (duplicada a propósito, ver nota abajo).
router.put("/:id", puedeCrear, async (req, res, next) => {
  try {
    const existente = await NotificacionTrabajo.findById(req.params.id);
    if (!existente) return res.status(404).json({ mensaje: "Notificación no encontrada" });
    if (existente.estado !== "abierta") {
      return res.status(400).json({ mensaje: "Esta notificación está cerrada — pídele a Jefatura que la reabra." });
    }
    const { items } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ mensaje: "Agrega al menos una línea de horas" });
    }

    const [centroHH, centroHM] = await Promise.all([
      CentroCosto.findOne({ tipo: "hh", activo: true }),
      CentroCosto.findOne({ tipo: "hm", activo: true }),
    ]);

    const itemsResueltos = [];
    for (const it of items) {
      // Línea ya existente y ya anulada: se preserva tal cual, no se recalcula.
      if (it._id && existente.items.id(it._id)?.anulado) {
        itemsResueltos.push(existente.items.id(it._id).toObject());
        continue;
      }
      if (!it.horas || it.horas <= 0) return res.status(400).json({ mensaje: "Todas las líneas necesitan horas válidas" });
      if (it.tipo === "hombre") {
        const usuario = await Usuario.findById(it.recurso, "nombre tarifaHora");
        if (!usuario) return res.status(404).json({ mensaje: "Técnico no encontrado" });
        itemsResueltos.push({
          _id: it._id, tipo: "hombre", recurso: usuario._id, recursoNombre: usuario.nombre,
          centroCosto: centroHH?._id || null,
          horas: Number(it.horas), tarifaHora: usuario.tarifaHora || 0,
          costoTotal: Number(it.horas) * (usuario.tarifaHora || 0),
        });
      } else if (it.tipo === "maquina") {
        const maquina = await Maquina.findById(it.recurso, "nombre tarifaHora");
        if (!maquina) return res.status(404).json({ mensaje: "Máquina no encontrada" });
        itemsResueltos.push({
          _id: it._id, tipo: "maquina", recurso: maquina._id, recursoNombre: maquina.nombre,
          centroCosto: centroHM?._id || null,
          horas: Number(it.horas), tarifaHora: maquina.tarifaHora || 0,
          costoTotal: Number(it.horas) * (maquina.tarifaHora || 0),
        });
      } else {
        return res.status(400).json({ mensaje: `Tipo de línea inválido: ${it.tipo}` });
      }
    }

    existente.items = itemsResueltos;
    existente.estado = "cerrada"; // vuelve a cerrarse sola al guardar, igual que la creación
    await existente.save();
    await notificar(req, { accion: "Editó", entidad: "la Notificación de trabajo", codigo: existente.codigo });
    res.json(existente);
  } catch (err) { next(err); }
});

// Anular UNA línea — no el documento completo (ver spec, decisión #10).
router.patch("/:id/items/:itemId/anular", puedeGestionar, async (req, res, next) => {
  try {
    const motivo = String(req.body.motivo || "").trim();
    if (!motivo) return res.status(400).json({ mensaje: "El motivo de anulación es obligatorio" });

    const notificacion = await NotificacionTrabajo.findById(req.params.id);
    if (!notificacion) return res.status(404).json({ mensaje: "Notificación no encontrada" });
    const item = notificacion.items.id(req.params.itemId);
    if (!item) return res.status(404).json({ mensaje: "Línea no encontrada" });
    if (item.anulado) return res.status(400).json({ mensaje: "Esta línea ya está anulada" });

    item.anulado = true;
    item.motivoAnulacion = motivo;
    item.anuladoPor = req.usuario.nombre;
    item.fechaAnulacion = new Date();
    await notificacion.save();
    await notificar(req, { accion: "Anuló una línea de", entidad: "la Notificación de trabajo", codigo: notificacion.codigo });
    res.json(notificacion);
  } catch (err) { next(err); }
});

export default router;
```

**Nota sobre duplicación POST/PUT**: la resolución de tarifa/centro se repite en ambas rutas a
propósito (mismo criterio que otras rutas de este proyecto que no comparten un helper para esto
— ver `routes/requerimientos.js`, que tampoco extrae esa lógica) — si el implementador prefiere
extraer un helper `resolverItemsNotificacion(items, centroHH, centroHM)` para no repetir ~25
líneas, es una mejora aceptable, no un requisito del spec.

**Registrar en `src/index.js`**: agregar el `app.use("/api/notificaciones-trabajo", ...)`, el
`app.use("/api/centros-costo", ...)` y el `app.use("/api/maquinas", ...)` junto al resto de
rutas montadas — revisar el archivo real para el estilo exacto (algunas rutas llevan
`authMiddleware` importado en el propio archivo de rutas en vez de montado en `index.js`, seguir
el patrón ya usado por `routes/requerimientos.js`/`routes/serviciosExternos.js`, que sí lo hacen
así).

## Reporte por OT — cálculo (Frontend, sin endpoint backend nuevo)

Mismo criterio que el resto del proyecto (`Dashboard.jsx`, `ListaOrdenesCompra.jsx`): el cálculo
se arma en el cliente a partir de listas ya fetcheadas, no un endpoint de agregación aparte.

En `DetalleOrdenTrabajo.jsx` (donde ya se resuelve `oc` vía `cargarRelaciones()`), agregar el
fetch de `/notificaciones-trabajo?ordenTrabajoPadre=` (mismo patrón que servicios/informes) y
calcular:

```js
const costoHH = notificaciones.flatMap(n => n.items)
  .filter(it => it.tipo === "hombre" && !it.anulado)
  .reduce((s, it) => s + it.costoTotal, 0);
const costoHM = notificaciones.flatMap(n => n.items)
  .filter(it => it.tipo === "maquina" && !it.anulado)
  .reduce((s, it) => s + it.costoTotal, 0);
// Requerimientos: solo ítems de compra YA PAGADOS.
const costoMateriales = requerimientos.flatMap(r => r.items)
  .filter(it => it.esSolicitudCompra && it.estadoPago === "pagado")
  .reduce((s, it) => s + (Number(it.montoUnitario) || 0) * (Number(it.cantidad) || 0) + (Number(it.costoTransporte) || 0), 0);
// ServicioExterno: solo los YA PAGADOS.
const costoServicios = servicios.filter(s => s.estadoPago === "pagado" && !s.anulado)
  .reduce((s, v) => s + (Number(v.costo) || 0) * (Number(v.cantidad) || 0) + (Number(v.costoTransporte) || 0), 0);

const costoFabricacionPEN = costoHH + costoHM + costoMateriales + costoServicios;
// Conversión a la moneda de la OC (ver spec, decisión #11) — mismo tipoCambio
// compartido que ya usan ListaOrdenesCompra.jsx/ListaCotizaciones.jsx.
const costoFabricacion = oc?.moneda === "USD" && tipoCambio > 0
  ? costoFabricacionPEN / tipoCambio
  : costoFabricacionPEN;

const ocSubtotal = Number(oc?.subtotal) || 0;
const margen = ocSubtotal - costoFabricacion;
const margenPct = ocSubtotal > 0 ? (margen / ocSubtotal) * 100 : null;
```

**Ojo con el `costo` de `montoUnitario`**: revisar el modelo real de `Requerimiento.items` antes
de asumir si `montoUnitario` ya incluye la cantidad o es unitario puro (el nombre sugiere
unitario — multiplicar por `cantidad`, como está arriba, pero confirmar contra
`routes/requerimientos.js`/`ModalProcesarSolicitud.jsx` antes de implementar el cálculo). Mismo
cuidado con `ServicioExterno.costo` (¿unitario o total? el campo `cantidad` ya existe en el
modelo — confirmar el mismo criterio).

## Cambios — Frontend

### Catálogos nuevos (páginas admin)

- **`src/pages/CentrosCosto.jsx`** (o una pestaña dentro de una página de catálogos ya
  existente si el proyecto tiene una — revisar si existe algo como `Categorias.jsx` antes de
  crear una página nueva de cero): lista simple nombre + tipo + activo/inactivo, gate `admin`.
- **`src/pages/Maquinas.jsx`**: lista nombre + tarifaHora (editable) + activo/inactivo, gate
  `["admin", "jefatura"]`.
- **`src/pages/Usuarios.jsx`**: agregar columna/input `tarifaHora` — visible y editable solo si
  `rolActual` es `admin`/`jefatura` (el resto de la página sigue admin-only vía backend, pero el
  campo de tarifa debe habilitarse también para jefatura aunque el resto de inputs de esa fila
  queden disabled — llama a `PATCH /usuarios/:id/tarifa-hora`, no al `PUT /:id` general).

### `src/components/ModalNotificacionTrabajo.jsx` (nuevo)

Mismo patrón que `ModalRequerimiento.jsx`: estado local `items` (array), botones "+ Agregar
técnico" / "+ Agregar máquina" que abren selectores (`SelectorEmpresas.jsx` es el patrón de
selector-con-búsqueda ya existente en el proyecto — replicar esa estructura para elegir
`Usuario`/`Maquina` en vez de `Empresa`, o revisar si ya existe un selector de técnicos
reutilizable antes de crear uno nuevo — `ModalRequerimiento.jsx` ya arma su propio `<select>`
para "Solicitado por", que puede servir de base). Cada línea: recurso + horas (tarifa/costo NO
se muestran como input, son de solo lectura si se decide mostrarlas). Botón "Guardar" hace
`POST /notificaciones-trabajo`. Gate: `puedeCrear = ["supervisor", "admin"].includes(rol)`.

### Card "Notificación de Trabajo" en Relaciones

En `DetalleOrdenTrabajo.jsx`/`DetalleSubOT.jsx`, junto a las demás `TarjetaRelacion` — pero
como puede haber MÁS de una notificación por OT (a diferencia de OC/Factura, que son 1:1), el
card debe listar todas (o mostrar un contador + abrir una lista, mismo criterio que el card de
GRE cuando hay más de una guía — ver `gres.length === 1 ? ... : ...` en
`DetalleOrdenTrabajo.jsx`). Gate de visibilidad: mismo `puedeVerServicios` ya usado para
`TablaServiciosExternos` (todos menos técnico).

Cada notificación listada muestra su `estado` (abierta/cerrada) y, si jefatura, botones "Abrir"
(si está cerrada) — la anulación de líneas puntuales probablemente necesita su propio mini-modal
de detalle (lista de líneas con botón "Anular" por línea, visible solo a jefatura) en vez de
caber en el card compacto.

### Card "Reporte" (nuevo)

Visible solo si `["jefatura", "vendedor"].includes(rolActual)`. Card compacto con Margen S/o
US$ y % (fórmula en la sección de arriba) — click abre `ModalReporteCosto.jsx` con tabla:
Materiales pagados / Servicios pagados / HH / HM / Total costo / OC (subtotal) / Margen.

## Autorrevisión del spec

- **Placeholders**: ninguno bloqueante — el único punto marcado explícitamente "a confirmar
  durante la implementación" es si `montoUnitario`/`costo` son unitarios o totales (ver sección
  de cálculo del reporte), y si existe ya una página de catálogos genérica que reutilizar en vez
  de crear `CentrosCosto.jsx`/`Maquinas.jsx` desde cero.
- **Ambigüedad detectada y resuelta por decisión explícita del usuario**: alcance de "anular"
  (por línea, no por documento) y quién edita tras reabrir (el supervisor, no jefatura) — ambas
  ya cerradas en las decisiones #10 de arriba, no volver a preguntar.
- **Consistencia de nombres**: `NotificacionTrabajo`/`notificacionesTrabajo.js`/
  `/notificaciones-trabajo` en todo el documento — deliberadamente distinto de
  `Notificacion.js`/`routes/notificaciones.js` (sistema de campana/alertas ya existente, no
  relacionado).
- **Alcance**: un solo sub-proyecto coherente, no requiere descomponerse en specs separados —
  las 3 piezas (catálogos, documento nuevo, reporte) comparten el mismo objetivo (costeo real
  por OT) y se implementan juntas.
- **Fuera de alcance explícito**: reporte agregado a nivel `Dashboard.jsx` (el usuario dijo
  "aun no decido" — no incluido en este spec, queda para una iteración futura), edición de
  `Personal.js` (catálogo separado, no tocado), extensión a HUAQUIAN/IMAQUITEC (no pedida).
