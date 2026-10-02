# Bancos (brecha B7): movimientos sin documento, transferencias, saldos y conciliación — Diseño

**Fecha:** 2026-10-02 · **Origen:** brecha B7 de `docs/contabilidad/2026-10-01-casos-prueba-contables.md`;
diseño tomado del ERP C# (`TBANCOS_TRANS`, `TBANCOS_TRANS_TIPOS`, `TBANCOS_CONCILIACIONES`), ver
`docs/contabilidad/2026-10-01-referencias-erp-C2-C5.md`. Aprobado por el usuario ("sí", 2026-10-02) como paso
previo a C2 mientras responde el contador.

## Alcance

1. **Movimientos sin documento** en una cuenta de Tesorería: comisiones, ITF, intereses, pago de tributos,
   préstamos, aportes, otros. Ingreso o egreso, con un **tipo de movimiento** configurable, glosa, medio, número de
   operación, centro de costo opcional y cuenta contable opcional (la usará C2; si falta, la del tipo).
2. **Transferencias entre cuentas propias** (misma moneda; entre monedas distintas se registran dos movimientos).
3. **Saldo inicial** por cuenta (monto y fecha; en US$ con su TC) y **saldo por cuenta** calculado del libro
   (no se guardan saldos mutables).
4. **Libro de cada cuenta** (libro de bancos): movimientos de un rango con saldo acumulado y exportación a Excel.
5. **Conciliación bancaria mensual por cuenta**: saldo según extracto, marcar los movimientos que figuran en el
   extracto; los no marcados son el tránsito (ingresos y egresos). Se cierra solo con diferencia 0. Lo cerrado
   bloquea registrar o anular movimientos con fecha en ese mes o antes, en esa cuenta. Reabrir la última
   conciliación: jefatura o admin, con motivo.

Fuera de alcance: caja chica (fondo, vales, reposición), importar el extracto del banco (CSV), cheques
(chequera/correlativo) y asientos contables (C2).

## Reglas

- Signo por cuenta: ingreso suma; egreso resta; transferencia resta en `cuenta` y suma en `cuentaDestino`;
  retención y aplicación de NC no tienen cuenta.
- Saldo = saldo inicial + movimientos no anulados con fecha ≥ fecha del saldo inicial (los anteriores se consideran
  incluidos en el saldo inicial). Sin saldo inicial: 0 y todos los movimientos.
- Movimiento libre en US$: TC SUNAT del día (compra para ingresos, venta para egresos, según la configuración de
  Tesorería) para valorizar en S/; no genera diferencia de cambio.
- Conciliación de la cuenta C, mes P (fin = primer día del mes siguiente, hora Lima):
  - saldo libros = saldo de C a fin de P;
  - pendientes = movimientos de C con fecha < fin, no anulados, ≥ fecha del saldo inicial, y no marcados en una
    conciliación **cerrada** anterior;
  - saldo conciliado = saldo extracto + ingresos no marcados − egresos no marcados;
  - diferencia = saldo libros − saldo conciliado; cerrar exige |diferencia| < 0.005.
  - Las conciliaciones de una cuenta se cierran en orden (P > último mes cerrado); solo se reabre la última.
  - Comisiones o abonos del banco que no están en libros: se registran como movimiento sin documento y se marcan.
- Bloqueo: con una conciliación cerrada hasta el mes P, en esa cuenta no se registra ni anula ningún movimiento con
  fecha < fin de P (también los de facturas: pagos, cobros, detracciones), ni se cambia el saldo inicial. La
  transacción que registra un movimiento y la que cierra la conciliación escriben la misma cuenta (`tocadoEn`) para
  que no se crucen.
- Permisos: registrar movimientos y conciliar: roles de Tesorería. Tipos de movimiento, saldo inicial y reabrir una
  conciliación: jefatura y admin. La conciliación usa el bloqueo de edición (abrir = editar).

## Tipos de movimiento iniciales

Comisiones y gastos bancarios (egreso), ITF (egreso), Intereses ganados (ingreso), Intereses y gastos de préstamos
(egreso), Pago de tributos (egreso), Préstamo recibido (ingreso), Pago de préstamo (egreso), Aporte de capital
(ingreso), Otros ingresos (ingreso), Otros egresos (egreso). Sin cuenta contable por defecto (la define el contador,
pregunta B18).

## Estado

(Se completa al cerrar la rama.)
