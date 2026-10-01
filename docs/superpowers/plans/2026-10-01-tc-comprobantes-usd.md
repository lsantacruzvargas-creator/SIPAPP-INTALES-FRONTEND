# Plan — Fase 2: TC automático en comprobantes de compra en USD

Spec: `docs/superpowers/specs/2026-09-30-comprobantes-compra-design.md`, regla 7 (y menor M5 de la Fase 1).
Rama: `feature/comprobantes-compra` en backend y frontend.

## Objetivo

Al registrar un comprobante de proveedor en USD, el tipo de cambio es el TC venta SUNAT de la **fecha de emisión**,
traído de `GET /sunat/tipo-cambio?fecha=` (histórico en BD antes que apiperu, Fase 1) y **solo lectura**. Si la ruta
no pudo dar el valor SUNAT de esa fecha, el campo queda editable con un aviso. El servidor valida el rango 2–6.

## Tareas

1. **Backend — rango y timeout** (`src/utils/tipoCambioDia.js`, `src/routes/facturasProveedor.js`)
   - `TC_MIN = 2`, `TC_MAX = 6`, `tcEnRango()` exportados.
   - `consultarApiperu` con `AbortSignal.timeout(8000)` (`TIMEOUT_APIPERU_MS`).
   - Una respuesta de apiperu fuera de rango se trata como falla: no se guarda y se usa el respaldo.
   - `POST /facturas-proveedor` en USD: sin TC → 400 (como antes); fuera de 2–6 → 400 "Tipo de cambio fuera de rango (2–6)".
   - Tests: `test/tipoCambioDia.test.js` (respuesta fuera de rango, `tcEnRango`) y `test/facturasProveedor.test.js` (USD sin TC, fuera de rango, en rango se guarda tal cual).
2. **Frontend — lógica pura** (`src/utils/tesoreria.js` + test)
   - `estadoTcComprobante({ ok, datos, mensaje })` → `{ tc, soloLectura, aviso, alerta }`:
     fuente `apiperu`/`bd` → solo lectura, "TC venta SUNAT dd/mm"; `respaldo`/`vigente` → valor propuesto editable con aviso;
     error → vacío y editable, "<mensaje del servidor o genérico>: escríbelo".
   - `tcValido` (2–6, igual que el servidor) y `fechaConsultableTc` (no consultar fechas vacías ni < 2000 al teclear).
3. **Frontend — formulario** (`src/components/tesoreria/ModalFacturaProveedor.jsx`)
   - Efecto por `claveTc` (fecha de emisión cuando la moneda es USD): pide el TC, descarta respuestas viejas y fija `form.tipoCambio`.
   - Campo: "Consultando SUNAT…" mientras carga, solo lectura con el TC SUNAT, aviso debajo, "Debe estar entre 2 y 6".
   - "Registrar factura" deshabilitado en USD mientras consulta o con TC fuera de rango.
4. **Verificación**: `npm test` (front), `npx eslint` de los archivos tocados, `npm run build`; backend con MongoDB replica set; navegador.
