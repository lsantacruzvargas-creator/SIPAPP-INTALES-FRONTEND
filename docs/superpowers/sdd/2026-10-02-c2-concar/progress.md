# Ledger — C2 asientos automáticos y exportación a CONCAR

Spec: `docs/superpowers/specs/2026-10-02-c2-asientos-concar-design.md`. Rama: `claude/affectionate-ride-1ql646`
(ambos repos). Decisión del usuario (2026-10-02): «hagámoslo con exportación para CONCAR y PCGE 2019».

T1 modelos: `ConfiguracionContable` (una; cuentas por rol con semilla PCGE 2019, subdiarios y datos CONCAR),
`ExportacionContable` (lote con sus filas), `Asiento` con `huella`, `origenCambiado/origenAnulado`,
`subdiarioExport`, `tasaIgv`, `exportacion`, línea con `rol`, `referencia`, `detraccion`; `numero` nulo en borrador
(índice único parcial). Cuenta contable en `CuentaTesoreria`, `FacturaProveedor` y `Comprobante`; código contable en
`CentroCosto`. Ruling: `obtener()` no toca la configuración al leer (su `updatedAt` es la versión del PUT).
T2 generador (`src/utils/asientosAutomaticos.js`): reglas de compras y ventas de contaperu (MIT), tesorería propias.
Ruling: nada se inventa — falta una cuenta → pendiente con motivo. Ruling: borrador → contabilizado (correlativo y
CUO al contabilizar, sin saltos) → exportado; lo contabilizado no se reescribe, se marca. Ruling: anular un
automático contabilizado suelta su documento (`anulacion.origenId`) para regenerarlo; un borrador no se anula; un
exportado tampoco (se corrige con ajuste).
T3 exportación (`src/utils/concar.js`, `/api/contabilidad/exportaciones`): 41 columnas, número `MMNNNN` por
subdiario continuo dentro del mes, inicial configurable, sin colisiones; solo automáticos contabilizados; no exporta
si hay documentos cambiados o anulados sin resolver. Ruling: caja-bancos en US$ con flag `N` e importes en US$ y S/
explícitos (por validar con la primera importación).
T4 frontend: pestañas Automáticos (pendientes con asignar cuenta, generar, borradores, contabilizar, observados),
Exportar CONCAR (Excel con exceljs: 3 filas de cabecera, fechas, códigos como texto; volver a descargar), Configuración.
T5 verificación: backend 328 tests (327 ok, 1 omitido a propósito), `test/asientosAutomaticos.test.js` (26);
frontend 83, lint de tocados y build OK; Playwright: configurar banco y centro → pendiente → asignar cuenta →
generar → contabilizar → exportar y leer el .xlsx (filas 11/21, anexo, centro, sigla, tasa) → sin «Anular» en lo
exportado; tesorero genera pero no exporta; jefatura solo ve.
Final (revisión independiente): 1 Critical corregido: el ajuste de un asiento ya exportado no llegaba a CONCAR →
se exportan los manuales (subdiario de diario) y se puede dar por resuelta la observación. 6 Important corregidos
con test: (1) impuestos de documentos en US$ a la cuenta en soles, (2) cambios de configuración marcaban todo lo
contabilizado (dos huellas), (3) cuentas sin validar al generar/contabilizar, (4) NC de venta sin fecha de
referencia, (5) panel limitado a 200 asientos (endpoint `estado` y contabilizar todo el mes), (6) TC de ventas
inestable y vista previa que consultaba apiperu. Minor corregidos: tasa AO válida, cobro con tipo y cliente del
CPE, número > 9999, contabilizar en lote sin cortar, ventas en proceso como pendientes, cuenta de NC de venta del
origen, asignar cuenta por clase y no sobre contabilizados, pantallas (Configuración no pierde ediciones, Exportar
avisa si falla solo la descarga). Minor diferidos: ver «Estado» del spec.
