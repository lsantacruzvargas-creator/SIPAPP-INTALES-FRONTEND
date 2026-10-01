# SDD ledger — plan: docs/superpowers/plans/2026-10-01-tc-comprobantes-usd.md
BASE backend: d7d38a1 · BASE frontend: 3805902
Task 1: Ruling: una respuesta de apiperu fuera de 2–6 se trata como consulta fallida (no se guarda, se usa el respaldo) — costo si está mal: una consulta extra a apiperu
Task 1: Ruling: el rango 2–6 se valida en el servidor solo para comprobantes nuevos en USD; los ya guardados no se tocan
Task 1: tests escritos (tipoCambioDia: fuera de rango + tcEnRango; facturasProveedor: USD sin TC / fuera de rango / en rango) — NO EJECUTADOS: el entorno de esta sesión no pudo descargar MongoDB (fastdl.mongodb.org bloqueado). Pendiente correrlos.
Task 2: complete (tests: npm test (frontend) → 42/42, RED antes de implementar)
Task 3: Ruling: con fuente "respaldo" o "vigente" el TC se propone pero queda editable con aviso ámbar (la ruta responde 200, pero no es el TC SUNAT de esa fecha) — costo si está mal: el usuario podría guardar el respaldo sin revisarlo
Task 3: Ruling: si la consulta falla el campo queda vacío (antes se precargaba el TC vigente del módulo) para que el usuario lo escriba a propósito
Task 3: complete (eslint sin errores en los archivos tocados; build OK)
Task 4: navegador (Playwright + API simulada en :5000, sin backend real): USD 29/09 → 3.756 solo lectura "TC venta SUNAT 29/09"; 27/09 respaldo → 3.73 editable con aviso; 20/09 falla → vacío con aviso y "Registrar factura" deshabilitado; 37.5 → "Debe estar entre 2 y 6"; sin errores de página
