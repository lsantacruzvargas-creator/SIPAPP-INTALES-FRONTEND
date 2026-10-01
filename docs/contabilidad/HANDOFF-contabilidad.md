# Traspaso — motor contable (2026-10-01)

Para el agente que continúe. Responder al usuario en español, conciso. Backend y Frontend son repos separados;
estos docs están idénticos en `docs/contabilidad/` de ambos.

## Estado

- Investigación: `docs/contabilidad/2026-10-01-investigacion-libros-electronicos.md`.
- Diseño **aprobado** (2026-10-01): `docs/contabilidad/2026-10-01-motor-contable-design.md`. Cierre y reapertura de
  mes: solo `tesorero`. Ingresos entre 300 y 1700 UIT y nunca > 1500 UIT (no aplica inventario permanente).
- Plan de la Fase C1: `docs/superpowers/plans/2026-10-01-contabilidad-c1-base.md`.
- **Spec de implementación de C1 (para el agente del editor de código):**
  `docs/contabilidad/2026-10-01-c1-spec-implementacion.md` — modelos, rutas, permisos, validaciones, pantallas,
  tests y criterios de aceptación.
- Código: nada implementado todavía.

## Siguiente paso

1. Implementar C1 siguiendo el spec de implementación: `feature/contabilidad` desde `main` en ambos repos, TDD, revisión.
2. Conseguir el **Anexo 2 consolidado** (estructuras 5.1, 5.3, 6.1, 1.x, 3.x) antes de la Fase C4; las páginas de
   orientación de SUNAT responden "Acceso denegado" desde la nube (sí descargan los PDF de
   `www.sunat.gob.pe/legislacion/...` con un User-Agent de navegador).
3. Mergear `feature/comprobantes-compra` antes de la Fase C2 (TC por fecha y tipos de comprobante).

## Convenciones

- Tests backend: `MONGO_URI_TEST="mongodb://localhost:27017/sipapp-intales-test?replicaSet=rs0" npm test`
  (MongoDB con replica set; en la nube se puede bajar de fastdl.mongodb.org, ya permitido en la red del entorno).
- Tests frontend: `npm test` (`node --test`); lintear solo archivos tocados; `npm run build`.
- Fechas en hora Lima; nunca `alert/confirm/prompt` (Electron).
- La rama `feature/comprobantes-compra` (Fases 1–2 de comprobantes, costos y TC) aún no está en `main`: el motor
  contable la necesita (TC por fecha, tipos de comprobante) — conviene mergearla antes de la Fase C2.
