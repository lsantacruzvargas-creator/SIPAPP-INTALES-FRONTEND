import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { formatearFecha } from "./fecha";
import { numeroALetras } from "./numeroALetras";
import { BANCOS, cargarImagen, formatoImagen } from "./cotizacionPdf";
import { DETRACCION_BIENES_SERVICIOS, normalizarCuentaDetraccion } from "./catalogosSunat";

// Formato copiado del facturaPdf.js de SIPAPP-HUAQUIAN, con el logo y las
// cuentas de Intales (las mismas de la cotización) y sin marca de agua ni
// tira de marcas al pie.
const AZUL = [217, 226, 243]; // encabezados de tabla
const GRIS = [242, 242, 242]; // celdas de etiqueta
const M = 14;

const CUENTAS = [
  ["CTA CTE BCP SOLES", BANCOS.bcpCuentaSoles, BANCOS.bcpCciSoles],
  ["CTA CTE BCP DÓLARES", BANCOS.bcpCuentaDolares, BANCOS.bcpCciDolares],
  ["CTA DETRACCIÓN BANCO DE LA NACIÓN", BANCOS.bnCuentaDetraccion],
];

const MONEDA = { PEN: "SOLES", USD: "DÓLARES" };
const UNIDAD = { NIU: "UND", ZZ: "UND" };

const n2 = (v) => (Number(v) || 0).toFixed(2);
const miles = (v) => (Number(v) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// `comprobante` es el CPE emitido; `factura` (opcional) completa OC y guía si
// el CPE no las trae. `empresa` sale de la BD, nunca de una consulta a SUNAT.
export async function generarFacturaPdf({ comprobante: c, factura = {}, empresa }) {
  const doc = new jsPDF({ compress: true });
  const PAGE_W = doc.internal.pageSize.getWidth();
  const PAGE_H = doc.internal.pageSize.getHeight();
  const R = PAGE_W - M;
  const CONTENT_W = PAGE_W - M * 2;

  const logo = await cargarImagen("/assets/logos/intales_logo.png");

  const moneda = c.totales?.moneda || "PEN";
  const simbolo = moneda === "USD" ? "US$" : "S/";
  const numero = `${c.serie}-${c.correlativo}`;

  const lineas = (c.items || []).map((it) => {
    const bruto = (Number(it.cantidad) || 0) * (Number(it.valorUnitario) || 0);
    return { ...it, bruto };
  });
  const sumaBruto = (afectacion) =>
    lineas.filter((l) => (l.afectacion || "10") === afectacion).reduce((s, l) => s + l.bruto, 0);
  const total = Number(c.totales?.totalPagar) || 0;

  const det = c.detraccion?.aplica ? c.detraccion : null;
  const bienDet = det?.codigoBien && DETRACCION_BIENES_SERVICIOS.find((b) => b.codigo === det.codigoBien);
  const montoDet = det ? Number(det.montoNeto) || 0 : 0;

  const ret = c.retencion?.aplica ? c.retencion : null;
  const montoRet = ret ? Number(ret.monto) || 0 : 0;
  const retSoles = moneda !== "PEN" && ret?.montoSoles > 0 ? ret : null;
  const cuotas = c.cuotas || [];

  const guia = c.guiaRelacionada?.serie
    ? `${c.guiaRelacionada.serie}-${String(c.guiaRelacionada.correlativo).padStart(8, "0")}`
    : (factura.numeroGuiaRemision || "");
  // La dirección solo se imprime si la empresa de la BD es la misma a la que
  // se le emitió el comprobante.
  const mismaEmpresa = !empresa?.ruc || empresa.ruc === c.receptor?.numDoc;

  // ─── Logo + razón social + placa RUC / FACTURA ELECTRÓNICA / número ───
  let y = 12;
  let yLogo = y;
  if (logo) {
    const logoH = 20;
    const logoW = logoH * (logo.naturalWidth / logo.naturalHeight);
    doc.addImage(logo, formatoImagen(logo), M, y, logoW, logoH);
    yLogo = y + logoH + 4;
  }
  doc.setTextColor(0);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text(c.emisor?.nombre || "", M, yLogo + 2);

  const placaW = 76, placaH = 23, placaX = R - placaW, placaY = y + 1;
  doc.setDrawColor(0);
  doc.setLineWidth(0.25);
  doc.roundedRect(placaX, placaY, placaW, placaH, 4, 4);
  doc.setFontSize(12);
  [`RUC: ${c.emisor?.numDoc || ""}`, "FACTURA ELECTRÓNICA", numero].forEach((t, i) =>
    doc.text(t, placaX + placaW / 2, placaY + 7 + i * 6, { align: "center" }));
  y = Math.max(yLogo + 2, placaY + placaH) + 4;

  // ─── Datos del comprobante — todos los campos se imprimen aunque estén vacíos ───
  const LH = 4.3;
  const xEtq = M + 3, xVal = M + 31, xEtqDer = M + 98, xValDer = M + 128;
  const filas = [
    [["Fecha de Emisión:", c.fechaEmision ? formatearFecha(c.fechaEmision) : ""], ["Forma de pago:", c.formaPago === "Credito" ? "Crédito" : "Contado"]],
    [["Señor(es):", c.receptor?.nombre || empresa?.razonSocial], ["Orden de compra:", c.numeroOrdenCompra || factura.numeroOrdenCompra]],
    [["RUC:", c.receptor?.numDoc || empresa?.ruc], ["Guía de remisión:", guia]],
    [["Moneda:", MONEDA[moneda] || moneda], ["Fecha de vencim.:", c.fechaVencimiento ? formatearFecha(c.fechaVencimiento) : ""]],
    [["Dirección Fiscal:", mismaEmpresa ? empresa?.direccion : ""]],
    [["Observación:", c.observaciones]],
  ];
  doc.setFontSize(8);
  const yCaja = y;
  let yFila = yCaja + 5.5;
  filas.forEach(([izq, der]) => {
    doc.setFont("helvetica", "normal");
    const lineasIzq = doc.splitTextToSize(String(izq[1] || ""), (der ? xEtqDer : R) - 3 - xVal);
    const lineasDer = der ? doc.splitTextToSize(String(der[1] || ""), R - 3 - xValDer) : [];
    doc.text(lineasIzq, xVal, yFila);
    if (der) doc.text(lineasDer, xValDer, yFila);
    doc.setFont("helvetica", "bold");
    doc.text(izq[0], xEtq, yFila);
    if (der) doc.text(der[0], xEtqDer, yFila);
    yFila += LH + (Math.max(lineasIzq.length, lineasDer.length) - 1) * 3.3;
  });
  const altoCaja = yFila - LH + 2.5 - yCaja;
  doc.roundedRect(M, yCaja, CONTENT_W, altoCaja, 4, 4);
  y = yCaja + altoCaja + 4;

  // ─── Ítems ───
  autoTable(doc, {
    startY: y,
    head: [[
      { content: "Cant", styles: { halign: "center" } },
      { content: "Unid.", styles: { halign: "center" } },
      "Descripción",
      { content: "Valor Unit", styles: { halign: "right" } },
      { content: "Total", styles: { halign: "right" } },
    ]],
    body: lineas.map((l) => [l.cantidad, UNIDAD[l.unidad] || l.unidad || "", l.descripcion, n2(l.valorUnitario), n2(l.bruto)]),
    theme: "grid",
    margin: { left: M, right: M, top: 14, bottom: 14 },
    styles: { fontSize: 8, textColor: 0, lineColor: 0, lineWidth: 0.1, fillColor: false, halign: "left", valign: "middle", cellPadding: { top: 0.5, bottom: 0.5, left: 1, right: 1 } },
    headStyles: { fillColor: AZUL, fontStyle: "bold", cellPadding: 1.8 },
    columnStyles: {
      0: { cellWidth: 10, fontStyle: "bold", halign: "center" },
      1: { cellWidth: 12, halign: "center" },
      3: { cellWidth: 18, fontStyle: "bold", halign: "right" },
      4: { cellWidth: 18, halign: "right" },
    },
  });
  y = doc.lastAutoTable.finalY + 4;

  const asegurarEspacio = (alto) => {
    if (y + alto <= PAGE_H - 10) return;
    doc.addPage();
    y = 14;
  };
  const celda = (x, yy, w, h, texto, { fill, bold = false, align = "center" } = {}) => {
    if (fill) { doc.setFillColor(...fill); doc.rect(x, yy, w, h, "FD"); }
    else doc.rect(x, yy, w, h);
    doc.setFont("helvetica", bold ? "bold" : "normal");
    const tx = align === "left" ? x + 1.5 : align === "right" ? x + w - 1.5 : x + w / 2;
    doc.text(String(texto ?? ""), tx, yy + h / 2, { align, baseline: "middle" });
  };
  doc.setLineWidth(0.1);
  doc.setFontSize(8);
  const H = 4.4;

  // ─── SON: monto en letras + totales ───
  // O.P GRAVADAS/EXONERADA van antes de descuento; SUB TOTAL es la base ya descontada.
  const totW = 54, totEtqW = 32, totX = R - totW;
  const filasTotales = [
    ["O.P GRAVADAS", sumaBruto("10")],
    ["O.P GRATUITAS", 0],
    ["O.P EXONERADA", sumaBruto("20")],
    ["TOTAL DESCUENTO", c.totales?.totalDescuentos],
    ["SUB TOTAL", c.totales?.baseImponible],
    ["IGV", c.totales?.totalIGV],
    ["IMPORTE TOTAL", total],
  ];
  asegurarEspacio(filasTotales.length * H);
  const sonW = totX - 3 - M;
  doc.setFont("helvetica", "bold");
  const sonLineas = doc.splitTextToSize(`SON:  ${numeroALetras(total, moneda)}`, sonW - 3);
  const sonH = Math.max(H, sonLineas.length * 3.3 + 1.5);
  doc.rect(M, y, sonW, sonH);
  doc.text(sonLineas, M + 1.5, y + 3.3);
  filasTotales.forEach(([etq, valor], i) => {
    celda(totX, y + i * H, totEtqW, H, etq, { fill: GRIS });
    celda(totX + totEtqW, y + i * H, totW - totEtqW, H, n2(valor), { align: "right" });
  });
  y += Math.max(sonH, filasTotales.length * H) + 8;

  // ─── Detracción + información del crédito ───
  const tabW = 117, etqW = 45;
  asegurarEspacio(((det ? 6 : 0) + 2 + (ret ? 1 : 0) + cuotas.length) * H);
  if (det) {
    celda(M, y, tabW, H, "Operación sujeta al sistema de pago de obligaciones tributarias", { fill: AZUL, bold: true });
    const yDet = y + H;
    [
      ["Tipo de operación", "01"],
      ["Bien o Servicio", det.codigoBien ? `${det.codigoBien} ${bienDet?.descripcion || ""}` : ""],
      [det.porcentaje ? `Detracción (${det.porcentaje}%)` : "Detracción", `${simbolo} ${miles(montoDet)}`],
      ["Cta. Cte. Banco de la Nación", normalizarCuentaDetraccion(det.cuentaBancaria)],
    ].forEach(([etq, valor], i) => {
      celda(M, yDet + i * H, etqW, H, etq, { fill: GRIS, bold: true });
      celda(M + etqW, yDet + i * H, tabW - etqW, H, valor);
    });
    y = yDet + 5 * H;
  }

  celda(M, y, tabW, H, "Información del crédito", { fill: AZUL, bold: true });
  const wC = [22, 32, 28, 35];
  const filaCredito = (yy, etq, monto, etq2, valor2, simboloFila = simbolo) => {
    let x = M;
    celda(x, yy, wC[0], H, etq, { fill: GRIS, bold: true, align: "left" });
    x += wC[0];
    doc.rect(x, yy, wC[1], H);
    doc.setFont("helvetica", "normal");
    doc.text(simboloFila, x + 1.5, yy + H / 2, { baseline: "middle" });
    doc.text(miles(monto), x + wC[1] - 1.5, yy + H / 2, { align: "right", baseline: "middle" });
    x += wC[1];
    celda(x, yy, wC[2], H, etq2, { fill: GRIS, bold: true });
    celda(x + wC[2], yy, wC[3], H, valor2, { bold: true });
  };
  if (ret) {
    y += H;
    // En USD se imprime en soles (TC vigente de la emisión), aunque el XML la lleve en dólares.
    if (retSoles) filaCredito(y, "Retención IGV", retSoles.montoSoles, "Tasa", `${ret.porcentaje}%`, "S/");
    else filaCredito(y, "Retención IGV", montoRet, "Tasa", `${ret.porcentaje}%`);
  }
  filaCredito(y + H, "Neto a Pagar", total - montoDet - montoRet, "Total de cuotas", cuotas.length || "");
  cuotas.forEach((q, i) =>
    filaCredito(y + (i + 2) * H, `Cuota ${q.numero ?? i + 1}`, q.monto, "Fecha de vencim.", formatearFecha(q.fechaVencimiento)));
  y += (2 + cuotas.length) * H + 5;

  // ─── Pie: cuentas bancarias, anclado abajo ───
  const Y_PIE = PAGE_H - 30;
  if (y > Y_PIE) { doc.addPage(); y = Y_PIE; }
  y = Math.max(y, Y_PIE);
  doc.setLineWidth(0.3);
  doc.line(M - 4, y, R + 4, y);
  doc.line(M - 4, y + 0.9, R + 4, y + 0.9);
  y += 6.5;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  CUENTAS.forEach(([banco, cuenta, cci]) => {
    doc.text(banco, M + 6, y);
    doc.text(cuenta, M + 66, y);
    if (cci) {
      doc.text("CCI", M + 116, y);
      doc.text(cci, M + 125, y);
    }
    y += 3.6;
  });

  doc.save(`Factura ${numero}.pdf`.replace(/[\\/:*?"<>|]/g, "-"));
}
