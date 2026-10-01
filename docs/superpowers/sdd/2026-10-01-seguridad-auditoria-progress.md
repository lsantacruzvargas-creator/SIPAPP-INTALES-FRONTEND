# Ledger — fix pass auditoría de seguridad y errores (2026-10-01), sin plan formal: decisiones del usuario en chat
BASE backend e015b00 · frontend 845c10b9
S1+S7 (login): IP confiable solo desde Cloudflare/loopback/PROXIES_CONFIABLES; límites de login solo por fallos, por IP (20) y por usuario (8); mensaje único; datos de otro tipo → 401 — seguridadLogin.test.js RED→GREEN
S2 (apiperu): tope global APIPERU_MAX_HORA=60 (memoria, un servidor), caché RUC 30 días (solo resultados completos), caché de fallas de TC 1 h — apiperu.test.js + tipoCambioDia RED→GREEN. Ruling: el tope es global (no por usuario), como pidió el usuario; al llegar al tope el TC usa respaldo y el RUC responde 429.
S3 (facturas): lista blanca EDITABLES/AL_CREAR — test 'lista blanca…' RED→GREEN
S4 (NC venta): validarOrigenNota (existe, ACEPTADO, mismo receptor, 01/02 por el total vigente) + conCandado por comprobante — tests RED→GREEN. Ruling: el candado es en memoria (un servidor físico).
S5 (roles): tesorero y contador creados; ROLES_FINANZAS en GET /facturas y /cpe (ver/descargar/consultar POST, limit ≤100, filtros como string); Tesorería abierta a tesorero/contador; frontend menú/rutas/usuarios — seguridadRoles.test.js RED→GREEN. Ruling: emitir CPE, editar facturas y cambiar el impuesto de ventas siguen en admin/facturación/jefatura (el usuario solo pidió ver).
S6 (errores): mensajeSeguro/estadoSeguro/responderError; hub → externo (502, conserva el mensaje de SUNAT); importaciones y SIRE con mensaje seguro — mensajeError.test.js RED→GREEN, suite 231/231
S8 (subidas): MulterError → 413/400; filtroPdf con status 400 — manejarErrores.test RED→GREEN; frontend: imagen de ítem, PDF de OC y adjuntos al crear cotización/OT muestran el error
S9 (SIRE): carga manual guardada aparte si hay propuesta de SUNAT, GET comparar-carga, tope 20 000 filas y files:1 — sire.test RED→GREEN; frontend modal ComparacionCarga + Excel (util con test)
S10 (ítems CPE): validarItemsCpe en calcularTotales (factura, boleta, NC, ND) — itemsCpe.test RED→GREEN (regex de test corregida a /i)
S11 (404): rutaNoEncontrada en /api — manejarErrores.test RED→GREEN; suite 237/237 (+1 skip previo)
S12 (Playwright): login errado → 401 genérico, datos de otro tipo → 401 'Usuario o contraseña incorrectos', /api/no-existe → 404 JSON, login correcto entra; Fact. Electrónica y Tesorería cargan con jefatura.
Final review (opus): 0 Critical, 8 Important, varios Minor.
Final: fixed I1 referencia de NC normalizada (candado y NC pendientes) — normalizarReferencia + test RED→GREEN
Final: fixed I2 NC de anulación descuenta NC aplicadas y pendientes; no se emite con otra de anulación en proceso — test RED→GREEN
Final: fixed I3 tope de NC sin factura interna (total − NC aceptadas − pendientes) — test RED→GREEN
Final: fixed I4 SIRE protege cualquier propuesta de SUNAT (lista, descargando o error) — test RED→GREEN
Final: fixed I5 GRE: endpoint /cpe/para-guia sin montos para roles de guías (decisión del usuario) — test RED→GREEN; Playwright con asistente OK
Final: fixed I6 roles sin acceso no ven estados de facturación falsos (OC sin pestañas sin/con factura; detalles sin tarjeta de factura; sin fetch a /facturas) — roles.test RED→GREEN + Playwright
Final: fixed I7 importaciones de /cadena solo admin — test RED→GREEN
Final: Ruling I8 límite de login por usuario se deja como está (decisión del usuario): permite bloquear una cuenta a propósito con 8 fallos/15 min
Final: fixed (minor re-graduados) 5xx propios con mensaje (expose), ND valida origen y su correlativo va después de validar, aplicación atómica de NC, login sin pista por tiempo, PROXIES_CONFIABLES sin prefijo, tope de tiempo al hub, mensaje de descuento, botones de tesorero/contador
Final: minor (deferred): PUT de factura con CPE aceptado permite cambiar subtotal/número sin NC; /uploads/tesoreria legible con la URL; detalles del cuadro comparativo SIRE (RUC distinto en dos filas, signo, keys duplicadas, tamaño con 2×20 000 filas); NC 01 desde la UI no precarga otros cargos/redondeo; RUC gasta 2 consultas y caché solo completa
Final: Ruling (declined): candado y cupo en memoria asumen un solo proceso (sin PM2 cluster)
Backend 248/248 (+1 skip) · frontend 68/68 · build OK
