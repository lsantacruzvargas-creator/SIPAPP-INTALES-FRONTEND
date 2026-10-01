# Motor contable con libros electrónicos (PLE) — Diseño

**Fecha:** 2026-10-01 · **Proyecto:** SIPAPP-INTALES · **Estado:** aprobado por el usuario (2026-10-01)
**Base:** `docs/contabilidad/2026-10-01-investigacion-libros-electronicos.md` (marco SUNAT, benchmark de ERP y
decisiones del usuario).

> **Cambio de alcance (2026-10-01, decisión del usuario):** INTALES **no** será la contabilidad oficial. Genera los
> asientos y los **exporta al software del contador** (CONCAR/StarSoft) para que él los importe. Consecuencias: la
> fase C4 pasa a ser "exportación de asientos en la plantilla del software del contador" (el `.txt` del PLE queda
> opcional); el plan de cuentas se **importa del contador** para que los códigos coincidan; C5 (Inventarios y
> Balances, EEFF oficiales) queda en suspenso. C1–C3 siguen igual. Preguntas pendientes para C2:
> `2026-10-01-preguntas-contador-C2.md`.

## Objetivo

Que INTALES lleve su **contabilidad completa dentro del sistema**, como CONCAR o STARSOFT: plan de cuentas, asientos
generados automáticamente desde lo que ya se registra (compras, ventas, pagos y cobros), asientos manuales, cierre de
mes, Libro Diario, Libro Mayor, Inventarios y Balances, y la **exportación de los `.txt` para presentarlos en el PLE**.
Registro de Compras y de Ventas siguen por el SIRE (ya implementado).

## Decisiones confirmadas con el usuario (2026-10-01)

| Tema | Decisión |
|---|---|
| Alcance | **Contabilidad completa**, como CONCAR |
| Nivel de ingresos (para priorizar libros) | **Entre 300 y 1700 UIT** |
| Plan de cuentas | **PCGE estándar** precargado, ajustable (agregar subcuentas, activar/desactivar) |
| Asientos | **Los genera el sistema** desde compras, ventas, pagos y cobros; de ahí salen los `.txt` |
| Destinos (clase 9) | **Automáticos pero editables**: el sistema propone 9x↔79 según la OT o el centro de costo y el usuario puede cambiarlos |
| Planillas y activos fijos | **Fuera de alcance**; sus asientos (planilla, depreciación) se registran como **asientos manuales** |
| Roles | Se crean **`tesorero`** y **`contador`** |
| Cierre de mes | Lo hace el **tesorero** |
| Reapertura de un mes cerrado | **Solo el tesorero**, con motivo obligatorio que queda registrado |
| Ingresos > 1500 UIT | **No** se superan: el Registro de Inventario Permanente (12.1) no aplica |

## Libros que corresponden (300–1700 UIT, régimen general / MYPE Tributario)

| Ingresos | Libros | Dónde |
|---|---|---|
| > 300 hasta 500 UIT | Registro de Compras, Registro de Ventas, **Libro Diario (5.1)**, **Libro Mayor (6.1)** | RC/RV en SIRE; Diario y Mayor en PLE |
| > 500 hasta 1700 UIT | Los anteriores + **Libro de Inventarios y Balances (3.x)** | PLE |

Con el plan de cuentas (5.3) se informa en enero, la primera vez y cuando cambia. Los ingresos no superan 1500 UIT,
así que no aplica el Registro de Inventario Permanente en Unidades Físicas (12.1).

## Roles

| Rol | Puede |
|---|---|
| `tesorero` (nuevo) | Todo Tesorería (se agrega a `ROLES_TESORERIA`), revisar y contabilizar asientos automáticos, **cerrar y reabrir el mes** |
| `contador` (nuevo) | Plan de cuentas, configuración contable, asientos manuales, revisar/editar asientos de periodos abiertos, reportes y exportación PLE; Tesorería en lectura |
| `admin` | Todo lo contable salvo cerrar y reabrir el mes (exclusivo del tesorero) |
| `jefatura` | Reportes contables en lectura |

Cerrar y **reabrir** un mes es exclusivo del `tesorero`; la reapertura exige motivo y queda registrada.

## Modelo de datos (nuevo)

- **`CuentaContable`**: `codigo` (único, 2 a 10 dígitos), `nombre`, `nivel` (por longitud), `padre`, `naturaleza`
  (deudora/acreedora), `deMovimiento` (solo las de último nivel reciben asientos), `exigeCentroCosto`, `exigeTercero`,
  `destino` (para clase 6: cuenta 9x por defecto y cuenta 79), `activa`, `fechaModificacion` (para el 5.3).
  Seed: PCGE 2019 estándar a 4–5 dígitos con las cuentas que usa INTALES.
- **`PeriodoContable`**: `periodo` (AAAAMM), `estado` (`abierto` | `cerrado`), `cerradoPor/En`, `reaperturas[]`
  (quién, cuándo, motivo). Un asiento solo se crea, edita o anula en un periodo abierto.
- **`Asiento`**: `periodo`, `subdiario` (`compras`, `ventas`, `caja-bancos`, `diario`, `apertura`, `cierre`,
  `ajuste`), `numero` (correlativo por periodo y subdiario), `cuo` (único, ≤ 40 car.), `fecha`, `glosa`, `moneda`,
  `tipoCambio`, `estado` (`borrador` | `contabilizado` | `anulado`), `origen` (`{ tipo: FacturaProveedor | Comprobante
  | MovimientoTesoreria | manual | cierre, id }`), `editadoManualmente`, `lineas[]`:
  `{ cuenta, debe, haber (en S/), debeME, haberME (si USD), centroCosto?, ordenTrabajo?, tercero? (tipo/número doc),
  documento? (tipo, serie, número, fecha) }`. Regla: **Σ debe = Σ haber** en soles (y en ME cuando aplique).
- **`ConfiguracionContable`** (una por empresa, editable por el contador): cuentas por defecto para cada operación:
  proveedores (4212; honorarios en 424, que en el PCGE 2019 no tiene divisionarias), clientes (1212), IGV (40111),
  retención 4.ª (40172), compras por tipo de artículo/servicio (60x, 63x, 65x; materias primas en 602, sin
  divisionarias), ventas (70321 servicios – local – terceros, 70221 productos terminados – local, 70121 mercaderías –
  local; **7041 es Subproductos y 7011 es venta de exportación: no usar para ventas locales**), cuentas de banco/caja
  por `CuentaTesoreria` (1041xx operativas, 101x caja; la de detracciones en el Banco de la Nación en 1042 o 107
  **[Confirmar con el contador]**), diferencia de cambio (676/776), destinos (OT → 92/90x, centro de costo
  administrativo → 94, ventas → 95, 79 como contrapartida; 921/941/951/971 son divisionarias de libre definición,
  solo ejemplos configurables). La detracción de compras **no** tiene cuenta propia (4011x): es parte del saldo de
  4212 y se cancela con fondos de la cuenta operativa. *(Correcciones de la brecha B5, 2026-10-01.)*

## Asientos automáticos (regla de negocio central)

Se generan al registrar, modificar o anular el documento de origen; quedan en **`borrador`** en una bandeja de revisión
y se **contabilizan** (uno a uno o en lote) por el tesorero o el contador. Un asiento editado a mano no se regenera
solo: si el origen cambia, se avisa y se ofrece regenerarlo.

| Origen | Asiento (resumen, cuentas configurables) |
|---|---|
| Factura de proveedor (01) | Debe 6x (o 20/25 según tipo de artículo) base · Debe 40111 IGV · Haber 4212 total. **Destino**: Debe 9x (según OT o centro de costo) / Haber 79, editable |
| Recibo por honorarios (02) | Debe 6321/6329 · Haber 424 neto · Haber 40172 retención 4.ª (si aplica; **[Confirmar con el contador]** si se registra al provisionar o al pagar) |
| Boleta / ticket sin crédito fiscal | Debe 6x total (IGV al costo) · Haber 4212 |
| Nota de crédito / débito de compra | Inverso / igual a la factura de origen |
| Comprobante de venta (CPE) | Debe 1212 total · Haber 40111 IGV · Haber 70321 (servicios) / 70221 (productos fabricados) base |
| Pago a proveedor | Debe 4212 · Haber 1041xx (cuenta de tesorería). Detracción: Debe 4212 · Haber 1041xx (se deposita con fondos de la cuenta **operativa** en la cuenta BN del proveedor) |
| Cobro a cliente | Debe 1041xx · Haber 1212; detracción del cliente: Debe 1042 (BN de INTALES) · Haber 1212 |
| Diferencia de cambio al pagar/cobrar (USD) | Debe 676 / Haber 776 por la diferencia entre el TC del documento y el del pago |
| Anulación del documento | Asiento anulado (si su periodo está abierto) o asiento de reversión en el periodo actual |

Moneda: todo asiento se lleva en soles; los documentos en USD guardan también el importe en ME y el TC (el TC SUNAT de
la fecha, ya disponible por `TipoCambioDia`).

## Cierre de mes (tesorero)

1. Validaciones: no quedan asientos en borrador del periodo; todos cuadran; los documentos del mes tienen asiento.
2. **Diferencia de cambio de cierre**: ajusta saldos en USD de 12, 42 y 104x al TC de cierre (asiento automático en
   borrador que el tesorero revisa y contabiliza).
3. **Destinos** pendientes contabilizados.
4. Cerrar: el periodo pasa a `cerrado`; nada de ese mes se puede crear, editar ni anular (tampoco en Tesorería ni en
   compras/ventas con fecha en ese mes).
5. Cierre anual (diciembre): asiento de cierre de cuentas de resultados y asiento de apertura del ejercicio siguiente
   (subdiarios `cierre` y `apertura`).

## Reportes

Libro Diario, Libro Mayor (por cuenta, con saldo inicial), balance de comprobación (8 columnas), análisis de cuenta por
tercero (12, 42), estado de situación financiera y estado de resultados (por naturaleza y por función). Todos con
filtros, exportación a Excel y en S/.

## Exportación PLE

- Por periodo y libro, genera el `.txt` con la estructura del **Anexo 2 de la R.S. 286-2009/SUNAT** y modificatorias,
  separado por `|`, con el nombre de archivo que fija el anexo (`LE` + RUC + periodo + código de libro + indicadores),
  listo para validar en el PLE:
  - **5.1 Libro Diario** y **5.3 Detalle del plan contable utilizado** (este último en enero y cuando cambie).
  - **6.1 Libro Mayor**.
  - **3.x Inventarios y Balances** (anual, Fase C5).
  - Opcional: **1.1/1.2 Caja y Bancos** (no obligatorio en este rango; útil para el contador).
- Campo "estado de la operación": `1` del periodo, `8`/`9` para operaciones de periodos anteriores.
- **Requisito previo:** el **Anexo 2 consolidado** con los campos exactos de 5.1, 5.3, 6.1, 1.x y 3.x (no se pudo
  descargar del portal; ver investigación). Sin él no se implementa la exportación.

## Fases (cada una con su plan, aprobación, TDD y revisión, como las anteriores)

| Fase | Contenido |
|---|---|
| **C1 — Base** | Roles `tesorero` y `contador`; `CuentaContable` con seed PCGE y mantenimiento; `PeriodoContable`; `Asiento` con asientos **manuales** (crear, editar, anular, cuadre, correlativo, CUO); pantalla Contabilidad |
| **C2 — Asientos automáticos** | `ConfiguracionContable`; generación desde compras, ventas, pagos, cobros, detracciones, retenciones y diferencia de cambio al pagar; destinos automáticos editables; bandeja de revisión y contabilización |
| **C3 — Reportes y cierre** | Diario, Mayor, balance de comprobación, análisis de cuentas; cierre de mes del tesorero con diferencia de cambio de cierre; bloqueo de periodos cerrados en todo el sistema; reapertura por el tesorero con motivo |
| **C4 — Exportación PLE** | `.txt` de 5.1, 5.3 y 6.1 (y 1.1/1.2 opcional) con validaciones del Anexo 2/3 |
| **C5 — Inventarios y Balances y EEFF** | Estructuras 3.x anuales, estado de situación y de resultados; cierre y apertura del ejercicio |

## Fuera de alcance

- Planillas (PLAME) y su cálculo; activos fijos y depreciación (solo como asientos manuales).
- Registro de Inventario Permanente (12.x/13.x): no aplica (ingresos ≤ 1500 UIT).
- Presupuestos, consolidación de varias empresas, NIIF avanzadas (impuesto diferido, deterioro).
- Enviar los libros al PLE: el sistema genera los `.txt`; el contador los valida y presenta en el PLE.

## Pruebas

- Backend: cuadre de asientos; correlativo y CUO únicos; no escribir en periodo cerrado (también desde Tesorería y
  compras); cada tipo de asiento automático con montos y cuentas esperados (PEN y USD, detracción, retención 4.ª,
  NC); destino propuesto por OT y por centro de costo, y editado a mano; regeneración al modificar/anular el origen;
  diferencia de cambio al pago y al cierre; cierre y reapertura con motivo; permisos por rol.
- Exportación: archivo con el nombre, columnas y formatos del Anexo 2 contra ejemplos validados en el PLE.
- Frontend: lógica pura con tests (cuadre, totales, filas de reportes); Playwright del flujo compra → asiento →
  revisión → cierre → Diario/Mayor → `.txt`.
