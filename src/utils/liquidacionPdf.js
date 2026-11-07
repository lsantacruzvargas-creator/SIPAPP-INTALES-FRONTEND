import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { textoPension } from "./planilla.js";
import { marcaBorrador } from "./boletaPdf.js";
import { aInputFecha, fechaHoyLima } from "./fecha.js";

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const importe = (n) => Number(n || 0).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fecha = (iso) => (iso ? iso.split("-").reverse().join("/") : "");
const margen = 14;
const GRIS = [243, 244, 246];

export const fechaLarga = (iso) => `${Number(iso.slice(8, 10))} de ${MESES[Number(iso.slice(5, 7)) - 1]} de ${iso.slice(0, 4)}`;

// El renglón negativo (días no computables, días gozados) se imprime restando, con la cantidad en positivo.
export function renglonFormula({ base, divisor, cantidad, unidad }) {
  const formula = `${importe(base)} ÷ ${divisor} × ${Math.abs(cantidad)} ${unidad}`;
  return cantidad < 0 ? `- S/ ${formula}` : formula;
}

export function textoConformidad({ razonSocial, total, periodo }) {
  const mes = `${MESES[Number(periodo.slice(4, 6)) - 1].toUpperCase()} de ${periodo.slice(0, 4)}`;
  return `He recibido de la empresa ${razonSocial} la suma de S/ ${importe(total)}, correspondiente a mi Liquidación de Beneficios Sociales, `
    + `la cual ha sido consignada en mi Boleta de Pago del mes de ${mes}, no teniendo nada que reclamar a la empresa; firmo en señal de conformidad.`;
}

// Cada renglón se redondea solo (±0,005) y el monto es el redondeo de la suma sin redondear: esa es la holgura de la fórmula.
export function montoAjustado({ editada, monto, detalle }) {
  if (editada) return true;
  if (!detalle?.length) return false;
  const suma = detalle.reduce((s, d) => s + d.monto, 0);
  return Math.abs(suma - monto) > (detalle.length + 1) * 0.005 + 1e-9;
}

const seccionDe = (l) => {
  if (l.origen === "propuesta") {
    if (l.clave === "cts") return 2;
    if (l.clave === "gratificacion") return 4;
    if (l.clave === "bonificacion") return 5;
    if (/^(pendiente|indemnizacion):|^truncas$/.test(l.clave)) return 3;
  }
  return 6;
};

const rangoDe = (b) => (b?.desde && b?.hasta ? ` (${fecha(b.desde)} al ${fecha(b.hasta)})` : "");

const titulo = (content) => [{ content, colSpan: 2, styles: { fontStyle: "bold", fillColor: GRIS } }];
const fila = (nombre, monto, negrita = false) => [
  { content: nombre, styles: { fontStyle: negrita ? "bold" : "normal" } },
  { content: importe(monto), styles: { halign: "right", fontStyle: negrita ? "bold" : "normal" } },
];
const detalleFila = (texto, monto) => [
  { content: texto, styles: { textColor: 90, cellPadding: { top: 0.8, bottom: 0.8, left: 6, right: 1.5 } } },
  { content: monto === "" ? "" : importe(monto), styles: { halign: "right", textColor: 90 } },
];

function filasRemuneracion({ bases: b, bloques }) {
  const filas = [titulo("1. Remuneración computable"), fila("Remuneración básica", b.basico), fila("Asignación familiar", b.asignacion)];
  for (const f of b.fijos || []) filas.push(fila(f.nombre, f.monto));
  filas.push(fila("Promedio de variables", b.promedioVariables), fila("Total remuneración computable para vacaciones", b.rcVacaciones, true));
  if (bloques.cts) filas.push(fila("1/6 de la última gratificación", b.sextoGratificacion), fila("Total remuneración computable para CTS", b.rcCts, true));
  return filas;
}

function filasSeccion(numero, nombre, lineas, bloques) {
  if (!lineas.length) return [];
  const filas = [titulo(`${numero}. ${nombre}`)];
  for (const l of lineas) {
    const sufijo = l.clave === "truncas" ? rangoDe(bloques.truncas) : "";
    filas.push(fila(`${l.descripcion}${sufijo}`, l.monto, true));
    if (montoAjustado(l)) filas.push(detalleFila("Monto ajustado por el contador", ""));
    else for (const d of l.detalle || []) filas.push(detalleFila(renglonFormula(d), d.monto));
  }
  if (lineas.length > 1) filas.push(fila(`Total ${nombre.toLowerCase()}`, lineas.reduce((s, l) => s + l.monto, 0), true));
  return filas;
}

export function dibujarLiquidacion(doc, liq, { empleador = {}, afps = {}, motivosBaja = [] } = {}) {
  const borrador = liq.estado === "borrador";
  const primeraPagina = doc.getNumberOfPages();
  const d = liq.datos;
  const descuentos = borrador ? liq.vistaPrevia?.descuentos : liq.descuentos;
  const totales = (borrador ? liq.vistaPrevia?.totales : liq.totales) || { ingresos: 0, descuentos: 0, leyes: 0, neto: 0 };
  const enLetras = (borrador ? liq.vistaPrevia?.totalEnLetras : liq.totalEnLetras) || "";
  const bloques = liq.bloques || {};
  const motivo = motivosBaja.find((m) => m.codigo === liq.motivoCese)?.nombre || liq.motivoCese || "";
  const fechaDoc = borrador || !liq.confirmadaEn ? fechaHoyLima() : aInputFecha(liq.confirmadaEn);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(empleador.razonSocial || "", 105, 14, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.text(`RUC ${empleador.ruc || ""}${empleador.direccion ? `  ·  ${empleador.direccion}` : ""}`, 105, 19, { align: "center" });
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("LIQUIDACIÓN DE BENEFICIOS SOCIALES", 105, 28, { align: "center" });
  doc.setFontSize(10);
  doc.text(liq.codigo || "", 105, 34, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const datos = [
    [`Apellidos y nombres: ${d.nombre}`, `Documento: ${d.numDoc}`],
    [`Cargo: ${d.cargo || "-"}`, `Régimen pensionario: ${textoPension(liq.pension, afps)}`],
    [`Fecha de ingreso: ${fecha(liq.fechaIngreso)}`, `Fecha de cese: ${fecha(liq.fechaCese)}`],
    [`Motivo de cese: ${motivo}`, `Periodo de trabajo: ${liq.periodoTrabajo || ""}`],
  ];
  let y = 42;
  for (const [izquierda, derecha] of datos) {
    doc.text(izquierda, margen, y);
    doc.text(derecha, 110, y);
    y += 5;
  }

  const ingresos = liq.lineas.filter((l) => l.tipo === "ingreso");
  const delaSeccion = (n) => ingresos.filter((l) => seccionDe(l) === n);
  const filas = [
    ...filasRemuneracion({ bases: liq.bases, bloques }),
    ...filasSeccion(2, `CTS trunca${rangoDe(bloques.cts)}`, delaSeccion(2), bloques),
    ...filasSeccion(3, "Vacaciones", delaSeccion(3), bloques),
    ...filasSeccion(4, `Gratificación trunca${rangoDe(bloques.gratificacion)}`, delaSeccion(4), bloques),
    ...filasSeccion(5, "Bonificación extraordinaria", delaSeccion(5), bloques),
    ...filasSeccion(6, "Otros conceptos", delaSeccion(6), bloques),
  ];
  const tabla = {
    margin: { left: margen, right: margen }, theme: "grid", styles: { fontSize: 8, cellPadding: 1.5 },
    columnStyles: { 0: { cellWidth: "auto" }, 1: { cellWidth: 30 } },
  };
  autoTable(doc, { ...tabla, startY: y + 2, body: filas });

  const manuales = liq.lineas.filter((l) => l.tipo === "descuento");
  const filasDescuentos = [
    titulo("Descuentos"),
    ...(descuentos || []).map((x) => fila(x.tasa != null ? `${x.nombre} (${x.tasa} % de ${importe(x.base)})` : x.nombre, x.monto)),
    ...manuales.map((l) => fila(l.descripcion, l.monto)),
    fila("Total ingresos", totales.ingresos, true),
    fila("Total descuentos", totales.descuentos + totales.leyes, true),
  ];
  autoTable(doc, { ...tabla, startY: doc.lastAutoTable.finalY + 4, body: filasDescuentos });

  const espacio = (alto) => {
    if (y + alto > 280) { doc.addPage(); y = 20; }
  };
  y = doc.lastAutoTable.finalY + 8;
  espacio(40);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(`TOTAL A RECIBIR: S/ ${importe(totales.neto)}`, margen, y);
  doc.setFontSize(9);
  if (enLetras) {
    y += 6;
    doc.text(`SON: ${enLetras}`, margen, y);
  }
  doc.setFont("helvetica", "normal");
  if (liq.observaciones) {
    const lineas = doc.splitTextToSize(`Observaciones: ${liq.observaciones}`, 182);
    y += 7;
    espacio(lineas.length * 4.5);
    doc.text(lineas, margen, y);
    y += lineas.length * 4.5 - 4.5;
  }

  const conformidad = doc.splitTextToSize(textoConformidad({ razonSocial: empleador.razonSocial || "", total: totales.neto, periodo: liq.periodo }), 182);
  y += 10;
  espacio(conformidad.length * 4.5 + 45);
  doc.text(conformidad, margen, y);
  y += conformidad.length * 4.5 + 6;
  doc.text(`Lima, ${fechaLarga(fechaDoc)}`, margen, y);
  y += 24;
  doc.line(margen + 50, y, margen + 130, y);
  doc.text(d.nombre, 105, y + 5, { align: "center" });
  doc.text(`Documento: ${d.numDoc}`, 105, y + 10, { align: "center" });
  if (borrador) marcaBorrador(doc, primeraPagina);
}

export function generarLiquidacionPdf(liquidacion, { guardar = true, ...opciones } = {}) {
  const doc = new jsPDF();
  dibujarLiquidacion(doc, liquidacion, opciones);
  if (guardar) doc.save(`Liquidacion_${liquidacion.codigo}_${liquidacion.datos.numDoc}.pdf`);
  return doc;
}
