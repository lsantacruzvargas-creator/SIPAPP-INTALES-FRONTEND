# Bloqueo de edición (uno edita, los demás ven) — Diseño

**Fecha:** 2026-09-28 · **Proyecto:** SIPAPP-INTALES · **Estado:** diseño aprobado por secciones, pendiente de revisión escrita

## Objetivo

Que dos personas no editen a la vez el mismo documento sensible. Quien pulsa **"Editar"** toma el
documento; cualquier otro que lo abra lo ve en **solo lectura** con el aviso
**"En edición por {usuario} desde las {hh:mm}"**. El servidor lo exige también, aunque alguien se
salte la pantalla.

## Decisiones confirmadas con el usuario (2026-09-28)

| Tema | Decisión |
|---|---|
| Alcance | Todo el sistema: Comercial, Facturación, Compras y Tesorería, Almacén y catálogos |
| Cuándo se toma | Botón **"Editar"** (los detalles abren en solo lectura) |
| Documento ocupado | Mensaje con el usuario que lo está editando y desde cuándo |
| Inactividad | Se libera a los **15 min sin actividad**; cierre de ventana o caída de red ≈ 2 min |
| Liberación forzada | **Nadie** fuerza: solo se espera (guardar/cancelar/cerrar o vencimiento) |
| Enfoque | **A** — registro central de bloqueos con vencimiento + verificación de versión al guardar |

## Fuera de alcance

- **Crear** documentos nuevos (no hay nada que tomar).
- Movimientos de Tesorería (pagos, cobros, anulación de movimientos): ya corren en transacciones
  que recalculan saldos y detectan conflictos.
- Notificar al que tiene el documento que otro lo necesita (descartado: "solo esperar").

## Modelo de datos — `BloqueoEdicion` (nuevo)

| Campo | Tipo | Notas |
|---|---|---|
| `entidad` | String | `"cotizacion"`, `"ordenCompra"`, `"ordenTrabajo"`, `"factura"`, … (catálogo en `utils/entidadesBloqueo.js`) |
| `documento` | ObjectId | id del documento tomado |
| `usuario` | ObjectId | quien lo tomó |
| `usuarioNombre` | String | para el aviso |
| `clave` | String | aleatoria por cada "Editar" (distingue ventanas del mismo usuario) |
| `tomadoEn` | Date | |
| `ultimaActividad` | Date | último latido con actividad |
| `expiraEn` | Date | vencimiento; índice TTL borra los vencidos |

Índices: único `{ entidad, documento }`; TTL `{ expiraEn: 1 }, expireAfterSeconds: 0`. Como el TTL
de MongoDB corre cada ~60 s, toda consulta trata `expiraEn < ahora` como **libre** sin esperar al borrado.

## Reglas

1. **Tomar** (`POST /api/bloqueos { entidad, documento }`): una sola operación atómica
   `findOneAndUpdate({ entidad, documento, $or: [{ expiraEn: { $lt: ahora } }, { clave: <propia> }] }, { $set: … }, { upsert: true })`.
   Si otro lo tiene vigente, el upsert choca con el índice único → **423** con
   `{ mensaje: "En edición por Ana desde las 10:32", usuarioNombre, tomadoEn, propio: false }`.
   Si lo tiene el mismo usuario con otra clave → `propio: true` → "En edición por ti en otra ventana".
   Responde `{ clave, expiraEn, version }`, donde `version` es el `updatedAt` actual del documento.
2. **Latido** (`PUT /api/bloqueos/:clave { activo }`), cada 60 s mientras el formulario está abierto.
   Si `activo` (hubo teclado/clic/escritura en el último minuto) → `ultimaActividad = ahora`.
   Si `ahora − ultimaActividad < 15 min` → `expiraEn = ahora + 2 min`; si no, no se extiende y vence solo.
   Si el bloqueo ya no existe o es de otra clave → **410** (la pantalla muestra "se liberó").
3. **Soltar** (`DELETE /api/bloqueos/:clave`): al guardar con éxito, cancelar o cerrar el detalle;
   al cerrar la ventana/app se envía con `fetch(..., { keepalive: true })`. Idempotente.
4. **Consultar** (`GET /api/bloqueos/:entidad/:documento`): estado actual para pintar la barra al abrir.
5. **Exigir en el servidor** — middleware `exigeBloqueo(entidad, { param = "id" })` en toda ruta que
   modifique un documento existente de esa entidad (PUT, PATCH, DELETE y POST sobre `/:id/…`: editar,
   anular, cambiar estado, archivos, eliminar). Lee `X-Bloqueo` (clave) y, solo en los guardados de
   formulario (PUT `/:id`), `X-Version` (updatedAt anotado): las acciones puntuales no mandan datos
   viejos del formulario, y así varias acciones seguidas no chocan consigo mismas:
   - sin clave, clave ajena o bloqueo vencido → **423** "En edición por {usuario}" o "Pulsa Editar
     antes de guardar";
   - `X-Version` distinto del `updatedAt` actual → **409** "Este documento cambió desde que lo abriste — recarga";
   - si pasa, la ruta sigue normal. El bloqueo **no** se suelta en el servidor: lo suelta la pantalla
     tras el guardado exitoso (una edición puede requerir varias llamadas, p. ej. 409 de recálculo + confirmación).
6. **Permisos**: tomar exige el mismo permiso de edición que la ruta (`puedeEditar` del módulo); quien
   no puede editar no ve "Editar". El catálogo `utils/entidadesBloqueo.js` define por cada entidad
   `{ modelo, roles }`: el modelo Mongoose (para verificar que el documento existe y leer su
   `updatedAt`) y los roles que pueden editarla, iguales a los de sus rutas. Una entidad que no está
   en el catálogo → 400.
7. **Documento anulado o eliminado** mientras está tomado: quien anula o elimina ya tiene el bloqueo
   (propio o temporal) y la pantalla lo suelta al terminar; si ese aviso no llega, vence en ≤ 2 min.

## Frontend

### Hook `useBloqueoEdicion(entidad, id)`
Devuelve `{ estado: "lectura" | "editando" | "ocupado" | "liberado", ocupadoPor, desde, editar(), soltar(), headers }`.
- `editar()` → POST tomar; guarda `clave` y `version`; pasa a `editando` u `ocupado`.
- Mientras `editando`: escucha `keydown`, `mousedown`, `input` en la ventana; cada 60 s envía el
  latido con `activo`; un 410 pasa a `liberado`.
- `soltar()` → DELETE; al desmontar el detalle y en `beforeunload` (con `keepalive`) también suelta.
- `headers` = `{ "X-Bloqueo": clave, "X-Version": version }`, que los guardados agregan a `fetchAuth`.
- Lógica pura (qué hacer con cada respuesta, cuándo marcar actividad) en `utils/bloqueo.js` con tests `node:test`.

### Componente `<BarraEdicion>`
En la cabecera de cada detalle:
- **lectura** → botón **"Editar"** (solo con permiso);
- **ocupado** → aviso ámbar "En edición por Ana desde las 10:32 — solo lectura";
- **editando** → indicador "Estás editando" + **"Cancelar"** (guardar suelta y vuelve a lectura);
- **liberado** → "Tu edición se liberó tras 15 min sin actividad"; "Editar" vuelve a tomar y, si
  la versión cambió, recarga el documento antes de habilitar.
Los mensajes 423/409 de los guardados se muestran en esta barra (nunca `alert`).

### Enganche
- **Detalles** (`DetalleCotizacion`, `DetalleOrdenCompra`, `DetalleOrdenTrabajo`, `DetalleSubOT`,
  `DetalleFactura`, …): el `<fieldset disabled>` suma `estado !== "editando"`.
- **Acciones puntuales** (anular, cambiar estado, eliminar): `conBloqueo(entidad, id, fn)` toma,
  ejecuta y suelta; si está ocupado muestra "En edición por {usuario}".
- **Tablas de catálogo** (centros de costo, tipo de cambio, almacén, tarifas, máquinas, …): el
  "Editar" de cada fila toma el bloqueo de ese registro; eliminar usa `conBloqueo`.

## Despliegue por fases

Cada fase se prueba sola y puede mergearse sola.

| Fase | Contenido |
|---|---|
| 0 — Infraestructura | modelo, `/api/bloqueos`, `exigeBloqueo`, catálogo de entidades, hook, `BarraEdicion`, `conBloqueo`, `utils/bloqueo.js` |
| 1 — Comercial | cotizaciones, OC del cliente, OT y sub-OT, informes, notificaciones de trabajo, ingresos de equipo |
| 2 — Facturación | facturas de venta (incluye `PATCH /impuesto`) y CPE antes de emitir |
| 3 — Compras y Tesorería | solicitudes de compra, licitaciones / cuadro comparativo, anular OCP, anular factura de proveedor, cuentas de tesorería, configuración |
| 4 — Almacén y catálogos | requerimientos, servicios externos, materiales, categorías de material y componente, tipos de componente, ubicaciones, centros de costo, tipo de cambio, máquinas, catálogo de servicios, empresas, personal/tarifas, usuarios |

## Verificación

- **Fase 0** (`node:test`, replica set): dos tomas simultáneas → gana una; bloqueo vencido se toma;
  latido sin actividad ≥ 15 min no extiende; 410 tras vencer; misma persona otra clave → `propio`;
  middleware: sin clave / clave ajena → 423, versión vieja → 409, clave vigente → pasa.
- **Cada fase de módulo**: un test que recorre **todas** las rutas PUT/PATCH/DELETE del módulo y
  comprueba 423 sin bloqueo (ninguna ruta sin proteger); los tests existentes de esas rutas pasan
  con un bloqueo tomado por el helper de tests.
- **Playwright con dos sesiones** al cierre de cada fase: Ana pulsa Editar, Luis abre el mismo
  documento y ve solo lectura con el aviso; Ana guarda y Luis puede tomarlo.
- Frontend: tests de `utils/bloqueo.js`, lint sin errores nuevos, build.

## Riesgos y notas

- Los detalles pasan de "abren editables" a "abren en lectura": cambio de hábito, avisar a los usuarios.
- Rutas que hoy editan desde listas (p. ej. cambios rápidos de estado) necesitan `conBloqueo`; el
  test por módulo detecta las que falten.
- Procesos automáticos que modifican documentos (cobros de Tesorería, sincronización de cadena,
  CPE) no toman bloqueo; si cambian un documento en edición, el editor recibe 409 al guardar (esperado).

## Estado (2026-09-29)

**Fases 0 y 1 implementadas** en la rama `feature/bloqueo-edicion` (Backend y Frontend), sin mergear. Backend 113/113, frontend 22/22, build OK. Recorrido Playwright con dos sesiones en cotización, OT, OC del cliente, ingresos de equipo y notificación de trabajo (esta por API).

Decisiones tomadas en la ejecución y la revisión final:
- La versión (`X-Version`) solo se exige en los PUT de formulario; las acciones solo exigen el bloqueo.
- La versión del formulario se fija al abrir el documento. Tras una acción desde lectura solo se adopta la nueva si el documento seguía igual (`versionTrasAccion`); si no, "Editar" avisa que cambió.
- `sincronizarCadena`, `heredarTituloCotizacion` y los recálculos de estado de OT solo escriben documentos cuyo valor cambia (antes cambiaban `updatedAt` de toda la cadena en cada guardado y provocaban 409 a otros editores).
- La entidad `ordenTrabajo` se puede tomar con cualquier rol (sus rutas de archivos y vínculo no filtran por rol).
- Anular/eliminar no necesita código de servidor para descartar el bloqueo (regla 7).

Pendientes:
- Fases 2 (Facturación), 3 (Compras y Tesorería) y 4 (Almacén y catálogos), cada una con su plan.
- Menores diferidos de la revisión final: Electron limpia la sesión antes de cerrar (el aviso de soltar da 401 y queda el vencimiento de 2 min); doble clic en "Editar"; 423 con bloqueo vencido no pasa a "liberado" hasta el siguiente latido; `crearCotizacion` en la OT ignora el resultado de vincular; entidad `"constructor"` da 500; latido no atómico; eventos `app:cambio-guardado` por cada latido; barra en "cargando" si falla la consulta inicial; PUT de notificación sin versión; `POST /informes` cambia el estado de la OT sin bloqueo.

## Estado (2026-09-29, Fase 2)

**Fase 2 (Facturación) implementada** en la misma rama `feature/bloqueo-edicion`, sin mergear. Backend 116/116, frontend 22/22, build OK, Playwright con dos sesiones.
- Se bloquea la factura de venta: `PUT` (con versión), anular y cambiar impuesto. CPE queda fuera: emitir crea, lo emitido no se edita y `vincular-factura` es el último paso de una creación.
- "Registrar cobro" sigue disponible en solo lectura y se deshabilita mientras se edita (no descarta cambios sin guardar).
- `Comprobante.sincronizarFactura` solo escribe si cambia (antes una consulta a SUNAT daba "cambió" a quien editaba la factura).
- Menores diferidos: `ModalEditarFactura.jsx` es código muerto con PUT sin bloqueo; el 409 "cambió" se muestra dos veces en el detalle.
- Pendientes: Fases 3 (Compras y Tesorería) y 4 (Almacén y catálogos).

## Estado (2026-09-29, Fase 3)

**Fase 3 (Compras y Tesorería) implementada** en la misma rama, sin mergear. Backend 118/118, frontend 22/22, build OK, Playwright con dos sesiones.
- Entidades `solicitudCompra`, `licitacion`, `ordenCompraProveedor` (roles de Compras) y `facturaProveedor` (roles de Tesorería); 12 rutas protegidas; el `PUT` de la licitación exige versión.
- El cuadro comparativo abre en solo lectura; "Guardar cuadro", "+ Invitar proveedor" y "Generar OC(s)" exigen "Editar" y usan el mismo bloqueo del cuadro. El PDF de solicitud y las cotizaciones adjuntas se pueden ver en lectura.
- Acciones de tablas (líneas de SC, anular licitación/OCP/factura de proveedor, subir PDF) con bloqueo temporal.
- `useBloqueoEdicion` anota la primera versión conocida cuando el documento se carga después de montar.
- Fuera de alcance: configuración y cuentas de tesorería (interruptores de un campo), crear licitación/SC/factura de proveedor, movimientos.
- Menores diferidos (se resuelven al final): ediciones rápidas de líneas de la misma SC chocan con el bloqueo propio; falta test de versión del PUT de licitación; "Guardar cuadro" no suelta el bloqueo.
- Pendiente: Fase 4 (Almacén y catálogos) — implementada, ver abajo.

## Estado (2026-09-29, Fase 4)

**Fase 4 (Almacén y catálogos) implementada** en la misma rama, sin mergear. Backend 123/123, frontend 24/24, build OK, Playwright con dos sesiones (empresa, material, pago de requerimientos) y revisión final con dos Important corregidos.
- 13 entidades nuevas (requerimiento, servicioExterno, material, categoriaMaterial, categoriaComponente, tipoComponente, ubicacion, catalogoServicio, centroCosto, maquina, empresa, personal, usuario) y 27 rutas protegidas. Con versión: los `PUT` de formulario (material, ubicación, categorías, tipo de componente, catálogo de servicios, empresa, personal, usuario). Sin versión: acciones de requerimientos y servicios, `PUT` de centro de costo y máquina (cambios de un campo desde la tabla), eliminaciones y tarifa/hora.
- El "Editar" de cada fila abre el formulario y **lo toma solo** (`useBloqueoEdicion(..., { autoEditar: true })`). Si estaba ocupado, queda en solo lectura con el aviso; al liberarse aparece "Editar" (no se retoma solo). Las pantallas de catálogo recargan la lista al cerrar la edición.
- `editar()` ignora clics repetidos y suelta la toma si el formulario se cerró o cambió de fila antes de la respuesta (resuelve también el "doble clic en Editar" de la Fase 1).
- Pagar varios ítems se hace en serie con bloqueo temporal por ítem; si alguno falla, se informa "N de M no se pudieron marcar…".
- Fuera de alcance: tipo de cambio y movimientos de almacén (sin escrituras sobre `/:id`), crear registros.
- Menores diferidos (se resuelven al final): `servicioExterno` con `roles: null` deja a técnicos tomar el bloqueo por API; "Activo" del material que uno mismo edita choca consigo mismo; cambiar el Tipo seleccionado deja oculta la edición de una categoría de componente; doble recarga al guardar en Almacén; errores de acciones de fila de Almacén lejos de la fila; `SelectorEmpresas` no recarga la lista del formulario padre al cerrar `ModalEmpresa`.
- Decisiones: `liberarTipo` (centros de costo) y `anularLineasPorOrigen` escriben sin bloqueo (acciones de un campo / cambio real que da 409 correcto); abrir un modal de catálogo toma el registro aunque sea solo para ver.
- Con esto quedan implementadas las 4 fases. Siguiente: resolver todos los menores diferidos y decidir el merge.

## Menores de la Fase 1 — cierre (2026-09-30)

Resueltos:
- Cerrar sesión o cerrar la app (Electron) suelta los bloqueos de la ventana **antes** de borrar el token (`utils/bloqueosActivos.js`; `logout()` y `electron/main.cjs` llaman `soltarTodos`, con espera máxima de 1,5 s).
- Si el bloqueo propio venció, el guardado rechazado (423) pasa en el acto a "se liberó", con los cambios aún en pantalla (`edicionPerdida`).
- Crear cotización desde la OT avisa si no se pudo vincular ("Se creó la cotización X, pero no se pudo vincular a la OT: …").
- Entidades heredadas de Object (`constructor`, `toString`, `__proto__`…) → 400 (`Object.hasOwn`).
- Tomar, latido y soltar no disparan `app:cambio-guardado` (`sinAvisoGuardado`).
- Si la consulta inicial falla, la barra pasa a estado `error` con el motivo y "Reintentar".
- Doble clic en "Editar": resuelto en la Fase 4 (guarda `tomando`).

Decididos con el usuario (sin cambio): latido no atómico (carrera de milisegundos sin daño a datos); PUT de notificación sin versión (nada más la modifica sin bloqueo y "Editar" ya detecta cambios); `POST /informes` cambia el estado de la OT sin bloqueo.

## Cambio de modelo: abrir = editar (2026-09-30, decidido con el usuario)

Reemplaza "Cuándo se toma: botón Editar" e "Inactividad: 15 min" de la tabla de decisiones.
- Quien **abre** un documento con permiso (y el documento no está anulado ni con cadena cerrada) lo edita de inmediato; no hay botón "Editar" ni "Cancelar edición". Quien llega después lo ve en solo lectura con "En edición por X desde las HH:mm".
- Si el documento se libera mientras otro lo está viendo, esa persona **sigue en lectura** con "Ya está libre: sal y vuelve a entrar para editarlo" (estado `libre`); no se toma solo.
- Guardar no suelta el bloqueo: se suelta al cerrar la pantalla, cerrar sesión o cerrar la app (y "Guardar cuadro" ya no necesita soltar).
- Inactividad: **5 min** sin actividad libera el documento. Si el bloqueo propio venció, la barra ofrece "Retomar edición" (los cambios siguen en pantalla).
- "Registrar cobro" en la factura: como quien la abre siempre está editando, pide confirmación ("los cambios sin guardar se pierden") en lugar de estar deshabilitado.
- Pantallas: cotización, OC, OT, sub-OT, factura, notificación de trabajo, cuadro comparativo, ingreso de equipos y los catálogos de la Fase 4.

## Cierre y merge (2026-09-30)

Mergeado a `main` y pusheado (Backend `ef62b68`, Frontend `b3dd45f9`). Backend 127/127, frontend 35/35.
- Menores de las Fases 2–4 resueltos (ModalEditarFactura borrado; aviso único 409/423; cola por SC; test de versión de licitación; técnicos no toman servicios externos; Activo/eliminar del registro en edición; cambio de Tipo; una recarga; avisos de fila; `GET /empresas/:id` y ModalEmpresa relee).
- Revisión final: tras una acción propia solo se adopta la versión nueva si nadie cambió el documento antes (`versionPrevia`); crear sub-OT desde el padre en edición usa su bloqueo; reintento de la toma; se suelta si el documento deja de ser editable; textos sin el botón «Editar».
- Pendiente de decisión del usuario: con "abrir = editar", quien abre una OT/factura/notificación solo para mirar la retiene ~5–7 min; mientras tanto técnicos (progreso, encargado, fotos), Tesorería (impuesto de la factura) y jefatura (anular líneas de notificación) reciben "En edición por…".
- Menores diferidos: "cambió" justo al abrir si la lista estaba vieja (salvo empresas); la confirmación de "Registrar cobro" sale aunque no haya cambios; reabrir muy rápido el mismo documento puede verse como "por ti en otra ventana"; una respuesta 200 no-JSON deja la barra en "cargando"; anular línea de SC no pasa por la cola; `keepalive` en DELETE entre orígenes (Electron) sin verificar.
