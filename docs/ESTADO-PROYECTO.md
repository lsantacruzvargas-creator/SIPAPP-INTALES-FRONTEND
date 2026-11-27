# Estado del proyecto SIPAPP-INTALES — punto de entrada para agentes

**Actualizado:** 2026-11-04 · **Idéntico en** `docs/` de los repos Backend y Frontend (y en `docs/` de la carpeta raíz).

Léelo antes de tocar código. Responde al usuario **en español, conciso**; él decide lo de negocio y pide el merge a
`main` explícitamente (nunca mergear ni subir `main` sin su OK).

## 1. Repositorios y entorno

| | Ruta local | Remoto | Rama estable |
|---|---|---|---|
| Backend (Node 24 ESM, Express 4, Mongoose 8) | `C:\SIP-APP\SIPAPP-INTALES\Backend` | `SIPAPP-INTALES-BACKEND` | `main` |
| Frontend (React 19, Vite, Tailwind; Electron) | `C:\SIP-APP\SIPAPP-INTALES\Frontend` | `SIPAPP-INTALES-FRONTEND` | `main` |

- La carpeta raíz `C:\SIP-APP\SIPAPP-INTALES` **no es repo**: sus `docs/` son la copia de trabajo; lo que importa se
  copia a `docs/` de cada repo.
- `main` despliega solo (Railway/Cloudflare) pero **el sistema aún no está en producción**: no hacen falta scripts de
  migración de datos. El destino final es un **servidor físico privado del cliente, detrás de Cloudflare** (túnel),
  con MongoDB local en replica set.
- Grafo de conocimiento: `graphify query "<pregunta>"` antes de explorar; tras cambiar código, `graphify update .`.

### Comandos

- Tests backend (necesitan MongoDB con replica set):
  `MONGO_URI_TEST="mongodb://localhost:27017/sipapp-intales-test?replicaSet=rs0" npm test` (≈ 90 s; 254 tests, 1 omitido
  a propósito). Redirigir la salida a un archivo y leer el final.
- Tests frontend: `npm test` (node --test, 69). `npm run build`. Lint: solo archivos tocados; hay errores de lint
  **previos** en `EmitirComprobante.jsx`, `EmitirGuia.jsx`, `ListaComprobantes.jsx`, `ModalCrearFactura.jsx`,
  `Dashboard.jsx` y `cotizacionPdf.js` (no los introdujo nadie reciente; no confundir con regresiones).
- E2E (Playwright MCP): MongoDB temporal en 27018 (`sipapp-intales-e2e`, replica set rs0).
  - Backend: `PORT=8090 MONGO_URI="mongodb://localhost:27018/sipapp-intales-e2e?replicaSet=rs0" FRONTEND_URL=http://localhost:5180 node src/index.js`
  - Frontend: `VITE_API_URL=http://localhost:8090/api npx vite --port 5180 --strictPort --force`
  - Usuarios: `e2e_jefa`, `e2e_asis`, `e2e_sup`, `e2e_fact` (clave `E2e-Clave-2026`). Detener con `taskkill` por PID
    (`Get-NetTCPConnection -LocalPort 8090,5180`). Un toast puede tapar clics: usar `dispatchEvent('click')`.
  - No emitir comprobantes reales ante SUNAT en E2E.

### Variables de entorno (ver `Backend/.env.example`)

`MONGO_URI`, `JWT_SECRET`, `HUB_BASE_URL`/`HUB_API_KEY` (hub SUNAT), `SUNAT_ENVIRONMENT` (`demo`|`produccion`),
`RUC_EMISOR`/`RAZON_SOCIAL_EMISOR`, `APIPERU_TOKEN`, y las nuevas de seguridad:
- `PROXIES_CONFIABLES`: IPs/CIDR de proxies locales además de Cloudflare y loopback (si no se pone y hay otro proxy,
  todos los usuarios comparten el límite de intentos).
- `APIPERU_MAX_HORA` (por defecto 60): tope global de consultas pagadas a apiperu.
- `HUB_TIMEOUT_MS` (por defecto 60000): tope de espera al hub SUNAT.

El tope de apiperu y el candado de emisión de NC viven **en memoria**: asumen un solo proceso Node (sin PM2 cluster).

## 2. Flujo de trabajo acordado con el usuario

- Cambios grandes: superpowers **brainstorming → spec → writing-plans → executing-plans** inline, TDD (test que falla
  primero), ledger en `.superpowers/sdd/<plan>/progress.md` (se copia a `docs/superpowers/sdd/` de los repos al cerrar),
  Playwright, y **revisión final de toda la rama con un agente opus**. Critical/Important se corrigen con test;
  los menores se anotan en el spec ("Estado") y se informan.
- Ramas `feature/<tema>` en **ambos** repos desde `main`; commit con trailer
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; merge `--no-ff` a `main` solo cuando el usuario lo pide,
  con la suite verde sobre el resultado del merge.
- Reglas de código: fechas siempre en hora Lima (guardar `YYYY-MM-DD` como medianoche Lima, `aFechaLima`); nunca
  `alert/confirm/prompt` (Electron); errores `400 { mensaje }`; validar en el servidor; listas blancas de campos.
- Skills globales útiles: `contabilidad-peru` (PCGE, asientos, TC, SIRE/PLE, CONCAR/StarSoft, casos de prueba),
  `erp-reglas-datos`, `express-async-crash-audit`, `sunat-cpe-ubl21`.

## 3. Qué hay en `main` (2026-10-02)

| Área | Estado | Spec / registro |
|---|---|---|
| Compras (SC → licitación → OC a proveedor) | En main | `docs/superpowers/specs/2026-09-25-compras-design.md` |
| Tesorería B1 (facturas de proveedor, pagos/cobros, detracción/retención, SIRE) | En main | `docs/superpowers/specs/2026-09-28-tesoreria-b1-design.md` |
| Bloqueo de edición ("abrir = editar", 5 min de inactividad) | En main | `docs/superpowers/specs/2026-09-28-bloqueo-edicion-design.md` |
| Comprobantes de compra art. 2 (01/02/03/07/08/12/14), crédito fiscal, retención 4ta, NC/ND con saldo a favor, "Ya se pagó", TC SUNAT por fecha, SIRE RCE con TC, resumen tributario | En main (Fases 1–5) | `docs/superpowers/specs/2026-09-30-comprobantes-compra-design.md` + planes y ledgers en `docs/superpowers/` |
| Costos de fabricación comprometido/consumido por OT, selector S/–US$ | En main | mismo spec (Fase 1) |
| Ventas en US$, TC del día y diferencia de cambio en cobros/pagos, reporte de diferencia de cambio al cierre, NC de venta parcial, resumen tributario completo (ventas, IGV del mes, renta) | En main | `docs/superpowers/specs/2026-10-01-ventas-usd-tributario-design.md` |
| Auditoría de seguridad y manejo de errores | En main | `docs/superpowers/sdd/2026-10-01-seguridad-auditoria-progress.md` |
| Factura de venta ligada a su comprobante SUNAT al crearla | En main | ver §4 |
| Motor contable C1 (plan de cuentas PCGE + importación desde Excel, periodos, asientos manuales, pantalla Contabilidad) | En main (2026-10-02, desde `claude/affectionate-ride-1ql646`) | `docs/contabilidad/HANDOFF-contabilidad.md` |
| Saldos de tesorería, movimientos manuales y transferencias | En main (`feature/movimientos-manuales`, ver §5) | `docs/superpowers/sdd/2026-10-02-intales-saldos-tesoreria-progress.md` |
| Bancos B7: libro por cuenta y conciliación bancaria mensual (sobre los saldos y movimientos manuales de `main`; integrado 2026-10-02) | En main (2026-10-02, desde `claude/affectionate-ride-1ql646`) | `docs/superpowers/specs/2026-10-02-bancos-b7-design.md` |
| Caja chica: fondo fijo, gastos (boleta, ticket, factura sin crédito, RH, movilidad, vale), rendición y reposición, arqueo | En main (2026-10-02, desde `claude/affectionate-ride-1ql646`) | `docs/superpowers/specs/2026-10-02-caja-chica-design.md` |
| Motor contable C2: asientos automáticos (compras, ventas, Tesorería) y exportación a **CONCAR** (PCGE 2019) | En main (2026-10-02, desde `claude/affectionate-ride-1ql646`) | `docs/superpowers/specs/2026-10-02-c2-asientos-concar-design.md` |
| Motor contable C3: cierre de mes (verificar, cerrar y reabrir; bloqueo del mes en todo el sistema) y reportes de control (Diario, Mayor, Balance de comprobación) | En main (2026-10-02, desde `claude/affectionate-ride-1ql646`) | `docs/superpowers/specs/2026-10-02-c3-cierre-reportes-design.md` |
| Motor contable C4 (exportación al software del contador) | Hecha con C2 (CONCAR) | — |
| Motor contable C5 ligero: libros PLE (Diario 5.1, Plan de cuentas 5.3, Mayor 6.1, Caja y Bancos 1.1/1.2) de un mes cerrado | Solo en `ventas/produccion/contabilidadoficial` (2026-10-03) | `docs/contabilidad/HANDOFF-contabilidad.md` |
| Motor contable C5 completo (Inventarios y Balances 3.x, cierre anual, EEFF) | En suspenso: lo hace el software del contador | `docs/contabilidad/2026-10-01-referencias-erp-C2-C5.md` |

Ramas remotas `feature/*` ya mergeadas (se pueden borrar si el usuario lo pide): `bloqueo-edicion`,
`comprobantes-compra`, `ajustes-tributarios`, `ventas-usd-tributario`, `seguridad-auditoria`, `ligar-cpe-factura`.

## 4. Decisiones del usuario vigentes (no re-preguntar)

**Tributario / contable**
- **INTALES no será la contabilidad oficial** (2026-10-01): genera los asientos y los **exporta al software del
  contador**. Software: **CONCAR** con **PCGE 2019** (decisión 2026-10-02; formato de importación de 41 columnas
  portado de contaperu). La fase C4 pasa de "exportación PLE" a "exportación al
  software del contador"; el plan de cuentas se importa del contador para que los códigos coincidan.
- **PLE desde INTALES** (2026-10-03, rama `ventas/produccion/contabilidadoficial`): INTALES **presenta** los libros
  Diario (5.1), Plan de cuentas (5.3), Mayor (6.1) y Caja y Bancos (1.1 y 1.2) con el programa PLE; el contador ya no
  los presenta desde CONCAR (la exportación a CONCAR sigue disponible). Compras y Ventas siguen por el SIRE.
  Inventarios y Balances (3.x), cierre anual y EEFF quedan fuera (C5 completo en suspenso).
- Retención de 4ta: se declara en el **mes de pago** del recibo (el resumen la prorratea por neto pagado).
- Retención IGV 3 %: solo comprobantes con crédito fiscal; **no aplica a recibos de servicios públicos (14)** ni a sus notas.
- NC/ND en dólares: TC del **comprobante que modifican** (Oficio SUNAT 024-2000).
- Cobros en dólares al TC **compra** del día, pagos al TC **venta** (configurable en Tesorería → Configuración; por
  confirmar con el contador).
- Pago a cuenta de renta: coeficiente configurable, por defecto 1.5 %.
- Detracción de ventas en dólares: monto en soles (TC venta del día, sin decimales).
- Cuentas PCGE corregidas en el diseño contable: ventas 70321/70221/70121 (no 7041/7011), honorarios 424, materias
  primas 602, detracción de compras dentro de 4212, detracción de ventas a 1042.
- NC de venta: solo anula el comprobante si el motivo es 01/02 o si (sumada a las anteriores) cubre el total; si no,
  rebaja el saldo de la factura. Nunca más que lo pendiente.

**Facturación**
- Factura y comprobante SUNAT son dos registros: el comprobante (`comprobantes`) es el documento legal; la factura
  (`facturas`) es la cobranza. Se ligan **en el servidor** al crear la factura (`POST /facturas` con `comprobante`):
  aceptado o en proceso, sin otra factura ligada, mismo número, cliente, moneda y total (±0.10).
- Con comprobante aceptado, monto, número y cliente de la factura **solo cambian con NC/ND**.
- La factura F002-2 (FAC-001) de dev quedó sin ligar a propósito (sin script de reparación: modo dev).

**Roles y seguridad**
- Roles nuevos `tesorero` y `contador`: ven Tesorería, facturas y comprobantes; **no** emiten ni editan facturas ni su
  impuesto. El diseño contable reserva el cierre/reapertura de mes al `tesorero`.
- Facturas (`GET /facturas`) y comprobantes (`/cpe`): solo admin, jefatura, facturación, tesorero, contador. Los demás
  roles no ven facturación (sin pestañas sin/con factura, sin tarjeta de factura en detalles).
- Guías: quienes emiten GRE leen el comprobante relacionado sin montos (`/cpe/para-guia`).
- Login: un solo mensaje ("Usuario o contraseña incorrectos"); límite 8 fallos por usuario y 20 por IP cada 15 min
  (el usuario aceptó el riesgo de bloqueo intencional de una cuenta).
- apiperu: 60 consultas/hora en total; RUC cacheado 30 días; fallas de TC cacheadas 1 h.
- Carga manual del SIRE: no reemplaza la propuesta de SUNAT; abre un cuadro comparativo (comprobante, RUC, base).
- Se dejan así a propósito: borrar un adjunto no borra el archivo del disco; los PDF de Tesorería se pueden abrir con
  la URL directa (nombres aleatorios).

## 5. Pendientes

**Pendiente (2026-11-18) — Estado de servicio de la OT igual en todas las tablas + "Con/Sin factura" de OC por el campo**
(origen SIPAPP-HUAQUIAN, frontend `07aadd3`; pedido del usuario.)
- **Estado de servicio:** en HUAQUIAN todas las vistas muestran el mismo valor (`estadoGeneral`, su estado calculado del
  servicio) con la etiqueta «Estado de servicio» y el mismo color: tablas y filtros de OC, Ingreso de equipos y
  Aprobación de cotizaciones, el Excel de Cotización y OC, y las tarjetas de Relaciones de los detalles de
  Cotización/Factura/OC/OT/Sub-OT. Antes varias mostraban `estado` (solo el técnico). Aquí el «Estado de servicio» es
  `estadoProgresoOT` (`detalleShared.jsx`), pero las tarjetas de Relaciones (`DetalleCotizacion`, `DetalleFactura`,
  `DetalleOrdenCompra`, `DetalleOrdenTrabajo`) siguen mostrando `o.estado` crudo — portar usando
  `estadoProgresoOT`. **Por decidir con el usuario:** si aquí debe ser `estadoProgresoOT` o el `estadoGeneral` de
  esta rama, que tiene otros valores (no asignado/pendiente/en progreso/completada/entregada).
- **Factura:** HUAQUIAN agregó a `ListaFacturas.jsx` la columna «Estado de servicio» y su filtro, también en el Excel.
  El N° OT y el estado salen solo de la OT padre, porque las sub-OTs comparten `numeroDocumento` y el `Map` se
  quedaba con la última. Aquí `otPorNumDoc` tiene el mismo problema.
- **OC — «Con factura» / «Sin factura»:** en `ListaOrdenesCompra.jsx`, `tieneFactura` y la columna/Excel
  «N° Factura» usan solo `o.numeroFactura` (el campo «N° de factura» del detalle). Ya no miran la Factura generada
  (`factByOCMap`/`factMap`), que siguen solo para la búsqueda y el detalle. Emitir el CPE desde la OC llena el
  campo cuando SUNAT acepta.

**Pendiente (2026-11-16) — Lista de OTs: columnas de OC/plazo y orden por encabezado**
(origen rama `modulo-venta/informes/comprabasico`, frontend `674889ba` + `f4b70039` (columnas e indicador de plazo)
y `b5bfe47c` (orden por encabezado); pedido del usuario.)
- En comprabasico la tabla de OTs (`pages/ListaOrdenesTrabajo.jsx`) muestra N° OC, Días de fabricación, Días desde
  recibido (hábiles, desde la fecha de la OC del cliente vía `numeroDocumento`), Fecha recibida OC y Plazo (chip En fecha /
  Cerca a plazo / Atrasado / Terminada según el margen `(días fabricación − días desde recibido) / días fabricación`).
  Aquí la tabla sigue con N° Cotización, Servicio, Contacto y Fecha de Ingreso — no tiene esas columnas.
- Orden por encabezado: Días desde recibido, Fecha recibida OC y Plazo ordenan con un clic (↓ desc, ↑ asc, ↕ inactiva);
  los nulos van siempre al final; Plazo ordena por urgencia (más atrasada primero, terminadas al fondo). Estado `sortDir`
  aparte del `sortBy` del select. Portar después de las columnas (o, mientras tanto, sobre Días desde recibido y Fecha de
  Ingreso).

**Hecho (2026-11-25, portado sin commit; antes «Pendiente 2026-11-11») — Adjuntos de la cotización asignables a cada OT y × de adjuntos por rol**
(origen rama `modulo-venta/informes/comprabasico`, backend `6c967cd`, frontend `4a0a848d`; pedido del usuario).
- Problema: todas las OT de una cotización veían todos sus adjuntos (el plano del ítem 2 aparecía en las OT de los
  demás ítems).
- `Cotizacion.archivos[].ordenesTrabajo: [ObjectId]`. Rutas `POST /ordenes-trabajo/:id/archivos-cotizacion/:archivoId/asignar`
  y `/quitar` (admin/jefatura/planner/coordinadora; bloqueadas con OT anulada, cadena cerrada o cotización anulada):
  `$addToSet`/`$pull` sobre `archivos.$.ordenesTrabajo`. El archivo **nunca sale de la cotización** — se probó antes
  moverlo a la OT y se descartó porque borrarlo en la OT lo perdía también para la cotización. La cotización se
  resuelve por `ot.cotizacion` o por el `numeroDocumento` compartido (OT creadas desde una OC).
- Detalle de OT (`TarjetaArchivosRelacionados`): supervisor y técnicos ven solo los adjuntos de la cotización asignados a
  esa OT; los roles que asignan ven todos con etiqueta «Asignado a esta OT» / «Cotización · sin asignar» y botón «Pasar a
  esta OT» / «Quitar de esta OT».
- Eliminar: `DELETE /ordenes-trabajo/:id/archivos/:archivoId` solo coordinadora/jefatura/admin y solo archivos propios de la
  OT (la × se oculta al resto). `DELETE /cotizaciones/:id/archivos/:archivoId` además elimina los adjuntos subidos en una OT
  de su cadena (solo coordinadora o superior); los propios de la cotización se siguen eliminando como antes.
- Detalle de cotización: sus adjuntos muestran «Asignado a OT N, OT M»; los subidos en una OT, «De OT N» con × para
  coordinadora o superior. `PUT /cotizaciones/:id` ignora `archivos`.
- `TarjetaArchivosRelacionados`: props nuevas `accionArchivo(archivo, { vinculado })`, `puedeEliminar`,
  `onEliminarVinculado` y `_etiqueta` por archivo; muestra el error al eliminar.
- **Pendiente de seguridad (decisión del usuario, 2026-11-11: anotar, no hacer aún):** que supervisor/técnicos no vean
  los adjuntos no asignados es solo filtro de pantalla. `GET /cotizaciones` no filtra por rol (esos roles ya reciben la
  cotización completa, con todos los adjuntos y los precios) y `/uploads` sirve cualquier archivo a quien tenga sesión.
  Arreglo propuesto: en `GET /cotizaciones` y `GET /cotizaciones/:id`, para supervisor/técnicos, quitar los `archivos`
  cuyo `ordenesTrabajo` no incluya una OT suya (y aprovechar para ocultar precios), y controlar por rol la descarga de
  `/uploads/cotizaciones-archivos`. Revisar antes qué otras pantallas de esos roles leen `/cotizaciones`.
- Alerta (backend `39764a0`): al subir un archivo a una OT (`POST /ordenes-trabajo/:id/archivos`), si el rol es supervisor o
  técnico se llama además `notificarAlerta` («Usuario X adjuntó el archivo "nombre" a la OT N título») — banner visible
  para todos menos técnicos, para que la coordinadora vea el pedido. Los demás roles solo quedan en el historial.

**Hecho (2026-11-25, portado sin commit; antes «Pendiente 2026-11-11») — Detalle del ítem cotizado en la OT, OC suelta con moneda y rueda del mouse en inputs numéricos**
- **Diferencia con comprabasico:** las rutas `archivos-cotizacion/:archivoId/asignar|quitar` exigen además el bloqueo de edición de la OT
  (`exigeBloqueo("ordenTrabajo")`), como el resto de escrituras de la OT. Test: `test/adjuntosOT.test.js`.
- **Sigue pendiente:** en `DetalleCotizacion.jsx` la tarjeta OT todavía tiene «+ Crear otra OT» (`ModalNuevaOT`); las OT
  creadas por ahí no copian `subItems`/`imagenes` del ítem. En comprabasico se quitó (las OT salen solo del check «OT»).
(origen rama `modulo-venta/informes/comprabasico`, backend `368c251`, frontend `d1fa638a`; pedido del usuario).
- `OrdenTrabajo`: campos nuevos `subItems: [String]` e `imagenes: [String]`. `PATCH /cotizaciones/:id/items/:index/generar-ot`
  los copia del ítem (sin precio; `descripcion` sigue con los sub ítems unidos por `\n`). Cada ítem marcado con el check
  «OT» genera su propia OT con su detalle.
- `PUT /ordenes-trabajo/:id`: `imagenes` nunca se edita; `subItems` se ignora si el rol es `supervisor` o `tecnico*`, y
  para el resto se valida (array, máx. 100, trim, vacíos fuera, 500 caracteres c/u) y sincroniza `descripcion`.
- `DetalleOrdenTrabajo.jsx`: sección «Detalle del ítem cotizado» en «Datos de la orden de trabajo» — lista con
  inputs, × y «+ agregar sub ítem» para admin/jefatura/planner/coordinadora; solo lectura para supervisor y técnicos;
  imagen en miniatura (`ImagenProtegida`, clic abre). OTs antiguas: se lee `descripcion` partida por líneas.
- `DetalleCotizacion.jsx`: la tarjeta OT ya no tiene botón de crear ni «+ Crear otra OT» (se quitó `ModalNuevaOT` de ese
  detalle; el archivo queda). Se mantiene «+ Vincular OT existente».
- `ModalCrearOrdenCompra.jsx` (Nueva OC desde la lista): selector de moneda Soles/Dólares, mandado como `moneda`; con
  cotización vinculada queda bloqueado con la de la cotización (el `pre("save")` de `OrdenCompra` ya la fuerza). El
  buscador de cotizaciones del modal muestra el símbolo de cada una.
- `main.jsx`: listener global `wheel` (capture, passive) que hace `blur()` al `<input type="number">` activo cuando la
  rueda cae sobre él — la rueda ya no cambia montos ni cantidades en ninguna pantalla (reemplaza los `onWheel` por input).
  **Corrección 2026-11-25:** en esta rama el listener nunca llegó al código (ningún commit lo tuvo); se agregó recién
  el 2026-11-25 (ver «Hecho (2026-11-25)»).
- `detalleShared.jsx` `BotonAnular` (frontend `0f6ccdab`): el modal de anulación se dibuja dentro del header degradado
  (`text-white`) y el preflight de Tailwind hace heredar el color a `button`/`textarea` — «Cancelar», el motivo y el
  placeholder quedaban blancos sobre blanco. Ahora el modal fija `text-gray-800`, «Cancelar» `text-gray-700 bg-white` y
  el textarea `text-gray-800 placeholder:text-gray-400`. Aplica a todos los documentos que usan `BotonAnular`.

**Pendiente (2026-11-10) — Ocultar «+ Crear Sub-OT» y contraste de las tarjetas de Relaciones en modo oscuro**
(origen rama `modulo-venta/informes/comprabasico`, frontend `72311167`; pedido del usuario).
- `DetalleOrdenTrabajo.jsx`: se quitó el botón «+ Crear Sub-OT» (y el `ModalNuevaSubOT` de ese detalle; el archivo y la
  ruta `POST /ordenes-trabajo/:id/sub-ot` quedan). La sección «Sub-Órdenes» solo se muestra si la OT ya tiene sub-OTs.
  Las OTs ahora se crean por ítem desde la cotización o la OC.
- Tarjetas de Relaciones (`TarjetaRelacion`, `detalleShared.jsx` + `index.css`): en oscuro el fondo pastel claro chocaba
  con las piezas `bg-white` re-teñidas oscuras. Ahora cada tipo en `TEMAS` tiene `acento` ("R G B" del tono 500) y
  `acentoClaro` (hex del 300), pasados como `--tarjeta-acento` / `--tarjeta-acento-claro`; en `[data-theme="oscuro"]` la
  tarjeta es `--bg-surface` con un velo `rgb(var(--tarjeta-acento) / .16)` y borde `/ .5`, las piezas `bg-white` internas
  van a `--bg-page`, el texto de acento (clase `tarjeta-acento-texto`) usa el claro y los links `text-blue-600` pasan a
  `#93c5fd`. Sepia sigue con el pastel. No usar `color-mix()`: el build lo baja a un respaldo que en Chrome viejo
  (tablets Huawei) deja el texto del mismo color que el fondo.

**Pendiente (2026-11-10) — Crear OTs desde el detalle de una OC** (origen rama `modulo-venta/informes/comprabasico`,
backend `ced97d1` + `63fc615`, frontend `485f50c0` + `2dd5cd1b`; pedido del usuario).
Desde la lista de OC se crea una OC independiente; en su detalle, la tarjeta de OT muestra «+ Crear OT» (o «+ Agregar
OTs» si ya tiene) y abre un modal con filas título / cantidad / días (agregar y quitar filas). Al crear, se genera una OT
por fila.
- Backend: `POST /ordenes-compra/:id/generar-ot` con `{ items: [{ titulo, cantidad, diasEntrega }] }` (1-50 ítems;
  título obligatorio, cantidad > 0, días entero > 0; se valida todo antes de crear). Roles de crear OT: admin, asistente,
  supervisor, planner, jefatura, coordinadora. Rechaza OC anulada o cadena cerrada (`bloqueadoPorCadenaCerrada`); no
  bloquea si ya hay OTs (se pueden agregar más). Cada OT comparte el `numeroDocumento` de la OC (enlaza la cadena en
  ambos sentidos), guarda `cantidad` y `tiempoFabricacion` = días, y hereda empresa, cotizacion (si la OC tiene), planta,
  encargado, codigoSap, fechaSalida y guías; `numeroOT` correlativo. Se guardan en serie (el pre-save arma el código
  desde la última OT).
- Frontend (`DetalleOrdenCompra.jsx`): las OTs de la OC = las de su cotización o, si no tiene, las OTs padre con su
  `numeroDocumento`. La tarjeta lista todas; informes, GRE, requerimientos, servicios y notificaciones (costo de
  fabricación) se agregan de todas las OTs; «Crear GRE» lleva un ítem por OT. Modal inline `ModalCrearOTs`.
  `DetalleOrdenTrabajo` y `ListaOrdenesCompra` ya resolvían OC/OT por `numeroDocumento`.

**Pendiente (2026-11-09) — Fotos de celular grandes en las subidas** (origen SIPAPP-HUAQUIAN, frontend
`b55d3e5`, backend `8cd5cca`). Fotos de 10-20 MB superan el tope de multer (`upload`, 15 MB): el backend
respondía 500 genérico y el frontend descartaba la foto sin avisar (`if (res.ok) urls.push(...)`). Fix:
(1) comprimir en el navegador antes de subir — si pesa ≥ 1,5 MB, `createImageBitmap` + canvas a 2000 px de lado
mayor, JPEG 0,85; si algo falla, subir la original; (2) mostrar qué fotos no se subieron con el `mensaje` del
backend; (3) en el error handler global, `err.code === "LIMIT_FILE_SIZE"` → 413 con mensaje claro (MulterError
no trae `status`).
- (3) ya está (`Backend/src/middleware/manejarErrores.js` mapea `LIMIT_FILE_SIZE`). (1)-(2): hoy el frontend no sube fotos a `/informes/subir-imagen`; aplicarlos cuando se agregue una subida de fotos.

**Pendiente (2026-11-09) — OCs parciales por ítems de la cotización** (origen SIPAPP-HUAQUIAN,
frontend `6a8fb9f`, backend `dacedf1`; reglas en la skill `erp-cadena-documento` §8). Seleccionar 1..n ítems
de la cotización (columna "OC" con checkbox, al lado de la de OT) y generar UNA sola OC con N° propio, título =
títulos de los ítems unidos por " / " (editable) y monto = subtotal de los ítems × (total − igv) / Σ subtotales
(editable), para que la suma de OCs parciales dé la base sin IGV de la cotización. Requiere cotización aprobada
y enviada; mismos roles que crean OC.
- Backend: `items[].ocGenerada` (ref a la OC; el ítem se libera si la OC se anula; el PUT de la cotización la
  preserva por índice igual que `otGenerada`), `OrdenCompra.desdeItemsCotizacion` (excluida de
  `heredarTituloCotizacion`, ni su título ni la descripción de su factura se pisan) y
  `POST /ordenes-compra/desde-items`.
- Frontend: el detalle de la cotización lista TODAS sus OCs y facturas; la factura de cada OC se resuelve solo
  por `Factura.ordenCompra` (el respaldo por cotización/`numeroDocumento` solo para facturas sin OC — también en
  la lista de OCs y en el detalle de OT, que muestra la OC del ítem de esa OT); "Crear factura" desde la OC
  prellena solo los ítems de esa OC.
- Ojo: generar OT desde ítems con la cotización ya enviada no debe guardarla antes (el PUT rechaza enviadas → 400).

**Pendiente (2026-11-06) — rol `coordinadora` con los mismos privilegios que `jefatura`, incluido el manejo de precios
(decisión del usuario; origen rama `modulo-venta/informes/comprabasico`, sin commit al anotar):** la idea es que coordinadora
pueda manejar precios igual que jefatura. Se le quitan las restricciones de "solo lectura / sin precios ni montos" en
Cotizaciones y Órdenes de Compra, y recibe las mismas excepciones que jefatura (p. ej. operar sobre cadenas cerradas,
`rol !== "jefatura"` en las rutas). **Excepto**: Guías (puede verlas, no crearlas ni emitirlas), Facturas y Fact.
Electrónica, Tipo de Cambio y Sistema (no se le otorgan). Revisar `Frontend/src/components/Sidebar.jsx` (`NAV_ITEMS` y el
comentario de la matriz de roles), los guards de `App.jsx`, los condicionales de rol de cada página y las listas de roles
de `Backend/src/routes` y middlewares. **Aplicado en comprabasico (2026-11-06, sin commit al anotar):** además de lo
anterior, a coordinadora se le quitó la emisión de guías, que antes tenía (`guias.js` `puedeEmitir`, ruta
`/guias/emitir`, botones «Emitir Guía»/«Crear GRE»: se separó `puedeVerGRE` de `puedeGenerarGRE`), y en
`DetalleOrdenCompra` sigue sin ver el total de la factura. **Decidido (2026-11-06):** coordinadora también ve Reportes (`routes/reportes.js`
`puedeVer`, ruta y menú) y el Dashboard de admin/jefatura en vez del de Planner; al entrar va a `/dashboard`. Referencia: el diff de
comprabasico.

**Resuelto (2026-10-07) — el cobro de una venta con cuotas se registra cuota por cuota (Backend `85137db`, Frontend
`1e04efb6`; pedido del usuario):** «Registrar cobro» muestra una tarjeta por cuota, cada una con su saldo, y el cobro
del neto se guarda contra la elegida (`MovimientoTesoreria.documento.cuotaId`); no puede pasar del saldo de la cuota y
un monto menor la deja abierta. La detracción o la retención es un cobro aparte y ya no cubre cuotas, salvo en las
facturas antiguas cuyas cuotas suman el total del comprobante. Los cobros anteriores, sin cuota, se siguen repartiendo
en orden (`saldosTesoreria.recalcularFacturaVenta`). **Pendiente de portar** a `main`, `venta-produc-compra-contaConcar`
y `conta-percepcion` (mismos archivos). Sin tocar: al cambiar el subtotal o aplicar una NC parcial las cuotas se
prorratean al total del comprobante, no al neto.

**Resuelto (2026-10-07) — retención del IGV en la factura electrónica (Backend `0625367`, Frontend `993295e3`;
origen SIPAPP-HUAQUIAN `55a4b9a`, `0c71da4`, `de8fb2f` y `bdc4beb`; ver skill `sunat-cpe-ubl21` §28):**
Emitir Comprobante tiene el checkbox "Operación sujeta a retención del IGV", solo en factura y excluyente con la
detracción (3 % por defecto). El XML la informa como `cac:AllowanceCharge` código 62 (catálogo 53) entre los
`PaymentTerms` y `TaxTotal`, sobre el importe total; no cambia `PayableAmount` ni el tipo de operación. El monto lo
calcula el servidor (`Comprobante.retencion`). Antes del correlativo se rechaza con 400: retención en boleta, detracción
y retención juntas, porcentaje que no sea mayor a 0 y menor a 100, y detracción negativa o que sumada a la retención
supere el total (el monto de la detracción lo envía el cliente). Al crédito, el monto neto pendiente y la suma de las
cuotas son total − detracción − retención (el formulario validaba las cuotas contra el total aunque hubiera detracción;
ahora sigue al XML). La factura interna ligada a un comprobante con retención nace con impuesto `retencion` (el 3 % de
Tesorería), no con la detracción por defecto. Pruebas: `test/retencionIgvCpe.test.js` (XML y rechazos, con emisión
simulada) y `test/ligarCpeFactura.test.js`. Desde INTALES no se emitió nada a SUNAT: la estructura es la que SUNAT demo
aceptó a HUAQUIAN. Aplicado por separado en las cinco ramas.

**Resuelto (2026-10-07) — descuento por línea en Emitir Comprobante (Frontend `7300e4ec`; origen SIPAPP-HUAQUIAN
`ff72647`; ver skill `sunat-cpe-ubl21` §10):** el input "Desc. %" guarda 0-100, pero `calcularLineaComprobante`
(`utils/catalogosSunat.js`) trabaja en fracción 0-1; con descuento, los totales en pantalla salían mal (20 % sobre 100
daba base −1900) y de ahí salen el monto neto de detracción que se envía y la validación de cuotas. `itemsCalc` en
`Frontend/src/pages/EmitirComprobante.jsx` ahora convierte a fracción antes de calcular.

**⚠ Mencionar al usuario al abrir el proyecto: las "Decisiones por confirmar" de abajo.**

**Rama `ventas/produccion/contabilidadoficial` (2026-10-03):** recibió por merge la rama contable
`claude/affectionate-ride-1ql646` (motor contable C1–C3, CONCAR, Bancos B7, caja chica, ayuda), que trae `main` hasta
`95d9ae0` (incluye el arreglo de SUNAT 3270 y los saldos de tesorería, que esta rama ya tenía por cherry-pick). En
`main` el trabajo contable se revierte (decisión del usuario 2026-10-03: el motor contable va solo en esta rama).

**Rama `venta-produc-compra-contaConcar` (2026-10-03, ambos repos):** copia de `ventas/produccion/contabilidadoficial`
tal como quedó antes del C5 ligero (backend `c87bf51`, frontend `1663ebb`): el alcance "solo exportar a CONCAR".
Worktree local en `/home/user/worktrees/venta-produc-compra-contaConcar/<repo>` (solo vive en el contenedor de la sesión).

**C5 ligero en `contabilidadoficial` (2026-10-03) — pendientes:**
- **Validar los .txt con el programa PLE** antes de la primera presentación: las estructuras salen del Anexo 2
  (versión R.S. 361-2015) y no se probaron aún en el PLE real. Ajustar en `src/utils/ple.js`.
- Campo 20 del Diario (dato estructurado que enlaza con el registro de compras o ventas) va vacío; asiento de
  apertura (correlativo `A`) solo si el contador lo registra como asiento manual de subdiario Apertura.
- El cierre de mes sigue exigiendo exportar a CONCAR; si el contador deja de importar, quitar esa condición.
- Preguntas al contador F1–F4 (`docs/contabilidad/Preguntas al contador.md`).

**Factura emitida suelta pasa a «Por cobrar» (2026-10-07, decisión del usuario):**
- Antes, «Emitir comprobante» sin orden de compra solo enviaba a SUNAT: el asiento de venta cargaba la 1212 pero
  Tesorería no tenía factura interna contra la cual cobrar. Ahora, al emitir una **factura** (01) suelta,
  `EmitirComprobante.jsx` crea la factura interna ligada al comprobante (mismo paso que ya hacía desde una OC).
- Sin cliente elegido, `POST /api/facturas` toma el receptor del comprobante y lo registra en Empresas si falta
  (`clienteDelComprobante` en `routes/facturas.js`; un proveedor existente pasa a «ambos»).
- **Boletas no**: se cobran al contado y no pasan a «Por cobrar». **Sin regularización** de los comprobantes sueltos
  ya emitidos (aplica de aquí en adelante).
- La factura interna calcula el total como subtotal + 18 %: una factura suelta con ítems exonerados o inafectos no
  cuadra con su comprobante y avisa «se emitió, pero no se pudo crear el registro interno».
- Test: `test/ligarCpeFactura.test.js`.

**Planilla de remuneraciones y PLAME (2026-10-06, primera entrega):**
- **Qué cubre**: ficha del trabajador, parámetros del mes, planilla mensual con boletas, archivos de importación del
  PLAME y asiento contable con su pago por Tesorería. Pantalla `/planilla` (admin, jefatura y contador ven; escriben
  admin y contador). Backend: `routes/planilla.js`, `utils/planilla.js` (cálculo, funciones puras), `utils/plame.js`,
  modelos `Trabajador`, `ParametrosPlanilla`, `Planilla`, `BoletaPago`, catálogo `data/conceptosPlame.js`.
- **Fuentes**: Anexo 2 (tablas, actualizado 11.09.26) y Anexo 3 (estructuras, jul-2023) de SUNAT. El catálogo de
  conceptos (Tabla 22, 154 códigos del sector privado con su afectación a EsSalud, ONP, AFP y 5.ª) se generó del Excel
  oficial. Los tres repos de referencia (`planilla-pe`, `sunat_planilla`, `OCA_payroll`) solo sirvieron de contraste:
  no se copió código (la 5.ª y la AFP de `planilla-pe` no siguen la norma).
- **Régimen laboral** (general / pequeña / micro): `Configuracion.regimenLaboral`, se cambia en Tesorería →
  Configuración (jefatura o admin). Hoy define las gratificaciones que proyecta la 5.ª.
- **Parámetros por mes** (`/planilla/parametros/:periodo`): UIT, RMV, EsSalud, ONP y AFP (aporte, prima, tope y
  comisión de cada AFP). Sin guardarlos no se calcula: las tasas de AFP cambian cada mes y se copian de la SBS.
- **Cálculo**: días base 30 (ingreso/cese dentro del mes: días calendario), suspensiones de la Tabla 21 (las S.P. y las
  subsidiadas no se pagan; vacaciones van al 0118), asignación familiar 10 % de la RMV en proporción a los días
  pagados, horas extras 25/35 %, conceptos fijos y adicionales por código de la Tabla 22; ONP 13 %; AFP 10 % +
  comisión + prima hasta el tope; EsSalud 9 % con base mínima de una RMV (con EPS, 25 % del aporte va a la EPS; SIS
  sin aporte); renta de 5.ª por el art. 40 del Reglamento (proyección, 7 UIT, escala 8–30 %, divisores 12/9/8/5/4/1,
  retenciones de meses anteriores y retención completa de pagos extraordinarios).
- **5.ª de meses que no están en el sistema**: se anota en la ficha (`quintaAnterior`: mes, ingresos afectos y
  retenido). Sin eso, al empezar a mitad de año la retención sale baja.
- **Flujo**: guardar parámetros → «Generar planilla» (borrador, toma los datos actuales de cada ficha y conserva lo
  digitado) → editar cada boleta (asistencia y conceptos del mes) → «Cerrar». Cerrada: boletas fijas, archivos del
  PLAME y asiento. Se reabre si su asiento no está contabilizado y el periodo contable sigue abierto.
- **PLAME** (`/planilla/:periodo/plame`): `.rem` (sin ONP ni EsSalud: los calcula el PDT), `.jor`, `.snl`, `.toc` de la
  planilla cerrada, y `.ps4` / `.4ta` de los recibos por honorarios con pago en el mes (4.ª se declara al pagar).
- **Asiento** (origen `Planilla`, subdiario diario, último día del mes): gasto por cuenta y centro de costo del
  trabajador contra 4111 (neto), 40173, 4032, 407, 4031 y, si hay, EPS y descuentos. Cuentas en Planilla → Cuentas
  (`ConfiguracionContable.planilla`). Sale con «Generar asientos del mes» y se completa a mano como cualquier automático.
- **Pagos**: egreso manual de Tesorería con concepto «Planilla: remuneraciones / AFP / EsSalud / ONP / renta de 5.ª»
  (`pago_*`), que cancela la cuenta por pagar del asiento.
- Tests: `test/planillaCalculo.test.js` (11), `test/planilla.test.js` (8) y `utils/planilla.test.js` en el frontend.
  Probado en el navegador (alta de trabajador, parámetros, generar, editar boleta, PDF, cerrar y descarga del `.rem`).
- **Pendiente**: (1) importar los archivos en el PDT PLAME real — no se ha probado contra el validador de SUNAT;
  (2) gratificaciones, CTS, vacaciones truncas y liquidación (hoy la gratificación se digita como concepto 0406 + 0312);
  (3) provisiones mensuales de beneficios en el asiento; (4) T-Registro: la carga masiva de altas y bajas ya está hecha (entrega de abajo, 2026-11-02); quedan la modificación de datos ya registrados (la de SCTR ya está, ver «Perfil laboral»), practicantes, prestadores de servicios y derechohabientes; (5) SCTR, SENATI y vida ley: hecho el 2026-11-03, ver «Perfil laboral del empleador» más abajo;
  (6) rentas de 5.ª de otros empleadores (`.or5`) y recálculo de la 5.ª al cese (art. 41); (7) subsidios de EsSalud
  (0915/0916) y prima AFP de mayores de 65; (8) confirmar con el contador lo marcado [Confirmar] en `utils/planilla.js`.
- **Pendiente (2026-11-02, decisión del usuario)**: llevar el módulo de planilla a la rama `conta-percepcion` (hoy vive solo en `contabilidadoficial`). Se hace después.
- **Hecho (2026-11-04)**: imprimir las boletas de pago en masa (pendiente del 2026-11-03); ver «Boletas en masa» más abajo.

**T-Registro (alta y baja de trabajadores) (2026-11-02, rama `contabilidadoficial`):**
- **Qué cubre**: la ficha del trabajador se amplía con la sección T-Registro (datos personales, domicilio, régimen, salud y
  pensión, estudios, cuenta, etc.). El alta tiene estado `sin control` / `pendiente` / `registrada` / `anulada`; la baja tiene
  `sin control` / `pendiente` / `registrada` y además `ninguna` (sin fecha de cese, o con el alta anulada) e `incompleta` (pendiente sin motivo).
  Crear una ficha con fecha de cese abre la baja pendiente igual que el PUT.
  Archivos de importación del PVS: alta = `.ide .tra .per .est`, más `.edu` si la situación educativa es 11 o 13–21 y
  `.cta` si el tipo de pago es depósito en cuenta; baja = una fila `.per` tipo 1 sin fecha de inicio, con fin y motivo.
  Alta y baja van en archivos y `.zip` distintos. Se descarga un `.zip` de `.txt` con nombre fechado para abrirlo en el PVS
  T-Registro (el PVS genera el `.zip` que se sube en SOL). «Marcar como registrado» cierra el trámite; con el trámite
  registrado se bloquean documento, ingreso (alta) y cese (baja), y solo el rol contador ve el botón «Editar» (queda
  registro de ediciones). Catálogos SUNAT (Anexo 2) generados como datos (incluidas nacionalidades, Tabla 4, y países emisores, Tabla 26); catálogo de 377 códigos de error del PVS con
  buscador y corrección sugerida; configuración de valores por defecto (`Configuracion.tregistro`); aviso no bloqueante en
  la planilla del mes: «N trámite(s) pendientes en T-Registro» (altas pendientes y bajas pendientes o incompletas, solo de quien
  tiene el vínculo actual con días en el mes elegido).
- **Anular alta (2026-11-03, solo `contador`)**: `POST /planilla/tregistro/anular-alta { id, motivo ≤ 120 }`. Solo con el alta
  `pendiente`: queda `anulada` (con `anuladaPor`, `anuladaEn` y `motivoAnulacion`), no se genera ni se marca, no sale en
  «Pendientes» ni en el aviso de la planilla y su baja no se ofrece. El trabajador sigue en la planilla con sus fechas de ingreso y cese.
- **Nuevo vínculo / reingreso (2026-11-03, solo `contador`)**: `POST /planilla/tregistro/nuevo-vinculo { id, fechaIngreso }`, solo con la
  baja `registrada` o el alta `anulada`. El vínculo previo (fechas, alta y baja con sus datos de trámite) pasa a
  `tregistro.vinculosAnteriores`; la ficha queda con el nuevo ingreso, sin cese, alta `pendiente` y sin baja, y se anota «nuevo vínculo»
  en `tregistro.ediciones`. El vínculo anterior debe tener fecha de cese (con el alta anulada el cese se puede editar):
  sin ella responde 409 «registra primero la fecha de cese del vínculo anterior»; con la baja «sin control» pide marcarla primero como
  registrada. El nuevo ingreso debe ser posterior a ese cese. Si alguna planilla desde el mes del nuevo ingreso ya está cerrada, la respuesta trae un
  aviso (`avisos`) que las lista todas («Las planillas de 09/2026, 11/2026 ya están cerradas…») y que el modal muestra: reabre las que deban incluir el reingreso. Un DNI repetido al crear una ficha orienta a usar
  «Nuevo vínculo». La planilla suma los días de todos los vínculos con días en el mes
  (`diasDeVinculos`: si los vínculos cubren todos los días calendario del mes son 30; la boleta guarda en `datos.vinculos` los del mes y en `fechaIngreso`/`fechaCese` los del último), así que los meses del
  vínculo anterior se siguen generando y los del intervalo no tienen boleta. Solo la gratificación y la 5.ª usan las fechas del último
  vínculo del mes (aproximación). `PUT` rechaza un ingreso que no sea posterior al cese del vínculo anterior.
- **Reglas del validador según el manual del PVS (2026-11-03)**: solo valen los TD 01, 04, 07, 09, 22, 23 y 24 (Anexo 3 E5/E11/E29); otro, incluido
  el carné CPP (26), emite EPE1.1 en alta y baja y ya no envía país 604. Correo (E4 campo 12): usuario de 3 o más caracteres
  `[A-Z0-9._-]`, servidor de 2 o más (no `com`, `gob`, `gov`, `es`, `pe`), dominio y subdominio solo letras (2 o más), y sin la combinación
  «no tengo correo» (EPE1.19, EPE1.26, EPE1.27); la UI lo valida igual. La dirección solo es obligatoria con TD distinto de DNI (EDR1.1);
  con cualquier dato de dirección se aplican las reglas EDR a todos. «S/N», «s.n.» y variantes se guardan y se envían como `sn` y exigen
  referencia (EDR1.6). Con el alta registrada también se bloquea el país emisor de pasaporte o documento extranjero (07/24). Las fichas
  nuevas nacen con nacionalidad peruana (9589); las ya guardadas sin nacionalidad no se rellenan.
- **Archivos principales**: Backend `routes/planillaTRegistro.js`, `utils/tregistro.js` (armado de archivos),
  `utils/tregistroCatalogos.js`, `utils/tregistroValidacion.js` (`estadoTramite`, `validarParaTRegistro` con códigos del PVS),
  `utils/erroresTRegistro.js` + `data/tregistro/`, `scripts/generarCatalogosTRegistro.mjs` y `generarErroresTRegistro.mjs`
  (regeneran los datos desde el Anexo 2 y el manual del PVS). Frontend `components/planilla/FichaTRegistro.jsx`,
  `PanelTRegistro.jsx`, `PanelConfigTRegistro.jsx` (integrados en `PanelTrabajadores` y `PanelPlanillaMes`) y
  `utils/tregistro.js`.
- Tests: Backend `test/tregistro.test.js` (36, rutas), `tregistroArchivos.test.js` (20), `tregistroCatalogos.test.js` (14) y
  `tregistroValidacion.test.js` (45); Frontend `utils/tregistro.test.js` (32).
- **Pendiente T-Registro**: (1) probar los archivos en el PVS T-Registro real y corregir — el usuario decidió entregar sin
  probar. Riesgos concretos: la columna 21 del `.tra` (categoría ocupacional) se envía siempre; si el PVS la rechaza para
  tipo de trabajador 19/20/21, vaciarla en `utils/tregistro.js`; si en la baja también hay que cerrar los tipos 2–4 del
  `.per`. Nacionalidad y país emisor se eligen de las Tablas 4 y 26: la nacionalidad es obligatoria con TD 04, 07, 09, 22, 23 y 24; el
  país emisor, con 07 y 24; con DNI, carné de extranjería y refugio va vacío y con 22 y 23 se envía `604`.
  La nacionalidad no se exige en la baja porque el `.per` no la lleva. **Confirmar en el PVS**: la situación especial
  (ETR21.1) acepta el catálogo completo (Tabla 35, 0–8) pero el manual solo menciona 0, 1 y 2; si el PVS rechaza el teletrabajo (3–8),
  restringir la lista a 0, 1 y 2 (la corrección del error ya lo orienta); y que el PVS acepte un alta sin dirección con DNI.
  (2) modificación de datos ya registrados en T-Registro: solo la de SCTR está hecha (entrega «Perfil laboral»); el resto sigue fuera de alcance. (3) SCTR pensión configurable: hecho (ONP o compañía privada en el perfil).
  (4) practicantes, prestadores de servicios y derechohabientes. (5) llevar la planilla y el T-Registro a `conta-percepcion`
  (ya anotado arriba).
  (6) Menores diferidos de las revisiones: `existe("constructor", …)` lanza TypeError (usar `Object.hasOwn`); offsets
  `slice` frágiles y sin conteo mínimo en `generarCatalogosTRegistro.mjs`, que tampoco falla fuerte ante un cambio de
  layout del manual (ni `generarErroresTRegistro.mjs`); 72 carreras con grafías duplicadas conservan la primera;
  ETR16.47 repetido en el manual (se conserva la primera) y ETR14.3 sin mensaje; abreviaturas del manual en los mensajes de
  error; `buscarError` sin ranking por relevancia ni búsqueda en `correccion`; enums de sexo/estados rechazan `""`
  (borrar el campo antes de guardar); `establecimiento` sin `match /^\d{4}$/`; sin test persistente de modelos; validador
  sin largo/formato de `numDoc` por tipo de documento (EPE1.2) y `fechaIso` solo acepta ISO; rutas con carrera
  lectura→escritura en el bloqueo y «marcar» no atómico (agregar `tregistro.alta.estado`/`baja.estado` al filtro del update y
  responder 409); «marcar» acepta fechas futuras; reponer `fechaCese` tras quitarla desbloqueado no abre una baja nueva
  (confirmar con el usuario); `camposBloqueados` ignora el rol a propósito (la UI desbloquea con `form.desbloqueo`);
  `validarTregistro` sin largos máximos (la UI pone `maxLength`); las secciones `<details>` cerradas ocultan el campo
  con error; campos `readOnly` sin estilo apagado, buscador sin Escape, sin `<label>` y con errores de red mostrados como
  «Sin resultados»; `baja.motivo` se conserva al borrar `fechaCese`; el `error` del buscador de errores y de la
  configuración no se limpia al editar; sin indicador de carga ni reintento en la carga inicial; `PanelPlanillaMes` recarga
  la lista T-Registro en cada cambio de mes; `perBaja` con `fechaCese` nulo produce una fila sin inicio ni fin;
  `remuneracionBasica` ausente sale como NaN en el `.tra`; `registradaPor`/`por` sin `maxlength`/trim; `SALUD_SUNAT` y
  `FORMACION_SUPERIOR` comparan strings; `sanear` no recorta espacios; faltan tests de una ficha sin `tregistro` en los
  builders; el test «están en español» solo mira la longitud y no hay test de que cada clave de las correcciones exista en
  `ERRORES`; la estructura «General» (12 códigos EPR) debe tolerarse en la UI; EDR1.30 y EDR1.5 se emiten juntas; ETR24.4,
  ETR24.5 y ETR25.x (cuenta) no se anticipan en el validador; faltan tests de `fechaCese: null`, `desbloqueo: "true"` y
  `numDoc` en minúscula contra una baja registrada (T6) y de `baja.motivo` no vacío (T7); las carreras se piden con la
  sección Estudios oculta (T8); doble punto en el modal de problemas (T9); el SIS (`salud: sis`) solo vale en microempresa y no
  se valida; el modal «Marcar» preselecciona «alta» si algún elegido tiene el alta «sin control» (riesgo de marcar el alta
  en vez de la baja); `Backend/graphify-out/` está sin trackear y fuera de `.gitignore`.
  (7) A confirmar en la prueba real del PVS (la revisión final no los juzgó): regla ETR25.5 (sindicalizado = 1 exige la
  estructura 31, ¿aplica al sector privado?); tipo de institución vs situación educativa (ETR24.3); reponer el cese sin reingreso;
  concurrencia en el PUT bloqueado. El reingreso ya se resuelve con «Nuevo vínculo» (el alta nueva del PVS exige cerrar el
  período anterior: CIP1.6); un reingreso con el alta anulada del vínculo previo no se ha probado en el PVS.
  (7 bis) Sin hacer del reingreso: la gratificación y la 5.ª de un mes con dos vínculos usan solo el último. Un alta «sin control» no
  entra a «Descargar altas» (se genera con «Generar alta» en su fila, y solo si la fila no tiene cese ni trámite de baja), pero desde el
  2026-11-03 el botón «Seleccionar sin control» las agrega a la selección para «Marcar como registrados» en lote; el modal «Marcar» parte
  del trámite pendiente de lo elegido. El correo estricto del manual es solo un aviso en la
  ficha: no impide guardar y el validador lo reporta al generar el alta.
  (8) `contaConcar` (`SIPAPP-INTALES-venta-compra-contaConcar`) es el único otro proyecto con módulo de planilla y no tiene
  T-Registro ni perfil laboral: pendiente, lo decide el usuario (no se tocó su código; solo se anotó el pendiente en su ESTADO).

**Perfil laboral del empleador (SENATI, SCTR, vida ley) (2026-11-03, rama `contabilidadoficial`):**
- **Qué hace**: el ERP se instala una vez por empresa y lo que cambia de una a otra se elige en **Planilla → «Perfil laboral»**
  (admin y contador; `Configuracion.perfilLaboral`, rutas `GET/PUT /api/planilla/perfil`): régimen laboral (sale de Tesorería →
  Configuración), REMYPE, CIIU y actividad industrial, SENATI, SCTR y vida ley, con historial de cambios. Dos casillas por
  trabajador (`aportes.senati`, `aportes.sctr`; precarga por categoría: obrero marcado, empleado y ejecutivo no) y `vidaLeyPrima` opcional.
  La planilla del mes guarda una foto del perfil con que se calculó.
- **SENATI**: 0,75 % (Ley 26272) sobre las remuneraciones de los trabajadores marcados, solo si la empresa tuvo más de 20 en el año
  anterior; se paga mensual al SENATI. Evaluación anual al generar la primera planilla del año (con 12 meses de datos se aplica sola; con menos,
  avisa para que el contador confirme). Concepto 0807 en la boleta, el `.rem` y el asiento (gasto 6277 contra 4033).
- **SCTR**: salud (EsSalud 0806 o EPS 0810) y pensión (ONP 0813 o compañía privada 0805) con las tasas del perfil. El 0806 lo calcula el
  PLAME con el archivo nuevo **`.tas`** (estructura 25); el `.rem` no lo lleva. T-Registro: columna 9 del `.tra` y período tipo 5 del
  `.per` en el alta, y trámite de **modificación SCTR** para trabajadores ya registrados (pestaña T-Registro: «Descargar modificaciones
  SCTR» y «Marcar como registrados»; fecha del cambio digitada con los límites del PVS, +30 días al iniciar y +5 al cerrar; validaciones ETR17.9, ETR17.12 y categoría ocupacional).
- **Vida ley**: obligatoria desde el primer día en todo régimen; la prima por trabajador (tasa o monto de la póliza, o la prima propia
  de la ficha) va en el 0803 de la boleta y del `.rem`. No genera asiento: el gasto entra con la factura de la aseguradora por Compras (6274).
  Al asiento de planilla solo entran 0807, 0806 y 0813; 0803, 0805 y 0810 son informativos.
- **Plan EPS del trabajador** (2026-11-04, Backend `3c80130`, Frontend `f6d72dd0`): con salud EPS, la ficha guarda plan, prima total,
  aporte de la empresa y del trabajador (montos; deben sumar la prima). La boleta descuenta el aporte del trabajador con **0706**
  («Aporte EPS – <plan>»), completo en todo mes con días de vínculo (sin prorratear); el asiento lo abona a **EPS por pagar** y el
  contador carga esa parte al registrar la factura de la EPS en Compras. El aporte de la empresa es solo dato. El `.rem` suma los
  códigos repetidos de un trabajador en una línea.
- **Avisos en pantalla**: perfil o SENATI cambiado («los archivos del T-Registro y del PLAME se generarán con estos cambios»), póliza vencida
  o por vencer, actividad de riesgo sin marcados, SENATI por confirmar y modificaciones SCTR pendientes.
- **Detalles A y B del T-Registro** (hechos aquí): el reingreso avisa de todas las planillas cerradas desde su mes; «Seleccionar sin control»
  marca altas sin control en lote. Marcar la baja descarta la modificación SCTR pendiente.
- **Commits**: Backend `6bdfa7a..7d32fad` (sin `977ddf1`, que es otro cambio); Frontend `6ec03426..671627fd` (sin `6f55df5b`).
  Spec `docs/superpowers/specs/2026-11-03-perfil-laboral-design.md`, plan `docs/superpowers/plans/2026-11-03-perfil-laboral.md`.
  Tests: Backend `perfilLaboral.test.js`, `planillaPerfil.test.js` y ampliados `planilla.test.js` y `tregistro*.test.js`; Frontend
  `utils/perfilLaboral.test.js` y `utils/tregistro.test.js`. Sin prueba manual en el navegador de las pantallas nuevas.
- **Nota de despliegue**: en instalaciones existentes correr `node src/scripts/seedPcge.js` (crea 4033, 6273, 6274 y 6277). `PUT /api/configuracion`
  ya no acepta `regimenLaboral` (responde 400; se edita en Planilla → Perfil laboral). Confirmar con el contador 4033 y 6277 contra el PCGE 2019 del MEF.
  Los trabajadores existentes quedan con las dos casillas en `false` (la planilla sale igual que antes hasta que se marquen).
- **[Probar en PDT]** el `.rem` ahora importa los aportes del empleador 0803, 0805, 0807, 0810 y 0813 (antes no importaba ninguno) y se genera
  el `.tas` (E25). Si el PDT rechaza o duplica alguno, agregarlo a `NO_IMPORTAR` en `utils/plame.js`.
- **[Probar en PVS]** archivos de modificación SCTR: `.tra` con solo la columna 9; cambio solo de pensión sin `.per`; **ETR17.21** (baja de
  cobertura con período activo: la UI avisa que, si el PVS la rechaza, se hace en T-Registro en línea y luego se marca) y **ETR17.3** (columna 9 = «0»).
- **AFPnet (hecho, 2026-11-04)**: archivo de texto de ancho fijo (141 caracteres por línea) para la bandeja de AFPnet, con vista previa y descarga en
  Planilla → PLAME (sección «AFPnet (aportes AFP)»). Backend `cf1246e` (`utils/afpnet.js`) y `fec7647` (rutas `GET /planilla/:periodo/afpnet` y `/afpnet/txt`);
  Frontend `feat(planilla): sección AFPnet en la pestaña PLAME`. Solo planilla cerrada y boletas en AFP. Reglas acordadas: sin CPP (la línea no
  sale y hay aviso); «U» (excepción de aportar) solo en los días 21/22 con `bases.afp` = 0 y en blanco en los demás casos (contador, 2026-11-03);
  tipo de trabajo N. Diseño: `docs/superpowers/specs/2026-11-04-afpnet-boletas-design.md` (detalle en `2026-11-03-afpnet-boletas-borrador.md`).
- **Boletas en masa (hecho, 2026-11-04)**: en Planilla → «Planilla del mes», junto a «Exportar Excel», «Descargar boletas (.zip)» (un PDF por trabajador llamado
  «DNI NOMBRE», sin tildes) e «Imprimir todas (PDF)» (una boleta por página). Con la planilla abierta salen como BORRADOR: marca «BORRADOR» en diagonal en cada
  página (también la boleta individual y los enlaces «PDF» de cada fila; si una boleta ocupa varias páginas, en todas) y `-BORRADOR` solo en el nombre del zip
  o del PDF único. Antes de descargar se muestran en pantalla avisos (neto negativo, sin ingresos, borrador) sin bloquear. Solo Frontend: Frontend `a36cf949`
  (utilidades `boletasMasa.js` y `boletaPdf.js`) y `feat(planilla): descarga de todas las boletas del mes` (botones y marca en la boleta individual).
  Plan: `docs/superpowers/plans/2026-11-04-boletas-en-masa.md`.
  - Decisiones mías a revisar (AFPnet): mes sin remuneración con varios motivos → el de más días (empate U > L > O); reingreso en el mes → una línea con
    Cese «S» solo si el último vínculo termina en el mes; Ñ en latin1; vencimiento referencial (5.º día hábil, sin feriados); con CPP el TXT sale sin esas líneas
    y con aviso; SUNAT 24 → AFPnet 8 sin confirmar; sin ficha, nombres desde la boleta; `-BORRADOR` solo en el nombre del zip.
  - **[Probar en AFPnet]** cargar el TXT en la bandeja sin presentar: nombre de archivo libre, Ñ, CRLF.
  - Fuera de esta entrega (pendientes): semanas contributivas (pesqueros); aportes voluntarios (0609/0801, columnas M–O); pensionados por
    jubilación o invalidez (J/I) y dejar de calcular su aporte; código P (ingreso después del cierre); versión Excel del archivo AFPnet;
    pagos después del cese (RL = N); CPP (código 10 de AFPnet no cabe en el TXT: consultar a la mesa de ayuda de AFPnet); cruce con la consulta
    masiva de afiliados de AFPnet (ONP marcados que están en AFP); apellidos y nombres separados en la foto de la boleta (`fotoDe`).
  - **Envío de boletas por correo**: requiere firma digital y constancia de recepción (D. Leg. 1310). Investigación y opción mínima en
    `docs/superpowers/specs/2026-11-04-boletas-correo-investigacion.md`: acuerdo previo y escrito del trabajador; firma digital del representante con
    software acreditado (ReFirma/Watana); certificado digital S/ 133–177 al año; correo por Resend/SES; portal del trabajador con acuse de recibo.
- **Serie del comprobante validada en el backend (hecho, 2026-11-03, `f78c83f`)**: `/^[A-Z0-9]{4}$/` antes de reservar el correlativo en factura,
  boleta, NC, ND y GRE. Pendiente aparte: `documentosRelacionados[].numero` de la GRE va al XML sin escapar (su formato depende del catálogo 61).
- **Descarga de trámites del T-Registro (propuesta sin decidir)**: hoy siempre baja un `.zip` y hay que descomprimirlo antes del PVS; propuesta:
  si el trámite tiene un solo archivo (baja, modificación SCTR solo de salud) bajar el `.per` suelto, y en el zip avisar «descomprime antes del PVS».
  El PVS solo muestra los `RP_<RUC>.*` del RUC con que se ingresó.
- **Gratificación, CTS, vacaciones y liquidación (siguiente tema)**: hoy la gratificación se digita (0406 + 0312) y solo se proyecta para la 5.ª;
  vacaciones ya tienen saldo, venta y ajustes (ver «Vacaciones»); CTS, truncas, indemnización vacacional, liquidación de cese y provisiones no existen. Reglas verificadas
  y respuestas del contador en `docs/superpowers/specs/2026-11-04-beneficios-sociales-reglas.md`; falta el Excel del contador (liquidación y CTS) como
  formato y caso de prueba.
- **Reporte mensual de la planilla (entregado 2026-11-09, Backend `ba12dba`, Frontend `9636df11..36b5264d`)**: diseño en
  `specs/2026-11-09-reporte-mensual-planilla-design.md`. Botón «Reporte del mes» en Planilla del mes: tabla por trabajador (días por grupo,
  horas extras, días vendidos, tardanza en minutos y 0704, ingresos, descuentos con aportes, neto, aportes del empleador) con totales; Excel en
  masa (hoja «Reporte» con encabezado y estado + una hoja por trabajador) y por persona (`record-<doc>-AAAAMM.xlsx`); PDF apaisado con marca
  BORRADOR. Campo nuevo `asistencia.minutosTardanza` (0–14 400, informativo: el 0704 se sigue digitando). El descanso médico de los primeros
  20 días (tipo 20, lo paga el empleador) va aparte de los subsidios de EsSalud (21 y 22). Sin probar en navegador; mirar el PDF de 21 columnas
  con datos reales. Pendientes menores: 0704 automático desde los minutos, récord con reingreso en el mes (muestra solo el último vínculo),
  formato de soles en el Excel.
- **Abono de la planilla al banco (entregado 2026-11-09, Backend `af994e0..ccfb717`, Frontend `88e489a2..8b1f3135`)**: diseño en
  `specs/2026-11-09-abono-banco-design.md`. Lotes en Planilla del mes («Abonos al banco»): adelanto de quincena (% del básico en Perfil
  laboral, casilla «Pago quincenal» en la ficha), gratificación (07/12), saldo del mes (varios para reintegros) y CTS (desde el depósito
  confirmado). Archivo por banco de la cuenta de cargo: BCP Telecrédito (haberes 113/195, CTS 125/214, checksum sin validar con el banco),
  Interbank (104/380), Excel genérico para el resto; filas sin cuenta, efectivo o con error van «fuera del archivo». Confirmar un lote: egreso
  en Tesorería (`pago_adelanto` D 1412, `pago_remuneraciones` D 4111, `pago_cts` D 4151) y, en adelantos, 0701 «Adelanto» en la boleta;
  el asiento de la planilla abona la 1412 por el 0701. Sin doble pago (adelanto, gratificación y CTS exclusivos) y tope del neto entre
  tipos. **Antes de usar:** crear la 1412 en el plan de cuentas (no está en el semilla); completar en cada ficha tipo de cuenta y CCI
  (sin tipo, la fila sale fuera del archivo); revisar boletas en borrador con 0701 digitado (generar lo quita con aviso); probar un
  lote pequeño en Telecrédito e Interbank. Pendientes: confirmar con el contador el intangible CTS (4 boletas) y «últimos 6 sueldos»
  (BCP), subtipo `O` del BCP; BBVA/Scotiabank esperan su layout; sin probar en navegador.
- **Subsidios de EsSalud y prima AFP de mayores de 65 (entregado 2026-11-10, Backend `a4bd593..9f6a9e0`, Frontend `e0c02365..90353f7e`)**:
  diseño en `specs/2026-11-10-subsidios-essalud-prima-afp65-design.md`. La boleta propone el **0916** (días 21) y el **0915** (días 22) =
  promedio de las remuneraciones afectas a EsSalud de los 12 meses anteriores al inicio de la racha ÷ 360 × días (sin 04xx ni
  liquidación; horas extras solo si son regulares; el diario se hereda dentro de la racha); el contador lo corrige digitándolo, o lo
  deja en **0** si EsSalud paga directo. Afecta solo AFP; la base mínima de EsSalud se prorratea por días 21/22; con SIS no se calcula.
  Avisos: sin boletas anteriores, menos meses que el vínculo, días 21 sin 20 días tipo 20 en el año. **Prima AFP**: no se cobra desde
  el mes siguiente a los 65 (`tregistro.fechaNacimiento`), con nota en la boleta. Asiento: 0915/0916 → D «Subsidios por cobrar a
  EsSalud» (Planilla → Cuentas, sin semilla: sugerida 1629); reembolso en Tesorería con «Planilla: reembolso de subsidio EsSalud»
  (`cobro_subsidio`, solo ingreso). La intangibilidad de CTS de los lotes excluye 0915/0916. Lactancia y paternidad: sin cambios (el
  subsidio de lactancia lo paga EsSalud directo; paternidad ya es tipo 28). Jubilados que trabajan: descartado por el usuario.
  **Antes de usar:** crear la cuenta por cobrar y configurarla en Planilla → Cuentas. Al regenerar meses contabilizados con 0915/0916
  digitados, su asiento cambia de cuenta («documento cambiado»). **[Confirmar]**: cuenta 1629 con el contador; mes de corte de la
  prima con la AFP; divisor con menos de 12 meses. Menores diferidos: racha > 12 meses sin herencia; la boleta PDF no muestra el
  detalle del subsidio; reingresos con boletas de un vínculo anterior.
- **Anexo del trabajador en los asientos de planilla para CONCAR (entregado 2026-11-09, Backend `4bc2950..ed38eb9`, Frontend
  `f775180c..92758ae5`)**: diseño en `specs/2026-11-09-concar-anexo-trabajador-design.md`. Las deudas con cada trabajador salen una línea por
  trabajador con su DNI (rol `trabajador`, anexo en la columna L de CONCAR, tipo de documento en Tabla 2: 01→1, 04→4, 07→7, otros→0): en el
  asiento de planilla la 4111, la 1412 (0701) y las 4151/4114/4115 (provisión, consumo y reversión); en el depósito de CTS la 4151; en el
  egreso de un lote de abono el cargo por fila del archivo (el banco, una línea). Subdiario 35 sin cambio, sin documento de referencia. Al
  exportar, aviso de los pagos de planilla registrados a mano sin lote (quedan sin anexo). El PLE 1.2 no toma el tercero de las líneas
  `trabajador`. **Al desplegar:** regenerar un mes marca «documento cambiado» los asientos de planilla, CTS y lotes ya contabilizados; si no
  se exportaron, anularlos y regenerar; si ya están en CONCAR, darlos por resueltos (mientras tanto la exportación del mes da 400). Los DNI
  deben existir como anexos en CONCAR. Pendientes: confirmar con el contador si lleva documento de referencia en esas cuentas y si hay tope
  de líneas por voucher (una planilla de 80 trabajadores pasa de ~15 a ~250 líneas).
- **Vacaciones (entregado 2026-11-04)**: diseño en `specs/2026-11-04-vacaciones-design.md`. Pestaña «Vacaciones» de Planilla: saldo por trabajador activo
  y periodo (cada aniversario de ingreso; 30 días en régimen general, 15 en pequeña y microempresa), con goce imputado desde los días de vacaciones de las
  boletas, venta con `asistencia.diasVendidos` (entero 0–15, campo «Días de vacaciones vendidos» de la boleta; se paga como compensación 0117), ajustes
  manuales por periodo (`AjusteVacaciones`, con motivo y quien los hizo) y avisos con contador en la pestaña. Decisiones: el sistema **avisa y no bloquea**
  (ni el goce ni la venta se rechazan por falta de saldo); **carga inicial** = días pendientes de cada periodo ganado antes de la primera planilla del
  sistema (mes de corte), que se guarda como ajustes «Carga inicial» (botón visible siempre, resaltado mientras no se haya cargado); **tope de venta =
  derecho / 2** (15 días, 7,5 en MYPE), **confirmado por el contador**; **base del 0117 confirmada por el contador** = básico + asignación familiar + fijos
  afectos a EsSalud; un periodo anterior al corte con ajuste deja de estar «liquidado» y se comporta como un periodo normal. La carga inicial **ancla
  el corte por trabajador** (`vacaciones.cargaInicial.corte`): sus saldos se calculan siempre contra ese mes aunque se reabra la primera planilla cerrada
  o pase el mes sin planillas cerradas (marcas antiguas sin corte usan el global); solo acepta periodos ganados antes de ese corte y una diferencia de
  hasta ±60 días por periodo. Los **reingresos** ignoran las boletas de meses anteriores al nuevo ingreso. Fuera de alcance: vacaciones
  truncas, liquidación de cese y provisión (siguen en «Gratificación, CTS, vacaciones y liquidación»). Commits: Backend `fcc041f..b9ac096`; Frontend
  `feat(planilla): pestaña de vacaciones y venta de vacaciones en la boleta` (`PanelVacaciones`, `utils/vacaciones.js`, `ModalBoleta`, `Planilla`).
- **Liquidación de beneficios sociales y cuentas por área (entregado 2026-11-07)**: diseño en `specs/2026-11-06-liquidacion-design.md`, plan en
  `plans/2026-11-06-liquidacion.md`. Botón «Liquidación» en Planilla → Trabajadores (cesados): propuesta automática (RC, CTS trunca 0904, vacaciones
  no gozadas 0118 e indemnización 0504, truncas 0114, gratificación trunca 0407 y bonificación 0313) que el contador edita (bases, meses/días, montos,
  quitar líneas, agregar conceptos de la Tabla 22, observaciones); al confirmar pasa a la boleta del mes de cese (PLAME y asiento), queda bloqueada y se
  descarga el PDF con el formato del Excel del contador (el modelo da 2 295,13). Anular solo con la planilla del mes abierta. **5.ª del mes de cese** (desde
  11/2026, también en diciembre): ajuste final sin proyección y **devolución del exceso** como concepto `DEV5` (no va al `.rem`; asiento al debe de 40173).
  **Asiento por área**: campo «Área contable» en la ficha y Planilla → Cuentas con columnas General · Administración · Producción · Ventas, filas nuevas
  asignación familiar, bonificaciones, CTS e indemnizaciones. «Nuevo vínculo» exige la liquidación confirmada del cese (≥ 11/2026). Commits: Backend
  `df12ed6..461ecad`; Frontend `f9768668..9ffc503b`. **Pendientes**:
  - [Confirmar con el contador] cuentas de CTS (¿6291x?) e indemnizaciones (¿623/62311?); cómo se declara la devolución de 5.ª en el PDT PLAME
    (tributo 3051); si la indemnización vacacional es proporcional a los días pendientes; si la «5.ª anterior» de la ficha fue de otro empleador (el
    PLAME avisa cuando la devolución la incluye); variables ÷ 6 aunque el periodo sea menor (RCTS art. 6); tope de 60 días de subsidio en la CTS (hoy
    solo aviso).
  - Probar en el navegador el guardado al salir de un campo del modal (meses, Tab, días, Tab rápido) y abrir un PDF real; probar el PLAME con DEV5 en el PVS.
  - Menores: reingreso en el mismo mes del cese (anterior a 11/2026) deja la boleta sin el ajuste final; la tabla de cuentas por área no tiene
    desplazamiento horizontal en pantallas angostas; la dirección del empleador no sale en la cabecera del PDF (tampoco en la boleta).
- **CTS semestral, gratificación ordinaria y provisiones (entregado 2026-11-07)**: diseño en `specs/2026-11-07-cts-gratificacion-provisiones-design.md`,
  plan en `plans/2026-11-07-cts-gratificacion-provisiones.md`. **Gratificación** de julio y diciembre calculada sola en la boleta (0406 + 0312;
  RC vigente al 30/06 o 30/11, meses calendario completos, 1/180 por día no laborado; un 0406 digitado o de la liquidación la reemplaza).
  **CTS semestral**: pestaña «CTS» de Planilla (calcular, editar, confirmar, fecha de depósito, anular; hojas PDF por trabajador y .zip;
  aviso del 1 al 15 de mayo/noviembre); la boleta del mes de depósito la muestra como dato informativo (fuera del neto y del PLAME); pago en
  Tesorería con «Planilla: CTS»; cuenta CTS en la ficha; solo soles. Arrastre de días del ingreso «opción B» (días sueltos aparte + meses
  completos), también en la CTS trunca. **Provisiones**: selector «Registro de beneficios sociales» en Perfil laboral (gasto al pagar /
  provisión mensual, «Rige desde», con historial; no puede regir antes de la última planilla cerrada); provisiones de CTS, gratificación y
  vacaciones por área contra 4151/4114/4115; **el pago siempre descuenta lo provisionado** (la 41 queda en 0) aunque se vuelva a «gasto».
  Ayuda «¿va al PLAME?» en la boleta y la liquidación. Prueba del año completo en `test/planillaAnio.test.js`. Commits: Backend
  `bdd49d0..14853f2`; Frontend `5a81c5e1..a12e2d6d`. **Pendientes**:
  - [Confirmar con el contador] ventana de variables de la gratificación de diciembre (jun–nov); licencia sin goce en la quincena de pago;
    tope de 90 remuneraciones diarias de CTS en pequeña empresa (sin aviso hoy); probar la 0904 en el `.rem` del PDT.
  - Probar en el navegador la pestaña CTS, el selector y la boleta; abrir hojas de CTS reales.
  - Menores: el aviso «Sin carga inicial de vacaciones: solo se provisiona el periodo en curso» debería decir «desde el corte»; la proyección
    de la 5.ª sigue contando meses con la regla base 30; choque de código CTS al crear dos depósitos a la vez da 500.
- **RMV S/ 1 230 desde 01/10/2026** (D.S. 015-2026-TR): actualizar los Parámetros de oct/nov 2026 (reabrir y regenerar la planilla si ya están cerradas).
  El valor inicial de `PARAMETROS_INICIALES` ya es 1230.
- **Prueba inestable ajena**: `test/bancos.test.js` «carrera: un movimiento y el cierre…» falla a veces por `0` contra `-0`; pasa al re-ejecutar.
- **Menores diferidos que se conservan**: tasa de vida ley con 4 decimales (hoy se redondea a 2 sin avisar); `tramitesPendientesEnMes` (aviso de
  `PanelPlanillaMes`) no cuenta las modificaciones SCTR pendientes; la primera generación de una planilla de un año anterior, sin foto guardada, tras
  avanzar `senati.anio` toma `senati = false`; `fusionarModificacionSctr` conserva solo la última fecha (un alta en X más un cambio de entidad en Y antes
  de registrar pierde la cobertura X..Y−1); activar SCTR con un marcado registrado cuyo ingreso es posterior a `sctrFecha` da 400 (podría usarse el
  máximo con el ingreso); la baja borra la pendiente SCTR sin dejar traza en `tregistro.ediciones`; falta un test de la omisión de `senati` en el `$set` del PUT.

**Asientos automáticos editables (2026-10-05, decisión del usuario: el automático es la base y se completa a mano):**
- `PUT /api/contabilidad/asientos/:id` edita también los automáticos, en borrador o contabilizados (admin y contador). No
  se editan los anulados ni los **ya exportados** (esto último vale también para los manuales: antes se podían editar).
  En un automático la fecha, la moneda y el TC son los de su documento (el servidor ignora lo que llegue).
- El formulario manda cada línea guardada con su posición (`origenLinea`); si no se tocó (`sinCambios`) el servidor la
  conserva tal cual (un automático en dólares tiene líneas a distinto TC o solo en soles); si cambió, conserva el papel
  de la línea, el comprobante, la referencia y la detracción (los usan CONCAR y el PLE). `utils/asientos.js`.
- Queda `editadoManualmente`: «Generar asientos del mes» no reescribe un borrador editado; si su documento cambió lo
  marca (`origenCambiado`). `POST /api/contabilidad/automaticos/:id/restablecer` descarta lo editado de un borrador.
- Frontend: el mismo modal desde Asientos («Editar») y desde Automáticos (botón «Editar» en cada borrador), con aviso
  de que es automático y «Descartar lo editado y volver al generado».

**Revisión del motor contable contra contaperu y fechas en hora de Lima (2026-10-03, cambios locales sin commit):**
- PLE corregido, asiento de diferencia de cambio al cierre y constancia de detracción en CONCAR: detalle en
  `docs/contabilidad/HANDOFF-contabilidad.md`. El plan sigue siendo **PCGE 2019** (decisión del usuario).
- **Fechas (frontend):** `utils/fecha.js` suma `aInputFecha`, `anioLima` y `mesLima`; `formatearFecha` y esas tres
  leen un valor a **medianoche UTC exacta** como día de calendario (así guardan sus fechas las cotizaciones, OT, OC,
  ingresos de equipo y comprobantes electrónicos) y cualquier otro instante en hora de Lima. Se quitaron los
  `toISOString().split("T")[0]`, `getFullYear()`/`getMonth()` y `setHours()` de los detalles, las listas y el
  Dashboard (antes, después de las 19:00 o en el borde del mes daban el día o el mes equivocado).
- **Fechas (backend):** al cerrar una cotización con fecha de pago, la factura se guarda a medianoche de Lima
  (`routes/cotizaciones.js`, antes medianoche UTC = día anterior en Lima); los rangos mensuales del resumen tributario
  y del SIRE ya no dependen del huso del servidor (`setUTCMonth`).
- **Fechas a medianoche de Lima (2026-11-24, pedido del usuario; sin commit al anotar):** (1) conversión global en `Backend/src/config/fechasLima.js` (importada desde `config/db.js` y `test/helpers.js`): todo `"AAAA-MM-DD"` que entra a un campo `Date` —documentos, filtros y `findByIdAndUpdate`— queda a medianoche de Lima; (2) `comprobante.controller` y `guia.controller` usan `aFechaLima` (emisión, vencimiento, cuotas, traslado); (3) se quitaron los rangos de mes en UTC de SIRE (`registrosDelSistema`), asientos automáticos (`construirPeriodo`, `fechaUtcALima`) y resumen tributario (`ventasDelMes`), y las lecturas del día del comprobante pasan a hora Lima (`facturaInterna`, `facturas.js`, `tcDeVenta`, TC del resumen). Frontend: `PanelResumenTributario` ya no fuerza UTC; `utils/fecha.js` sigue leyendo en UTC los valores a medianoche UTC exacta (legado). Tests: `test/fechasLima.test.js` y fixtures de `sire`, `resumenTributario`, `asientosAutomaticos` y `retencionIgvCpe` a medianoche de Lima. **Pendiente (4): correr la migración en cada base** con `node scripts/migrarFechasLima.mjs` (simula; `--aplicar` escribe; `--uri` para otra base). Suma 5 h a todo valor `Date` a `00:00:00.000Z` exacto en todas las colecciones, salvo `createdAt`/`updatedAt`; es idempotente. Probada en una copia de la base local (28 valores: comprobantes, cuotas, cotizaciones, facturas; segunda pasada 0). Aún no aplicada en ninguna base. El usuario la correrá en la base del cliente. 2026-11-25: los listados de CPE y GRE filtraban `hasta` con `new Date(hasta)` (00:00Z) y dejaban fuera lo emitido ese día (05:00Z); ahora usan `aFechaLima` (test en `retencionIgvCpe`). El XML no cambia: fecha y hora salen de `fechaHoraEmisionLima()` y las cuotas viajan como texto. Sin migrar, un registro viejo del día 1 cae en el mes anterior del SIRE, los asientos y el resumen, y los lectores en hora Lima del backend lo muestran un día antes (en la base local de dev no hay ninguno del día 1).
- Pendiente de la auditoría (no pedido): asignación masiva en cotizaciones/OT/OC, informes sin guarda de rol, cantidad
  negativa en movimientos de almacén y JWT sin revalidar usuario (el usuario dejó seguridad fuera por ahora).

**Resuelto en esta rama (2026-10-03) — doble pago/cobro durante la recarga:** tras registrar un pago, cobro o
movimiento, `TablaPorPagar`, `TablaPorCobrar` y `TablaMovimientos` dejan las acciones deshabilitadas (estado
`recargando`) hasta que termina la recarga, así no se abre otro pago con el saldo viejo. Traído de `main` con
cherry-pick (`3838fea`). Extendido a **Bancos** (transferencia e ingreso/egreso manual) y **Caja chica** (gasto,
rendición, reposición, arqueo y anulaciones), probado con E2E y recarga demorada. *Nota para `main`:* no hace falta
portarlo; tras el revert `main` no tiene Bancos ni Caja chica, y sus tres tablas ya traen el arreglo.

**Resuelto (2026-10-02) — SUNAT 3270 con descuento de línea:** `cac:AlternativeConditionPrice` (precio unitario con IGV)
ahora es (valor de venta + IGV) / cantidad, ya descontado (`src/builders/factura.builder.js`, prueba
`test/precioUnitarioDescuento.test.js`). Mismo arreglo en SIPAPP-MICRONEGOCIOS y SIPAPP-HUAQUIAN. Sigue **pendiente** en
la rama `modulo-venta/informes/comprabasico` (en `contabilidadoficial` llegó con el merge del 2026-10-03).

**Tarea "saldos de tesorería": en `main` y con push (2026-10-02)**, `feature/movimientos-manuales` (Backend y Frontend),
E2E en navegador OK (8 escenarios: saldo inicial PEN/USD, tarjetas, aporte, egreso de caja sin saldo → 409, gasto
bancario con sobregiro confirmado, transferencia solo misma moneda, pago y "Ya se pagó" con sobregiro, anular un
ingreso ya gastado → 409, selectores con saldo, dif. de cambio con saldo inicial USD, contador sin botones). Plan y ledger: `docs/superpowers/plans/2026-10-02-intales-saldos-tesoreria.md` y
`docs/superpowers/sdd/2026-10-02-intales-saldos-tesoreria-progress.md`. Incluye:
- Saldo inicial por cuenta (monto, fecha y TC compra SUNAT si es USD; editable solo sin movimientos, jefatura/admin) y
  saldo calculado por agregación (`utils/saldosCuentas.js`), visible en Movimientos, Configuración y en los selectores
  de cuenta de pagos, cobros y "Ya se pagó".
- Ingreso/egreso manual (aporte, préstamo, retiro, gasto bancario, otros) y transferencia entre cuentas propias de la
  misma moneda: `POST /movimientos-tesoreria/manual` y `/transferencia`; registran y anulan admin, jefatura y tesorero
  (el contador y facturación solo leen); en USD con el TC SUNAT del día.
- Saldo insuficiente en pagos, autodetracción, egresos manuales y transferencias: caja y detracciones → 409; banco →
  409 `codigo: "SOBREGIRO"` y se registra con `confirmarSobregiro: true` (diálogo propio en el panel; en "Ya se pagó"
  va en la raíz del body). Mide el **mínimo del saldo acumulado** desde la fecha; el saldo inicial no cuenta antes de su
  fecha. La diferencia de cambio al cierre suma el saldo inicial con su TC.

**En `main` y con push (2026-10-02):** `feature/revision-compras` (Backend y Frontend) — correcciones de compras
traídas de la revisión de Micronegocios (línea de SC condicionada, anular OC libera solo sus líneas, fecha de entrega
real, retención de 4ta > S/ 1,500, notas simultáneas sobre el mismo origen), receptor validado y boleta a clientes
varios en CPE (tipo y número `-`, aceptada en SUNAT demo), detracción 004/026/027 → 400 (también fuera del selector),
SIRE más robusto.

**Rama `ventas/produccion/contabilidadoficial`** (worktree `SIPAPP-INTALES-venta-produccion-contaoficial`): ya tiene los
arreglos de `feature/revision-compras` y el del selector de detracción (especificación en su
`docs/PORT-fixes-revision-compras.md`). **Los saldos de tesorería NO se portaron**: esa rama se sigue avanzando y se
mergeará con `main`, que ya los trae.

**Motor contable C1–C3, CONCAR, Bancos B7 y caja chica: en `main` y con push (2026-10-02).** La rama
`claude/affectionate-ride-1ql646` (mergeada) trajo `main` (saldos y movimientos manuales) y adapta encima Bancos B7 (libro y
conciliación), caja chica, C1–C3 y CONCAR. Se retiró el catálogo de tipos de movimiento de B7 y sus rutas; los
manuales de `main` admiten cuenta contable y centro de costo opcionales y C2 usa la cuenta por concepto de
Contabilidad → Configuración (semilla: gasto bancario 6391). Backend 369 tests (368 ok, 1 omitido), frontend 94,
E2E del flujo integrado OK. Detalle en las secciones «Integración con main» de los specs de B7 y caja chica.

**Decisiones por confirmar con el usuario** (tomadas al implementar los saldos; el usuario pidió dejarlas anotadas):
1. ~~El saldo inicial lo editan jefatura y admin; el tesorero no.~~ **Resuelto (2026-11-12, decisión del usuario):** también el **contador**, pero solo el saldo inicial (nombre, estado, crear cuentas y el resto de Configuración siguen siendo de jefatura/admin; el contador ve la pestaña en solo lectura). Backend `routes/cuentasTesoreria.js` (`puedeEditarCuenta`, test en `saldosCuentas.test.js`); Frontend `Tesoreria.jsx` y `PanelConfiguracion.jsx` (`soloSaldoInicial`). Sin commit al anotar.
2. Se agregaron transferencias entre cuentas propias de la misma moneda (el diseño no las pedía).
3. Manuales en USD: el ingreso usa el TC de cobros (compra por defecto), el egreso el de pagos (venta) y la
   transferencia el de compra.
4. Se permiten movimientos manuales con la cuenta de detracciones (pagar impuestos con fondos BN, liberación de fondos).
5. El contador y facturación todavía pueden anular pagos y cobros **con documento** (como antes); solo los manuales
   quedaron restringidos.

**Por confirmar con el contador** (no implementar sin respuesta):
- Si el RCE del SIRE trae los montos de comprobantes en US$ en dólares o en soles (probar con un archivo real).
- TC compra/venta en cobros y pagos en dólares.
- Preguntas del documento `docs/contabilidad/2026-10-01-casos-prueba-contables.md` (sección final): costeo de OT y
  CIF, cuentas de NC de compra (60x vs 7311) y de venta (7411 vs 7032x), cuenta BN (1042 vs 107), 4ta al provisionar o
  al pagar, boletas en el Registro de Compras, coeficiente de renta, vigencia del D. Leg. 1669.
- C2 está hecha con defaults; queda **validar con el contador** (`docs/contabilidad/Preguntas al contador.md`):
  subdiario de caja-bancos (21 por defecto), flag `N` en caja-bancos US$ (primera importación real), divisionarias a
  6 dígitos, maestro de anexos en CONCAR (RUC), destinos 9x/79 (apagados), cuenta de detracción BN (1042/107).

**Brechas contables aún abiertas** (de `casos-prueba-contables.md` §4; B1–B5, B9 y B7 ya resueltas; B7 = movimientos manuales de `main` + conciliación de la rama): B6
cuenta de gasto por comprobante de compra (en la rama: cuenta por comprobante asignable desde pendientes); B10 periodo de anotación y
crédito diferido (1673); B11–B13 costo de OT por devengo, salidas de almacén y IGV sin crédito al costo; B14 bases no
gravadas/exoneradas; B15 retención 3 % al pagar y CRE/PDT 626; B16 detracción solo para servicios; B17 fecha de
aplicación de NC; B18 anticipos; B19 correlativo de línea en asientos.

**Menores diferidos** (detalle en la sección "Estado" de cada spec y en los ledgers `docs/superpowers/sdd/`):
- Compras: Excel de Por pagar sin crédito fiscal derivado; Movimientos sin etiqueta "aplicación"; formulario de nota
  (moneda editable tras elegir origen, origen no se limpia al cambiar proveedor); NC en el filtro "Pendiente"; índice
  `{notaCredito, anulado}`; resumen de Por pagar no resta NC.
- SIRE/resumen: TC vacío del SIRE tomado como 1; base + IGV en S/ puede diferir del total en 0.01; Excel del resumen sin
  signo en moneda original; reintentar el mismo mes tras error; detalles del cuadro comparativo (signo, filas duplicadas,
  tamaño máximo).
- Ventas: venta USD sin TC suma 0 sin aviso; TC de NC USD sin factura ligada; saldo a favor (145) vs retenciones (179);
  exonerados/inafectos como base gravada; TC de la factura por fecha del formulario vs fecha real del CPE; cierre a fecha
  pasada usa saldos con NC posteriores; facturas con CPE anulado por NC siguen en Por cobrar; búsqueda del origen de NC
  sin filtrar ambiente; el ajuste de cierre no se guarda; NC 01 desde la UI no precarga otros cargos/redondeo;
  `ModalCrearFactura` no envía detracción al CPE.
- Bloqueo de edición y compras: ver la sección "Estado" de sus specs.
- Saldos de tesorería (revisión final y E2E, 2026-10-02):
  - Un manual con fecha futura se acepta y ya suma al saldo mostrado.
  - Egreso con fecha anterior al saldo inicial: se compara contra 0 (regla aprobada) pero el mensaje no lo explica.
  - Dos constantes `CONCEPTOS_MANUALES` distintas (la del modelo incluye "transferencia"); renombrar la de utils.
  - `leerSaldoInicial` toma `""` como 0 y `true` como 1.
  - `GET /cuentas-tesoreria` hace una agregación y un `exists` por cuenta (aceptable con pocas cuentas).
  - El diálogo manual deja combinar Ingreso con "Retiro" o "Gasto bancario" (y Egreso con "Aporte"): filtrar
    conceptos por tipo.
  - Al anular un ingreso ya gastado el mensaje dice "disponible S/ -450.00, falta S/ 450.00": decir "anularlo dejaría
    la cuenta en −S/ 450.00".
  - Las tarjetas muestran el negativo como "S/ -380.20" (en otros lugares "−S/ 380.20").
  - En la base E2E, la tarjeta de BCP Dólares (US$ 2,217.82) y el cierre de dif. de cambio (US$ 2,276.82) difieren en
    el egreso MOV-0007 de S/ 59 (un comprobante en soles pagado desde la cuenta en dólares): revisar si un pago en otra
    moneda debe bloquearse o convertirse.
- Base sin IGV de la OC distinta a la de su cotización (anotado 2026-11-12; origen HUAQUIAN frontend `f144de0`,
  aplicado en INTALES `venta-produccion-comprabasico` sin commit al anotar): «Crear OC» desde la lista
  (`ModalCrearOrdenCompra.jsx`) precarga `cot.total` (con IGV) como subtotal → OC inflada 18 %; la OC desde la
  cotización (`ModalOrdenCompra.jsx`) precarga `cotizacion.subtotal`, que `DetalleCotizacion.jsx` guarda **bruto**
  cuando no hay ítems (sin `descuentoGlobal`). Fix: precargar `total − igv` (`subtotal` solo si no hay `igv`) con un
  helper `baseSinIgvCotizacion` en `utils/cotizacionItems.js`. Datos existentes: migrar solo las OC que coinciden exacto
  con el monto erróneo; **las OC con factura no se tocan** (regla del usuario), solo se listan.

## 6. Índice de documentos

- `docs/contabilidad/`: **`Preguntas al contador.md`** (todas las preguntas abiertas, consolidadas 2026-10-02), **referencias de otros ERP para C2–C5**, investigación de libros electrónicos, diseño del motor contable (aprobado, cuentas corregidas),
  spec de implementación C1, **guía contable** y **casos de prueba** (agente contador), `HANDOFF-contabilidad.md`.
- `docs/superpowers/specs/`: todos los specs (cotización, centro de costo, compras, Tesorería B1, bloqueo de edición,
  comprobantes de compra, ventas US$/tributario).
- `docs/superpowers/plans/` y `docs/superpowers/sdd/`: planes y ledgers (decisiones `Ruling:` y menores).
- `docs/HANDOFF-comprobantes-compra.md`: traspaso histórico de las Fases 1–2 (cerrado).

## Hecho (2026-11-19, portado desde SIPAPP-INTALES-venta-produccion-comprabasico Backend `ca569d1`/`c875353`, Frontend `427598db`/`f704bd25`/`878084a2`)

- **Cotización «Afecto a IGV»** (casilla marcada por defecto; desmarcada = trabajo en el extranjero): `Cotizacion.afectoIgv`.
  Sin IGV → `igv = 0`, `total = subtotal con descuento`, PDF «I.G.V (NO AFECTO)», lista y precarga de OC
  (`ModalCrearOrdenCompra`) usan `total` como base, y al cerrar la cadena a mano no hay detracción. El backend
  (`normalizarAfectoIgv`) fuerza `igv = 0`. La OC y la factura que nacen de ella tampoco llevan IGV (ver «Hecho
  2026-11-20»); `ModalOrdenCompra` precarga `cotizacion.subtotal` (bruto, ver pendiente
  «base sin IGV de la OC»).
- **Filtro «Estado de servicio» de la lista de OTs:** filtra por `estadoProgresoOT` (lo que muestra el chip): No asignado /
  Pendiente / En progreso / Completado / Entregado + Cerrada + Anulada. Las anuladas solo salen en «Todas» y «Anulada».
- **Reporte Costos de Fabricación** (decisión del usuario): una fila por OT con su costo; OT↔OC del cliente por
  `numeroDocumento` en `utils/costosOT.js` (entran OC sueltas y se suman todas las OC no anuladas de la cadena); el margen
  es de la OC = OC sin IGV − costo de TODAS las OTs de la cadena (`costoCadena`, calculado en la ruta del listado). La
  moneda sigue el selector S/ · US$ de la página (TC SUNAT de una fecha). OC solo en la primera OT de cada cadena
  (`rowSpan` en pantalla; celdas vacías en el Excel).

## Hecho (2026-11-20, sin commit al anotar)

- **OC y factura de una cotización sin IGV tampoco llevan IGV** (decisión del usuario): `OrdenCompra.afectoIgv` se hereda de la
  cotización en su `pre("save")` (y en el PUT al vincular otra cotización) y fuerza `igv = 0`, `total = subtotal`;
  `Factura.afectoIgv` se hereda de su OC (o de su cotización) al crearla y deja IGV 0, sin detracción ni retención. Los modales
  y detalles de OC y factura muestran «IGV (no afecto)». La factura del cierre de cadena lleva `afectoIgv`.
- **CPE de exportación NO implementado:** `ModalCrearFactura` y `EmitirComprobante` (prellenado desde OC) **bloquean** la emisión
  para una OC sin IGV (`MSG_OC_SIN_IGV` en `utils/catalogosSunat.js`): emitirla con afectación 10 sería un comprobante gravado
  incorrecto, y con 40 sobre la operación 0101 SUNAT la rechazaría (correlativo quemado). **Pendiente de decidir con el
  usuario:** factura de exportación de servicios (tipo de operación 0200, afectación 40, `9995`/`EXP`, receptor no domiciliado
  `tipoDoc 0`, código de producto SUNAT por línea; skill `sunat-cpe-ubl21` §«Caso exportación») y su asiento (7011 exportación).
- **Hoja «Detalle de compras» en el Excel de Reportes** (`GET /reportes/detalle-compras`, se pide al exportar): una fila por
  compra sin duplicados, con OT / sub-OT, N° OC del cliente y su **fecha de creación** (decisión del usuario: la de la OC del
  cliente), proveedor, descripción, cantidad, moneda, precio unitario sin IGV, flete y total. Mismas fuentes que `utils/costosOT.js`: líneas de OCP ligadas a la OT, ítems antiguos
  procesados que no pasaron por una OCP y comprobantes sin OC ligados a la OT (sin NC). Test en
  `test/costosFabricacion.test.js`.

## Hecho (2026-11-25, sin commit al anotar) — evaluación heurística de UX (skill `heuristicas-nielsen-ux`)

Revisión de las 10 heurísticas de Nielsen en todo el frontend; corregidos los S4 y S3. Backend y Frontend.

- **Transversal:** `fetchAuth`/`uploadAuth` convierten la caída de red en una respuesta 503 con `mensaje` (ya no quedan
  botones en «Guardando…»); 401 → `#/login?motivo=expirada` con aviso en Login; Login navega a `/` (redirección por
  rol). Listener global `wheel` en `main.jsx`. `ConfirmacionAccion` (JSX, `peligro`, `textoProcesando`, Esc),
  `PromptAccion` (`error`, `peligro`, `minLength`/`maxLength`, Esc), `useConfirmar(texto, { peligro })`.
- **Ventas/CPE:** confirmación con resumen antes de emitir (ModalCrearFactura, EmitirComprobante, EmitirGuia); fecha de
  emisión de solo lectura en ModalCrearFactura y la OC creada se reutiliza al reintentar; advertencia de NC con la regla
  real; NC/ND responden `serie` y se muestra `aviso`; GRE EN_PROCESO en ámbar; serie y punto de partida restaurados en
  «Nuevo»; filtro «hasta» de comprobantes y guías en hora Lima (backend + tests); ListaFacturas con moneda y totales por
  moneda; estados cargando/error/vacío en listas; **factura aceptada por SUNAT no se anula internamente** (backend 400 +
  botón «Emitir nota de crédito» → EmitirComprobante con `state.comprobanteId`); `BotonAnular` muestra el error dentro
  del diálogo; EN_PROCESO en `ESTADO_COMPROBANTE`.
- **Tesorería/contabilidad:** vista previa de ModalImpuestoVenta con moneda y TC; confirmación con conteo en Exportar
  CONCAR, Contabilizar (todo/seleccionados), Dar por resuelto y Cerrar conciliación; tres estados en Por pagar/Por
  cobrar/Movimientos/Caja chica/Diferencia de cambio; avisos «Guardado»/error junto al control en Configuración;
  «Cambios sin guardar» en configuración contable; descartar cambios con confirmación (factura de proveedor, asiento,
  conciliación).
- **Almacén/operaciones:** ingreso en masa sin duplicar al reintentar; cantidad > 0 y precio ≥ 0; egreso exige lote y no
  supera su disponible; confirmación con cantidad × precio = total; moneda de la OC al vincular/quitar cotización;
  errores del backend en OT/OC; cambios de estado de OT con error visible; clases Tailwind rotas en Requerimientos.
- **Planilla:** GET de la planilla devuelve `desactualizada` + motivos (banner con «Recalcular»), resumen al cerrar,
  aviso de boletas quitadas al recalcular, avisos persistentes, confirmación al descartar cambios, modales de anular
  unificados en PromptAccion. Dashboard, Reportes y Usuarios muestran error con «Reintentar».
- **Pendientes de esta revisión:** NC sobre **boleta** no se puede emitir desde la pantalla (FC02/FD02 empiezan con F y la
  validación exige la letra de la referencia): falta decidir serie BC/BD. `utils/leerError.js` común (hoy copiado en
  ~10 archivos). Endpoint de vista previa de exportación CONCAR (hoy el frontend pagina asientos para contar). S2 no
  abordados: etiquetas de rol en tres copias, diez pestañas planas de Planilla, búsqueda en listas de trabajadores,
  buscadores de material sin teclado, filtros de fecha sin etiqueta en tesorería, paginación de asientos.


## Hecho (2026-11-25, sin commit al anotar) — más funciones portadas desde comprabasico

- **Servicios externos de la cotización en su moneda** (fix de comprabasico en `DetalleCotizacion.jsx`): cada fila muestra
  `costo × cantidad + transporte` en la moneda del servicio y el total va en soles con el `tipoCambio` guardado de cada
  servicio (`utils/montoCompra.js` `costoCompraSoles`), sin los anulados. Antes un servicio en US$ salía como S/ y el total
  sumaba dólares como soles; además mostraba el costo unitario. En comprabasico el total aún ignora cantidad y transporte.
- **Descripción del ítem de cotización en `<textarea rows={4}>`** (comprabasico `c4e54b98`).
- **Fotos comprimidas antes de subir** (`utils/comprimirFoto.js`, comprabasico `16e3b547`): JPEG/PNG/WebP ≥ 1,5 MB a 2000 px
  en JPEG 85 %; en `TarjetaArchivosRelacionados`, `ModalNuevaCotizacion`, `ModalNuevaOT`, imagen del ítem en
  `TablaItemsCotizacion` y `compras/ArchivosProveedor`. No en `ModalFacturaProveedor` ni `PanelSire` (sustento tributario).
- Detalle del ítem cotizado en la OT y adjuntos asignables por OT: ver las dos entradas «Hecho (2026-11-25…)» de §5.

## Pendiente — funciones de comprabasico que necesitan decisión (anotado 2026-11-25)

- **`anularFacturaInterna` + `PATCH /cpe/:id/anulacion-externa`** (comprabasico `c0d8fb2`): cuando una NC anula el CPE, la
  factura interna se anula sola si no tiene pagos ni cadena cerrada (si los tiene, devuelve un aviso para regularizar); y
  una anulación hecha fuera del ERP (NC en SOL o en SmartPSE, comunicación de baja) se registra a mano con documento y
  motivo. En contaoficial la NC solo pone `comprobanteEmitido=false` y alguien anula la factura a mano. Al portar: revisar
  cobros en tesorería (`saldosTesoreria.js`) además de `montoPagado`, y el asiento de la anulación.
- **Corregir el monto de una compra procesada (solo admin)** (comprabasico `32b81a1`/`c2b1e731`): el esquema
  `correccionesMonto` ya está, faltan ruta y pantalla. En contaoficial la compra pasa por OCP → factura del proveedor →
  asientos y tesorería: corregir el requerimiento descuadraría la contabilidad. Propuesta: corregir sobre la factura del
  proveedor (o NC del proveedor).
- **Registrar pagos desde la factura** (comprabasico `PATCH /facturas/:id/estado-pago`, cuotas y detracción): en
  contaoficial `estadoPago`/`montoPagado` se derivan de los cobros de tesorería; escribirlos a mano rompe el cálculo.
  Propuesta: botón «Registrar cobro» en la factura que cree el cobro en tesorería. No urgente.

## Hecho (2026-11-27, sin commit al anotar) — mejoras de Compras y Reportes

- **Observaciones de la OCP editables** después de emitida (`PATCH /ordenes-compra-proveedor/:id/observaciones`, con bloqueo;
  no si está anulada). Es el único dato editable: montos, plazos y forma de pago no cambian. El PDF sale con el texto nuevo.
- **Pestaña «Recepcionado» en Compras** (a la derecha de «Compras»): en «Compras» se seleccionan OCs y «Marcar como
  recepcionado» pide fecha (no futura), receptor, guía y factura, igual que comprabasico (`validarRecepcion`). Se guarda en la
  OCP (`recepcionado`, `fechaRecepcion`, `receptor`, `guiaRecepcion`, `facturaRecepcion`, `recepcionadoPor`), no en el
  origen: no toca el costo por OT. **Decisión tomada sin confirmar con el usuario:** no exige que la OC esté pagada (con
  crédito la mercadería llega antes de pagar; en comprabasico sí se exigía). Una OCP recepcionada ya no se puede anular. Al recepcionar sale la card flotante (`alertarCompra`).
- **Estado de pago en la tabla de Compras**: `GET /ordenes-compra-proveedor` devuelve `estadoPago` derivado
  (`estadosPagoOCP` de `alertasCompra.js`, en columna propia): pendiente sin comprobantes; pagado solo si ya se facturó todo y cada comprobante está pagado; parcial si
  algún comprobante tiene pagos. Filtro por estado de pago y columna en el Excel.
- **«En licitación» muestra las columnas de «Por procesar»**: una fila por ítem (SC, fecha SC, origen, tipo, tipo de artículo,
  descripción, cantidad, unidad, centro de costo, solicitante); la lista pobla `items.solicitudCompra`.
- **Reportes con pestañas**: General (con fila de total en cada tabla y en el Excel; mora ahora respeta la moneda de la
  factura), **Proyección de pagos** y **Gastos por OT**.
  - `GET /reportes/proyeccion-pagos?desde&hasta`: saldo de cada comprobante de proveedor a su vencimiento (neto en su moneda;
    detracción/retención en S/) + lo no facturado de cada OCP estimado con `plazoFormaPago(formaPago)` sobre la fecha de
    entrega (o de la OC), con IGV. «30% de adelanto»: el % a la fecha de la OC y el resto contra entrega. Consignación o
    texto sin días → «Sin fecha». Además, los pagos a proveedores del rango con días de anticipo/atraso frente al vencimiento.
    Una factura pagada antes de vencer sale de la proyección y aparece en «Pagos realizados». Agrupa por día, semana, forma
    de pago o proveedor, con subtotales en S/ y US$ por separado.
  - Gastos por OT: misma fuente que la hoja «Detalle de compras» (`/reportes/detalle-compras`, ahora con `tituloOT`),
    agrupado por OT con el nombre del material y subtotales por moneda.
- Tests: `test/comprasReportes.test.js`.

## Facturación parcial por partidas (2026-11-26) — implementada en `feature/facturacion-parcial`, sin merge

- Backend y Frontend en la rama `feature/facturacion-parcial` (Frontend `15d6b6d8`…`9b4bda98` + ola de correcciones
  final). Spec: `Backend/docs/superpowers/specs/2026-11-26-facturacion-parcial-oc-design.md` §16 (pantallas).
- **Runbook de despliegue, ventana de mantenimiento, un solo proceso Node, reversión, decisiones abiertas y deuda
  diferida (también la del frontend):** `Backend/docs/ESTADO-PROYECTO.md`, sección «Facturación parcial por partidas —
  runbook de despliegue». Backend y Frontend se despliegan juntos.
