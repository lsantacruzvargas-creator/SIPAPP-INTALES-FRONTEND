# Traspaso — rama `feature/comprobantes-compra` (actualizado 2026-10-01)

Para el agente que continúe o revise. Responder al usuario en español. Backend y Frontend son **repos separados**
(`SIPAPP-INTALES-BACKEND` y `SIPAPP-INTALES-FRONTEND`), ambos con la rama `feature/comprobantes-compra`
creada desde `main`. Spec, planes y registros de avance están copiados en `docs/superpowers/` de **ambos** repos
(este archivo también es idéntico en los dos).

**Siguiente paso esperado: revisión del código de las Fases 1 y 2 por el agente del editor de código**
(ver "Qué revisar" abajo). No mergear a `main` sin el OK del usuario.

## Documentos

- Spec (aprobado por el usuario): `docs/superpowers/specs/2026-09-30-comprobantes-compra-design.md`.
  Al final tiene las secciones "Estado — Fase 1" (con los menores diferidos M3–M8) y "Estado — Fase 2".
- Fase 1 — plan: `docs/superpowers/plans/2026-09-30-costos-comprometido-consumido.md`;
  avance: `docs/superpowers/sdd/2026-09-30-costos-comprometido-consumido/progress.md`.
- Fase 2 — plan: `docs/superpowers/plans/2026-10-01-tc-comprobantes-usd.md`;
  avance: `docs/superpowers/sdd/2026-10-01-tc-comprobantes-usd/progress.md`.

## Fase 1 — costos comprometido/consumido + TC por fecha + selector de moneda (terminada)

- Backend (147 tests al cerrar la Fase 1): `OrdenCompraProveedor.tipoCambio`; `utils/costosOT.js` (`costosPorOT`,
  `fraccionPagada`); `GET /reportes/costos-fabricacion` y `/:otId`; `models/TipoCambioDia.js` y `utils/tipoCambioDia.js`
  (BD antes que apiperu, "hoy" provisional 3 h, respaldo al último guardado y luego al TC vigente, fechas ≥ 2000,
  una consulta por fecha en curso); `GET /sunat/tipo-cambio?fecha=`.
- Frontend: `utils/costos.js`, `components/SelectorMonedaTC.jsx`, `pages/Reportes.jsx`, `components/DetalleOrdenCompra.jsx`,
  `ModalReporteCosto.jsx`, `pages/TipoCambio.jsx`.
- Revisión final hecha; corregidos C1, I1, I2, I3, M1 y M2 (los cuatro últimos en el commit del frontend
  `fix(costos): TC sin consulta doble ni por tecla…`). Menores diferidos M3–M8 en el spec (M5 se cerró en la Fase 2).
- Probado en navegador con backend real (ver progress de la Fase 1).

## Fase 2 — TC automático en comprobantes en USD (implementada, pendiente de revisión)

- Backend: `utils/tipoCambioDia.js` (`TC_MIN`/`TC_MAX`/`tcEnRango`, timeout 8 s a apiperu, respuesta fuera de rango =
  falla); `routes/facturasProveedor.js` (USD fuera de 2–6 → 400). Tests nuevos en `test/tipoCambioDia.test.js` y
  `test/facturasProveedor.test.js`.
- Frontend: `utils/tesoreria.js` (`estadoTcComprobante`, `tcValido`, `fechaConsultableTc`, con tests) y
  `components/tesoreria/ModalFacturaProveedor.jsx` (consulta por fecha de emisión en USD, solo lectura con TC SUNAT,
  editable con aviso si es respaldo o falla, botón deshabilitado mientras consulta o fuera de rango).
- Verificado: backend `npm test` **151/151** (MongoDB 8.0 con replica set, sin omitidos; la primera corrida halló que el
  rango 2–6 rompía los comprobantes en PEN y se corrigió), frontend `npm test` 42/42, eslint sin errores en los archivos
  tocados, `npm run build` OK; navegador con Playwright contra una **API simulada** (no el backend real).

## Qué revisar (agente del editor de código)

1. Backend: `MONGO_URI_TEST="mongodb://localhost:27017/sipapp-intales-test?replicaSet=rs0" npm test` — ya dio 151/151
   en la sesión de la nube; confirmar en local.
2. Frontend: `npm test`, `npx eslint` de los archivos tocados y `npm run build`.
3. Probar con backend real (no se pudo en la nube): comprobante en USD de una OC y sin OC; cambiar la fecha de emisión (TC solo lectura y
   correcto); simular apiperu caído (respaldo propuesto y editable); TC 37.5 rechazado por el servidor.
4. Revisar el diff de la rama contra `main` en ambos repos (`git diff main...feature/comprobantes-compra`) buscando
   bugs; puntos a mirar: el efecto de `ModalFacturaProveedor` al volver de PEN a USD con la misma fecha vuelve a
   consultar y reemplaza un TC escrito a mano; los `Ruling:` de los progress.
5. Con todo verde, preguntar al usuario si mergea `feature/comprobantes-compra` a `main` en ambos repos (`main`
   despliega a Railway/Cloudflare; el sistema **aún no está en producción**).

## Fases siguientes del spec (cada una con su propio plan, mismo flujo: plan → aprobación → TDD → revisión)

- Fase 3: tipos 12 (ticket, casilla "Trae RUC de INTALES e IGV desglosado") y 14; `creditoFiscal` derivado;
  retención 4ta **manual** (8 %, solo tipo 02); "Ya se pagó".
- Fase 4: notas de crédito/débito aplicadas al origen, saldo a favor y "Aplicar a…"; su efecto en costos.
- Fase 5: cruce SIRE con tipos nuevos (NC en valor absoluto, sin tipo 02, comparación de TC mostrando TC del
  sistema / SIRE / SUNAT de la fecha) y resumen tributario mensual exportable a Excel.

## Convenciones

- Tests backend: `MONGO_URI_TEST="mongodb://localhost:27017/sipapp-intales-test?replicaSet=rs0" npm test`
  (requiere MongoDB con replica set; en la nube levantar un `mongod --replSet rs0` e iniciarlo con `rs.initiate()`).
- Tests frontend: `npm test` (`node --test src/utils/*.test.js`, no vitest). El lint global tiene errores previos en
  archivos ajenos: lintear solo los archivos tocados.
- Commits terminan con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Nunca `alert/confirm/prompt` (Electron); fechas siempre en hora Lima (`utils/fecha`, `aFechaLima`).
- Respuestas al usuario: concisas, en español, sin resúmenes largos.
