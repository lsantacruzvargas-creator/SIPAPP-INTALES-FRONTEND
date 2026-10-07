# Estado del proyecto SIPAPP-INTALES — punto de entrada para agentes

**Actualizado:** 2026-10-02 · **Idéntico en** `docs/` de los repos Backend y Frontend (y en `docs/` de la carpeta raíz).

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
| Motor contable C5 (cierre anual, EEFF) | En suspenso: lo hace el software del contador | `docs/contabilidad/2026-10-01-referencias-erp-C2-C5.md` |

Ramas remotas `feature/*` ya mergeadas (se pueden borrar si el usuario lo pide): `bloqueo-edicion`,
`comprobantes-compra`, `ajustes-tributarios`, `ventas-usd-tributario`, `seguridad-auditoria`, `ligar-cpe-factura`.

## 4. Decisiones del usuario vigentes (no re-preguntar)

**Tributario / contable**
- **INTALES no será la contabilidad oficial** (2026-10-01): genera los asientos y los **exporta al software del
  contador**. Software: **CONCAR** con **PCGE 2019** (decisión 2026-10-02; formato de importación de 41 columnas
  portado de contaperu). La fase C4 pasa de "exportación PLE" a "exportación al
  software del contador"; el plan de cuentas se importa del contador para que los códigos coincidan.
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

**Resuelto (2026-10-07) — retención del IGV en la factura electrónica (Backend `e570963`, Frontend `2b5bceca`;
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

**Resuelto (2026-10-07) — descuento por línea en Emitir Comprobante (Frontend `8e319563`; origen SIPAPP-HUAQUIAN
`ff72647`; ver skill `sunat-cpe-ubl21` §10):** el input "Desc. %" guarda 0-100, pero `calcularLineaComprobante`
(`utils/catalogosSunat.js`) trabaja en fracción 0-1; con descuento, los totales en pantalla salían mal (20 % sobre 100
daba base −1900) y de ahí salen el monto neto de detracción que se envía y la validación de cuotas. `itemsCalc` en
`Frontend/src/pages/EmitirComprobante.jsx` ahora convierte a fracción antes de calcular.

**Pendiente de portar desde `ventas/produccion/contabilidadoficial` (2026-10-03; backend `da4282b` y `f9d25dd`, frontend `7115c09e` y `00bb1ea4`; ver su
ESTADO-PROYECTO §5 y las skills `erp-reglas-datos` §3 y `contabilidad-peru`):**
- Fechas en hora de Lima: `Frontend/src/utils/fecha.js` (`aInputFecha`, `anioLima`, `mesLima`; medianoche UTC exacta =
  día de calendario) y quitar `toISOString().split("T")[0]`, `getFullYear()`/`getMonth()` y `setHours()` de detalles,
  listas y Dashboard. Backend: `routes/cotizaciones.js` guarda la fecha de pago del cierre con `aFechaLima` (no
  `new Date("YYYY-MM-DD")`); `utils/resumenTributario.js` y `routes/sire.js` usan `setUTCMonth` para el fin del mes.
- **Planilla y PLAME** (2026-10-06, en `contabilidadoficial`, backend `8f7b8d4`, frontend `54825c30`): módulo `/planilla`, asiento de origen
  `Planilla` en `asientosAutomaticos.js` y conceptos `pago_*` de Tesorería. Llega con el merge de esa rama.
- Motor contable: **asientos automáticos editables** (2026-10-05, en `contabilidadoficial` `66329ae`/`c548ed70` y `conta-percepcion`, ya con commit):
  `PUT /contabilidad/asientos/:id` para automáticos conservando sus líneas (`origenLinea`/`sinCambios`),
  `editadoManualmente` para que generar no los pise y `POST /contabilidad/automaticos/:id/restablecer`.
- Motor contable: asiento de **diferencia de cambio al cierre** (`generarDiferenciaCambio`, desde el mayor; en CONCAR
  flag `N` con dólares 0) y **constancia de detracción** en la columna S (número de operación del depósito).

**⚠ Mencionar al usuario al abrir el proyecto: las "Decisiones por confirmar" de abajo.**

**Rama `ventas/produccion/contabilidadoficial` (2026-10-03):** recibió por merge la rama contable
`claude/affectionate-ride-1ql646` (motor contable C1–C3, CONCAR, Bancos B7, caja chica, ayuda), que trae `main` hasta
`95d9ae0` (incluye el arreglo de SUNAT 3270 y los saldos de tesorería, que esta rama ya tenía por cherry-pick). En
`main` el trabajo contable se revierte (decisión del usuario 2026-10-03: el motor contable va solo en esta rama).

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
1. El saldo inicial lo editan jefatura y admin (como el resto de Configuración); el tesorero no.
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

## 6. Índice de documentos

- `docs/contabilidad/`: **`Preguntas al contador.md`** (todas las preguntas abiertas, consolidadas 2026-10-02), **referencias de otros ERP para C2–C5**, investigación de libros electrónicos, diseño del motor contable (aprobado, cuentas corregidas),
  spec de implementación C1, **guía contable** y **casos de prueba** (agente contador), `HANDOFF-contabilidad.md`.
- `docs/superpowers/specs/`: todos los specs (cotización, centro de costo, compras, Tesorería B1, bloqueo de edición,
  comprobantes de compra, ventas US$/tributario).
- `docs/superpowers/plans/` y `docs/superpowers/sdd/`: planes y ledgers (decisiones `Ruling:` y menores).
- `docs/HANDOFF-comprobantes-compra.md`: traspaso histórico de las Fases 1–2 (cerrado).

- **Factura emitida suelta pasa a «Por cobrar»** (2026-10-07, traído de `contabilidadoficial` `926d52c`/`066860bc`):
  `EmitirComprobante.jsx` crea la factura interna también sin OC (solo facturas; las boletas no, se cobran al contado)
  y `POST /facturas` toma el cliente del comprobante y lo registra en Empresas si falta (`clienteDelComprobante`).
  No regulariza los comprobantes sueltos ya emitidos. Test: `test/ligarCpeFactura.test.js`.
