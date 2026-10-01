# Formato propio de Cotización para Intales — Design Spec

**Contexto:** Este proyecto (SIPAPP-INTALES) es una copia rebrandeada de SIPAPP-HUAQUIAN (ver
`docs/superpowers/plans/2026-09-09-copia-huaquian-intales.md`). Esa copia dejó explícitamente
pendiente el formato propio de Cotización de Intales (Task 14 del plan original), porque el
usuario todavía no tenía la plantilla. El usuario acaba de subir
`formato-cotizacion-INTALES.xlsx` (raíz del proyecto) — este spec diseña el reemplazo completo
del formulario y el PDF de Cotización a partir de esa plantilla real.

**Alcance:** Un solo formato de cotización para **todos** los clientes de Intales (confirmado
por el usuario) — reemplaza por completo el formato "estándar" heredado de Huaquian, y **elimina**
los formatos Gloria/Alicorp (exclusivos de clientes de Huaquian por RUC, inalcanzables para
Intales).

## Qué se extrajo de la plantilla real

`formato-cotizacion-INTALES.xlsx`, hoja "COT LEXA" — inspeccionado con la librería `xlsx`
(ya es dependencia del Frontend). Resumen de su estructura (ver capturas de pantalla
compartidas con el usuario durante el brainstorming para el detalle celda por celda):

- **Encabezado:** 5 imágenes embebidas — logo INTALES (`xl/media/image1.png`), y 3 logos de
  marcas hermanas: Lexacaucho (`image2.jpeg`), Majuflex (`image3.png`), Rodilex (`image4.png`).
  Título "COTIZACIÓN N° 00258-2026-IN/JEV".
- **Datos del cliente:** SEÑORES (razón social) / RUC / DIRECCIÓN / ATENCIÓN / RQ, más FECHA
  a la derecha.
- **Tabla de ítems:** ÍTEM (código libre, ej. "5264", "1737" — no correlativo) / CANT. / U.M /
  DESCRIPCIÓN / PRECIO UNITARIO / PRECIO TOTAL. Debajo de cada ítem, una fila fusionada con
  "TIEMPO DE ENTREGA: X DÍAS HÁBILES".
- **Pie:** MONEDA / FORMA DE PAGO / TIEMPO DE ENTREGA (texto fijo) a la izquierda; SUB TOTAL /
  I.G.V (18%) / TOTAL a la derecha. Dos avisos fijos: "VALIDEZ DE LA OFERTA 15 DÍAS" y
  "CONSULTAR CONDICIONES DE TRANSPORTE".
- **Cierre:** cuadro de texto "EN CASO DE SER FAVORECIDOS, GENERAR LA OC A NOMBRE DE: INTALES
  SAC / RUC 20607650811", firma ("Atentamente, {nombre} / {cargo} / {correo} / {teléfono}"), y
  un bloque de cuentas bancarias BCP (soles y dólares) + cuenta de detracción Banco de la
  Nación, con el logo BCP (`image5.png`).

Los 5 PNG/JPEG se extrajeron a `/tmp` durante el brainstorming — deben volver a extraerse (o
pedirse de nuevo al usuario) al momento de implementar, y guardarse en
`Frontend/public/assets/logos/`.

## Decisiones confirmadas con el usuario (2026-09-10)

1. **Un solo formato para todos los clientes** — no hay selector de formato.
2. **Código de ítem**: campo de texto libre, escrito a mano (no autonumerado).
3. **Tiempo de entrega**: dos campos distintos.
   - Por ítem: input **numérico** (días) — el texto "X DÍAS HÁBILES" se arma automáticamente,
     nunca texto libre.
   - Global (pie de página): **texto fijo**, siempre "DÍAS HÁBILES" — no es un campo del
     formulario ni del modelo, solo texto estático en el PDF (y en la UI si se replica el
     layout ahí).
4. **Sub-ítems**: ya existen en el formulario actual (heredado de Huaquian) — se mantienen tal
   cual, no es un feature nuevo.
5. **Imagen por ítem** (ya construida en una tarea anterior): se mantiene en el formulario, Y
   se agrega también al PDF — va dentro de cada ítem, debajo de la línea de tiempo de entrega.
   Si el ítem no tiene imagen, esa fila no se dibuja en el PDF (sin espacio en blanco).
6. **Firma dinámica**: toma nombre/cargo/correo/teléfono del usuario que generó la cotización
   (no un dato fijo). Como `Usuario` no tiene cargo/correo/teléfono hoy, se agregan esos 3
   campos al modelo (el usuario los carga una vez en su perfil).
7. **Código de cotización**: `codigo`/`numeroCotizacion` (mismo valor, ambos campos del
   modelo) son el **correlativo puro**, zero-padded a 5 dígitos (ej. `00259`) — global,
   **nunca se reinicia** (no depende del año). El código completo con año+INT+iniciales
   (ej. `00259-2026-INT/JEV`) **no se persiste** — se arma solo al exportar el PDF (corrección
   del usuario, 2026-09-11), a partir de `numeroCotizacion` + `fecha` + `creadoPor.iniciales`.
   "INT" queda hardcodeado en esa construcción del PDF. Las iniciales salen de un campo nuevo
   `iniciales` en `Usuario` (se agrega junto a cargo/correo/teléfono).
8. **Logos del encabezado**: los 4 (Intales + 3 marcas hermanas) van siempre juntos, sin lógica
   condicional por línea de producto/marca.
9. **Limpieza**: se **borran** por completo los formatos Gloria y Alicorp (componentes, PDFs,
   ramas de código) — quedan permanentemente inalcanzables para Intales.

## Cambios de modelo — Backend

### `src/models/Usuario.js`

Agregar 4 campos de texto simple (todos opcionales, `default: ""`, sin validación especial
más allá de trim):

```js
cargo:      { type: String, trim: true, default: "" },
correo:     { type: String, trim: true, default: "" },
telefono:   { type: String, trim: true, default: "" },
iniciales:  { type: String, trim: true, default: "" },
```

`routes/usuarios.js` (`POST /`) y la ruta de edición correspondiente deben aceptar estos 4
campos en el body igual que los existentes — revisar el archivo real antes de asumir su forma
exacta (no se leyó en este spec).

### `src/models/Cotizacion.js`

**`itemSchema` — agregar:**
```js
codigo:       { type: String, trim: true, default: "" }, // texto libre, no autonumerado
diasEntrega:  { type: Number },                            // reemplaza a fechaEntrega
```

**`itemSchema` — quitar:** `fechaEntrega` (Date), `grupo`, `personas`, `horas`, `tarifaHora`
(los 4 últimos eran exclusivos de Gloria/Alicorp).

**`itemSchema` — sin decidir, no tocar por ahora:** `descuento` (por ítem) no aparece en la
plantilla nueva, pero tampoco estorba si queda sin usar — no se pidió quitarlo explícitamente.

**Documento — agregar:**
```js
rq: { type: String, trim: true, default: "" },
creadoPor: { type: mongoose.Schema.Types.ObjectId, ref: "Usuario", default: null },
```
`creadoPor` se setea una sola vez en `POST /cotizaciones`, al usuario autenticado que crea el
documento (revisar `authMiddleware.js` para el nombre real del campo en `req` — mismo patrón
que ya resuelven `anuladoPor`/`aprobadoPor`/`enviadoPor`, aunque esos son strings sueltos y
este es una referencia real: se eligió referencia porque el PDF necesita 4 campos del usuario
—nombre/cargo/correo/teléfono—, no solo el nombre, y así se leen siempre actualizados del
perfil sin duplicarlos en cada cotización). La ruta `GET /cotizaciones`/`GET /cotizaciones/:id`
debe hacer `.populate("creadoPor", "nombre cargo correo telefono")` para que el frontend tenga
esos datos disponibles al exportar el PDF sin una consulta aparte.

**Documento — quitar:** `titulo` (y su `required: true` — importante, si no se quita el
`required` el guardado fallará con un `ValidationError` crudo en cuanto el formulario deje de
mandarlo, mismo patrón de bug que cubre el skill `erp-required-field-guard`),
`asesorComercial`, `numeroCelular`, `numeroSolicitudPedido`,
`numeroPeticionOferta`, `tiempoGarantia`, `descuentoPorcentaje`, `gastosGeneralesPorcentaje`,
`utilidadPorcentaje`, `textoBreveServicio`, `area`, `omAviso`, `numeroGuia`,
`jefeSupervisorSolicitante`, `compradorResponsable`, `numeroGuiaEmision`, `numeroGuiaRemision`.

**`numeroCotizacion` — corrección del usuario (2026-09-11), NO se quita:** vuelve al modelo
como el correlativo puro (mismo valor que `codigo`, ver el hook reescrito más abajo) — tantas
pantallas de lista ya existentes (`ListaCotizaciones.jsx`, `ListaOrdenesCompra.jsx`,
`ListaOrdenesTrabajo.jsx`, `ListaFacturas.jsx`, `AprobacionCotizaciones.jsx`) lo leen
directamente que quitarlo dejaba esas columnas vacías — se mantiene tal cual para no tocar
esas 5+ pantallas.

**Documento — queda igual:** `empresa`, `planta`, `personaContacto`, `atencion`, `fecha`,
`moneda`, `condicionPago` (mapea a "Forma de pago" en el formulario/PDF), `tipo`, `items`,
`subtotal`/`igv`/`total`, `codigo`, `numeroCotizacion`, `numeroDocumento`, y todos los flags de estado (`anulado`,
`motivoAnulacion`, `anuladoPor`, `fechaAnulacion`, `estadoCadena`, `codigoSap`, `fechaSalida`,
`aprobado`/`aprobadoPor`/`fechaAprobacion`, `enviado`/`enviadoPor`/`fechaEnvio`,
`informeEnviado`/`informeEnviadoPor`/`fechaInformeEnviado`) — ninguno de estos se tocó en el
brainstorming, se listan acá para que el implementador no los borre por error al limpiar los
campos de arriba.

**`pre("save")` — reescribir la generación de `codigo`:**

El hook actual (líneas 132-153) arma `{PREFIJO}-COT-{NNN}` donde el prefijo sale del alias de
la Empresa. El nuevo hook debe:
1. Mantener la generación de `numeroDocumento` sin cambios (`siguienteNumeroDocumento()`).
2. Calcular el correlativo como el conteo total de cotizaciones existentes + 1 (patrón
   `countDocuments()` ya usado en el resto del proyecto — **no** usar `Promise.all` si en algún
   punto se genera en lote, ver la regla global de este proyecto sobre seeds).
3. Tomar el año de `this.fecha` (o `Date.now()` si `fecha` no está seteada aún en el momento
   del hook).
4. Buscar `iniciales` del usuario creador — mismo `creadoPor` seteado en la ruta `POST
   /cotizaciones` (ver sección de modelo arriba). El hook `pre("save")` puede leer
   `this.creadoPor` y hacer `Usuario.findById(this.creadoPor, "iniciales")` para obtener las
   iniciales sin depender de que la ruta se las pase por separado.
5. Armar `codigo` como `${String(correlativo).padStart(5, "0")}-${año}-INT/${iniciales}`.

## Cambios — Frontend

### Formulario de Cotización (3 superficies, mismas que tocó la Task 10 original)

`DetalleCotizacion.jsx`, `ModalNuevaCotizacion.jsx`, `pages/Cotizaciones.jsx`:
- Quitar toda rama `esGloria`/`esAlicorp` y los campos que solo esas ramas mostraban.
- El bloque de datos queda: Empresa → Planta → Persona de contacto (selector en cascada, sin
  cambios), Atención, RQ (nuevo input), Fecha (solo lectura, autocompletada a hoy), Moneda
  (selector PEN/USD con símbolos S/ y $), Forma de pago (`condicionPago`, texto libre).
- El "Tiempo de entrega" global NO es un input — si el diseño de la plantilla se replica en la
  UI del formulario (no solo en el PDF), mostrarlo como texto fijo "DÍAS HÁBILES", no como
  campo editable.

### `TablaItemsCotizacion.jsx`

- Agregar columnas **Código** (texto libre) y **Días de entrega** (número) por ítem.
- Quitar el condicionamiento `tipo === "venta"` sobre el bloque de imagen — con un solo formato
  para todos, la imagen por ítem se puede adjuntar siempre, sin importar `tipo`.
- Sub-ítems: sin cambios, ya funcionan.

### Borrar por completo

`src/components/TablaItemsCotizacionGloria.jsx`, `src/components/TablaItemsCotizacionAlicorp.jsx`,
`src/utils/cotizacionGloriaPdf.js`, `src/utils/cotizacionAlicorpPdf.js`, y las funciones
Gloria-específicas de `src/utils/cotizacionItems.js` (`calcularGloria`, `calcSubtotalGloria`, y
cualquier otra ligada a `grupo`/`personas`/`horas`/`tarifaHora`).

**Nota:** `src/components/ModalCotizacion.jsx` ya se había identificado como código muerto
(sin ninguna referencia real en el árbol) durante la revisión final de la Task 10 — sigue sin
ser parte de este spec, pero el implementador debería confirmarlo de nuevo antes de decidir si
también lo actualiza o lo borra (no se pidió explícitamente borrarlo).

### `src/utils/cotizacionPdf.js` — reescritura completa

Usa `jsPDF` + `jspdf-autotable` (ver skill `pdf-cotizacion-recetas` para las recetas ya
probadas de este proyecto: negrita/normal mezclados en una celda, altura de línea real,
ocultar ceros, logos desde `/public`). Exporta una sola función,
`exportarCotizacionPdf(cotizacion)`, ya consumida por `DetalleCotizacion.jsx`,
`Cotizaciones.jsx`, y (posiblemente) `ModalCotizacion.jsx` — mantener la misma firma para no
romper esos 3 call sites; solo cambia el layout interno.

**Corrección tras revisión del usuario (2026-09-10, dos rondas): para el PDF de cotización,
el emisor son SOLO `ruc` + `razonSocial`, ya existentes en `.env` (`RUC_EMISOR`/
`RAZON_SOCIAL_EMISOR`, ver Task 4 del plan de copia original) — nada de dirección/ubigeo/
representante/teléfono/correo de la empresa. El bloque de plantilla que parece pedir más datos
del emisor en realidad es solo texto fijo ("INTALES SAC / RUC 20607650811") más la firma
dinámica del usuario creador (nombre/cargo/correo/teléfono — de `Usuario`, no de la empresa).

**Backend:** no hace falta ninguna variable de entorno nueva. Falta sí un endpoint de lectura
para que el **frontend** pueda leer `ruc`/`razonSocial` al armar el PDF (hoy `getEmisor()` en
`src/utils/emisorSunat.js` solo se usa server-side, dentro de `comprobante.controller.js`/
`guia.controller.js` — no hay ningún route que lo exponga al frontend todavía). Agregar una
ruta de solo lectura, protegida por `authMiddleware` igual que el resto de la API, que llame
`getEmisor()` sin RUC solicitado y devuelva `{ ruc, razonSocial }` (revisar durante la
implementación en qué archivo de rutas encaja mejor — podría ser una nueva ruta pequeña en
`routes/sistema.js` o `routes/cotizaciones.js`, no hay un lugar obvio ya existente). El
frontend la llama una vez al generar el PDF (o la cachea) en vez de una constante hardcodeada
— reemplaza a la constante `HUAQUIAN` que tenía `cotizacionPdf.js`, que se elimina.

**Importante — desacoplar de `EmitirGuia.jsx`:** `src/pages/EmitirGuia.jsx:6` importa hoy
`{ HUAQUIAN }` desde `cotizacionPdf.js` para su propio uso (domicilio fiscal fijo del emisor
en la Guía de Remisión — `.direccion`/`.ubigeo`, campos que la cotización NO necesita). Es un
consumidor no relacionado a este spec (GRE, no Cotización) que quedaría roto si simplemente se
borra la constante. Al eliminar `HUAQUIAN` de `cotizacionPdf.js`:

1. Mover `direccion`/`ubigeo` a una constante local dentro del propio `EmitirGuia.jsx` (sin
   depender de `cotizacionPdf.js`).
2. **Ya consultado (2026-09-10)** contra `GET /api/sunat/ruc/20607650811` en una instancia
   aislada (puerto 5041, sin tocar el servidor real del usuario), ahora que el usuario cargó su
   `APIPERU_TOKEN` real. Resultado real de apiperu.dev — usar estos valores literales:
   ```js
   const INTALES_DOMICILIO = {
     direccion: "CAL. LAS FRAGUAS NRO. 190 URB. NARANJAL INDUSTRIAL, LIMA - LIMA - INDEPENDENCIA",
     ubigeo: "150112", // Independencia, Lima, Lima
   };
   ```
   (de paso, la razón social real que devolvió SUNAT es "INTALES S.A.C." — con punto después de
   "S.A.C", ligeramente distinto de "INTALES SAC" usada en el resto de este spec y del Excel;
   no hace falta unificarlo, son solo variantes de formato del mismo nombre, usar la que ya está
   en `RAZON_SOCIAL_EMISOR`/el Excel para el resto de la cotización, y esta forma con puntos
   solo para este uso puntual en `EmitirGuia.jsx` si se prefiere ser fiel a SUNAT).

**Constante `BANCOS` → actualizar con las cuentas reales de Intales:**
```js
const BANCOS = {
  bcpCuentaDolares: "191-9134985-1-83",
  bcpCciDolares:    "002-191-009134985183-51",
  bcpCuentaSoles:   "191-9291696-0-12",
  bcpCciSoles:      "002-191-009291696012-50",
  bnCuentaDetraccion: "00-057-103825",
};
```

**Layout del PDF** (una sola página salvo que la tabla de ítems no quepa, en cuyo caso
`jspdf-autotable` pagina automáticamente — comportamiento ya usado en el PDF actual):
1. Encabezado: 4 logos (Intales grande a la izquierda, los 3 de marcas hermanas más chicos a la
   derecha) + "COTIZACIÓN N° {código completo}", donde el código completo se arma acá mismo,
   en el PDF — nunca se persiste — como
   `${cotizacion.numeroCotizacion}-${new Date(cotizacion.fecha).getFullYear()}-INT/${cotizacion.creadoPor?.iniciales || ""}`
   (ej. `00259-2026-INT/JEV`; si `creadoPor` viene `null`/sin iniciales, queda
   `00259-2026-INT/` — no debe crashear).
2. Bloque cliente: SEÑORES (`empresa.razonSocial`) / RUC (`empresa.ruc`) / DIRECCIÓN (dirección
   de la `planta` seleccionada, no la de la empresa) / ATENCIÓN (`cotizacion.atencion`) / RQ
   (`cotizacion.rq`) / FECHA (`cotizacion.fecha`, formateada).
3. Tabla de ítems vía `autoTable`: columnas Código / Cant. / U.M. / Descripción (+ sub-ítems en
   la misma celda, mezclando negrita/normal como ya hace el PDF actual) / P. Unitario / P.
   Total. Debajo de cada fila de ítem (no como columna): línea "Tiempo de entrega: {diasEntrega}
   días hábiles" y, si `item.imagenes[0]` existe, la imagen cargada ahí debajo (usar
   `cargarImagen()`, ya existente en el archivo, que resuelve `null` si la imagen no carga en
   vez de rechazar la promesa — no rompe la exportación si una imagen falla).
4. Pie: MONEDA (`cotizacion.moneda`, con símbolo S/ o $) / FORMA DE PAGO
   (`cotizacion.condicionPago`) / "TIEMPO DE ENTREGA: DÍAS HÁBILES" (texto fijo) a la
   izquierda; SUB TOTAL / I.G.V (18%) / TOTAL a la derecha (cálculo ya existente, sin tocar).
   Avisos fijos: "** VALIDEZ DE LA OFERTA 15 DÍAS" / "** CONSULTAR CONDICIONES DE TRANSPORTE".
5. Cierre: texto fijo "EN CASO DE SER FAVORECIDOS, GENERAR LA OC A NOMBRE DE: {razonSocial
   emisor} / RUC {ruc emisor}" (de la ruta nueva de lectura de emisor, no hardcodeado), luego
   firma dinámica: "Atentamente, {cotizacion.creadoPor.nombre} / {...cargo} / {...correo} /
   {...telefono}" — **confirmado: sale de quien CREÓ la cotización** (`creadoPor`, ver sección
   de modelo arriba), no de quien la exporta en ese momento. Si `creadoPor` es `null` (datos
   creados antes de este cambio, o el campo no vino populado), decidir en la implementación un
   fallback razonable (ej. omitir la firma o mostrar solo "Atentamente,") — no debería crashear
   la exportación.
6. Bloque bancario: cuentas BCP soles/dólares + detracción, con el logo BCP.

## Autorrevisión del spec

- **Placeholders:** los únicos datos genuinamente pendientes son dirección/ubigeo/representante/
  teléfono/correo del emisor Intales (marcados arriba como PENDIENTE) — no bloquean la
  implementación, solo quedan vacíos hasta que el usuario los entregue, igual que ya pasa con
  `RUC_EMISOR`/`HUB_*` en el backend.
- **Ambigüedad detectada y no resuelta:** de quién sale el nombre en la firma del PDF (creador
  vs. quien exporta) — señalado explícitamente arriba, a resolver leyendo el código real
  durante la implementación, no adivinar.
- **Consistencia:** el modelo de `itemSchema` y el layout del PDF usan los mismos nombres de
  campo (`codigo`, `diasEntrega`, `imagenes`) en todo el documento.
- **Alcance:** un solo sub-proyecto coherente (formulario + modelo + PDF + limpieza de Gloria/
  Alicorp), no requiere descomponerse en specs separados.
