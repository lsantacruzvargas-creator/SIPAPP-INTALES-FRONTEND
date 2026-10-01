# SDD ledger — plan: docs/superpowers/plans/2026-10-01-comprobantes-fase3.md
Pre-flight: Task 1 produce creditoFiscalDe/TIPOS_COMPRA (espejo en frontend, Task 4); Task 2 produce impuesto "retencion4ta" (Task 4 lo muestra); Task 3 produce body.pago (Task 4 lo envía) — coinciden.
BASE backend: 7dbeaf9 · BASE frontend: a162703d
Task 1: complete (commit c83b1a7, npm test → 156 pass)
Task 2: complete (commit 9b53a23, npm test → 158 pass)
Task 3: complete (commit 1ba46af, npm test → 161 pass)
Task 4: complete (commit 3fc2faca, npm test (frontend) → 47/47; eslint sin errores nuevos; build OK)
Task 5: Playwright OK — ticket sin RUC: crédito No / con RUC Sí; "Ya se pagó" exige cuenta y deja el ticket pagado sin crédito fiscal; RH 2000 con retención 4ta → neto 1840, impuesto 160 pendiente.
Final review: opus — 0 Critical, 2 Important, 9 Minor.
Final: fixed I-1 creditoFiscal con default false grababa "false" en comprobantes antiguos — sin default; test RED→GREEN (backend 163/163)
Final: fixed I-2 RH aceptaba detracción/retención 3 % y el formulario sugería retención 3 % en boletas/tickets sin RUC — servidor y sugerencia restringidos; tests RED→GREEN (frontend 49/49)
Final: fixed M-1 (re-graduado) aviso "impuesto pendiente" falso con autodetracción — usa resumen.impuesto
Final: fixed M-8 (re-graduado) Por pagar no distinguía el tipo — etiquetaComprobante y columna Crédito fiscal en Excel; textos "comprobante"
Final: minor (deferred): M-2 pago.fecha sin validar por API; M-3 falta test de reversión de "Ya se pagó" con cuenta inactiva (verificado a mano por el revisor); M-4 cuenta malformada da "Valor inválido en _id"; M-5 falla silenciosa al cargar cuentas; M-6 precarga SIRE de ticket 12 no marca ticketConRuc; M-7 RH y tickets sin RUC salen "solo en el sistema" en SIRE (Fase 5); M-9 el formulario "Sin OC" no permite ligar una OT (fila "otros" de costos); ticketConRuc "false" texto por API; duplicado previo responde 400 (spec dice 409).
Final: Ruling: retención 3 % en recibos de servicios (14) se permite (dan crédito fiscal) — a confirmar con el contador — costo: retención indebida en recibos de luz si no corresponde
