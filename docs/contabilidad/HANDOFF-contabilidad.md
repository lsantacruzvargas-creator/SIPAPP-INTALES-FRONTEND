# Traspaso — motor contable (actualizado 2026-10-01, tarde)

> Contexto general del proyecto, decisiones del usuario y comandos: **`docs/ESTADO-PROYECTO.md`**.

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
- **Guía contable** y **casos de prueba** (agente contador, contra CONCAR/StarSoft):
  `docs/contabilidad/2026-10-01-guia-contable-mediana-empresa.md` y `2026-10-01-casos-prueba-contables.md`
  (23 casos con asientos esperados, saldos de control y brechas B1–B20). También como skill global `contabilidad-peru`.
- **Cuentas PCGE corregidas** en el diseño y en el spec C1 (brecha B5): ventas 70321/70221/70121, honorarios 424,
  materias primas 602, detracción de compras dentro de 4212 (depósito desde 1041), detracción de ventas a 1042.
- Ya resuelto en `main` y disponible para el motor: B1 ventas en US$ (`Factura.moneda/tipoCambio`), B2 NC de venta
  parcial (`Factura.notasCredito/aplicadoNC`), B3 TC del día y diferencia de cambio por movimiento
  (`MovimientoTesoreria.tipoCambio/tipoCambioDoc/difCambio`) y reporte de cierre (`GET /tesoreria/diferencia-cambio`),
  B4 resumen tributario completo (`GET /tesoreria/resumen-tributario`), B9 retención 4ta por mes de pago.
- Roles `tesorero` y `contador` **ya existen** (ven Tesorería, facturas y comprobantes). El cierre/reapertura de mes
  del diseño queda para `tesorero`.
- Factura de venta y comprobante SUNAT se ligan en el servidor al crear la factura (`Comprobante.facturaInterna`).
- Código del motor contable: nada implementado todavía.

## Siguiente paso

1. Implementar C1 siguiendo el spec de implementación: `feature/contabilidad` desde `main` en ambos repos, TDD, revisión.
2. Conseguir el **Anexo 2 consolidado** (estructuras 5.1, 5.3, 6.1, 1.x, 3.x) antes de la Fase C4; las páginas de
   orientación de SUNAT responden "Acceso denegado" desde la nube (sí descargan los PDF de
   `www.sunat.gob.pe/legislacion/...` con un User-Agent de navegador).
3. Antes de C2: decidir con el usuario si INTALES será la contabilidad oficial o exportará asientos al software del
   contador (brecha B8), y resolver B6 (cuenta de gasto por comprobante de compra), sin la cual no hay asiento de compras.
4. Responder las preguntas al contador listadas al final de `casos-prueba-contables.md`.

## Convenciones

- Tests backend: `MONGO_URI_TEST="mongodb://localhost:27017/sipapp-intales-test?replicaSet=rs0" npm test`
  (MongoDB con replica set; en la nube se puede bajar de fastdl.mongodb.org, ya permitido en la red del entorno).
- Tests frontend: `npm test` (`node --test`); lintear solo archivos tocados; `npm run build`.
- Fechas en hora Lima; nunca `alert/confirm/prompt` (Electron).
- Todo lo de comprobantes, TC por fecha, ventas en US$ y seguridad ya está en `main`.
