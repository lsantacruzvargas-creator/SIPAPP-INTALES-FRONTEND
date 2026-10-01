# SDD ledger — plan: docs/superpowers/plans/2026-10-01-comprobantes-fase4.md
Pre-flight: Task 1 produce aplicarNotaCredito/saldoAFavor/aplicadoNC (consumen Tasks 2, 3 y 4) — coinciden.
BASE backend: 4a6eec1 · BASE frontend: caa6c53a
Task 1: complete (commit dabc5c6, npm test → 167 pass)
Task 2: complete (commit a43b876, npm test → 169 pass)
Task 3: complete (commit 91ccbfc, npm test → 170 pass)
Task 4: complete (commit 8946d6ac, npm test (frontend) → 52/52; eslint sin errores; build OK)
Task 5: Playwright encontró pantalla en blanco al abrir el formulario: `origen` se usaba antes de definirse (TDZ; lint/build no lo detectan) — bloque movido, commit aparte.
Task 5: Playwright OK — NC 177 sobre factura con saldo 118: vista previa "aplica 118, 59 a favor"; sin impuesto ni "Ya se pagó"; Por pagar: origen S/ 0 con "NC aplicadas 118", NC "A favor 59" + "Aplicar a…" (sugiere 59) → segunda factura baja a 59; anular el origen → "Anula primero la nota de crédito FP-0014".
Final review: opus (agent ae853966d691f0bde) — 0 Critical, 6 Important, varios Minor.
Final: fixed NC podía superar el total de su comprobante (costo negativo) — "una NC no puede superar el total…" RED→GREEN; además Math.max(0) en "otros", suite 177/177 (+1 skip previo)
Final: fixed ND con retención 3 % siempre rechazada (creditoFiscalDe sin origen) — "ND con retención 3 %…" RED→GREEN
Final: fixed se podía anular el origen con notas vigentes sin aplicar — "no se anula un comprobante con notas vigentes…" RED→GREEN
Final: fixed detracción quedaba pendiente tras NC — "NC sobre una factura con detracción…" y "NC parcial…" RED→GREEN
Final: Ruling: detracción/retención del origen se recalcula sobre (total − NC vigentes) solo si aún no se depositó; anular la NC la restaura — SUNAT calcula sobre el importe de la operación; si ya se depositó, se regulariza fuera del sistema — costo si está mal: un ajuste manual de detracción
Final: fixed ND/NC sobre factura con OC o de flete no movían el costo de la OT — "nota de débito sobre una factura de OC…" RED→GREEN
Final: fixed la nota en USD tomaba otro TC — "la nota en dólares toma el tipo de cambio de su comprobante" RED→GREEN; frontend sin consulta SUNAT (verificado en Playwright: TC 3.65 de solo lectura, 0 requests a /sunat)
Final: Ruling: nota 07/08 en USD usa el TC del comprobante que modifica — modifica esa operación; pendiente confirmar con el contador — costo si está mal: cambiar una línea en POST
Final: minor (deferred): Excel "CRÉDITO FISCAL" de Por pagar sin origen (usar f.creditoFiscal ?? …)
Final: minor (deferred): TablaMovimientos sin etiqueta "aplicacion" y muestra "Anular" en aplicaciones (el backend lo rechaza)
Final: minor (deferred): la aplicación manual usa nc.fechaEmision en vez de la fecha del día
Final: minor (deferred): SIRE: signo de NC en comparación y precarga desdeSire (Fase 5)
Final: minor (deferred): formulario de nota: moneda editable tras elegir origen, documentoOrigen no se limpia al cambiar proveedor, flete y condición visibles en NC, centro de costo no precargado
Final: minor (deferred): Por pagar: NC entran al Excel y al filtro "Pendiente"; falta columna de saldo a favor
Final: minor (deferred): falta índice {notaCredito:1, anulado:1} en MovimientoTesoreria
Final: minor (deferred): el resumen de Por pagar debe restar las NC
Fix commits: backend ba5ad8f · frontend faeb94b5
