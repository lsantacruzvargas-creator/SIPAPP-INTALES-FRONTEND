# Traspaso — motor contable (actualizado 2026-10-01, noche)

> Contexto general del proyecto, decisiones del usuario y comandos: **`docs/ESTADO-PROYECTO.md`**.

Para el agente que continúe. Responder al usuario en español, conciso. Backend y Frontend son repos separados;
estos docs están idénticos en `docs/contabilidad/` de ambos.

## Decisión de fondo (B8, resuelta 2026-10-01)

**INTALES exporta los asientos al software del contador**; no es la contabilidad oficial. C4 = exportación en la
plantilla de importación de su software (CONCAR/StarSoft, por confirmar); el PLE queda opcional y C5 en suspenso.
El plan de cuentas debe ser el del contador (se importa desde Excel).

## Estado

- **C1 implementada** en la rama `claude/affectionate-ride-1ql646` de ambos repos (sin merge a `main`):
  - Backend: `CuentaContable`, `PeriodoContable`, `Asiento`; `src/data/pcge.js` (PCGE 2019: cuentas de 2 dígitos y
    las subcuentas que usa INTALES, verificadas en la guía contable); carga automática al arrancar si el plan está
    vacío y `node src/scripts/seedPcge.js`; rutas `/api/contabilidad/cuentas` (incluye `POST /importar` del plan del
    contador), `/api/contabilidad/asientos` (manuales: crear, editar, anular con motivo), `/api/contabilidad/periodos`
    (lectura). Permisos: leen admin, jefatura, tesorero y contador; escriben admin y contador.
  - Frontend: página **Contabilidad** (`/contabilidad`, menú para admin, jefatura, tesorero y contador) con pestañas
    Asientos (filtros, exportar Excel, modal con cuadre en vivo, USD con TC SUNAT de la fecha, anular con motivo) y
    Plan de cuentas (árbol por elemento, búsqueda sin tildes, crear subcuenta, editar banderas y destino,
    activar/desactivar, **importar plan desde Excel**, exportar).
  - Tests: backend `test/contabilidad.test.js` (17); frontend `src/utils/contabilidad.test.js` (6). E2E con
    Playwright: subcuenta, asiento S/ y US$, descuadre bloqueado, anulación, tesorero/jefatura sin botones,
    facturación sin acceso, importación de Excel.
  - Registro y decisiones: `docs/superpowers/sdd/2026-10-01-contabilidad-c1/progress.md`.
- **C2 bloqueada por respuestas del contador**: `docs/contabilidad/2026-10-01-preguntas-contador-C2.md`
  (software y plantilla, plan de cuentas, anexos, subdiarios, destinos, cuenta por tipo de compra — brecha B6 —,
  costeo de OT, NC, bancos, criterios tributarios).
- Documentos previos: investigación (`2026-10-01-investigacion-libros-electronicos.md`), diseño
  (`2026-10-01-motor-contable-design.md`, con el cambio de alcance arriba), spec C1, guía contable y casos de prueba
  (23 casos, brechas B1–B25; B1–B5 y B9 resueltas en `main`; B8 resuelta: exportar).

## Siguiente paso

1. El usuario envía `2026-10-01-preguntas-contador-C2.md` al contador y trae: plantilla de importación de ejemplo,
   plan de cuentas en Excel, códigos de anexos/subdiarios/centros de costo y las respuestas.
2. Con eso: spec de C2 (`ConfiguracionContable` con las cuentas del contador, cuenta por tipo de artículo y por
   comprobante, asientos automáticos en borrador, bandeja de revisión) y rediseño de C4 como exportación a su plantilla.
3. Pendiente menor de C1 para C4: correlativo de línea (B19) si la plantilla del contador lo pide.

## Convenciones

- Tests backend: `MONGO_URI_TEST="mongodb://localhost:27017/sipapp-intales-test?replicaSet=rs0" npm test`
  (MongoDB con replica set; en la nube se baja de fastdl.mongodb.org, permitido en la red del entorno).
- Tests frontend: `npm test` (`node --test`); lintear solo archivos tocados; `npm run build`.
- Fechas en hora Lima; nunca `alert/confirm/prompt` (Electron).
