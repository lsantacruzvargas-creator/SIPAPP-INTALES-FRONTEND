# Compras (Solicitud de Compra → Licitación → OC a proveedor) — Design Spec

**Contexto:** Hoy las compras a proveedores se "procesan" ítem por ítem dentro de
`Requerimientos.jsx` (pestaña *Por procesar* + `ModalProcesarSolicitud.jsx`: un proveedor y un
monto por ítem, sin documento de compra, sin comparar proveedores, sin PDF). El usuario pidió una
vista **Compras** que agrupe los pedidos por procesar (materiales de Requerimientos + Servicios
Externos + pedidos manuales), los envíe a varios proveedores, compare sus cotizaciones y genere
la Orden de Compra al proveedor en PDF.

**Alcance (Spec A de 3):** este spec cubre Compras + los cambios en Empresas, Centros de Costo y
el nuevo catálogo Tipos de Artículo. Fuera de alcance, cada uno con su propio spec posterior:
- **Spec B — Tesorería:** cuentas por pagar (factura del proveedor, contado/crédito, vencimiento,
  detracción/retención, pagos) y la misma lógica para facturas de venta (cuentas por cobrar).
  Reemplazará las pestañas *Pendiente de pago / Pagados* de Requerimientos.
- **Spec C — Cierre de mes:** compras pagadas + ventas cobradas del mes por centro de costo.

## Decisiones confirmadas con el usuario (2026-09-25)

1. **Tres specs** (A Compras, B Tesorería, C Cierre de mes); se implementa A primero.
2. **Número de SC automático por pedido:** cada Requerimiento con ítems de compra y cada Servicio
   Externo nace con su `SC-NNNN`. En Compras se pueden marcar líneas de **una o varias SC** y
   enviarlas juntas; el PDF muestra la SC de origen en cada línea.
3. **Licitación con cuadro comparativo:** se registra el precio que cotizó cada proveedor por
   ítem; se elige ganador por ítem; se genera una OC por proveedor ganador.
4. **"Enviar" = descargar un PDF por proveedor** (sin correo automático). El comprador lo manda por
   su cuenta; el sistema registra a quién, cuándo y quién lo envió.
5. **Roles de Compras:** `vendedor`, `jefatura`, `admin`.
6. **Centro de costo por línea en la SC**, editable antes de convertirse en OC. Precargado con el
   centro por defecto (material/servicio); obligatorio en SC manual.
7. **Forma de pago de la OC:** el mismo `SelectFormaPago` de cotizaciones (lista + "Otro…" a
   mano). Texto libre; Spec B verá cómo derivar el vencimiento.
8. **SC manual sin OT** permitida (gastos generales: oficina, EPPs, herramientas).
9. **Enfoque de datos A:** colección propia `SolicitudCompra` con líneas que referencian su
   origen, en vez de un `numeroSC` sobre los modelos existentes.
10. **Tipos de Artículo:** catálogo que se alimenta al vuelo. Cada ítem de compra del RQ y cada
    Servicio Externo lleva uno (obligatorio al pedir); cada proveedor marca varios. Al enviar,
    los proveedores que venden los tipos de las líneas marcadas aparecen primero.
11. **Cotizaciones de proveedores adjuntas** (PDF/imagen/Word/Excel) como historial, de todos los
    invitados, no solo del ganador.
12. **Vista de todas las compras** con filtros por OC, proveedor, material, tipo de artículo,
    fecha, centro de costo; vista por OC y vista por ítem (historial de precios); Exportar Excel.

## Nombres — evitar el choque con `OrdenCompra`

`OrdenCompra` (existente) es la OC **que el cliente le emite a INTALES** (lado ventas, cadena
Cotización→OT→OC→Factura). **No se toca.** La OC que INTALES emite al proveedor es un modelo
nuevo: `OrdenCompraProveedor`, código `OCP-NNNN`. En la UI se rotula siempre "OC a proveedor" /
"OCP" dentro de Compras; la entrada "Órdenes de Compra" del sidebar sigue siendo la del cliente.

## Modelo de datos — Backend

Códigos en `pre("save")` con el patrón del proyecto (último por `_id`, parsear sufijo, +1,
`padStart(4, "0")`), igual que `Requerimiento.js`/`ServicioExterno.js`.

### `src/models/TipoArticulo.js` (nuevo)

```js
const tipoArticuloSchema = new mongoose.Schema(
  {
    nombre: { type: String, required: true, trim: true },
    // minúsculas + sin tildes + espacios colapsados — el índice único vive
    // acá para que "Eléctricos" y "electricos" sean el mismo tipo.
    nombreNormalizado: { type: String, required: true, unique: true },
    activo: { type: Boolean, default: true },
  },
  { timestamps: true }
);
```

Helper `normalizar(texto)` en `src/utils/normalizarTexto.js`
(`texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim()`).

### `src/models/SolicitudCompra.js` (nuevo) — `SC-NNNN`

```js
const lineaSCSchema = new mongoose.Schema(
  {
    tipo: { type: String, enum: ["material", "servicio"], required: true },
    descripcion: { type: String, required: true, trim: true },
    unidad: { type: String, default: "und", trim: true },
    cantidad: { type: Number, required: true, min: 0.0001 },
    tipoArticulo: { type: mongoose.Schema.Types.ObjectId, ref: "TipoArticulo", default: null },
    centroCosto: { type: mongoose.Schema.Types.ObjectId, ref: "CentroCosto", default: null },
    // _id del ítem dentro de Requerimiento.items (solo origen "requerimiento").
    origenItemId: { type: mongoose.Schema.Types.ObjectId, default: null },
    estadoCompra: {
      type: String,
      enum: ["por_procesar", "en_licitacion", "adjudicado", "anulado"],
      default: "por_procesar",
    },
    licitacion: { type: mongoose.Schema.Types.ObjectId, ref: "Licitacion", default: null },
    ordenCompraProveedor: { type: mongoose.Schema.Types.ObjectId, ref: "OrdenCompraProveedor", default: null },
    motivoAnulacion: { type: String, default: "" },
  },
  { _id: true }
);

const solicitudCompraSchema = new mongoose.Schema(
  {
    codigo: { type: String, unique: true },
    origen: { type: String, enum: ["requerimiento", "servicio", "manual"], required: true },
    requerimiento: { type: mongoose.Schema.Types.ObjectId, ref: "Requerimiento", default: null },
    servicioExterno: { type: mongoose.Schema.Types.ObjectId, ref: "ServicioExterno", default: null },
    ordenTrabajo: { type: mongoose.Schema.Types.ObjectId, ref: "OrdenTrabajo", default: null },
    solicitadoPor: { type: String, default: "" },
    observaciones: { type: String, default: "" },
    items: [lineaSCSchema],
  },
  { timestamps: true }
);
```

- Origen `requerimiento`: una línea por cada ítem `esSolicitudCompra` del RQ. `descripcion` =
  `categoriaNombre` + `resumenCompra(camposCompra)` (mismo formato que `Requerimientos.jsx`) o la
  descripción de "Otros"; `unidad` "und".
- Origen `servicio`: una sola línea. `descripcion` = `tipoTrabajo — material`; `cantidad` =
  `servicio.cantidad`; `unidad` "servicio".
- Origen `manual`: líneas escritas en "Nueva SC"; `centroCosto` **obligatorio** en cada línea.

### `src/models/Licitacion.js` (nuevo) — `LIC-NNNN`

```js
const archivoSchema = { // mismo shape que OrdenTrabajo.archivos
  nombre: { type: String, required: true },
  url: { type: String, required: true },
  mimetype: { type: String, default: "" },
  tamano: { type: Number, default: 0 },
  subidoPor: { type: String, default: "" },
  fecha: { type: Date, default: Date.now },
};

const itemLicitacionSchema = new mongoose.Schema({
  solicitudCompra: { type: mongoose.Schema.Types.ObjectId, ref: "SolicitudCompra", required: true },
  lineaId: { type: mongoose.Schema.Types.ObjectId, required: true }, // SolicitudCompra.items._id
  scCodigo: { type: String, default: "" },                            // snapshot para PDF/tabla
  tipo: { type: String, enum: ["material", "servicio"], required: true },
  descripcion: { type: String, required: true },   // editable mientras la LIC está abierta
  unidad: { type: String, default: "und" },
  cantidad: { type: Number, required: true },      // editable mientras la LIC está abierta
  tipoArticulo: { type: mongoose.Schema.Types.ObjectId, ref: "TipoArticulo", default: null },
  centroCosto: { type: mongoose.Schema.Types.ObjectId, ref: "CentroCosto", default: null },
  ganador: { type: mongoose.Schema.Types.ObjectId, default: null }, // proveedores[]._id elegido
}, { _id: true });

const proveedorLicitacionSchema = new mongoose.Schema({
  empresa: { type: mongoose.Schema.Types.ObjectId, ref: "Empresa", required: true },
  razonSocial: { type: String, default: "" }, // snapshot
  ruc: { type: String, default: "" },
  fechaEnvio: { type: Date, default: Date.now },
  enviadoPor: { type: String, default: "" },
  moneda: { type: String, enum: ["PEN", "USD"], default: "PEN" },
  precios: [{ itemId: mongoose.Schema.Types.ObjectId, precioUnitario: Number }], // sin IGV
  observaciones: { type: String, default: "" }, // plazo de entrega, condiciones que ofreció
  archivos: [archivoSchema],                     // cotización(es) que devolvió
}, { _id: true });

const licitacionSchema = new mongoose.Schema({
  codigo: { type: String, unique: true },
  items: [itemLicitacionSchema],
  proveedores: [proveedorLicitacionSchema],
  estado: { type: String, enum: ["abierta", "adjudicada", "anulada"], default: "abierta" },
  creadoPor: { type: String, default: "" },
  motivoAnulacion: { type: String, default: "" },
  anuladoPor: { type: String, default: "" },
  fechaAnulacion: { type: Date, default: null },
}, { timestamps: true });
```

### `src/models/OrdenCompraProveedor.js` (nuevo) — `OCP-NNNN`

```js
const itemOCPSchema = new mongoose.Schema({
  solicitudCompra: { type: mongoose.Schema.Types.ObjectId, ref: "SolicitudCompra", required: true },
  lineaId: { type: mongoose.Schema.Types.ObjectId, required: true },
  scCodigo: { type: String, default: "" },
  tipo: { type: String, enum: ["material", "servicio"], required: true },
  descripcion: { type: String, required: true },
  unidad: { type: String, default: "und" },
  cantidad: { type: Number, required: true, min: 0.0001 },
  precioUnitario: { type: Number, required: true, min: 0 }, // sin IGV
  subtotal: { type: Number, required: true },               // cantidad * precioUnitario
  tipoArticulo: { type: mongoose.Schema.Types.ObjectId, ref: "TipoArticulo", default: null },
  centroCosto: { type: mongoose.Schema.Types.ObjectId, ref: "CentroCosto", default: null },
  ordenTrabajo: { type: mongoose.Schema.Types.ObjectId, ref: "OrdenTrabajo", default: null },
}, { _id: true });

const ordenCompraProveedorSchema = new mongoose.Schema({
  codigo: { type: String, unique: true },
  fecha: { type: Date, default: Date.now },
  proveedor: { type: mongoose.Schema.Types.ObjectId, ref: "Empresa", required: true },
  proveedorRazonSocial: { type: String, default: "" }, // snapshot para PDF
  proveedorRuc: { type: String, default: "" },
  proveedorDireccion: { type: String, default: "" },
  licitacion: { type: mongoose.Schema.Types.ObjectId, ref: "Licitacion", required: true },
  items: [itemOCPSchema],
  moneda: { type: String, enum: ["PEN", "USD"], default: "PEN" },
  // false = recibo por honorarios / operación no gravada → igv 0.
  afectoIgv: { type: Boolean, default: true },
  subtotal: { type: Number, default: 0 },
  igv: { type: Number, default: 0 },
  total: { type: Number, default: 0 },
  formaPago: { type: String, default: "" },
  lugarEntrega: { type: String, default: "" },
  fechaEntrega: { type: Date, default: null },
  observaciones: { type: String, default: "" },
  emitidaPor: { type: String, default: "" },
  anulada: { type: Boolean, default: false },
  motivoAnulacion: { type: String, default: "" },
  anuladoPor: { type: String, default: "" },
  fechaAnulacion: { type: Date, default: null },
}, { timestamps: true });
```

Totales calculados **en la ruta** (no en el cliente): `subtotal = Σ items.subtotal`,
`igv = afectoIgv ? round2(subtotal * 0.18) : 0`, `total = subtotal + igv`. La OCP **no se edita**
tras crearse (solo anular). Spec B le agregará factura del proveedor y pagos.

### Cambios a modelos existentes

- **`Empresa.js`:**
  ```js
  tipo: { type: String, enum: ["cliente", "proveedor", "ambos"], default: "cliente" },
  tipoArticulos: [{ type: mongoose.Schema.Types.ObjectId, ref: "TipoArticulo" }],
  ```
  `tipoArticulos` solo se guarda si `tipo` es proveedor/ambos (la ruta lo vacía si es cliente).
- **`CentroCosto.js`:** `tipo` deja de ser `required` (`default: null`, mismo enum + `null`). Su
  significado pasa a ser "centro por defecto para ese tipo". **Máximo un centro activo por tipo**:
  al crear/editar con un `tipo` ya usado por otro centro activo, la ruta le pone `tipo: null` al
  anterior. Las autoasignaciones existentes (`findOne({ tipo, activo: true })`) no cambian.
- **`Requerimiento.js`** (`itemRequerimientoSchema`): `tipoArticulo` (ref TipoArticulo, default
  null). Cabecera: `solicitudCompra` (ref, default null).
- **`ServicioExterno.js`:** `tipoArticulo` (ref TipoArticulo, default null) y `solicitudCompra`
  (ref, default null).

## Rutas — Backend

Todas `async` con `try { … } catch (err) { next(err); }` (ver skill express-async-crash-audit).
Guard `puedeComprar = ["vendedor", "jefatura", "admin"]` en todo lo de Compras.

### `routes/tiposArticulo.js` → `/api/tipos-articulo`
- `GET /` — activos, ordenados por nombre. Cualquier autenticado.
- `POST /` `{ nombre }` — cualquier autenticado. Si existe `nombreNormalizado`, devuelve el
  existente con 200 (idempotente); si no, crea y devuelve 201.

### `routes/solicitudesCompra.js` → `/api/solicitudes-compra` (puedeComprar)
- `GET /?estado=por_procesar` — SCs con líneas en ese estado, pobladas (`ordenTrabajo` numeroOT/
  titulo, `tipoArticulo`, `centroCosto`). El frontend aplana a filas.
- `POST /` — SC manual: `{ observaciones, items: [{ tipo, descripcion, unidad, cantidad,
  tipoArticulo, centroCosto }] }`. Valida ≥1 línea, cantidad > 0, descripción y centroCosto.
- `PATCH /:id/lineas/:lineaId` — `{ tipoArticulo?, centroCosto? }`, solo si la línea está en
  `por_procesar`.
- `PATCH /:id/lineas/:lineaId/anular` — `{ motivo }`, solo `por_procesar`.

### `routes/licitaciones.js` → `/api/licitaciones` (puedeComprar)
- `GET /?estado=abierta` — lista con conteo de cotizaciones cargadas por proveedor.
- `GET /:id` — detalle poblado (para el cuadro comparativo).
- `POST /` — `{ lineas: [{ solicitudCompra, lineaId }], proveedores: [empresaId] }`. Valida:
  todas las líneas existen y están en `por_procesar`; ≥1 proveedor; cada empresa es
  proveedor/ambos. Crea la LIC (snapshot de líneas y proveedores) y pasa las líneas a
  `en_licitacion` con `licitacion` seteado.
- `POST /:id/proveedores` — `{ empresa }` invita a otro proveedor (LIC abierta, no repetido).
- `PUT /:id` — guarda el cuadro: `items[].{descripcion, cantidad, ganador}` y
  `proveedores[].{moneda, precios, observaciones}`. Solo LIC abierta.
- `POST /:id/proveedores/:provId/archivos` — `uploadArchivoCompra.single("archivo")`, `$push` a
  `proveedores.$.archivos`. Permitido también con LIC adjudicada (versión final del proveedor).
- `DELETE /:id/proveedores/:provId/archivos/:archivoId` — solo LIC abierta.
- `POST /:id/adjudicar` — genera las OCPs. Body: `{ ordenes: [{ proveedorId, formaPago,
  moneda, afectoIgv, lugarEntrega, fechaEntrega, observaciones, items: [{ itemId, cantidad,
  precioUnitario }] }] }`. Ver "Adjudicar" abajo.
- `PATCH /:id/anular` — `{ motivo }`, solo LIC abierta: líneas de SC → `por_procesar`
  (`licitacion: null`).

### `routes/ordenesCompraProveedor.js` → `/api/ordenes-compra-proveedor` (puedeComprar)
- `GET /` — filtros query: `codigo`, `proveedor`, `texto` (descripción de ítems, regex escapado),
  `tipoArticulo`, `centroCosto`, `desde`, `hasta`, `estado` (`vigente|anulada`). Devuelve OCPs
  pobladas; la vista "por ítem" aplana en el frontend.
- `GET /:id` — detalle + archivos de su licitación (todos los proveedores, marcando el ganador).
- `PATCH /:id/anular` — `{ motivo }`. Ver "Anular OCP" abajo.

### Middleware de upload
En `middleware/upload.js`: `uploadArchivoCompra` → carpeta `uploads/compras/`, mismo
`EXTENSIONES_POR_MIMETYPE_OT` (imágenes + PDF/Word/Excel) y `extensionValida`, 20 MB. Almacenamiento
en disco local servido por `/uploads` con `authMiddleware` (mismo patrón que OT/Cotización; el
proyecto no usa R2).

### Cambios en rutas existentes
- **`POST /requerimientos`:** exige `tipoArticulo` en ítems `esSolicitudCompra`. Tras guardar el
  RQ, si tiene ítems de compra, crea la `SolicitudCompra` (origen `requerimiento`, una línea por
  ítem, `centroCosto` = el ya autoasignado, `origenItemId` = `item._id`) y guarda
  `requerimiento.solicitudCompra`.
- **`POST /servicios-externos`:** exige `tipoArticulo`; crea la SC (origen `servicio`) y guarda
  `servicio.solicitudCompra`.
- **Anular RQ / rechazar ítem de compra / anular Servicio Externo:** si la línea de SC asociada
  está en `por_procesar` → pasa a `anulado` con el mismo motivo. Si está en `en_licitacion` o
  `adjudicado` → **400** `"Ya está en Compras (LIC-xxxx / OCP-xxxx) — anula eso primero."`.
- **Eliminar** `PATCH /requerimientos/:id/items/:itemId/procesar` y
  `PATCH /servicios-externos/:id/procesar`. **Se mantienen** los `/pagar` (hasta Spec B).
- **`GET /empresas`:** acepta `?tipo=cliente|proveedor` → `{ tipo: { $in: [tipo, "ambos"] } }`.
  `POST/PUT /empresas` aceptan `tipo` y `tipoArticulos`.
- **`routes/centrosCosto.js`:** guard `admin` + `jefatura`; `POST` sin `tipo` obligatorio; `PUT`
  acepta `tipo` (incluido `null`) con la regla de unicidad de arriba.
- **`GET /cotizaciones/emisor`:** se reutiliza tal cual para el encabezado de los PDFs de Compras
  (solo exige `authMiddleware`, sin guard de rol — verificado).
- Registrar las 4 rutas nuevas en `src/index.js`.

### Adjudicar (`POST /licitaciones/:id/adjudicar`)

1. **Validar todo antes de escribir:** LIC abierta; cada `proveedorId` pertenece a la LIC; cada
   `itemId` pertenece a la LIC y aparece **en una sola orden**; cantidad > 0; precio ≥ 0; ≥1
   orden con ≥1 ítem.
2. Crear las OCPs en orden (`for…of` + `await save()`, nunca `Promise.all` — race del hook de
   código). Copian `tipoArticulo`, `centroCosto`, `scCodigo` de la línea de la LIC y
   `ordenTrabajo` de su SC; snapshot del proveedor desde `Empresa`.
3. Líneas de SC incluidas → `adjudicado` + `ordenCompraProveedor`. Ítems de la LIC que no
   entraron en ninguna orden → su línea vuelve a `por_procesar` (`licitacion: null`).
4. LIC → `adjudicada`.
5. **Sincronizar el origen** de cada línea adjudicada (para que las pestañas *Pendiente de pago*
   y el reporte de costo por OT sigan funcionando hasta Spec B):
   - Ítem de RQ: `proveedor`, `proveedorNombre`, `montoUnitario = precioUnitario`,
     `centroCosto`, `estadoPago = "pendiente_pago"`, `procesadoPor`, `fechaProcesado`.
   - Servicio Externo: `proveedor`, `rucProveedor`, `nombreProveedor`, `costo = precioUnitario`,
     `centroCosto`, `estadoPago = "pendiente_pago"`, `procesadoPor`, `fechaProcesado`.
   - Origen manual: nada que sincronizar.

   Si la OCP está en USD, el origen guarda el monto **convertido a S/** con el Tipo de Cambio
   vigente (el reporte de costo por OT trabaja en soles).
6. `notificar` + `notificarAlerta` ("Usuario X generó la OC a proveedor OCP-xxxx").

El proyecto no usa transacciones de Mongo; la validación completa del paso 1 es la protección
contra estados a medias.

### Anular OCP (`PATCH /ordenes-compra-proveedor/:id/anular`)

Solo si no está anulada. OCP → `anulada` + motivo/usuario/fecha. Sus líneas de SC →
`por_procesar` (`licitacion: null`, `ordenCompraProveedor: null`). En el origen: limpiar
proveedor/monto y `estadoPago = "por_procesar"` — **salvo** que el origen ya esté `"pagado"`, en
cuyo caso **400** `"Ya fue marcada como pagada — no se puede anular."`. (Spec B cambiará este
bloqueo a "tiene factura registrada".) La LIC queda `adjudicada` como historial.

## Frontend

### Ruta y navegación
- `/compras` → `pages/Compras.jsx`, protegida para `vendedor`, `jefatura`, `admin`.
- `Sidebar.jsx`: entrada "Compras" (icono carrito) para esos roles. "Centros de Costo" pasa a
  `esAdmin || esJefatura`.

### `pages/Compras.jsx` — 3 pestañas, todas en **tabla**

**1. Por procesar** — una fila por línea de SC en `por_procesar`, filas de la misma SC contiguas,
orden por fecha descendente.
- Columnas: ☐ · SC · Fecha · Origen (`OT-xxx` o "Manual") · Material/Servicio · Tipo de artículo
  (`SelectorTipoArticulo` inline, guarda con `PATCH` al cambiar) · Descripción · Cant. · Und. ·
  Centro de costo (select inline de centros activos, guarda con `PATCH`) · Solicitado por ·
  acción Anular (modal propio con `<textarea>` para el motivo — nunca `window.prompt`).
- Filtros: texto, tipo de artículo, material/servicio.
- Botones: **Nueva SC** (`ModalNuevaSC`) y **Enviar a proveedores (n)** (visible con ≥1 marcada).

**2. En licitación** — una fila por LIC abierta: LIC · Fecha · Ítems · SCs · Proveedores
invitados · Cotizaciones cargadas (x/y) · acciones **Cuadro comparativo** / **Anular**.

**3. Compras** — selector de vista **Por OC | Por ítem** + filtros compartidos (código OC,
proveedor, texto material/descripción, tipo de artículo, desde/hasta, centro de costo, estado
vigente/anulada) + **Exportar Excel** (librería `xlsx`, exporta lo filtrado en la vista activa).
- *Por OC:* OCP · Fecha · Proveedor · Ítems · Moneda · Total · Forma de pago · Estado · PDF ·
  Ver detalle · Anular.
- *Por ítem:* Fecha · OCP · Proveedor · Tipo de artículo · Descripción · Cant. · Und. · P. unit. ·
  Moneda · Subtotal · Centro de costo · OT · SC.

### Componentes nuevos
- **`SelectorTipoArticulo.jsx`** — buscador con sugerencias, opción "+ Agregar '<texto>'"
  (`POST /tipos-articulo`), modo `multiple` (chips) o simple. Usado en `ModalSolicitudCompra`,
  `ModalServicioExterno`, `ModalEmpresa`, `Compras.jsx` (inline) y `ModalNuevaSC`.
- **`ModalNuevaSC.jsx`** — líneas: material/servicio, tipo de artículo, descripción, cantidad,
  unidad, centro de costo (obligatorio); observaciones.
- **`ModalEnviarProveedores.jsx`** — resumen de líneas marcadas + lista de empresas
  `?tipo=proveedor` con buscador. Orden: primero las que tienen ≥1 `tipoArticulo` en común con las
  líneas, por número de coincidencias descendente, con badge "k/n tipos"; divisor "Otros
  proveedores"; luego el resto alfabético. Selección múltiple. Confirmar → `POST /licitaciones`
  → descarga un PDF de Solicitud de Cotización por cada proveedor. Se reutiliza (modo "invitar
  uno más") desde el cuadro comparativo.
- **`ModalCuadroComparativo.jsx`** — pantalla completa. Filas = ítems (descripción/cantidad
  editables); columnas = proveedores (moneda, precio unitario por celda, total por proveedor,
  observaciones, `TarjetaArchivosRelacionados` compacto para adjuntar su cotización — endpoint
  `/licitaciones/:id/proveedores`, `ordenId = provId`). La celda más barata por fila se resalta
  (USD → S/ con el TC del día **solo para comparar**). Radio por fila para el ganador. Botones:
  Guardar (`PUT`), Invitar proveedor, Descargar PDF (por proveedor), **Generar OC(s)**.
- **`ModalGenerarOCP.jsx`** — una sección por proveedor ganador: líneas con cantidad y precio
  editables (precargados del cuadro), moneda (de su cotización), afecto IGV, forma de pago
  (`SelectFormaPago`), lugar y fecha de entrega, observaciones, totales en vivo. Aviso de ítems
  sin ganador ("volverán a Por procesar"). Confirmar → `POST /:id/adjudicar` → descarga los PDFs.
- **`DetalleOCP.jsx`** (modal) — cabecera, ítems, totales, forma de pago, botón PDF, tarjeta
  **"Cotizaciones recibidas"** (archivos de todos los proveedores de su licitación, ganador
  marcado; permite subir más al del ganador).

### Cambios en componentes existentes
- **`ModalSolicitudCompra.jsx`** — campo obligatorio "Tipo de artículo" (`SelectorTipoArticulo`).
- **`ModalServicioExterno.jsx`** — ídem.
- **`ModalEmpresa.jsx`** — select Tipo (Cliente/Proveedor/Ambos); si proveedor/ambos,
  "Tipos de artículo que provee" (`SelectorTipoArticulo multiple`); si es solo proveedor, se
  ocultan HES y Acta de conformidad.
- **`pages/Empresas.jsx`** — columna Tipo, chips de tipos de artículo, filtro por tipo.
- **`SelectorEmpresas.jsx`** / `ModalNuevaCotizacion.jsx` / `ModalNuevaOT.jsx` — cargar
  `/empresas?tipo=cliente` (clientes y ambos).
- **`pages/CentrosCosto.jsx`** — crear sin tipo; select "Por defecto para: — / Materiales /
  Servicios / HH / HM".
- **`pages/Requerimientos.jsx`** — quitar la pestaña *Por procesar* (materiales y servicios) y el
  uso de `ModalProcesarSolicitud`. Borrar `ModalProcesarSolicitud.jsx`. Se mantienen *Pendiente de
  pago* y *Pagados*.

### PDFs — `utils/compraPdf.js` (jsPDF + jspdf-autotable, estilo/logos de `cotizacionPdf.js`)
- **`exportarSolicitudCotizacionPdf(licitacion, proveedor)`** — encabezado INTALES (logo +
  razón social + RUC de `/cotizaciones/emisor`), título "SOLICITUD DE COTIZACIÓN N° LIC-xxxx",
  fecha de envío, datos del proveedor (razón social, RUC, dirección), tabla
  `# · SC · Descripción · Tipo de artículo · Und. · Cantidad`, nota: "Favor de cotizar precios
  unitarios sin IGV indicando moneda, plazo de entrega y forma de pago." Archivo
  `LIC-xxxx_<RUC proveedor>.pdf`.
- **`exportarOrdenCompraProveedorPdf(ocp)`** — encabezado INTALES, "ORDEN DE COMPRA N°
  OCP-xxxx", fecha, proveedor, forma de pago, lugar/fecha de entrega, tabla
  `# · Descripción · Und. · Cant. · P. unit. · Subtotal`, bloque subtotal / IGV 18 % (o "No
  afecto a IGV") / total con símbolo de moneda, observaciones. Archivo `OCP-xxxx.pdf`.

Ver skill pdf-cotizacion-recetas al implementar (alto de línea real, logos desde `/public`).

## Migración — `Backend/src/scripts/migrarCompras.js` (idempotente)

1. `Empresa` sin `tipo` → `"cliente"`. Las que aparecen como `proveedor` en algún
   `Requerimiento.items` o `ServicioExterno` → `"ambos"`.
2. Por cada `Requerimiento` no anulado **sin** `solicitudCompra` que tenga ítems
   `esSolicitudCompra` con `estadoPago` `por_procesar` y `estado` distinto de `rechazado` →
   crear SC con esas líneas (`tipoArticulo: null`). Ídem por cada `ServicioExterno` no anulado,
   `por_procesar`, sin `solicitudCompra`.
3. Lo que ya está en `pendiente_pago` / `pagado` no se toca.
4. Guardados secuenciales (`for…of` + `await`), nunca `Promise.all`.
5. Imprime un resumen (empresas actualizadas, SCs creadas). Correrlo dos veces no crea duplicados
   (la condición "sin `solicitudCompra`" lo garantiza).

Las líneas migradas sin tipo de artículo se pueden enviar igual; el selector de proveedores
simplemente no tiene coincidencias que ordenar.

## Verificación

El proyecto no tiene framework de tests (fuera de alcance agregarlo). Verificación E2E con la app
corriendo (Playwright), más `npm run lint` y `npm run build` del frontend:

1. Crear un RQ con un ítem de compra + tipo de artículo nuevo creado al vuelo → aparece su SC en
   *Por procesar* con el centro de costo por defecto.
2. Crear un Servicio Externo → aparece su SC. Crear una SC manual → exige centro de costo.
3. Marcar líneas de dos SCs → *Enviar a proveedores*: los proveedores con ese tipo salen primero
   con badge → se descargan 2 PDFs → las líneas pasan a *En licitación*.
4. Cuadro comparativo: cargar precios (uno en USD), adjuntar una cotización, elegir ganadores
   distintos por ítem, dejar uno sin ganador → Generar OC(s) → 2 OCPs + 2 PDFs; el ítem sin
   ganador vuelve a *Por procesar*.
5. En Requerimientos, los ítems adjudicados aparecen en *Pendiente de pago* con proveedor y monto
   (en S/ si la OCP era USD).
6. Pestaña *Compras*: filtros por OC, proveedor, texto, fechas; vista por ítem; Exportar Excel.
7. Anular una OCP → las líneas vuelven a *Por procesar* y el origen a `por_procesar`.
8. Rechazar el ítem de un RQ que está en licitación → bloqueado con el mensaje.
9. Crear "electricos" cuando existe "Eléctricos" → devuelve el existente.
10. Selector de clientes en Nueva Cotización ya no muestra empresas solo-proveedor.
11. Centros de costo: jefatura crea "Administración" sin tipo; marcar otro centro como "por
    defecto Materiales" desmarca el anterior.
12. Correr `migrarCompras.js` dos veces → la segunda no crea nada.

## Estado (actualizado 2026-09-28)

**Implementada y en `main`** (Backend `a5ff04a`, Frontend `b0a680e8`), plan
`docs/superpowers/plans/2026-09-25-compras.md`. Tests: backend `npm test` (46, node:test contra
`sipapp-intales-test`), frontend `npm test` (5). E2E API (19 puntos) y recorrido UI con Playwright OK.
Migración `node src/scripts/migrarCompras.js` corrida en la base de desarrollo. El sistema es la
versión 0 y aún no está en producción (se instalará on-premise con MongoDB local en el servidor del
cliente), así que no hay datos reales que migrar.

Cambios respecto a este spec, decididos durante la implementación y la revisión final:
- El origen (ítem de RQ / Servicio Externo) guarda un **unitario efectivo** = subtotal de la OCP en S/
  ÷ cantidad pedida, para que `unitario × cantidad` del origen reproduzca el costo real aunque la OCP
  compre otra cantidad.
- **Reclamos atómicos** (update condicional) al enviar líneas a una licitación y al adjudicar: evitan
  líneas en dos licitaciones y OCPs duplicadas sin usar transacciones.
- **Anular una línea en Compras** rechaza el ítem de RQ de origen (si seguía pendiente) o anula el
  Servicio Externo, con el motivo "Anulado en Compras: …".
- La pestaña *Compras* filtra en el cliente; los archivos de cotización usan `ArchivosProveedor.jsx`.

Pendientes que pasan a la **Spec B (Tesorería)**:
- **Flete / costo de transporte** de una compra (el flujo anterior "Procesar solicitud" lo registraba;
  hoy no hay dónde). Decisión del usuario 2026-09-28.
- Integridad de datos: evaluar transacciones de MongoDB (requiere replica set) para los flujos de dinero
  y códigos con contador atómico (`Counter`) en vez de "último + 1".
- Menores diferidos de la revisión final: CastError → 400 en el handler global; DELETE /empresas no
  bloquea proveedores con LIC/OCP; carrera en POST /tipos-articulo; robustez de modales (try/finally);
  salto de página en observaciones del PDF de OCP; empresa pasada a "proveedor" desaparece de selectores
  de sus documentos de venta; guard de nombre "-test" en test/helpers.js.
