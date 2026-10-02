# Ledger — Bancos B7

Spec: `docs/superpowers/specs/2026-10-02-bancos-b7-design.md`. Rama: `claude/affectionate-ride-1ql646` (ambos repos).

T1 modelos: `TipoMovimientoBanco` (10 tipos iniciales, cuenta contable vacía), `ConciliacionBancaria` (única por cuenta
y mes), `MovimientoTesoreria.concepto` + `libre`/`transferencia` (documento solo obligatorio en neto/impuesto),
`CuentaTesoreria.saldoInicial` y `tocadoEn`.
T2 lógica (`utils/bancos.js`): signo por cuenta, saldo calculado del libro (sin saldos mutables), libro con saldo
acumulado, movimiento libre (US$ al TC SUNAT del día según la configuración, sin diferencia de cambio),
transferencia propia (misma moneda), conciliación (tránsito, diferencia, cierre con diferencia 0, reapertura de la
última). Ruling: el bloqueo por conciliación es por fecha (< fin del último mes cerrado), no solo por marca: un
movimiento no marcado de un mes cerrado también cambiaría el saldo de libros de ese cierre.
Ruling: registrar/anular y cerrar escriben `CuentaTesoreria.tocadoEn` para chocar en la transacción.
T3 rutas `/api/bancos` + bloqueo en pagos/cobros de facturas (`utils/movimientos.js`). Conciliación con bloqueo de
edición (abrir = editar).
T4 frontend: pestañas Bancos (saldos, libro, movimiento sin documento, transferencia) y Conciliación; Configuración
con saldo inicial y tipos de movimiento; Movimientos muestra los sin documento.
T5 verificación: backend 291 tests (290 ok, 1 omitido a propósito); frontend 79, lint de tocados y build OK;
Playwright: saldo inicial (jefatura) → comisión y transferencia (tesorero) → libro → conciliación cuadrada con la
transferencia en tránsito → cierre → movimiento en mes conciliado rechazado.
Final (revisión independiente): 0 Critical; 4 Important corregidos con test: (1) libro desde la fecha del saldo
inicial lo perdía, (2) diferencia de cambio de cierre ignoraba el saldo inicial en US$, (3) se podía conciliar y
cerrar un mes futuro y bloquear la cuenta, (4) el modal no ofrecía cuentas de detracciones para movimientos libres.
Minor corregidos: guardado de conciliación atómico (no pisa una cerrada), una sola abierta por cuenta, saldo inicial y
extracto con tipo estricto, aperturas simultáneas, libro sin mezclar respuestas viejas, cuenta contable rechazada
vuelve a su valor, cuenta contable opcional en el modal. Minor diferido: descripción de pagos de facturas en el libro
sin número de comprobante ni tercero.
