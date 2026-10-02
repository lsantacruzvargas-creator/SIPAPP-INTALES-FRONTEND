# Port de arreglos de INTALES `feature/revision-compras` → `ventas/produccion/contabilidadoficial`

**Fecha:** 2026-10-02 · **Idéntico en** `docs/` de Backend y Frontend.
**Rama de trabajo:** `port/fixes-revision-compras` (desde `ventas/produccion/contabilidadoficial`, en ambos repos),
mergeada con `--no-ff` a `ventas/produccion/contabilidadoficial`. Sin push.

Este documento basta para repetir el port en otra rama o proyecto sin leer la conversación que lo originó.

## 0. Cómo traer los commits sin tocar el origen

```bash
# desde cada repo destino (Backend y Frontend)
git fetch C:/SIP-APP/SIPAPP-INTALES/<Backend|Frontend> feature/revision-compras:refs/remotes/intales/revision-compras
git log --oneline <rama-destino>..intales/revision-compras
# si la rama ya se mergeó y borró en el origen: usar main del origen
```

En esta rama el destino era ancestro directo del origen (base común: Backend `864f720`, Frontend `e2945d91`) y
ninguno de los archivos tocados había cambiado en el destino, así que todos los arreglos entran por
`git cherry-pick -x` limpio. En otra rama, comparar primero cada archivo contra la base común
(`git diff $(git merge-base HEAD intales/revision-compras) HEAD -- <archivo>`) y adaptar a mano si difiere.

## 1. Clasificación de los commits del origen

| Repo | Commit origen | Tipo | ¿Se porta? |
|---|---|---|---|
| Backend | `dc1004f` fix(compras): correcciones de la revisión de Micronegocios | Arreglo (concurrencia, validación, regla tributaria) | Sí |
| Backend | `2183e94` docs: aviso al abrir el proyecto | Documentación propia de INTALES `main` (tarea de saldos, rama por mergear) | No |
| Backend | `bc31672` fix(cpe,sire): receptor validado, clientes varios, detracción 004/026/027, SIRE robusto | Arreglo (seguridad XML, reglas SUNAT/SIRE) | Sí |
| Frontend | `9afa81ba` fix(tesoreria): retención de 4ta solo > S/ 1,500 | Arreglo (regla tributaria) | Sí |
| Frontend | `cb834af2` docs: aviso al abrir el proyecto | Documentación propia de INTALES `main` | No |
| Frontend | `22a8db9e` fix(cpe): clientes varios con tipo `-`; cuotas exactas | Arreglo (reglas SUNAT/SIRE) | Sí |

No hay funcionalidades nuevas en esa rama: todo lo que no se porta es documentación.

## 2. Arreglos — Backend

### B1. Línea de solicitud de compra: editar/anular solo si sigue «por procesar» (atómico) — `dc1004f`

- **Problema:** `PATCH /api/solicitudes-compra/:id/lineas/:lineaId` y `.../anular` leían la SC, comprobaban
  `estadoCompra === "por_procesar"` y guardaban el documento entero (`sc.save()`). Si otra pestaña llevaba la línea a
  una licitación entre la lectura y el guardado, el `save` la pisaba (la línea quedaba anulada o editada estando ya
  en licitación).
- **Archivo:** `src/routes/solicitudesCompra.js`.
- **Regla:** la escritura es un `updateOne` condicionado con
  `{ _id, items: { $elemMatch: { _id: lineaId, estadoCompra: "por_procesar" } } }` y `$set` sobre `items.$.*`.
  Si `matchedCount === 0` → **400** «Solo se puede editar/anular una línea por procesar». La respuesta se arma con la
  SC releída. `anularOrigenDeLinea` recibe la SC y la línea releídas.
- **Prueba:** `test/revisionCompras.test.js` «anular o editar una línea que otra pestaña acaba de llevar a licitación
  no la pisa» (intercepta `SolicitudCompra.findById` llamado desde `buscarLinea` y cambia la línea a `en_licitacion`
  justo después de la lectura; espera 400 y la línea sigue `en_licitacion`).

### B2. Anular una OC a proveedor solo libera las líneas que siguen siendo de esa OC — `dc1004f`

- **Problema:** `PATCH /api/ordenes-compra-proveedor/:id/anular` devolvía a «por procesar» todas las líneas de SC
  referidas en los ítems de la OC, aunque una ya perteneciera a otra OC.
- **Archivo:** `src/routes/ordenesCompraProveedor.js`.
- **Regla:** filtrar `afectadas` con `String(linea.ordenCompraProveedor) === String(doc._id)`.
- **Prueba:** «anular una OC solo devuelve las líneas que siguen siendo de esa OC» (la línea reasignada a otra OC
  queda `adjudicado` con su OC; la otra vuelve a `por_procesar`).

### B3. Fecha de entrega imposible al adjudicar una licitación → 400 — `dc1004f`

- **Problema:** `Date.parse("2026-02-31")` no es `NaN` (JS la corre al 03/03), así que una fecha imposible se aceptaba.
- **Archivo:** `src/routes/licitaciones.js` (`POST /:id/adjudicar`).
- **Regla:** además de `Date.parse`, si el valor es `YYYY-MM-DD`, exigir que
  `new Date(`${v}T12:00:00Z`).toISOString().slice(0, 10) === v`; si no → **400** «Fecha de entrega inválida para …».
- **Prueba:** «adjudicar con una fecha de entrega imposible → 400».

### B4. Retención de 4ta categoría solo en recibos por honorarios mayores a S/ 1,500 — `dc1004f`

- **Problema:** se aceptaba la retención de 4ta (8 %) en cualquier recibo por honorarios (02); la ley solo la exige
  cuando el recibo supera S/ 1,500.
- **Archivos:** `src/utils/impuesto.js` (constante `UMBRAL_RETENCION_4TA = 1500`), `src/routes/facturasProveedor.js`
  (`POST /`).
- **Regla:** si `impuesto.tipo === "retencion4ta"` y `!(round2(total × tipoCambio) > 1500)` → **400**
  «La retención de 4ta solo va en recibos mayores a S/ 1,500». Estrictamente mayor (1,500.00 exactos no retiene).
- **Pruebas:** «la retención de 4ta solo va en recibos mayores a S/ 1,500» (1,000 → 400 con el mensaje; 1,500.01 → 201).
  `test/resumenTributario.test.js` sube los RH de prueba de 1,000 a 2,000 (retención 80 → 160) porque con 1,000 ya no
  se permite retener.

### B5. Notas de crédito simultáneas no pasan el total del comprobante de origen — `dc1004f`

- **Problema:** dos NC de proveedor sobre el mismo comprobante, registradas a la vez, leían las notas previas en
  transacciones paralelas y ambas pasaban el tope «suma de NC ≤ total del origen».
- **Archivo:** `src/routes/facturasProveedor.js` (`POST /`, rama de notas).
- **Regla:** dentro de la transacción y **antes** de leer las notas del origen, escribir en el origen
  (`FacturaProveedor.collection.updateOne({ _id: origen._id }, { $set: { updatedAt: new Date() } }, { session })`):
  la segunda transacción choca (WriteConflict), `conTransaccion` la reintenta y ya ve la primera nota.
- **Prueba:** «NC simultáneas sobre un comprobante pagado no pasan su total» (3 NC de 59 sobre un total de 118 en
  paralelo: exactamente 2 → 201 y la suma vigente ≤ 118). Necesita Mongo en replica set.

### B6. Receptor del CPE normalizado en el servidor; boleta a «clientes varios» — `bc31672`

- **Problema:** el `schemeID` del receptor se copiaba del body a un **atributo** del XML (`schemeID="${...}"`):
  un valor con comillas inyectaba atributos. No se exigía RUC en factura ni el largo de RUC/DNI. La pantalla mandaba
  `0` («Sin documento») para boletas sin cliente, que el RVIE rechaza (RS 112-2021, anexo 1, tabla 6).
- **Archivos:** `src/utils/receptorCpe.js` (nuevo: `normalizarReceptor`, `normalizarReceptorNota`,
  `CLIENTES_VARIOS`, `TIPOS_DOC_IDENTIDAD`, `TOPE_SIN_IDENTIFICAR`), `src/controllers/comprobante.controller.js`
  (`emitirFacturaBoleta`, `emitirNotaCreditoSinCandado`, `emitirNotaDebito` ya no desestructuran `receptor` del body).
- **Regla (todo antes de reservar el correlativo):**
  - Tipo de documento en lista blanca del catálogo 06: `0 1 4 6 7 A B C D E`, más `-`. Si falta, se deriva del largo
    (11 → `6`, otro → `1`).
  - `6` → 11 dígitos; `1` → 8 dígitos; número no vacío y ≤ 15; nombre no vacío. Si no → 400.
  - Factura (`01`) solo con RUC (`6`).
  - **Clientes varios** (`schemeID "-"`, o `numDoc "-"`, o el antiguo `"0"` sin número en boleta): solo boleta
    (`03`), solo en PEN y total ≤ S/ 700. Se emite `{ schemeID: "-", numDoc: "-", nombre: "CLIENTES VARIOS" }`.
    Base legal: RS 007-99/SUNAT art. 8 num. 3.10. Aceptado por SUNAT demo (B099-3, 2026-10-02).
  - NC/ND: el mismo criterio; `-` solo si `tipoDocRef === "03"`.
- **Prueba:** `test/revisionVentasSire.test.js` «receptor: boleta a clientes varios…» y «receptor: factura con RUC;
  DNI de 8 dígitos; tipo de documento del catálogo 06…».

### B7. `tipoOperacion` lo decide el servidor — `bc31672`

- **Problema:** `tipoOperacion` se tomaba del body (va al atributo `listID` del XML).
- **Archivo:** `src/controllers/comprobante.controller.js`.
- **Regla:** `tipoOperacionFinal = detraccion?.aplica ? "1001" : "0101"`. Se elimina `TIPO_OPERACION_DETRACCION`.
- **Prueba:** cubierta por B8 (los únicos códigos que pedían 1002–1004 ahora son 400) y por revisión de código: el
  body ya no se lee.

### B8. Detracción 004/026/027 → 400 antes del correlativo — `bc31672`

- **Problema:** recursos hidrobiológicos (004) y transporte de pasajeros/carga (026/027) van con operación
  1002/1003/1004 y datos adicionales (embarcación, ruta, vehículo) que el builder no arma: SUNAT rechazaba la factura
  después de gastar el número.
- **Archivo:** `src/utils/detraccionCpe.js` (`SIN_OPERACION_1001 = ["004","026","027"]`, al inicio de
  `detraccionDelCpe`, que se llama antes de `SerieCorrelativo.siguiente`).
- **Regla:** `detraccion.aplica && codigoBien ∈ {004, 026, 027}` → **400** «Esa detracción (recursos hidrobiológicos o
  transporte) necesita datos que la factura aún no emite».
- **Prueba:** «detracción en ventas: 004, 026 y 027 (operaciones 1002–1004) → 400 antes del correlativo».

### B9. Parser SIRE más robusto y carga manual validada — `bc31672`

- **Archivos:** `src/utils/sireParser.js` (`leerPropuesta`, `validarPropuesta` nueva), `src/routes/sire.js`
  (`POST /:libro/:periodo/archivo` llama `validarPropuesta(comprobantes, { ruc: getEmisor().ruc, periodo })`).
- **Reglas:**
  - ZIP que `adm-zip` no abre, o `getData()` que lanza (CRC dañado, cifrado, tamaño falso) → **400**, no 500.
  - Sin ningún `.txt` reconocible (ZIP sin `.txt`, `.xlsx`, archivo vacío) → **400** «El archivo no es una propuesta
    del SIRE…» (antes devolvía 0 filas y pisaba la carga buena). Un `.txt` con solo una cabecera válida es un mes sin
    movimientos (devuelve `[]`).
  - Textos recortados: 20 caracteres por campo, razón social 200 (evita pasar los 16 MB de un documento de Mongo).
  - Filas sin tipo, serie ni número (solo separadores) se descartan.
  - Las columnas **RUC** y **Periodo** pasan a ser obligatorias en el formato con cabecera; en el RVIE sin cabecera
    son las posiciones 0 y 2 (y la 9 es «Nro final (rango)»). `validarPropuesta`: RUC distinto al del emisor → 400
    «El archivo es de otra empresa…»; periodo distinto al elegido → 400 «El archivo trae filas de otro periodo…».
- **Prueba:** «propuesta SIRE: ZIP dañado o sin .txt → 400; textos recortados; separadores descartados; RUC y periodo
  por fila».

### B10. Conciliación RVIE: boletas sin documento del cliente y consolidadas por rango — `bc31672`

- **Problema:** la clave de conciliación incluía el documento del cliente; a «clientes varios» el sistema guarda `-` y
  el SIRE lo deja vacío, así que nunca emparejaban. Las boletas < S/ 700 consolidadas por día (número inicial–final)
  quedaban como «solo SIRE».
- **Archivos:** `src/utils/conciliacionSire.js` (`clave(r, libro)`, `conciliarRango`, `conciliar(…, { libro })`),
  `src/models/PropuestaSire.js` (campo `numeroFinal`), `src/routes/sire.js` (pasa `{ libro }`).
- **Regla:** en `RVIE`, para tipo `03` o serie que empieza con `B`, la clave omite el RUC/documento del cliente. Si
  `numeroFinal > numero`, se suman las boletas del sistema de ese tipo+serie en el rango (total e IGV) y se comparan
  contra la fila del SIRE. En RCE (compras) y sin libro (comparar-carga) el RUC sigue en la clave.
- **Prueba:** «conciliar RVIE: boletas sin documento del cliente y consolidadas por rango».

## 3. Arreglos — Frontend

### F1. Casilla «Retener 4ta» solo en recibos mayores a S/ 1,500 — `9afa81ba`

- **Archivo:** `src/components/tesoreria/ModalFacturaProveedor.jsx`.
- **Regla:** en recibo por honorarios (02), `imp.tipo = "retencion4ta"` solo si la casilla está marcada **y**
  `total × tipoCambio > 1500`; si no supera, en lugar de la casilla se muestra «La retención de 4ta (8 %) solo va en
  recibos mayores a S/ 1,500.». El servidor (B4) es quien valida.
- **Verificación:** `npm run build`; manual: registrar un RH de 1,000 (no aparece la casilla) y uno de 2,000 (aparece).

### F2. Opción «Clientes varios» con tipo y número `-`; cuotas exactas — `22a8db9e`

- **Archivos:** `src/utils/catalogosSunat.js`, `src/utils/catalogosSunat.test.js` (nuevo),
  `src/pages/EmitirComprobante.jsx`.
- **Reglas:**
  - `TIPO_DOC_RECEPTOR`: la opción `0 — Sin documento (varios)` se reemplaza por
    `{ valor: "-", label: "Clientes varios (boletas hasta S/ 700)" }`. `documentoValido("-", v)` solo si `v === "-"`.
  - Al elegir `-` el receptor queda `{ schemeID: "-", numDoc: "-", nombre: "CLIENTES VARIOS" }` con número y nombre
    deshabilitados; al salir de `-` se limpian.
  - Boleta con `-` y total > 700 o moneda distinta de PEN → error de formulario (antes: `>= 700` con `0`).
  - Cuotas de crédito: la suma debe ser **exacta** al neto pendiente (`>= 0.005` es error; antes ±0.01), porque SUNAT
    rechaza con 3319 un crédito cuyas cuotas no suman el monto.
- **Prueba:** `src/utils/catalogosSunat.test.js` «clientes varios: tipo y número '-'…».

## 4. Pendiente detectado (no está en el origen, no se porta)

- El selector de detracción del frontend (`DETRACCION_BIENES_SERVICIOS` en `src/utils/catalogosSunat.js`) todavía
  ofrece 004/026/027; el backend ahora responde 400 para ellos. El skill `sunat-cpe-ubl21` §16 recomienda quitarlos del
  selector. Igual en INTALES `main`.

## 5. Verificación

- Backend (Mongo local en replica set, nunca el `.env`):
  `MONGO_URI_TEST="mongodb://localhost:27017/sipapp-intales-test-contaoficial?replicaSet=rs0" npm test`.
- Frontend: `npm test` y `npm run build`.
- TDD: las pruebas nuevas (`test/revisionCompras.test.js`, `test/revisionVentasSire.test.js`,
  `src/utils/catalogosSunat.test.js`) se corrieron contra el código del destino **antes** del arreglo (deben fallar) y
  después (deben pasar). Resultado en §6.

## 6. Resultado del port

_(se completa al terminar)_
