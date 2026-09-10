# Logos del membrete de Cotización

## Logos reales de Intales (vigentes)

Extraídos de `formato-cotizacion-INTALES.xlsx` (raíz de `SIPAPP-INTALES`), la
plantilla real de cotización de Intales, el 2026-09-10. Usados por
`Frontend/src/utils/cotizacionPdf.js` (ver
`docs/superpowers/specs/2026-09-10-cotizacion-intales-design.md`):

- `intales_logo.png` — logo de Intales ("INGENIERÍA Y METALMECÁNICA
  ESPECIALIZADA"). Esquina superior izquierda del encabezado, el más grande
  de los 4.
- `lexacaucho_logo.jpeg`, `majuflex_logo.png`, `rodilex_logo.png` — logos de
  las 3 marcas hermanas de Intales (Lexacaucho, Majuflex, Rodilex). Van
  siempre junto al logo de Intales en el encabezado, sin lógica condicional
  por línea de producto (decisión del usuario, ver spec).
- `bcp_logo_intales.png` — logo BCP, junto a las cuentas bancarias reales de
  Intales en el pie del PDF (distinto de `bcp_logo.png`, que sigue siendo el
  de Huaquian — no se tocó).

## Logos de Huaquian (heredados, código muerto)

Extraídos de `Plantilla-cotizacion.xlsx` (raíz del proyecto), la plantilla
oficial de cotización de Huaquian. Ya no los usa `cotizacionPdf.js` (ver
arriba) — quedan en el árbol sin limpiar todavía, no es parte de este
cambio:

- `huaquian_icon.png` — ícono chip + wordmark "HUAQUIAN" apilado (1:1, azul
  marino). Marca de agua centrada y esquina del encabezado.
- `huaquian_header.png` — banner ancho (13:1) "HUAQUIAN | In partnership
  with SIEMENS", fondo azul marino. Franja superior de cada PDF.
- `marcas_footer.png` — grid de marcas representadas (SEW Eurodrive, Lenze,
  Siemens, ABB, Parker, Allen-Bradley, Baumüller, Emerson, Rexroth) + lema
  "ESPECIALISTAS EN MANTENIMIENTO...". Pie de página.
- `bcp_logo.png` / `banco_nacion_logo.png` — logos de los bancos, junto a
  los números de cuenta en la sección "MÉTODO DE PAGO".

`logo_huaquian.jpg` y `logo_sip.png` son variantes usadas en otras partes
de la UI (no en el PDF de cotización).

No hace falta reiniciar nada: al estar en `public/`, Vite los sirve tal
cual en `/assets/logos/...`. Si algún archivo no está presente, la
exportación de PDF simplemente omite ese logo (no rompe la descarga).
