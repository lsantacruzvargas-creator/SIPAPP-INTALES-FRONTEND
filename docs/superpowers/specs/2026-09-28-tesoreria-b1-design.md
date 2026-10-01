# Tesorería operativa (Spec B1) — Design Spec

**Contexto.** La Spec A (Compras) dejó las OC a proveedor (OCP) emitidas, pero sin factura del
proveedor, sin pagos y sin impuestos. Las facturas de venta tienen un manejo de cobro parcial
(`montoPagado`, cuotas, `detraccionPagada`) con una detracción fija "12 % si total ≥ 701". El usuario
pidió una Tesorería que registre facturas y pagos, calcule detracción/retención según quién deposita,
controle "impuesto pagado" y "neto pagado", liste todas las OCP con y sin factura, incluya el flete, y
concilie lo registrado contra el SIRE de SUNAT.

**Lugar en la iniciativa** (la antigua "Spec B" se redefinió el 2026-09-28 como un sistema contable de
**apoyo al contador externo**; él sigue con su software y el sistema genera y exporta):
- **B1 — Tesorería operativa (este spec).**
- B2 — Núcleo contable: PCGE editable, asientos debe/haber, contabilización automática de los
  documentos de B1, Libro Diario, Mayor, balance, destino por centro de costo (clase 9).
- B3 — Exportación: PLE 5.1 / 5.3 / 6.1 (TXT con nombre oficial) + Excel. Compras y Ventas no van por
  PLE sino por SIRE.
- C — Cierre de mes por centro de costo.

## Decisiones confirmadas con el usuario (2026-09-28)

1. Una OCP puede tener **varias facturas** del proveedor (entregas parciales).
2. **Agente de retención configurable**: interruptor en configuración, apagado por defecto.
3. **Registro de pagos**: cada pago/cobro es una fila con fecha, monto, medio y nº de operación;
   admite pagos parciales; los checks "impuesto pagado" y "neto pagado" se derivan.
4. **Flete en ambos casos**: dentro de la factura del mismo proveedor o como factura aparte de un
   transportista ligada a la OCP; se reparte al costo de las líneas de la OCP.
5. **Roles de Tesorería**: `facturacion`, `jefatura`, `admin`.
6. **Libro único de movimientos** (`MovimientoTesoreria`) para compras y ventas.
7. **Transacciones de MongoDB** en todo lo que toca dinero.
8. **SIRE sí entra en B1** como conciliación (propuesta SUNAT vs lo registrado), por **API vía el
   HUB** y por **carga manual** del archivo. Las credenciales SOL viven en el HUB (como en la GRE).
9. **Versión 0, no está en producción**: no hay datos reales que migrar.
10. **Despliegue on-premise** en el servidor del cliente con **MongoDB local** (hoy Atlas en pruebas).

## Integridad y entorno

- **Replica set de un nodo** (`replication.replSetName: rs0` en `mongod.cfg` + `rs.initiate()`)
  tanto en desarrollo como en el servidor del cliente. Sin replica set MongoDB no permite
  transacciones. No requiere una segunda máquina.
- **Respaldo recomendado** (documentar en la guía de instalación, no es código de este spec):
  `mongodump --oplog --gzip --archive` nocturno (Programador de tareas), copia en otro disco y fuera
  del servidor, retención 7 diarios / 4 semanales, prueba de restauración mensual. Réplica real
  (secundario + árbitro) si el cliente tiene otra máquina, sin cambios de código.
- **Transacciones** (`mongoose.startSession()` + `session.withTransaction`) en: registrar/anular
  factura de proveedor, registrar/anular movimiento, adjudicar y anular OCP cuando toquen saldos.
  Los recálculos de saldos corren dentro de la misma transacción.
- **Códigos nuevos con contador atómico** (`Counter`, patrón de `utils/numeroDocumento.js`):
  `FP-NNNN`, `MOV-NNNN`. Nuevo helper `siguienteCodigo(prefijo, session)`.
- Los tests del backend corren contra el mismo `mongod` local, por lo que también necesitan el
  replica set.

## Modelo de datos — Backend

### `CuentaTesoreria` (nuevo)
`nombre` (ej. "BCP Soles 191-…"), `tipo`: `banco | caja | detracciones`, `moneda`: `PEN | USD`,
`activo`. B2 la mapeará a la cuenta 10x. Semilla: "Caja", "BCP Soles", "BCP Dólares",
"Banco de la Nación – Detracciones", "Sin especificar".

### `Configuracion` (nuevo, documento único)
`esAgenteRetencion` (Boolean, default `false`). Editable por `jefatura` y `admin`.

### Bloque `impuesto` (sub-schema compartido por `FacturaProveedor` y `Factura`)
```
tipo:          "ninguno" | "detraccion" | "retencion"
codigoSunat:   String   // código del Anexo 3 (detracción); "" en retención
tasa:          Number   // 0.12, 0.10, 0.04, 0.03…
monto:         Number   // en S/; detracción redondeada a entero (≥ .5 sube)
quienDeposita: compras → "nosotros" | "proveedor";  ventas → "cliente" | "nosotros"
```
Catálogo de códigos del Anexo 3 en `utils/detraccion.js` (verificar la tabla vigente al planificar):
020 mantenimiento y reparación de bienes muebles 12 %, 022 otros servicios empresariales 12 %,
025 fabricación de bienes por encargo 10 %, 019 arrendamiento de bienes 10 %, 027 transporte de
carga 4 % (mínimo S/ 400), 030 contratos de construcción 4 %, 037 demás servicios gravados 12 %.
Umbral general: total > S/ 700. Operaciones en USD: monto = total × tipo de cambio, redondeado.
Retención: 3 % del total cuando > S/ 700; excluyente con la detracción.

### `FacturaProveedor` (nuevo) — `FP-NNNN`
- Comprobante: `tipoComprobante` (`01` factura, `02` recibo por honorarios, `03` boleta),
  `serie`, `numero`, `fechaEmision`, `proveedor` (ref `Empresa`), snapshot de RUC y razón social.
- Vínculo: `ordenCompraProveedor` (opcional), `esFleteDe` (ref OCP, cuando es la factura del
  transportista). **Sin OCP** (gastos, o registradas desde el SIRE): `centroCosto` obligatorio y
  `ordenTrabajo` opcional.
- Montos: `moneda`, `tipoCambio` (precargado del `TipoCambio` vigente, editable), `subtotal`,
  `igv`, `total`, `flete` (monto de flete incluido en esta factura, base sin IGV).
- `condicion`: `contado | credito`; `fechaVencimiento` (precargada con "Factura a N días" de la OCP;
  contado = fecha de emisión).
- `impuesto` (bloque de arriba).
- Derivados, recalculados en la transacción de cada movimiento:
  `netoAPagar` (= total − impuesto.monto si `quienDeposita = nosotros`; = total si `proveedor`),
  `pagadoNeto`, `pagadoImpuesto`, `saldoNeto`, `saldoImpuesto`,
  `estado`: `pendiente | parcial | pagada | anulada`.
- `archivos[]` (PDF de la factura; mismo shape que `OrdenTrabajo.archivos`), anulación con motivo.
- Índice único parcial `{ proveedor, tipoComprobante, serie, numero }` para facturas no anuladas.

### `MovimientoTesoreria` (nuevo) — `MOV-NNNN`
```
tipo:        "egreso" | "ingreso" | "transferencia" | "retencion"
fecha, monto, moneda, tipoCambio
cuenta:      ref CuentaTesoreria (null solo en tipo "retencion")
cuentaDestino: ref CuentaTesoreria (solo "transferencia")
medio:       "transferencia" | "deposito" | "efectivo" | "cheque" | "comprobante_retencion"
numeroOperacion: String      // nº de operación, constancia de detracción o comprobante de retención
concepto:    "neto" | "impuesto"
documento:   { tipo: "facturaProveedor" | "facturaVenta", id, cuotaId? }
registradoPor, anulado, motivoAnulacion, anuladoPor, fechaAnulacion
```
Nunca se borra: se anula (con motivo) y los saldos se recalculan en la misma transacción.

### Cambios a modelos existentes
- **`Factura` (venta)**: agrega el bloque `impuesto` (reemplaza la regla fija de
  `routes/facturas.js` "12 % si total ≥ 701"; si hay `Comprobante` con detracción, se precarga desde
  ahí). `montoPagado`, `estadoPago`, `detraccionPagada` y `cuotas[].montoPagado/pagado` pasan a ser
  **derivados** de los movimientos (se conservan los campos para que el Dashboard no cambie).
- **`OrdenCompraProveedor`**: derivados `montoFacturado` y `saldoPorFacturar` (sin contar facturas de
  flete). **Anular una OCP** pasa a bloquearse si tiene facturas vigentes (reemplaza el bloqueo
  "origen pagado" de la Spec A).

### Reglas de negocio
- **Tope**: Σ total de facturas vigentes (no flete) de una OCP ≤ total de la OCP (tolerancia de
  S/ 0.10 por redondeo); si no, 400.
- **Un pago no supera el saldo** de su parte (neto o impuesto).
- **Casos de impuesto** (ejemplo total 1 180, detracción 142):

| Caso | Parte neto | Parte impuesto |
|---|---|---|
| Compra, deposita nosotros | egreso 1 038 al proveedor | egreso 142 a la cuenta BN del proveedor (cuenta tipo detracciones) |
| Compra, proveedor se autodetrae | egreso 1 180 | no aplica (saldo 0) |
| Venta, deposita el cliente | ingreso 1 038 | ingreso 142 en nuestra cuenta BN |
| Venta, el cliente pagó todo | ingreso 1 180 | transferencia 142 de nuestro banco a nuestra cuenta BN |
| Venta, cliente agente de retención | ingreso total − 3 % | movimiento tipo `retencion` con nº de comprobante, sin cuenta |
| Compra, INTALES agente de retención | egreso total − 3 % | egreso 3 % a SUNAT (declaración PDT 626) |

- **Origen pagado**: cuando una OCP está **completamente facturada** y todas sus facturas (no flete)
  están `pagada`, sus orígenes (ítem de RQ / Servicio Externo) pasan a `estadoPago: "pagado"` con
  `fechaPago` = fecha del último movimiento. El reporte de costo por OT sigue funcionando igual.
- **Flete**: al registrar una factura con `flete > 0` o una factura de transportista (`esFleteDe`),
  el flete (base sin IGV, en S/) se reparte entre las líneas de la OCP en proporción a su subtotal y
  se **suma** al `costoTransporte` del origen (campo existente que el reporte de costo ya usa). Anular
  esa factura lo resta.

## Conciliación SIRE

- **Fuente de datos**:
  - API vía HUB: portar de SIPAPP-IMAQUITEC `services/sireHub.service.js` (usa `HUB_BASE_URL` /
    `HUB_API_KEY`, endpoints del HUB `/v1/sire/{compras|ventas}/sync`, `/v1/sire/ticket/:numTicket`,
    `/archivo`, `/resumen`). Flujo: sync → ticket → consultar hasta `terminado` → descargar ZIP.
  - Carga manual: subir el ZIP/TXT descargado de la web SIRE.
  - Parser: portar `utils/sirePle.parser.js` de IMAQUITEC (`adm-zip`, `extraerLineasPle`,
    `mapearRegistroCompra`, `mapearRegistroVenta`). Nueva dependencia: `adm-zip`.
- **`PropuestaSire`** (nuevo): `libro` (`RCE | RVIE`), `periodo` (`AAAAMM`), `origen`
  (`api | archivo`), `fechaDescarga`, `descargadoPor`, `comprobantes[]` normalizados (RUC y razón
  social de la contraparte, tipo, serie, número, fecha de emisión, moneda, base imponible, IGV, total).
  Una por libro y periodo; descargar de nuevo la reemplaza.
- **Cruce** (clave: RUC contraparte + tipo + serie + número, normalizando ceros a la izquierda del
  número): RCE contra `FacturaProveedor`; RVIE contra `Factura`/`Comprobante` emitidos.
- **Resultado por comprobante**: `coincide`, `difiere` (lista de campos: total, IGV, fecha, moneda —
  tolerancia S/ 0.10), `solo_sire` (acción "Registrar factura" precargada), `solo_sistema`.
- El resultado se calcula al consultar (no se persiste), para que siempre refleje lo registrado.

## Rutas — Backend

Guard `puedeTesoreria = ["facturacion", "jefatura", "admin"]`; todas `async` con
`try/catch → next(err)`.

- `/api/cuentas-tesoreria`: GET (todos los autenticados de Tesorería), POST/PUT (jefatura, admin).
- `/api/configuracion`: GET, PUT `esAgenteRetencion` (jefatura, admin).
- `/api/facturas-proveedor`: GET (filtros en cliente, como Compras), GET `/:id`, POST (valida tope,
  duplicado, impuesto; transacción; reparte flete), PATCH `/:id/anular` (bloquea si tiene
  movimientos vigentes), POST/DELETE `/:id/archivos`.
- `/api/movimientos-tesoreria`: GET (con filtros de fecha/cuenta), POST (valida saldo de la parte,
  tipo/cuenta coherentes; transacción; recalcula el documento y, si corresponde, marca el origen
  pagado), PATCH `/:id/anular` (transacción; revierte).
- `/api/tesoreria/por-pagar` (OCP + facturas con saldos, vista "por OC") y `/api/tesoreria/por-cobrar`
  (facturas de venta con saldos).
- `/api/sire`: POST `/:libro/:periodo/descargar` (vía HUB, responde el estado del ticket),
  GET `/:libro/:periodo/estado`, POST `/:libro/:periodo/archivo` (carga manual),
  GET `/:libro/:periodo/conciliacion`.
- **Ventas**: `PATCH /facturas/:id/estado-pago`, `/detraccion-pagada` y `/cuotas/:cuotaId/pagar` se
  **retiran**; el cobro se registra solo como movimiento.
- **Requerimientos**: `PATCH /:id/items/:itemId/pagar` y `/servicios-externos/:id/pagar` quedan solo
  para orígenes **sin OCP** (flujo anterior); para los que tienen OCP responden 400
  "Se paga desde Tesorería".

## Frontend

- **`/tesoreria`** (`facturacion`, `jefatura`, `admin`), 5 pestañas en tabla:
  1. **Por pagar** — vista *Por OC* (todas las OCP vigentes con y sin factura: total, facturado,
     saldo por facturar, pagado, saldo por pagar, próximo vencimiento; "+ Registrar factura") y
     vista *Por factura* (FP, comprobante, proveedor, OCP, emisión, vencimiento con color, total,
     impuesto con tipo/monto/quién, ☐ impuesto pagado, neto, ☐ neto pagado, saldo; "Registrar pago");
     botón "+ Factura sin OC". Filtros: proveedor, estado, vencidas / por vencer (≤ 7 días), fechas.
  2. **Por cobrar** — facturas de venta con las mismas columnas (☐ impuesto cobrado/depositado,
     ☐ neto cobrado, cuotas) y "Registrar cobro".
  3. **Movimientos** — libro con filtros por cuenta y fechas, totales de ingresos/egresos, Exportar
     Excel, anular con motivo (modal propio).
  4. **SIRE** — selector de libro (Compras RCE / Ventas RVIE) y periodo; "Descargar de SUNAT" (con
     estado del ticket) y "Subir archivo"; tabla de conciliación filtrable por resultado, con los
     campos que difieren resaltados y "Registrar factura" en los `solo_sire`.
  5. **Configuración** (jefatura, admin) — cuentas de tesorería e interruptor "INTALES es agente de
     retención".
- **Modal Registrar factura de proveedor** — precarga desde la OCP (proveedor, moneda, saldo por
  facturar, vencimiento); tipo de comprobante, serie/número, fecha, subtotal, IGV 18 % automático
  (desmarcable), flete, PDF; "factura de flete de un transportista"; sugerencia de impuesto (detracción
  si hay servicios y total > S/ 700; retención si está activa, sin detracción y > S/ 700, con casilla
  "buen contribuyente / agente → no aplica"); resumen total / impuesto / neto a pagar.
- **Modal Registrar pago / cobro** — muestra las dos partes con su saldo; elige parte, monto (por
  defecto el saldo), fecha, cuenta (filtrada por tipo según la parte), medio y nº de operación o
  constancia; en ventas con "el cliente pagó todo", la parte impuesto se registra como transferencia.
- **Detalle de factura de venta** (`DetalleFactura.jsx`): los controles manuales de pago/detracción/
  cuotas se reemplazan por un resumen de solo lectura + "Registrar cobro" (mismo modal).
- **Sidebar**: entrada "Tesorería" para los tres roles.
- **Requerimientos**: *Pendiente de pago* / *Pagados* muestran solo orígenes sin OCP y se ocultan si
  no hay ninguno.
- Lógica pura en `Frontend/src/utils/tesoreria.js` (cálculo de impuesto y neto, sugerencia de
  código, saldos, días de "Factura a N días", semáforo de vencimiento), con tests `node:test`.

## Datos existentes

Versión 0 sin prod
ucción: script `scripts/prepararTesoreria.js` idempotente que siembra las cuentas y
la configuración, y arma el bloque `impuesto` de las facturas de venta existentes desde `detraccion`.
Los pagos manuales anteriores de ventas **no se migran** a movimientos (datos de prueba).

## Verificación

- Backend `node:test` con transacciones reales (replica set local): los 6 casos de impuesto y el
  redondeo; tope por OCP; duplicado de comprobante; pago que excede el saldo; anulación que revierte
  saldos; transacción que falla a mitad y no deja nada escrito; flete repartido y revertido; origen
  marcado pagado solo con OCP completa y pagada; anular OCP con facturas → 400; conciliación SIRE con
  archivos de ejemplo (los cuatro resultados); cliente del HUB contra un servidor falso local; script
  de preparación dos veces.
- Frontend: tests de `utils/tesoreria.js`, lint, build y recorrido Playwright (registrar factura con
  detracción, pagar neto e impuesto, ver los checks, conciliar un periodo con archivo subido).

## Estado (2026-09-28)

**Mergeado a `main`** en Backend (16 commits) y Frontend (10 commits), sin push. Backend 96/96 tests, frontend 17/17, build OK, recorrido Playwright completo.
Incluye además el fix de la GRE (fecha de traslado/entrega no anterior a la emisión).

Decisiones tomadas durante la implementación:
- Fechas "YYYY-MM-DD" de facturas de proveedor y movimientos se guardan a medianoche Lima (`aFechaLima`); los `Comprobante` (CPE) guardan medianoche UTC y la conciliación RVIE los lee en UTC.
- Las cuotas de una venta suman el total; si el cliente descuenta la detracción/retención, neto + impuesto cubren las cuotas.
- No se anula una venta con cobros vigentes ni una OCP con factura (incluida la de flete). Anular una OCP corre en transacción.
- Editar el subtotal de una venta: total/igv/cuotas son derivados; el servidor responde 409 con la vista previa y guarda solo con `confirmarRecalculo`; 400 si lo cobrado supera el nuevo neto.
- Flete: la última línea absorbe el redondeo y el reparto se guarda en la factura (`repartoFlete`) para revertirlo exacto.
- Errores: duplicado (E11000) → 409 con el comprobante; id inválido/validación → 400 (`middleware/manejarErrores.js`).
- Frontend: errores de red liberan el botón; aviso si la cuenta está en otra moneda; reintento si falla el PDF; el vencimiento se mueve con la emisión.
- El parser SIRE rechaza ZIPs de más de 50 MB descomprimidos o más de 20 archivos.

Pendientes:
- MongoDB local como replica set: correr `habilitar-replicaset-mongodb.ps1` como administrador y poner `?replicaSet=rs0` en `MONGO_URI`. Hoy los tests corren contra un mongod temporal (puerto 27018, `enableTestCommands=1` para el test de falla a mitad de anulación).
- Push de `main` a GitHub (no pedido todavía).
- Probar el parser con un archivo SIRE real de INTALES (RCE y RVIE; notas de crédito, IGV en columnas DGNG/DNG).
- **Pedido del usuario (2026-09-29): todos los comprobantes de pago del art. 2 del Reglamento de Comprobantes de Pago deben poder registrarse en Tesorería como compra** — facturas, recibos por honorarios, boletas, liquidaciones de compra, tickets de máquina registradora, ticket POS y otros documentos autorizados por SUNAT. Hoy `FacturaProveedor.tipoComprobante` solo admite 01 (factura), 02 (recibo por honorarios) y 03 (boleta). Falta diseñar: catálogo de tipos (Tabla 10 SUNAT), qué campos exige cada uno (serie/número, RUC o DNI del emisor, IGV), cuáles dan crédito fiscal y cómo se concilian con el SIRE.
- Siguiente: spec de **bloqueo de edición** (aprobado enfoque A), luego B2 (núcleo contable), B3 (PLE/Excel), C (cierre de mes).
