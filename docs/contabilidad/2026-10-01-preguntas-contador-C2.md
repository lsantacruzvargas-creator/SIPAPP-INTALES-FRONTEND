# Preguntas al contador para continuar con C2 (asientos automáticos)

**Fecha:** 2026-10-01 · **Contexto:** INTALES **no** será la contabilidad oficial: generará los asientos de compras,
ventas, cobros y pagos y los **exportará al software del contador** para importarlos (decisión del usuario,
2026-10-01). Por eso lo primero es saber exactamente qué software y qué plantilla usa.

Respuestas: anotarlas aquí mismo (debajo de cada pregunta) o en un archivo aparte, y adjuntar los ejemplos que se piden.

## A. Software y plantilla de importación (sin esto no se puede diseñar la exportación)

1. ¿Qué software usa: **CONCAR SQL**, CONCAR CB, **StarSoft** (Contabilidad / Gold) u otro? ¿Qué versión?
2. Enviar la **plantilla de importación de asientos** que acepta su software (un Excel de ejemplo ya llenado con 2 o
   3 asientos reales: una compra, una venta y un pago). Necesitamos las columnas exactas, formatos de fecha y número,
   y si va un archivo por subdiario o uno solo.
3. Enviar su **plan de cuentas en Excel** (código y nombre). INTALES lo importa tal cual para que los códigos de los
   asientos coincidan con los suyos.
4. **Anexos / auxiliares**: ¿cómo codifica a proveedores y clientes (por RUC/DNI o con un código propio)? ¿Hay que
   exportar también el maestro de anexos? Lo mismo para **centros de costo**: ¿usa centros de costo? ¿Con qué códigos?
5. **Subdiarios y numeración**: ¿qué códigos de subdiario usa (p. ej. 11 compras, 05 ventas, 21/31 caja-bancos)?
   ¿El número de comprobante lo pone INTALES o su software al importar? ¿Se reinicia cada mes?
6. **Destinos (9x / 79)**: ¿su software los genera solo (configurados en la cuenta de gasto) o INTALES debe
   exportarlos dentro del asiento?
7. **Diferencia de cambio**: ¿la de cada cobro o pago debe venir en el asiento exportado (676/776), o su software la
   calcula? ¿Y el ajuste al cierre del mes?
8. **Correcciones**: si un documento ya exportado se corrige o se anula en INTALES, ¿prefiere reexportar el asiento
   (y él borra el anterior) o recibir un asiento de ajuste/reversión?
9. ¿Cada cuánto quiere recibir la exportación (por mes, por semana)? ¿Le sirve que INTALES no deje cerrar el mes
   hasta exportarlo?

## B. Cuentas contables de cada operación (las necesita el asiento automático)

10. **Cuenta de cada compra** (brecha B6, la más importante): hoy un comprobante de compra no dice si es gasto,
    existencia o activo fijo. ¿Basta con una cuenta por **tipo de artículo** (materiales → 602 / 6032 / 6033,
    servicios → 63x, activos → 33x) que se pueda cambiar en cada comprobante? Enviar la lista de cuentas de
    compras/gastos que usa.
11. **Costo de las OT**: ¿la compra va directo al costo de la OT (60x/63x con destino 92 por OT) o pasa por almacén
    (60 → 25 → 61 → 92)? ¿Cómo distribuye los costos indirectos (CIF)? ¿Usa 2151/2351/7151/6932 al cierre?
12. **Ventas**: ¿qué cuenta usa para cada tipo de venta de INTALES (servicios 70321, productos fabricados 70221,
    mercaderías 70121)? ¿Cómo distingue en una factura si es servicio o fabricación?
13. **Notas de crédito**: de compra, ¿rebaja la cuenta de compra (60x) o usa 7311? De venta, ¿usa 7411 o carga la
    misma 7032x?
14. **Cuentas de banco y caja**: los códigos de cada cuenta (BCP Soles, BCP Dólares, caja, etc.) en su plan.
    ¿La cuenta de detracciones del Banco de la Nación va en **1042 o en 107**?
15. **Detracción de compras no depositada**: ¿registra el IGV como crédito diferido (1673) hasta el depósito?
16. **Recibos por honorarios**: ¿provisiona en 424 por el total y registra la retención de 4.ª (40172) al pagar, o la
    registra al provisionar?
17. **Anticipos** a proveedores y de clientes (422 / 122): ¿se usan? ¿Cómo se aplican luego a la factura final?
18. **Movimientos de banco sin documento** (comisiones, ITF, pago de IGV/renta/AFP, préstamos, transferencias entre
    cuentas propias, caja chica): ¿qué cuentas usa? Hoy Tesorería no los registra (brecha B7).

## C. Criterios tributarios pendientes (ya preguntados antes, siguen sin respuesta)

19. TC de cobros y pagos en US$: ¿TC **compra** para cobros y **venta** para pagos (lo configurado hoy), o venta para
    todo?
20. El **RCE del SIRE**: los comprobantes en US$, ¿vienen con importes en dólares o en soles? (probar con un archivo
    real de la propuesta).
21. **Boletas y tickets** en el Registro de Compras: ¿se anotan? ¿Los tickets sin RUC se tratan como reparo?
22. **Retención del IGV 3 %** (si INTALES es agente): ¿se calcula al pagar y por pago (umbral S/ 700)? ¿Necesita el
    comprobante de retención (CRE) y el PDT 626 desde INTALES?
23. **Recibos de servicios públicos (14) en US$**: ¿TC de la fecha de emisión (como hoy) o de vencimiento?
24. **Pago a cuenta de renta**: ¿coeficiente o 1.5 %? (hoy configurable, 1.5 % por defecto).
25. **D. Leg. 1669** (plazos de anotación en el Registro de Compras): ¿ya aplica a INTALES?

## Ya decidido (no hace falta preguntar)

- INTALES exporta asientos al software del contador; no genera los libros del PLE como contabilidad oficial.
- NC/ND en dólares: TC del comprobante que modifican. Retención de 4.ª: se declara en el mes de pago.
- Retención IGV 3 %: no aplica a recibos de servicios públicos (14).
- Cuentas ya corregidas: ventas 70321/70221/70121, honorarios 424, materias primas 602, detracción de compras dentro
  de 4212, detracción de ventas a 1042 (a confirmar 1042 vs 107 en la pregunta 14).
