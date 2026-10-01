# Comprobantes de compra — Fase 5 (SIRE + resumen tributario) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Conciliar el RCE del SIRE con los tipos nuevos (sin RH, NC en negativo, tipo de cambio) y dar a Tesorería un resumen tributario mensual exportable a Excel.

**Architecture:** El parser SIRE lee también el TC; `conciliar` compara montos en valor absoluto y el TC en USD; la ruta de conciliación agrega a cada fila con TC distinto el TC SUNAT de su fecha (`tipoCambioDelDia`). Un endpoint nuevo `GET /tesoreria/resumen-tributario?periodo=YYYY-MM` arma totales y detalle en S/; el frontend agrega una pestaña con tabla y Excel.

**Tech Stack:** Node 24 ESM, Express 4, Mongoose 8, `node:test` (replica set); React 19 + Vite + Tailwind; `xlsx` vía `utils/exportarTabla.js`.

**Spec:** `docs/superpowers/specs/2026-09-30-comprobantes-compra-design.md` (regla 8 "SIRE (RCE)" y pantalla "Resumen tributario").

## Global Constraints

- Fechas en hora Lima; periodo del resumen = mes de emisión en Lima (`T00:00:00-05:00`).
- Montos en S/: USD × `tipoCambio` del comprobante; redondeo a 2 decimales en el servidor.
- Crédito fiscal: `f.creditoFiscal ?? creditoFiscalDe({...f, origen})` (comprobantes antiguos sin el campo).
- Nunca `alert/confirm/prompt`. Roles: los de `puedeTesoreria`.
- Tests backend: `MONGO_URI_TEST="mongodb://localhost:27017/sipapp-intales-test?replicaSet=rs0" npm test`.

## Review Focus

1. NC en el SIRE con total e IGV negativos frente a la NC del sistema en positivo → debe dar "coincide".
2. Recibo por honorarios (02) y ticket sin RUC (12 sin `ticketConRuc`) → no deben salir "solo en el sistema".
3. Comprobante USD con TC distinto en SIRE → "difiere" con TC del sistema, del SIRE y SUNAT; si la consulta SUNAT falla, la fila sale igual (sin TC SUNAT), no un 500.
4. Resumen: NC con crédito resta base e IGV; NC/ND de un comprobante sin crédito van a "sin crédito"; comprobantes anulados no entran.
5. Precarga "Registrar" desde una NC del SIRE (montos negativos) → subtotal positivo; ticket 12 del SIRE → `ticketConRuc` marcado.

---

### Task 1: SIRE RCE — tipos nuevos, NC en negativo y tipo de cambio (backend)

**Files:**
- Modify: `Backend/src/utils/sireParser.js` (columna `tipoCambio`; RVIE índice 27)
- Modify: `Backend/src/models/PropuestaSire.js` (campo `tipoCambio: Number`)
- Modify: `Backend/src/utils/conciliacionSire.js` (valor absoluto, diferencia `tipoCambio`)
- Modify: `Backend/src/routes/sire.js` (`registrosDelSistema` RCE sin 02 ni 12 sin RUC, con `tipoCambio`; conciliación agrega `tc`)
- Modify: `Backend/test/fixtures/sire.js` (`lineaRce` con `tipo`, `moneda`, `tc`)
- Test: `Backend/test/sire.test.js`

**Interfaces:**
- Produces: filas de `/sire/RCE/:periodo/conciliacion` con `diferencias` que puede incluir `"tipoCambio"` y, en ese caso, `tc: { sistema, sire, sunat, fechaTc }` (`sunat`/`fechaTc` null si la consulta falla). `sire.tipoCambio` y `sistema.tipoCambio` numéricos.

- [ ] **Step 1: Tests que fallan**

```js
test("conciliar: NC del SIRE en negativo coincide con la NC del sistema; TC distinto en USD difiere", () => {
  const nc = { rucContraparte: "20100000001", tipo: "07", serie: "FC01", numero: "5", fechaEmision: "2026-09-28", moneda: "PEN" };
  const usd = { rucContraparte: "20100000001", tipo: "01", serie: "F001", numero: "9", fechaEmision: "2026-09-28", moneda: "USD", total: 118, igv: 18 };
  const r = conciliar(
    [{ ...nc, total: -118, igv: -18, tipoCambio: 1 }, { ...usd, tipoCambio: 3.75 }],
    [{ ...nc, total: 118, igv: 18, tipoCambio: 1 }, { ...usd, tipoCambio: 3.7 }],
  );
  assert.equal(r[0].estado, "coincide");
  assert.deepEqual(r[1].diferencias, ["tipoCambio"]);
});

test("RCE: sin recibos por honorarios ni tickets sin RUC; TC distinto trae el TC SUNAT de la fecha", async () => {
  // factura USD 3.70 en el sistema, SIRE con 3.75; TC SUNAT guardado 3.72; RH 02 y ticket 12 sin RUC registrados
  ...
  const conc = await srv.api("GET", "/api/sire/RCE/202609/conciliacion");
  const fila = conc.data.find((c) => c.clave.endsWith("|F001|900"));
  assert.deepEqual(fila.diferencias, ["tipoCambio"]);
  assert.deepEqual({ ...fila.tc, fechaTc: undefined }, { sistema: 3.7, sire: 3.75, sunat: 3.72, fechaTc: undefined });
  assert.ok(!conc.data.some((c) => c.estado === "solo_sistema"));
});
```

- [ ] **Step 2:** correr `node --test test/sire.test.js` → FAIL (sin `tipoCambio`, NC "difiere", RH/ticket "solo en el sistema").
- [ ] **Step 3: Implementar**
  - Parser: `tipoCambio: primera((c) => c.startsWith("tipo de cambio") || c === "tipo cambio")`; RVIE `tipoCambio: 27`; fila `tipoCambio: idx.tipoCambio >= 0 ? numero(c[idx.tipoCambio]) || 1 : 1`.
  - `conciliar`: total e IGV con `Math.abs`; si ambas monedas son USD y los dos TC > 0 y `|a−b| > 0.0005` → `"tipoCambio"`.
  - `registrosDelSistema` RCE: filtro `tipoComprobante: { $ne: "02" }` y descartar `12` sin `ticketConRuc`; mapear `tipoCambio`.
  - Ruta conciliación: para filas con `"tipoCambio"`, `tipoCambioDelDia(fecha)` (una vez por fecha; `catch` → null) y `tc: { sistema, sire, sunat: venta, fechaTc }`.
- [ ] **Step 4:** `node --test test/sire.test.js` → PASS; suite completa verde.
- [ ] **Step 5:** commit `feat(sire): RCE con tipos nuevos, NC en negativo y tipo de cambio`.

### Task 2: SIRE en pantalla — columna TC y precarga (frontend)

**Files:**
- Modify: `Frontend/src/utils/tesoreria.js` (`precargaDesdeSire(s, proveedores)`, `textoTcSire(tc)`)
- Modify: `Frontend/src/components/tesoreria/ModalFacturaProveedor.jsx` (usa `precargaDesdeSire`)
- Modify: `Frontend/src/components/tesoreria/PanelSire.jsx` (columna "TC", detalle de TC, Excel con TC SISTEMA / TC SIRE / TC SUNAT)
- Test: `Frontend/src/utils/tesoreria.test.js`

**Interfaces:**
- Consumes: `tc` de Task 1.
- Produces: `precargaDesdeSire(s, proveedores) → objeto parcial del form` (subtotal en valor absoluto, `ticketConRuc: s.tipo === "12"`); `textoTcSire(tc) → "sistema 3.700 · SIRE 3.750 · SUNAT 3.720 (25/09)"`.

- [ ] **Step 1: Tests que fallan**

```js
test("precargaDesdeSire: NC en negativo da subtotal positivo; ticket del SIRE trae RUC", () => {
  const p = precargaDesdeSire({ rucContraparte: "1", tipo: "07", serie: "FC01", numero: "5", fechaEmision: "2026-09-28", moneda: "PEN", baseImponible: -100, igv: -18, total: -118 }, []);
  assert.equal(p.subtotal, "100");
  assert.equal(p.conIgv, true);
  assert.equal(precargaDesdeSire({ tipo: "12", total: 59, igv: 9, baseImponible: 50 }, []).ticketConRuc, true);
});
test("textoTcSire muestra los tres TC; sin SUNAT lo dice", () => {
  assert.equal(textoTcSire({ sistema: 3.7, sire: 3.75, sunat: 3.72, fechaTc: "2026-09-25" }), "sistema 3.700 · SIRE 3.750 · SUNAT 3.720 (25/09)");
  assert.equal(textoTcSire({ sistema: 3.7, sire: 3.75, sunat: null }), "sistema 3.700 · SIRE 3.750 · SUNAT no disponible");
});
```

- [ ] **Step 2:** `npm test` → FAIL (funciones no existen).
- [ ] **Step 3:** implementar; `CAMPOS` suma `["tipoCambio", "tipoCambio"]` con cabecera "TC" (solo USD muestra valor, PEN "—"); celda con `textoTcSire(f.tc)` debajo cuando difiere.
- [ ] **Step 4:** `npm test`, `npx eslint` de los archivos, `npm run build` → OK.
- [ ] **Step 5:** commit `feat(sire): columna TC con TC SUNAT de la fecha y precarga de NC/tickets`.

### Task 3: Resumen tributario (backend)

**Files:**
- Create: `Backend/src/utils/resumenTributario.js` (`resumenTributario(periodo)`)
- Modify: `Backend/src/routes/tesoreria.js` (`GET /resumen-tributario?periodo=YYYY-MM`, 400 si el periodo no calza)
- Test: `Backend/test/resumenTributario.test.js`

**Interfaces:**
- Produces: `{ periodo, totales: { conCredito: { base, igv, total }, sinCredito: { total }, retencion4ta: { retenido, pagado, pendiente } }, detalle: [{ _id, codigo, fechaEmision, tipoComprobante, serie, numero, proveedorRuc, proveedorRazonSocial, moneda, tipoCambio, base, igv, total, baseSoles, igvSoles, totalSoles, creditoFiscal, retencion4ta }] }` — `baseSoles/igvSoles/totalSoles` con signo (NC negativa); `retencion4ta` en S/ (0 si no aplica).

- [ ] **Step 1: Tests que fallan** — mes con: factura 01 PEN (300/54), NC 07 de esa factura (100/18), factura USD (100/18, TC 3.7), boleta 03 (sin crédito, 118), RH 02 con 4ta (1000, retenido 80, sin pagar), factura anulada, factura de otro mes.

```js
assert.deepEqual(r.totales.conCredito, { base: 570, igv: 102.6, total: 672.6 }); // 300−100+370 ; 54−18+66.6
assert.equal(r.totales.sinCredito.total, 1118);
assert.deepEqual(r.totales.retencion4ta, { retenido: 80, pagado: 0, pendiente: 80 });
assert.equal(r.detalle.length, 5);
assert.equal(r.detalle.find((d) => d.tipoComprobante === "07").totalSoles, -118);
// periodo inválido → 400
```

- [ ] **Step 2:** `node --test test/resumenTributario.test.js` → FAIL (ruta 404).
- [ ] **Step 3:** implementar (orígenes de notas cargados en un `Map` para el crédito fiscal derivado; signo −1 para 07; RH: base = subtotal, igv 0, sin crédito).
- [ ] **Step 4:** test PASS; suite completa verde.
- [ ] **Step 5:** commit `feat(tesorería): resumen tributario mensual`.

### Task 4: Pestaña "Resumen tributario" (frontend)

**Files:**
- Modify: `Frontend/src/utils/tesoreria.js` (`filasExcelResumen(detalle)`)
- Create: `Frontend/src/components/tesoreria/PanelResumenTributario.jsx`
- Modify: `Frontend/src/pages/Tesoreria.jsx` (pestaña `resumen-tributario`)
- Test: `Frontend/src/utils/tesoreria.test.js`

**Interfaces:**
- Consumes: respuesta de Task 3.
- Produces: `filasExcelResumen(detalle) → [{ FECHA, TIPO, COMPROBANTE, RUC, "RAZÓN SOCIAL", MONEDA, TC, BASE, IGV, TOTAL, "BASE S/", "IGV S/", "TOTAL S/", "CRÉDITO FISCAL", "RETENCIÓN 4TA S/" }]`.

- [ ] **Step 1: Test que falla**

```js
test("filasExcelResumen: una fila por comprobante, NC en negativo, crédito Sí/No", () => {
  const [f] = filasExcelResumen([{ fechaEmision: "2026-09-28T05:00:00.000Z", tipoComprobante: "07", serie: "FC01", numero: "5", proveedorRuc: "1", proveedorRazonSocial: "P", moneda: "PEN", tipoCambio: 1, base: 100, igv: 18, total: 118, baseSoles: -100, igvSoles: -18, totalSoles: -118, creditoFiscal: true, retencion4ta: 0 }]);
  assert.equal(f["TOTAL S/"], -118);
  assert.equal(f["CRÉDITO FISCAL"], "Sí");
  assert.equal(f.FECHA, "28/09/2026");
  assert.equal(f.TIPO, "Nota de crédito");
});
```

- [ ] **Step 2:** `npm test` → FAIL.
- [ ] **Step 3:** implementar util + panel (mes `<input type="month">`, tarjetas de totales, tabla de detalle, "Exportar a Excel" con `exportarHoja`, errores inline) + pestaña.
- [ ] **Step 4:** `npm test`, eslint, build → OK.
- [ ] **Step 5:** commit `feat(tesorería): pestaña Resumen tributario con Excel`.

### Task 5: Prueba en navegador (Playwright)

- [ ] Entorno E2E (backend 8090 sobre 27018, frontend 5180). Registrar en septiembre una factura, su NC, una boleta y un RH con 4ta; abrir "Resumen tributario": totales correctos, NC en rojo/negativa, exportar Excel (capturar blob). SIRE: subir un TXT con una NC negativa y una factura USD con TC distinto → "Coincide" y "Difiere" con el texto de los tres TC.
- [ ] Anotar el resultado en el ledger.
