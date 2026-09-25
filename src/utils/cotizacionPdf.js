import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { formatearFecha } from "./fecha";
import { fetchAuth, fetchUpload } from "./fetchAuth";

// Se cargan desde /public (no un import de módulo) para que, si el archivo
// todavía no fue subido, solo falle la carga de esa imagen puntual en vez
// de romper el build o la exportación completa del PDF.
function cargarImagen(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

// Igual que cargarImagen(), pero para archivos protegidos por authMiddleware
// (/uploads/cotizaciones/...) — no se puede poner la URL directo en <img src>
// (no manda el header Authorization), así que se trae con fetchUpload()
// (mismo mecanismo que ImagenProtegida.jsx). A diferencia de ImagenProtegida
// (que solo necesita la imagen VISIBLE una vez, con una Object URL de blob
// que revoca al desmontar), acá el `<img>` resultante se lo pasamos después
// a jsPDF `doc.addImage()`, que vuelve a leer `img.src` recién al DIBUJAR la
// celda (dentro de `didDrawCell`, más tarde que la carga) — si para entonces
// la Object URL ya fue revocada, jsPDF falla con
// "GET blob:...net::ERR_FILE_NOT_FOUND" (bug real, confirmado 2026-09-11).
// Por eso acá se usa un data URI (FileReader) en vez de una Object URL: no
// depende de ninguna URL viva, jsPDF puede leerlo en cualquier momento.
function cargarImagenProtegida(url) {
  if (!url) return Promise.resolve(null);
  return fetchUpload(url)
    .then((r) => (r.ok ? r.blob() : null))
    .then((blob) => {
      if (!blob) return null;
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = () => resolve(null);
          img.src = reader.result;
        };
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(blob);
      });
    })
    .catch(() => null);
}

// jsPDF necesita que el formato pasado a addImage() coincida con el
// contenido real (JPEG vs PNG vs WEBP) — pasar "PNG" fijo para todo rompía
// silenciosamente con lexacaucho_logo.jpeg y con cualquier imagen de ítem
// subida como JPEG/WEBP (bug real, confirmado 2026-09-11, mismo síntoma que
// el de la Object URL revocada). Se detecta del propio `src` (funciona
// tanto para rutas de archivo en /public como para data URIs).
function formatoImagen(img) {
  const src = img?.src || "";
  if (/\.jpe?g(\?|$)/i.test(src) || /^data:image\/jpe?g/i.test(src)) return "JPEG";
  if (/\.webp(\?|$)/i.test(src) || /^data:image\/webp/i.test(src)) return "WEBP";
  return "PNG";
}

// Paleta del formato de Intales, tomada de formato-cotizacion-INTALES.xlsx
// (raíz de SIPAPP-INTALES) — ver docs/superpowers/specs/2026-09-10-cotizacion-intales-design.md.
const NAVY = [0, 0, 40];
const AZUL = [0, 74, 173];
const GRIS_CLARO = [232, 232, 232];

// Alto de cada logo del PDF, en mm — ajustable individualmente por logo (el
// ancho siempre se deriva de la proporción real de cada imagen, nunca se
// estira). "intales" es el logo principal del encabezado; "grupoLexacaucho"
// es el logo combinado que va pegado a su derecha (reemplaza a las 3 marcas
// hermanas sueltas de antes — Lexacaucho, Majuflex y Rodilex ahora se
// representan con este único logo, decisión del usuario 2026-09-11); "bcp"
// es el logo dentro de la caja de cuentas bancarias del pie.
const LOGO_ALTO = {
  intales: 16,
  grupoLexacaucho: 16,
  bcp: 9,
};

// Posición de cada logo, en mm desde la esquina superior izquierda de la
// hoja. `null` en `x` o `y` deja ese eje en su posición automática de
// siempre (Intales pegado al margen izquierdo; Grupo Lexacaucho pegado al
// extremo derecho del logo de Intales; BCP en la esquina de su caja de
// cuentas bancarias) — poner un número ahí mueve SOLO ese logo, sin correr
// a los demás.
const LOGO_POS = {
  intales: { x: null, y: null },
  grupoLexacaucho: { x: 130, y: null },
};

// Texto descriptivo fijo junto al logo de Grupo Lexacaucho, a la derecha del
// logo mismo — tal como la plantilla de referencia del usuario; no es un
// campo editable de la cotización.
const TEXTO_GRUPO_LEXACAUCHO =
  "Fabricación, mantenimiento, desarrollo de proyectos y servicios complementarios; en metales y materiales especiales.";

// Cuentas bancarias reales de Intales (mismo Excel).
const BANCOS = {
  bcpCuentaDolares: "191-9134985-1-83",
  bcpCciDolares: "002-191-009134985183-51",
  bcpCuentaSoles: "191-9291696-0-12",
  bcpCciSoles: "002-191-009291696012-50",
  bnCuentaDetraccion: "00-057-103825",
};

// Alto reservado (en líneas de texto en blanco) para la miniatura de un ítem
// con imagen — ver receta de "reservar espacio con líneas en blanco" del
// skill pdf-cotizacion-recetas: autoTable calcula el alto de fila a partir
// del texto de la celda, así que una imagen necesita líneas vacías extra
// para que la fila quede lo bastante alta antes de dibujarla encima.
const LINEAS_RESERVA_IMAGEN = 8;

export const exportarCotizacionPdf = async (cotizacion) => {
  const doc = new jsPDF();
  const empresa = cotizacion.empresa;
  const items = cotizacion.items || [];
  const M = 12;
  const PAGE_W = doc.internal.pageSize.getWidth();
  const PAGE_H = doc.internal.pageSize.getHeight();
  const CONTENT_W = PAGE_W - M * 2;

  // Emisor (ruc/razonSocial) — ya no viene hardcodeado, se lee de .env vía
  // el backend (ver Backend/src/routes/cotizaciones.js GET /emisor).
  const emisorRes = await fetchAuth("/cotizaciones/emisor");
  const emisor = emisorRes.ok ? await emisorRes.json() : { ruc: "", razonSocial: "" };

  const [logoIntales, logoGrupoLexacaucho, logoBcp, ...imagenesItems] = await Promise.all([
    cargarImagen("/assets/logos/intales_logo.png"),
    cargarImagen("/assets/logos/grupo_lexacaucho.png"),
    cargarImagen("/assets/logos/bcp_logo_intales.png"),
    ...items.map((item) => cargarImagenProtegida(item.imagenes?.[0])),
  ]);

  // ─── Encabezado: logo Intales + logo Grupo Lexacaucho + texto ───
  // Cada logo usa su propio alto de LOGO_ALTO (mm) y, opcionalmente, su
  // propia posición fija de LOGO_POS — el ancho siempre se deriva de la
  // proporción real de la imagen, nunca se estira.
  let y = M;
  const altoIntales = LOGO_ALTO.intales;
  let anchoIntales = 0;
  if (logoIntales) {
    anchoIntales = altoIntales * (logoIntales.naturalWidth / logoIntales.naturalHeight);
    const xIntales = LOGO_POS.intales.x ?? M;
    const yIntales = LOGO_POS.intales.y ?? y;
    doc.addImage(logoIntales, formatoImagen(logoIntales), xIntales, yIntales, anchoIntales, altoIntales);
  } else {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text("INTALES", LOGO_POS.intales.x ?? M, (LOGO_POS.intales.y ?? y) + altoIntales / 2);
  }

  // Logo de Grupo Lexacaucho, pegado al extremo derecho del logo de Intales,
  // con su texto descriptivo fijo a la derecha (ver captura de referencia
  // del usuario). Se dibuja tal cual viene el archivo: quitarle el blanco le
  // comía parte del propio dibujo (texto/triángulo con tonos claros).
  let altoMaxEncabezado = altoIntales;
  if (logoGrupoLexacaucho) {
    const altoGL = LOGO_ALTO.grupoLexacaucho;
    const anchoGL = altoGL * (logoGrupoLexacaucho.naturalWidth / logoGrupoLexacaucho.naturalHeight);
    const espacioGL = 8;
    const xGL = LOGO_POS.grupoLexacaucho.x ?? (M + anchoIntales + espacioGL);
    const yGL = LOGO_POS.grupoLexacaucho.y ?? y;
    doc.addImage(logoGrupoLexacaucho, formatoImagen(logoGrupoLexacaucho), xGL, yGL, anchoGL, altoGL);
    altoMaxEncabezado = Math.max(altoMaxEncabezado, altoGL);

    const xTexto = xGL + anchoGL + 3;
    const anchoTexto = 32;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(0, 0, 0);
    const lineasTexto = doc.splitTextToSize(TEXTO_GRUPO_LEXACAUCHO, anchoTexto);
    let yTexto = yGL + 3;
    lineasTexto.forEach((linea) => { doc.text(linea, xTexto, yTexto); yTexto += 3; });
  }
  y += altoMaxEncabezado + 4;

  // Código completo del PDF: correlativo-año-INT/iniciales — se arma acá,
  // nunca se persiste (decisión del usuario, 2026-09-11, ver
  // Cotizacion.numeroCotizacion/pre-save en el backend).
  const anioDoc = cotizacion.fecha ? new Date(cotizacion.fecha).getFullYear() : new Date().getFullYear();
  const inicialesAsesor = cotizacion.creadoPor?.iniciales || "";
  const codigoCompleto = `${cotizacion.numeroCotizacion || cotizacion.codigo || "—"}-${anioDoc}-INT/${inicialesAsesor}`;

  // Raya delgada de margen a margen en vez del recuadro azul relleno de
  // antes (corrección del usuario contra el Excel de referencia); el texto
  // "COTIZACIÓN N°" queda centrado en la hoja, debajo de la raya.
  doc.setDrawColor(...AZUL);
  doc.setLineWidth(0.3);
  doc.line(M, y, PAGE_W - M, y);
  y += 5;
  doc.setTextColor(0, 0, 0);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text(`COTIZACIÓN N° ${codigoCompleto}`, 105, y, { align: "center" });
  y += 8;

  // ─── Datos del cliente ───
  const labelValor = (x, yy, label, valor, maxW) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    const labelW = doc.getTextWidth(label);
    doc.text(label, x, yy);
    doc.setFont("helvetica", "normal");
    if (maxW) {
      const lineas = doc.splitTextToSize(valor || "—", maxW - labelW);
      doc.text(lineas, x + labelW, yy);
      return lineas.length;
    }
    doc.text(valor || "—", x + labelW, yy);
    return 1;
  };

  // Dirección del cliente sale de la planta seleccionada (no de la empresa
  // en general) — ver spec, sección "PDF". `plantas` puede no venir populado
  // en todas las respuestas; se degrada a "—" si no se encuentra.
  const plantaSel = empresa?.plantas?.find((p) => p.nombre === cotizacion.planta);
  const direccionCliente = plantaSel?.direccion || "";

  const colIzqW = CONTENT_W * 0.62;
  let yIzq = y;
  yIzq += labelValor(M, yIzq, "SEÑORES:    ", empresa?.razonSocial, colIzqW) * 4.2;
  yIzq += labelValor(M, yIzq, "RUC:              ", empresa?.ruc, colIzqW) * 4.2;
  yIzq += labelValor(M, yIzq, "DIRECCIÓN:  ", direccionCliente, colIzqW) * 4.2;
  yIzq += labelValor(M, yIzq, "ATENCIÓN:    ", cotizacion.atencion, colIzqW) * 4.2;
  yIzq += labelValor(M, yIzq, "RQ:                 ", cotizacion.rq, colIzqW) * 4.2;

  // const colDerX = M + colIzqW + 4, colDerW = CONTENT_W - colIzqW - 4;
  const colDerX = M + colIzqW + 4 - 15, colDerW = CONTENT_W - colIzqW - 4;

  const fechaStr = cotizacion.fecha ? formatearFecha(cotizacion.fecha) : "—";
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.text("FECHA:", colDerX + colDerW, y, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.text(fechaStr, doc.getTextWidth("FECHA__") + colDerX + colDerW, y, { align: "right" });

  y = yIzq + 4;

  // ─── Barra de sección navy, ancho completo (reutilizable) ───
  const barraSeccion = (titulo, yy, h = 6) => {
    doc.setFillColor(...NAVY);
    doc.rect(M, yy, CONTENT_W, h, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text(titulo, M + 3, yy + h / 2 + 1.2);
    doc.setTextColor(0, 0, 0);
    return yy + h + 4;
  };

  const simboloDoc = cotizacion.moneda === "USD" ? "$" : "S/";

  // Anchos de columna de la tabla de ítems — se definen una sola vez y se
  // reutilizan también en la tabla de totales de más abajo, para que ambas
  // SIEMPRE calcen sin importar qué tan angostas/anchas sean estas columnas
  // (antes cada tabla tenía sus propios anchos hardcodeados por separado y
  // se desincronizaban — mismo bug de fondo que el del desfase original).
  const COL_COD = 11, COL_CANT = 11, COL_UM = 8, COL_PU = 13, COL_DESC = 10, COL_PN = 14, COL_PT = 14;

  // ─── Tabla de ítems ───
  // Cada fila = un ítem. Descripción trae, dentro de la misma celda: el
  // texto padre (se redibuja en negrita en didDrawCell, ver receta #1/#2),
  // los sub-ítems en viñeta, la línea "Tiempo de entrega: X días hábiles" y
  // — si el ítem tiene imagen — líneas en blanco reservando espacio para
  // dibujarla encima después.
  // Descuento global (%) de toda la cotización, aplicado sobre el precio
  // unitario de CADA ítem (ver montoDescuentoItem/precioConDescuento en
  // cotizacionItems.js, reescrito acá porque el PDF no importa ese util) —
  // ya no es un % por ítem, es uno solo para toda la cotización, así que se
  // muestra directamente en la cabecera de la columna en vez de repetirlo fila
  // por fila.
  const descuentoGlobalPct = Number(cotizacion.descuentoGlobal) || 0;

  autoTable(doc, {
    startY: y,
    head: [["COD", "CANT", "UM", "DESCRIPCIÓN", "PRECIO UNIT", `DSCT ${descuentoGlobalPct}%`, "PRECIO C/DSCT", "PRECIO TOTAL"]],
    body: items.map((item) => {
      const precioNum = Number(item.precio) || 0;
      const descuentoNum = Math.max(0, precioNum * descuentoGlobalPct / 100);
      const precioNetoNum = Math.max(0, precioNum - descuentoNum);
      const subtotalNum = Number(item.subtotal) || 0;
      let desc = item.descripcion || "";
      if (item.subItems?.length > 0) {
        desc += "\n" + item.subItems.map((s) => `   • ${s}`).join("\n");
      }
      const diasEntrega = item.diasEntrega;
      if (diasEntrega !== "" && diasEntrega != null) {
        desc += `\nTiempo de entrega: ${diasEntrega} días`;
      }
      if (item.imagenes?.[0]) {
        desc += "\n".repeat(LINEAS_RESERVA_IMAGEN);
      }
      return [
        item.codigo || "",
        item.cantidad,
        item.unidad || "und",
        desc,
        precioNum === 0 ? "" : precioNum.toFixed(2),
        descuentoNum === 0 ? "" : descuentoNum.toFixed(2),
        precioNetoNum === 0 ? "" : precioNetoNum.toFixed(2),
        subtotalNum === 0 ? "" : subtotalNum.toFixed(2),
      ];
    }),
    theme: "grid",
    margin: { left: M, right: M },
    styles: { fontSize: 7, textColor: [0, 0, 0], lineColor: [0, 0, 0], lineWidth: 0.1 },
    headStyles: { fontSize: 7, fontStyle: "bold", textColor: [0, 0, 0], fillColor: GRIS_CLARO, lineColor: [0, 0, 0], lineWidth: 0.1, halign: "center" },
    columnStyles: {
      0: { cellWidth: COL_COD, halign: "center" },
      1: { cellWidth: COL_CANT, halign: "center" },
      2: { cellWidth: COL_UM, halign: "center" },
      4: { cellWidth: COL_PU, halign: "right" },
      5: { cellWidth: COL_DESC, halign: "right" },
      6: { cellWidth: COL_PN, halign: "right" },
      7: { cellWidth: COL_PT, halign: "right" },
    },
    didDrawCell: (data) => {
      if (data.section !== "body" || data.column.index !== 3) return;
      const item = items[data.row.index];
      if (!item) return;
      const { cell } = data;
      doc.setFontSize(cell.styles.fontSize);
      const maxWidth = cell.width - cell.padding("left") - cell.padding("right");
      const lineasPadre = doc.splitTextToSize(item.descripcion || "", maxWidth);

      const totalLineas = Array.isArray(cell.text) && cell.text.length > 0 ? cell.text.length : lineasPadre.length;
      const padTop = cell.padding("top");
      const padBottom = cell.padding("bottom");
      const alturaInterior = cell.height - padTop - padBottom;
      const lineHeight = alturaInterior / totalLineas;
      const bandHeight = lineasPadre.length * lineHeight;

      doc.setFillColor(255, 255, 255);
      doc.rect(cell.x + 0.3, cell.y + padTop - 0.2, cell.width - 0.6, bandHeight + 0.2, "F");

      const x = cell.x + cell.padding("left");
      let ly = cell.y + padTop + lineHeight * 0.75;
      doc.setFont("helvetica", "bold");
      lineasPadre.forEach((linea) => { doc.text(linea, x, ly); ly += lineHeight; });
      doc.setFont("helvetica", "normal");

      // Imagen del ítem, si existe — dibujada en el espacio reservado con
      // las líneas en blanco al final de la celda (ver LINEAS_RESERVA_IMAGEN).
      const img = imagenesItems[data.row.index];
      if (img) {
        const maxImgH = lineHeight * (LINEAS_RESERVA_IMAGEN - 1);
        const maxImgW = maxWidth * 0.5;
        const escala = Math.min(maxImgW / img.naturalWidth, maxImgH / img.naturalHeight, 1);
        const imgW = img.naturalWidth * escala;
        const imgH = img.naturalHeight * escala;
        const imgY = cell.y + cell.height - padBottom - imgH - 1;
        doc.addImage(img, formatoImagen(img), x, imgY, imgW, imgH);
      }
    },
  });

  // ─── Pie: tabla Moneda/Forma de pago/Tiempo de entrega + Subtotal/IGV/Total.
  // Pegada directamente debajo de la tabla de ítems (sin espacio de por
  // medio, para que ambas se vean como una sola tabla continua — pedido del
  // usuario) y con columnas LITERALES (sin colSpan) cuyos anchos se derivan
  // de las mismas constantes COL_* que la tabla de ítems de arriba, para que
  // calcen siempre exacto (jspdf-autotable no garantiza que el ancho de una
  // celda con colSpan sea la suma exacta de los columnStyles de las columnas
  // que abarca cuando esas columnas nunca aparecen como celda suelta en
  // ninguna fila de ESTA tabla — bug real, confirmado 2026-09-11). Mapeo de
  // columnas pedido por el usuario: col0 (etiqueta) = ítems.col0+1+2,
  // col1 (valor) = ítems.col3, col2 (etiqueta total) = ítems.col4 (PRECIO
  // UNITARIO), col3 (valor total) = ítems.col5+col6+col7 combinadas
  // (DESCUENTO + PRECIO + PRECIO TOTAL) para que el borde derecho siga
  // calzando con el de arriba.
  const totColLabelW = COL_COD + COL_CANT + COL_UM;
  const totColDescW = CONTENT_W - totColLabelW - COL_PU - COL_DESC - COL_PN - COL_PT;
  y = doc.lastAutoTable.finalY;

  if (y + 60 > PAGE_H - 15) { doc.addPage(); y = 15; }

  autoTable(doc, {
    startY: y,
    body: [
      [
        { content: "MONEDA", styles: { fontStyle: "bold", halign: "left" } },
        { content: cotizacion.moneda === "USD" ? "DÓLARES AMERICANOS" : "SOLES" },
        { content: "SUB TOTAL", styles: { fontStyle: "bold" } },
        { content: `${simboloDoc} ${Number(cotizacion.subtotal || 0).toFixed(2)}`, styles: { halign: "right" } },
      ],
      [
        { content: "FORMA DE PAGO", styles: { fontStyle: "bold", halign: "left" } },
        { content: cotizacion.condicionPago || "—" },
        { content: "I.G.V (18%)", styles: { fontStyle: "bold" } },
        { content: `${simboloDoc} ${Number(cotizacion.igv || 0).toFixed(2)}`, styles: { halign: "right" } },
      ],
      [
        { content: "TIEMPO DE ENTREGA", styles: { fontStyle: "bold", halign: "left" } },
        { content: cotizacion.tipoDiasEntrega === "utiles" ? "DÍAS ÚTILES" : "DÍAS HÁBILES" },
        { content: "TOTAL", styles: { fontStyle: "bold", fontSize: 9 } },
        { content: `${simboloDoc} ${Number(cotizacion.total || 0).toFixed(2)}`, styles: { fontStyle: "bold", fontSize: 9, halign: "right" } },
      ],
    ],
    theme: "grid",
    margin: { left: M, right: M },
    styles: { fontSize: 7, textColor: [0, 0, 0], lineColor: [0, 0, 0], lineWidth: 0.1 },
    columnStyles: {
      0: { cellWidth: totColLabelW },
      1: { cellWidth: totColDescW },
      2: { cellWidth: COL_PU + COL_DESC },
      3: { cellWidth: COL_PN + COL_PT },
    },
  });
  y = doc.lastAutoTable.finalY + 4;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(6);
  doc.text(`** VALIDEZ DE LA OFERTA ${cotizacion.validezOferta || 7} DÍAS`, M, y); y += 8;

  const cajaAltura = 16;
  const firmaLineas = 4 + [cotizacion.creadoPor?.nombre, cotizacion.creadoPor?.cargo, cotizacion.creadoPor?.telefono, cotizacion.creadoPor?.correo].filter(Boolean).length;
  if (y + 24 + cajaAltura + firmaLineas * 4.2 > PAGE_H - 15) { doc.addPage(); y = 15; }

  // ─── Pie: condiciones al margen izquierdo, caja de cuentas bancarias de
  // ancho completo (borde negro, fondo blanco) y firma del creador centrada.
  doc.setTextColor(0, 0, 0);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text("* En caso de ser favorecidos, girar la O/C a nombre de:", M, y); y += 4;
  doc.text(`  ${emisor.razonSocial || "—"}, RUC ${emisor.ruc || "—"}`, M, y); y += 4;
  doc.text(`* CTA de detracción BCO NACION S/ ${BANCOS.bnCuentaDetraccion}`, M, y); y += 4;
  doc.text("* NO INCLUYE TRANSPORTE", M, y); y += 6;

  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.4);
  doc.rect(M, y, CONTENT_W, cajaAltura);

  const mitad = CONTENT_W / 2;
  const columnaBanco = (x0, lineas) => {
    let xTexto = x0 + 3;
    if (logoBcp) {
      const hLogo = LOGO_ALTO.bcp;
      const wLogo = hLogo * (logoBcp.naturalWidth / logoBcp.naturalHeight);
      doc.addImage(logoBcp, formatoImagen(logoBcp), x0 + 3, y + (cajaAltura - hLogo) / 2, wLogo, hLogo);
      xTexto += wLogo + 3;
    }
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(0, 0, 0);
    doc.text(lineas[0], xTexto, y + cajaAltura / 2 - 1);
    doc.text(lineas[1], xTexto, y + cajaAltura / 2 + 3.5);
  };
  columnaBanco(M, [
    `Cuenta corriente BCP DÓLARES: ${BANCOS.bcpCuentaDolares}`,
    `Cuenta corriente BCP SOLES:      ${BANCOS.bcpCuentaSoles}`,
  ]);
  columnaBanco(M + mitad, [
    `CCI BCP DÓLARES: ${BANCOS.bcpCciDolares}`,
    `CCI BCP SOLES:      ${BANCOS.bcpCciSoles}`,
  ]);
  y += cajaAltura + 8;

  const creador = cotizacion.creadoPor;
  if (creador?.nombre) {
    const cx = PAGE_W / 2;
    doc.setFontSize(8.5);
    doc.setFont("helvetica", "normal");
    doc.text(creador.nombre, cx, y, { align: "center" }); y += 4.2;
    if (creador.cargo) {
      doc.setFont("helvetica", "bold");
      doc.text(creador.cargo, cx, y, { align: "center" }); y += 4.2;
      doc.setFont("helvetica", "normal");
    }
    if (creador.telefono) { doc.text(`Teléfono: ${creador.telefono}`, cx, y, { align: "center" }); y += 4.2; }
    if (creador.correo) { doc.text(creador.correo, cx, y, { align: "center" }); y += 4.2; }
  }

  y += 4;
  if (y + 12 > PAGE_H - 10) { doc.addPage(); y = 15; }
  doc.setDrawColor(...AZUL);
  doc.setLineWidth(0.15);
  doc.line(M + 8, y, PAGE_W - M - 8, y);
  y += 4;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6);
  doc.setTextColor(0, 0, 0);
  doc.text("Para consulta, reclamo, crédito, sugerencia o reasignación de vendedor(a); enviar un correo a consultas@lexacaucho.com .Donde se detallará", M + 30, y);
  doc.text("la sugerencia, consulta o reclamo, manteniendo la confidencialidad y tomando las medidas necesarias para mejorar el servicio a ustedes.", M + 32, y + 3);

  doc.save(`Cotización N° ${codigoCompleto}.pdf`);
};
