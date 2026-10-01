# Casos de prueba contables — INTALES vs. CONCAR / StarSoft

**Fecha:** 2026-10-01 · **Proyecto:** SIPAPP-INTALES · **Tipo:** batería de validación (no es spec)
**Referencia:** `2026-10-01-guia-contable-mediana-empresa.md` (asientos tipo, cuentas PCGE 2019, reglas de TC).
**Código revisado:** Backend `feature/comprobantes-compra` (b0361dc) y Frontend `feature/comprobantes-compra`.

Cada caso trae: datos de entrada concretos, el **asiento que generaría un contador en CONCAR/StarSoft**, el efecto en
libros, SIRE y resumen tributario, **dónde debería verse en INTALES** (hoy y con el motor contable C1–C5) y el
**resultado hoy** (✅ coincide · ⚠️ coincide con observaciones · ❌ no lo genera o lo calcula distinto).

Convenciones:
- Importes en S/ salvo indicación; entre paréntesis el importe en US$ (ME).
- Las cuentas 9x son de libre definición (PCGE 2019): 92-OT0001, 92-OT0002 (costo directo por OT), 92-CIF (costos
  indirectos de producción), 94 (administración), 97 (financieros). Contrapartida 791.
- Variante de compras de material: **compra directa a OT** (el ingreso y la salida de almacén 24/61 se anulan; el
  efecto neto es 60x + 92 / 791). Si el contador usa el método con almacén, cambian los asientos intermedios pero no
  los saldos netos de 60x, 9x y 791 que se comparan.
- "Destino" = asiento automático 9x / 791 que CONCAR genera por la tabla de transferencia 6→9 y StarSoft por el
  "Detalle de cargo y abono automático" o en el proceso de cierre mensual.
- Los subdiarios se nombran como en el diseño del motor contable: `compras`, `ventas`, `caja-bancos`, `diario`,
  `ajuste`.

---

## 0. Datos maestros del escenario (sembrar antes de correr los casos)

**Empresa:** INTALES S.A.C., RUC 20612928551, régimen general, ingresos entre 300 y 1700 UIT.
**Escenario A:** `Configuracion.esAgenteRetencion = false`. **Escenario B** (solo CP-08): `true`, en una base aparte.

**Tipo de cambio de prueba** (sembrar en `TipoCambioDia` con `fechaSunat = fecha`; son valores ficticios, no los
publicados por SUNAT):

| Fecha | Compra | Venta |
|---|---|---|
| 2026-09-01 | 3.500 | 3.510 |
| 2026-09-02 | 3.500 | 3.510 |
| 2026-09-10 | 3.520 | 3.530 |
| 2026-09-15 | 3.540 | 3.550 |
| 2026-09-25 | 3.480 | 3.490 |
| 2026-09-30 | 3.560 | 3.570 |
| 2026-10-15 | 3.600 | 3.610 |

**Cuentas de tesorería → cuentas contables** (configuración contable, C2):

| `CuentaTesoreria` | Tipo / moneda | Cuenta | Saldo inicial 31/08/2026 |
|---|---|---|---|
| Caja | caja / PEN | 1011 (div. de 101) | S/ 2,000.00 |
| BCP Soles | banco / PEN | 104101 | S/ 200,000.00 |
| BCP Dólares | banco / USD | 104102 | US$ 10,000.00 = S/ 35,000.00 |
| Banco de la Nación – Detracciones | detracciones / PEN | 104201 (div. de 1042) | S/ 0.00 |

**Terceros** (RUC de prueba; usar RUC válidos del seed si el sistema valida dígito verificador):

| Código | Razón social | RUC | Rol |
|---|---|---|---|
| P1 | Aceros del Sur S.A.C. | 20000000011 | Proveedor de materiales (S/) |
| P2 | Rodamientos Import S.A.C. | 20000000012 | Proveedor en US$ |
| P3 | Ferretería Lima E.I.R.L. | 20000000013 | Emite boletas |
| P4 | Grifo Central S.A.C. | 20000000014 | Emite tickets |
| P5 | Juan Pérez Rojas | 10000000015 | Recibos por honorarios |
| P6 | Servicios Industriales Norte S.A.C. | 20000000016 | Mantenimiento (SPOT 020) |
| P8 | Equipos de Protección S.A.C. | 20000000018 | EPP (escenario B) |
| C1 | Minera Andina S.A. | 20000000021 | Cliente, deposita detracción |
| C2 | Agroindustrial Costa S.A.C. | 20000000022 | Cliente agente de retención |
| C3 | Pesquera Pacífico S.A.C. | 20000000023 | Cliente en US$ |

**OT y centros de costo:** OT-0001 (cliente C1, terminada y facturada en setiembre), OT-0002 (cliente C3, en proceso
al 30/09). Centros: Producción, Administración. OCP-0001 a P1 (material para OT-0001, subtotal S/ 10,000.00).

---

## 1. Compras

### CP-01 — Factura en S/ con crédito fiscal (material para OT, con OC)

**Entrada:** `POST /api/facturas-proveedor` — tipo 01, F001-123, emisión 02/09/2026, P1, `ordenCompraProveedor`
OCP-0001 (línea material, OT-0001), subtotal 10,000.00, IGV 1,800.00, total 11,800.00, condición crédito, vence
02/10/2026, sin impuesto.

**Asiento esperado** (subdiario compras, 02/09/2026, glosa "F001-123 Aceros del Sur — material OT-0001"):

| Cuenta | Denominación | Debe | Haber | Anexo / doc. / destino |
|---|---|---|---|---|
| 6021 | Materias primas (div. propia de 602) | 10,000.00 | | CC Producción, OT-0001 |
| 40111 | IGV – Cuenta propia | 1,800.00 | | |
| 4212 | Emitidas | | 11,800.00 | P1 · 01 F001-123 · vence 02/10 |
| 92-OT0001 | Costo de producción OT-0001 | 10,000.00 | | destino |
| 791 | Cargas imputables a cuentas de costos y gastos | | 10,000.00 | destino |

**Efectos:** RCE 202609 con crédito fiscal (base 10,000.00 / IGV 1,800.00); resumen tributario "con crédito";
Diario 5.1 (5 líneas, CUO del asiento, correlativo M1…M5); Mayor de 6021, 40111, 4212, 92, 791.
**INTALES:** Tesorería → Por pagar → "Registrar factura" (`ModalFacturaProveedor`); `GET /api/tesoreria/resumen-tributario?periodo=2026-09`;
`GET /api/sire/RCE/202609/conciliacion`; futuro: bandeja de asientos (C2) y Diario/Mayor (C3).
**Resultado hoy:** ✅ datos tributarios (`creditoFiscal: true`, `saldoNeto` 11,800.00). ❌ asiento (C2 pendiente).
⚠️ El costo de la OT queda como **comprometido** hasta que se pague (criterio de caja); contablemente es costo
devengado del mes.

### CP-02 — Factura en US$ con crédito fiscal

**Entrada:** tipo 01, F002-456, emisión 10/09/2026, P2, sin OC, centro Producción, OT-0002, moneda USD, subtotal
2,000.00, IGV 360.00, total 2,360.00, crédito, vence 25/09/2026. TC automático = **3.530** (venta 10/09).

**Asiento esperado** (compras, 10/09, moneda US, conversión V, TC 3.530):

| Cuenta | Debe | Haber | Detalle |
|---|---|---|---|
| 6033 Repuestos | 7,060.00 (2,000.00) | | OT-0002 |
| 40111 | 1,270.80 (360.00) | | |
| 4212 | | 8,330.80 (2,360.00) | P2 · 01 F002-456 |
| 92-OT0002 / 791 | 7,060.00 | 7,060.00 | destino |

**Efectos:** RCE con moneda USD y TC 3.530; resumen: `baseSoles` 7,060.00, `igvSoles` 1,270.80, `totalSoles` 8,330.80.
**Resultado hoy:** ✅ TC por fecha desde `TipoCambioDia`; ✅ resumen en soles. ❌ asiento con importes MN/ME.

### CP-03 — Boleta sin crédito fiscal (IGV al gasto), pagada en caja

**Entrada:** tipo 03, B001-789, 05/09/2026, P3, centro Administración, subtotal 200.00, IGV 36.00 (informativo),
total 236.00, contado, "Ya se pagó": cuenta Caja, medio efectivo.

**Asientos esperados:**

| Subdiario | Cuenta | Debe | Haber |
|---|---|---|---|
| compras | 656 Suministros | 236.00 | |
| compras | 4212 (P3 · 03 B001-789) | | 236.00 |
| compras | 94 / 791 (destino) | 236.00 | 236.00 |
| caja-bancos | 4212 / 1011 Caja | 236.00 | 236.00 |

**Efectos:** no hay crédito fiscal; resumen "sin crédito" +236.00. Para renta, la boleta solo sustenta gasto en los
casos de ley (emisor del Nuevo RUS dentro del límite) **[Confirmar]**.
**Resultado hoy:** ✅ `creditoFiscal: false`, total 236.00 en "sin crédito". ⚠️ Costo de OT: si la boleta se liga a una OT,
`costosOT` suma `subtotal` (200.00) y no el total (236.00) — el IGV sin crédito es costo (ver brecha B13).

### CP-04 — Ticket sin RUC y ticket con RUC

**CP-04a (sin RUC):** tipo 12, T001-555, 06/09, P4, combustible, `ticketConRuc: false`, subtotal 118.00, IGV 0.00,
total 118.00, contado, Caja, centro Administración.
Asiento: D 656 118.00 / H 4212 118.00; destino D 94 / H 791 118.00; pago D 4212 / H 1011 118.00. **No da crédito fiscal
ni sustenta gasto** (no identifica al adquirente): reparo en la DJ anual.

**CP-04b (con RUC):** tipo 12, T002-100, 07/09, P4, `ticketConRuc: true`, subtotal 50.00, IGV 9.00, total 59.00, contado,
Caja, Administración.
Asiento: D 656 50.00 + D 40111 9.00 / H 4212 59.00; destino D 94 / H 791 50.00; pago D 4212 / H 1011 59.00.

**Efectos:** resumen "sin crédito" +118.00 y "con crédito" base 50.00 / IGV 9.00. SIRE: el ticket de máquina
registradora no es electrónico, **no viene en la propuesta**; el contribuyente debe agregarlo al RCE.
**Resultado hoy:** ✅ crédito fiscal derivado; ✅ el ticket sin RUC no sale como "solo sistema" (`routes/sire.js:153`).
⚠️ El ticket con RUC sale "solo_sistema": correcto, pero la pantalla debería decir "agregar al RCE en el SIRE".

### CP-05 — Recibo por honorarios sin retención

**Entrada:** tipo 02, E001-12, 11/09/2026, P5, OT-0001 (centro Producción), subtotal 1,200.00 (IGV 0), sin retención
(no supera S/ 1,500). Pago 20/09 desde BCP Soles, transferencia, op. 000501.

**Asientos:** compras/honorarios: D 6329 Asesoría – otros 1,200.00 / H 424 Honorarios por pagar 1,200.00; destino
D 92-OT0001 / H 791 1,200.00. Caja-bancos 20/09: D 424 / H 104101 1,200.00.
**Efectos:** no va al RCE (`routes/sire.js:126` lo excluye); resumen "sin crédito" +1,200.00.
**Resultado hoy:** ✅.

### CP-06 — Recibo por honorarios con retención de 4.ª (8 %)

**Entrada:** tipo 02, E001-13, 12/09/2026, P5, OT-0001, subtotal 2,500.00, "Retener 4ta" → retención 200.00, neto
2,300.00. Pago del neto 20/09 (BCP Soles, op. 000502). Pago de la retención a SUNAT el 12/10/2026 (PLAME 202609).

**Asientos:**

| Fecha | Subdiario | Cuenta | Debe | Haber |
|---|---|---|---|---|
| 12/09 | compras | 6329 | 2,500.00 | |
| 12/09 | compras | 424 (P5 · 02 E001-13) | | 2,300.00 |
| 12/09 | compras | 40172 Renta de cuarta categoría | | 200.00 |
| 12/09 | compras | 92-OT0001 / 791 | 2,500.00 | 2,500.00 |
| 20/09 | caja-bancos | 424 / 104101 | 2,300.00 | 2,300.00 |
| 12/10 | caja-bancos | 40172 / 104101 | 200.00 | 200.00 |

Variante frecuente en CONCAR: provisionar 424 por el total y registrar la retención al pagar (D 424 2,500 / H 104101
2,300 / H 40172 200). Ambas cuadran; lo que no puede cambiar es el **periodo de la retención = mes del pago** (202609
aquí, porque se pagó el 20/09).

**Efectos:** PLAME 202609 con S/ 200.00 de 4.ª; resumen: `retencion4ta.retenido` 200.00, `pagado` 0.00 hasta el
12/10, `pendiente` 200.00.
**Resultado hoy:** ✅ monto y neto. ⚠️ El resumen agrupa la retención por mes de **emisión** (`utils/resumenTributario.js:22-31`);
si el RH se emite en setiembre y se paga en octubre, INTALES la pone en setiembre y la PLAME en octubre (brecha B9).
⚠️ `pagado`/`pendiente` muestran el estado actual, no el del periodo consultado.

### CP-07 — Factura con detracción (SPOT 020, depósito en el BN del proveedor)

**Entrada:** tipo 01, E001-77, 15/09/2026, P6, mantenimiento de una máquina de INTALES (centro Producción, sin OT),
subtotal 5,000.00, IGV 900.00, total 5,900.00, impuesto `{ tipo: detraccion, codigoSunat: "020", quienDeposita: "nosotros" }`
→ detracción 12 % = **708.00** (sin decimales), neto **5,192.00**. Depósito 17/09 desde BCP Soles, constancia
123456789. Pago del neto 30/09 desde BCP Soles, op. 000777.

**Asientos:**

| Fecha | Subdiario | Cuenta | Debe | Haber | Detalle |
|---|---|---|---|---|---|
| 15/09 | compras | 6343 Mantenimiento – PPE | 5,000.00 | | |
| 15/09 | compras | 40111 (o 1673 si el contador difiere el crédito hasta el depósito) | 900.00 | | |
| 15/09 | compras | 4212 | | 5,900.00 | P6 · 01 E001-77 |
| 15/09 | compras | 92-CIF / 791 | 5,000.00 | 5,000.00 | destino |
| 17/09 | caja-bancos | 4212 / **104101** | 708.00 | 708.00 | constancia 123456789 (fondos propios al BN del proveedor) |
| 30/09 | caja-bancos | 4212 / 104101 | 5,192.00 | 5,192.00 | |

Si se usó 1673: al depositar, D 40111 / H 1673 900.00.
**Efectos:** RCE con crédito fiscal (depósito dentro del plazo); resumen "con crédito" base 5,000 / IGV 900.
**Resultado hoy:** ✅ monto 708, neto 5,192, constancia obligatoria. ⚠️ El backend no impide pagar la detracción de una
compra desde la cuenta BN **de INTALES** (`utils/movimientos.js:56-58` solo lo impide para el neto; el frontend sí
filtra en `utils/tesoreria.js:121-130`). ❌ No hay estado "crédito fiscal pendiente de depósito" (1673).

### CP-08 — Retención del IGV 3 % practicada por INTALES (escenario B)

**Entrada:** `PUT /api/configuracion { esAgenteRetencion: true }`. Tipo 01, F001-900, 20/09, P8, EPP (bienes, sin
SPOT), subtotal 1,000.00, IGV 180.00, total 1,180.00, impuesto retención → 35.40, neto 1,144.60. Pago 28/09 desde
BCP Soles; emisión del comprobante de retención electrónico R001-00000001 el 28/09. Pago a SUNAT (PDT 626 periodo
202609) el 12/10.

**Asientos:**

| Fecha | Cuenta | Debe | Haber |
|---|---|---|---|
| 20/09 | 6032 Suministros / 40111 / 4212 | 1,000.00 / 180.00 | 1,180.00 |
| 20/09 | 94 / 791 | 1,000.00 | 1,000.00 |
| 28/09 | 4212 (P8 · F001-900) | 1,180.00 | |
| 28/09 | 104101 | | 1,144.60 |
| 28/09 | 401141 IGV retenciones por pagar (div. de 40114) | | 35.40 |
| 12/10 | 401141 / 104101 | 35.40 | 35.40 |

**Reglas que debe cumplir:** la retención nace **al pagar**; el umbral de S/ 700 se mide sobre la suma de comprobantes
pagados al mismo proveedor en la misma fecha; se retiene sobre cada pago parcial; en US$ se convierte con el TC venta
de la fecha de pago; se emite el comprobante de retención (CRE).
**Resultado hoy:** ⚠️ monto 35.40 correcto en este caso, pero calculado al **registrar** el comprobante, por comprobante y
con el TC de emisión (`routes/facturasProveedor.js:114-121`, `utils/impuesto.js:20`). ❌ No emite CRE ni arma el PDT 626.

### CP-09 — Nota de crédito parcial de compra (aplicada automáticamente)

**Entrada:** tipo 07, FC01-10, 12/09/2026, P1, `documentoOrigen` F001-123, motivo rebaja de precio, subtotal 1,000.00,
IGV 180.00, total 1,180.00.

**Asiento esperado** (compras, 12/09, doc. 07 FC01-10, ref. 01 F001-123 del 02/09):

| Cuenta | Debe | Haber | Nota |
|---|---|---|---|
| 4212 | 1,180.00 | | P1 · cargado al documento F001-123 (o al de la NC + canje) |
| 6021 | | 1,000.00 | rebaja identificable con el material (NIC 2.11); alternativa 7311 **[Confirmar]** |
| 40111 | | 180.00 | |
| 791 / 92-OT0001 | 1,000.00 | 1,000.00 | reversa del destino |

**Efectos:** RCE con la NC en negativo (−1,000.00 / −180.00); resumen "con crédito" −1,000.00 / −180.00; saldo de
F001-123 = 10,620.00; costo de OT-0001 −1,000.00.
**Resultado hoy:** ✅ aplicación automática (`saldoNeto` 10,620.00, movimiento `aplicacion` del 12/09); ✅ resumen y SIRE
en negativo; ✅ `costosOT` rebaja la base de la NC.

### CP-10 — Nota de crédito total con saldo a favor aplicado a otra factura

**Entrada:**
1. F001-200, 03/09, P1, sin OC, OT-0001, 2,000.00 + 360.00 = 2,360.00, contado, "Ya se pagó" BCP Soles op. 000300.
2. FC01-11, 14/09, NC total (devolución) sobre F001-200: 2,000.00 + 360.00 = 2,360.00 → como F001-200 ya está pagada,
   aplicado 0 y **saldo a favor 2,360.00**.
3. F001-210, 16/09, P1, sin OC, OT-0001, 5,000.00 + 900.00 = 5,900.00, crédito, vence 16/10.
4. 18/09: `POST /api/facturas-proveedor/{FC01-11}/aplicar { documento: F001-210, monto: 2360 }`.

**Asientos:**

| Fecha | Subdiario | Cuenta | Debe | Haber |
|---|---|---|---|---|
| 03/09 | compras | 6021 / 40111 / 4212 (F001-200) | 2,000.00 / 360.00 | 2,360.00 |
| 03/09 | compras | 92-OT0001 / 791 | 2,000.00 | 2,000.00 |
| 03/09 | caja-bancos | 4212 (F001-200) / 104101 | 2,360.00 | 2,360.00 |
| 14/09 | compras | 4212 (doc. FC01-11) / 6021 / 40111 | 2,360.00 | 2,000.00 / 360.00 |
| 14/09 | compras | 791 / 92-OT0001 | 2,000.00 | 2,000.00 |
| 16/09 | compras | 6021 / 40111 / 4212 (F001-210) | 5,000.00 / 900.00 | 5,900.00 |
| 16/09 | compras | 92-OT0001 / 791 | 5,000.00 | 5,000.00 |
| **18/09** | diario (canje) | 4212 (F001-210) / 4212 (FC01-11) | 2,360.00 | 2,360.00 |

Entre el 14/09 y el 18/09 la cuenta 4212 de P1 tiene un documento con saldo **deudor** (FC01-11): si llega así al
cierre, el análisis de la 42 lo muestra y el contador decide si reclasificar **[Confirmar]**. Si el proveedor devolviera
el dinero: D 104101 / H 4212 (FC01-11).
**Efectos:** F001-210 queda con saldo 3,540.00; FC01-11 con saldo a favor 0.00; resumen: F001-200 y FC01-11 se anulan.
**Resultado hoy:** ✅ saldos. ⚠️ El movimiento de aplicación se fecha con la **emisión de la NC** (14/09), no con la fecha
en que se aplica (18/09), aunque F001-210 se emitió el 16/09 (`utils/notasCredito.js:33`); en contabilidad el canje va
en su fecha (y en su periodo). ❌ No hay forma de registrar el reembolso en efectivo de un saldo a favor.

### CP-11 — Nota de débito de compra

**Entrada:** tipo 08, FD01-5, 22/09/2026, P1, origen F001-123, aumento de precio, subtotal 500.00, IGV 90.00, total
590.00, crédito, vence 02/10.
**Asiento:** D 6021 500.00 + D 40111 90.00 / H 4212 (P1 · 08 FD01-5, ref. F001-123) 590.00; destino D 92-OT0001 / H 791
500.00.
**Efectos:** RCE con crédito; resumen +500.00 / +90.00; costo OT-0001 +500.00.
**Resultado hoy:** ✅ documento por pagar propio; ✅ `costosOT` lo suma al costo de la OCP.

### CP-12 — Pago en US$ con diferencia de cambio

**Entrada:** pago total de F002-456 (CP-02) el 25/09/2026 desde BCP Dólares, US$ 2,360.00, transferencia op. 990001.
TC venta del 25/09 = 3.490 (pago de un pasivo; **[Confirmar]** si el contador usa compra).

**Asiento esperado** (caja-bancos, 25/09, moneda US, TC 3.490):

| Cuenta | Debe | Haber |
|---|---|---|
| 4212 (P2 · F002-456) | 8,330.80 (2,360.00) | |
| 104102 BCP Dólares | | 8,236.40 (2,360.00) |
| 776 Diferencia en cambio | | 94.40 |

(2,360.00 × 3.530 = 8,330.80; 2,360.00 × 3.490 = 8,236.40.) En CONCAR el voucher sale todo a 3.490 y la
"regularización por diferencia de cambio" del cierre genera el 94.40.
**Resultado hoy:** ❌ `MovimientoTesoreria` guarda `tipoCambio` **del documento** (3.530), no el del pago
(`utils/movimientos.js:76-77`): no hay dato para la diferencia de cambio.

---

## 2. Ventas y cobros

### CP-13 — Venta de servicios con detracción depositada por el cliente

**Entrada:** CPE F001-00000150, 08/09/2026, C1, OT-0001, servicio, subtotal 40,000.00, IGV 7,200.00, total
47,200.00; impuesto por defecto: detracción 037, 12 % = **5,664.00** (`Math.round(47,200 × 0.12)`), neto 41,536.00.
El 12/09 el cliente deposita la detracción en la cuenta BN de INTALES (constancia 987654321); el 30/09 paga el neto a
BCP Soles (op. 000900).

**Asientos:**

| Fecha | Subdiario | Cuenta | Debe | Haber |
|---|---|---|---|---|
| 08/09 | ventas | 1212 (C1 · 01 F001-00000150) | 47,200.00 | |
| 08/09 | ventas | 40111 | | 7,200.00 |
| 08/09 | ventas | **70321 Servicios – local – terceros** | | 40,000.00 |
| 12/09 | caja-bancos | 104201 BN detracciones / 1212 | 5,664.00 | 5,664.00 |
| 30/09 | caja-bancos | 104101 / 1212 | 41,536.00 | 41,536.00 |

**Efectos:** RVIE 202609 (base 40,000.00 / IGV 7,200.00); 1042 con S/ 5,664.00 disponible para pagar tributos.
**INTALES:** `POST /api/facturas` (ModalCrearFactura) + CPE (`/api/cpe`); Tesorería → Por cobrar → "Registrar cobro"
(impuesto a la cuenta tipo detracciones, neto a banco).
**Resultado hoy:** ✅ montos y cuentas de tesorería. ❌ asiento; el diseño del motor contable usa **7041** (Subproductos)
como cuenta de ventas de servicios (brecha B5).

### CP-14 — Venta a cliente agente de retención

**Entrada:** CPE F001-00000151, 18/09, C2, venta de bienes fabricados (sin SPOT), subtotal 1,000.00, IGV 180.00,
total 1,180.00. Como el total supera 700, INTALES propone detracción 037: hay que cambiarla con
`PATCH /api/facturas/:id/impuesto { tipo: "retencion" }` → 35.40. Cobro 28/09: neto 1,144.60 a BCP Soles y
movimiento `retencion` con el comprobante del cliente R001-00000055.

**Asientos:** ventas 18/09: D 1212 1,180.00 / H 40111 180.00 / H 70221 Productos terminados – local – terceros 1,000.00
(y su costo D 69221 / H 2111 según la hoja de costos, fuera de este caso). Cobro 28/09: D 104101 1,144.60 + D 401142 IGV
retenciones sufridas (div. de 40114) 35.40 / H 1212 1,180.00. Cierre: D 40111 / H 401142 35.40 (se descuenta en el PDT 621).
**Resultado hoy:** ✅ saldos y movimiento de retención. ⚠️ La detracción 037 se propone para **toda** venta mayor a
S/ 700, también de bienes (`utils/saldosTesoreria.js:133-137`, `routes/facturas.js:70-71`).

### CP-15 — Venta en US$ y cobro con diferencia de cambio

**Entrada:** CPE F001-00000152, 02/09/2026, C3, venta de bienes (sin SPOT), moneda USD, subtotal 5,000.00, IGV
900.00, total 5,900.00; TC venta 02/09 = 3.510. Cobro 25/09 en BCP Dólares US$ 5,900.00, TC compra 25/09 = 3.480.

**Asientos:**

| Fecha | Cuenta | Debe | Haber |
|---|---|---|---|
| 02/09 | 1212 (C3 · F001-00000152) | 20,709.00 (5,900.00) | |
| 02/09 | 40111 | | 3,159.00 (900.00) |
| 02/09 | 70221 | | 17,550.00 (5,000.00) |
| 25/09 | 104102 | 20,532.00 (5,900.00) | |
| 25/09 | 676 Diferencia de cambio | 177.00 | |
| 25/09 | 1212 | | 20,709.00 (5,900.00) |

**Efectos:** RVIE con moneda USD y TC 3.510; débito fiscal S/ 3,159.00.
**Resultado hoy:** ❌ `Factura` no tiene moneda ni TC (`models/Factura.js:38-41`), `ModalCrearFactura` emite siempre en
soles (`Frontend/src/components/ModalCrearFactura.jsx:234`) y `recalcularFacturaVenta` no convierte
(`utils/saldosTesoreria.js:139-140`): una venta en US$ no puede cobrarse ni contabilizarse.

### CP-16 — Nota de crédito parcial de venta (periodo 2026-10)

**Entrada:** CPE F001-00000154, 01/10/2026, C2, servicio, 10,000.00 + 1,800.00 = 11,800.00. NC FC01-00000003,
05/10/2026, motivo 09 (disminución en el valor), 1,000.00 + 180.00 = 1,180.00.
**Asiento NC:** D 7411 Descuentos concedidos – terceros (o D 70321 **[Confirmar]**) 1,000.00 + D 40111 180.00 / H 1212
(C2 · ref. F001-00000154) 1,180.00. F001-00000154 sigue **vigente** con saldo 10,620.00.
**Resultado hoy:** ❌ toda NC aceptada marca el comprobante de origen como `ANULADO`
(`controllers/comprobante.controller.js:274-288`), aunque sea parcial; la `Factura` interna no rebaja su saldo.

---

## 3. Cierre del mes

### CP-17 — Ajuste de diferencia de cambio al cierre (30/09/2026)

**Saldos en ME al 30/09** (además de los casos anteriores):
- Venta F001-00000153, 15/09, C3, US$ 2,500.00 + 450.00 = 2,950.00, TC venta 3.550 → base 8,875.00, IGV 1,597.50,
  total 10,472.50. Pendiente.
- Compra F002-460, 10/09, P2, OT-0002, US$ 1,000.00 + 180.00 = 1,180.00, TC 3.530 → 3,530.00 / 635.40 / 4,165.40.
  Pendiente (vence 10/10).
- 104102 BCP Dólares: 10,000.00 + 5,900.00 − 2,360.00 = **US$ 13,540.00**; en libros S/ 35,000.00 + 20,532.00 − 8,236.40
  = **S/ 47,295.60**.

**TC de cierre:** compra 3.560 (activos), venta 3.570 (pasivos).

| Partida | ME | Libros S/ | Al cierre S/ | Diferencia |
|---|---|---|---|---|
| 1212 F001-00000153 | 2,950.00 | 10,472.50 | 2,950 × 3.560 = 10,502.00 | +29.50 ganancia |
| 4212 F002-460 | 1,180.00 | 4,165.40 | 1,180 × 3.570 = 4,212.60 | +47.20 pérdida |
| 104102 | 13,540.00 | 47,295.60 | 13,540 × 3.560 = 48,202.40 | +906.80 ganancia |

**Asiento esperado** (ajuste, 30/09):

| Cuenta | Debe | Haber |
|---|---|---|
| 1212 (C3 · F001-00000153) | 29.50 | |
| 104102 | 906.80 | |
| 676 | 47.20 | |
| 4212 (P2 · F002-460) | | 47.20 |
| 776 | | 936.30 |
| **Totales** | **983.50** | **983.50** |

**Continuación (CP-17b, periodo 2026-10):** pago de F002-460 el 15/10 a TC venta 3.610: 1,180 × 3.610 = 4,259.80
contra 4,212.60 en libros → D 4212 4,212.60 + D 676 47.20 / H 104102 4,259.80.
**INTALES:** cierre de mes del tesorero (C3). **Resultado hoy:** ❌ no existe el proceso; tampoco los datos (CP-12).

### CP-18 — Planilla (asiento manual)

**Entrada (asiento manual, diario, 30/09):** sueldos 10,000.00; ESSALUD 9 % 900.00; ONP 13 % 1,300.00; neto 8,700.00
pagado el 30/09 desde BCP Soles.

| Cuenta | Debe | Haber |
|---|---|---|
| 6211 Sueldos y salarios | 10,000.00 | |
| 6271 Régimen de prestaciones de salud | 900.00 | |
| 4031 ESSALUD | | 900.00 |
| 4032 ONP | | 1,300.00 |
| 4111 Sueldos y salarios por pagar | | 8,700.00 |
| 92-OT0001 (HH notificadas) | 3,000.00 | |
| 92-CIF (producción indirecta) | 2,450.00 | |
| 94 Administración | 5,450.00 | |
| 791 | | 10,900.00 |

Pago 30/09: D 4111 / H 104101 8,700.00.
**Resultado hoy:** ❌ (C1: asientos manuales). ⚠️ El costo de HH de `costosOT` sale de tarifas × horas notificadas, no de
la planilla real: la diferencia debe tratarse como variación de costo **[Confirmar]**.

### CP-19 — Depreciación (asiento manual)

Máquina (3331) costo 120,000.00, 10 % anual → 1,000.00 mensuales. D 6841 Depreciación de PPE – costo 1,000.00 /
H 39524 Depreciación acumulada – maquinarias 1,000.00; destino D 92-CIF / H 791 1,000.00.

### CP-20 — Costo de las OT, destinos y costo de ventas

**Costos devengados de setiembre por destino:**

| Destino | Composición | Importe |
|---|---|---|
| 92-OT0001 | Material 6021: 10,000 − 1,000 + 500 + 2,000 − 2,000 + 5,000 = 14,500.00; RH 6329: 1,200 + 2,500 = 3,700.00; HH planilla 3,000.00 | 21,200.00 |
| 92-OT0002 | Repuestos 6033: 7,060.00 + 3,530.00 | 10,590.00 |
| 92-CIF | Mantenimiento 6343 5,000.00 + depreciación 1,000.00 + planilla indirecta 2,450.00 | 8,450.00 |
| 94 | 656: 236.00 + 118.00 + 50.00; planilla 5,450.00 | 5,854.00 |
| 97 | 676: 177.00 + 47.20 | 224.20 |
| **Σ 9x = Σ 791** | | **46,318.20** |

**Distribución de CIF** (base de prueba 70 % / 30 % por horas, **[Confirmar base]**): D 92-OT0001 5,915.00 + D 92-OT0002
2,535.00 / H 92-CIF 8,450.00.

**Producción y costo de ventas (30/09):**

| Cuenta | Debe | Haber | Nota |
|---|---|---|---|
| 2151 Servicios terminados | 27,115.00 | | OT-0001 (21,200 + 5,915) |
| 2351 Servicios en proceso | 13,125.00 | | OT-0002 (10,590 + 2,535) |
| 7151 Variación de inventarios de servicios | | 40,240.00 | |
| 69321 Costo de ventas – servicios – local – terceros | 27,115.00 | | OT-0001 facturada (CP-13) |
| 2151 | | 27,115.00 | |

Margen contable de OT-0001: 40,000.00 − 27,115.00 = **12,885.00**.

**INTALES hoy** (`GET /api/reportes/costos-fabricacion/{OT-0001}` al 30/09, con HH notificadas por S/ 3,000.00):
- Consumido 6,500.00 (RH E001-12 1,200.00 + 92 % de E001-13 = 2,300.00 + HH 3,000.00).
- Comprometido 14,700.00 (OCP-0001 neto de NC y ND 9,500.00 sin pagar + F001-210 5,000.00 cuyo pago fue la NC
  aplicada + 8 % de E001-13 = 200.00).
- Total 21,200.00 = costo directo contable ✅; margen INTALES 18,800.00 (sin CIF).
- OT-0002: consumido 7,060.00 (F002-456 pagada), comprometido 3,530.00, total 10,590.00 ✅.
**Diferencias a explicar al contador:** INTALES separa por pago (no por devengo), no distribuye CIF, no reconoce
depreciación ni planilla real, y no incluye salidas de almacén valorizadas (brechas B11, B12).

### CP-21 — Cierre mensual (tesorero)

**Precondiciones:** CP-01 a CP-20 contabilizados; ningún asiento en borrador del periodo 202609.
**Pasos y resultado esperado:**
1. Validación: todo comprobante y movimiento de setiembre tiene asiento; todos cuadran (Σ Debe = Σ Haber, también en ME).
2. Diferencia de cambio de cierre generada en borrador = CP-17; el tesorero la contabiliza.
3. Destinos: Σ 9x = Σ 791 = 46,318.20.
4. Compensación de retenciones sufridas: D 40111 / H 401142 35.40.
5. `PeriodoContable 202609 → cerrado`.
6. **Pruebas negativas:** registrar una factura de proveedor con emisión 25/09, un movimiento con fecha 29/09, anular
   un movimiento de setiembre o editar un asiento de setiembre → **409 "El periodo 202609 está cerrado"**, también desde
   Tesorería y compras/ventas. Reabrir sin motivo → 400; reabrir con motivo por un rol distinto de `tesorero` → 403.

**Saldos de control al 30/09 (después del ajuste y antes de pagar tributos):**

| Cuenta | Saldo esperado |
|---|---|
| 1011 Caja | Deudor 1,587.00 (2,000 − 236 − 118 − 59) |
| 104101 BCP Soles | Deudor 222,220.60 |
| 104102 BCP Dólares | Deudor 48,202.40 (US$ 13,540.00) |
| 104201 BN detracciones | Deudor 5,664.00 |
| 1212 | Deudor 10,502.00 (solo C3 · F001-00000153, US$ 2,950.00) |
| 4212 | Acreedor 18,962.60: P1 14,750.00 (F001-123 10,620.00 + FD01-5 590.00 + F001-210 3,540.00) y P2 4,212.60 (F002-460, US$ 1,180.00) |
| 424 | 0.00 |
| 40111 | Acreedor 6,675.90 |
| 40172 | Acreedor 200.00 |
| 4031 / 4032 | Acreedor 900.00 / 1,300.00 |
| 676 / 776 | Deudor 224.20 / acreedor 1,030.70 (94.40 + 936.30) |
| 9x / 791 | Deudor 46,318.20 / acreedor 46,318.20 |

(104101: 200,000 − 2,360 − 1,200 − 2,300 − 708 − 5,192 + 41,536 + 1,144.60 − 8,700 = 222,220.60.)

### CP-22 — Cuadre con el resumen tributario y el PDT 621

**Resumen tributario esperado** (`GET /api/tesoreria/resumen-tributario?periodo=2026-09`, escenario A):

| Bloque | Esperado | Composición |
|---|---|---|
| Con crédito – base | 30,140.00 | 10,000 + 7,060 + 50 + 5,000 − 1,000 + 2,000 − 2,000 + 5,000 + 500 + 3,530 |
| Con crédito – IGV | 5,425.20 | 1,800 + 1,270.80 + 9 + 900 − 180 + 360 − 360 + 900 + 90 + 635.40 |
| Con crédito – total | 35,565.20 | |
| Sin crédito – total | 4,054.00 | 236 + 118 + 1,200 + 2,500 |
| Retención 4.ª – retenido | 200.00 | E001-13 |

**Liquidación que hará el contador (PDT 621, periodo 202609):**

| Concepto | Base | Tributo |
|---|---|---|
| Ventas gravadas (RVIE) | 67,425.00 (40,000 + 1,000 + 17,550 + 8,875) | 12,136.50 |
| Compras con crédito fiscal (RCE) | 30,140.00 | (5,425.20) |
| Retenciones sufridas | | (35.40) |
| **IGV a pagar** | | **6,675.90 → 6,676** |
| Pago a cuenta de renta (1.5 %, ilustrativo **[Confirmar coeficiente]**) | 67,425.00 | 1,011 |

Pago sugerido: 5,664.00 con fondos de detracciones (1042) y el resto desde 104101; la diferencia de redondeo
(0.10) a 659x/759x.
**Resultado hoy:** ✅ el bloque de compras coincide con el RCE. ❌ el resumen no trae ventas, débito fiscal, retenciones
sufridas, percepciones, IGV a pagar ni pago a cuenta (`utils/resumenTributario.js:6-41`). Con las ventas que INTALES sí
puede registrar hoy (solo S/), el débito sería 7,380.00 (CP-13 + CP-14): faltan las dos ventas en US$.
**Igualdades que debe verificar el motor contable:** saldo de 40111 al cierre (6,675.90) = débito − crédito −
retenciones del periodo; Σ base con crédito = Σ 60x/63x/65x con IGV en 40111 del subdiario compras; 40172 = PLAME 4.ª.

### CP-23 — Cuadre con el SIRE (RCE y RVIE de 202609)

| Comprobante | En propuesta SIRE | Resultado esperado de la conciliación |
|---|---|---|
| F001-123, F002-456, E001-77, F001-200, F001-210, F002-460 | Sí | `coincide` (F002-456 y F002-460 también por TC 3.530) |
| FC01-10, FC01-11 (NC) | Sí, en negativo | `coincide` (comparación en valor absoluto) |
| FD01-5 (ND) | Sí | `coincide` |
| B001-789 (boleta) | Solo si es electrónica y consigna el RUC de INTALES **[Confirmar]** | `coincide` o `solo_sistema` |
| T001-555 (ticket sin RUC) | No | No se lista |
| T002-100 (ticket con RUC) | No (no electrónico) | `solo_sistema` → **agregar al RCE** |
| E001-12, E001-13 (RH) | No | No se concilian |
| RVIE: F001-00000150, 151, 152, 153 | Sí | `coincide` (152 y 153 en US$ con su TC) |

**Resultado hoy:** ✅ RCE según `routes/sire.js:121-136` y `utils/conciliacionSire.js`. ⚠️ El periodo se toma por
**fecha de emisión**: un comprobante anotado en otro periodo (D. Leg. 1669: no electrónicos hasta 2 meses, SPOT hasta 3)
sale `solo_sire` en un mes y `solo_sistema` en otro. ❌ RVIE de 152 y 153: no hay `Factura` en US$ (las conciliaría el
`Comprobante`, pero no habría cuenta por cobrar).

---

## 4. Brechas detectadas en INTALES

Rutas relativas a `C:\SIP-APP\SIPAPP-INTALES\`. Prioridad pensada para que el motor contable (C2–C4) dé lo mismo que
CONCAR/StarSoft.

### Prioridad Alta

| # | Brecha | Dónde | Qué haría el contador / qué falta |
|---|---|---|---|
| B1 | **Ventas en US$ no soportadas**: `Factura` no tiene `moneda` ni `tipoCambio`; la venta se emite siempre en soles; la detracción de venta y los saldos no convierten | `Backend/src/models/Factura.js:38-41`; `Backend/src/utils/saldosTesoreria.js:133-140`; `Backend/src/routes/facturas.js:44-49,70-71`; `Frontend/src/components/ModalCrearFactura.jsx:234` | 1212 en ME con TC venta de emisión, cobro con diferencia de cambio (CP-15), ajuste de cierre (CP-17) |
| B2 | **NC de venta parcial anula el comprobante completo** y no rebaja la cuenta por cobrar; `Factura` no registra NC/ND de venta | `Backend/src/controllers/comprobante.controller.js:274-288` | La NC parcial rebaja el saldo y el débito fiscal; el origen sigue vigente (CP-16) |
| B3 | **Pagos y cobros guardan el TC del documento, no el del día**: sin diferencia de cambio en la cancelación ni datos para el ajuste de cierre | `Backend/src/utils/movimientos.js:76-77`; `Backend/src/models/MovimientoTesoreria.js:12` | TC SUNAT de la fecha del movimiento (compra/venta según se cancele activo o pasivo), importe en S/ y en US$ por movimiento, 676/776 (CP-12, CP-17) |
| B4 | **Resumen tributario solo de compras**: no hay débito fiscal, retenciones sufridas, percepciones, IGV a pagar ni pago a cuenta de renta | `Backend/src/utils/resumenTributario.js:6-41` | Cuadre completo con el PDT 621 (CP-22) |
| B5 | **Cuentas PCGE erróneas o inexistentes en el diseño y el spec C1**: 7041 es *Subproductos* (servicios = 7032/70321); 7011 es *exportación* (local = 7012/70121); 4241 y 6021 no existen en el PCGE (424 y 602 sin divisionarias); 921/941/951/971 son de libre definición; "detracciones por pagar (4011x)" no corresponde (la detracción de compras es parte de 4212; la de ventas va a 1042); "Detracción: Haber 104x (cuenta BN)" debe ser la cuenta operativa (1041), porque se deposita con fondos propios en el BN del proveedor | `Backend/docs/contabilidad/2026-10-01-motor-contable-design.md:65-67,79,83`; `Backend/docs/contabilidad/2026-10-01-c1-spec-implementacion.md:76-80` | Corregir el seed y la `ConfiguracionContable` antes de C1/C2 |
| B6 | **Comprobante de compra sin clasificación contable**: sin OC no hay concepto ni cuenta de gasto (solo centro de costo y OT); no distingue gasto / existencia / activo fijo; `TipoArticulo` no tiene cuenta | `Backend/src/models/FacturaProveedor.js:40-46`; `Backend/src/models/TipoArticulo.js` | Cuenta de gasto por comprobante o por línea (60x/63x/65x/33x) con destino; sin eso C2 no puede generar el asiento de compras |
| B7 | **Tesorería no admite movimientos sin documento**: pago de IGV/renta/PLAME/PDT 626 (incluido con fondos de detracciones), comisiones, ITF, intereses, préstamos, transferencias entre cuentas propias, aportes, caja chica; tampoco hay conciliación bancaria | `Backend/src/models/MovimientoTesoreria.js:18-22` (`documento` obligatorio) | Caja y Bancos (1.1/1.2), conciliación con el extracto, saldos reales de 10x |
| B8 | **Decisión pendiente: ¿INTALES lleva la contabilidad o la exporta al software del contador?** El encargo habla de "apoyo al contador externo que sigue con su software"; el diseño aprobado dice "contabilidad completa como CONCAR" y solo exporta PLE | `Backend/docs/contabilidad/2026-10-01-motor-contable-design.md` (Objetivo, Exportación PLE) | Si el contador sigue en CONCAR/StarSoft, falta exportar los asientos en su plantilla de importación (guía §5.3), con anexos y documentos |

### Prioridad Media

| # | Brecha | Dónde | Qué haría el contador / qué falta |
|---|---|---|---|
| B9 | Retención de 4.ª agrupada por mes de **emisión**; la obligación nace al pagar (PLAME del mes de pago); `pagado/pendiente` muestran el estado actual, no el del periodo | `Backend/src/utils/resumenTributario.js:22-31` | Agrupar por fecha del pago del neto (CP-06) |
| B10 | Periodo del RCE y del resumen = mes de emisión; no existe "periodo de anotación" (D. Leg. 1669: electrónicos en el mes, no electrónicos hasta 2 meses, SPOT hasta 3); no hay crédito fiscal diferido (1673) por detracción no depositada | `Backend/src/utils/resumenTributario.js:7-10`; `Backend/src/routes/sire.js:121-126` | Campo `periodoAnotacion` y estado del crédito (CP-07, CP-23) |
| B11 | Costo de OT por **caja** ("consumido" = pagado) y no por devengo; usa el TC de la OC (o el vigente, con 3.75 por defecto) en vez del TC del comprobante; sin CIF | `Backend/src/utils/costosOT.js:18-27,98`; `Backend/src/utils/compras.js:85-87` | 92 por OT al recibir el comprobante o la salida de almacén, al TC del comprobante; distribución de CIF (CP-20) |
| B12 | Las **salidas de almacén** a una OT (`MovimientoAlmacen.ordenTrabajo` + `precioUnitario`) no entran al costo de la OT; solo los ítems comprados | `Backend/src/utils/costosOT.js:142` | Consumo valorizado 61x/2x → 92 (kardex) |
| B13 | IGV sin crédito fiscal (boleta, ticket sin RUC con IGV desglosado) no se suma al costo de la OT | `Backend/src/utils/costosOT.js:127` | Costo = total cuando no hay crédito fiscal (CP-03) |
| B14 | Sin base no gravada / exonerada / inafecta, ISC, ICBPER ni otros tributos en compras (`total = subtotal + igv`); en ventas IGV 18 % fijo | `Backend/src/routes/facturasProveedor.js:76-82`; `Backend/src/routes/facturas.js:44-49` | Recibos de servicios públicos y tickets traen conceptos no gravados; el RCE los separa |
| B15 | Retención del IGV 3 % (INTALES agente) calculada al **registrar**, por comprobante y con el TC de emisión; no mide el umbral por pago, no retiene sobre pagos parciales, no emite el comprobante de retención (CRE) ni arma el PDT 626 | `Backend/src/routes/facturasProveedor.js:114-121`; `Backend/src/utils/impuesto.js:20` | Retención al pagar (CP-08) |
| B16 | Toda venta mayor a S/ 700 recibe detracción 037 por defecto, también la venta de bienes | `Backend/src/utils/saldosTesoreria.js:133-137` | Detracción según el tipo de operación (CP-14) |
| B17 | Aplicación de NC fechada con la emisión de la NC (incluso la aplicación manual posterior, y aunque el destino sea de fecha posterior) | `Backend/src/utils/notasCredito.js:33` | Canje en la fecha en que se aplica (CP-10) |
| B18 | Sin anticipos de clientes ni a proveedores (122/422), habituales en fabricación por OT | `Backend/src/models/MovimientoTesoreria.js:18-22`; `Backend/src/models/Factura.js` | Factura de anticipo, aplicación al comprobante final |
| B19 | El modelo `Asiento` del spec C1 no tiene **correlativo de línea** (A/M/C que exige el 5.1) ni tipo de moneda / documento del tercero en el formato del PLE | `Backend/docs/contabilidad/2026-10-01-c1-spec-implementacion.md` §4 | Agregarlo antes de C4 (el `numero` y el `cuo` del asiento sí sirven) |

### Prioridad Baja

| # | Brecha | Dónde | Qué haría el contador / qué falta |
|---|---|---|---|
| B20 | El backend permite pagar la detracción de una compra desde la cuenta BN de INTALES (el frontend sí lo filtra) | `Backend/src/utils/movimientos.js:56-58` | Rechazar cuenta tipo `detracciones` en el impuesto de compras (CP-07) |
| B21 | TC del recibo de servicios públicos (14) en US$: INTALES usa la fecha de emisión; StarSoft, la de vencimiento | `Backend/src/routes/facturasProveedor.js:100` | **[Confirmar]** con el contador |
| B22 | No hay reembolso en efectivo de un saldo a favor de NC de proveedor ni reclasificación de saldos deudores de la 42 al cierre | `Backend/src/utils/notasCredito.js` | Movimiento de ingreso contra la NC (CP-10) |
| B23 | Sin "destino del crédito fiscal" (gravadas / no gravadas / comunes) ni prorrata; hoy todo es gravado | `Backend/src/models/FacturaProveedor.js` | Campo con valor por defecto "gravadas" |
| B24 | ITF y redondeo de tributos a soles enteros no se registran | — | Movimientos sin documento (B7) |
| B25 | `pagado/pendiente` de la retención de 4.ª en el resumen mezclan el impuesto en soles con el documento cuando el RH está en US$ | `Backend/src/utils/resumenTributario.js:29-31` | Expresar todo en S/ |

### Puntos que debe confirmar el contador humano

1. TC de cobros y pagos en US$ (compra para cobros y venta para pagos, o venta para todo) y si la diferencia se
   registra en la cancelación o solo por regularización al cierre.
2. Método de costeo: compra directa a OT con destino sobre 60x, o flujo PCGE con almacén (60 → 2x/61 → 92); base de
   distribución de CIF; uso de 2151/2351/7151/6932 al cierre.
3. NC de proveedor: rebaja de la cuenta de compra (NIC 2) o 7311; NC de venta: 7411 o cargo a 7032x.
4. Cuenta de la BN de detracciones (1042 o 107) y crédito fiscal diferido (1673) hasta el depósito.
5. Retención de 4.ª al provisionar o al pagar; agrupación por mes de pago.
6. Vigencia del D. Leg. 1669 para INTALES y si el SIRE trae los importes en US$ en dólares o en soles.
7. Boletas en el RCE y su deducibilidad; tickets sin RUC como reparo.
8. Coeficiente del pago a cuenta de renta; códigos de destino 9x y desagregación del plan de cuentas (importar el del
   contador).
9. Si INTALES será el sistema contable oficial o un generador de asientos para importar en CONCAR/StarSoft (B8).
