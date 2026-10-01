# Investigación — Ampliar SIPAPP-INTALES a sistema contable con libros electrónicos (PLE)

**Fecha:** 2026-10-01 · **Estado:** investigación (no es un diseño aprobado) · **Pedido del usuario:** que el sistema
también sea contable, que entregue al contador la información necesaria y que se pueda exportar para presentarla en el PLE.

Este documento junta (1) lo que dice SUNAT, (2) cómo lo resuelven ERP peruanos (CONCAR, STARSOFT, SISCONT,
Contasis, Defontana) y (3) qué tiene hoy INTALES. Sirve de base para el spec; las decisiones abiertas están al final.

## 1. Marco oficial SUNAT

### Qué libros lleva cada contribuyente (rentas de 3.ª categoría)

Según el art. 65 de la Ley del Impuesto a la Renta y el art. 11 del D. Leg. 1269, citados en la R.S. 000257-2025/SUNAT:

| Ingresos brutos anuales | Libros mínimos |
|---|---|
| Hasta 300 UIT (régimen general o MYPE Tributario) | Registro de Ventas, Registro de Compras y **Libro Diario de formato simplificado** (5.2) |
| Más de 300 hasta 1700 UIT | Los que disponga la SUNAT (R.S. 234-2006 y modificatorias). **Confirmar con el contador** cuáles aplican a INTALES |
| Más de 1700 UIT | **Contabilidad completa** (lista a confirmar con el contador según la R.S. 234-2006): entre otros, Caja y Bancos (1.x), Inventarios y Balances (3.x), Diario (5.1) y Plan de cuentas (5.3), Mayor (6.1), Registro de Activos Fijos (7.x), Registro de Compras (8.x), Inventario Permanente (12.x/13.x) y Registro de Ventas (14.x) |

Los plazos máximos de atraso de Inventarios y Balances, Diario y Mayor están en el anexo 2 de la R.S. 234-2006/SUNAT,
que la R.S. 000257-2025 modificó (plazos vinculados al PDT 0625).

### Dónde se presenta cada libro

- **Registro de Compras y Registro de Ventas → SIRE** (RCE y RVIE). El sistema ya los lee y concilia (propuesta,
  formato real verificado: RCE 80 columnas con cabecera, RVIE 39 columnas sin cabecera). El cronograma 2026 sigue
  incorporando contribuyentes al SIRE (R.S. 0005-2026).
- **El resto de libros (Diario, Mayor, Caja y Bancos, Inventarios y Balances, Activos Fijos, Inventario permanente) → PLE**
  (Programa de Libros Electrónicos, versión vigente 5.2.0.7 según SUNAT). El PLE valida y envía archivos `.txt`.

### Formato de los archivos PLE

- Las estructuras están en el **Anexo 2 de la R.S. 286-2009/SUNAT** y sus modificatorias; los códigos que validan los
  campos ("Validar con parámetro tabla N"), en el **Anexo 3** (tablas: tipo de comprobante, tipo de documento de
  identidad, catálogo de existencias, unidad de medida, método de valuación, etc.).
- Cada archivo es un `.txt`: **una fila por registro o asiento, una columna por "Campo" del Anexo 2**, separados por `|`.
  El nombre del archivo también lo fija el Anexo 2 (prefijo `LE` + RUC + periodo + código del libro + indicadores),
  como los archivos SIRE que ya manejamos (`LE20612928551202609001404001OIM2.txt`).
- Campos comunes de las estructuras: periodo `AAAAMMDD`, CUO (código único de la operación, hasta 40 caracteres), número
  correlativo del asiento, y un campo final "estado de la operación" (`1` del periodo, `8` de un periodo anterior no
  anotado, `9` de un periodo anterior ya anotado). Ejemplo verificado: estructura 3.7 (Inventarios y Balances, cuentas 20/21).
- **Libro Diario 5.1** (información mínima, Formato 5.1): asientos de apertura, operaciones del mes, ajustes y cierre; por
  línea: correlativo del asiento o CUO, fecha, glosa, referencia (libro de origen según Tabla 8, correlativo, documento
  sustentatorio), **cuenta contable desagregada al máximo nivel usado** (y su denominación), Debe, Haber y totales.
  El plan de cuentas (5.3) se informa en enero, la primera vez que se genera el libro y cuando cambia.
- **Libro Mayor 6.1**: por cuenta (código y denominación según el plan de cuentas), fecha, operación, Debe/Haber.

### Pendiente de obtener

El **Anexo 2 consolidado** con los campos exactos de 1.1/1.2 (Caja y Bancos), 5.1/5.2/5.3 (Diario y plan de cuentas),
6.1 (Mayor) y 3.x (Inventarios y Balances). Las resoluciones descargadas (361-2015, 042-2018, 315-2018, 278-2019,
108-2020) solo traen las estructuras que modificaron (3.7, 7.1, 8.x, 12.1, 13.1, 14.x), y las páginas de orientación
de SUNAT que lo publican responden "Acceso denegado" desde este entorno. **Conseguirlo antes del spec de la exportación**
(ayuda del propio PLE, o PDF que facilite el contador).

## 2. Cómo lo hacen otros ERP peruanos

| Sistema | Cómo genera la contabilidad | Libros |
|---|---|---|
| **CONCAR (SQL/CB)** | Contabilidad "en línea": cada transacción genera su asiento. Carga asientos de **sistemas de terceros** (facturación, planillas) desde DBF/SQL o Excel por **subdiario** (compras, ventas, caja), sin doble digitación. Asientos automáticos de **diferencia de cambio** (FASB 52) al TC de cierre | TXT para PLE; ZIP de reemplazo SIRE (14.4) |
| **STARSOFT** | ERP con módulos (ventas, compras, caja y bancos, logística, activos) que **generan asientos**; en caja y bancos hay dos pasos: "generación/visualización de asientos" (se asignan cuentas a cada movimiento) y "transferencia a contabilidad". Hasta 99 **subdiarios**. **Destinos automáticos**, diferencia de cambio, depreciación. APIs para importar asientos de ventas, compras, cheques y honorarios | Todos los libros PLE en la última versión |
| **SISCONT** | Contable-financiero en doble moneda: tesorería, caja chica, créditos y cobranzas, centros de costo y presupuestos | PLE |
| **Contasis / Defontana / Siigo** | Integración ventas–compras–almacén–contabilidad con asientos automáticos; Defontana en la nube | PLE, formularios SUNAT |

**Patrón común (lo que habría que replicar):**

1. **Plan de cuentas** (PCGE) con niveles y cuentas de movimiento.
2. **Subdiarios** (compras, ventas, caja/bancos, diario, planillas, apertura/cierre) y **asiento/voucher** con
   correlativo por subdiario y periodo; el CUO identifica el asiento.
3. **Configuración contable**: qué cuenta usa cada tipo de operación (por tipo de comprobante, tipo de artículo,
   cuenta bancaria, impuesto: IGV 40111, detracciones, retenciones, renta 4.ª).
4. **Asientos automáticos desde los módulos** con un paso de revisión: ventas (12/40/70), compras (60 o 20/40/42 y
   **destino** 9x→79 o 6x), pagos y cobros (42/10, 10/12, detracciones en la cuenta del Banco de la Nación).
5. **Asientos manuales**: apertura, ajustes, provisiones, cierre.
6. **Procesos de cierre**: diferencia de cambio al TC de cierre, destinos, depreciación, **cierre de periodo** (bloquea
   cambios en un mes ya declarado).
7. **Reportes**: Diario, Mayor, balance de comprobación, estados financieros, y **exportación PLE**.

## 3. Qué tiene hoy INTALES (rama `main`, 2026-10-01)

| Ya existe | Sirve para |
|---|---|
| `FacturaProveedor` (compras con IGV, detracción/retención, centro de costo, OC) | Subdiario de compras y RCE |
| `Comprobante` (CPE emitidos, totales, receptor) | Subdiario de ventas y RVIE |
| `MovimientoTesoreria` + `CuentaTesoreria` (banco, caja, detracciones) | Caja y Bancos, subdiario de tesorería |
| `CentroCosto`, costos por OT (comprometido/consumido, Fase 1 de comprobantes-compra) | Destinos y costo de producción |
| `MovimientoAlmacen`, `Material` | Inventario permanente (12.x/13.x), a evaluar |
| `TipoCambio`, `TipoCambioDia` (TC SUNAT por fecha) | Diferencia de cambio, conversión de USD |
| SIRE: descarga, lectura y conciliación de RCE/RVIE | Registros de Compras y Ventas |

| Falta | Comentario |
|---|---|
| Plan de cuentas (5.3) | No existe ningún modelo contable |
| Configuración contable (cuentas por operación) | Es lo que permite asientos automáticos |
| Asientos y subdiarios con CUO y correlativo | Base del Diario y el Mayor |
| Periodos y cierre de mes | Para no alterar meses ya presentados |
| Planillas, activos fijos y depreciación | Si se quiere contabilidad completa (7.x, asientos de planilla) |
| Exportación PLE (`.txt` por estructura) | Depende del Anexo 2 consolidado |

## 4. Decisiones abiertas (para el usuario y el contador)

1. **Qué libros**: según los ingresos de INTALES (¿hasta 1700 UIT o más?), ¿qué libros debe llevar? Sugerencia: empezar
   por Diario 5.1 + Plan de cuentas 5.3 + Mayor 6.1 + Caja y Bancos 1.1/1.2.
2. **Plan de cuentas**: ¿el contador tiene uno (PCGE con su desagregación) para importarlo?
3. **Quién genera los asientos**: automáticos desde compras, ventas y tesorería con revisión (como STARSOFT), o
   exportar los asientos para que el contador los cargue en su sistema (como la importación de CONCAR).
4. **Destinos**: ¿el contador usa clase 9 (9x→79) o costea en 6x/2x?
5. **Planillas y activos fijos**: ¿dentro del alcance o fuera?
6. **Cierre de periodo**: quién cierra y si se permite reabrir.

## Fuentes

Oficiales (SUNAT):
- R.S. 000257-2025/SUNAT (obligación por ingresos y plazos de atraso): https://www.sunat.gob.pe/legislacion/superin/2025/000257-2025.pdf
- Formato 5.1 Libro Diario: http://contenido.app.sunat.gob.pe/insc/Libros+y+Registros/Informacion+m%C3%ADnimo+formatos/FORMATO_5_1.pdf
- Formato 6.1 Libro Mayor: http://contenido.app.sunat.gob.pe/insc/Libros+y+Registros/Informacion+m%C3%ADnimo+formatos/FORMATO_6_1_LIBRO_MAYOR.pdf
- Anexo 2 (modificaciones): R.S. 361-2015 https://www.sunat.gob.pe/legislacion/superin/2015/anexo2-361-2015.pdf ·
  R.S. 042-2018 https://www.sunat.gob.pe/legislacion/superin/2018/anexo-042-2018.pdf ·
  R.S. 315-2018 https://www.sunat.gob.pe/legislacion/superin/2018/anexoI-315-2018.pdf ·
  R.S. 278-2019 https://www.sunat.gob.pe/legislacion/superin/2019/anexos-278-2019.pdf ·
  R.S. 108-2020 https://www.sunat.gob.pe/legislacion/superin/2020/anexos-108-2020.pdf
- R.S. 379-2013/SUNAT (SLE-PLE): https://www.sunat.gob.pe/legislacion/superin/2013/379-2013.pdf
- PLE: https://emprender.sunat.gob.pe/comprobantes-libros/registros-libros-electronicos/programa-libros-electronicos-ple
- Preguntas frecuentes de libros electrónicos: https://orientacion.sunat.gob.pe/preguntas-frecuentes-libros-y-registros
- Cronograma SIRE 2026 (R.S. 0005-2026): https://cpe.sunat.gob.pe/sites/default/files/inline-files/RSNATI%200005-2026.pdf

ERP (descripciones públicas, vistas por buscador; los sitios no se pudieron abrir desde este entorno):
- CONCAR SQL: https://realsystems.com.pe/concar/concar-sql/ · importación de asientos: http://interfacescontablesvbaexcel.blogspot.com/2012/09/base-para-importar-de-excel-concar.html
- STARSOFT contabilidad: https://www.starsoft.com.pe/prod_contabilidad.html · manual: https://www.starsoftservicios.com/soporte/pdf/Contabilidad.pdf · APIs: https://starsoftweb.com/apisintegracion/Help
- SISCONT: https://www.siscont.com/ · Defontana: https://www.defontana.com/pe
