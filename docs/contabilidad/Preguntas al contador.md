# Preguntas al contador

**Actualizado:** 2026-10-02 · **Para:** el contador que lleva la contabilidad de INTALES en CONCAR.

## Cómo usar este documento

INTALES ya genera los asientos de compras, ventas, cobros, pagos, bancos y caja chica, y los **exporta en el Excel
de importación de CONCAR** con el **PCGE 2019**. También cierra el mes cuando todo está exportado. Mientras usted no
responda, INTALES trabaja con los valores que se indican como **«Hoy INTALES hace»**; casi todos se cambian sin
programar, en **Contabilidad → Configuración**.

- Responda debajo de cada pregunta (basta «sí, así está bien» si el valor actual le sirve).
- Lo más urgente está en la **parte A**: se confirma con la **primera importación de prueba** en CONCAR.
- Si algo se puede responder con un archivo (plan de cuentas, una plantilla, un asiento de ejemplo), adjúntelo.

Este documento reemplaza a `2026-10-01-preguntas-contador-C2.md` y a la lista final de
`2026-10-01-casos-prueba-contables.md`.

---

## A. Importación en CONCAR (validar con la primera importación de prueba)

**A1. Subdiarios.** ¿Qué código de subdiario (T.G. 02) usa para cada tipo de asiento?
Hoy INTALES hace: compras **11**, compras con detracción **10**, boletas de compra **13**, recibos por honorarios
**15**, ventas **05**, caja y bancos **21**, asientos manuales (ajustes) **35**. Los de caja y bancos y diario son
supuestos nuestros.

**A2. Número de comprobante.** INTALES pone `MMNNNN` (mes + correlativo por subdiario, reinicia cada mes) y deja
indicar el número inicial de cada subdiario al exportar. ¿Le sirve así, o prefiere que lo ponga CONCAR al importar?

**A3. Anexos (columna L).** INTALES pone el RUC o DNI del proveedor o cliente. CONCAR exige que ese anexo ya exista en
su maestro de anexos. ¿Los crea usted a mano, o quiere que INTALES exporte también el maestro de anexos?

**A4. Centros de costo (columna M).** INTALES pone el código del centro de costo en las cuentas que empiezan con 62,
63 y 65. ¿Usa centros de costo en CONCAR? ¿En qué cuentas y con qué códigos (T.G. 05)? (Los códigos se cargan en
Contabilidad → Configuración.)

**A5. Moneda extranjera.**
- Compras y ventas en dólares: moneda `US`, tipo de cambio en la columna G, conversión `C` y flag `S` (como el
  formato validado por otro usuario de CONCAR). ¿Correcto?
- Caja y bancos en dólares: flag `N` con el importe en dólares (P) y en soles (Q) explícitos, porque cada línea tiene
  su propio tipo de cambio (el del pago y el del documento). **¿CONCAR lo acepta así?**
- Una detracción de una compra en dólares con flag `S` puede dejar S/ 0.01 de diferencia en la cuenta de detracción
  (CONCAR recalcula los soles). ¿Prefiere esas líneas con flag `N`?

**A6. Detracción en el asiento de compra.** Como el Excel validado: además del asiento normal, D proveedor / H cuenta
de detracción por lo detraído (en soles enteros), con documento `DR`, número de constancia `999999999` (pendiente al
provisionar), la factura como referencia, código T.G. 28 = código SUNAT + `01`, tasa y base. ¿Su CONCAR usa esos
códigos de la T.G. 28 y un código de área (columna V) para la detracción?

**A7. Medio de pago (columna Y).** INTALES no lo llena. ¿Sus cuentas de banco (104x) lo exigen? ¿Con qué códigos
(T.G. S1)?

**A8. Tasa de IGV (columna AO).** INTALES pone 18 (o 10) en compras y ventas con IGV y 0 en compras sin crédito
fiscal (boletas, recibos por honorarios, tickets sin RUC). ¿Correcto?

**A9. Siglas de documentos (T.G. 06).** 01 FT, 02 RH, 03 BV, 07 NC, 08 ND, 12 TK, 14 RC. ¿Son las de su CONCAR?

**A10. Destinos (clases 9 y 79).** INTALES **no** los genera (están apagados). ¿Los genera CONCAR solo, configurados en
la cuenta de gasto? Si no, se activan en Configuración.

**A11. Correcciones.** Lo ya exportado no se vuelve a exportar: si un documento exportado se corrige o se anula,
INTALES pide registrar un **asiento manual de ajuste** (que también se exporta, en el subdiario de diario). ¿Le sirve
así, o prefiere otra forma?

## B. Plan de cuentas y cuentas de cada operación

**B1. Plan de cuentas.** ¿Trabaja con el PCGE 2019 (lo que usa INTALES) o ya con el 2026? ¿A cuántos dígitos? Por
favor envíe su plan en Excel (código y nombre): INTALES lo importa tal cual para que los códigos coincidan.

**B2. Cuentas por rol.** Hoy INTALES usa (cámbielas por sus divisionarias a 6 dígitos):

| Rol | Cuenta |
|---|---|
| Proveedores (soles / dólares) | 4212 / 4212 |
| Honorarios por pagar | 424 |
| Clientes (soles / dólares) | 1212 / 1212 |
| IGV | 40111 |
| Retención de 4.ª categoría | 40172 |
| Detracción de compras (lo detraído) | 4212 |
| Retenciones de IGV sufridas | *(vacía: hay que indicarla)* |
| Diferencia de cambio pérdida / ganancia | 676 / 776 |
| Ventas de servicios / productos / mercaderías | 70321 / 70221 / 70121 (por defecto: servicios) |

**B3. Cuenta de cada compra.** Hoy cada comprobante de compra necesita su cuenta de gasto (se asigna desde la lista de
pendientes). ¿Le basta una cuenta por **tipo de artículo** (materiales 602/6032/6033, servicios 63x, activos 33x)?
Envíe la lista de cuentas de compras y gastos que usa.

**B4. Ventas.** ¿Cómo distingue si una factura es servicio (70321), producto fabricado (70221) o mercadería (70121)?

**B5. Notas de crédito.** Hoy la NC invierte las mismas cuentas del comprobante que modifica. De compra: ¿rebaja la
compra (60x) o usa 7311? De venta: ¿usa 7411 o carga la misma 7032x?

**B6. Bancos y cajas.** Indique la cuenta de cada cuenta bancaria y caja (BCP soles, BCP dólares, caja chica 102…).
¿La cuenta de detracciones del Banco de la Nación es **1042 o 107**?

**B7. Movimientos de banco sin documento.** ¿Qué cuentas usa para comisiones, ITF, pago de IGV, renta, AFP,
préstamos y transferencias entre cuentas propias? (Se cargan en el tipo de movimiento de Tesorería.)

**B8. Caja chica.** Un gasto de caja chica con factura va todo al gasto, sin separar el IGV. ¿Le sirve (las facturas
con crédito fiscal se registran por Comprobantes de compra) o necesita el IGV separado?

**B9. Anticipos** a proveedores y de clientes (422 / 122): ¿se usan? ¿Cómo se aplican a la factura final?

## C. Criterios contables

**C1. Diferencia de cambio en cobros y pagos.** Hoy va en el asiento del cobro o pago (676/776). ¿Correcto?

**C2. Diferencia de cambio al cierre del mes.** INTALES tiene el reporte (Tesorería) pero no genera el asiento. ¿Lo
calcula su software o quiere que INTALES lo genere?

**C3. Costo de las órdenes de trabajo.** ¿La compra va directo al costo de la OT (60x/63x con destino 92 por OT) o pasa
por almacén (60 → 25 → 61 → 92)? ¿Cómo reparte los costos indirectos (CIF)? ¿Usa 2151/2351/7151/6932 al cierre?

**C4. Costo de ventas** (69 contra 21/23): ¿lo calcula su software o debe venir de INTALES?

**C5. Detracción de compras no depositada.** Hoy el IGV va a 40111 y lo detraído a la cuenta de detracción. ¿Usa el
crédito fiscal diferido (1673) hasta el depósito?

**C6. Recibos por honorarios.** Hoy la retención de 4.ª se registra al provisionar (40172) y a 424 va el neto; se
declara en el mes de pago. ¿Correcto?

**C7. Uno por comprobante.** Hoy cada comprobante y cada movimiento es un asiento (con RUC, serie y número en cada
línea). ¿Le sirve, o los prefiere resumidos por día o mes?

## D. Criterios tributarios

**D1. Tipo de cambio de cobros y pagos en dólares:** hoy **compra** para cobros y **venta** para pagos. ¿O venta para
todo?

**D2. SIRE (RCE):** los comprobantes en dólares, ¿vienen con importes en dólares o en soles? (probar con un archivo
real de la propuesta).

**D3. Boletas y tickets** en el Registro de Compras: ¿se anotan? ¿Los tickets sin RUC se tratan como reparo?

**D4. Retención del IGV 3 %** (si INTALES es agente): ¿se calcula al pagar y por pago (umbral S/ 700)? ¿Necesita el
comprobante de retención (CRE) y el PDT 626 desde INTALES?

**D5. Recibos de servicios públicos (14) en dólares:** ¿tipo de cambio de la fecha de emisión (como hoy) o de
vencimiento?

**D6. Pago a cuenta de renta:** ¿coeficiente o 1.5 %? (hoy configurable, 1.5 % por defecto).

**D7. D. Leg. 1669** (plazo de anotación en el Registro de Compras): ¿ya aplica a INTALES?

## E. Cierre de mes y facturas tardías

**E1. Facturas que llegan tarde.** Hoy el asiento de una compra va con su **fecha de emisión**: si llega una factura
de un mes ya cerrado, el tesorero tiene que reabrir ese mes. ¿Prefiere anotarla en el mes en que llega (periodo de
anotación distinto, como permite SUNAT)?

**E2. Cierre.** INTALES cierra el mes cuando todo está generado, contabilizado y exportado; desde ahí no se registra
nada con fecha de ese mes. ¿Cada cuánto quiere recibir la exportación (mensual) y en qué fecha suele cerrar el mes?

**E3. Reportes.** INTALES tiene Diario, Mayor y Balance de comprobación **de control** (para cuadrar con lo
importado). ¿Necesita algún otro reporte desde INTALES (por ejemplo, conciliación bancaria)?

---

## Ya decidido (no hace falta responder)

- INTALES exporta asientos al software del contador (CONCAR, PCGE 2019); no lleva los libros oficiales ni el PLE.
- NC y ND en dólares: tipo de cambio del comprobante que modifican.
- Retención de 4.ª: se declara en el mes de pago.
- Retención IGV 3 %: no aplica a recibos de servicios públicos (14).
- Cuentas corregidas: ventas 70321/70221/70121, honorarios 424, materias primas 602, detracción de compras dentro de
  4212, detracción de ventas a 1042 (a confirmar 1042 o 107 en B6).
- El cierre anual, la apertura y los estados financieros los hace el contador en su software.
