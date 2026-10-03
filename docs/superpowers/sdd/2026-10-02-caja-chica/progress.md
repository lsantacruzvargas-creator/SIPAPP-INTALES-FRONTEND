# Ledger — Caja chica

Spec: `docs/superpowers/specs/2026-10-02-caja-chica-design.md`. Rama: `claude/affectionate-ride-1ql646` (ambos repos).

T1 modelo: la caja chica es una `CuentaTesoreria` de tipo caja en soles con `cajaChica {activa, responsable,
montoFondo, topeGasto}`; reutiliza saldo, libro y transferencias de Bancos B7. Ruling: apertura y reposición son
transferencias propias (no un movimiento especial), así el banco y la caja cuadran solos.
T2 gastos (`GastoCajaChica` + egreso `caja_chica`), rendición (`RendicionCajaChica`, marca `rendicion` en los
egresos con updateMany condicionado), reposición (transferencia banco → caja), arqueo (efectivo vs libro).
Ruling: una factura con crédito fiscal pagada con caja chica va por Comprobantes de compra con «Ya se pagó» desde la
caja (entra al SIRE y a la rendición); como gasto de caja se acepta sin crédito, con aviso.
T3 frontend: pestaña Caja chica (tarjetas de fondo/saldo/por rendir/por reponer/control, vistas Por rendir, Gastos,
Rendiciones con Excel, Arqueos), modal de gasto con validación en vivo, configuración en Configuración.
T4 verificación: backend 302 tests (301 ok, 1 omitido a propósito); frontend 81, lint de tocados y build OK;
Playwright completo.
Final (revisión independiente): 0 Critical; 6 Important corregidos con test: (1) dos rendiciones pendientes al
anular una reposición, (2) gasto con fecha anterior al saldo inicial desaparecía (regla extendida a toda Tesorería),
(3) movimientos libres, transferencias, anular aperturas y reponer desde una caja dejaban la caja en negativo,
(4) quitar la caja chica con saldo o rendición pendiente, (5) gastos en cuenta desactivada, (6) comprobante
duplicado. Minor corregidos: los egresos sin documento no se reponen, fechas futuras, saldo inicial bloqueado con
gastos, mensajes, lista blanca de tipo de documento y serie/número, concepto caja_chica en Bancos/Movimientos,
detalles de pantalla (caja quitada, error con lista vacía, «Anular» en gastos rendidos), quién y cuándo anuló.
Minor diferido: foto del comprobante; OT del gasto sin validar estado.
