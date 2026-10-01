# Spec de implementación — Contabilidad Fase C1: base contable

**Para:** el agente del editor de código que implementará la fase. **Fecha:** 2026-10-01.
**Diseño aprobado:** `docs/contabilidad/2026-10-01-motor-contable-design.md` (leerlo primero).
**Plan resumido:** `docs/superpowers/plans/2026-10-01-contabilidad-c1-base.md`.
Responder al usuario en español, conciso. No mergear a `main` sin su OK.

## 0. Preparación

- Rama **`feature/contabilidad`** desde `main` en `SIPAPP-INTALES-BACKEND` y `SIPAPP-INTALES-FRONTEND`.
- Tests backend: `MONGO_URI_TEST="mongodb://localhost:27017/sipapp-intales-test?replicaSet=rs0" npm test`
  (replica set obligatorio: las escrituras usan transacciones). Frontend: `npm test` (`node --test src/utils/*.test.js`),
  `npx eslint <archivos tocados>` (el lint global tiene errores previos ajenos) y `npm run build`.
- Convenciones del código existente (respetarlas):
  - Rutas Express con `authMiddleware` + middleware de rol; errores con `errorHttp(status, mensaje)` y respuesta
    `{ mensaje }`.
  - Escrituras de dinero/contabilidad dentro de `conTransaccion(async (session) => …)` (`src/utils/transaccion.js`).
  - Correlativos con `Counter` (`src/utils/codigos.js`, patrón `findByIdAndUpdate({$inc}, {upsert, session})`).
  - **Bloqueo de edición**: toda escritura sobre un documento existente pasa por `exigeBloqueo(entidad)`
    (`src/middleware/exigeBloqueo.js`) y la entidad se registra en `src/utils/entidadesBloqueo.js`; en el frontend se
    usa `conBloqueo(entidad, id, fn)` (`src/utils/bloqueoApi.js`).
  - Fechas: hora Lima (`aFechaLima`, `utils/fecha`). Nunca `alert/confirm/prompt` (la app corre en Electron).
  - Comentarios en español, breves, explicando el porqué; tests con `node:test` en `test/*.test.js` usando
    `test/helpers.js` (`conectar`, `limpiar`, `levantar`, `token`).
- Commits con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## 1. Roles

### Backend
- `src/models/Usuario.js`: agregar `"tesorero"` y `"contador"` al `enum` de `rol`.
- `src/middleware/puedeTesoreria.js`: `ROLES_TESORERIA = ["facturacion", "jefatura", "admin", "tesorero"]`. Nuevo
  export `puedeTesoreriaLectura` (GET): `ROLES_TESORERIA` + `"contador"`. Aplicarlo a los GET de las rutas de Tesorería
  (`tesoreria.js`, `facturasProveedor.js`, `movimientosTesoreria.js`, `cuentasTesoreria.js`, `sire.js`), manteniendo
  `puedeTesoreria` en las escrituras.
- Nuevo `src/middleware/puedeContabilidad.js`:
  - `ROLES_CONTABILIDAD_LECTURA = ["admin", "jefatura", "tesorero", "contador"]` → `puedeContabilidad`.
  - `ROLES_CONTABILIDAD_ESCRITURA = ["admin", "contador"]` → `escribeContabilidad` (plan de cuentas y asientos manuales).
- Revisar las rutas de usuarios (alta/edición) para que acepten los roles nuevos.

### Frontend
- Etiquetas: `tesorero: "Tesorero"`, `contador: "Contador"` en `ROL_LABEL` de `Sidebar.jsx`, `PanelNotificaciones.jsx`
  y `pages/Usuarios.jsx` (más su color de badge y la opción en el selector de rol).
- `Sidebar.jsx`: "Tesorería" visible también para tesorero y contador; nuevo ítem **"Contabilidad"** (`/contabilidad`)
  para admin, jefatura, tesorero y contador. Actualizar el comentario de la matriz de roles.
- `App.jsx`: ruta `/contabilidad` con `ProtectedRoute roles={["admin","jefatura","tesorero","contador"]}`; agregar
  tesorero y contador a la de `/tesoreria`. En Tesorería, el contador ve todo pero sin botones de escritura.

## 2. Plan de cuentas

### Modelo `src/models/CuentaContable.js`
```js
{
  codigo:  { type: String, required: true, unique: true, match: /^\d{2,10}$/ },
  nombre:  { type: String, required: true, trim: true },
  nivel:   Number,                  // = codigo.length (2 elemento/cuenta, 3 subcuenta, 4+ divisionarias)
  padre:   { type: String, default: null },   // código del padre (prefijo más largo existente)
  naturaleza: { type: String, enum: ["deudora", "acreedora"], required: true },
  deMovimiento: { type: Boolean, default: false }, // solo estas reciben asientos
  exigeCentroCosto: { type: Boolean, default: false },
  exigeTercero:     { type: Boolean, default: false },
  destino: { debe: { type: String, default: "" }, haber: { type: String, default: "" } }, // clase 6 → 9x / 79
  activa: { type: Boolean, default: true },
  fechaModificacion: { type: Date, default: Date.now }, // para el PLE 5.3
}
```
Índices: `codigo` único, `padre`.

### Seed `src/data/pcge.js` + `scripts/seedPcge.js`
- Fuente obligatoria: **Plan Contable General Empresarial (PCGE) modificado 2019**, documento oficial del Consejo
  Normativo de Contabilidad (MEF). Cargar **elementos (1 dígito como agrupador lógico, no se guarda), cuentas de 2
  dígitos y subcuentas de 3 dígitos completas**, con su denominación oficial y naturaleza. No inventar códigos.
- Divisionarias que INTALES usa desde el inicio (`deMovimiento: true`); **verificar cada código y nombre contra el
  PCGE 2019** antes de cargarlo (los de servicios son ejemplos):
  `1011` Caja, `1041` Cuentas corrientes operativas (una divisionaria por cuenta de Tesorería: `104101`, …; la de
  detracciones en el Banco de la Nación aparte), `1212` Emitidas en cartera (facturas por cobrar), `40111` IGV – Cuenta
  propia, `40172` Renta de cuarta categoría (retenciones), `4212` Emitidas (facturas por pagar), `424` Honorarios por
  pagar (sin divisionarias en el PCGE 2019; **no existe 4241**), `6011`/`602`/`6031` compras (según tipo de artículo;
  **no existe 6021**), `6321`/`6343`/`6351`… servicios de terceros más usados, ventas locales `70321` servicios,
  `70221` productos terminados y `70121` mercaderías (**no `7041`, que es Subproductos, ni `7011`, que es
  exportación**), `1042`/`107` para la cuenta de detracciones del Banco de la Nación **[Confirmar con el contador]**,
  `676` y `776` diferencia de cambio, `79` (`791` cargas imputables a cuentas de costos y gastos), `90`–`97` destinos
  (por ejemplo `921` costo de producción, `941` gastos administrativos, `951` gastos de ventas, `971` gastos
  financieros: son divisionarias de libre definición, se cargan como ejemplo configurable). *(Brecha B5, 2026-10-01.)* Cuentas de clase 6 con `destino` por defecto (`debe: "941"`, `haber: "791"`), editable.
- `scripts/seedPcge.js`: idempotente (upsert por `codigo`, no pisa cambios del usuario en `nombre`/banderas si la
  cuenta ya existe). Además, al arrancar el servidor, si la colección está vacía se carga el seed.

### Rutas `src/routes/contabilidad/cuentas.js` (montar en `/api/contabilidad/cuentas`)
| Método | Ruta | Rol | Comportamiento |
|---|---|---|---|
| GET | `/` | lectura | Lista plana ordenada por `codigo`; query `q` (código o nombre, sin tildes), `soloMovimiento`, `activas` |
| POST | `/` | escritura | Crea subcuenta: `{ codigo, nombre, naturaleza?, deMovimiento?, exigeCentroCosto?, exigeTercero?, destino? }`. El padre es el prefijo existente más largo; si el padre era `deMovimiento` y **no tiene asientos**, pasa a `false`; si tiene asientos → 409 "La cuenta X ya tiene asientos: no se le pueden crear subcuentas". Naturaleza por defecto la del padre |
| PUT | `/:id` | escritura + bloqueo | Edita `nombre`, banderas y `destino` (no `codigo`). Actualiza `fechaModificacion` |
| PATCH | `/:id/activa` | escritura + bloqueo | `{ activa }`. Desactivar con asientos no anulados → 409 |

Validaciones (400): código no numérico o fuera de 2–10 dígitos; sin padre existente (salvo 2 dígitos); duplicado (409);
`destino.debe`/`destino.haber` deben ser cuentas existentes de movimiento.
Registrar `cuentaContable` en `ENTIDADES_BLOQUEO` con roles de escritura.

## 3. Periodos contables

### Modelo `src/models/PeriodoContable.js`
```js
{
  periodo: { type: String, required: true, unique: true, match: /^\d{6}$/ }, // AAAAMM
  estado:  { type: String, enum: ["abierto", "cerrado"], default: "abierto" },
  cerradoPor: String, cerradoEn: Date,
  reaperturas: [{ por: String, en: Date, motivo: String }],
}
```

### `src/utils/periodoContable.js`
- `periodoDe(fecha)` → `"AAAAMM"` en **hora Lima** (usar la misma lógica que `aFechaLima`; un `2026-09-30T23:30-05:00`
  es `202609`).
- `exigirAbierto(fecha, session)` → crea el periodo `abierto` si no existe (upsert) y lanza `errorHttp(409, "El
  periodo AAAAMM está cerrado")` si está cerrado.
- Cerrar/reabrir (exclusivo del rol `tesorero`) se implementa en C3; en C1 solo el modelo, el util y un
  `GET /api/contabilidad/periodos` (lectura).

## 4. Asientos manuales

### Modelo `src/models/Asiento.js`
```js
const linea = new Schema({
  cuenta: { type: String, required: true },          // código de CuentaContable
  glosa: { type: String, default: "" },
  debe: { type: Number, default: 0 }, haber: { type: Number, default: 0 },     // S/
  debeME: { type: Number, default: 0 }, haberME: { type: Number, default: 0 }, // US$ si moneda USD
  centroCosto: { type: ObjectId, ref: "CentroCosto", default: null },
  ordenTrabajo: { type: ObjectId, ref: "OrdenTrabajo", default: null },
  tercero: { tipoDoc: String, numDoc: String, nombre: String },            // tabla 2 SUNAT: 6 RUC, 1 DNI…
  documento: { tipo: String, serie: String, numero: String, fecha: Date }, // tabla 10 SUNAT
}, { _id: false });

{
  periodo: { type: String, required: true },   // AAAAMM (de la fecha, hora Lima)
  subdiario: { type: String, enum: ["compras","ventas","caja-bancos","diario","apertura","cierre","ajuste"], required: true },
  numero: { type: Number, required: true },    // correlativo por periodo + subdiario
  cuo: { type: String, required: true, unique: true }, // `${periodo}-${SUBDIARIO}-${numero 6 dígitos}` (≤ 40)
  fecha: { type: Date, required: true },
  glosa: { type: String, required: true, trim: true },
  moneda: { type: String, enum: ["PEN","USD"], default: "PEN" },
  tipoCambio: { type: Number, default: 1 },
  estado: { type: String, enum: ["borrador","contabilizado","anulado"], default: "contabilizado" },
  origen: { tipo: { type: String, default: "manual" }, id: { type: ObjectId, default: null } },
  editadoManualmente: { type: Boolean, default: false },
  anulacion: { por: String, en: Date, motivo: String },
  lineas: [linea],
  creadoPor: String, modificadoPor: String,
}  // timestamps: true
```
Índices: `{ periodo: 1, subdiario: 1, numero: 1 }` único, `cuo` único, `lineas.cuenta`, `fecha`.
Correlativo: `Counter` con id `asiento-${periodo}-${subdiario}` dentro de la transacción.

### Rutas `src/routes/contabilidad/asientos.js` (montar en `/api/contabilidad/asientos`)
| Método | Ruta | Rol | Comportamiento |
|---|---|---|---|
| GET | `/` | lectura | Filtros: `periodo`, `subdiario`, `cuenta` (prefijo), `estado`, `q` (glosa/CUO), paginado |
| GET | `/:id` | lectura | Asiento con nombres de cuentas, centro de costo y OT |
| POST | `/` | escritura | Crea asiento **manual** (subdiarios permitidos en manual: `diario`, `apertura`, `ajuste`, `cierre`) |
| PUT | `/:id` | escritura + bloqueo (`version: true`) | Solo `origen.tipo === "manual"`, no anulado y periodo abierto. Reemplaza fecha (mismo periodo; cambiar de periodo → 400), glosa, moneda, TC y líneas |
| PATCH | `/:id/anular` | escritura + bloqueo | `{ motivo }` obligatorio; periodo abierto; estado → `anulado` (no se borra) |

### Validaciones (400, mensaje claro en español)
1. Al menos 2 líneas.
2. Cada línea: debe **o** haber, > 0, máximo 2 decimales.
3. **Cuadre**: `round2(Σdebe) === round2(Σhaber)`; en USD además `Σ debeME === Σ haberME` y cada importe en S/ =
   `round2(importeME × tipoCambio)` (se calcula en el servidor, no se confía en el cliente).
4. Cuentas existentes, **activas** y **de movimiento**.
5. `centroCosto` obligatorio si la cuenta `exigeCentroCosto`; `tercero.numDoc` si `exigeTercero`.
6. `exigirAbierto(fecha)`.
7. USD: `tipoCambio` entre 2 y 6 (mismo rango que comprobantes).

Registrar `asiento` en `ENTIDADES_BLOQUEO` con roles de escritura.

## 5. Frontend — página Contabilidad

- `src/utils/contabilidad.js` (pura, con `src/utils/contabilidad.test.js`):
  `totalesAsiento(lineas)` → `{ debe, haber, diferencia, cuadra }`; `validarLineas(lineas, cuentasPorCodigo)` → lista de
  errores por línea (misma regla que el servidor); `arbolCuentas(cuentas)` (agrupa por padre); `padreDe(codigo,
  cuentas)`; `sinTildes`.
- `src/pages/Contabilidad.jsx` con pestañas (mismo estilo que `pages/Tesoreria.jsx`):
  - **Plan de cuentas** (`components/contabilidad/PanelPlanCuentas.jsx`): árbol/tabla con búsqueda, filtros
    "solo de movimiento" e "inactivas"; modal crear subcuenta (padre elegido de la fila); editar nombre, banderas y
    destino (buscador de cuentas); activar/desactivar. Solo lectura para jefatura y tesorero.
  - **Asientos** (`components/contabilidad/PanelAsientos.jsx` + `ModalAsiento.jsx`): lista con filtros (periodo,
    subdiario, cuenta, estado, texto), subtotales y "Exportar Excel" (reusar `utils/exportarTabla.js`); modal con
    cabecera (fecha, subdiario, glosa, moneda, TC automático por fecha vía `/sunat/tipo-cambio` como en
    `ModalFacturaProveedor`), líneas editables (buscador de cuenta, debe/haber, centro de costo y tercero cuando la
    cuenta los exige), **totales y diferencia en vivo**, botón Guardar deshabilitado si no cuadra; anular con
    `PromptAccion` (motivo). Escrituras con `conBloqueo`.

## 6. Tests mínimos

Backend (`test/contabilidad*.test.js`):
- Permisos: contador y admin escriben; tesorero y jefatura solo leen; facturación no ve contabilidad; contador lee
  Tesorería pero no escribe; tesorero opera Tesorería.
- Plan: seed idempotente; crear subcuenta (padre pasa a no movimiento); código inválido/duplicado; subcuenta bajo cuenta
  con asientos → 409; desactivar con asientos → 409.
- Periodo: `periodoDe` en el borde de mes en hora Lima; asiento en periodo cerrado → 409 (cerrar el periodo directo en
  la BD en el test).
- Asientos: cuadre (descuadre → 400); USD con conversión del servidor; cuenta no de movimiento/inactiva → 400; centro de
  costo exigido; correlativo y CUO sin saltos con 5 creaciones concurrentes; editar solo manual y en periodo abierto;
  anular con motivo; cambiar de periodo al editar → 400.

Frontend: `contabilidad.test.js` (totales, cuadre con decimales, validación de líneas, árbol).

## 7. Criterios de aceptación

1. Todos los tests verdes (backend con replica set; frontend `npm test`), lint de archivos tocados sin errores,
   `npm run build` OK.
2. Prueba en navegador con backend real: el contador crea la subcuenta `104102 Banco X` y un asiento manual cuadrado
   en soles y otro en dólares; un asiento descuadrado no se puede guardar; el tesorero y jefatura ven Contabilidad sin
   botones de escritura; anular pide motivo y el asiento queda visible como anulado.
3. Nada cambia en el comportamiento de los módulos existentes salvo los permisos de Tesorería para los roles nuevos.
4. Actualizar `docs/contabilidad/HANDOFF-contabilidad.md` (estado de C1, decisiones `Ruling:` tomadas y pendientes) y
   crear `docs/superpowers/sdd/2026-10-01-contabilidad-c1/progress.md`.

## 8. Fuera de C1

Asientos automáticos y configuración contable (C2); cierre/reapertura del tesorero, bloqueo de periodos en todo el
sistema, Diario/Mayor/balance (C3); exportación PLE (C4); Inventarios y Balances y EEFF (C5).
