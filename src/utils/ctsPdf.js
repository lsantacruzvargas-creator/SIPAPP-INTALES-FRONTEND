import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { marcaBorrador } from "./boletaPdf.js";
import { renglonFormula } from "./liquidacionPdf.js";
import { nombrePdfTrabajador, nombresUnicos } from "./boletasMasa.js";
import { hojasDisponibles } from "./cts.js";

const importe = (n) => Number(n || 0).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fecha = (iso) => (iso ? iso.split("-").reverse().join("/") : "");
const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;
const margen = 14;
const GRIS = [243, 244, 246];

export const nombreArchivoHojasCts = (periodo, { borrador = false, zip = false } = {}) =>
  `cts-${periodo}${borrador ? "-BORRADOR" : ""}.${zip ? "zip" : "pdf"}`;

// La RC y el sexto salen de la fila: detalleRc se calculó al armar el depósito y no sigue a una edición de la RC, así que su
// desglose solo se imprime mientras la RC es la calculada. Con el monto ajustado no hay fórmula que mostrar.
export function filasHojaCts(deposito, f) {
  const d = f.datos || {};
  const dr = f.detalleRc;
  const rcEditada = !dr || f.rc !== f.calculado?.rc;
  const sextoEditado = f.sexto !== f.calculado?.sexto;
  const remuneracion = rcEditada
    ? [{ texto: "Remuneración computable (ajustada por el contador)", monto: f.rc, negrita: true }]
    : [
      { texto: "Remuneración básica", monto: dr.basico }, { texto: "Asignación familiar", monto: dr.asignacion },
      ...(dr.fijos || []).map((x) => ({ texto: x.nombre, monto: x.monto })),
      { texto: "Promedio de variables", monto: dr.promedioVariables },
      { texto: "Remuneración computable", monto: f.rc, negrita: true },
    ];
  const grat = dr?.gratificacion && !sextoEditado ? `1/6 de la gratificación de ${dr.gratificacion.periodo.slice(4)}/${dr.gratificacion.periodo.slice(0, 4)}` : "1/6 de la gratificación percibida en el semestre";
  remuneracion.push({ texto: grat, monto: f.sexto }, { texto: "Remuneración computable para CTS", monto: f.rcCts, negrita: true });

  const renglones = (f.detalle || []).filter((r) => r.cantidad !== 0);
  const calculo = f.editado
    ? [{ texto: "Monto ajustado por el contador", monto: null }]
    : (renglones.length ? renglones : f.detalle || []).map((r) => ({ texto: renglonFormula(r), monto: r.monto }));
  return {
    periodo: `Periodo del ${fecha(f.desde)} al ${fecha(f.hasta)}`,
    nombre: d.nombre || "", documento: d.numDoc || "", cargo: d.cargo || "", ingreso: fecha(d.fechaIngreso),
    remuneracion, tiempo: `${plural(f.meses, "mes", "meses")} y ${plural(f.dias, "día", "días")}`, noComputables: f.noComputables,
    calculo, monto: f.monto,
    entidad: d.cuentaCts?.entidad || "", cuenta: d.cuentaCts?.numero || "", fechaDeposito: fecha(deposito.fechaDeposito),
  };
}

const titulo = (content) => [{ content, colSpan: 2, styles: { fontStyle: "bold", fillColor: GRIS } }];
const fila = (texto, monto, negrita = false, sangria = false) => [
  { content: texto, styles: { fontStyle: negrita ? "bold" : "normal", ...(sangria ? { cellPadding: { top: 0.8, bottom: 0.8, left: 6, right: 1.5 } } : {}) } },
  { content: monto === null ? "" : importe(monto), styles: { halign: "right", fontStyle: negrita ? "bold" : "normal" } },
];

export function dibujarHojaCts(doc, deposito, f, { empleador = {} } = {}) {
  const borrador = deposito.estado !== "confirmado";
  const primeraPagina = doc.getNumberOfPages();
  const h = filasHojaCts(deposito, f);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(empleador.razonSocial || "", 105, 14, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.text(`RUC ${empleador.ruc || ""}${empleador.direccion ? `  ·  ${empleador.direccion}` : ""}`, 105, 19, { align: "center" });
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("LIQUIDACIÓN DE DEPÓSITO DE CTS", 105, 28, { align: "center" });
  doc.setFontSize(10);
  doc.text(`${deposito.codigo || ""}  ·  ${h.periodo}`, 105, 34, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const datos = [
    [`Apellidos y nombres: ${h.nombre}`, `Documento: ${h.documento}`],
    [`Cargo: ${h.cargo || "-"}`, `Fecha de ingreso: ${h.ingreso}`],
  ];
  let y = 42;
  for (const [izquierda, derecha] of datos) {
    doc.text(izquierda, margen, y);
    doc.text(derecha, 130, y);
    y += 5;
  }

  const tabla = {
    margin: { left: margen, right: margen }, theme: "grid", styles: { fontSize: 8, cellPadding: 0.8 },
    columnStyles: { 0: { cellWidth: "auto" }, 1: { cellWidth: 30 } },
  };
  autoTable(doc, {
    ...tabla, startY: y + 2,
    body: [
      titulo("1. Remuneración computable"),
      ...h.remuneracion.map((r) => fila(r.texto, r.monto, r.negrita)),
      titulo("2. Tiempo computable"),
      fila(h.tiempo, null),
      ...(h.noComputables > 0 ? [fila(`Menos ${plural(h.noComputables, "día no computable", "días no computables")}`, null)] : []),
      titulo("3. Cálculo"),
      ...h.calculo.map((c) => fila(c.texto, c.monto, false, true)),
    ],
  });

  y = doc.lastAutoTable.finalY + 8;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(`MONTO DEPOSITADO: S/ ${importe(h.monto)}`, margen, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  y += 7;
  doc.text(`Entidad financiera: ${h.entidad || "No registrada"}`, margen, y);
  doc.text(`Número de cuenta: ${h.cuenta || "No registrado"}`, 110, y);
  y += 6;
  doc.text("Fecha de depósito:", margen, y);
  if (h.fechaDeposito) doc.text(h.fechaDeposito, margen + 31, y);
  else doc.line(margen + 31, y, margen + 65, y);

  y += 28;
  doc.line(margen + 10, y, margen + 75, y);
  doc.line(120, y, 185, y);
  doc.text("Empleador", margen + 42, y + 5, { align: "center" });
  doc.text("Trabajador", 152, y + 5, { align: "center" });
  doc.text(h.nombre, 152, y + 10, { align: "center" });
  doc.text(`Documento: ${h.documento}`, 152, y + 15, { align: "center" });
  if (borrador) marcaBorrador(doc, primeraPagina);
}

export function generarHojaCtsPdf(deposito, trabajador, { guardar = true, ...opciones } = {}) {
  const doc = new jsPDF();
  dibujarHojaCts(doc, deposito, trabajador, opciones);
  if (guardar) doc.save(`cts-${deposito.periodo}-${trabajador.datos.numDoc}.pdf`);
  return doc;
}

// Un PDF por trabajador incluido dentro de un zip; los PDF internos no llevan sufijo BORRADOR, solo el zip.
export async function zipHojasCts(deposito, opciones = {}) {
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  const filas = hojasDisponibles(deposito);
  const nombres = nombresUnicos(filas.map(nombrePdfTrabajador));
  filas.forEach((f, i) => zip.file(nombres[i], generarHojaCtsPdf(deposito, f, { ...opciones, guardar: false }).output("arraybuffer")));
  const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombreArchivoHojasCts(deposito.periodo, { borrador: deposito.estado !== "confirmado", zip: true });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
