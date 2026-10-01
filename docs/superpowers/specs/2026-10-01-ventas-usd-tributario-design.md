# Ventas en US$, diferencia de cambio, NC de venta parcial y resumen tributario completo — Design Spec

**Fecha:** 2026-10-01 · **Estado:** aprobado por el usuario (diseño en chat 2026-10-01)
**Origen:** brechas B1–B5 de `docs/contabilidad/2026-10-01-casos-prueba-contables.md` (agente contador).
**Casos de referencia:** CP-12, CP-13, CP-15, CP-16, CP-17, CP-22 del mismo documento.

## Objetivo

Que INTALES dé, para ventas y tesorería, los mismos datos que usaría un contador con CONCAR/StarSoft:
ventas en dólares, tipo de cambio del día en cada cobro/pago con su diferencia de cambio, ajuste de diferencia de
cambio al cierre, NC de venta parcial que rebaja la cuenta por cobrar y un resumen tributario que cuadre con el PDT 621.
Corrige además las cuentas PCGE del diseño del motor contable antes de implementarlo.

## Decisiones

| Tema | Decisión |
|---|---|
| Moneda de la venta | La factura toma la moneda de su OC (que ya hereda la de su cotización); sin OC, se elige (PEN/USD) |
| TC de la venta | TC **venta** SUNAT de la fecha de emisión (`TipoCambioDia`), automático y solo lectura; como en compras |
| TC de cobros y pagos | TC SUNAT de la fecha del movimiento: **compra en cobros, venta en pagos** (práctica CONCAR/StarSoft; **por confirmar con el contador**, configurable en Configuración de Tesorería) |
| TC de NC/ND | El del comprobante que modifican (Oficio SUNAT 024-2000-K00000) — ya implementado en compras; igual en ventas |
| Diferencia de cambio realizada | Cada movimiento en US$ guarda `difCambio` en S/ |
| Ajuste al cierre | Reporte en Tesorería; el asiento lo generará el motor contable (fase C) |
| NC de venta | Solo anula el origen si el motivo es 01/02 (anulación) o si cubre el total; si no, se aplica al saldo |
| Resumen tributario | Agrega ventas (débito fiscal), retenciones sufridas, IGV resultante y pago a cuenta de renta |
| Coeficiente de renta | Configurable en Configuración de Tesorería, por defecto 1.5 % |
| Pendientes del contador | Montos USD del RCE (¿dólares o soles?), TC compra/venta en cobros/pagos, y las preguntas del documento de casos de prueba |

## 1. Cuentas del motor contable (documentos)

Corregir `Backend/docs/contabilidad/2026-10-01-motor-contable-design.md` y `2026-10-01-c1-spec-implementacion.md`
(y su copia en Frontend) según la brecha B5:
- Ventas de servicios `7032`/`70321` (no 7041, que es Subproductos); productos fabricados `7021`/`70221`;
  mercaderías locales `7012`/`70121` (7011 es exportación).
- `4241` y `6021` no existen: honorarios por pagar en `424` (sin divisionaria) y compras de materias primas en `602`.
- La detracción de compras es parte de `4212` (no una `4011x`) y se deposita desde la cuenta operativa `1041`; la de
  ventas entra a `1042` (Banco de la Nación).
- Las cuentas `921/941/951/971` son de libre definición: se dejan como ejemplo configurable.
- Marcar "[Confirmar con el contador]" lo que el agente dejó pendiente.

## 2. Ventas en US$

**Modelo `Factura`:** `moneda` (`PEN`|`USD`, default `PEN`) y `tipoCambio` (default 1).

**POST `/facturas`:**
- `moneda` = la de la OC si hay OC; si no, la del body (PEN por defecto).
- USD: `tipoCambio` = venta SUNAT de `fechaEmision` vía `tipoCambioDelDia` (BD → apiperu → respaldo); si el cliente
  manda uno distinto se ignora. Rango 2–6.
- `impuestoVentaPorDefecto(total, moneda, tipoCambio)`: el umbral de S/ 700 y el monto de la detracción se miden en
  soles (`calcularImpuesto` ya acepta moneda y TC).
- `recalcularFacturaVenta`: `partes({ lado: "venta", total, moneda, tipoCambio, impuesto })` (el neto queda en la
  moneda de la factura y el impuesto en S/, como en compras).
- `PATCH /facturas/:id/impuesto` y el PUT que recalcula total usan la moneda y TC de la factura.

**CPE:** `ModalCrearFactura` envía la moneda de la factura (hoy fija `"PEN"`). Si un CPE en USD lleva bloque de
detracción, su `Amount` va en `PEN` (`currencyID="PEN"`, monto en soles), como exige SUNAT.

**Frontend:**
- `ModalCrearFactura`: moneda de la OC (solo lectura) o selector sin OC; TC SUNAT de la fecha (solo lectura, con la
  etiqueta "SUNAT para el dd/mm"); montos con su símbolo; la detracción mostrada en S/.
- Por cobrar: columna/monto en la moneda de la factura; el modal de cobro ofrece cuentas de esa moneda para el neto
  (`cuentasPara` ya filtra por moneda en compras) y la cuenta de detracciones (S/) para el impuesto.

## 3. TC del día en cobros y pagos; diferencia de cambio

**`MovimientoTesoreria`:** nuevos `tipoCambioDoc` (TC del documento) y `difCambio` (S/, con signo: + ganancia,
− pérdida). `tipoCambio` pasa a ser el **TC del movimiento**.

**`registrarMovimiento`** (y "Ya se pagó"):
- Documento en PEN o concepto `impuesto`: `tipoCambio = 1`, `difCambio = 0`.
- Neto de un documento en USD: `tipoCambio` = TC SUNAT de `fecha` (compra si es cobro, venta si es pago, según
  `Configuracion.tcCobros`/`tcPagos`, por defecto `compra`/`venta`), vía `tipoCambioDelDia`; si no hay TC SUNAT de
  esa fecha se usa el respaldo (último guardado/vigente) y el movimiento guarda `fuenteTc`.
- `difCambio`:
  - cobro (activo): `round2(monto × (tcMov − tcDoc))`
  - pago (pasivo): `round2(monto × (tcDoc − tcMov))`
- Aplicaciones de NC (`tipo: "aplicacion"`): sin diferencia de cambio (mismo TC del documento).
- Movimientos antiguos sin `tipoCambioDoc`: se leen como `tipoCambioDoc = tipoCambio`, `difCambio = 0`.

**Movimientos (pantalla):** columnas TC y "Dif. cambio S/" para los movimientos en US$; Excel igual.

**Diferencia de cambio al cierre** — `GET /tesoreria/diferencia-cambio?fecha=YYYY-MM-DD` (roles de Tesorería) y
pestaña "Dif. de cambio" en Tesorería:
- TC de cierre: compra y venta SUNAT de `fecha` (`tipoCambioDelDia`).
- Partidas (solo USD, no anuladas):
  - Por cobrar: facturas de venta con `saldoNeto > 0` → libros = `saldoNeto × tipoCambio` de la factura;
    cierre = `saldoNeto × TC compra`; diferencia = cierre − libros (ganancia si +).
  - Por pagar: comprobantes de compra con `saldoNeto > 0` → libros = `saldoNeto × tipoCambio`;
    cierre = `saldoNeto × TC venta`; diferencia = libros − cierre (ganancia si +).
  - Cuentas de tesorería en USD: saldo en US$ = Σ ingresos − Σ egresos en US$ hasta `fecha`; libros S/ =
    Σ (monto × `tipoCambio` del movimiento) con su signo; cierre = saldo US$ × TC compra.
- Respuesta: `{ fecha, tcCompra, tcVenta, fuenteTc, partidas: [{ tipo, documento|cuenta, moneda, saldoMe, librosSoles, cierreSoles, diferencia }], totales: { ganancia, perdida, neto } }`.
- Excel con las partidas y totales. Fuera de alcance: guardar el ajuste o generar el asiento (motor contable).
- Limitación aceptada: las partidas usan el TC de origen del documento, no el de un ajuste de cierre anterior (no hay
  ajustes guardados todavía).

## 4. NC de venta parcial

**`emitirNotaCredito`** (al quedar ACEPTADA):
- Motivos `01` (anulación de la operación) o `02` (anulación por error en el RUC), o NC por el **total** del origen:
  se anula el origen como hoy.
- Cualquier otro motivo con importe menor al total: el origen queda **vigente**; la NC se registra en la `Factura`
  interna del origen.

**Modelo `Factura`:** `notasCredito: [{ comprobante, serieNumero, fecha, motivo, subtotal, igv, total }]` y
`aplicadoNC` (derivado, moneda de la factura).

**`recalcularFacturaVenta`:**
- `aplicadoNC = Σ notasCredito.total`.
- Importe vigente = `total − aplicadoNC`.
- Si la detracción/retención **aún no se cobró** (`pagadoImpuesto = 0`), su monto se recalcula sobre el importe
  vigente (como en compras).
- `saldoNeto = neto(importe vigente) − pagadoNeto`.
- Las cuotas se reparten sobre el importe vigente.

**Frontend:** la factura muestra "NC aplicadas" y su saldo rebajado (Facturas y Por cobrar).

Fuera de alcance: NC de venta con saldo a favor del cliente (una NC mayor que el saldo pendiente se rechaza en
`emitirNotaCredito` antes de enviarla a SUNAT, con mensaje claro); ND de venta como documento por cobrar.

## 5. Resumen tributario completo

`GET /tesoreria/resumen-tributario?periodo=YYYY-MM` agrega:
- **Ventas** (`totales.ventas`): comprobantes electrónicos `ACEPTADO` del ambiente del emisor, tipos 01/03/08 suman y
  07 resta; base gravada e IGV en S/ (USD × TC de la factura interna ligada; si no hay factura, TC venta SUNAT de la
  fecha). Detalle por comprobante en `ventas[]`.
- **Retenciones de IGV sufridas** (`totales.retencionesSufridas`): movimientos `tipo: "retencion"` de facturas de venta
  con `fecha` en el mes.
- **IGV del mes** (`totales.igv`): `{ debito, credito, retenciones, resultado }` con
  `resultado = debito − credito − retenciones`; si es negativo se muestra como saldo a favor (no se arrastra al mes
  siguiente en esta fase).
- **Pago a cuenta de renta** (`totales.renta`): `{ base: ventas netas (base), coeficiente, monto }`, con
  `Configuracion.coeficienteRenta` (default 0.015).
- Pantalla: tarjetas "Ventas", "IGV del mes" y "Renta"; detalle de ventas; Excel con una hoja más ("Ventas").

## Configuración de Tesorería

`Configuracion`: `coeficienteRenta` (0–0.1, default 0.015), `tcCobros` (`compra`|`venta`, default `compra`),
`tcPagos` (`compra`|`venta`, default `venta`). Editables en la pestaña Configuración (jefatura/admin).

## Validaciones y errores

- Moneda inválida → 400. Factura USD sin TC SUNAT ni respaldo → 502 con mensaje (no se crea).
- Fechas en hora Lima; periodos con `T00:00:00-05:00`.
- Nada de `alert/confirm/prompt`.

## Pruebas

- Backend (`node:test`, replica set): factura USD hereda moneda de la OC y toma TC venta SUNAT; detracción en S/
  sobre el total convertido; saldo neto en US$; cobro en US$ con TC compra del día y `difCambio`; pago de compra en
  US$ con TC venta y `difCambio` (CP-12); movimiento en PEN sin diferencia; reporte de cierre (CP-17: 29.50, −47.20,
  906.80); NC parcial deja el origen vigente y rebaja el saldo (CP-16); NC motivo 01 anula; NC mayor al saldo → 400;
  detracción recalculada tras NC sin cobrar; resumen con ventas, retenciones sufridas, IGV resultante y renta (CP-22).
- Frontend: utilidades de moneda/TC de la factura, filas del reporte de diferencia de cambio, Excel del resumen.
- Playwright: factura USD → cobro con diferencia → reporte de cierre → resumen tributario.

## Estado (2026-10-01)

Implementado en `feature/ventas-usd-tributario` (ambos repos), revisado y con los Critical/Important corregidos.
Decisiones tomadas al implementar:
- La fecha de emisión/cancelación de la factura de venta se guarda a medianoche de Lima (antes UTC: se veía un día
  antes). Los datos anteriores no se migran (no hay producción).
- El CPE en dólares con detracción calcula en el servidor el monto en soles (TC venta SUNAT del día, sin decimales).
- Una NC parcial se rechaza antes de emitir si dejaría la factura con saldo negativo (simula el recálculo de la
  detracción y cuenta las NC aún en proceso). NC sucesivas que cubren el total anulan el comprobante.
- El neto se cobra/paga solo desde cuentas en la moneda del documento; el impuesto, desde cuentas en soles.
- El resumen toma las ventas del ambiente SUNAT del emisor; un comprobante anulado por NC sigue contando en su mes.

Pendientes menores: venta USD sin TC suma 0 sin aviso; TC de NC USD sin factura ligada; separar saldo a favor (145)
de retenciones no aplicadas (179); exonerados/inafectos en la base de ventas; TC de la factura vs fecha del CPE y PUT
de fecha; mensajes del PUT en US$; cierre a fecha pasada con NC posteriores; búsqueda del origen por ambiente;
guardar el ajuste de cierre.
Por confirmar con el contador: TC compra/venta en cobros y pagos; montos USD del RCE; preguntas del documento de casos.
