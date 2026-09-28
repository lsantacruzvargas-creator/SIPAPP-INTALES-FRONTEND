import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { fetchAuth } from "./fetchAuth";
import { formatearFecha } from "./fecha";
import { cargarImagen, formatoImagen } from "./cotizacionPdf";
import { money } from "./compras";

const NAVY = [0, 0, 40];
const M = 12;
const ALTO_LOGO = 16;

export const ESTILO_TABLA = {
  margin: { left: M, right: M },
  headStyles: { fillColor: NAVY, textColor: 255, fontSize: 8.5 },
  styles: { fontSize: 8.5, cellPadding: 1.8 },
};

// Logo + razón social/RUC de INTALES a la izquierda; caja con título,
// número y fecha a la derecha. Devuelve la primera `y` libre.
export async function encabezado(doc, titulo, codigo, fecha) {
  const emisorRes = await fetchAuth("/cotizaciones/emisor");
  const emisor = emisorRes.ok ? await emisorRes.json() : { ruc: "", razonSocial: "" };
  const logo = await cargarImagen("/assets/logos/intales_logo.png");
  const PAGE_W = doc.internal.pageSize.getWidth();

  if (logo) {
    doc.addImage(logo, formatoImagen(logo), M, M, ALTO_LOGO * (logo.naturalWidth / logo.naturalHeight), ALTO_LOGO);
  } else {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text("INTALES", M, M + 10);
  }
  doc.setTextColor(0, 0, 0);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text(emisor.razonSocial || "", M, M + ALTO_LOGO + 5);
  doc.setFont("helvetica", "normal");
  doc.text(`RUC ${emisor.ruc || "—"}`, M, M + ALTO_LOGO + 9.5);

  const cajaW = 72;
  const cajaX = PAGE_W - M - cajaW;
  doc.setDrawColor(...NAVY);
  doc.setLineWidth(0.4);
  doc.rect(cajaX, M, cajaW, 22);
  doc.setTextColor(...NAVY);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(titulo, cajaX + cajaW / 2, M + 7, { align: "center" });
  doc.setFontSize(12);
  doc.text(`N° ${codigo}`, cajaX + cajaW / 2, M + 13.5, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(0, 0, 0);
  doc.text(`Fecha: ${formatearFecha(fecha)}`, cajaX + cajaW / 2, M + 19, { align: "center" });

  return M + ALTO_LOGO + 16;
}

export function bloqueDatos(doc, y, filas) {
  autoTable(doc, {
    startY: y,
    margin: { left: M, right: M },
    theme: "plain",
    body: filas,
    styles: { fontSize: 9, cellPadding: 1.2 },
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 34 } },
  });
  return doc.lastAutoTable.finalY + 4;
}

export async function exportarSolicitudCotizacionPdf(licitacion, proveedor) {
  const doc = new jsPDF();
  const empresa = proveedor.empresa || {};
  let y = await encabezado(doc, "SOLICITUD DE COTIZACIÓN", licitacion.codigo, proveedor.fechaEnvio || licitacion.createdAt);
  y = bloqueDatos(doc, y, [
    ["Proveedor", empresa.razonSocial || proveedor.razonSocial || "—"],
    ["RUC", empresa.ruc || proveedor.ruc || "—"],
    ["Dirección", empresa.direccion || "—"],
  ]);
  autoTable(doc, {
    ...ESTILO_TABLA,
    startY: y,
    head: [["#", "SC", "Descripción", "Tipo de artículo", "Und.", "Cantidad"]],
    body: licitacion.items.map((it, i) => [i + 1, it.scCodigo, it.descripcion, it.tipoArticulo?.nombre || "—", it.unidad, it.cantidad]),
    columnStyles: { 0: { cellWidth: 8, halign: "center" }, 1: { cellWidth: 22 }, 4: { cellWidth: 16, halign: "center" }, 5: { cellWidth: 18, halign: "right" } },
  });
  y = doc.lastAutoTable.finalY + 8;
  doc.setFontSize(9);
  const ancho = doc.internal.pageSize.getWidth() - M * 2;
  doc.text(doc.splitTextToSize("Favor de cotizar precios unitarios sin IGV indicando moneda, plazo de entrega y forma de pago.", ancho), M, y);
  doc.save(`${licitacion.codigo}_${empresa.ruc || proveedor.ruc || "proveedor"}.pdf`);
}

export async function exportarOrdenCompraProveedorPdf(ocp) {
  const doc = new jsPDF();
  const PAGE_W = doc.internal.pageSize.getWidth();
  const m = (v) => money(v, ocp.moneda);
  let y = await encabezado(doc, "ORDEN DE COMPRA", ocp.codigo, ocp.fecha);
  y = bloqueDatos(doc, y, [
    ["Proveedor", ocp.proveedorRazonSocial || "—"],
    ["RUC", ocp.proveedorRuc || "—"],
    ["Dirección", ocp.proveedorDireccion || "—"],
    ["Forma de pago", ocp.formaPago || "—"],
    ["Lugar de entrega", ocp.lugarEntrega || "—"],
    ["Fecha de entrega", ocp.fechaEntrega ? formatearFecha(ocp.fechaEntrega) : "—"],
    ["Moneda", ocp.moneda === "USD" ? "Dólares (US$)" : "Soles (S/)"],
  ]);
  autoTable(doc, {
    ...ESTILO_TABLA,
    startY: y,
    head: [["#", "Descripción", "Und.", "Cant.", "P. unit.", "Subtotal"]],
    body: ocp.items.map((it, i) => [i + 1, it.descripcion, it.unidad, it.cantidad, m(it.precioUnitario), m(it.subtotal)]),
    columnStyles: {
      0: { cellWidth: 8, halign: "center" }, 2: { cellWidth: 16, halign: "center" }, 3: { cellWidth: 16, halign: "right" },
      4: { cellWidth: 28, halign: "right" }, 5: { cellWidth: 30, halign: "right" },
    },
  });
  autoTable(doc, {
    startY: doc.lastAutoTable.finalY + 2,
    margin: { left: PAGE_W - M - 74, right: M },
    theme: "plain",
    body: [["Subtotal", m(ocp.subtotal)], [ocp.afectoIgv ? "IGV 18%" : "No afecto a IGV", m(ocp.igv)], ["TOTAL", m(ocp.total)]],
    styles: { fontSize: 9, cellPadding: 1.2 },
    columnStyles: { 0: { fontStyle: "bold" }, 1: { halign: "right" } },
    didParseCell: (d) => { if (d.row.index === 2) d.cell.styles.fontStyle = "bold"; },
  });
  y = doc.lastAutoTable.finalY + 6;
  if (ocp.observaciones) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text("Observaciones:", M, y);
    doc.setFont("helvetica", "normal");
    doc.text(doc.splitTextToSize(ocp.observaciones, PAGE_W - M * 2), M, y + 5);
  }
  doc.save(`${ocp.codigo}.pdf`);
}
