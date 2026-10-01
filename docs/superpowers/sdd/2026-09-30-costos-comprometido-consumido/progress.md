# SDD ledger — plan: docs/superpowers/plans/2026-09-30-costos-comprometido-consumido.md
Pre-flight: Task 2 produce FilaCosto (ocMoneda, sin margen) que consumen Tasks 4-5 (costoEn calcula el margen) — coincide. Task 3 produce GET /sunat/tipo-cambio?fecha (venta, fecha, fuente) que consume SelectorMonedaTC (Task 4) y la tarjeta (Task 5) — coincide.
BASE backend: 39ca28b · BASE frontend: dca7ec0c
Task 1: complete (commits 39ca28b..63f2c07, tests: npm test → 128 pass)
Task 2: Ruling: el test de ítems antiguos insertaba OTs sin codigo (índice único) — se les agregó codigo — sin efecto en lo medido
Task 2: complete (commits 63f2c07..b89b970, tests: npm test → 138 pass)
Task 3: complete (commits b89b970..c3846c5, tests: npm test → 143 pass)
Task 4: Ruling: SelectorMonedaTC ignora el clic en la moneda ya elegida (si no, el TC quedaba en null sin volver a pedirse) — costo: ninguno
Task 4: Ruling: Seccion recibe props opcionales ayuda/extra para el selector y la línea de ayuda — sin efecto en las otras secciones
Task 4: complete (commits dca7ec0..3750a54a, tests: npm test (frontend) → 38/38; eslint sin errores; build OK)
Task 5: Ruling: la tarjeta compara contra el subtotal y moneda de ESTA OC (no la que el servidor halla por cotización, que puede tener varias OC) — costo si está mal: ninguno, es más preciso
Task 5: complete (commits 3750a54..3343fd56, tests: npm test (frontend) → 38/38; eslint sin errores nuevos; build OK)
Task 6: E2E encontró que apiperu devuelve fecha_sunat = día hábil anterior siempre, así que "hoy" nunca se guardaba y cada carga en US$ pagaba una consulta — "hoy" se guarda provisional 3 h (test RED→GREEN), commit 1198111
Task 6: Ruling: vigencia del provisional = 3 h — costo si está mal: más o menos consultas a apiperu
Task 6: Playwright OK — OCP-0003 (S/ 300, OT 6) en comprometido (679→979); FP-0003 pagada → comprometido 679 y consumido materiales +300; US$ al TC 3.45 y al 25/09 (3.406), segunda consulta del 25/09 fuente bd; tarjeta de la OC 45269411 = reporte en S/ y US$; Excel con 3 hojas en USD con TC.
