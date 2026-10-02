# Referencias de otros ERP para C2–C5 (revisión 2026-10-01)

Se revisaron tres repos (solo lectura) para completar el diseño de C2 en adelante:

| Repo | Qué es | Utilidad |
|---|---|---|
| `System_ERP_Net_Win` | ERP C#/SQL Server de República Dominicana (ITBIS/NCF), 2018 | **Alta** para mecánica: enlaces de cuentas, generadores de asientos idempotentes, cierre, EEFF configurables, banco y conciliación |
| `facturascripts` | ERP PHP open source (España, LGPL-3.0), activo | **Alta**: asientos automáticos “todo o nada”, resolución de cuentas por prioridad, cierre anual idempotente; trae un **plan PCGE peruano** (`Core/Data/Codpais/PER/defaultPlan.csv`, 1 790 cuentas) |
| `sistema-contable` | Prototipo académico Java/MySQL, 2022–2023 | **Baja**: no funciona contra su propio esquema; solo aporta la tabla `destino_compra` (6x → 9x / 79) |

| `sistemacontable` (revisado 2026-10-02) | App Django/SQLite peruana de curso (PCGE a 2 dígitos) | **Baja**: confirma el mapeo de EEFF por cuenta de 2 dígitos; no resuelve ninguna pregunta al contador |

| `contaperu` (revisado 2026-10-02) | Motor peruano MIT (Python) que arma asientos de compras/ventas desde CPE y exporta a CONCAR, StarSoft, CONTASIS, SIRE y PLE | **Muy alta** para C4 y C2 (compras/ventas): formato CONCAR validado en producción, reglas con su fuente, **PCGE 2026 oficial** (1 615 cuentas con página) |
| `conta_pro_odoo` (revisado 2026-10-02) | Módulos Odoo 18 (l10n_pe_accounting_pro OPL-1 de pago; pe_edi_sunat LGPL-3) | **Baja**: varias reglas erradas; solo confirma que la detracción va por catálogo del bien/servicio. No se puede copiar su código ni sus datos (OPL-1) |
| `contabilidad_guesaa` (revisado 2026-10-02) | Sistema comercial Laravel con asientos simples sobre PCGE 2026 | **Baja**: confirma que el PCGE 2026 ya se usa |

Ningún repo trae normativa peruana completa (IGV, detracción, retención, SIRE, destinos automáticos, diferencia de
cambio): eso sigue saliendo de la guía contable y los casos de prueba de `docs/contabilidad/`.

## Conclusión de fondo: re-dimensionar C3–C5

Como **INTALES exporta al software del contador** (no es la contabilidad oficial), el contador ya hace en su software
el Mayor oficial, el cierre anual y los EEFF. Recomendación:

- **C2** (asientos automáticos + bandeja de revisión): sigue igual, es el núcleo.
- **C3** se reduce a: Diario y Mayor **de control**, asientos descuadrados, y **bloqueo del periodo una vez exportado**
  (el cierre de mes = “exportado y bloqueado”). La diferencia de cambio de cierre, solo si el contador la quiere desde
  INTALES (pregunta A7).
- **C4** = exportación en la plantilla de su software (prioridad alta, depende de la pregunta A2).
- **C5** (cierre anual, apertura, EEFF): **en suspenso**; lo hace el software del contador.
- **B7** (movimientos de banco sin documento y conciliación) pasa a ser lo siguiente más valioso: alimenta el
  subdiario de caja-bancos.

## Diseño que se adopta para C2 (no depende del contador)

1. **Configuración de cuentas por rol con resolución jerárquica** (ERP C# `TCONTA_ENLACES_CUENTAS` + FacturaScripts
   `CuentaEspecial`):
   - Roles con código fijo: `CLIENTES`, `PROVEEDORES`, `HONORARIOS`, `IGV`, `RET_4TA`, `RET_IGV`, `VENTAS_SERVICIOS`,
     `VENTAS_PRODUCTOS`, `VENTAS_MERCADERIAS`, `COMPRAS_DEFECTO`, `DIF_CAMBIO_PERDIDA`, `DIF_CAMBIO_GANANCIA`,
     `DETRACCION_VENTAS_BN`, `GASTOS_BANCARIOS`, `ANTICIPO_CLIENTES`, `ANTICIPO_PROVEEDORES`, `REDONDEO`.
   - Prioridad: cuenta del **documento/línea** (editable) → cuenta del **tipo de artículo / servicio** → cuenta de la
     **cuenta de Tesorería** (bancos) → **rol por defecto**. Si falta, el asiento queda **pendiente** con el mensaje
     “Falta la cuenta para el rol X” (no se inventa).
   - Semilla del mapeo: roles de `PER/defaultPlan.csv` de FacturaScripts (CLIENT 1212, PROVEE 4212, IVAREP 40111,
     IRPFPR 40172, GTOBAN 6391, EURNEG 676, EURPOS 776, ANTCLI 122, ANTPRO 422), corregidos con la guía (ventas
     70321/70221/70121, honorarios 424).
2. **Generadores por tipo de documento, idempotentes** (ERP C#): `FacturaProveedor`, `Comprobante` de venta,
   `MovimientoTesoreria` (pago, cobro, detracción, retención). El documento guarda `asiento` (y `asientoAnulacion`);
   se generan al guardar (en la misma transacción) y también por lote “contabilizar pendientes del periodo”.
3. **Construcción todo o nada** (FacturaScripts): líneas en orden fijo (tercero → IGV → retenciones → base por
   línea), céntimos de redondeo a la línea mayor (ya hecho en C1), cuadre obligatorio; si no se puede, el documento
   queda “pendiente de contabilizar” con el motivo, y el documento **sí** se guarda.
4. **Cambios y anulaciones**: periodo abierto y asiento en borrador → se regenera; asiento editado a mano → aviso y
   botón “regenerar”; periodo cerrado/exportado → **asiento de reversión** en el periodo actual (nunca editar).
5. **Destinos**: tabla 6x → 9x/79 ya existe en `CuentaContable.destino` (C1); el generador agrega las dos líneas
   9x/79 — salvo que el software del contador las genere solo (pregunta A6).
6. **Trazabilidad por línea** (para C4): tercero (tabla 2), documento (tabla 10, serie, número, fecha), base e IGV,
   `origen {tipo, id}` en el asiento y CUO.
7. **Pagos con cheque/transferencia**: se contabilizan una sola vez, desde Tesorería (lección del ERP C#).

## Diseño para B7 (banco), tomado del ERP C#

- **Movimiento bancario sin documento** con contrapartida libre multilínea (cuenta, centro de costo, importe) y
  **tipos de movimiento** configurables (comisión, ITF, intereses, pago de tributos, transferencia propia, préstamo)
  con lado D/C y cuenta por defecto.
- **Conciliación por cuenta y mes**: saldo según extracto, marcar movimientos “cobrados/pagados en banco”, tránsito
  calculado, grabar solo con diferencia 0; los ajustes generan su asiento; lo conciliado no se edita ni anula.
- Caja chica: ningún repo la resuelve; diseño propio (fondo, vales con comprobante, reposición con asiento, arqueo).

## Para C3 (control) y, si algún día aplica, C5

- Diario/Mayor con filtros de `Ledger.php` (FacturaScripts); saldos por agregación en Mongo, sin saldos mutables en
  el plan (defecto del ERP C#).
- Cierre de mes del ERP C#: no cerrar con borradores, uno a la vez, foto de saldos por cuenta × centro de costo;
  bloqueo genérico “ninguna escritura con fecha ≤ último cierre”.
- Cierre anual (solo si C5 se reactiva): pasos idempotentes R/C/A de FacturaScripts pero con **clases
  configurables** (PCGE: resultados a 89 → 59; FacturaScripts tiene fijos los rangos españoles 1–5 / 6–7).
- EEFF configurables del ERP C#: líneas tipo título / total por prefijos de cuenta (`1041+1042-19`) / suma de líneas
  (`L5+L9`), signo, formato y comparativo.
- Activos fijos y planilla: cuentas en el tipo de activo y depreciación mensual con valor residual; planilla
  resumida por centro de costo — como **plantillas de asiento** (ERP C# `TCONTA_ASIENTOS_PREDEFINIDOS`, ampliadas a
  N líneas), ya que se registran como asientos manuales.

## `sistemacontable` (Django, PCGE a 2 dígitos)

Cada línea se guarda suelta (cuenta, Debe/Haber, monto): no hay asiento con varias líneas ni control de cuadre, ni
subcuentas, IGV, terceros, documentos o periodos. Lo único aprovechable, para cuando se reactive C5:
- **Estado de resultados por función**: ventas 70, costo de ventas 69, gastos administrativos 94, gastos de ventas 95,
  otros ingresos 75, ingresos financieros 77, otros gastos 65, gastos financieros 67, impuesto a la renta 88 →
  utilidad bruta, operativa, antes de impuestos y neta (usa los destinos 9x, coherente con nuestro diseño).
- **Situación financiera**: pasivo corriente 40–44 y 46–48, no corriente 45 y 49; activo corriente/no corriente
  elegido por el usuario en cada línea. Simplificación: en la práctica 45 se divide en porción corriente y no
  corriente, y la clasificación debe ir en la cuenta (configurable), no en cada movimiento.
- Sus reportes suman importes sin mirar el lado Debe/Haber en resultados (error), así que no se reutiliza código.

## Plan de cuentas: contraste con FacturaScripts (PER)

El plan de FacturaScripts usa la terminología del PCGE 2019 y difiere en 17 nombres de nuestro semilla (p. ej.
“Inventarios por recibir” vs “Existencias por recibir”, “Variación de inventarios”, “Gobierno nacional” vs “Gobierno
central”, 681 “Depreciación de propiedades de inversión”, 395 “Depreciación acumulada de PPE”). No es fuente oficial
(tiene errores: 70111 duplicado bajo 7012, cuenta 60 sin nombre), así que **no se cambió el semilla**: el plan
definitivo será el del contador (importación desde Excel). Si el contador no tiene plan propio, el CSV de
FacturaScripts (LGPL-3.0) es la mejor base disponible para cargarlo completo, revisado por él.

## Qué siguen sin resolver los repos (solo el contador)

Todas las preguntas A1–A9 (software, plantilla, anexos, subdiarios, destinos, diferencia de cambio, correcciones),
B10–B18 (cuenta por tipo de compra, costeo de OT, cuentas de ventas, NC, bancos, 1673, 4.ª, anticipos, movimientos de
banco) y C19–C25 (criterios tributarios) de `2026-10-01-preguntas-contador-C2.md`, más las nuevas D26–D29.


## contaperu (MIT) — lo que aporta a C2 y C4

Ruta revisada: `lsantacruzvargas-creator/contaperu` (versión 5.2.0, 2026-10-02). Solo compras y ventas desde comprobantes;
**no** hace cobros/pagos, caja-bancos, destinos 9x/79, diferencia de cambio, retención IGV 3 %, anticipos ni
detracción de ventas.

**Formato CONCAR (validado en producción, `drivers/concar/datos.py`, 52 casos en `tests/fixtures/snapshot`)**:
Excel `.xlsx`, hoja `CONCAR`, 3 filas de cabecera (títulos, notas, formatos), datos desde la fila 4; **un archivo por
libro y mes** (`CONCAR_COMPRAS_AAAAMM_RUC.xlsx`) con los subdiarios mezclados; 41 columnas A…AO: subdiario,
comprobante `MMNNNN`, fecha, moneda `MN`/`US` (no `ME`), glosa (40), TC (solo US$), tipo de conversión `C`/`V`, flag
`S`, fecha TC, cuenta, anexo (RUC en la línea del tercero), centro de costo (cuentas 62/63/65/70), D/H, importe
original / US$ / S/, tipo de documento (sigla T.G.06: FT, BV, NC, ND, RH…), número `F001-123`, fechas de documento y
vencimiento, área (detracción), glosa detalle (30), anexo auxiliar (centro de costo en la línea del tercero), doc. de
referencia (NC/ND), datos de detracción (tipo de tasa, tasa, bases), tasa IGV. En US$ el asiento va en dólares y
CONCAR convierte. Un asiento por comprobante.

**Formato StarSoft Desktop** (`drivers/starsoft/`, “en pruebas”): TXT `|` sin cabecera, CRLF; compras 35 campos,
ventas 27; subdiarios 04 compras / 03 ventas; la detracción va en campos de la fila del proveedor; exige que
proveedores y cuentas ya existan; el manual pide ANSI.

**Reglas de asiento (con fuente en `contaperu/asiento/__init__.py`)**: factura D gasto · D 40111 · H 4212 (US$ en
otra divisionaria); boleta y RH sin línea de IGV (IGV al gasto); RH D gasto por el total · H 40172 retención · H 424
neto (**retención registrada al provisionar**); NC invierte las mismas cuentas; detracción de compras: D 4212 · H
421203 por lo detraído (dentro de la 42, sin 1673) en soles enteros; extemporáneos al día 1 del periodo; ventas D
1212 · H 40111 · H ingreso. Subdiarios por defecto CONCAR: 05 ventas, 11 compras, 10 compras con detracción, 13
boletas, 15 honorarios. Anexo = RUC/DNI. Cuenta de gasto/ingreso: **por comprobante (imputación), sin default**.
Huella por comprobante para no duplicar al reimportar.

**Reutilizable (MIT, conservando el aviso de copyright)**: catálogo PCGE 2026 (`contaperu/pcge/catalogo2026.json`),
catálogos SUNAT (`contaperu/datos/sunat/*.json`: tipos de comprobante, documentos de identidad, monedas, medios de
pago, motivos NC/ND, tributos, detracciones, campos PLE 5.1/5.3 y SIRE) y el estándar
`estandar/open-accounting.schema.json` como forma de la línea de asiento.

**Recomendación**: portar a Node las reglas y la proyección CONCAR/StarSoft (no depender del motor Python), modelar
nuestras líneas con la forma de `open-accounting` (más roles de tesorería) y usar sus snapshots como prueba de oro.
Lo propio de INTALES (tesorería, diferencia de cambio, destinos por OT, retención 3 %, detracción de ventas, IGV sin
crédito) se diseña aquí.

## PCGE 2026 (hallazgo)

El catálogo oficial del **PCGE 2026** (Consejo Normativo de Contabilidad) cambia respecto del 2019 que usa nuestro
semilla: elemento 9 = **91 Gastos de operación, 92 Gastos de inversión, 93 Gastos de financiamiento** (no existen
94/95/97 que usa nuestro destino por defecto 941/791); desaparecen 73, 74 y 87; aparece 86; 36 nombres cambian
(“inventarios”, “impuesto a las ganancias”, “servicios prestados”, 1212 “En cartera”, 122/422 “Anticipos
recibidos/otorgados”, 19 “Deterioro por pérdida crediticia”). Antes de cambiar el semilla hay que saber **qué versión
usa el contador** (pregunta A0). El catálogo de contaperu permite cargar el PCGE completo (1 615 cuentas) con la página
de la norma de cada una.
