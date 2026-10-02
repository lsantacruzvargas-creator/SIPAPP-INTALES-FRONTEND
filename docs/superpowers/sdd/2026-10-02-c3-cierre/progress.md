# Ledger — C3 cierre de mes y reportes de control

Spec: `docs/superpowers/specs/2026-10-02-c3-cierre-reportes-design.md`. Rama: `claude/affectionate-ride-1ql646`.

T1 bloqueo: `exigirAbierto` en registrar/anular movimiento, movimiento libre, transferencia, gasto de caja chica,
registrar/anular comprobante de compra y emisión de CPE. Ruling: el bloqueo es por fecha del documento (emisión o
movimiento), la misma que usa el asiento.
T2 cierre (`src/utils/cierreContable.js`): verificación con `construirPeriodo` y los asientos del mes; cierre en
transacción con chequeo de `tocadoEn`; reapertura con motivo. Ruling: solo el tesorero (decisión vigente).
T3 reportes (`/api/contabilidad/reportes`): diario, mayor y balance por agregación sobre las líneas.
T4 frontend: pestañas Cierre de mes y Reportes.
T5 verificación: backend 340 tests (339 ok, 1 omitido), `test/cierreContable.test.js` (11); frontend 83, lint y build
OK; Playwright: verificación con faltas → asignar, generar, contabilizar, exportar → balance y mayor → el tesorero
cierra → un movimiento del mes da 409 → reabrir con motivo.
Final (revisión independiente): 1 Critical corregido con test: se podía cerrar con asientos exportados de documentos
anulados sin regenerar. 6 Important corregidos: (1) carrera cierre/escritura → cierre en dos fases con estado
`cerrando`, (2) CPE en ERROR/rechazo falso fuera del mes, (3) falsos positivos por configuración (pendientes ya
contabilizados; huella con la cuenta por defecto), (4) cierre del mes en curso o futuro, (5) cambios sin bloqueo
(NC de compra que reajusta la detracción del origen, factura interna y su vínculo con el CPE), (6) generación que
seguía escribiendo durante el cierre. Minor corregidos: correlativo perdido en NC/ND, resolver y asignar cuenta en
mes cerrado, saldo anterior de cuentas de resultado por ejercicio, índice {estado, periodo}, conteo previo del
Diario, filas en cero del Mayor, reapertura limpia el cierre, UI (botón con la verificación de otro mes, no verificar
meses cerrados, Diario limitado a 1500 asientos en pantalla).
