# Traspaso — motor contable (actualizado 2026-10-03)

> Contexto general del proyecto, decisiones del usuario y comandos: **`docs/ESTADO-PROYECTO.md`**.

Para el agente que continúe. Responder al usuario en español, conciso. Backend y Frontend son repos separados;
estos docs están idénticos en `docs/contabilidad/` de ambos.

## Decisión de fondo (B8, resuelta 2026-10-01)

**INTALES exporta los asientos al software del contador**; no es la contabilidad oficial. C4 = exportación en la
plantilla de importación de su software (CONCAR/StarSoft, por confirmar); el PLE queda opcional y C5 en suspenso.
El plan de cuentas debe ser el del contador (se importa desde Excel).

**Cambio 2026-10-03 (solo rama `ventas/produccion/contabilidadoficial`): C5 ligero.** INTALES **presenta** con el
programa PLE el Diario (5.1), el Plan de cuentas (5.3), el Mayor (6.1) y Caja y Bancos (1.1 y 1.2); el contador ya no
los presenta desde CONCAR. Compras y Ventas siguen por el SIRE. La rama `venta-produc-compra-contaConcar` guarda el
alcance anterior (solo CONCAR).

## Estado

- **C1 implementada** (en `main` desde 2026-10-02, junto con C2, C3, Bancos B7 y caja chica):
  - Backend: `CuentaContable`, `PeriodoContable`, `Asiento`; `src/data/pcge.js` (PCGE 2019: cuentas de 2 dígitos y
    las subcuentas que usa INTALES, verificadas en la guía contable); carga automática al arrancar si el plan está
    vacío y `node src/scripts/seedPcge.js`; rutas `/api/contabilidad/cuentas` (incluye `POST /importar` del plan del
    contador), `/api/contabilidad/asientos` (manuales: crear, editar, anular con motivo), `/api/contabilidad/periodos`
    (lectura). Permisos: leen admin, jefatura, tesorero y contador; escriben admin y contador.
  - Frontend: página **Contabilidad** (`/contabilidad`, menú para admin, jefatura, tesorero y contador) con pestañas
    Asientos (filtros, exportar Excel, modal con cuadre en vivo, USD con TC SUNAT de la fecha, anular con motivo) y
    Plan de cuentas (árbol por elemento, búsqueda sin tildes, crear subcuenta, editar banderas y destino,
    activar/desactivar, **importar plan desde Excel**, exportar).
  - Tests: backend `test/contabilidad.test.js` (24); frontend `src/utils/contabilidad.test.js` (7). E2E con
    Playwright: subcuenta, asiento S/ y US$, descuadre bloqueado, anulación, tesorero/jefatura sin botones,
    facturación sin acceso, importación de Excel.
  - Registro y decisiones: `docs/superpowers/sdd/2026-10-01-contabilidad-c1/progress.md`.
- **C2 implementada** (CONCAR + PCGE 2019, decisión del usuario 2026-10-02): spec
  `docs/superpowers/specs/2026-10-02-c2-asientos-concar-design.md`, ledger `docs/superpowers/sdd/2026-10-02-c2-concar/progress.md`.
  Backend `src/utils/asientosAutomaticos.js`, `src/utils/concar.js`, rutas `/api/contabilidad/{automaticos,
  configuracion,exportaciones}`; frontend pestañas Automáticos, Exportar CONCAR y Configuración. Las respuestas
  del contador (`Preguntas al contador.md`) ahora solo ajustan la configuración.
- Documentos previos: investigación (`2026-10-01-investigacion-libros-electronicos.md`), diseño
  (`2026-10-01-motor-contable-design.md`, con el cambio de alcance arriba), spec C1, guía contable y casos de prueba
  (23 casos, brechas B1–B25; B1–B5 y B9 resueltas en `main`; B8 resuelta: exportar).

- **Saldos y movimientos manuales de Tesorería** (de `main`, `feature/movimientos-manuales`): saldo inicial por cuenta
  (`CuentaTesoreria.saldoInicial/fechaSaldoInicial/tipoCambioSaldoInicial`), ingresos/egresos manuales
  (`MovimientoTesoreria.conceptoManual`: aporte, préstamo, retiro, gasto bancario, otros) y transferencias propias
  (`conceptoManual: "transferencia"`), saldo insuficiente (`utils/saldosCuentas.js`). Integrado con la rama contable el
  2026-10-02: cada manual puede llevar `cuentaContable` y `centroCosto`; si no, C2 usa la cuenta del concepto en
  `ConfiguracionContable.manuales` (semilla solo gasto bancario 6391; aporte 50/52, préstamo 45, retiro 14 los define
  el contador). Transferencia: 10x contra 10x.
- **Bancos B7** (`docs/superpowers/specs/2026-10-02-bancos-b7-design.md`): libro por cuenta y conciliación bancaria
  mensual, sobre los saldos y movimientos de `main` (el catálogo de tipos de movimiento de B7 se retiró en la
  integración).
- **Caja chica implementada** (`docs/superpowers/specs/2026-10-02-caja-chica-design.md`): cada gasto lleva cuenta
  contable opcional; C2 la usará (cuenta de fondos fijos 102 y gasto 6x según el contador).
- **Referencias de otros ERP** (ERP C# dominicano, FacturaScripts, prototipo Java): diseño adoptado para C2, B7 y el
  re-dimensionamiento de C3–C5 en `2026-10-01-referencias-erp-C2-C5.md`.

- **C3 implementada**: cierre de mes del tesorero (todo generado, contabilizado y exportado; después el mes queda
  bloqueado en compras, Tesorería, caja chica, CPE y asientos; reapertura con motivo) y reportes de control.
  Spec `docs/superpowers/specs/2026-10-02-c3-cierre-reportes-design.md`, ledger `docs/superpowers/sdd/2026-10-02-c3-cierre/progress.md`.
  **C4** quedó hecha con C2 (CONCAR); **C5** en suspenso.
- **C5 ligero (PLE) implementada** (2026-10-03, solo en `contabilidadoficial`): `src/utils/ple.js` (estructuras 5.1,
  5.3, 6.1, 1.1 y 1.2 del Anexo 2, nombre `LE…` del archivo, texto en latin1 con `\r\n`) y `GET
  /api/contabilidad/ple?periodo=` (resumen) y `/api/contabilidad/ple/:libro?periodo=` (el .txt). Solo de un mes
  **cerrado** y con los asientos contabilizados. 1.1 = líneas de 101/102/103; 1.2 = líneas de 104 con el banco
  (`CuentaTesoreria.codigoEntidad`, tabla 3, y `numero`, en Contabilidad → Configuración), el medio de pago (tabla 1
  desde el movimiento), el tercero y el número de operación. 5.3 = cuentas activas y las usadas en el mes (plan 01).
  Frontend: pestaña **Libros PLE** y sección de ayuda. Tests `test/ple.test.js` (4); E2E con Playwright (configurar
  el banco, descargar 1.2 y 5.1, mes abierto rechazado). Pendiente: validar con el programa PLE real (ver ESTADO §5).

- **Revisión contra contaperu y ajustes (2026-10-03, sin commit aún)**:
  - **PLE** alineado con el Libro Diario aceptado por SUNAT que contrasta contaperu (`datos/sunat/ple_campos.json`):
    5.1/6.1/1.1 escriben tercero `0`, comprobante `00` y el **número del asiento** donde no hay documento (campos
    obligatorios), y la fecha nula `01/01/0001` donde no hay vencimiento; el 5.3 lleva periodo `AAAAMM01` (AAAAMMDD) y
    solo cuentas de movimiento activas o usadas, desde tres dígitos. El resumen (`GET /ple`) devuelve `avisos` (cuentas
    del Diario con menos de 4 dígitos: sobre 100 UIT se exigen 4). El 1.2 no cambió (contaperu no lo cubre).
  - **Diferencia de cambio al cierre**: `POST /api/contabilidad/automaticos/diferencia-cambio { periodo }` (admin,
    contador, tesorero) → `generarDiferenciaCambio` en `utils/asientosAutomaticos.js`. Sale del **mayor**: por cuenta
    en dólares (clientes, proveedores y honorarios US$ por tercero y documento; bancos US$ por cuenta) compara el saldo
    en soles de lo contabilizado (asientos en USD y ajustes anteriores) con el saldo en dólares al TC SUNAT del último
    día (clase 1 al compra, clase 4 al venta). Borrador en el subdiario `ajuste`, origen `DiferenciaCambio` sin id; se
    regenera (reemplaza su borrador) y, ya contabilizado, solo agrega lo que falte. Exige: mes terminado y abierto, sin
    borradores hasta ese periodo, TC publicado (no respaldo) y que un banco en soles y otro en dólares no compartan
    cuenta contable. En CONCAR sale con flag `N`, dólares 0 y soles el ajuste. **No es requisito del cierre de mes.**
    Frontend: botón «Diferencia de cambio al cierre» en la pestaña Automáticos.
  - **Constancia de detracción** en CONCAR (columna S de la línea `DR`): el número de operación del depósito de la
    detracción si ya está en Tesorería; si no, el comodín de la configuración (`lineas.detraccion.constancia`).
  - **PCGE 2019 confirmado** por el usuario (contaperu trae además un catálogo «2026»: no se usa).
  - Fechas: ver ESTADO-PROYECTO §5.
  - **No se tocó (espera al contador)**: periodo de anotación de compras tardías (B10/E1/D7), retención IGV 3 % por
    40114 con CRE (B15/D4), tasa AO y doble anexo de CONCAR (A8/A4). El Diario sigue sin planilla, depreciación ni costo
    de ventas: van como asientos manuales.
- **Asientos automáticos editables (2026-10-05)**: el automático es la base y el contador lo completa a mano desde Asientos o
  Automáticos; generar no pisa lo editado. Detalle en `docs/ESTADO-PROYECTO.md` §5.

## Siguiente paso

0. C5 ligero: cargar los .txt de un mes de prueba en el programa PLE y corregir lo que observe; preguntas F1–F4 al
   contador.

1. Primera importación real en CONCAR con el contador: validar subdiarios, flag `N` de caja-bancos en US$, anexos
   (RUC en su maestro), centros de costo y siglas. Ajustar en Contabilidad → Configuración.
2. Importar su plan de cuentas (6 dígitos) y reemplazar las cuentas de la configuración por sus divisionarias.
3. Fuera de C2 (siguientes): cuenta por tipo de artículo, destinos 9x/79 si CONCAR no los genera, costo de ventas,
   anticipos, retención 3 % con CRE, exportar asientos manuales, maestro de anexos; C3 (cierre de mes) y StarSoft.

## Convenciones

- Tests backend: `MONGO_URI_TEST="mongodb://localhost:27017/sipapp-intales-test?replicaSet=rs0" npm test`
  (MongoDB con replica set; en la nube se baja de fastdl.mongodb.org, permitido en la red del entorno).
- Tests frontend: `npm test` (`node --test`); lintear solo archivos tocados; `npm run build`.
- Fechas en hora Lima; nunca `alert/confirm/prompt` (Electron).
