import * as XLSX from "xlsx";
import { round2 } from "./compras.js";
import { AREAS } from "./planilla.js";

export const NOMBRES_SUSPENSION = {
  "01": "Sanción disciplinaria",
  "02": "Huelga",
  "03": "Detención del trabajador",
  "05": "Permiso o licencia sin goce de haber",
  "06": "Caso fortuito o fuerza mayor",
  "07": "Falta no justificada",
  "09": "Maternidad sin subsidio (pre y posnatal)",
  "20": "Enfermedad o accidente (primeros 20 días)",
  "21": "Incapacidad temporal subsidiada por EsSalud",
  "22": "Maternidad subsidiada por EsSalud",
  "23": "Descanso vacacional",
  "26": "Licencia con goce de haber",
  "27": "Días compensados por horas extras",
  "28": "Licencia por paternidad",
  "32": "Fallecimiento de familiar directo",
  "35": "Enfermedad grave o accidente de familiar directo",
};

export const GRUPOS_DIAS = {
  vacaciones: ["23"],
  descansoSubsidios: ["20", "21", "22"],
  licenciasConGoce: ["26", "27", "28", "32", "35"],
  licenciasSinGoce: ["01", "02", "03", "05", "06", "09"],
  faltas: ["07"],
};

const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const TIPOS = { ingreso: "ingreso", descuento: "descuento", aporteTrabajador: "aporte del trabajador", aporteEmpleador: "aporte del empleador" };

export const tituloMes = (periodo) => `${MESES[Number(String(periodo).slice(4)) - 1] || ""} ${String(periodo).slice(0, 4)}`.trim();

export const COLUMNAS_REPORTE = [
  { clave: "documento", titulo: "Documento", grupo: "Trabajador", numero: false },
  { clave: "nombre", titulo: "Apellidos y nombres", grupo: "Trabajador", numero: false },
  { clave: "cargo", titulo: "Cargo", grupo: "Trabajador", numero: false },
  { clave: "area", titulo: "Área", grupo: "Trabajador", numero: false },
  { clave: "diasVinculo", titulo: "Días del vínculo", grupo: "Días", numero: true },
  { clave: "diasLaborados", titulo: "Días laborados", grupo: "Días", numero: true },
  { clave: "vacaciones", titulo: "Vacaciones", grupo: "Días", numero: true },
  { clave: "descansoSubsidios", titulo: "Descanso médico y subsidios", grupo: "Días", numero: true },
  { clave: "licenciasConGoce", titulo: "Licencias con goce", grupo: "Días", numero: true },
  { clave: "licenciasSinGoce", titulo: "Licencias sin goce y otros no pagados", grupo: "Días", numero: true },
  { clave: "faltas", titulo: "Faltas", grupo: "Días", numero: true },
  { clave: "horasExtras25", titulo: "Horas extras 25 %", grupo: "Horas", numero: true },
  { clave: "horasExtras35", titulo: "Horas extras 35 %", grupo: "Horas", numero: true },
  { clave: "diasVendidos", titulo: "Días de vacaciones vendidos", grupo: "Otros", numero: true },
  { clave: "minutosTardanza", titulo: "Tardanza (minutos)", grupo: "Otros", numero: true },
  { clave: "descuentoTardanza", titulo: "Descuento por tardanza (0704, S/)", grupo: "Otros", numero: true, soles: true },
  { clave: "ingresos", titulo: "Total ingresos", grupo: "Pagado", numero: true, soles: true },
  { clave: "descuentos", titulo: "Total descuentos (incl. aportes)", grupo: "Pagado", numero: true, soles: true },
  { clave: "neto", titulo: "Neto a pagar", grupo: "Pagado", numero: true, soles: true },
  { clave: "aportesEmpleador", titulo: "Aportes del empleador", grupo: "Pagado", numero: true, soles: true },
];

const num = (v) => Number(v) || 0;
const diasDelGrupo = (boleta, tipos) => (boleta.asistencia?.suspensiones || []).filter((s) => tipos.includes(String(s.tipo))).reduce((t, s) => t + num(s.dias), 0);
const montoConcepto = (boleta, codigo) => round2((boleta.conceptos || []).filter((c) => c.codigo === codigo).reduce((t, c) => t + num(c.monto), 0));
const fechaPe = (iso) => (iso ? String(iso).slice(0, 10).split("-").reverse().join("/") : "");
const areaDe = (a) => AREAS[a] || a || "";

function filaDeBoleta(b) {
  const d = b.datos || {}, t = b.totales || {}, a = b.asistencia || {};
  return {
    documento: d.numDoc || "",
    nombre: d.nombre || "",
    cargo: d.cargo || "",
    area: areaDe(d.area),
    diasVinculo: num(b.dias?.vinculo),
    diasLaborados: num(b.dias?.efectivos),
    ...Object.fromEntries(Object.entries(GRUPOS_DIAS).map(([clave, tipos]) => [clave, diasDelGrupo(b, tipos)])),
    horasExtras25: num(a.horasExtras25),
    horasExtras35: num(a.horasExtras35),
    diasVendidos: num(a.diasVendidos),
    minutosTardanza: num(a.minutosTardanza),
    descuentoTardanza: montoConcepto(b, "0704"),
    ingresos: round2(num(t.ingresos)),
    descuentos: round2(num(t.descuentos) + num(t.aportesTrabajador)),
    neto: round2(num(t.neto)),
    aportesEmpleador: round2(num(t.aportesEmpleador)),
  };
}

export function filasReportePlanilla(boletas) {
  const filas = boletas.map(filaDeBoleta);
  const totales = Object.fromEntries(
    COLUMNAS_REPORTE.filter((c) => c.numero).map((c) => [c.clave, round2(filas.reduce((t, f) => t + f[c.clave], 0))]),
  );
  return { filas, totales };
}

export function hojaRecord(boleta, { empleador = {}, periodo, cerrada }) {
  const d = boleta.datos || {}, t = boleta.totales || {}, a = boleta.asistencia || {};
  const f = filaDeBoleta(boleta);
  const filas = [
    [`Récord de planilla – ${tituloMes(periodo)}`, ""],
    ["Empleador", empleador.razonSocial || ""],
    ["RUC", empleador.ruc || ""],
    ["Estado de la planilla", cerrada ? "Cerrada" : "Borrador"],
    ["Documento", f.documento],
    ["Apellidos y nombres", f.nombre],
    ["Cargo", f.cargo],
    ["Área", f.area],
    ["Fecha de ingreso", fechaPe(d.fechaIngreso)],
  ];
  if (d.fechaCese) filas.push(["Fecha de cese", fechaPe(d.fechaCese)]);
  filas.push(
    ["DÍAS", ""],
    ["Días del vínculo en el mes", f.diasVinculo],
    ["Días laborados", f.diasLaborados],
    ["Vacaciones", f.vacaciones],
    ["Descanso médico y subsidios", f.descansoSubsidios],
    ["Licencias con goce", f.licenciasConGoce],
    ["Licencias sin goce y otros no pagados", f.licenciasSinGoce],
    ["Faltas", f.faltas],
    ["DETALLE DE SUSPENSIONES", ""],
  );
  const suspensiones = (a.suspensiones || []).filter((s) => num(s.dias) > 0);
  if (!suspensiones.length) filas.push(["Sin suspensiones", ""]);
  for (const s of suspensiones) filas.push([`${s.tipo} ${NOMBRES_SUSPENSION[s.tipo] || ""}`.trim(), num(s.dias)]);
  filas.push(
    ["HORAS Y OTROS", ""],
    ["Horas extras 25 %", f.horasExtras25],
    ["Horas extras 35 %", f.horasExtras35],
    ["Días de vacaciones vendidos", f.diasVendidos],
    ["Tardanza (minutos)", f.minutosTardanza],
    ["Descuento por tardanza (0704, S/)", f.descuentoTardanza],
    ["DETALLE DE LA BOLETA", ""],
  );
  for (const c of boleta.conceptos || []) filas.push([`${c.codigo} ${c.nombre} (${TIPOS[c.tipo] || c.tipo})`, round2(num(c.monto))]);
  filas.push(
    ["Total ingresos", round2(num(t.ingresos))],
    ["Descuentos (sin aportes)", round2(num(t.descuentos))],
    ["Aportes del trabajador", round2(num(t.aportesTrabajador))],
    ["Neto a pagar", round2(num(t.neto))],
    ["Aportes del empleador", round2(num(t.aportesEmpleador))],
  );
  return filas;
}

const PROHIBIDOS = /[:\\/?*[\]]/g;

export function nombreHoja(documento, usados) {
  const base = String(documento ?? "").replace(PROHIBIDOS, "-").replace(/^'+|'+$/g, "").trim().slice(0, 31) || "Hoja";
  const tomados = new Set([...usados].map((n) => n.toLowerCase()));
  let nombre = base;
  for (let i = 2; tomados.has(nombre.toLowerCase()); i++) {
    const sufijo = ` (${i})`;
    nombre = base.slice(0, 31 - sufijo.length) + sufijo;
  }
  usados.add(nombre);
  return nombre;
}

function hojaDeRecord(boleta, contexto) {
  const ws = XLSX.utils.aoa_to_sheet([["Dato", "Valor"], ...hojaRecord(boleta, contexto)]);
  ws["!cols"] = [{ wch: 52 }, { wch: 28 }];
  return ws;
}

export function libroRecord(boleta, contexto) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, hojaDeRecord(boleta, contexto), nombreHoja(boleta.datos?.numDoc, new Set()));
  return wb;
}

export function libroReporte(boletas, contexto) {
  const { empleador = {}, periodo, cerrada } = contexto;
  const { filas, totales } = filasReportePlanilla(boletas);
  const conTitulos = (fila) => Object.fromEntries(COLUMNAS_REPORTE.map((c) => [c.titulo, fila[c.clave]]));
  const titulos = COLUMNAS_REPORTE.map((c) => c.titulo);
  const encabezado = [
    [empleador.razonSocial || ""],
    [`RUC ${empleador.ruc || ""}`.trim()],
    [`Reporte de planilla – ${tituloMes(periodo)}`],
    [`Estado de la planilla: ${cerrada ? "Cerrada" : "En borrador"}`],
    [],
  ];
  const ws = XLSX.utils.aoa_to_sheet(encabezado);
  XLSX.utils.sheet_add_json(ws, filas.map(conTitulos), { origin: encabezado.length, header: titulos });
  XLSX.utils.sheet_add_json(ws, [conTitulos({ ...totales, documento: "TOTAL" })], { skipHeader: true, origin: -1, header: titulos });
  ws["!cols"] = COLUMNAS_REPORTE.map((c) => ({ wch: c.clave === "nombre" ? 34 : c.numero ? Math.max(14, Math.min(c.titulo.length, 24)) : 18 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Reporte");
  const usados = new Set(["Reporte"]);
  for (const b of boletas) XLSX.utils.book_append_sheet(wb, hojaDeRecord(b, contexto), nombreHoja(b.datos?.numDoc, usados));
  return wb;
}
