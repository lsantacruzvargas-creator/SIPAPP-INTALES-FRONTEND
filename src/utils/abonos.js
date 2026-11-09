import { round2 } from "./compras.js";

export const AVISO_BCP = "Formato del BCP sin validar con el banco: sube primero un lote pequeño a Telecrédito";
export const AVISO_TRATAMIENTO_ADELANTO = "Tratamiento contable del adelanto: al pagarlo se registra D 1412 Adelanto de remuneraciones / H banco. Al cerrar la planilla del mes, la boleta lo descuenta como 0701 y su asiento abona la 1412 por lo adelantado; la 4111 queda solo con lo que falta pagar.";

export const TIPOS = { adelanto: "Adelanto de quincena", gratificacion: "Gratificación", saldo: "Saldo del mes", cts: "CTS" };
export const FORMATOS = { bcp: "BCP", interbank: "Interbank", excel: "Excel genérico" };
export const FORMAS = { cuenta: "Cuenta del mismo banco", cci: "Interbancario (CCI)", manual: "Fuera del archivo" };
export const ESTADOS = {
  borrador: { texto: "Borrador", clase: "bg-amber-100 text-amber-800" },
  confirmado: { texto: "Confirmado", clase: "bg-green-100 text-green-800" },
  anulado: { texto: "Anulado", clase: "bg-gray-100 text-gray-600" },
};

// Tipos que se pueden armar desde Planilla del mes: la gratificación solo en julio y diciembre.
export function tiposNuevoLote(periodo) {
  const mes = String(periodo || "").slice(4);
  return ["adelanto", ...(mes === "07" || mes === "12" ? ["gratificacion"] : []), "saldo"];
}

// "02" ↔ "002": el catálogo de SUNAT se compara por valor numérico.
export function formatoDeCuenta(codigoEntidad) {
  const n = Number(codigoEntidad);
  if (!codigoEntidad || Number.isNaN(n)) return "excel";
  return n === 2 ? "bcp" : n === 3 ? "interbank" : "excel";
}

export function avisosFijos({ formato, tipo }) {
  return [...(formato === "bcp" ? [AVISO_BCP] : []), ...(tipo === "adelanto" ? [AVISO_TRATAMIENTO_ADELANTO] : [])];
}

// Los avisos de la API que no son los fijos (esos se muestran siempre desde aquí).
export const avisosDeApi = (avisos = []) => avisos.filter((a) => a !== AVISO_BCP && a !== AVISO_TRATAMIENTO_ADELANTO);

export const abonadoTotal = (abonado) => round2((abonado?.adelantos || 0) + (abonado?.otros || 0));

// Los adelantos ya están dentro del neto de la boleta (descuento 0701): solo lo demás se resta.
export const porAbonar = (boleta, abonado) => round2(Number(boleta?.totales?.neto || 0) - (abonado?.otros || 0));

export const abonadoMayorQueNeto = (boleta, abonado) => porAbonar(boleta, abonado) < -0.005;

export function totalesFilas(filas) {
  let enArchivo = 0, fuera = 0, nEnArchivo = 0, nFuera = 0;
  for (const f of filas) {
    const monto = Number(f.monto) || 0;
    if (f.forma === "manual" || monto <= 0) { fuera += monto; nFuera += 1; } else { enArchivo += monto; nEnArchivo += 1; }
  }
  return { enArchivo: round2(enArchivo), fueraDelArchivo: round2(fuera), filasEnArchivo: nEnArchivo, filasFuera: nFuera, total: round2(enArchivo + fuera) };
}

export const nombreDeDisposicion = (cabecera, porDefecto) => /filename="?([^";]+)"?/.exec(cabecera || "")?.[1] || porDefecto;

const importe = (v) => {
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
};

// Cuerpo del POST que crea un lote; `cuenta` es la CuentaTesoreria elegida.
export function cuerpoNuevoLote({ tipo, periodo, deposito, fecha, cuenta, cargoTipo, cargoNumero, referencia }) {
  if (!fecha) return { error: "Elige la fecha de pago." };
  if (!cuenta) return { error: "Elige la cuenta de cargo." };
  const body = { tipo, fecha, cuentaCargo: cuenta._id };
  if (tipo === "cts") body.deposito = deposito; else body.periodo = periodo;
  if (formatoDeCuenta(cuenta.codigoEntidad) === "bcp") {
    const numero = String(cargoNumero || "").replace(/\D/g, "");
    if (!["C", "M"].includes(cargoTipo)) return { error: "Elige el tipo de la cuenta de cargo (corriente o maestra)." };
    if (numero.length !== 13) return { error: "El número de la cuenta de cargo del BCP debe tener 13 dígitos." };
    body.cargo = { tipo: cargoTipo, numero };
  }
  if (String(referencia || "").trim()) body.referencia = String(referencia).trim();
  return { body };
}

// Cuerpo del PUT de un borrador: cabecera editable y los montos de las filas que quedan.
export function cuerpoGuardarLote({ fecha, referencia, cargo, editables, esBcp }) {
  if (!fecha) return { error: "Elige la fecha de pago." };
  const filas = [];
  for (const e of editables) {
    const monto = importe(e.monto);
    if (e.monto === "" || Number.isNaN(monto) || monto < 0) return { error: `El monto de ${e.nombre} no es válido.` };
    filas.push({ trabajador: e.trabajador, monto });
  }
  const body = { fecha, referencia: String(referencia || "").trim(), filas };
  if (esBcp) {
    const numero = String(cargo?.numero || "").replace(/\D/g, "");
    if (!["C", "M"].includes(cargo?.tipo)) return { error: "Elige el tipo de la cuenta de cargo (corriente o maestra)." };
    if (numero.length !== 13) return { error: "El número de la cuenta de cargo del BCP debe tener 13 dígitos." };
    body.cargo = { tipo: cargo.tipo, numero };
  }
  return { body };
}

export const editablesDe = (filas = []) => filas.map((f) => ({ trabajador: f.trabajador, nombre: f.datos?.nombre || "", monto: String(f.monto ?? 0) }));

export function hayCambiosLote({ lote, fecha, referencia, cargo, editables }) {
  if (!lote) return false;
  if (fecha !== lote.fecha || String(referencia || "") !== String(lote.referencia || "")) return true;
  if ((cargo?.tipo || "") !== (lote.cargo?.tipo || "") || String(cargo?.numero || "") !== String(lote.cargo?.numero || "")) return true;
  if (editables.length !== lote.filas.length) return true;
  const porId = new Map(lote.filas.map((f) => [f.trabajador, Number(f.monto)]));
  return editables.some((e) => porId.get(e.trabajador) !== importe(e.monto));
}

// --- Excel genérico (investigación §8.3) ---

const cargarExcel = async () => (await import("exceljs")).default;

// Solo el texto libre (referencia, nombres, motivo): una celda que Excel podría leer como fórmula se antepone con «'».
// Documento, cuentas, CCI y códigos de banco se escriben tal cual: el contador los copia a la plantilla del banco.
export function textoSeguro(valor) {
  const t = valor == null ? "" : String(valor);
  return /^[=+\-@\t\r]/.test(t) ? `'${t}` : t;
}

const TEXTO = "@";
const IMPORTE = "0.00";

const COLUMNAS_CABECERA = [
  ["Empresa", "empresa", 34], ["RUC", "ruc", 14, TEXTO], ["Banco de cargo", "bancoCargo", 20], ["Tipo de cuenta de cargo", "tipoCuentaCargo", 22],
  ["Cuenta de cargo", "cuentaCargo", 22, TEXTO], ["Moneda", "moneda", 9], ["Fecha de proceso", "fechaProceso", 16, TEXTO],
  ["Tipo de planilla", "tipoPlanilla", 22], ["Referencia", "referencia", 30], ["Cantidad de abonos", "cantidad", 18], ["Monto total", "montoTotal", 14, IMPORTE],
];

const COLUMNAS_DETALLE = [
  ["N.º", "n", 6], ["Tipo de documento", "tipoDocumento", 16], ["Número de documento", "numDocumento", 20, TEXTO],
  ["Apellido paterno", "apellidoPaterno", 22], ["Apellido materno", "apellidoMaterno", 22], ["Nombres", "nombres", 26], ["Nombre completo", "nombreCompleto", 40],
  ["Banco del trabajador", "banco", 22], ["Código del banco", "codigoBanco", 16, TEXTO], ["Tipo de cuenta", "tipoCuenta", 14],
  ["Número de cuenta", "cuenta", 24, TEXTO], ["CCI", "cci", 24, TEXTO], ["Moneda", "moneda", 9], ["Importe", "importe", 14, IMPORTE], ["Referencia", "referencia", 30],
];
const COLUMNAS_CTS = [["Últimos sueldos", "ultimosSueldos", 16, IMPORTE], ["Monto intangible", "intangible", 16, IMPORTE]];

const COLUMNAS_FUERA = [
  ["N.º", "n", 6], ["Tipo de documento", "tipoDocumento", 16], ["Número de documento", "numDocumento", 20, TEXTO], ["Nombre completo", "nombreCompleto", 40],
  ["Banco del trabajador", "banco", 22], ["Importe", "importe", 14, IMPORTE], ["Motivo", "motivo", 44],
];

function hoja(wb, nombre, columnas, filas) {
  const ws = wb.addWorksheet(nombre, { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = columnas.map(([header, key, width, numFmt]) => ({ header, key, width, style: { numFmt: numFmt || "General" } }));
  ws.getRow(1).font = { bold: true };
  const numericas = new Set(columnas.filter(([, , , f]) => f === IMPORTE).map(([, k]) => k));
  const enteras = new Set(["n", "cantidad"]);
  const textoCelda = Object.fromEntries(columnas.filter(([, , , f]) => f === TEXTO).map(([, k]) => [k, true]));
  for (const f of filas) {
    ws.addRow(Object.fromEntries(columnas.map(([, key]) => {
      const v = f[key];
      if (numericas.has(key) || enteras.has(key)) return [key, v === "" || v == null ? null : Number(v)];
      return [key, textoCelda[key] ? String(v ?? "") : textoSeguro(v)];
    })));
  }
  return ws;
}

// `lote` es la respuesta de GET /planilla/abonos/:id/datos-excel. En el detalle solo van las filas del archivo.
export async function libroExcelGenerico(lote, contexto = {}) {
  const esCts = contexto.cts ?? (lote.detalle || []).some((d) => d.intangible !== undefined);
  const ExcelJS = await cargarExcel();
  const wb = new ExcelJS.Workbook();
  hoja(wb, "Cabecera", COLUMNAS_CABECERA, [lote.cabecera]);
  hoja(wb, "Detalle", [...COLUMNAS_DETALLE, ...(esCts ? COLUMNAS_CTS : [])], lote.detalle || []);
  return wb;
}

// Las filas que se pagan por otro medio: no van en el archivo del banco.
export async function libroFueraDeArchivo(lote) {
  const ExcelJS = await cargarExcel();
  const wb = new ExcelJS.Workbook();
  const filas = lote.fueraDelArchivo || [];
  const ws = hoja(wb, "Fuera del archivo", COLUMNAS_FUERA, filas);
  ws.addRow({ nombreCompleto: "TOTAL", importe: round2(filas.reduce((s, f) => s + (Number(f.importe) || 0), 0)) }).font = { bold: true };
  return wb;
}

export async function descargarLibro(libro, nombre) {
  const buffer = await libro.xlsx.writeBuffer();
  descargarBlob(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), nombre);
}

export function descargarBlob(blob, nombre) {
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement("a");
  enlace.href = url;
  enlace.download = nombre;
  enlace.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
