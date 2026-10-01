# Comprobantes de compra en Tesorería (art. 2 Reglamento de Comprobantes de Pago) — Diseño

**Fecha:** 2026-09-30 · **Proyecto:** SIPAPP-INTALES · **Estado:** diseño aprobado por secciones, pendiente de revisión escrita

## Objetivo

Que Tesorería registre como compra todos los comprobantes que INTALES recibe en la práctica, para
**pagarlos y controlar sus saldos** y además **clasificarlos para impuestos**: crédito fiscal de IGV,
retención de renta de 4ta categoría, cruce con el Registro de Compras del SIRE y un resumen
tributario mensual exportable a Excel.

## Decisiones confirmadas con el usuario (2026-09-30)

| Tema | Decisión |
|---|---|
| Propósito | Pagos + tributario (crédito fiscal, retención 4ta, SIRE, resumen mensual) |
| Tipos nuevos | Ticket / ticket POS (12), recibo de servicios públicos (14), nota de crédito (07), nota de débito (08). Se mantienen factura (01), recibo por honorarios (02) y boleta (03) |
| Liquidación de compra (04) | **Fuera de alcance** (el usuario la descartó) |
| Retención 4ta en recibos por honorarios | **Manual**: casilla "Retener 4ta (8 %)", sin regla automática por monto |
| Notas de crédito / débito | **Aplicadas al comprobante de origen**; el sobrante de una NC queda como saldo a favor del proveedor |
| Salida tributaria | Clasificación + cruce con SIRE + **resumen mensual** exportable a Excel |
| "Ya se pagó" | Sí: casilla para registrar el pago en el mismo paso (comprobantes al contado) |
| Tipo de cambio de comprobantes en USD | **Automático**: TC venta SUNAT de la fecha de emisión vía apiperu.dev, guardado en un histórico por fecha; solo lectura salvo que la consulta falle |
| Enfoque | **A** — ampliar `FacturaProveedor` (mismo modelo, pantalla, pagos, bloqueo y SIRE) |
| Costos de fabricación | Dos tablas: **comprometido** (material/servicio con OC vigente sin pagar) y **consumido** (lo pagado por Tesorería); HH y HM van a consumido. Dentro de este mismo spec |

## Fuera de alcance

- Liquidación de compra (emisión o registro).
- Diferencia de cambio contable entre emisión y pago (Tesorería refleja los montos pagados; la ganancia/pérdida la lleva contabilidad).
- Recalcular la detracción de una factura cuando una NC la reduce: se avisa en pantalla y se ajusta a mano.
- Proveedores sin RUC: todos los emisores de estos tipos tienen RUC.
- Libro de recibos por honorarios / PLAME: el resumen da los montos; la declaración la hace el contador.

## Modelo de datos — cambios en `FacturaProveedor`

| Campo | Tipo | Notas |
|---|---|---|
| `tipoComprobante` | enum | `01, 02, 03, 07, 08, 12, 14` (Tabla 10 SUNAT). Etiquetas en el frontend: Factura, Recibo por honorarios, Boleta, Nota de crédito, Nota de débito, Ticket / ticket POS, Recibo de servicios públicos |
| `ticketConRuc` | Boolean | Solo tipo 12: el ticket identifica a INTALES (RUC y razón social) y muestra el IGV desglosado (base + IGV = total). Sin esas dos condiciones un ticket es "de consumidor final" y no da crédito fiscal |
| `creditoFiscal` | Boolean | **Derivado en el servidor** (ver reglas); nunca viene del cliente |
| `documentoOrigen` | ObjectId → FacturaProveedor | Solo 07/08: comprobante que modifican |
| `aplicaciones` | `[{ documento: ObjectId, movimiento: ObjectId, monto: Number }]` | Solo 07: dónde se aplicó la NC (en la moneda del documento) |
| `saldoAFavor` | Number | Solo 07: total − aplicado (moneda del documento) |
| `impuesto.tipo` | enum | se agrega `"retencion4ta"` (en `impuestoSchema`) |

`MovimientoTesoreria`:
- `tipo` agrega `"aplicacion"` y `medio` agrega `"nota_credito"`: aplicar una NC es un movimiento **sin dinero y sin cuenta**,
  `concepto: "neto"`, sobre el documento al que rebaja el saldo, con `notaCredito: ObjectId` para saber de qué NC salió.

`TipoCambioDia` (nuevo): `{ fecha: "YYYY-MM-DD" (único), compra, venta, fuente: "apiperu" | "manual", fechaSunat }`.
Histórico por fecha para no consultar dos veces el mismo día y para auditoría.

Sin migración (el sistema aún no está en producción): los comprobantes registrados antes no tienen `creditoFiscal`;
el resumen y el cruce lo derivan al leerlos con la misma regla (función pura compartida `creditoFiscalDe(fp)`).

## Reglas

1. **Crédito fiscal** (servidor, al crear):
   - 01 factura y 14 recibo de servicios: `true` si IGV > 0.
   - 12 ticket: `true` solo si `ticketConRuc` y IGV > 0.
   - 02 recibo por honorarios y 03 boleta: `false`.
   - 07 y 08: igual que su `documentoOrigen`.
2. **IGV**: 02 siempre 0 (como hoy). 03 puede registrar IGV (informativo) pero no da crédito. El resto, IGV 18 % automático con la casilla actual.
3. **Retención 4ta** (solo 02, manual):
   - Casilla "Retener 4ta (8 %)" → `impuesto = { tipo: "retencion4ta", tasa: 0.08, monto: 8 % del total en S/, quienDeposita: "nosotros" }`.
   - Neto al emisor = total − retención (en la moneda del documento); `saldoImpuesto` = retención, que se paga a SUNAT con el flujo actual de pagos de impuesto.
   - No se combina con detracción ni retención de IGV; en otros tipos → 400.
4. **Nota de débito (08)**: requiere `documentoOrigen` del mismo proveedor y moneda, no anulado y que no sea NC/ND. Es un documento por pagar propio (saldo, condición, vencimiento, "Ya se pagó").
5. **Nota de crédito (07)**:
   - Mismas validaciones de origen que la ND. No tiene saldo por pagar: `netoAPagar = 0`.
   - Al registrarla, en la misma transacción, se aplica al origen: `monto = min(total NC, saldoNeto del origen)` → movimiento `aplicacion` sobre el origen y entrada en `aplicaciones`. `saldoAFavor = total − aplicado`.
   - **Aplicar saldo a favor** (`POST /facturas-proveedor/:id/aplicar { documento, monto }`): a otro comprobante **del mismo proveedor y moneda**, no anulado, con saldo; `monto ≤ min(saldoAFavor, saldoNeto destino)`.
   - Anular una NC anula sus movimientos de aplicación y recalcula los destinos.
   - No se puede anular un comprobante con NC aplicadas (vigentes): 400 "Anula primero la nota de crédito X".
   - Si el origen tiene detracción, el formulario avisa: "La detracción no se recalcula; ajústala a mano si corresponde".
6. **"Ya se pagó"** (comprobantes con condición contado, excepto NC):
   - Pide cuenta, medio y nº de operación; en la misma transacción registra el movimiento por el **neto** (como el pago normal).
   - Si hay impuesto (detracción/retención 4ta) su parte queda pendiente como hoy.
   - Si la moneda de la cuenta difiere de la del comprobante, el aviso existente (`avisoMoneda`).
7. **Tipo de cambio (USD)**:
   - **Primero la base de datos, después apiperu (para no pagar consultas repetidas):** `GET /sunat/tipo-cambio?fecha=YYYY-MM-DD` busca en `TipoCambioDia`; solo si no está, consulta apiperu.dev con esa fecha, **guarda la respuesta** y la devuelve `{ venta, compra, fecha, fechaSunat, fuente }`.
   - Todas las consultas a apiperu quedan guardadas, incluida la del "hoy" que usa el módulo Tipo de Cambio (que también pasa a mirar primero la BD).
   - Si SUNAT no publicó ese día (fin de semana, feriado), apiperu devuelve el último día hábil (`fecha_sunat`) y se guarda así. Excepción: si la fecha pedida es **hoy** (Lima) y todavía no hay publicación de hoy, se devuelve pero no se guarda como definitivo (SUNAT publica durante el día); la siguiente consulta vuelve a preguntar.
   - Una consulta fallida no se guarda. **Si apiperu falla, se usa el último TC guardado hasta esa fecha; si no hay ninguno, el TC vigente del módulo Tipo de Cambio; solo si tampoco hay, error** (confirmado con el usuario). La pantalla indica la fecha real del TC usado.
   - El formulario lo pide al cambiar fecha o moneda; queda **solo lectura**. Si la consulta falla, el campo se habilita con el aviso "No se pudo obtener el TC SUNAT de esa fecha: escríbelo".
   - El servidor guarda el TC recibido (el TC no es un precio derivado de la BD; la consulta es la fuente). Rango válido 2–6.
   - La consulta de "hoy" existente pasa a usar la fecha de Lima (hoy usa UTC).
8. **SIRE (RCE)**:
   - Se concilian todos los tipos salvo 02 (va al libro de honorarios).
   - NC: se compara por valor absoluto (el SIRE las trae en negativo).
   - Se compara también el tipo de cambio (USD): un TC distinto marca `difiere`, y el detalle muestra **TC del sistema, TC del SIRE y TC SUNAT de esa fecha de emisión** (de `TipoCambioDia`, consultándolo si falta) para saber cuál está mal.
9. **Bloqueo de edición**: aplicar una NC o un saldo a favor modifica comprobantes; como los pagos, corre en transacción y no toma bloqueo (fuera de alcance del bloqueo).

## Pantallas

- **Registrar comprobante** (hoy "Registrar factura de proveedor", `tesoreria/ModalFacturaProveedor.jsx`):
  - Selector con los 7 tipos.
  - 07/08: buscador del comprobante de origen (del proveedor elegido y su moneda, no anulados, sin NC/ND); para NC muestra "Se aplicará S/ X; quedará S/ Y a favor".
  - 12: casilla "Trae RUC de INTALES e IGV desglosado".
  - 02: casilla "Retener 4ta (8 %)" con monto y neto al emisor.
  - Moneda USD: TC automático de la fecha de emisión (solo lectura).
  - "Ya se pagó" (contado): cuenta, medio, nº de operación.
- **Por pagar** (`TablaPorPagar`): ND como un documento más; NC con saldo a favor en el proveedor ("Saldo a favor S/ X") con la acción "Aplicar a…"; el detalle del comprobante lista sus NC aplicadas.
- **Resumen tributario** (nueva pestaña de Tesorería, roles de Tesorería):
  - Filtro por mes (emisión, hora Lima).
  - Totales en S/: con crédito fiscal (base, IGV; NC restan), sin crédito (total), retenciones 4ta (retenido, pagado a SUNAT, pendiente).
  - Detalle por comprobante: fecha, tipo, serie-número, proveedor (RUC, razón social), moneda, TC, base, IGV, total, en S/, crédito sí/no, retención 4ta.
  - Botón "Exportar a Excel" (librería `xlsx` ya usada en el frontend).
  - Endpoint `GET /tesoreria/resumen-tributario?periodo=YYYY-MM`.

## Costos de fabricación: comprometido y consumido

**Problema actual:** materiales y servicios solo entran al costo de la OT cuando su ítem de origen está en
`estadoPago: "pagado"`, que pone el botón manual "Marcar como pagado" de Requerimientos — no Tesorería. Desde
que existen las OC a proveedor ese botón se bloquea para ítems con OCP y Tesorería nunca cambia ese estado:
lo comprado con OC no aparece en el costo, y la única salida era marcar como pagado algo no pagado.

**Una sola regla en el servidor** (`utils/costosOT.js`, `costosDeOT(otIds)`): la usan el reporte y una ruta nueva
`GET /reportes/costos-fabricacion/:otId` para la tarjeta "Costo de fabricación" de la OC del cliente y su desglose
(`ModalReporteCosto`), que hoy repiten el cálculo en el frontend con el criterio viejo.

Por OT (la OT padre suma sus sub-OT), en soles y sin IGV:

| Concepto | Comprometido | Consumido |
|---|---|---|
| Línea de OC a proveedor (material o servicio) | costo de la línea × (1 − fracción pagada) — incluye lo aún no facturado | costo de la línea × fracción pagada |
| Flete de la OCP (factura de transportista) | parte no pagada de esa factura | parte pagada |
| Comprobante sin OC ligado a la OT (ticket, recibo…) | si está por pagar | si está pagado (incluido "Ya se pagó") |
| Ítems antiguos sin OCP (flujo manual previo) | `estadoPago: "pendiente_pago"` | `estadoPago: "pagado"` |
| HH y HM notificadas | — | siempre |

- **Fracción pagada de una OCP** = Σ de lo pagado de sus comprobantes (neto + impuesto, en proporción a cada
  comprobante, sin IGV y sin flete) ÷ subtotal de la OCP neto de NC aplicadas; tope 1. Lo no facturado cuenta como no pagado.
- **Notas de crédito** aplicadas rebajan el costo de la línea/OCP en su proporción. OC o comprobantes anulados no cuentan.
- **Margen** = subtotal de la OC del cliente − (comprometido + consumido).

**Pantallas:**
- Reportes → "Costos de fabricación": resumen por OT (comprometido, consumido, total, margen) y dos tablas con el
  detalle — **Costo comprometido** (materiales, servicios y flete por pagar) y **Costo consumido** (HH, HM, materiales y
  servicios pagados). El Excel exporta las dos hojas.
- Tarjeta "Costo de fabricación" de la OC del cliente y `ModalReporteCosto`: consumido y comprometido por separado, total y margen.
- **Selector de moneda** (pedido del usuario, 2026-09-30) en el reporte y en el desglose de la tarjeta: "S/ | US$" + "Tipo de cambio al: [fecha]" (por defecto hoy). Convierte los costos (calculados en S/) y el subtotal de la OC del cliente (en su moneda) con el TC venta SUNAT de esa fecha, y el margen se calcula ya en la misma moneda (antes se comparaba una OC en USD contra costos en S/). La tarjeta abre en la moneda de la OC. El Excel exporta en la moneda elegida con columnas Moneda y TC. Usa el histórico de TC por fecha (regla 7), que por eso se implementa en la Fase 1.

## Errores y validaciones (servidor, 400 con `mensaje`)

Tipo inválido; NC/ND sin origen, de otro proveedor o moneda, origen anulado o NC/ND; `ticketConRuc` o retención 4ta en un tipo que no corresponde; aplicar más que el saldo a favor o el saldo del destino; aplicar a otro proveedor/moneda; anular un comprobante con NC vigentes; TC fuera de rango; "Ya se pagó" sin cuenta/medio. Duplicado por proveedor + tipo + serie + número → 409 (como hoy).

## Pruebas

- Backend (`node:test`, replica set): crédito fiscal por tipo; ticket con y sin RUC; retención 4ta (neto, saldo de impuesto, pago a SUNAT, rechazo en otros tipos); ND por pagar; NC con aplicación parcial y sobrante; aplicar saldo a favor (tope, otro proveedor/moneda → 400); anular NC revierte; no anular origen con NC; "Ya se pagó" (neto pagado, impuesto pendiente); TC por fecha (histórico, sin repetir consulta; falla → manual); SIRE con tipos nuevos, NC en negativo, TC distinto; resumen mensual (totales, NC restan, USD a soles); `creditoFiscal` derivado para comprobantes antiguos; TC: segunda consulta de la misma fecha no llama a apiperu, "hoy" sin publicación no se guarda, consulta fallida no se guarda.
- Costos: OCP sin facturar → todo comprometido; factura pagada a medias → reparto proporcional; pagada → consumido; NC rebaja; ticket "Ya se pagó" con OT → consumido; flete; ítems antiguos sin OCP; HH/HM en consumido; OC/comprobante anulado no cuenta; OT padre suma sub-OT; la tarjeta de la OC y el reporte dan lo mismo.
- Frontend: lógica pura en `utils/tesoreria.js` con tests (crédito fiscal, neto con retención 4ta, aplicable de una NC, filas del resumen).
- Playwright: registrar cada tipo, NC con sobrante y aplicar el saldo a favor, ticket "Ya se pagó", USD con TC automático, exportar el resumen.

## Estado — Fase 3 (2026-10-01)

Implementada en `feature/comprobantes-compra`: tipos 12 (ticket, casilla "Trae RUC de INTALES e IGV desglosado") y 14; `creditoFiscal` derivado en el servidor (sin default: los antiguos se derivan al leerse con `creditoFiscalDe`); retención de 4ta manual solo en RH (8 % en S/, el RH no admite otro impuesto); la retención del 3 % solo en comprobantes con crédito fiscal (también en la sugerencia del formulario); "Ya se pagó" registra el pago del neto en la misma transacción; Por pagar muestra el tipo y el Excel el crédito fiscal. Backend 163/163, frontend 49/49, Playwright OK, revisión final con 2 Important corregidos.

Menores diferidos: `pago.fecha` sin validar por API; falta test de reversión de "Ya se pagó" con cuenta inactiva; cuenta malformada da mensaje genérico; falla silenciosa al cargar cuentas; precarga SIRE de ticket 12 sin `ticketConRuc`; RH y tickets sin RUC aparecen "solo en el sistema" en SIRE (Fase 5); el formulario "Sin OC" no permite ligar una OT; `ticketConRuc: "false"` (texto) por API se toma como verdadero; duplicado previo responde 400.
Pendiente de confirmar con el contador: si la retención del 3 % aplica a recibos de servicios públicos (14).

## Estado — Fase 4 (2026-10-01)

Implementada en `feature/comprobantes-compra` (backend dabc5c6..ba5ad8f, frontend 8946d6ac..faeb94b5). NC/ND ligadas a su comprobante; la NC se aplica sola hasta el saldo y el excedente queda a favor ("Aplicar a…"); anular el origen exige anular antes sus notas.

Decisiones tomadas en la revisión:
- La suma de NC vigentes de un comprobante no puede superar su total.
- La detracción/retención del comprobante se recalcula sobre su total menos las NC vigentes mientras no se haya depositado; anular la NC la restaura. Si ya se depositó, se regulariza fuera del sistema.
- Una nota en USD usa el TC del comprobante que modifica (sin consulta SUNAT). **Confirmar con el contador.**
- Costos: una ND sobre factura con OC o de flete sube ese costo (con su propio pago); una NC de flete reduce el flete repartido.

Pendientes menores: Excel de Por pagar con crédito fiscal derivado del origen; etiqueta "aplicación" en Movimientos (sin botón Anular); fecha de la aplicación manual = hoy; formulario de nota (moneda bloqueada tras elegir origen, limpiar origen al cambiar proveedor, ocultar flete/condición en NC); NC fuera del filtro "Pendiente" y del Excel, columna de saldo a favor, resumen neto de NC; índice {notaCredito, anulado}.
