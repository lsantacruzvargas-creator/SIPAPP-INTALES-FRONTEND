# Traspaso — motor contable (2026-10-01)

Para el agente que continúe. Responder al usuario en español, conciso. Backend y Frontend son repos separados;
estos docs están idénticos en `docs/contabilidad/` de ambos.

## Estado

- Investigación: `docs/contabilidad/2026-10-01-investigacion-libros-electronicos.md` (SUNAT, ERP, qué hay en INTALES,
  decisiones del usuario).
- Diseño: `docs/contabilidad/2026-10-01-motor-contable-design.md` — **borrador, pendiente de aprobación del usuario**.
- Código: nada implementado todavía.

## Siguiente paso

1. Que el usuario apruebe (o corrija) el diseño. Puntos a confirmar explícitamente: quién **reabre** un mes cerrado
   (propuesto: solo admin/contador, con motivo), y el riesgo de las 1500 UIT (inventario permanente 12.1).
2. Conseguir el **Anexo 2 consolidado** (estructuras 5.1, 5.3, 6.1, 1.x, 3.x) antes de la Fase C4; las páginas de
   orientación de SUNAT responden "Acceso denegado" desde la nube (sí descargan los PDF de
   `www.sunat.gob.pe/legislacion/...` con un User-Agent de navegador).
3. Fase C1 con su plan (`docs/superpowers/plans/…`), TDD y revisión, igual que las fases de comprobantes-compra.

## Convenciones

- Tests backend: `MONGO_URI_TEST="mongodb://localhost:27017/sipapp-intales-test?replicaSet=rs0" npm test`
  (MongoDB con replica set; en la nube se puede bajar de fastdl.mongodb.org, ya permitido en la red del entorno).
- Tests frontend: `npm test` (`node --test`); lintear solo archivos tocados; `npm run build`.
- Fechas en hora Lima; nunca `alert/confirm/prompt` (Electron).
- La rama `feature/comprobantes-compra` (Fases 1–2 de comprobantes, costos y TC) aún no está en `main`: el motor
  contable la necesita (TC por fecha, tipos de comprobante) — conviene mergearla antes de la Fase C2.
