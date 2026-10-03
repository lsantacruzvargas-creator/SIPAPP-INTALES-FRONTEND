# C3 — Cierre de mes y reportes de control — Diseño

**Fecha:** 2026-10-02 · **Pedido:** «sí» a C3 (después de C2). **Alcance re-dimensionado** porque INTALES exporta al
software del contador (`docs/contabilidad/2026-10-01-referencias-erp-C2-C5.md`): el Mayor oficial, el cierre anual
y los EEFF los lleva CONCAR; aquí solo control y bloqueo del mes.

## Cierre de mes

- **Lo cierra y reabre el tesorero** (decisión del usuario 2026-10-01; ni admin ni contador).
- **Verificación** (cualquiera de Contabilidad la ve): no se cierra si hay documentos pendientes por falta de datos,
  documentos sin asiento generado o cambiados después de contabilizar, borradores, observados sin resolver,
  asientos descuadrados o contabilizados sin exportar (también los manuales).
- **Cerrado**: ninguna escritura con efecto contable entra con fecha del mes — comprobantes de compra (registrar y
  anular), pagos y cobros (registrar y anular, incluido «Ya se pagó»), movimientos de banco y transferencias,
  gastos de caja chica, emisión de CPE (factura, boleta, NC, ND), asientos manuales y generación/contabilización.
  Mensaje: «El periodo AAAAMM está cerrado en Contabilidad: pide al tesorero que lo reabra» (409).
- **Concurrencia (cierre en dos fases)**: el mes pasa primero a `cerrando` (esa escritura choca con las
  transacciones en curso, que llaman a `exigirAbierto` y escriben `tocadoEn`); desde ahí nada entra, se verifica, y
  pasa a `cerrado` o vuelve a `abierto`. Un `cerrando` de más de 15 minutos (caída) se puede retomar o reabrir.
- Solo se cierran **meses ya terminados** (la emisión de CPE es con fecha de hoy).
- **Reapertura** con motivo (queda en `reaperturas`). Lo ya exportado sigue bloqueado; lo nuevo se genera, exporta y
  se vuelve a cerrar.

## Reportes de control (asientos contabilizados)

- **Libro Diario** por rango de periodos y subdiario.
- Las cuentas de resultado (clases 6 a 9) arrancan cada ejercicio en cero en el saldo anterior.
- **Libro Mayor** por cuenta (prefijo), centro de costo y tercero: saldo anterior, movimientos con saldo acumulado y
  saldo final.
- **Balance de comprobación** por cuenta de movimiento o agrupado a 2, 3 o 4 dígitos: saldo anterior, sumas del
  rango, saldo deudor/acreedor.
- Todos exportan a Excel. Máximo 20 000 líneas por consulta.

## Fuera de alcance

Diferencia de cambio de cierre como asiento (pregunta A7 al contador; el reporte ya existe en Tesorería), cierre
anual, apertura y EEFF (C5, en suspenso), periodo de anotación distinto a la fecha de emisión (B10: hoy una factura
tardía de un mes cerrado exige reabrirlo).

## Estado (2026-10-02)

Implementado en la rama `claude/affectionate-ride-1ql646` (ambos repos), sin merge a `main`. Backend:
`src/utils/cierreContable.js`, rutas `/api/contabilidad/periodos` (verificación, cerrar, reabrir) y
`/api/contabilidad/reportes` (diario, mayor, balance); `exigirAbierto` en movimientos, bancos, caja chica,
comprobantes de compra, emisión de CPE, facturas internas y NC de compra. Frontend: pestañas Cierre de mes y
Reportes. Tests: `test/cierreContable.test.js` (11); Playwright de punta a punta.

Reglas añadidas tras la revisión:
- La verificación detecta asientos contabilizados de documentos anulados o movidos sin regenerar, y CPE sin
  respuesta definitiva de SUNAT (en proceso, error o rechazo por consulta fallida).
- No impiden cerrar: un pendiente por configuración cuyo asiento ya está contabilizado; cambiar la cuenta por
  defecto o la de un tipo de movimiento (la huella solo cuenta la cuenta dada en el documento).
- También quedan bloqueados en un mes cerrado: ligar una factura interna a su CPE, cambiar número o cliente de una
  factura con cobros del mes, reajustar la detracción de una factura por una NC, dar por resuelta una marca o
  asignar cuenta. La generación se detiene si el mes empieza a cerrarse. NC y ND no pierden correlativo.
- Reabrir guarda quién y cuándo cerró en la reapertura.

Diferidos: diferencia de cambio de cierre como asiento (A7); periodo de anotación (B10).
