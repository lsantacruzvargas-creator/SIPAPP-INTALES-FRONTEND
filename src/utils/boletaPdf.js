import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { textoPension, celdasDeColumna, etiquetaPeriodoCts } from "./planilla.js";
import { nombreArchivoBoletas, nombrePdfTrabajador, nombresUnicos } from "./boletasMasa.js";

const importe = (n) => Number(n || 0).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fecha = (iso) => (iso ? iso.split("-").reverse().join("/") : "");

const celda = (c) => {
  if (!c) return ["", ""];
  if (c.subtitulo) return [{ content: c.subtitulo, colSpan: 2, styles: { fontStyle: "bold", fillColor: [243, 244, 246] } }];
  return [c.nombre, importe(c.monto)];
};

// Boleta de pago del mes (D.S. 001-98-TR): empleador, trabajador, días y horas, ingresos, descuentos y aportes.
export function dibujarBoleta(doc, boleta, { empleador = {}, afps = {}, borrador = false } = {}) {
  const margen = 14;
  const primeraPagina = doc.getNumberOfPages();
  const d = boleta.datos;
  const periodo = `${boleta.periodo.slice(4)}/${boleta.periodo.slice(0, 4)}`;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("BOLETA DE PAGO DE REMUNERACIONES", 105, 16, { align: "center" });
  doc.setFontSize(10);
  doc.text(`Periodo ${periodo}`, 105, 22, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const cabecera = [
    [`Empleador: ${empleador.razonSocial || ""}`, `RUC: ${empleador.ruc || ""}`],
    [`Trabajador: ${d.nombre}`, `Documento: ${d.numDoc}`],
    [`Cargo: ${d.cargo || "-"}`, `Fecha de ingreso: ${fecha(d.fechaIngreso)}${d.fechaCese ? `  ·  Cese: ${fecha(d.fechaCese)}` : ""}`],
    [`Régimen pensionario: ${textoPension(d.pension, afps)}${d.pension?.cuspp ? `  ·  CUSPP ${d.pension.cuspp}` : ""}`, `Días pagados: ${boleta.dias?.remunerados ?? ""}  ·  Horas: ${boleta.horas?.ordinarias ?? ""}`],
  ];
  let y = 30;
  for (const [izquierda, derecha] of cabecera) {
    doc.text(izquierda, margen, y);
    doc.text(derecha, 120, y);
    y += 5;
  }

  const de = (tipos) => boleta.conceptos.filter((c) => tipos.includes(c.tipo));
  const columnas = [de(["ingreso"]), de(["descuento", "aporteTrabajador"]), de(["aporteEmpleador"])].map(celdasDeColumna);
  const filas = Array.from({ length: Math.max(...columnas.map((c) => c.length), 1) }, (_, i) =>
    columnas.flatMap((c) => celda(c[i])));
  const t = boleta.totales;
  autoTable(doc, {
    startY: y + 2, margin: { left: margen, right: margen }, theme: "grid",
    head: [[{ content: "Ingresos", colSpan: 2 }, { content: "Descuentos y aportes del trabajador", colSpan: 2 }, { content: "Aportes del empleador", colSpan: 2 }]],
    body: filas,
    foot: [["Total", importe(t.ingresos), "Total", importe(t.descuentos + t.aportesTrabajador), "Total", importe(t.aportesEmpleador)]],
    styles: { fontSize: 7.5, cellPadding: 1.5 }, headStyles: { fillColor: [88, 28, 135], halign: "center" }, footStyles: { fillColor: [243, 244, 246], textColor: 20 },
    columnStyles: { 1: { halign: "right", cellWidth: 20 }, 3: { halign: "right", cellWidth: 20 }, 5: { halign: "right", cellWidth: 20 } },
  });
  y = doc.lastAutoTable.finalY + 9;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(`Neto a pagar: S/ ${importe(t.neto)}`, margen, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  if (boleta.ctsDepositada) {
    const c = boleta.ctsDepositada;
    y = cuadroCts(doc, c, `Depósito de CTS (${etiquetaPeriodoCts(c.periodo)}): S/ ${importe(c.monto)}`, margen, y + 4) + 17;
  } else {
    y += 28;
  }
  doc.line(margen + 10, y, margen + 75, y);
  doc.line(120, y, 185, y);
  doc.text("Empleador", margen + 42, y + 5, { align: "center" });
  doc.text("Trabajador", 152, y + 5, { align: "center" });
  if (borrador) marcaBorrador(doc, primeraPagina);
}

// Informativo: queda fuera de ingresos, descuentos y neto.
function cuadroCts(doc, c, titulo, margen, y) {
  doc.setDrawColor(150);
  doc.rect(margen, y, 182, 13);
  doc.setFont("helvetica", "bold");
  doc.text(titulo, margen + 3, y + 5);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.text(`Informativo: no forma parte de los ingresos, descuentos ni del neto. Depósito ${c.codigo}.`, margen + 3, y + 10);
  doc.setFontSize(9);
  doc.setDrawColor(0);
  return y + 13;
}

// Si la boleta se desbordó a más páginas, todas llevan la marca; al terminar se vuelve a la última.
export function marcaBorrador(doc, primeraPagina) {
  const ultima = doc.getNumberOfPages();
  for (let p = primeraPagina; p <= ultima; p++) {
    doc.setPage(p);
    dibujarMarca(doc);
  }
  doc.setPage(ultima);
}

// Restaura opacidad, color y fuente para no alterar lo que siga.
function dibujarMarca(doc) {
  doc.saveGraphicsState();
  doc.setGState(new doc.GState({ opacity: 0.15 }));
  doc.setFont("helvetica", "bold");
  doc.setFontSize(80);
  doc.setTextColor(120);
  const medio = doc.getTextWidth("BORRADOR") / 2 * Math.SQRT1_2;
  doc.text("BORRADOR", 105 - medio, 148 + medio, { angle: 45 });
  doc.restoreGraphicsState();
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(0);
}

export function generarBoletaPdf(boleta, opciones = {}) {
  const doc = new jsPDF();
  dibujarBoleta(doc, boleta, opciones);
  doc.save(`boleta-${boleta.periodo}-${boleta.datos.numDoc}.pdf`);
}

// Una boleta por página, en el orden recibido.
export function generarBoletasPdf(boletas, { periodo, guardar = true, ...opciones } = {}) {
  const doc = new jsPDF();
  boletas.forEach((b, i) => {
    if (i > 0) doc.addPage();
    dibujarBoleta(doc, b, opciones);
  });
  if (guardar) doc.save(nombreArchivoBoletas(periodo, { borrador: opciones.borrador }));
  return doc;
}

// Un PDF por trabajador dentro de un zip; los PDF internos no llevan sufijo BORRADOR, solo el zip.
export async function generarBoletasZip(boletas, { periodo, ...opciones } = {}) {
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  const nombres = nombresUnicos(boletas.map(nombrePdfTrabajador));
  boletas.forEach((b, i) => {
    const doc = new jsPDF();
    dibujarBoleta(doc, b, opciones);
    zip.file(nombres[i], doc.output("arraybuffer"));
  });
  const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombreArchivoBoletas(periodo, { borrador: opciones.borrador, zip: true });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
