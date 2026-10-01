# Referencias de otros ERP para C2–C5 (revisión 2026-10-01)

Se revisaron tres repos (solo lectura) para completar el diseño de C2 en adelante:

| Repo | Qué es | Utilidad |
|---|---|---|
| `System_ERP_Net_Win` | ERP C#/SQL Server de República Dominicana (ITBIS/NCF), 2018 | **Alta** para mecánica: enlaces de cuentas, generadores de asientos idempotentes, cierre, EEFF configurables, banco y conciliación |
| `facturascripts` | ERP PHP open source (España, LGPL-3.0), activo | **Alta**: asientos automáticos “todo o nada”, resolución de cuentas por prioridad, cierre anual idempotente; trae un **plan PCGE peruano** (`Core/Data/Codpais/PER/defaultPlan.csv`, 1 790 cuentas) |
| `sistema-contable` | Prototipo académico Java/MySQL, 2022–2023 | **Baja**: no funciona contra su propio esquema; solo aporta la tabla `destino_compra` (6x → 9x / 79) |

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
