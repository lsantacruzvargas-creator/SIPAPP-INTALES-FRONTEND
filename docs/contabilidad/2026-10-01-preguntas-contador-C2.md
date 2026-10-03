# Preguntas al contador para continuar con C2 (asientos automáticos)

> **Reemplazado** por `Preguntas al contador.md` (2026-10-02), que junta estas preguntas con las que surgieron al
> implementar C2 y C3. Se conserva como historial.

**Fecha:** 2026-10-01 · **Contexto:** INTALES **no** será la contabilidad oficial: generará los asientos de compras,
ventas, cobros y pagos y los **exportará al software del contador** para importarlos (decisión del usuario,
2026-10-01). Por eso lo primero es saber exactamente qué software y qué plantilla usa.

Respuestas: anotarlas aquí mismo (debajo de cada pregunta) o en un archivo aparte, y adjuntar los ejemplos que se piden.

> **Actualización 2026-10-02 (repo contaperu):** el formato de importación de **CONCAR** ya se conoce (Excel de 41
> columnas validado en producción, ver `2026-10-01-referencias-erp-C2-C5.md`) y hay defaults razonables para
> subdiarios, anexos, NC y detracción. Las preguntas marcadas *(default disponible)* se pueden dar por resueltas si el
> contador confirma el default; lo imprescindible es A0–A3 y B10–B12.

## A. Software y plantilla de importación (sin esto no se puede diseñar la exportación)

0. **¿Trabaja con el PCGE 2019 o ya con el PCGE 2026?** El 2026 cambia la clase 9 (91 operación, 92 inversión, 93
   financiamiento), elimina 73, 74 y 87 y renombra varias cuentas. ¿A cuántos dígitos tiene su plan (6 en CONCAR, 8
   en StarSoft)?

1. ¿Qué software usa: **CONCAR SQL**, CONCAR CB, **StarSoft** (Contabilidad / Gold) u otro? ¿Qué versión?
2. *(default disponible si es CONCAR: formato de 41 columnas de contaperu)* Enviar la **plantilla de importación de asientos** que acepta su software (un Excel de ejemplo ya llenado con 2 o
   3 asientos reales: una compra, una venta y un pago). Necesitamos las columnas exactas, formatos de fecha y número,
   y si va un archivo por subdiario o uno solo.
3. Enviar su **plan de cuentas en Excel** (código y nombre). INTALES lo importa tal cual para que los códigos de los
   asientos coincidan con los suyos.
4. **Anexos / auxiliares**: ¿cómo codifica a proveedores y clientes (por RUC/DNI o con un código propio)? ¿Hay que
   exportar también el maestro de anexos? Lo mismo para **centros de costo**: ¿usa centros de costo? ¿Con qué códigos?
5. *(default disponible: 11 compras, 10 compras con detracción, 13 boletas, 15 honorarios, 05 ventas; número `MMNNNN` por subdiario puesto por INTALES; falta el de caja-bancos)* **Subdiarios y numeración**: ¿qué códigos de subdiario usa (p. ej. 11 compras, 05 ventas, 21/31 caja-bancos)?
   ¿El número de comprobante lo pone INTALES o su software al importar? ¿Se reinicia cada mes?
6. **Destinos (9x / 79)**: ¿su software los genera solo (configurados en la cuenta de gasto) o INTALES debe
   exportarlos dentro del asiento?
7. **Diferencia de cambio**: ¿la de cada cobro o pago debe venir en el asiento exportado (676/776), o su software la
   calcula? ¿Y el ajuste al cierre del mes?
8. *(default disponible: no reexportar lo ya exportado — huella por comprobante — y corregir con asiento de reversión)* **Correcciones**: si un documento ya exportado se corrige o se anula en INTALES, ¿prefiere reexportar el asiento
   (y él borra el anterior) o recibir un asiento de ajuste/reversión?
9. *(default disponible: por mes)* ¿Cada cuánto quiere recibir la exportación (por mes, por semana)? ¿Le sirve que INTALES no deje cerrar el mes
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
13. *(default disponible: la NC invierte las mismas cuentas del comprobante)* **Notas de crédito**: de compra, ¿rebaja la cuenta de compra (60x) o usa 7311? De venta, ¿usa 7411 o carga la
    misma 7032x?
14. **Cuentas de banco y caja**: los códigos de cada cuenta (BCP Soles, BCP Dólares, caja, etc.) en su plan.
    ¿La cuenta de detracciones del Banco de la Nación va en **1042 o en 107**?
15. *(default disponible: sin 1673; IGV a 40111 y lo detraído en una divisionaria de la 4212)* **Detracción de compras no depositada**: ¿registra el IGV como crédito diferido (1673) hasta el depósito?
16. *(default de contaperu: retención en 40172 al provisionar, 424 por el neto; se declara en el mes de pago, como ya decidimos)* **Recibos por honorarios**: ¿provisiona en 424 por el total y registra la retención de 4.ª (40172) al pagar, o la
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
25. *(default disponible: aún no rige; plazo de 12 meses — contaperu, verificado 12-sep-2026)* **D. Leg. 1669** (plazos de anotación en el Registro de Compras): ¿ya aplica a INTALES?

## D. Alcance (surgieron al revisar otros ERP)

26. *(default disponible: uno por comprobante)* ¿Quiere los asientos **uno por comprobante** (con RUC, serie y número en cada línea) o **resumidos** por día/mes
    y subdiario?
27. ¿El **costo de ventas** (69 contra 21/23) lo calcula su software o debe venir de INTALES?
28. Como él lleva el Mayor, el cierre anual y los EEFF en su software: ¿necesita de INTALES algún reporte contable
    además de la exportación (Diario/Mayor de control, conciliación bancaria)?
29. Si no tiene un plan de cuentas propio en Excel: ¿le sirve partir de un PCGE completo (≈1 800 cuentas) y
    revisarlo?

## Ya decidido (no hace falta preguntar)

- INTALES exporta asientos al software del contador; no genera los libros del PLE como contabilidad oficial.
- NC/ND en dólares: TC del comprobante que modifican. Retención de 4.ª: se declara en el mes de pago.
- Retención IGV 3 %: no aplica a recibos de servicios públicos (14).
- Cuentas ya corregidas: ventas 70321/70221/70121, honorarios 424, materias primas 602, detracción de compras dentro
  de 4212, detracción de ventas a 1042 (a confirmar 1042 vs 107 en la pregunta 14).
