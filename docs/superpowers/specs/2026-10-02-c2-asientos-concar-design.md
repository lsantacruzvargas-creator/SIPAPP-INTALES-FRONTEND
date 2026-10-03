# C2 — Asientos automáticos y exportación a CONCAR (PCGE 2019) — Diseño

**Fecha:** 2026-10-02 · **Decisión del usuario:** “hagámoslo con exportación para CONCAR y PCGE 2019”.
**Base:** diseño del motor (`docs/contabilidad/2026-10-01-motor-contable-design.md`), referencias
(`docs/contabilidad/2026-10-01-referencias-erp-C2-C5.md`; formato CONCAR y reglas portadas de **contaperu**, MIT,
© 2026 Global Procesos AI S.A.C.), guía contable y casos de prueba.

## Principios

- **Nada se inventa:** toda cuenta sale de la configuración contable, de la cuenta de Tesorería, del tipo de
  movimiento o del propio documento. Si falta, el documento queda **pendiente** con el motivo (“falta la cuenta de
  gasto”, “la cuenta BCP Soles no tiene cuenta contable”) y no se genera asiento.
- **Generación a pedido por periodo** (“Generar asientos del mes”), idempotente: crea o actualiza borradores,
  no toca lo contabilizado (si su origen cambió, lo marca), y quita los borradores cuyo origen se anuló.
- **Borrador → contabilizado → exportado.** El correlativo y el CUO se asignan al contabilizar (sin saltos). Un
  asiento exportado no se edita ni se descontabiliza.
- Los asientos automáticos se ven y filtran junto con los manuales (C1).

## Configuración contable (una por empresa; admin y contador)

Cuentas por rol (semilla PCGE 2019; el contador las cambia por sus divisionarias a 6 dígitos):
proveedores PEN/USD `4212`, honorarios PEN/USD `424`, clientes PEN/USD `1212`, IGV `40111`, retención 4.ª `40172`,
detracción de compras `4212` (lo detraído; puede ser una divisionaria), retenciones IGV sufridas *(vacía)*,
diferencia de cambio pérdida `676` / ganancia `776`, ventas: servicios `70321`, productos `70221`, mercaderías
`70121` (por defecto servicios); compras por defecto *(vacía: cada comprobante debe tener su cuenta)*.
Subdiarios CONCAR: compras `11`, compras con detracción `10`, boletas `13`, honorarios `15`, ventas `05`,
caja-bancos `21` y diario (asientos manuales) `35` *(por confirmar)*. Siglas T.G. 06: 01 FT, 02 RH, 03 BV, 07 NC, 08 ND, 12 TK, 14 RC; detracción
`DR`, área vacía, código T.G. 28 = código SUNAT + `01` (configurable). Monedas `MN`/`US`. Centro de costo en las
cuentas que empiezan con `62`, `63`, `65`. Destinos 9x/79: **apagado** (CONCAR suele generarlos; pregunta A6).

Además: cuenta contable de cada **cuenta de Tesorería** (10x) y **código contable** de cada centro de costo
(columna M de CONCAR). Cuenta de gasto por **comprobante de compra** y de ingreso por **comprobante de venta**
(sobrescribe la de la configuración), asignables desde la lista de pendientes.

## Asientos por origen (reglas de contaperu y de la guía, PCGE 2019)

| Origen | Subdiario | Asiento |
|---|---|---|
| Comprobante de compra 01/12/14 con crédito fiscal | 11 (10 con detracción) | D gasto base · D IGV · H proveedor total |
| Sin crédito fiscal (03, 12 sin RUC, sin IGV) | 13 (03) / 11 | D gasto total · H proveedor |
| Recibo por honorarios (02) | 15 | D gasto total · H retención 4.ª · H honorarios neto (retención al provisionar) |
| Detracción de compras | 10 | además D proveedor · H cuenta de detracción por lo detraído (S/ enteros) |
| NC (07) / ND (08) de compra | del origen | invierte / igual que una factura, con documento de referencia |
| Comprobante de venta aceptado 01/03/08 | 05 | D clientes total · H IGV · H ingreso base |
| NC de venta (07) | 05 | invierte |
| Pago neto a proveedor | caja-bancos | D proveedor (TC del documento) · H banco (TC del pago) · diferencia 676/776 |
| Pago de detracción / retención | caja-bancos | D cuenta de detracción (o proveedor) · H banco |
| Cobro neto de cliente | caja-bancos | D banco (TC del cobro) · H clientes (TC del documento) · diferencia 776/676 |
| Detracción cobrada en el BN / autodetracción | caja-bancos | D cuenta BN · H clientes |
| Retención sufrida (cliente agente) | caja-bancos | D retenciones sufridas · H clientes |
| Movimiento sin documento | caja-bancos | D/H cuenta del movimiento o de su tipo · H/D banco |
| Transferencia propia | caja-bancos | D cuenta destino · H cuenta origen |
| Gasto de caja chica | caja-bancos | D gasto (cuenta del gasto) · H cuenta de la caja |

En dólares el asiento se lleva en US$ y S/ por línea (`debeME/haberME` y `debe/haber`). Aplicaciones de NC entre
comprobantes del mismo proveedor no generan asiento (misma cuenta).

## Exportación CONCAR

Excel de 41 columnas (A…AO) con las tres filas de cabecera de la plantilla oficial (títulos, notas, formatos), hoja
`CONCAR`, un archivo por periodo con los subdiarios mezclados (formato validado en producción por contaperu). Se
exportan los asientos **contabilizados** del periodo (por defecto solo los no exportados). El número de comprobante
`MMNNNN` se asigna por subdiario al exportar, desde un número inicial por subdiario que se indica (para continuar la
numeración que ya tenga el contador). Cada exportación queda registrada (lote) y se puede volver a descargar igual.
Compras y ventas en US$: moneda `US`, TC en G, conversión `C`, flag `S` (como el validado). Caja-bancos en US$:
flag `N` con importes en dólares (P) y soles (Q) explícitos, porque cada línea tiene su TC **[validar con la primera
importación]**.

## Permisos

Generar y contabilizar: admin, contador, tesorero. Configuración, asignar cuentas y exportar: admin, contador.
Jefatura: lectura.

## Fuera de alcance de esta fase

Destinos 9x/79 (apagado, configurable después), costo de ventas, anticipos, retención IGV 3 % con CRE, IGV sin
crédito en columna AN, maestro de anexos (CONCAR exige que el RUC exista como anexo), StarSoft.

## Estado (2026-10-02)

Implementado en la rama `claude/affectionate-ride-1ql646` (ambos repos), sin merge a `main`. Backend:
`src/utils/asientosAutomaticos.js`, `src/utils/concar.js`, modelos `ConfiguracionContable` y `ExportacionContable`,
rutas `/api/contabilidad/automaticos` (pendientes, estado, generar, contabilizar por ids o todo el mes, asignar
cuenta, resolver), `/api/contabilidad/configuracion` y `/api/contabilidad/exportaciones`. Frontend: pestañas
Automáticos, Exportar CONCAR y Configuración en Contabilidad. Tests: `test/asientosAutomaticos.test.js` (26),
`src/utils/concar.test.js` (2); Playwright de punta a punta.

Reglas añadidas tras la revisión:
- Dos huellas: la del **documento** (si cambia, el contabilizado se marca) y la **completa** (con la configuración:
  solo actualiza borradores). Cambiar cuentas, subdiarios o siglas no marca lo contabilizado; quitar la cuenta de
  un banco deja el documento pendiente sin marcar su asiento.
- Las cuentas se validan al generar (pendiente con motivo) y al contabilizar (existen, activas, de movimiento, con
  tercero/centro si los exigen; `ultimoUso`). Contabilizar en lote informa los que fallan y sigue con los demás.
- Se exportan también los **asientos manuales** contabilizados (subdiario de diario): así el ajuste de un asiento ya
  exportado llega a CONCAR. Un observado se puede **dar por resuelto** (admin, contador).
- Detracción y retención de un documento en US$: asiento en US$ al TC del documento contra la cuenta de dólares.
- NC/ND de venta: fecha (columna AB), cuenta de ingreso y TC del comprobante que modifican. Cobros con el tipo,
  serie y cliente del comprobante SUNAT de la factura.
- Ventas en US$ sin TC de la factura: solo el TC SUNAT publicado de la fecha (no un respaldo); la vista previa no
  consulta apiperu. Comprobantes sin respuesta de SUNAT aparecen como pendientes.
- Tasa IGV (AO): 0, 10 o 18 (0 en compras sin crédito fiscal). Número CONCAR que pasaría de 9999: 400.
- Asignar cuenta: clases 2/3/6 en compras y 7 en ventas; no sobre un documento ya contabilizado.

Diferidos (validar en la primera importación o con el contador): detracción de compras en US$ con flag `S` puede
dejar 0.01 en la cuenta de detracción; medio de pago (Y) y anexo del banco en la 10x; IGV de facturas pagadas con
caja chica (el gasto no lo separa); la generación verifica el periodo abierto al inicio, no en cada escritura
(contabilizar sí lo exige).
