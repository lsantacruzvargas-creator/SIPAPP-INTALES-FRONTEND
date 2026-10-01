# Traspaso — rama `feature/comprobantes-compra` (2026-09-30)

Para el agente que continúe. Responder al usuario en español. Backend y Frontend son **repos separados**
(`SIPAPP-INTALES-BACKEND` y `SIPAPP-INTALES-FRONTEND`), ambos con la rama `feature/comprobantes-compra`
creada desde `main`. Spec, plan y registro de avance están copiados en `docs/superpowers/` de **ambos** repos.

## Documentos

- Spec: `docs/superpowers/specs/2026-09-30-comprobantes-compra-design.md` (aprobado por el usuario).
- Plan de la Fase 1: `docs/superpowers/plans/2026-09-30-costos-comprometido-consumido.md`.
- Registro de avance (decisiones `Ruling:` y hallazgos): `docs/superpowers/sdd/2026-09-30-costos-comprometido-consumido/progress.md`.

## Estado de la Fase 1 (costos comprometido/consumido + TC por fecha + selector de moneda)

Tareas 1–5 del plan **hechas y commiteadas**; Task 6 (verificación) en curso:

- Backend (147/147 tests): `OrdenCompraProveedor.tipoCambio`; `utils/costosOT.js` (`costosPorOT`, `fraccionPagada`);
  `GET /reportes/costos-fabricacion` y `GET /reportes/costos-fabricacion/:otId`; `models/TipoCambioDia.js` y
  `utils/tipoCambioDia.js` (BD antes que apiperu, "hoy" provisional 3 h, respaldo al último guardado y luego al
  TC vigente, fechas reales ≥ 2000, una consulta por fecha en curso); `GET /sunat/tipo-cambio?fecha=`.
- Frontend (38/38 tests): `utils/costos.js` (`convertir`, `costoEn`, filas), `components/SelectorMonedaTC.jsx`,
  `pages/Reportes.jsx` (resumen + tablas comprometido/consumido + Excel con moneda y TC),
  `components/DetalleOrdenCompra.jsx` y `ModalReporteCosto.jsx` (tarjeta desde el servidor, en S/ o US$).
- Probado en navegador (Playwright): OCP sin pagar → comprometido; factura pagada → consumido; US$ al TC de
  hoy y del 25/09 (segunda consulta desde la BD); tarjeta = reporte; Excel correcto.
- Revisión final (opus): Critical C1 (doble conteo con SC compradas en parte) e Important I1 (fracción pagada en
  USD), I2/I3 backend **corregidos con tests** (commit `fix(costos): sin doble conteo…`).

## Pendiente inmediato (antes de mergear la Fase 1)

Corregir en el **Frontend**, con test donde haya lógica pura (`npm test`), lint sin errores nuevos (`npx eslint <archivo>`) y `npm run build`:

1. **I2 (consulta doble)** — `components/DetalleOrdenCompra.jsx`: el `useEffect` que pide `/sunat/tipo-cambio`
   debe correr solo con el desglose cerrado: agregar `reporteOpen` a la condición y a las dependencias
   (`if (!puedeVerReporte || reporteOpen || vista.tc || vista.error) return;`), porque con el modal abierto ya
   lo pide `SelectorMonedaTC`.
2. **I3 (consultas por tecla)** — `components/SelectorMonedaTC.jsx`: en el `onChange` del `<input type="date">`
   ignorar valores vacíos o `< "2000-01-01"` (no llamar `onCambio`). Esto también resuelve **M1** (borrar la
   fecha dejaba "Consultando…" para siempre).
3. **M2 (re-graduado a Important)** — `pages/TipoCambio.jsx` (~líneas 30-110): la ruta `/sunat/tipo-cambio` ahora
   responde 200 con `fuente: "respaldo" | "vigente"` cuando apiperu falla. Mostrar la fecha real y la fuente
   ("SUNAT 29/09", "último guardado 26/09", "TC vigente del sistema") y **ocultar el botón "Usar valor SUNAT"**
   salvo `fuente` `apiperu` o `bd`.
4. Commit, registrar en `progress.md` (`Final: fixed …`), y anotar en el spec (sección nueva "Estado — Fase 1")
   los **menores diferidos** de la revisión: M3 flete de líneas de OCP de SC "manual" no llega a la OT; M4
   `costosPorOT` carga todas las FacturaProveedor (proyección `-archivos` y filtro por OCP/OT; sin índices);
   M5 validar TC 2–6 y timeout de 8 s a apiperu; M6 columna TC vacía en el Excel en S/ con OC en USD;
   M7 mensajes de la tarjeta ("Sin OT vinculada" mientras carga / ante 403); M8 `ocPorCot` sin `sort`
   (`.sort({ createdAt: 1 })`).
5. Preguntar al usuario si mergea `feature/comprobantes-compra` a `main` (no mergear ni pushear `main` sin su OK;
   `main` despliega a Railway/Cloudflare, aunque el sistema **aún no está en producción**).

## Fases siguientes del spec (cada una con su propio plan, mismo flujo: plan → aprobación → TDD → revisión)

- Fase 2: (el TC por fecha ya se adelantó) — usar el TC automático en el formulario de comprobantes USD.
- Fase 3: tipos 12 (ticket, casilla "Trae RUC de INTALES e IGV desglosado") y 14; `creditoFiscal` derivado;
  retención 4ta **manual** (8 %, solo tipo 02); "Ya se pagó".
- Fase 4: notas de crédito/débito aplicadas al origen, saldo a favor y "Aplicar a…"; su efecto en costos.
- Fase 5: cruce SIRE con tipos nuevos (NC en valor absoluto, sin tipo 02, comparación de TC mostrando TC del
  sistema / SIRE / SUNAT de la fecha) y resumen tributario mensual exportable a Excel.

## Convenciones

- Tests backend: `MONGO_URI_TEST="mongodb://localhost:27017/sipapp-intales-test?replicaSet=rs0" npm test`
  (requiere MongoDB con replica set; en la nube levantar un `mongod --replSet rs0` e iniciarlo con `rs.initiate()`).
- Commits terminan con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Nunca `alert/confirm/prompt` (Electron); fechas siempre en hora Lima (`utils/fecha`, `aFechaLima`).
- Respuestas al usuario: concisas, en español, sin resúmenes largos.
