# Guía contable de referencia — mediana empresa peruana (INTALES)

**Fecha:** 2026-10-01 · **Proyecto:** SIPAPP-INTALES · **Tipo:** guía de referencia (no es spec ni diseño aprobado)
**Para quién:** quien implemente el motor contable (Fases C1–C5) y quien valide INTALES contra CONCAR o StarSoft.
**Acompaña a:** `2026-10-01-casos-prueba-contables.md` (batería de casos y brechas) y a los documentos de
`Backend/docs/contabilidad/` (investigación, diseño del motor contable, spec C1, traspaso).

> Escrita desde la práctica de un contador público colegiado que lleva medianas empresas del régimen general
> (metalmecánica / servicios industriales) en CONCAR y StarSoft. Todo lo marcado **[Confirmar]** requiere el visto
> bueno del contador de INTALES antes de convertirse en regla del sistema. Las cuentas citadas se verificaron contra el
> texto oficial del **PCGE modificado 2019** (MEF / Consejo Normativo de Contabilidad).

---

## 1. Marco normativo mínimo

### 1.1 Qué libros lleva INTALES

Ingresos anuales declarados por el usuario: **entre 300 y 1700 UIT**, régimen general (R.S. 234-2006/SUNAT y
modificatorias; R.S. 000257-2025/SUNAT):

| Ingresos | Libros | Dónde se generan |
|---|---|---|
| > 300 hasta 500 UIT | Registro de Compras, Registro de Ventas, **Libro Diario (5.1)**, **Libro Mayor (6.1)** | RC y RV en **SIRE** (RCE / RVIE); Diario y Mayor en **PLE** |
| > 500 hasta 1700 UIT | Lo anterior + **Libro de Inventarios y Balances (3.x)** | PLE |
| > 1700 UIT | Contabilidad completa (Caja y Bancos 1.1/1.2, Activos fijos 7.x, Inventario permanente 12.x/13.x, etc.) | PLE |

- El **5.3 Detalle del plan contable utilizado** acompaña al Diario: obligatorio en enero, la primera vez que se genera
  el libro y cada vez que cambia el plan de cuentas (charla oficial PLE 4.0.2).
- **Caja y Bancos (1.1 efectivo / 1.2 cuenta corriente)** no es obligatorio en este rango, pero todo contador lo arma
  igual porque es la base de la conciliación bancaria y del análisis de la cuenta 10.
- Desde la incorporación al SIRE, el Registro de Compras y el de Ventas **ya no se presentan como 8.1 / 14.1 en PLE**:
  se generan en el SIRE a partir de la propuesta de SUNAT (RCE / RVIE), que se acepta, complementa o reemplaza.

### 1.2 Anotación en el Registro de Compras (D. Leg. 1669)

El D. Leg. 1669 (28/09/2024) modificó la Ley 29215: elimina el plazo general de 12 meses y fija tres plazos
(entra en vigencia con la resolución de SUNAT que lo reglamente) **[Confirmar vigencia y régimen transitorio]**:

| Comprobante | Se anota en |
|---|---|
| Electrónico (SEE) | El periodo de su emisión o del pago del impuesto; si no, se pierde el crédito fiscal |
| No electrónico (ticket de máquina registradora, recibo de servicios no electrónico) | Hasta los 2 meses siguientes |
| Operación sujeta al SPOT (detracción) | Hasta los 3 meses siguientes |

Consecuencia para el sistema: el **periodo de anotación** no siempre es el mes de emisión; el crédito fiscal se ejerce
en el periodo de anotación. Con detracción, el crédito fiscal se condiciona además al depósito oportuno; mientras no se
deposita, muchos contadores llevan el IGV a **1673 IGV por acreditar en compras** y lo pasan a 40111 al depositar.

### 1.3 Tipo de cambio

| Uso | TC | Fuente |
|---|---|---|
| Registro de compras y ventas en ME (IGV) | **Venta** de la fecha de emisión (nacimiento de la obligación) | Criterio SUNAT / Reglamento LIGV; StarSoft lo fija así para compras **y** ventas |
| Notas de crédito / débito en ME | El **del comprobante que modifican** | Oficio SUNAT 024-2000-K00000; StarSoft: "Tipo de cambio otra fecha = fecha del documento de origen" |
| Recibo de servicios públicos en ME | TC de la **fecha de vencimiento** | Práctica StarSoft (manual) **[Confirmar]** |
| Detracción de una operación en ME | Venta de la fecha en que nace la obligación del IGV o en que debió depositarse, la que ocurra primero; el depósito siempre en soles y sin decimales | Normas SPOT; Informe SUNAT 118-2016 (ND) |
| Retención del IGV (3 %) en ME | Venta de la **fecha de pago** | Régimen de retenciones |
| Saldos de cierre (activos y pasivos monetarios en ME) | **Activos: TC compra · Pasivos: TC venta** del cierre | Art. 61 LIR y art. 34 del Reglamento LIR; StarSoft ("Ajuste dif. cambio": activo = compra, pasivo = venta) |
| Cobros y pagos en ME | TC del día del cobro/pago **[Confirmar]**: práctica habitual compra para cobros (se extingue un activo) y venta para pagos (se extingue un pasivo); CONCAR deja elegir por voucher (M compra, V venta, C especial, F otra fecha) | |

La diferencia entre el TC histórico del documento y el TC del pago (o del cierre) es **diferencia de cambio**:
pérdida en **676 Diferencia de cambio**, ganancia en **776 Diferencia en cambio** (NIC 21; art. 61 LIR).

### 1.4 Tributos mensuales que la contabilidad debe cuadrar

| Declaración | Contenido | Cuenta |
|---|---|---|
| PDT 621 IGV – Renta | Débito fiscal (RVIE) − crédito fiscal (RCE) − percepciones − retenciones sufridas − saldo a favor; pago a cuenta de renta (coeficiente o 1.5 %) sobre ingresos netos | 40111, 40113, 40114, 40171 |
| PDT 626 Agentes de retención | Retenciones del 3 % practicadas a proveedores (si INTALES es agente) | 40114 (divisionaria "por pagar") |
| PLAME | Planilla (ESSALUD, ONP/AFP, 5.ª) y **retenciones de 4.ª del mes en que se pagaron** los recibos por honorarios | 4031, 4032, 417, 40172, 40173 |
| Detracciones | Depósito en la cuenta del proveedor en el Banco de la Nación (compras) / ingreso en la cuenta propia (ventas) | 4212 / 1042 |

---

## 2. Plan de cuentas: lo que usará INTALES (verificado contra el PCGE 2019)

El PCGE fija cuentas (2 dígitos), subcuentas (3) y divisionarias (4–5); la empresa puede desagregar más. El
**elemento 9 queda a criterio de cada entidad** (el PCGE no publica códigos 9xx): "Se deja a criterio de las entidades
el uso de las cuentas de este elemento".

| Código | Denominación oficial | Uso en INTALES |
|---|---|---|
| 101 | Caja | Caja chica / efectivo (crear divisionaria, p. ej. 1011) |
| 1041 | Cuentas corrientes operativas | Una divisionaria por `CuentaTesoreria` tipo banco (104101 BCP S/, 104102 BCP US$ …) |
| 1042 | Cuentas corrientes para fines específicos | **Cuenta de detracciones en el Banco de la Nación** (el PCGE menciona expresamente las "cuentas específicas para el pago de detracciones") |
| 107 | Fondos sujetos a restricción | Solo si el contador prefiere esta cuenta para la BN **[Confirmar]**; 1071 es "Fondos en garantía", no detracciones |
| 1212 | Emitidas en cartera | Facturas de venta por cobrar |
| 122 / 422 | Anticipos de clientes / a proveedores | Adelantos de OT (muy frecuente en metalmecánica) |
| 1673 | IGV por acreditar en compras | IGV con crédito diferido (detracción no depositada, comprobante a anotar en otro periodo) |
| 2151 / 2351 | Servicios terminados / Servicios en proceso | Costo de OT terminadas / en curso al cierre |
| 2111, 241x, 25x | Productos terminados, materias primas, materiales auxiliares/suministros/repuestos | Almacén (kardex) |
| 3331, 334–336 | PPE: maquinaria, transporte, muebles, equipos diversos | Activo fijo |
| 39524 | Depreciación acumulada – Maquinarias y equipos de explotación | Activo fijo |
| 40111 | IGV – Cuenta propia | Débito y crédito fiscal |
| 40113 | IGV – Régimen de percepciones | Percepciones sufridas |
| 40114 | IGV – Régimen de retenciones | Conviene dos divisionarias: **retenciones practicadas por pagar** (agente) y **retenciones sufridas** (cliente agente) |
| 40171 / 40172 / 40173 | Renta 3.ª / 4.ª / 5.ª categoría | Pago a cuenta / retención honorarios / planilla |
| 4031 / 4032 / 417 | ESSALUD / ONP / AFP | Planilla |
| 4111 | Sueldos y salarios por pagar | Planilla |
| 4212 | Emitidas (facturas, boletas y otros comprobantes por pagar) | Proveedores |
| 424 | Honorarios por pagar | Recibos por honorarios (el PCGE **no tiene divisionaria 4241**: si se usa, es propia de la empresa) |
| 6011 | Mercaderías | Reventa |
| 602 | Materias primas | Plancha, perfiles, tubos (sin divisionarias en el PCGE: crear 6021 propia si se quiere) |
| 6031 / 6032 / 6033 | Materiales auxiliares / Suministros / Repuestos | Consumibles, soldadura, repuestos |
| 609x | Costos vinculados con las compras (transporte 60911, 60921, 60931…) | Flete de compras |
| 6121 / 6131… | Variación de inventarios | Ingreso/salida de almacén (kardex) |
| 6211, 6271… | Remuneraciones, ESSALUD… | Planilla (asiento manual en INTALES) |
| 631x–639x | Servicios de terceros (6343 mantenimiento PPE, 636x servicios básicos, 638 contratistas, 6391 gastos bancarios) | Servicios |
| 641x / 645x | Tributos / multas e intereses tributarios | |
| 656 | Suministros (otros gastos de gestión) | Consumibles no almacenados |
| 6841 | Depreciación de PPE – costo | Depreciación |
| 676 / 776 | Diferencia de cambio (gasto / ingreso) | Diferencia de cambio |
| 6932 | Costo de ventas – Servicios – local | Costo de la OT vendida (ver nota) |
| 7012x | Mercaderías – venta local | Reventa |
| 7022x | Productos terminados – venta local | Venta de bienes fabricados |
| **7032x** | **Servicios – local** (70321 terceros, 70322 relacionadas) | **Ventas de servicios de INTALES** |
| 7151 | Variación de inventarios de servicios | Producción de servicios del periodo |
| 7311 | Descuentos, rebajas y bonificaciones obtenidos – terceros | NC de proveedor que no reduce el costo de un bien identificable |
| 791 | Cargas imputables a cuentas de costos y gastos | Contrapartida de los destinos |
| 9x | Libre (92 costo de producción por OT, 94 administración, 95 ventas, 97 financieros: **convención de mercado, no PCGE**) | Destinos |

**Cuidado con estos códigos** (aparecen en el diseño del motor contable y en el spec C1):

- **7041 no es "ventas de servicios"**: en el PCGE 2019 es *Subproductos* (704 Subproductos, desechos y desperdicios).
  Servicios = **703 Servicios terminados → 7032 Servicios – local → 70321 Terceros**.
- **7011 es "Mercaderías – venta de exportación"** en el PCGE 2019; la venta local es **7012** (70121 terceros).
- 424 y 602 no tienen divisionarias oficiales (4241, 6021 serían propias).
- El texto del PCGE 2019 intercambia por error las descripciones de 693 y 694; el catálogo dice
  **693 Servicios terminados (6932 local)** y 694 Subproductos. Usar el catálogo **[Confirmar]**.

---

## 3. Flujo contable mensual de una mediana empresa

| Momento | Qué se registra | Subdiario típico |
|---|---|---|
| Diario | Compras y gastos con comprobante (provisión) | Compras / Honorarios |
| Diario | Ventas (CPE emitidos, NC/ND) | Ventas |
| Diario | Cobros, pagos, depósitos de detracciones, transferencias, comisiones, ITF | Caja-Bancos (ingresos / egresos) |
| Diario | Ingresos y salidas de almacén (kardex) | Almacén / Diario |
| Días 1–5 del mes siguiente | Depósitos de detracción pendientes (5.º día hábil), cierre de caja chica, **conciliación bancaria**, extractos | Caja-Bancos |
| Antes del vencimiento (cronograma por último dígito del RUC) | Revisar y complementar la propuesta **SIRE** (RCE, RVIE), generar los registros; PDT 621, PDT 626 (si agente), PLAME | — |
| Cierre contable del mes | Planilla y provisiones (CTS, gratificaciones, vacaciones), depreciación, **diferencia de cambio** de saldos en ME, **destinos** 6x → 9x / 79, hoja de costos por OT (23/21 contra 71, costo de ventas 69), compensación de retenciones/percepciones con 40111, reclasificaciones (saldos deudores de 42, acreedores de 12) | Diario / Ajustes |
| Cierre contable del mes | Balance de comprobación cuadrado, análisis de cuentas (10, 12, 40, 42, 46), **bloqueo del mes** | — |
| Dentro del plazo máximo de atraso | Diario 5.1 (+5.3 en enero), Mayor 6.1 en PLE | — |
| Anual | Inventario físico, ajustes, impuesto a la renta y participaciones, asientos de cierre (clase 9 vs 79, resultados a 8x, 89 → 59), Inventarios y Balances 3.x, apertura del año siguiente | Cierre / Apertura |

---

## 4. Asientos tipo (cuentas PCGE 2019)

Montos ilustrativos; los casos de prueba numéricos están en el documento de casos.

### 4.1 Compras

**Factura con crédito fiscal (servicio o gasto):**

| Cuenta | Debe | Haber |
|---|---|---|
| 63xx Servicio (o 656, 60x) | base | |
| 40111 IGV – Cuenta propia | IGV | |
| 4212 Emitidas (anexo proveedor, doc. 01 serie-número) | | total |
| **Destino:** 9x (según centro de costo u OT) | base | |
| **Destino:** 791 Cargas imputables | | base |

**Factura de material que entra al almacén (PCGE con inventario):** compra D 602/603x + D 40111 / H 4212 →
ingreso al almacén D 241x/25x / H 612x/613x → salida a la OT D 612x/613x / H 241x/25x → **destino del consumo**
D 92 (OT) / H 791. Si el material se compra directamente para la OT (sin pasar por stock), el ingreso y la salida se
anulan entre sí y el efecto neto es: 60x en el debe, 92 (OT) en el debe y 791 en el haber. Muchos contadores
configuran en ese caso el destino directamente sobre la 60x **[Confirmar método]**.

**Boleta, ticket sin RUC (sin crédito fiscal):** el IGV forma parte del costo: D 6x por el **total** / H 4212.
El ticket que no identifica al adquirente (RUC y razón social) tampoco sustenta gasto para renta: se registra y se
adiciona en la DJ anual (reparo). La boleta solo sustenta gasto en los casos de ley (p. ej. emisores del Nuevo RUS
dentro del límite del 6 %) **[Confirmar]**.

**Recibo por honorarios:** D 632x/638/6329 (total) / H 424 (neto) / H 40172 (8 % si el recibo supera S/ 1,500 y el
emisor no presentó suspensión). La obligación de retener nace **al pagar**; la retención se declara en la PLAME del mes
de pago. Pago: D 424 / H 104x. Pago a SUNAT: D 40172 / H 104x.

**Nota de crédito del proveedor (07):** inversa de la compra, referida al comprobante de origen y a su TC.
D 4212 (doc. NC) / H 60x o 63x (devolución o rebaja de un bien o servicio identificable, NIC 2 par. 11) o H 7311
(descuento no identificable) / H 40111; y reversa del destino (D 791 / H 9x). La aplicación contra la factura se hace
en el mismo asiento (NC cargada al documento de la factura) o con un **canje** en el subdiario diario: D 4212 (factura)
/ H 4212 (NC). Si el proveedor devuelve el dinero: D 104x / H 4212 (NC).

**Nota de débito del proveedor (08):** igual que una factura (60x/63x + 40111 / 4212), con referencia al origen y a su TC.

### 4.2 Ventas

| Cuenta | Debe | Haber |
|---|---|---|
| 1212 Emitidas en cartera (anexo cliente, doc. 01) | total | |
| 40111 IGV – Cuenta propia | | IGV |
| 70321 Servicios – local – terceros (o 70221 / 70121) | | base |

NC de venta: D 709x (devoluciones) o D 7032x/7022x (rebaja) + D 40111 / H 1212, con referencia al comprobante.
ND de venta: igual que una factura. Una NC **parcial** no anula el comprobante de origen: solo rebaja su saldo.

### 4.3 Caja y Bancos

| Operación | Debe | Haber |
|---|---|---|
| Pago a proveedor | 4212 / 424 | 104101 |
| Depósito de la detracción de una compra (al BN **del proveedor**, con fondos propios) | 4212 | 104101 (cuenta operativa) |
| Cobro de cliente | 104101 | 1212 |
| Cliente deposita la detracción en nuestra cuenta BN | 1042 (BN detracciones) | 1212 |
| Cliente pagó todo: transferimos la detracción a la BN | 1042 | 104101 |
| Pago de IGV/renta con fondos de detracción | 40111 / 40171 | 1042 |
| Retención del 3 % practicada (INTALES agente) al pagar | 4212 (total) | 104101 (neto) + 40114-por pagar (3 %) |
| Retención sufrida (cliente agente) al cobrar | 104101 (neto) + 40114-sufridas (3 %) | 1212 (total) |
| Comisión bancaria / ITF | 6391 / 6412 (ITF) | 104x |
| Transferencia entre cuentas propias | 104 destino | 104 origen (o 103 en tránsito) |

Los fondos de la cuenta de detracciones de INTALES **solo pagan tributos de INTALES**; nunca se usan para depositar
la detracción de un proveedor.

### 4.4 Diferencia de cambio

- **En la cancelación** (cobro/pago): D 4212 por el importe histórico / H 104 al TC del pago / la diferencia a 676 o
  776. CONCAR lo hace en dos pasos: el voucher de pago convierte toda la operación al TC del voucher y el proceso
  "Regularización por diferencia de cambio" salda al cierre los documentos con saldo cero en ME y saldo distinto de
  cero en MN. StarSoft igual (regularización + ajuste).
- **Al cierre del mes** (FASB 52 / NIC 21): los documentos con saldo en ME de 12, 42, 10 (y 14, 16, 46 si aplica) se
  reexpresan al TC de cierre (activo compra, pasivo venta). Ganancia D cuenta / H 776; pérdida D 676 / H cuenta.

### 4.5 Planilla (asiento manual en INTALES)

D 6211 sueldos + D 6271 ESSALUD / H 4031 ESSALUD + H 4032 ONP o 417 AFP + H 40173 5.ª + H 4111 neto. Provisiones
mensuales: D 6214 / H 4114 (gratificación), D 6215 / H 4115 (vacaciones), D 6291 / H 4151 (CTS). Destino por área y
por horas a OT (D 92 OT / 92 indirectos / 94 / 95 — H 791).

### 4.6 Activo fijo (asiento manual en INTALES)

Compra: D 3331 (u otra 33x) + D 40111 / H **4654 Pasivos por compra de activo inmovilizado – PPE** (el PCGE separa
estas deudas de la 42; muchos contadores igual usan 4212 **[Confirmar]**). Depreciación
mensual: D 6841 / H 39524; destino D 92 (indirectos de producción) o 94 / H 791.

### 4.7 Existencias y kardex

Con ingresos ≤ 1500 UIT no es obligatorio el inventario permanente valorizado (12.1/13.1), pero el costo de cada
OT exige valorizar las salidas de almacén (FIFO, promedio o identificación por lote). Asientos: ingreso D 2x / H 61x;
salida a OT D 61x / H 2x; destino D 92 / H 791. Ajustes de inventario físico: faltantes D 659x o 695x / H 2x.

### 4.8 Costos de producción por OT y costo de ventas

1. Durante el mes, los gastos por naturaleza (60/61, 62, 63, 65, 68) se destinan a **92 por OT** (directos) o a
   **92 indirectos** (CIF), y los demás a 94/95/97.
2. Al cierre, los CIF se distribuyen a las OT (horas hombre, horas máquina o costo directo) **[Confirmar base]**.
3. Producción del mes: D 2151 (OT terminadas) + D 2351 (OT en proceso) / H 7151 Variación de inventarios de servicios.
4. OT vendida: D 6932 / H 2151.
5. Al cierre del periodo el PCGE transfiere 692/693/694 contra 71 (el estado por naturaleza muestra solo la
   variación), y en el cierre anual 791 se salda contra 9x.

### 4.9 IGV y renta del mes

Compensación de retenciones/percepciones sufridas: D 40111 / H 40114-sufridas o 40113. Pago: D 40111 + D 40171 /
H 104101 o 1042. Redondeo del tributo a soles enteros: la diferencia va a 659x / 759x.

### 4.10 Cierre anual (resumen)

1. Ajustes finales, diferencia de cambio, inventario físico, provisiones, depreciación, impuesto a la renta corriente
   (D 881 Impuesto a las ganancias – corriente / H 40171) y diferido, participaciones.
2. Saldar clase 9 contra 79 (D 791 / H 9x).
3. Trasladar los resultados por naturaleza a los saldos intermediarios (80–85), luego 88 y 89 (891 utilidad / 892
   pérdida) y finalmente a 59 Resultados acumulados (StarSoft trae una plantilla de **14 asientos de cierre** con
   operaciones "saldar" o "transferir a clase 8").
4. Asiento de cierre de cuentas de balance y **apertura** del año siguiente (por cuenta y, en las que llevan anexo,
   por documento pendiente).

---

## 5. Cómo lo registra CONCAR (SQL / CB)

### 5.1 Estructura

| Elemento | Cómo funciona |
|---|---|
| **Tablas generales** | Tabla 02 Subdiarios, tipos de documento, tipos de anexo, centros de costo, tabla de TC, **Tabla 58 parámetros del ajuste por diferencia de cambio (FASB 52)** |
| **Subdiarios** | Código de hasta 4 caracteres que "identifica el tipo de operación" (compras, ventas, honorarios, caja ingresos, caja egresos, diario, apertura, cierre…). Cada empresa los codifica; se enlazan al libro SUNAT (Tabla 8) para el PLE |
| **Comprobante contable (voucher)** | Número **MMNNNN**: 2 dígitos del mes contable + correlativo 0001–9999 **por subdiario y mes**. Cabecera: subdiario, número, fecha, moneda (**MN / US**), **tipo de conversión** (**M** compra, **V** venta, **C** especial, **F** TC de otra fecha), TC, glosa. Detalle: cuenta, anexo, centro de costo, D/H, importe original, importe en soles y en dólares, tipo/número/fecha de documento, vencimiento, documento de referencia (NC/ND), glosa de línea |
| **Plan de cuentas** | Por cuenta: tipo de anexo (cuenta corriente por documento), exige centro de costo, exige documento de referencia, **cuenta cargo/abono automático**, conciliación bancaria, ajuste por diferencia de cambio |
| **Anexos** | Auxiliares de las cuentas corrientes: tipo **0** bancos, **C** clientes, **P** proveedores, **T** personal, **H** honorarios, **V** varios. Código de hasta 18 caracteres (para clientes/proveedores, el RUC) |
| **Destinos** | Dos vías: (a) en el plan de cuentas, el **cargo y abono automático** de cada cuenta; (b) la **tabla de transferencia de la 6 a la 9 con abono a la 79** por centro de costo |
| **Diferencia de cambio** | "Regularización" (salda documentos con saldo cero en una moneda y no en la otra) y "Ajuste FASB 52" (reexpresa saldos en ME al TC de cierre, compra o venta según la Tabla 58, contra 676/776) |
| **Cierre** | Bloqueo de meses; **asiento de cierre** automático del ejercicio y **apertura automática** del siguiente |
| **Integración** | Importa asientos desde Excel/DBF/SQL por subdiario (ventas, compras, caja, planillas), sin doble digitación |

### 5.2 Comprobante de compra en CONCAR (ejemplo)

Subdiario Compras, número 090015, fecha 10/09/2026, moneda US, conversión V, TC 3.530, glosa
"F002-456 Rodamientos Import — repuestos OT-0002":

| Cuenta | Anexo | C. costo | D/H | Importe US$ | Importe S/ | Doc. |
|---|---|---|---|---|---|---|
| 6033 | — | PRD-OT0002 | D | 2,000.00 | 7,060.00 | FT F002-456 |
| 40111 | — | — | D | 360.00 | 1,270.80 | FT F002-456 |
| 4212 | P 20000000012 | — | H | 2,360.00 | 8,330.80 | FT F002-456 venc. 25/09 |
| 92xx (automático) | — | PRD-OT0002 | D | 2,000.00 | 7,060.00 | |
| 791 (automático) | — | — | H | 2,000.00 | 7,060.00 | |

### 5.3 Plantilla de importación (para no digitar dos veces)

La plantilla Excel habitual de CONCAR SQL lleva, por línea: subdiario, número de comprobante, fecha, código de moneda,
glosa principal, TC, tipo de conversión, flag de conversión de moneda, fecha de TC, cuenta, código de anexo, centro de
costo, D/H, importe original, importe en dólares, importe en soles, tipo/número/fecha de documento, fecha de
vencimiento, área, glosa de detalle, anexo auxiliar, medio de pago, tipo/número/fecha del documento de referencia,
base imponible e IGV del documento de referencia, datos de detracción/percepción (tipo de tasa, tasa, bases en S/ y
US$) e IGV sin derecho a crédito fiscal **[Confirmar columnas exactas con la versión de CONCAR del contador]**.
Si el contador externo sigue en CONCAR, esta exportación es la forma natural de "apoyar al contador" sin duplicar
digitación (ver brechas).

### 5.4 Reportes de CONCAR

Registro de Compras y de Ventas (y su archivo SIRE/PLE), Libro Caja y Bancos, Diario, Mayor, Balance de comprobación,
Estados financieros, análisis de cuentas por anexo y por documento (cuenta corriente, saldos pendientes, antigüedad),
centros de costo, conciliación bancaria, libros electrónicos (`.txt` PLE).

---

## 6. Cómo lo registra StarSoft (Contabilidad / Gold)

### 6.1 Estructura (manual oficial de StarSoft)

| Elemento | Cómo funciona |
|---|---|
| **Plan de cuentas** | Niveles configurables; por cuenta de balance: **tipo de anexo** (control de cuenta corriente por documento), **ajuste dif. de cambio** (vacío = MN; activo en ME con TC compra, pasivo en ME con TC venta), **cuenta monetaria** (para conversión a ME); por cuenta de resultados: **destino** (tabla "Detalle de cargo y abono automático" con porcentajes; si está vacía, pide la cuenta destino en cada línea), **centro de costo**, concepto de ingreso/gasto, partida de presupuesto, plan de cuentas exterior |
| **Subdiarios** | Hasta 99, código de 2 dígitos, nombre breve, **"subdiario de reapertura"**, **código SUNAT** (Tabla 8). En el manual: **03 Ventas, 04 Compras, 08 Banco Egresos** |
| **Anexos** | Hasta 99 tipos; código de anexo (RUC para clientes y proveedores) |
| **Comprobante de compra** | Subdiario 04; proveedor (anexo), documento (tipo, serie, número), fecha de documento, vencimiento, IGV y total (el sistema verifica el IGV), **conversión "TC venta de la fecha del documento"** salvo NC/ND (TC de la fecha del documento de origen) y recibos de servicios públicos (TC de la fecha de vencimiento), **destino del crédito fiscal** (tabla SUNAT); el detalle trae automáticamente la cuenta del proveedor y la del IGV, y el usuario agrega la contrapartida con anexo, documento, centro de costo y cuenta destino |
| **Comprobante de venta** | Subdiario 03; mismo esquema con el cliente |
| **Caja y Bancos** | Módulo que genera los vouchers (subdiario 08 Banco Egresos, etc.), "girado" (anexo) y conciliación bancaria (extracto, no registrados en libros, pendientes, cierre mensual) |

### 6.2 Procesos de cierre mensual de StarSoft

1. **Asientos de destino y transferencia de costos**: generar asientos automáticos (cuentas con tabla de cargo/abono),
   destinos directos (cuentas sin tabla), destino porcentual (tabla de transferencia de costos) y transferencias a los
   reportes de centros de costo. Luego mayoriza.
2. **Diferencia de cambio**: *regularización* (documentos con saldo cero en su moneda: genera un asiento en la otra
   moneda), *ajuste por diferencia de cambio* (documentos en ME con saldo: reexpresa al TC de cierre del mes) y
   *ajuste por conversión* (solo para EEFF en ME).
3. **Cierre / reapertura de mes**: bloquea o desbloquea registrar, modificar o eliminar comprobantes del mes.
4. **Mayorizar**: centraliza los subdiarios en el Mayor (en modo exclusivo).
5. **Cierre anual** (en diciembre): asiento de apertura del año siguiente (uno en MN y otro en ME, más el detalle por
   anexo y documento) y asientos de cierre del año según la tabla de 14 asientos (saldar / transferir a clase 8).
   Prerrequisitos: balance de comprobación cuadrado, diferencia de cambio procesada, anexos cuadrados con sus cuentas,
   impuesto a la renta y reservas registrados.

### 6.3 Reportes de StarSoft

Reportes de comprobantes, libros de contabilidad (Diario, Mayor, Caja y Bancos, Registros), análisis de cuentas,
reportes de costos, estados financieros y **EEFF por centro de costo**, información de anexos (movimientos y saldos por
anexo, cuenta y documento), conciliación bancaria y libros electrónicos.

---

## 7. Reportes y estados financieros que espera el contador

| Reporte | Contenido mínimo | Libro / formato |
|---|---|---|
| Libro Diario | Por asiento: correlativo o CUO, fecha, glosa, referencia (libro de origen Tabla 8, correlativo, documento), cuenta al máximo nivel usado y denominación, Debe, Haber, totales | 5.1 (+5.3 plan de cuentas) |
| Libro Mayor | Por cuenta: saldo inicial, fecha, operación, Debe, Haber, saldo | 6.1 |
| Caja y Bancos | Movimientos de efectivo (101) y de cada cuenta corriente (104) con medio de pago y número de operación | 1.1 / 1.2 |
| Balance de comprobación | Sumas del mayor, saldos, transferencias, columnas de inventario (balance) y de resultados por naturaleza y por función | Hoja de trabajo / 3.17 **[Confirmar columnas]** |
| Análisis de cuentas | 10 (conciliación bancaria), 12 y 42 por anexo y documento con antigüedad, 40 (tributos), 46, 14, 16 | 3.2, 3.3, 3.12, 3.13… |
| Estado de situación financiera | Elementos 1–5 agrupados (corriente / no corriente) | 3.1 |
| Estado de resultados por naturaleza | Ventas (70) + variación de producción (71) + producción inmovilizada (72) − consumos (60/61) − servicios (63) = valor agregado − personal (62) − tributos (64) = excedente bruto − otros gastos/ingresos de gestión − depreciación/provisiones (68) = resultado de explotación ± financieros (67/77) = resultado antes de impuestos (cuentas 80–85) | Interno / anexo |
| Estado de resultados por función | Ventas netas − costo de ventas (69) = utilidad bruta − gastos de administración (94) − gastos de ventas (95) ± otros ± financieros (97, 77) = resultado antes de impuestos | 3.20 / 3.24 **[Confirmar formato vigente]** |
| Conciliación bancaria | Saldo según banco vs. según libros, partidas en tránsito, cargos/abonos no registrados | Interno |
| Inventarios y Balances | Detalle anual de saldos (3.1 a 3.25: efectivo, cuentas por cobrar, existencias, activos, cuentas por pagar, capital, balance de comprobación, EEFF) | 3.x |

**PLE (formato `.txt`)**: una línea por registro, campos separados por `|`, nombre de archivo `LE` + RUC + periodo +
código del libro + indicadores. En el Diario cada línea lleva el **CUO** del asiento y un **correlativo de línea que
empieza con "A" (apertura), "M" (movimiento) o "C" (cierre)**; el Registro de Ventas/Compras referencia el CUO del
Diario. Campo final "estado de la operación": 1 del periodo, 8 / 9 de periodos anteriores. La estructura exacta de 5.1,
5.3, 6.1, 1.x y 3.x está en el **Anexo 2 de la R.S. 286-2009/SUNAT y modificatorias** (pendiente de conseguir completo,
ver traspaso del motor contable).

---

## 8. Lista de control del cierre mensual

1. Todos los comprobantes del mes registrados (compras, ventas, NC/ND), conciliados con la propuesta SIRE; los no
   electrónicos agregados al RCE.
2. Detracciones de compras depositadas (constancias) y detracciones de ventas recibidas en 1042.
3. Cobros y pagos del mes registrados; **conciliación bancaria** cuadrada por cada 104 y caja arqueada.
4. Planilla y provisiones laborales, depreciación, gastos pagados por adelantado (18x) devengados.
5. Kardex cerrado y valorizado; salidas a OT costeadas.
6. Diferencia de cambio de cierre (12, 42, 10 en ME) al TC SUNAT/SBS del último día (activo compra, pasivo venta).
7. Destinos 6x → 9x / 79 generados; Σ 9x del mes = Σ 791 del mes.
8. Hoja de costos por OT: CIF distribuidos, producción (2151/2351 vs 7151), costo de ventas de las OT facturadas.
9. Compensación de retenciones/percepciones; liquidación del IGV y del pago a cuenta de renta = PDT 621.
10. Análisis de 12 y 42 sin saldos contrarios a su naturaleza (si los hay, reclasificar a 16x/46x **[Confirmar]**).
11. Balance de comprobación cuadrado (Σ Debe = Σ Haber; activo = pasivo + patrimonio + resultado).
12. Cerrar el mes en el sistema; desde entonces nada con fecha de ese mes se crea, edita ni anula.

---

## 9. Correspondencia con INTALES (qué dato alimenta cada asiento)

| Asiento | Origen en INTALES | Estado hoy |
|---|---|---|
| Compra (01, 02, 03, 07, 08, 12, 14) | `FacturaProveedor` (`tipoComprobante`, `subtotal`, `igv`, `total`, `moneda`, `tipoCambio`, `creditoFiscal`, `impuesto`, `centroCosto`, `ordenTrabajo`, `documentoOrigen`) | Datos tributarios completos; **falta la cuenta de gasto** (concepto contable) en comprobantes sin OC y la base no gravada / otros tributos |
| Venta | `Factura` (interna) + `Comprobante` (CPE) | **Sin moneda ni TC en `Factura`**; NC de venta parcial anula el CPE completo |
| Pago / cobro / detracción / retención | `MovimientoTesoreria` | Guarda el TC **del documento**, no el del pago; no admite movimientos sin documento (tributos, comisiones, ITF, transferencias propias) |
| Aplicación de NC | `MovimientoTesoreria` tipo `aplicacion` | Equivale al canje; la fecha manual es "hoy" |
| Destinos | `centroCosto`, `ordenTrabajo` | Existe el dato; falta la tabla de destinos por cuenta (C2) |
| Costo de OT | `utils/costosOT.js` | Criterio de caja (pagado), no devengado; no incluye salidas de almacén |
| TC | `TipoCambioDia` (venta y compra por fecha) | Correcto para emisión; falta usarlo en pagos/cobros y cierre |
| Planilla, activo fijo | — | Fuera de alcance: asientos manuales (C1) |

---

## Fuentes

Oficiales:
- PCGE modificado 2019 (MEF – Consejo Normativo de Contabilidad): https://www.mef.gob.pe/contenidos/conta_publ/documentac/PCGE_2019.pdf
- SUNAT, Formato 5.1 Libro Diario (información mínima): http://contenido.app.sunat.gob.pe/insc/Libros+y+Registros/Informacion+m%C3%ADnimo+formatos/FORMATO_5_1.pdf
- SUNAT, charla "Nuevo Sistema de Libros Electrónicos (PLE 4.0.2)" (CUO, correlativo A/M/C, 5.3): http://contenido.app.sunat.gob.pe/insc/Libros+y+Registros+Electronicos/Charla+PLE+ver+4+0+2.pdf
- Anexo 2 de estructuras (modificaciones): https://www.sunat.gob.pe/legislacion/superin/2020/anexos-108-2020.pdf · https://www.sunat.gob.pe/legislacion/superin/2018/anexoI-315-2018.pdf
- PLE: https://emprender.sunat.gob.pe/comprobantes-libros/registros-libros-electronicos/programa-libros-electronicos-ple
- SUNAT, tipo de cambio para cierre (art. 34 Reglamento LIR): https://orientacion.sunat.gob.pe/renta-anual-2013-empresas
- SUNAT, Oficio 024-2000-K00000 (TC de la nota de crédito = TC del comprobante modificado): https://www.sunat.gob.pe/legislacion/oficios/2000/oficios/o0242000.htm
- SUNAT, cartilla de detracciones: https://orientacion.sunat.gob.pe/sites/default/files/inline-files/Cartilla_detracciones.pdf
- SUNAT, preguntas frecuentes del régimen de retenciones: https://orientacion.sunat.gob.pe/06-preguntas-frecuentes-regimen-de-retenciones
- Decreto Legislativo 1669: https://img.lpderecho.pe/wp-content/uploads/2024/09/Decreto-Legislativo-1669-LPDerecho.pdf

Software:
- StarSoft, manual electrónico del sistema de Contabilidad: https://starsoftservicios.com/soporte/pdf/Contabilidad.pdf
- CONCAR, manual (subdiarios, anexos, tipo de conversión, destinos, FASB 52, cierre): https://www.slideshare.net/slideshow/manual-concar-070514-81668610/81668610
- CONCAR, búsqueda sobre el formato de carga masiva: https://es.scribd.com/document/338059897/formato-carga-concar-masiva-asientos-version-SQL

Secundarias (doctrina y práctica, para contrastar):
- TC en operaciones del IGV: https://www.perucontable.com/tributaria/tipos-de-cambio-aplicable-en-operaciones-del-igv/
- TC de la detracción en ND (Informe 118-2016-SUNAT/5D0000): http://blog.pucp.edu.pe/blog/miguelcarrillo/2016/08/02/el-tipo-de-cambio-que-se-debera-utilizar-para-la-conversion-a-moneda-nacional-de-la-detraccion-de-una-nota-de-debito-que-modifica-una-factura-emitida-en-moneda-extranjera-sera-el-tipo-promedio-ponde/
- D. Leg. 1669 comentado: https://eef.com.pe/site/blog/anotaci%C3%B3n-en-el-registro-de-compras-y-ejercicio-del-cr%C3%A9dito-fiscal-comentarios-al-decreto-legislativo-n-1669 · https://www.grupocontable.pe/blog/tributario-6/decreto-legislativo-1669-elimina-plazo-de-12-meses-para-el-registro-de-comprobantes-2
- Retención IGV, umbral de S/ 700 por pago: https://bybconsultores.pe/impuesto-general-a-las-ventas/importe-exceptuado-retencion-igv-700/
- Retención de 4.ª categoría 2026 (S/ 1,500; suspensión): https://www.infobae.com/peru/2025/12/17/recibos-por-honorarios-2026-el-nuevo-monto-maximo-para-no-pagar-impuestos-con-la-uit-en-s-5500/
