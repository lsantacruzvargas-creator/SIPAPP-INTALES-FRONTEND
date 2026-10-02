# Estado del proyecto SIPAPP-INTALES — punto de entrada para agentes

**Actualizado:** 2026-10-01 · **Idéntico en** `docs/` de los repos Backend y Frontend (y en `docs/` de la carpeta raíz).

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

## 3. Qué hay en `main` (2026-10-01)

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
| Motor contable C1 (plan de cuentas PCGE + importación desde Excel, periodos, asientos manuales, pantalla Contabilidad) | **Implementado** en la rama `claude/affectionate-ride-1ql646` (sin merge a `main`) | `docs/contabilidad/HANDOFF-contabilidad.md` |
| Bancos B7: movimientos sin documento, transferencias propias, saldo inicial y libro por cuenta, conciliación bancaria mensual | **Implementado** en la rama `claude/affectionate-ride-1ql646` (sin merge a `main`) | `docs/superpowers/specs/2026-10-02-bancos-b7-design.md` |
| Caja chica: fondo fijo, gastos (boleta, ticket, factura sin crédito, RH, movilidad, vale), rendición y reposición, arqueo | **Implementado** en la rama `claude/affectionate-ride-1ql646` (sin merge a `main`) | `docs/superpowers/specs/2026-10-02-caja-chica-design.md` |
| Motor contable C2: asientos automáticos (compras, ventas, Tesorería) y exportación a **CONCAR** (PCGE 2019) | **Implementado** en la rama `claude/affectionate-ride-1ql646` (sin merge a `main`) | `docs/superpowers/specs/2026-10-02-c2-asientos-concar-design.md` |
| Motor contable C3: cierre de mes (verificar, cerrar y reabrir; bloqueo del mes en todo el sistema) y reportes de control (Diario, Mayor, Balance de comprobación) | **Implementado** en la rama `claude/affectionate-ride-1ql646` (sin merge a `main`) | `docs/superpowers/specs/2026-10-02-c3-cierre-reportes-design.md` |
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

**Por confirmar con el contador** (no implementar sin respuesta):
- Si el RCE del SIRE trae los montos de comprobantes en US$ en dólares o en soles (probar con un archivo real).
- TC compra/venta en cobros y pagos en dólares.
- Preguntas del documento `docs/contabilidad/2026-10-01-casos-prueba-contables.md` (sección final): costeo de OT y
  CIF, cuentas de NC de compra (60x vs 7311) y de venta (7411 vs 7032x), cuenta BN (1042 vs 107), 4ta al provisionar o
  al pagar, boletas en el Registro de Compras, coeficiente de renta, vigencia del D. Leg. 1669.
- C2 está hecha con defaults; queda **validar con el contador** (`docs/contabilidad/Preguntas al contador.md`):
  subdiario de caja-bancos (21 por defecto), flag `N` en caja-bancos US$ (primera importación real), divisionarias a
  6 dígitos, maestro de anexos en CONCAR (RUC), destinos 9x/79 (apagados), cuenta de detracción BN (1042/107).

**Brechas contables aún abiertas** (de `casos-prueba-contables.md` §4; B1–B5, B9 y B7 ya resueltas, B7 en la rama): B6
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

## 6. Índice de documentos

- `docs/contabilidad/`: **`Preguntas al contador.md`** (todas las preguntas abiertas, consolidadas 2026-10-02), **referencias de otros ERP para C2–C5**, investigación de libros electrónicos, diseño del motor contable (aprobado, cuentas corregidas),
  spec de implementación C1, **guía contable** y **casos de prueba** (agente contador), `HANDOFF-contabilidad.md`.
- `docs/superpowers/specs/`: todos los specs (cotización, centro de costo, compras, Tesorería B1, bloqueo de edición,
  comprobantes de compra, ventas US$/tributario).
- `docs/superpowers/plans/` y `docs/superpowers/sdd/`: planes y ledgers (decisiones `Ruling:` y menores).
- `docs/HANDOFF-comprobantes-compra.md`: traspaso histórico de las Fases 1–2 (cerrado).
