# Caja chica (fondo fijo) — Diseño

**Fecha:** 2026-10-02 · **Origen:** pendiente de B7 (`2026-10-02-bancos-b7-design.md`); el ERP C# no lo resolvía
(`docs/contabilidad/2026-10-01-referencias-erp-C2-C5.md`). Pedido por el usuario (“caja chica”, 2026-10-02).

## Modelo de fondo fijo (práctica peruana, cuenta 102 Fondos fijos)

Una **caja chica** es una cuenta de Tesorería de tipo `caja`, en soles, marcada como caja chica con **responsable**,
**monto del fondo** y **tope por gasto**. Reutiliza todo lo de Bancos: su saldo y su libro salen de los movimientos.

1. **Apertura**: transferencia de un banco a la caja chica por el monto del fondo (botón “Abrir fondo”, usa la
   transferencia propia de B7).
2. **Gastos (vales)**: cada gasto pagado con la caja chica se registra con su comprobante: boleta (03), ticket (12),
   factura (01), recibo por honorarios (02), **planilla de movilidad** (sin comprobante, con trabajador) o **vale
   sin comprobante** (con motivo). Datos: fecha, proveedor (RUC/DNI y nombre, opcional en movilidad/vale),
   descripción, monto, centro de costo y OT opcionales, cuenta contable opcional. Cada gasto genera un **egreso**
   en la caja chica (concepto `caja_chica`).
   - Una factura con IGV que se quiera usar como **crédito fiscal** se registra en Comprobantes de compra con
     “Ya se pagó” desde la caja chica: así entra al Registro de Compras/SIRE. Ese pago también es un egreso de la
     caja chica y entra a la rendición. Aquí la factura se acepta, pero queda sin crédito fiscal (aviso en pantalla).
   - Reglas: monto ≤ tope por gasto (si hay tope) y ≤ saldo de la caja; caja chica activa.
3. **Rendición y reposición**:
   - **Rendir**: junta todos los egresos de la caja chica aún no rendidos (gastos y pagos de comprobantes) hasta una
     fecha → rendición `pendiente` con su total y detalle (para aprobar/imprimir). Una sola rendición pendiente por
     caja.
   - **Reponer**: transfiere desde un banco a la caja chica el total de la rendición (transferencia propia) y la
     rendición pasa a `repuesta`. Con eso la caja vuelve al monto del fondo.
   - **Anular** una rendición pendiente libera sus egresos. Un egreso incluido en una rendición no se anula.
4. **Arqueo**: se registra el efectivo contado; el sistema compara con el saldo de la caja (libro) y guarda la
   diferencia (faltante/sobrante) y una observación. No ajusta solo: un faltante o sobrante se registra como
   movimiento sin documento si corresponde.

Control: fondo = saldo de la caja + egresos no repuestos (rendidos o no). Se muestra en la pantalla.

## Permisos

Roles de Tesorería registran gastos, rinden, reponen y arquean. Marcar una caja como caja chica (responsable, fondo,
tope): jefatura y admin.

## Fuera de alcance

Varias monedas (solo soles), adjuntar la foto del comprobante (se puede agregar luego con el patrón de adjuntos),
flujo de aprobación por firma, asientos (C2).

## Estado

(Se completa al cerrar.)
