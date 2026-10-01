# Ledger — Contabilidad C1 (base contable)

Spec: `docs/contabilidad/2026-10-01-c1-spec-implementacion.md`. Rama: `claude/affectionate-ride-1ql646` (ambos repos).

T1 roles: `tesorero`/`contador` ya existían en `main` (auditoría de seguridad). Nuevo `puedeContabilidad` (lectura
admin/jefatura/tesorero/contador) y `escribeContabilidad` (admin/contador); entidades de bloqueo `cuentaContable` y
`asiento` solo para quienes escriben. Ruling: el contador **sigue escribiendo en Tesorería** como en `main` (la
auditoría lo abrió así y el frontend ya muestra sus botones); el spec pedía solo lectura → preguntar al usuario.
T2 plan de cuentas: seed `src/data/pcge.js`. Ruling: sin acceso al PDF oficial del PCGE 2019 desde la nube, el seed
trae las cuentas de 2 dígitos y solo las subcuentas confirmadas en la guía contable (no se inventan códigos); el plan
completo lo importa el contador desde Excel (`POST /cuentas/importar`, idea tomada del ERP dominicano
System_ERP_Net_Win), lo que además alinea los códigos con su software. Hojas = de movimiento; 12/42 exigen tercero.
Ruling: destino por defecto 941/791 solo en 62–68 (60, 61 y 69 no se destinan). Naturaleza por elemento con
excepciones (19, 29, 36, 39, 79, 80–85, 89 acreedoras; 592, 74, 709, 87, 88 deudoras).
T3 periodos: `periodoDe` en hora Lima; `exigirAbierto` crea el periodo abierto (upsert en la transacción).
T4 asientos manuales: subdiarios manuales diario/apertura/ajuste/cierre; correlativo por periodo+subdiario con
`Counter` en la transacción; CUO `AAAAMM-SUBDIARIO-NNNNNN`. Ruling: en USD el servidor calcula S/ = ME × TC por línea
y, si el redondeo deja céntimos (≤ 0.01 por línea), los suma a la línea mayor del lado corto (práctica de
CONCAR); editar exige mismo periodo (para otro mes: anular y crear).
T5 frontend: página Contabilidad, `BuscadorCuenta`, `ModalCuenta`, `ModalAsiento`, `PanelAsientos`,
`PanelPlanCuentas` (import/export Excel), `utils/contabilidad.js` con tests.
T6 verificación: backend 278 tests (277 ok, 1 omitido a propósito); frontend 76 tests, lint de tocados y build OK;
Playwright con backend real (ver HANDOFF), incluida la edición de un asiento con bloqueo "abrir = editar".
Final (revisión independiente de la rama): 0 Critical; 7 Important corregidos con test: (1) carrera asiento ↔ crear
subcuenta (el asiento escribe  de sus cuentas para chocar en la transacción; test RED→GREEN), (2)
desactivar en transacción, (3) cuenta intermedia nace de agrupación y adopta a las hijas, (4) fecha AAAA-MM-DD real
entre 2000 y hoy + 1 año, (5) centro de costo (activo) y OT deben existir, (6) destino heredado o 941/791 en 62–68
y solo 9x/79, (7) modales con useBloqueoEdicion y PUT de cuenta con versión. Minor corregidos: banderas e importes
con tipo estricto, tercero (tabla 2, RUC 11/DNI 8) y largos de texto, asiento toca el periodo (para el cierre de C3),
subcuenta revisa también asientos anulados, destino activo y se puede quitar, subcuenta hereda exigeCentroCosto,
errores de red con aviso, TC SUNAT en solo lectura, exportación de todas las páginas, falla del seed sin tumbar el
servidor. Minor diferido:  no se valida contra la tabla 10 (se definirá con la plantilla del contador).
