// Excel de importación de CONCAR (C2): el servidor entrega las filas (claves A…AO) y las cabeceras de la plantilla
// oficial; aquí se arma el .xlsx: hoja "CONCAR", filas 1–3 de cabecera (títulos, notas, formatos), datos desde la 4,
// fechas como fecha dd/mm/aaaa y códigos como texto. Formato portado de contaperu (MIT, © 2026 Global Procesos AI S.A.C.).
const cargarExcel = async () => (await import("exceljs")).default;

const ANCHO = { F: 40, W: 30, S: 20, AA: 20, K: 12, L: 14 };

// "AAAA-MM-DD" → fecha de Excel (UTC, sin desfase de zona horaria).
const aFecha = (v) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v || ""));
  return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : null;
};

export async function libroConcar({ filas, formato }) {
  const ExcelJS = await cargarExcel();
  const { hoja, cabeceras, columnas, columnasFecha } = formato;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(hoja, { views: [{ state: "frozen", xSplit: 0, ySplit: 3, topLeftCell: "A4" }] });
  ws.columns = columnas.map((c) => ({
    key: c, width: ANCHO[c] || 12,
    style: columnasFecha.includes(c) ? { numFmt: "dd/mm/yyyy" } : { numFmt: "@" },
  }));
  for (const tipo of ["titulos", "notas", "formatos"]) {
    const r = ws.addRow(columnas.map((c) => cabeceras[tipo][c] || ""));
    r.font = { bold: tipo !== "notas" };
  }
  for (const f of filas) {
    const r = ws.addRow(columnas.map((c) => {
      const v = f[c];
      if (v === "" || v == null) return null;
      if (columnasFecha.includes(c)) return aFecha(v);
      return typeof v === "number" ? v : String(v);
    }));
    columnas.forEach((c, i) => { if (typeof f[c] === "number") r.getCell(i + 1).numFmt = c === "G" ? "0.000000" : "0.00"; });
  }
  ws.autoFilter = `A3:${columnas[columnas.length - 1]}3`;
  return wb.xlsx.writeBuffer();
}

export const nombreArchivoConcar = (lote) => `CONCAR-${lote.periodo}-${lote.codigo}.xlsx`;

