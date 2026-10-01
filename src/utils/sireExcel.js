// Plantilla SIRE en Excel: las columnas (y su orden) son las del archivo que exporta
// SUNAT, que el servidor entrega en GET /sire/:libro/:periodo/plantilla. El .xlsx que
// se llena se convierte aquí a ese mismo formato (texto separado por "|") antes de
// subirlo, así el servidor solo recibe el formato del SIRE.
// exceljs se carga recién al usarlo: no pesa en el resto de la app.
const cargarExcel = async () => (await import("exceljs")).default;

const HOJA = "SIRE";

// Buffer del .xlsx: fila 1 = cabecera; todas las columnas con formato Texto ("@") para
// que Excel no quite ceros a la izquierda ni convierta fechas o series como "F19O".
export async function plantillaXlsx(cabecera) {
  const ExcelJS = await cargarExcel();
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(HOJA, { views: [{ state: "frozen", ySplit: 1 }] });
  const columnas = cabecera.split("|");
  ws.columns = columnas.map((h) => ({ header: h, width: Math.min(Math.max(h.length + 2, 12), 40), style: { numFmt: "@" } }));
  ws.getRow(1).font = { bold: true };
  return wb.xlsx.writeBuffer();
}

const dosDigitos = (n) => String(n).padStart(2, "0");

// Lo que se ve en la celda, como lo escribiría SUNAT: fechas dd/mm/aaaa (Excel guarda
// la fecha tal cual se tecleó, en UTC), fórmulas por su resultado y nunca un "|".
const fechaTexto = (d) => `${dosDigitos(d.getUTCDate())}/${dosDigitos(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
// Una fecha pegada en una columna con formato texto queda como su número de serie de
// Excel (días desde 1899-12-30): en las columnas de fecha se convierte (años 2000–2099).
const desdeSerial = (n) => fechaTexto(new Date(Date.UTC(1899, 11, 30) + n * 86400000));

function textoCelda(v, esFecha = false) {
  if (v == null) return "";
  if (v instanceof Date) return fechaTexto(v);
  if (esFecha && typeof v === "number" && v >= 36526 && v < 73051) return desdeSerial(Math.floor(v));
  if (typeof v === "object") {
    if ("result" in v) return textoCelda(v.result, esFecha);
    if (Array.isArray(v.richText)) return v.richText.map((t) => t.text).join("");
    if ("text" in v) return textoCelda(v.text, esFecha);
    return "";
  }
  return String(v).replace(/\|/g, " ").replace(/[\r\n]+/g, " ").trim();
}

// Texto en formato SIRE (cabecera + una línea por fila con datos) desde el .xlsx llenado.
export async function xlsxATexto(buffer) {
  const ExcelJS = await cargarExcel();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const ws = wb.getWorksheet(HOJA) || wb.worksheets[0];
  if (!ws) throw new Error("El Excel no tiene hojas");
  const cabecera = [];
  ws.getRow(1).eachCell({ includeEmpty: true }, (c, i) => { cabecera[i - 1] = textoCelda(c.value); });
  const n = cabecera.length;
  const esFecha = cabecera.map((h) => /^fecha/i.test(h));
  if (!n) throw new Error("El Excel no tiene la cabecera del SIRE en la fila 1");
  const lineas = [cabecera.join("|")];
  for (let r = 2; r <= ws.rowCount; r++) {
    const fila = ws.getRow(r);
    const valores = Array.from({ length: n }, (_, i) => textoCelda(fila.getCell(i + 1).value, esFecha[i]));
    if (valores.some(Boolean)) lineas.push(valores.join("|"));
  }
  return `${lineas.join("\n")}\n`;
}
