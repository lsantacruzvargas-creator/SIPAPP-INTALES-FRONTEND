import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { COLUMNAS_REPORTE, filasReportePlanilla, tituloMes } from "./reportePlanilla.js";
import { marcaBorrador } from "./boletaPdf.js";

const importe = (n) => Number(n || 0).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const valorCelda = (c, v) => (c.soles ? importe(v) : c.numero ? String(v) : v);

export function dibujarReportePlanilla(doc, boletas, { empleador = {}, periodo, cerrada } = {}) {
  const margen = 8;
  const primeraPagina = doc.getNumberOfPages();
  const { filas, totales } = filasReportePlanilla(boletas);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text(`Reporte de planilla – ${tituloMes(periodo)}`, margen, 12);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.text(`Empleador: ${empleador.razonSocial || ""}    RUC: ${empleador.ruc || ""}    Estado: ${cerrada ? "Cerrada" : "Borrador"}`, margen, 17.5);

  const grupos = [];
  for (const c of COLUMNAS_REPORTE) {
    const ultimo = grupos.at(-1);
    if (ultimo?.content === c.grupo) ultimo.colSpan += 1; else grupos.push({ content: c.grupo, colSpan: 1 });
  }
  const alinear = Object.fromEntries(COLUMNAS_REPORTE.map((c, i) => [i, { halign: c.numero ? "right" : "left" }]));

  autoTable(doc, {
    startY: 21, margin: { left: margen, right: margen }, theme: "grid",
    head: [grupos, COLUMNAS_REPORTE.map((c) => c.titulo)],
    body: filas.map((f) => COLUMNAS_REPORTE.map((c) => valorCelda(c, f[c.clave]))),
    foot: [COLUMNAS_REPORTE.map((c) => (c.clave === "documento" ? "TOTAL" : c.numero ? valorCelda(c, totales[c.clave]) : ""))],
    showFoot: "lastPage",
    styles: { fontSize: 6.5, cellPadding: 1 },
    headStyles: { fillColor: [88, 28, 135], halign: "center", valign: "middle" },
    footStyles: { fillColor: [243, 244, 246], textColor: 20 },
    columnStyles: alinear,
  });
  if (!cerrada) marcaBorrador(doc, primeraPagina);
}

export function generarReportePlanillaPdf(boletas, contexto) {
  const doc = new jsPDF({ orientation: "landscape" });
  dibujarReportePlanilla(doc, boletas, contexto);
  doc.save(`reporte-planilla-${contexto.periodo}.pdf`);
}
