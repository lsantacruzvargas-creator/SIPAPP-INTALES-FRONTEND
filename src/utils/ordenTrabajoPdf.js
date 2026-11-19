import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { formatearFecha, formatearFechaHora } from "./fecha";
import { cargarImagen, cargarImagenProtegida, formatoImagen } from "./cotizacionPdf";

// Misma paleta que el PDF de la cotización (formato Intales).
const NAVY = [0, 0, 40];
const AZUL = [0, 74, 173];
const GRIS_CLARO = [232, 232, 232];
const LOGO_ALTO = 16;
const MAX_IMAGENES = 6;

// Hoja de la orden de trabajo para el taller: sin precios (la ven técnicos y
// supervisores). `ot` trae lo que está en pantalla, ver datosParaPdf() en
// DetalleOrdenTrabajo.jsx.
export const exportarOrdenTrabajoPdf = async (ot) => {
  const doc = new jsPDF({ compress: true });
  const M = 12;
  const PAGE_W = doc.internal.pageSize.getWidth();
  const PAGE_H = doc.internal.pageSize.getHeight();
  const CONTENT_W = PAGE_W - M * 2;
  const numero = ot.numeroOT || ot.codigo || "—";

  const urlsImagenes = (ot.imagenes || []).slice(0, MAX_IMAGENES);
  const [logoIntales, ...imagenes] = await Promise.all([
    cargarImagen("/assets/logos/intales_logo.png"),
    ...urlsImagenes.map(cargarImagenProtegida),
  ]);

  // ─── Encabezado: logo a la izquierda, título y N° de OT a la derecha ───
  let y = M;
  if (logoIntales) {
    const ancho = LOGO_ALTO * (logoIntales.naturalWidth / logoIntales.naturalHeight);
    doc.addImage(logoIntales, formatoImagen(logoIntales), M, y, ancho, LOGO_ALTO);
  } else {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text("INTALES", M, y + LOGO_ALTO / 2);
  }
  doc.setTextColor(...NAVY);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text("ORDEN DE TRABAJO", PAGE_W - M, y + 6, { align: "right" });
  doc.setFontSize(12);
  doc.text(`N° ${numero}`, PAGE_W - M, y + 12.5, { align: "right" });
  doc.setTextColor(0, 0, 0);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  const creada = ot.createdAt
    ? formatearFechaHora(ot.createdAt, { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false })
    : "—";
  doc.text(`Fecha de creación: ${creada}`, PAGE_W - M, y + 17, { align: "right" });
  y += LOGO_ALTO + 4;

  doc.setDrawColor(...AZUL);
  doc.setLineWidth(0.3);
  doc.line(M, y, PAGE_W - M, y);
  y += 5;

  const barraSeccion = (titulo, yy, h = 6) => {
    doc.setFillColor(...NAVY);
    doc.rect(M, yy, CONTENT_W, h, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text(titulo, M + 3, yy + h / 2 + 1.2);
    doc.setTextColor(0, 0, 0);
    return yy + h + 1;
  };

  // ─── Datos del cliente y de la orden (dos columnas de etiqueta/valor) ───
  y = barraSeccion("DATOS GENERALES", y);
  const filas = [
    ["CLIENTE", ot.empresa?.razonSocial, "N° COTIZACIÓN", ot.numeroCotizacion],
    ["RUC", ot.empresa?.ruc, "FECHA DE OC RECIBIDA", ot.fechaOC ? formatearFecha(ot.fechaOC) : ""],
    ["PLANTA", ot.planta, "GUÍA DE LLEGADA", ot.numeroGuiaEmision],
    ["CONTACTO", ot.personaContacto, "ENCARGADO", ot.encargado],
  ];
  const etiqueta = (t) => ({ content: t, styles: { fontStyle: "bold", fillColor: GRIS_CLARO } });
  autoTable(doc, {
    startY: y,
    body: filas.map(([e1, v1, e2, v2]) => [etiqueta(e1), v1 || "—", etiqueta(e2), v2 || "—"]),
    theme: "grid",
    margin: { left: M, right: M },
    styles: { fontSize: 8, textColor: [0, 0, 0], lineColor: [0, 0, 0], lineWidth: 0.1, cellPadding: 1.6 },
    columnStyles: {
      0: { cellWidth: 26 },
      1: { cellWidth: CONTENT_W / 2 - 26 },
      2: { cellWidth: 38 },
      3: { cellWidth: CONTENT_W / 2 - 38 },
    },
  });
  y = doc.lastAutoTable.finalY + 5;

  // ─── Trabajo a realizar: título en negrita + detalle del ítem en viñetas ───
  y = barraSeccion("TRABAJO A REALIZAR", y);
  const titulo = (ot.titulo || "").trim() || "—";
  const subItems = (ot.subItems || []).map((s) => s.trim()).filter(Boolean);
  const tiempo = ot.tiempoFabricacion === "" || ot.tiempoFabricacion == null ? "—" : `${ot.tiempoFabricacion} días hábiles`;
  const cantidad = ot.cantidad === "" || ot.cantidad == null ? "—" : String(ot.cantidad);

  // Título y sub-ítems en filas separadas (sin borde entre ambas) en vez de
  // redibujar la negrita sobre una sola celda: autoTable corta las líneas con
  // el ancho de la letra normal y la negrita, más ancha, se salía del borde.
  const filasTrabajo = subItems.length ? 2 : 1;
  const sinBordeAbajo = { top: 0.1, right: 0.1, bottom: 0, left: 0.1 };
  const sinBordeArriba = { top: 0, right: 0.1, bottom: 0.1, left: 0.1 };
  const body = [[
    { content: cantidad, rowSpan: filasTrabajo },
    { content: titulo, styles: { fontStyle: "bold", ...(subItems.length ? { lineWidth: sinBordeAbajo } : {}) } },
    { content: tiempo, rowSpan: filasTrabajo },
  ]];
  if (subItems.length) {
    body.push([{
      content: subItems.map((s) => `   • ${s}`).join("\n"),
      styles: { lineWidth: sinBordeArriba, cellPadding: { top: 0, right: 2, bottom: 2, left: 2 } },
    }]);
  }

  autoTable(doc, {
    startY: y,
    head: [["CANT", "DESCRIPCIÓN", "TIEMPO DE FABRICACIÓN"]],
    body,
    theme: "grid",
    margin: { left: M, right: M },
    styles: { fontSize: 9, textColor: [0, 0, 0], lineColor: [0, 0, 0], lineWidth: 0.1, cellPadding: 2 },
    headStyles: { fontSize: 8, fontStyle: "bold", textColor: [0, 0, 0], fillColor: GRIS_CLARO, halign: "center" },
    columnStyles: {
      0: { cellWidth: 18, halign: "center", valign: "middle" },
      2: { cellWidth: 36, halign: "center", valign: "middle" },
    },
  });
  y = doc.lastAutoTable.finalY + 5;

  // ─── Imágenes del ítem (hasta 6, tres por fila) ───
  const imgs = imagenes.filter(Boolean);
  if (imgs.length) {
    if (y + 60 > PAGE_H - 15) { doc.addPage(); y = 15; }
    y = barraSeccion("IMÁGENES", y) + 2;
    const gap = 4, porFila = 3;
    const celdaW = (CONTENT_W - gap * (porFila - 1)) / porFila, celdaH = 50;
    imgs.forEach((img, i) => {
      if (i > 0 && i % porFila === 0) {
        y += celdaH + gap;
        if (y + celdaH > PAGE_H - 15) { doc.addPage(); y = 15; }
      }
      const escala = Math.min(celdaW / img.naturalWidth, celdaH / img.naturalHeight);
      const w = img.naturalWidth * escala, h = img.naturalHeight * escala;
      const x0 = M + (i % porFila) * (celdaW + gap);
      doc.addImage(img, formatoImagen(img), x0 + (celdaW - w) / 2, y + (celdaH - h) / 2, w, h);
    });
    y += celdaH + 5;
  }

  // ─── Observaciones ───
  doc.setFontSize(9);
  const lineasObs = doc.splitTextToSize((ot.observaciones || "").trim() || " ", CONTENT_W - 6);
  const altoObs = Math.max(22, lineasObs.length * 4.2 + 6);
  if (y + 7 + altoObs > PAGE_H - 40) { doc.addPage(); y = 15; }
  y = barraSeccion("OBSERVACIONES", y);
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.1);
  doc.rect(M, y, CONTENT_W, altoObs);
  doc.setFont("helvetica", "normal");
  doc.text(lineasObs, M + 3, y + 5);
  y += altoObs;

  // ─── Firmas: al pie de la hoja; si no caben debajo de lo anterior, en una nueva ───
  let yF = Math.max(y + 28, PAGE_H - 30);
  if (yF > PAGE_H - 14) { doc.addPage(); yF = PAGE_H - 30; }
  const anchoFirma = 60;
  [["ELABORADO POR", M + 15], ["RECIBIDO POR (PRODUCCIÓN)", PAGE_W - M - 15 - anchoFirma]].forEach(([texto, x]) => {
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.3);
    doc.line(x, yF, x + anchoFirma, yF);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.text(texto, x + anchoFirma / 2, yF + 4, { align: "center" });
  });

  const totalPaginas = doc.getNumberOfPages();
  for (let p = 1; p <= totalPaginas; p++) {
    doc.setPage(p);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(120, 120, 120);
    doc.text(`OT N° ${numero} · Página ${p} de ${totalPaginas}`, PAGE_W - M, PAGE_H - 6, { align: "right" });
  }

  doc.save(`OT N° ${numero}.pdf`);
};
