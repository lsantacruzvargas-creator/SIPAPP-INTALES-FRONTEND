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

  const [logoIntales, logoLexacaucho, logoMajuflex, logoRodilex, logoBcp, ...imagenesItems] = await Promise.all([
    cargarImagen("/assets/logos/intales_logo.png"),
    cargarImagen("/assets/logos/lexacaucho_logo.jpeg"),
    cargarImagen("/assets/logos/majuflex_logo.png"),
    cargarImagen("/assets/logos/rodilex_logo.png"),
    cargarImagen("/assets/logos/bcp_logo_intales.png"),
    ...items.map((item) => cargarImagenProtegida(item.imagenes?.[0])),
  ]);

  // ─── Encabezado: 4 logos + badge "COTIZACIÓN N°" ───
  let y = M;
  const logoH = 16;
  if (logoIntales) {
    const w = logoH * (logoIntales.naturalWidth / logoIntales.naturalHeight);
    doc.addImage(logoIntales, formatoImagen(logoIntales), M, y, w, logoH);
  } else {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text("INTALES", M, y + logoH / 2);
  }
  // Las 3 marcas hermanas van más chicas, alineadas a la derecha del
  // encabezado — siempre juntas, sin lógica condicional (decisión del
  // usuario, ver spec).
  const marcasHermanas = [logoLexacaucho, logoMajuflex, logoRodilex].filter(Boolean);
  if (marcasHermanas.length > 0) {
    const hMarca = 9, espacioMarca = 4;
    const anchos = marcasHermanas.map((m) => hMarca * (m.naturalWidth / m.naturalHeight));
    const anchoTotal = anchos.reduce((a, b) => a + b, 0) + espacioMarca * (marcasHermanas.length - 1);
    let mx = PAGE_W - M - anchoTotal;
    marcasHermanas.forEach((m, i) => {
      doc.addImage(m, formatoImagen(m), mx, y, anchos[i], hMarca);
      mx += anchos[i] + espacioMarca;
    });
  }
  y += logoH + 4;

  // Código completo del PDF: correlativo-año-INT/iniciales — se arma acá,
  // nunca se persiste (decisión del usuario, 2026-09-11, ver
  // Cotizacion.numeroCotizacion/pre-save en el backend).
  const anioDoc = cotizacion.fecha ? new Date(cotizacion.fecha).getFullYear() : new Date().getFullYear();
  const inicialesAsesor = cotizacion.creadoPor?.iniciales || "";
  const codigoCompleto = `${cotizacion.numeroCotizacion || cotizacion.codigo || "—"}-${anioDoc}-INT/${inicialesAsesor}`;

  doc.setFillColor(...AZUL);
  const badgeW = 70, badgeH = 8;
  const badgeX = PAGE_W - M - badgeW;
  doc.rect(badgeX, y, badgeW, badgeH, "F");
  doc.setTextColor(0, 0, 0);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  // doc.text(`COTIZACIÓN N° ${codigoCompleto}`, badgeX + badgeW / 2, y + badgeH / 2 + 1.3, { align: "center" });
  doc.text(`COTIZACIÓN N° ${codigoCompleto}`, 105, y + badgeH / 2 + 1.3, { align: "center" });

  doc.setTextColor(0, 0, 0);
  y += badgeH + 6;

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

  const simboloDoc = cotizacion.moneda === "USD" ? "US$" : "S/";

  // ─── Tabla de ítems ───
  // Cada fila = un ítem. Descripción trae, dentro de la misma celda: el
  // texto padre (se redibuja en negrita en didDrawCell, ver receta #1/#2),
  // los sub-ítems en viñeta, la línea "Tiempo de entrega: X días hábiles" y
  // — si el ítem tiene imagen — líneas en blanco reservando espacio para
  // dibujarla encima después.
  autoTable(doc, {
    startY: y,
    head: [["COD", "CANT.", "U.M", "DESCRIPCIÓN", "PRECIO UNITARIO", "PRECIO TOTAL"]],
    body: items.map((item) => {
      const precioNum = Number(item.precio) || 0;
      const subtotalNum = Number(item.subtotal) || 0;
      let desc = item.descripcion || "";
      if (item.subItems?.length > 0) {
        desc += "\n" + item.subItems.map((s) => `   • ${s}`).join("\n");
      }
      const diasEntrega = item.diasEntrega;
      if (diasEntrega !== "" && diasEntrega != null) {
        desc += `\nTiempo de entrega: ${diasEntrega} días hábiles`;
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
        subtotalNum === 0 ? "" : subtotalNum.toFixed(2),
      ];
    }),
    theme: "grid",
    margin: { left: M, right: M },
    styles: { fontSize: 7, textColor: [0, 0, 0], lineColor: [0, 0, 0], lineWidth: 0.1 },
    headStyles: { fontSize: 7, fontStyle: "bold", textColor: [0, 0, 0], fillColor: GRIS_CLARO, lineColor: [0, 0, 0], lineWidth: 0.1, halign: "center" },
    columnStyles: {
      0: { cellWidth: 14, halign: "center" },
      1: { cellWidth: 11, halign: "center" },
      2: { cellWidth: 10, halign: "center" },
      4: { cellWidth: 18, halign: "right" },
      5: { cellWidth: 18, halign: "right" },
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
  y = doc.lastAutoTable.finalY + 4;

  if (y + 60 > PAGE_H - 15) { doc.addPage(); y = 15; }

  // ─── Pie: Moneda / Forma de pago / Tiempo de entrega (izquierda) + Subtotal/IGV/Total (derecha) ───
  const totW = 80, totX = PAGE_W - M - totW, filaTotH = 7;
  const yPieInicio = y;
  const anchoIzqPie = CONTENT_W - totW - 6;
  doc.setFontSize(8.5);
  let yPie = y;
  yPie += labelValor(M, yPie, "MONEDA: ", cotizacion.moneda === "USD" ? "DÓLARES AMERICANOS" : "SOLES", anchoIzqPie) * 4.2;
  yPie += labelValor(M, yPie, "FORMA DE PAGO: ", cotizacion.condicionPago, anchoIzqPie) * 4.2;
  // Texto fijo — no es un campo editable, ver spec (decisión del usuario).
  yPie += labelValor(M, yPie, "TIEMPO DE ENTREGA: ", "DÍAS HÁBILES", anchoIzqPie) * 4.2;

  const totales = [
    ["SUB TOTAL", `${simboloDoc} ${Number(cotizacion.subtotal || 0).toFixed(2)}`, false],
    ["I.G.V (18%)", `${simboloDoc} ${Number(cotizacion.igv || 0).toFixed(2)}`, false],
    ["TOTAL", `${simboloDoc} ${Number(cotizacion.total || 0).toFixed(2)}`, true],
  ];
  let yTot = yPieInicio;
  totales.forEach(([label, valor, negrita]) => {
    doc.setDrawColor(0);
    doc.rect(totX, yTot, totW, filaTotH);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(negrita ? 9 : 8);
    doc.text(label, totX + 3, yTot + filaTotH / 2 + 1.2);
    doc.text(valor, totX + totW - 3, yTot + filaTotH / 2 + 1.2, { align: "right" });
    yTot += filaTotH;
  });

  y = Math.max(yPie, yTot) + 4;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(6);
  doc.text("** VALIDEZ DE LA OFERTA 15 DÍAS", M, y); y += 4;
  doc.text("** CONSULTAR CONDICIONES DE TRANSPORTE", M, y); y += 8;

  if (y + 40 > PAGE_H - 15) { doc.addPage(); y = 15; }

  // ─── Cierre: generar OC a nombre de + firma dinámica del creador ───
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.text("EN CASO DE SER FAVORECIDOS", PAGE_W / 4, y, { align: "center" });
  y += 5;
  doc.text(" GENERAR LA OC A NOMBRE DE:", PAGE_W / 4, y, { align: "center" });
  y += 5;

  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.text(`${emisor.razonSocial || "—"}`, PAGE_W / 4, y, { align: "center" });
  y += 5;
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.text(`RUC ${emisor.ruc || "—"}`, PAGE_W / 4, y, { align: "center" })

  y += 8;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.text("Atentamente,", PAGE_W / 4, y, { align: "center" });
  y += 4.2;
  const creador = cotizacion.creadoPor;
  if (creador?.nombre) {
    doc.setFont("helvetica", "bold");
    doc.text(creador.nombre, PAGE_W / 4, y, { align: "center" });
    y += 4.2;
    doc.setFont("helvetica", "normal");
    if (creador.cargo) { doc.text(creador.cargo, PAGE_W / 4, y, { align: "center" }); y += 4.2; }
    // const contacto = [creador.correo, creador.telefono].filter(Boolean).join(" · ");
    // if (contacto) { doc.text(contacto, PAGE_W / 2, y, { align: "center" }); y += 4.2; }
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.text(creador.correo, PAGE_W / 4, y, { align: "center" });
    y += 4.2
    doc.setFontSize(8.5);
    doc.text(creador.telefono, PAGE_W / 4, y, { align: "center" });

  }
  y += 6;

  if (y + 34 > PAGE_H - 15) { doc.addPage(); y = 15; }

  // ─── Cuentas bancarias ───
  const logoAltoBanco = 8;
  if (logoBcp) {
    const w = logoAltoBanco * (logoBcp.naturalWidth / logoBcp.naturalHeight);
    doc.addImage(logoBcp, formatoImagen(logoBcp), PAGE_W / 2 - w / 2, y, w, logoAltoBanco);
  }
  y += logoAltoBanco + 3;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  const lineaCentrada = (texto, negrita = false) => {
    doc.setFont("helvetica", negrita ? "bold" : "normal");
    doc.text(texto, PAGE_W / 2, y, { align: "center" });
    y += 4;
  };
  lineaCentrada("CUENTA CORRIENTE BCP DÓLARES", true);
  lineaCentrada(`CÓDIGO DE CUENTA: ${BANCOS.bcpCuentaDolares}`);
  lineaCentrada(`CCI: ${BANCOS.bcpCciDolares}`);
  y += 2;
  lineaCentrada("CUENTA CORRIENTE BCP SOLES", true);
  lineaCentrada(`CÓDIGO DE CUENTA: ${BANCOS.bcpCuentaSoles}`);
  lineaCentrada(`CCI: ${BANCOS.bcpCciSoles}`);
  y += 2;
  lineaCentrada("CUENTA DE DETRACCIÓN BANCO DE LA NACIÓN S/.", true);
  lineaCentrada(BANCOS.bnCuentaDetraccion);

  doc.save(`Cotización N° ${codigoCompleto}.pdf`);
};
