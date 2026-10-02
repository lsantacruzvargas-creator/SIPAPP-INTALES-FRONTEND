# Instrucciones para agentes — SIPAPP-INTALES

Antes de trabajar, lee **`docs/ESTADO-PROYECTO.md`**: estado de cada módulo, decisiones del usuario (no re-preguntar),
pendientes, comandos de tests/E2E y flujo de trabajo. El motor contable tiene su propio traspaso en
`docs/contabilidad/HANDOFF-contabilidad.md`.

- Responde al usuario en español, conciso.
- Backend y Frontend son repos separados; los cambios suelen tocar ambos (misma rama `feature/<tema>` en los dos).
- No mergees ni subas `main` sin el OK explícito del usuario; corre la suite completa sobre el resultado del merge.
- Fechas en hora Lima; nunca `alert/confirm/prompt` (la app corre en Electron); validar en el servidor con listas blancas.
- Tests backend: `MONGO_URI_TEST="mongodb://localhost:27017/sipapp-intales-test?replicaSet=rs0" npm test`.

## Aviso al abrir el proyecto

Al empezar una sesión, recuérdale al usuario en una línea lo pendiente de `docs/ESTADO-PROYECTO.md` §5: la tarea
**saldos de tesorería** (saldo inicial, ingreso/egreso manual, saldo insuficiente — aprobada, sin código, con las
lecciones de Micronegocios anotadas ahí) y las ramas `feature/*` que esperan su OK para mergear.
