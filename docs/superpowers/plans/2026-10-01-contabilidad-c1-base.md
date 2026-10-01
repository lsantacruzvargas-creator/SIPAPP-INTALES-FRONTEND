# Plan — Contabilidad, Fase C1: base contable

Spec: `docs/contabilidad/2026-10-01-motor-contable-design.md` (aprobado 2026-10-01). Repos: backend y frontend de
INTALES, rama nueva `feature/contabilidad` desde `main` en ambos. Flujo: aprobación del plan → TDD por tarea →
revisión → traspaso actualizado.

## Alcance de C1

Roles `tesorero` y `contador`, plan de cuentas PCGE estándar editable, periodos contables y **asientos manuales**
(crear, editar, anular) con cuadre, correlativo por subdiario y CUO. Sin asientos automáticos (C2), sin cierre ni
reportes (C3) y sin exportación (C4).

## Tareas

### 1. Roles (backend + frontend)
- `Usuario.rol`: agregar `tesorero` y `contador`.
- `ROLES_TESORERIA` += `tesorero`; `contador` ve Tesorería solo en lectura (middleware nuevo para GET).
- Middleware `puedeContabilidad` (lectura: admin, jefatura, tesorero, contador; escritura de plan y asientos manuales:
  admin, contador; el tesorero escribe asientos en C2 al contabilizar y cierra/reabre en C3).
- Frontend: etiquetas de rol (Sidebar, PanelNotificaciones, Usuarios), menú "Contabilidad" y ruta protegida.
- Tests: permisos por rol en las rutas nuevas y en Tesorería.

### 2. Plan de cuentas
- Modelo `CuentaContable` (`codigo` único 2–10 dígitos, `nombre`, `nivel`, `padre`, `naturaleza`, `deMovimiento`,
  `exigeCentroCosto`, `exigeTercero`, `destino {debe9x, haber79}`, `activa`, `fechaModificacion`).
- Seed `src/data/pcge.js`: PCGE 2019 a 2 y 3 dígitos completo + subcuentas de 4–5 dígitos que INTALES usará
  (101/104x, 1212, 40111, 40172, 4212, 4241, 60x, 63x, 65x, 70x, 676/776, 79, 90–97). Script idempotente
  `node scripts/seedPcge.js` y carga automática si la colección está vacía.
- Rutas `GET /contabilidad/cuentas` (árbol y búsqueda), `POST` (subcuenta bajo un padre), `PUT /:id` (nombre,
  banderas, destino), `PATCH /:id/activa`. Reglas: el padre debe existir y el código empezar por el del padre; una
  cuenta con hijas no es de movimiento; no se desactiva ni cambia de código si tiene asientos.
- Tests: jerarquía, código inválido, duplicado, desactivar con movimientos (409), permisos.

### 3. Periodos contables
- Modelo `PeriodoContable` (`periodo` AAAAMM único, `estado` abierto/cerrado, `cerradoPor/En`, `reaperturas[]`).
- `utils/periodoContable.js`: `periodoDe(fecha)` en hora Lima y `exigirAbierto(fecha, session)` (crea el periodo
  `abierto` si no existe; 409 si está cerrado). C3 agregará cerrar/reabrir (tesorero) y lo usará en todo el sistema.
- Tests: fecha en el límite de mes en hora Lima, periodo cerrado rechaza.

### 4. Asientos manuales
- Modelo `Asiento` según el spec (subdiario, `numero` correlativo por periodo+subdiario con `Counter`, `cuo`
  `AAAAMM-SUBDIARIO-NNNNNN` único, fecha, glosa, moneda, TC, estado, origen `manual`, líneas con cuenta, debe/haber
  en S/ y ME, centro de costo, OT, tercero, documento).
- Rutas `GET /contabilidad/asientos` (filtros periodo, subdiario, cuenta, estado, texto), `GET /:id`, `POST` (manual),
  `PUT /:id` (solo manual y periodo abierto), `PATCH /:id/anular` (motivo). Escritura en transacción y con bloqueo de
  edición como el resto del sistema.
- Validaciones (400 con `mensaje`): al menos 2 líneas; cada línea solo debe o solo haber, > 0; Σ debe = Σ haber
  (redondeo a 0.01, y en ME si la moneda es USD); cuentas existentes, activas y de movimiento; centro de costo o tercero
  cuando la cuenta lo exige; fecha dentro de un periodo abierto; TC obligatorio en USD (rango 2–6, como comprobantes).
- Tests: cuadre, correlativo sin saltos con concurrencia, CUO único, edición y anulación, periodo cerrado, permisos.

### 5. Frontend — pantalla Contabilidad
- `utils/contabilidad.js` (lógica pura con tests): totales y diferencia de un asiento, validación de líneas, árbol del
  plan de cuentas, formato de código.
- Página `Contabilidad` con pestañas **Plan de cuentas** (árbol con búsqueda, crear subcuenta, editar banderas y
  destino, activar/desactivar) y **Asientos** (lista con filtros; modal de asiento manual con líneas, buscador de
  cuentas, total debe/haber en vivo y aviso de descuadre; anular con motivo).
- Lint de archivos tocados, `npm test`, `npm run build`.

### 6. Verificación
- Backend con MongoDB replica set: todos los tests verdes.
- Navegador (Playwright) con backend real: contador crea una subcuenta y un asiento manual cuadrado; uno descuadrado
  se rechaza; tesorero y jefatura ven pero no editan; anular con motivo.
- Actualizar `docs/contabilidad/HANDOFF-contabilidad.md` y el registro de avance
  `docs/superpowers/sdd/2026-10-01-contabilidad-c1/progress.md`.
