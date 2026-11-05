export const ESTADOS_PERIODO = {
  "en curso": { texto: "En curso", clase: "bg-gray-100 text-gray-600" },
  liquidado: { texto: "Liquidado", clase: "bg-slate-200 text-slate-700" },
  gozado: { texto: "Gozado", clase: "bg-green-100 text-green-700" },
  vigente: { texto: "Vigente", clase: "bg-blue-100 text-blue-700" },
  "por vencer": { texto: "Por vencer", clase: "bg-amber-100 text-amber-800" },
  vencido: { texto: "Vencido", clase: "bg-red-100 text-red-700" },
};

// Fechas internas "AAAA-MM-DD" → dd/mm/aaaa sin pasar por Date (no hay huso que corregir).
export const fechaDMA = (f) => (f ? f.split("-").reverse().join("/") : "—");

const esEntero = (v) => /^-?\d+$/.test(String(v).trim());

export function validarAjuste({ periodoInicio, dias, motivo }) {
  if (!periodoInicio) return "Elige el periodo.";
  if (!esEntero(dias) || Number(dias) === 0 || Math.abs(Number(dias)) > 60) return "Los días deben ser un entero distinto de 0 (máximo 60).";
  if (!String(motivo || "").trim()) return "Indica el motivo del ajuste.";
  return "";
}

// Vacío cuenta como 0; el servidor rechaza fuera de 0–15 y la boleta reemplaza la asistencia completa.
export function validarDiasVendidos(valor) {
  const v = String(valor ?? "").trim();
  return v === "" || (/^\d+$/.test(v) && Number(v) <= 15) ? "" : "Días de vacaciones vendidos: entero de 0 a 15";
}

export const filasExcelVacaciones = (trabajadores) =>
  trabajadores.map((t) => ({
    Trabajador: t.nombre,
    Documento: t.numDoc,
    "Fecha de ingreso": fechaDMA(t.fechaIngreso),
    "Días pendientes": t.pendientes,
    "Próximo vencimiento": fechaDMA(t.proximoVencimiento),
    Avisos: (t.avisos || []).join(" | "),
  }));
