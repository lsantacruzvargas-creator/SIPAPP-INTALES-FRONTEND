# Ventas en US$, diferencia de cambio, NC de venta parcial y resumen tributario — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ventas en dólares, TC del día con diferencia de cambio en cobros/pagos, reporte de ajuste al cierre, NC de venta parcial y resumen tributario que cuadre con el PDT 621; cuentas PCGE corregidas en el diseño del motor contable.

**Architecture:** `Factura` gana moneda/TC y notas de crédito aplicadas; `recalcularFacturaVenta` convierte con `partes` como compras. `registrarMovimiento` toma el TC SUNAT del día (compra/venta según configuración) y guarda la diferencia. Dos endpoints de Tesorería nuevos/ampliados: `diferencia-cambio` y `resumen-tributario`. La lógica de NC de venta sale del controlador CPE a `utils/notasCreditoVenta.js` para probarla sin SUNAT.

**Tech Stack:** Node 24 ESM, Express 4, Mongoose 8, `node:test` con replica set; React 19 + Vite + Tailwind; `xlsx`.

**Spec:** `docs/superpowers/specs/2026-10-01-ventas-usd-tributario-design.md`

## Global Constraints

- Fechas en hora Lima (`aFechaLima`, `T00:00:00-05:00`); nunca `toISOString().slice` para fechas de negocio nuevas.
- Montos redondeados con `round2` en el servidor; impuestos (detracción/retención) siempre en S/.
- TC por fecha solo vía `tipoCambioDelDia` (BD → apiperu → respaldo); en tests se siembra `TipoCambioDia`.
- Nunca `alert/confirm/prompt`. Errores `400 { mensaje }`.
- Tests backend: `MONGO_URI_TEST="mongodb://localhost:27017/sipapp-intales-test?replicaSet=rs0" npm test`; frontend `npm test`, eslint de los archivos tocados, `npm run build`.

## Review Focus

1. Factura PEN existente (sin `moneda`) y movimientos antiguos sin `tipoCambioDoc` → deben seguir comportándose igual (PEN, TC 1, sin diferencia).
2. Cobro de la detracción de una factura USD → en S/, TC 1, sin diferencia de cambio, a la cuenta de detracciones.
3. NC parcial de venta cuando la detracción ya se cobró → no se recalcula la detracción; saldo neto rebajado sin quedar negativo.
4. Resumen con un comprobante USD sin factura interna ligada → TC venta SUNAT de su fecha (o respaldo), no 1.
5. Reporte de cierre sin TC SUNAT de esa fecha → usa respaldo y lo indica (`fuenteTc`), no 500.

---

### Task 1: Cuentas PCGE en el diseño del motor contable (docs)

**Files:** `Backend/docs/contabilidad/2026-10-01-motor-contable-design.md`, `Backend/docs/contabilidad/2026-10-01-c1-spec-implementacion.md` (y copia idéntica en `Frontend/docs/contabilidad/`).

- [ ] Reemplazar según spec §1: 7041→7032/70321 (servicios), 7011→7012/70121 (mercaderías locales) + 7021/70221 (productos fabricados); 4241→424; 6021→602; detracción de compras dentro de 4212 y depósito desde 1041; detracción de ventas a 1042; 921/941/951/971 como ejemplo configurable; marcas "[Confirmar con el contador]".
- [ ] `grep -n "7041\|4241\|6021\|4011x"` en ambos docs → sin coincidencias salvo notas de corrección.
- [ ] Commit `docs(contabilidad): cuentas PCGE corregidas (brecha B5)` en ambos repos.

### Task 2: Ventas en US$ (backend)

**Files:** `Backend/src/models/Factura.js`, `Backend/src/routes/facturas.js`, `Backend/src/utils/saldosTesoreria.js`, `Backend/src/builders/factura.builder.js`; Test: `Backend/test/ventasUsd.test.js`.

**Interfaces — Produces:** `Factura.moneda` (`PEN`|`USD`), `Factura.tipoCambio`; `impuestoVentaPorDefecto(total, moneda = "PEN", tipoCambio = 1)`; `recalcularFacturaVenta` usa moneda/TC.

- [ ] **Tests que fallan:**
  - Factura con OC en USD (OC `moneda: "USD"`), `fechaEmision` 2026-09-02, `TipoCambioDia` sembrado venta 3.51 → `moneda: "USD"`, `tipoCambio: 3.51`, total 5900 para subtotal 5000; un `tipoCambio` enviado en el body se ignora.
  - Detracción 037 de una factura USD 1000 + IGV (1180 × 3.51 = 4141.80) → `impuesto.monto` = 497 (S/), `totalAPagar` = round2(1180 − 497/3.51) = 1038.41.
  - Factura sin OC con `moneda: "USD"` → USD; `moneda: "EUR"` → 400.
  - Factura USD de 150 + IGV (177 × 3.51 = 621.27 < 700) → sin detracción.
  - Factura PEN sin campo `moneda` en BD (insertada con `collection.insertOne`) → recalcular la trata como PEN.
  - Builder: CPE USD con detracción → `<cbc:Amount currencyID="PEN">`.
- [ ] Run → FAIL. Implementar. Run → PASS; suite verde. Commit `feat(ventas): facturas en dólares con TC SUNAT de emisión`.

### Task 3: Ventas en US$ (frontend)

**Files:** `Frontend/src/components/ModalCrearFactura.jsx`, `Frontend/src/components/tesoreria/TablaPorCobrar.jsx`, `Frontend/src/components/tesoreria/ModalMovimiento.jsx`, `Frontend/src/utils/tesoreria.js`; Test: `Frontend/src/utils/tesoreria.test.js`.

**Interfaces — Produces:** `monedaFactura({ oc, cotizacion, elegida })` → `"PEN"|"USD"`.

- [ ] Test `monedaFactura` (OC USD manda; sin OC, la elegida; default PEN). FAIL → implementar → PASS.
- [ ] Modal: moneda (solo lectura con OC), TC SUNAT de la fecha (consulta `/sunat/tipo-cambio?fecha=`, solo lectura con su etiqueta `origenTC`), envía `moneda` al CPE y a `/facturas`; montos con `money(x, moneda)`; detracción en S/.
- [ ] Por cobrar y modal de cobro: montos en la moneda de la factura; neto solo a cuentas de esa moneda.
- [ ] npm test, eslint, build. Commit `feat(ventas): facturar en dólares desde el modal y cobrar en la moneda de la factura`.

### Task 4: TC del día y diferencia de cambio en movimientos (backend)

**Files:** `Backend/src/models/MovimientoTesoreria.js`, `Backend/src/models/Configuracion.js`, `Backend/src/routes/configuracion.js`, `Backend/src/utils/movimientos.js`; Test: `Backend/test/diferenciaCambio.test.js`.

**Interfaces — Produces:** `MovimientoTesoreria.{tipoCambio (del movimiento), tipoCambioDoc, difCambio, fuenteTc}`; `Configuracion.{tcCobros, tcPagos, coeficienteRenta}`.

- [ ] **Tests que fallan:**
  - CP-12: compra USD 2000+360 TC 3.53; `TipoCambioDia` 2026-09-25 compra 3.48 venta 3.49; pago neto 2360 el 25/09 → `tipoCambio` 3.49, `tipoCambioDoc` 3.53, `difCambio` +94.40.
  - CP-15: venta USD 5000+900 TC 3.51, sin detracción (cambiada a "ninguno"); cobro 5900 el 25/09 → `tipoCambio` 3.48, `difCambio` −177.00.
  - Movimiento PEN → `tipoCambio` 1, `difCambio` 0. Cobro de la detracción de factura USD → TC 1, diferencia 0.
  - Sin TC SUNAT de la fecha (solo uno anterior sembrado) → usa respaldo, `fuenteTc: "respaldo"`.
  - Config `tcCobros: "venta"` → el cobro usa venta.
  - `PUT /configuracion` acepta `coeficienteRenta` (0–0.1), `tcCobros`, `tcPagos`; valores inválidos → 400.
- [ ] Run → FAIL. Implementar. Run → PASS; suite verde. Commit `feat(tesorería): TC del día y diferencia de cambio en cobros y pagos`.

### Task 5: Reporte de diferencia de cambio al cierre (backend)

**Files:** Create `Backend/src/utils/diferenciaCambioCierre.js`; Modify `Backend/src/routes/tesoreria.js`; Test: `Backend/test/diferenciaCambio.test.js`.

**Interfaces — Produces:** `GET /tesoreria/diferencia-cambio?fecha=YYYY-MM-DD` → `{ fecha, tcCompra, tcVenta, fuenteTc, partidas[], totales: { ganancia, perdida, neto } }`.

- [ ] **Test CP-17:** venta USD 2500+450 TC 3.55 pendiente; compra USD 1000+180 TC 3.53 pendiente; cuenta BCP Dólares con un ingreso de 5900 a TC 3.48 (cobro de otra venta) y un egreso de 2360 a TC 3.49, más un saldo inicial modelado como un cobro de 10000 a TC 3.50; TC 30/09 compra 3.56 venta 3.57 → partidas: factura venta +29.50, compra −47.20, cuenta con saldo US$ 13540 y diferencia = 13540 × 3.56 − libros. Totales ganancia/pérdida/neto coherentes. Fecha inválida → 400.
- [ ] FAIL → implementar → PASS; suite verde. Commit `feat(tesorería): reporte de diferencia de cambio al cierre`.

### Task 6: Diferencia de cambio en pantalla y configuración (frontend)

**Files:** `Frontend/src/components/tesoreria/TablaMovimientos.jsx`, Create `Frontend/src/components/tesoreria/PanelDiferenciaCambio.jsx`, `Frontend/src/pages/Tesoreria.jsx`, `Frontend/src/components/tesoreria/PanelConfiguracion.jsx`, `Frontend/src/utils/tesoreria.js`; Test: `tesoreria.test.js`.

**Interfaces — Produces:** `filasExcelDiferenciaCambio(partidas)`.

- [ ] Test de `filasExcelDiferenciaCambio` (tipo legible, montos, signo). FAIL → implementar → PASS.
- [ ] Movimientos: columnas TC y "Dif. cambio S/" (solo USD). Pestaña "Dif. de cambio" con fecha, TC compra/venta y su fuente, tabla, totales y Excel. Configuración: coeficiente de renta (%) y TC de cobros/pagos.
- [ ] npm test, eslint, build. Commit `feat(tesorería): pestaña de diferencia de cambio y configuración de TC y renta`.

### Task 7: NC de venta parcial (backend)

**Files:** Create `Backend/src/utils/notasCreditoVenta.js`; Modify `Backend/src/models/Factura.js`, `Backend/src/utils/saldosTesoreria.js`, `Backend/src/controllers/comprobante.controller.js`; Test: `Backend/test/notasCreditoVenta.test.js`.

**Interfaces — Produces:** `validarNotaCreditoVenta({ origen, total })` (lanza 400 si supera el saldo) y `aplicarNotaCreditoVenta(nc, origen)` → `"anulado"|"aplicada"`; `Factura.notasCredito[]`, `Factura.aplicadoNC`.

- [ ] **Tests que fallan** (Comprobantes insertados directo, sin SUNAT):
  - CP-16: factura 10000+1800 ligada a su CPE; NC ACEPTADA motivo 09 por 1000+180 → origen sigue `ACEPTADO`, factura con `aplicadoNC` 1180 y saldo/detracción recalculados (detracción 037 sobre 10620 = 1274; neto 10620 − 1274 = 9346).
  - NC motivo 01 → origen `ANULADO` (como hoy).
  - NC por el total (motivo 07) → origen `ANULADO`.
  - Detracción ya cobrada → no se recalcula; saldo neto = neto original − NC − pagado, nunca negativo.
  - `validarNotaCreditoVenta` con NC mayor al saldo pendiente → 400.
- [ ] Controlador: llamar `validarNotaCreditoVenta` antes de emitir y `aplicarNotaCreditoVenta` al ACEPTAR (en lugar del `findOneAndUpdate` fijo).
- [ ] FAIL → implementar → PASS; suite verde. Commit `feat(ventas): NC parcial de venta rebaja el saldo sin anular el comprobante`.

### Task 8: NC de venta en pantalla (frontend)

**Files:** `Frontend/src/components/tesoreria/TablaPorCobrar.jsx` (y la tabla/detalle de Facturas que muestra saldo).

- [ ] Mostrar "NC aplicadas X" bajo el total cuando `aplicadoNC > 0`. eslint, build. Commit `feat(ventas): mostrar NC aplicadas en la factura`.

### Task 9: Resumen tributario completo (backend)

**Files:** `Backend/src/utils/resumenTributario.js`; Test: `Backend/test/resumenTributario.test.js`.

**Interfaces — Produces:** `totales.ventas { base, igv, total }`, `totales.retencionesSufridas`, `totales.igv { debito, credito, retenciones, resultado }`, `totales.renta { base, coeficiente, monto }`, `ventas[]`.

- [ ] **Tests que fallan (CP-22 simplificado):** CPE 01 ACEPTADOS del mes (uno PEN 40000/7200, uno USD 5000/900 con factura ligada TC 3.51), una NC 07 de 1000/180, un CPE de otro mes y uno RECHAZADO (no cuentan); retención sufrida 35.40 en el mes; compras con crédito 570/102.60 → `ventas` base 40000 + 17550 − 1000 = 56550, IGV 7200 + 3159 − 180 = 10179; `igv.resultado` = 10179 − 102.60 − 35.40 = 10041; `renta` con coeficiente 0.015 → 848.25. CPE USD sin factura ligada usa TC venta SUNAT sembrado.
- [ ] FAIL → implementar → PASS; suite verde. Commit `feat(tesorería): resumen tributario con ventas, IGV del mes y renta`.

### Task 10: Resumen tributario completo (frontend)

**Files:** `Frontend/src/components/tesoreria/PanelResumenTributario.jsx`, `Frontend/src/utils/tesoreria.js`, `Frontend/src/utils/exportarTabla.js` (si hace falta un libro con varias hojas); Test: `tesoreria.test.js`.

**Interfaces — Produces:** `filasExcelVentas(ventas)`; `exportarLibro(archivo, hojas)` si se necesita.

- [ ] Test `filasExcelVentas` (NC negativa, tipo legible). FAIL → implementar → PASS.
- [ ] Tarjetas "Ventas", "IGV del mes" (resultado o saldo a favor) y "Pago a cuenta de renta"; detalle de ventas; Excel con hojas "Compras" y "Ventas".
- [ ] npm test, eslint, build. Commit `feat(tesorería): resumen tributario con ventas, IGV y renta en pantalla`.

### Task 11: Prueba en navegador (Playwright)

- [ ] Entorno E2E (8090/5180 sobre 27018). Factura USD desde OC USD → cobro en US$ con diferencia → Movimientos muestra TC y diferencia → Dif. de cambio al cierre → Resumen tributario con ventas e IGV del mes. Anotar resultados en el ledger.
