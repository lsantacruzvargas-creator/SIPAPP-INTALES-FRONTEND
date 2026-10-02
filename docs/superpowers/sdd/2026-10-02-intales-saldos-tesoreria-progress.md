# SDD ledger — plan: docs/superpowers/plans/2026-10-02-intales-saldos-tesoreria.md
Spec: memoria project_intales_movimientos_manuales.md + ESTADO-PROYECTO §5 (diseño aprobado 2026-10-01).
BASE backend: 886c9d1 (plan) sobre bc31672 · BASE frontend: d4a44f93 sobre 22a8db9e. Suite base: 264 tests (263 pass, 1 skip).
Pre-flight: T1→T2 (errorHttp extra → verificarSaldo usa extra.codigo) coincide.
Pre-flight: T2→T3/T4 (verificarSaldo({cuenta,monto,fecha,confirmarSobregiro,session})) coincide.
Pre-flight: T2→T4 (conceptoManual en el schema lo agrega T2 para los fixtures; T4 lo usa) — Ruling: el campo y el required condicional van en T2 — los fixtures de T2 lo necesitan — costo si está mal: ninguno (mismo commit lógico).
Pre-flight: T2→T5 (tipoCambioSaldoInicial/fechaSaldoInicial) coincide.
Pre-flight: T6→T7 (enviarConSobregiro(enviar, body, confirmar), textoCuenta, puedeMovimientoManual, CONCEPTOS_MANUALES) coincide.
Ruling: saldo inicial lo editan jefatura/admin (misma regla que crear/editar cuentas en Configuración), no el tesorero — el diseño solo fija roles para los movimientos manuales — costo si está mal: agregar tesorero a una lista.
Ruling: se agregan transferencias entre cuentas propias (misma moneda) — el diseño habla de saldo ± transferencias y la referencia de Micronegocios las incluye; sin ellas, depositar efectivo de caja al banco requiere dos manuales — costo si está mal: quitar una ruta y un botón.
Ruling: TC de manuales USD: ingreso al TC de cobros (compra por defecto), egreso al de pagos (venta), transferencia al compra — sigue la configuración vigente de cobros/pagos — costo si está mal: solo cambia el libros-soles informativo del cierre.
Task 1: complete (commits 886c9d1..d3e6b95, tests: node --test test/manejarErrores.test.js → ℹ duration_ms 2756.8204)
Task 2: complete (commits d3e6b95..67a14ac, tests: npm test → ℹ duration_ms 149706.152)
Task 3: Ruling: tests de Task 3 en test/saldoInsuficiente.test.js (no en saldosCuentas.test.js) — montan otras rutas y escenarios — costo si está mal: ninguno.
Task 3: Ruling: fixtures existentes con saldoInicial 100000 desde 2020-01-01 en cuentas PEN; en diferenciaCambio el helper de pagos USD manda confirmarSobregiro para no cambiar los esperados del cierre — costo si está mal: ninguno (solo tests).
Task 3: complete (commits 67a14ac..a783f9e, tests: npm test → ℹ duration_ms 116422.1082)
Task 4: Ruling: el test de egresos simultáneos pasa también sin el candado explícito (probado quitándolo): el contador MOV (siguienteCodigo) ya serializa las transacciones por WriteConflict — se mantiene el candado en la cuenta como defensa si cambia la numeración — costo si está mal: una escritura extra por egreso.
Task 4: Ruling: lógica en utils/movimientos.js con preparar* (validación + TC fuera de la transacción) y registrar* (dentro) — mismo motivo que el TC de los pagos USD (no consultar apiperu con documentos bloqueados) — costo si está mal: ninguno.
Task 4: complete (commits a783f9e..c1eba44, tests: npm test → ℹ duration_ms 118235.3448)
Task 5: complete (commits c1eba44..db20291, tests: npm test → ℹ duration_ms 114356.7328)
Task 6: complete (frontend commits d4a44f93..81340407, tests: npm test (frontend) → 77/77; eslint de los archivos tocados OK)
Task 7: complete (frontend commits 81340407..db4079f7, tests: npm test (frontend) → 77/77; eslint de archivos tocados OK; build OK)
Task 7: Ruling: saldos de cuentas como tarjetas arriba de la pestaña Movimientos (no pestaña nueva) y botones Ingreso/egreso y Transferencia ahí mismo — el libro y los saldos se leen juntos — costo si está mal: mover un bloque de JSX.
Task 8: complete (docs en ambos repos: HANDOFF-contabilidad con la nota de cuentas PCGE por concepto manual; ESTADO-PROYECTO §5)
Final review: opus — 0 Critical, 1 Important, 6 Minor.
Final: minor (deferred): manuales en soles con fecha futura se aceptan y suman ya al saldo mostrado (saldo sin `hasta`)
Final: minor (deferred): pago/egreso con fecha anterior al saldo inicial se mide contra 0 (regla aprobada) — el mensaje no dice que la fecha es anterior al saldo inicial
Final: minor (deferred): dos constantes CONCEPTOS_MANUALES (modelo con "transferencia", utils sin ella) — renombrar la local
Final: minor (deferred): leerSaldoInicial acepta "" como 0 y true como 1 (Number sin chequear tipo)
Final: minor (deferred): GET /cuentas-tesoreria hace una agregación y un exists por cuenta (N+1, aceptable con pocas cuentas)
Final: minor (deferred → resuelto en el cierre): el ledger citado en ESTADO-PROYECTO no estaba en docs/ — se copia a docs/superpowers/sdd/ al cerrar
Final: Ruling (declined to judge): anulación de pagos/cobros con documento por contador/facturación queda como estaba — comportamiento previo fuera del alcance — costo si está mal: el contador puede anular pagos (ya podía).
Final: Ruling (declined to judge): ingresos/egresos/transferencias manuales con la cuenta de detracciones permitidos — el diseño no restringe; el uso real (pagar impuestos con fondos BN, liberación de fondos) los necesita — costo si está mal: agregar una validación por tipo de cuenta.
Final: fixed I1 anular un ingreso/transferencia recibida dejaba caja en negativo — 'anular un ingreso ya gastado…' y 'anular una transferencia ya gastada…' RED→GREEN; backend 286/286 (+1 skip previo), frontend 77/77 + build — commits backend 3530646 · frontend e1591ea4
Fix commits: backend 3530646 · frontend e1591ea4. Pendiente: E2E en navegador (coordina el agente principal).
