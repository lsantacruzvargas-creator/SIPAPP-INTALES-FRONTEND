import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { textoPension } from "./planilla";

const importe = (n) => Number(n || 0).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fecha = (iso) => (iso ? iso.split("-").reverse().join("/") : "");

// Boleta de pago del mes (D.S. 001-98-TR): empleador, trabajador, días y horas, ingresos, descuentos y aportes.
export function generarBoletaPdf(boleta, { empleador = {}, afps = {} } = {}) {
  const doc = new jsPDF();
  const margen = 14;
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
  const columnas = [de(["ingreso"]), de(["descuento", "aporteTrabajador"]), de(["aporteEmpleador"])];
  const filas = Array.from({ length: Math.max(...columnas.map((c) => c.length), 1) }, (_, i) =>
    columnas.flatMap((c) => (c[i] ? [c[i].nombre, importe(c[i].monto)] : ["", ""])));
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
  y += 28;
  doc.line(margen + 10, y, margen + 75, y);
  doc.line(120, y, 185, y);
  doc.text("Empleador", margen + 42, y + 5, { align: "center" });
  doc.text("Trabajador", 152, y + 5, { align: "center" });
  doc.save(`boleta-${boleta.periodo}-${d.numDoc}.pdf`);
}
