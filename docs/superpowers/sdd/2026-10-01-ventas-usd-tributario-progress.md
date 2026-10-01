# SDD ledger — plan: docs/superpowers/plans/2026-10-01-ventas-usd-tributario.md
Pre-flight: T2→T3 (moneda/tipoCambio de Factura), T4→T5/T6 (tipoCambio/difCambio de movimientos), T4→T9 (coeficienteRenta), T7→T8 (aplicadoNC), T9→T10 (totales nuevos) — coinciden.
BASE backend: df36817 · BASE frontend: 47b90e23
Task 1: complete (commits docs B5 en ambos repos; grep 7041/4241/6021 solo en notas de corrección)
Task 2: complete (commits a8a72ae..d5279b0, tests: npm test → 193 pass, 1 skip previo). Ruling: totalAPagar del test 1038.41→1038.40 (497/3.51=141.595; error de aritmética del plan). Ruling: el CPE en USD con detracción exige detraccion.montoPen (Amount en PEN).
Task 3: complete (commits 2846fe54..8ee284f6, tests: npm test (frontend) → 60/60; eslint OK salvo error previo react-hooks/purity en ModalCrearFactura (Date.now en handler, ya existía); build OK)
Task 4: complete (commits d5279b0..3847c5a, tests: npm test → 198 pass, 1 skip previo). Ruling: difCambio esperado del test de configuración −129.8→−118 (5900×(3.49−3.51)); error de aritmética del test.
Task 5: complete (commits 3847c5a..90f32b7, tests: npm test → 200 pass, 1 skip previo). Ruling: saldos reconstruidos a la fecha con movimientos hasta ese día (no el saldo actual) — un cierre pasado no ve pagos posteriores.
Task 6: complete (commits 8ee284f6..7b800781, tests: npm test (frontend) → 61/61; eslint OK; build OK). Ruling: TC y diferencia de cambio se muestran bajo el monto en Movimientos (no columnas nuevas) para no ensanchar la tabla.
Task 7: complete (commits 90f32b7..79f1d15, tests: npm test → 205 pass, 1 skip previo). Ruling: la validación de la NC va antes de reservar el correlativo (no quema números).
Task 7: Ruling: consultarTicket también llama aplicarNotaCreditoVenta (idempotente) — antes una NC aceptada por ticket nunca anulaba el origen (hueco previo).
Task 8: complete (commits 7b800781..f47d1754, eslint OK, build OK; sin lógica nueva que testear)
Task 9: complete (commits a3f8d7b..0f11615, tests: npm test → 207 pass, 1 skip previo). Ruling: ventas del ambiente SUNAT_ENVIRONMENT (como el emisor), no fijo 'produccion' como el RVIE, para que el resumen funcione en demo. Ruling: test CP-22 ampliado con un CPE USD sin factura (TC SUNAT de la fecha).
Task 10: complete (commits f47d1754..b0bc07bb, tests: npm test (frontend) → 63/63; eslint OK; build OK). Ruling: Excel con hoja 'Resumen' (IGV y renta) además de Compras y Ventas.
Task 11: Playwright encontró que la venta del 15/09 se veía 14/09 (fechas guardadas a medianoche UTC, hueco previo) — fix con test RED→GREEN; datos anteriores no se migran (no está en producción).
Task 11: Playwright OK — factura USD 2000+IGV con TC venta SUNAT 15/09 3.383, detracción S/ 958 (en soles), neto US$ 2,076.82; cobro en BCP Dólares el 30/09 → TC compra 3.441 y dif. +S/ 120.46 visible en Movimientos; Dif. de cambio al 30/09: TC compra 3.441 / venta 3.450 (SUNAT para el 30/09), por cobrar +120.46, por pagar +23.60 y +29.50, cuenta 0 → ganancia 173.56; Resumen tributario 2026-09 con tarjetas de ventas, IGV del mes (saldo a favor 198.90) y renta 1.5 % (20.40), Excel descargado; modal Nueva factura en dólares: TC 3.437 (SUNAT para el 01/10), detracción S/ 487, total a pagar US$ 1,038.31 (no se emitió el CPE).
Task 11: Playwright encontró subtotales de Por cobrar que sumaban US$ con S/ — subtotalesPorCobrar con test RED→GREEN (frontend 64/64).
Task 11: complete
Final review: opus — 2 Critical, 5 Important, 9 Minor.
Final: fixed C1 resumen descontaba dos veces una factura anulada por NC — "una factura anulada por NC en el mismo mes no se descuenta dos veces" RED→GREEN; backend 216/216 (+1 skip previo)
Final: fixed C2 CPE en USD con detracción salía con NaN (faltaba montoPen) — detraccionDelCpe calcula el monto en soles (TC venta del día, entero) antes del correlativo; "CPE en dólares con detracción: monto en soles…" RED→GREEN; frontend: neto de la detracción en USD con decimales
Final: fixed I1 NC parcial con neto cobrado y detracción pendiente dejaba saldo negativo — validar simula el recálculo; test RED→GREEN
Final: fixed I2 consulta a apiperu con documentos ya escritos en la transacción — TC resuelto antes de escribir; "Ya se pagó" en USD precarga el TC antes de la transacción. Ruling: sin test de comportamiento (es orden/tiempos); verificado por la suite — costo si está mal: WriteConflict en concurrencia
Final: fixed I3 el backend aceptaba cobrar/pagar el neto desde una cuenta de otra moneda — 400; cuentasPara filtra por moneda; tests backend y frontend RED→GREEN (frontend 65/65)
Final: fixed I4 NC aceptada sin aplicar si la aplicación fallaba — try/catch con aviso y "Consultar" reaplica (idempotente); test RED→GREEN
Final: fixed I5 NC en proceso no reservaban saldo — ncPendientes en el tope; test RED→GREEN
Final: fixed M7 (re-graduado a Important) NC parciales sucesivas que cubren el total no anulaban el origen — test RED→GREEN
Final: fixed (fuera de alcance, una línea) setDetraccionMontoNeto inexistente en EmitirComprobante rompía "limpiar" con ReferenceError
Final: minor (deferred): M1 venta USD sin TC SUNAT ni respaldo suma 0 en el resumen sin aviso
Final: minor (deferred): M2 NC USD de venta sin factura ligada usa el TC de su fecha y no el del comprobante que modifica
Final: minor (deferred): M3 IGV del mes no separa saldo a favor de crédito fiscal (casilla 145) de retenciones no aplicadas (179)
Final: minor (deferred): M4 la base de ventas incluye exonerados/inafectos como base gravada
Final: minor (deferred): M5 TC de la factura por fecha del formulario vs CPE emitido hoy; PUT que cambia la fecha no recalcula el TC
Final: minor (deferred): M6 PUT de facturas: mensaje en S/ con montos en US$; el control de cobrado ignora aplicadoNC
Final: minor (deferred): M8 cierre pasado usa totalAPagar actual (con NC posteriores); facturas con CPE anulado por NC siguen en por cobrar (previo)
Final: minor (deferred): M9 buscarOrigenNota no filtra por ambiente (previo)
Final: minor (deferred): cobro/pago USD con fecha futura ahora da 400; ModalCrearFactura no envía detracción al CPE (previo); el ajuste de cierre no se guarda, el mes siguiente lo vuelve a incluir
Final: Ruling (declined to judge): TC compra/venta en cobros/pagos queda configurable hasta que confirme el contador; aceptación real de SUNAT de un CPE USD con detracción no probada (no se emitió CPE en E2E) — costo si está mal: rechazo del CPE, se corrige en detraccionCpe.js
Fix commits: backend eadfa64 · frontend d6b96d4d
