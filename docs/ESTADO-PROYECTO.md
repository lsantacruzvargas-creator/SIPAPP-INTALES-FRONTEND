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
- **Reporte mensual de la planilla pagada (pendiente, pedido del usuario 2026-11-04)**: récord del mes por trabajador con lo pagado y la asistencia
  (horas extras, faltas, vacaciones, tardanzas, licencias, etc.). Hoy las tardanzas solo existen como descuento 0704 en soles, sin minutos.
- **Archivo de abono de sueldos al banco (pendiente)**: banco y formato configurables por cuenta cargo; método de abono por trabajador (mismo banco,
  interbancario con CCI, efectivo o cheque fuera del archivo). Formatos en investigación (`specs/2026-11-04-abono-sueldos-formatos-investigacion.md`);
  los que no se confirmen esperan el layout que entregue el banco del cliente (al final).
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
- **Decisión pendiente del usuario:** las fechas de solo día de los módulos antiguos (cotización, OT, OC, ingreso de
  equipo) se siguen **guardando** a medianoche UTC; se muestran bien, pero un reporte del servidor por rango en hora
  de Lima puede contar el día 1 en el mes anterior. Unificar exige un cast global en Mongoose y **migrar los datos
  existentes**: no se hizo sin su OK.
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
