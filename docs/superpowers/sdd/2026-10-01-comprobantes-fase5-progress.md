# SDD ledger — plan: docs/superpowers/plans/2026-10-01-comprobantes-fase5.md
Pre-flight: Task 1 produce tc/tipoCambio (consume Task 2) y Task 3 produce el resumen (consume Task 4) — coinciden.
BASE backend: 3362b55 · BASE frontend: dfdd8d99
Task 1: complete (commits 3362b55..fdd5d6a, tests: npm test → 180 pass, 1 skip previo)
Task 2: complete (commits dfdd8d99..d43d0475, tests: npm test (frontend) → 54/54; eslint OK; build OK)
Task 3: complete (commits fdd5d6a..8e11d04, tests: npm test → 183 pass, 1 skip previo)
Task 4: complete (commits d43d0475..340b49ae, tests: npm test (frontend) → 55/55; eslint OK; build OK)
Task 5: Playwright OK — resumen 2026-08: con crédito 570 / 102.60 / 672.60, sin crédito 1,118, 4ta 80/0/80; NC en rojo −118; Excel resumen-tributario-2026-08.xlsx descargado. SIRE (TXT subido): NC −118 "Coincide", USD "Difiere" con "sistema 3.700 · SIRE 3.750 · SUNAT 3.361 (20/08)", RH excluido, boleta no incluida en el TXT → "Solo en el sistema".
Final review: opus — 0 Critical, 3 Important, 5 Minor.
Final: fixed I-1 subtotales del Excel caían en columnas equivocadas (sheet_add_json sin header; afectaba también SIRE, Movimientos, Por cobrar/pagar) — "hojaConSubtotales: cada subtotal cae bajo su columna…" RED→GREEN, frontend 57/57
Final: fixed I-2 ticket sin «Trae RUC» que sí está en el SIRE salía "Solo en SIRE" — "ticket registrado sin «Trae RUC»…: difiere por ticketConRuc" RED→GREEN, backend 186/186 (+1 skip previo)
Final: fixed I-3a TC de respaldo se mostraba como "SUNAT" — "TC SUNAT: si solo hay respaldo…" RED→GREEN
Final: fixed I-3b notas USD comparadas con el TC SUNAT de su propia fecha — "nota en USD: el TC SUNAT de referencia es el de la fecha de su comprobante" RED→GREEN (y textoTcSire con "fecha del comprobante que modifica")
Final: Ruling: las consultas de TC SUNAT en la conciliación van en paralelo por fecha única (Promise.all) — resuelve también M-1 al tocar el mismo bloque — costo si está mal: ninguno
Final: minor (deferred): M-2 TC vacío o 0 del SIRE se guarda como 1 (sireParser.js:104) → guardar null
Final: minor (deferred): M-3 base + IGV en S/ puede diferir del total en 0.01 en USD → totalSoles = baseSoles + igvSoles
Final: minor (deferred): M-4 Excel del resumen: total 4ta sin pagado/pendiente; columnas en moneda original sin signo en NC
Final: minor (deferred): M-5 resumen tributario sin botón para reintentar el mismo mes tras un error
Final: Ruling (declined to judge): montos USD del RCE real (¿dólares o soles?) — se mantiene la comparación existente; verificar con un archivo real con factura en dólares — costo si está mal: falsos "difiere" en USD
Final: Ruling (declined to judge): retención 4ta agrupada por mes de emisión (spec) — confirmar con el contador si va por mes de pago
Fix commits: backend de05e49 · frontend 97dc9eb6
