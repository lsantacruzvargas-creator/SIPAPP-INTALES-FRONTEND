// Planilla de remuneraciones: textos, formulario del trabajador y hojas de Excel. El cálculo lo hace el servidor.
import { TREGISTRO_VACIO, requiereEstudios } from "./tregistro.js";
import { money } from "./compras.js";

export const TIPOS_CONCEPTO = { ingreso: "Ingresos", descuento: "Descuentos", aporteTrabajador: "Aportes del trabajador", aporteEmpleador: "Aportes del empleador" };
export const REGIMENES_SALUD = { essalud: "EsSalud", eps: "EsSalud + EPS", sis: "SIS (microempresa)" };
export const AREAS = { administracion: "Administración", produccion: "Producción", ventas: "Ventas" };
// Cuentas de gasto que el servidor acepta por área (porArea) además de la general.
export const CLAVES_GASTO_AREA = ["remuneraciones", "asignacionFamiliar", "bonificaciones", "vacaciones", "gratificaciones", "salud", "eps", "senati", "sctr", "cts", "indemnizaciones"];

export const nombreTrabajador = (t) => [t.apellidoPaterno, t.apellidoMaterno, t.nombres].filter(Boolean).join(" ");

export const textoPension = (p, afps = {}) => (
  p?.regimen === "afp" ? `AFP ${afps[p.afp] || p.afp}${p.comision === "mixta" ? " (mixta)" : ""}` : p?.regimen === "onp" ? "ONP" : "Sin régimen"
);

const suma = (lista, f) => Math.round(lista.reduce((s, x) => s + (f(x) || 0), 0) * 100) / 100;
export const montoDe = (boleta, ...codigos) => suma(boleta.conceptos.filter((c) => codigos.includes(c.codigo)), (c) => c.monto);

export const totalesPlanilla = (boletas) => Object.fromEntries(
  ["ingresos", "descuentos", "aportesTrabajador", "aportesEmpleador", "neto"].map((k) => [k, suma(boletas, (b) => b.totales?.[k])])
);

// Una fila por trabajador con las columnas que revisa quien paga la planilla.
export function filasExcelPlanilla(boletas, afps = {}) {
  return boletas.map((b) => {
    const basico = montoDe(b, "0121", "0118"), familiar = montoDe(b, "0201"), extras = montoDe(b, "0105", "0106");
    return {
      "Documento": b.datos.numDoc, "Trabajador": b.datos.nombre, "Cargo": b.datos.cargo || "", "Pensión": textoPension(b.datos.pension, afps),
      "Días pagados": b.dias?.remunerados ?? "", "Básico": basico, "Asig. familiar": familiar, "Horas extras": extras,
      "Otros ingresos": Math.round((b.totales.ingresos - basico - familiar - extras) * 100) / 100, "Total ingresos": b.totales.ingresos,
      "ONP": montoDe(b, "0607"), "AFP": montoDe(b, "0601", "0606", "0608"), "Renta 5.ª": montoDe(b, "0605"), "Descuentos": b.totales.descuentos,
      "Neto a pagar": b.totales.neto, "EsSalud y EPS": b.totales.aportesEmpleador,
    };
  });
}

export const TRABAJADOR_VACIO = {
  tipoDoc: "01", numDoc: "", apellidoPaterno: "", apellidoMaterno: "", nombres: "", cargo: "", centroCosto: "", area: "", fechaIngreso: "", fechaCese: "",
  remuneracionBasica: "", cuentaCts: { entidad: "", numero: "", codigoEntidad: "", cci: "" }, pagoQuincenal: false, asignacionFamiliar: false, conceptosFijos: [], pension: { regimen: "onp", afp: "", comision: "flujo", cuspp: "" },
  salud: "essalud", planEps: { nombre: "", primaTotal: "", aporteEmpresa: "", aporteTrabajador: "" }, quintaAnterior: [], tregistro: TREGISTRO_VACIO(), desbloqueo: false,
};
const MONTOS_EPS = ["primaTotal", "aporteEmpresa", "aporteTrabajador"];

// Copia solo las claves del formulario vacío: lo que escribe el servidor (alta, estado de baja, ediciones) no entra al formulario.
const mezclarTregistro = (base, origen) => Object.fromEntries(Object.entries(base).map(([k, d]) => (
  [k, typeof d === "object" ? mezclarTregistro(d, origen?.[k]) : origen?.[k] ?? d]
)));

export const formularioDeTrabajador = (t) => ({
  ...TRABAJADOR_VACIO, ...t, tregistro: { ...mezclarTregistro(TREGISTRO_VACIO(), t.tregistro), nacionalidad: t.tregistro?.nacionalidad ?? "" }, desbloqueo: false, centroCosto: t.centroCosto || "", area: t.area || "", cuentaCts: { entidad: t.cuentaCts?.entidad || "", numero: t.cuentaCts?.numero || "", codigoEntidad: t.cuentaCts?.codigoEntidad || "", cci: t.cuentaCts?.cci || "" }, pagoQuincenal: t.pagoQuincenal === true, fechaCese: t.fechaCese || "", remuneracionBasica: String(t.remuneracionBasica ?? ""),
  pension: { ...TRABAJADOR_VACIO.pension, ...t.pension },
  planEps: t.planEps ? { nombre: t.planEps.nombre || "", ...Object.fromEntries(MONTOS_EPS.map((k) => [k, String(t.planEps[k] ?? "")])) } : TRABAJADOR_VACIO.planEps,
  conceptosFijos: (t.conceptosFijos || []).map((c) => ({ codigo: c.codigo, monto: String(c.monto) })),
  quintaAnterior: (t.quintaAnterior || []).map((q) => ({ mes: `${q.periodo.slice(0, 4)}-${q.periodo.slice(4)}`, ingresos: String(q.ingresos), retencion: String(q.retencion) })),
});

function validarTregistro(tr) {
  if (!tr) return "";
  if (tr.telefono && !/^\d{1,9}$/.test(tr.telefono.trim())) return "El teléfono solo admite dígitos (hasta 9).";
  if (tr.establecimiento && !/^\d{4}$/.test(tr.establecimiento.trim())) return "El código de establecimiento debe tener 4 dígitos.";
  if (requiereEstudios(tr.situacionEducativa) && tr.estudios?.anioEgreso && !/^\d{4}$/.test(tr.estudios.anioEgreso.trim())) return "El año de egreso debe tener 4 dígitos.";
  const cci = tr.cuenta?.cci?.trim();
  if (cci && !/^\d{20}$/.test(cci)) return "El CCI de la cuenta de sueldo debe tener 20 dígitos.";
  return "";
}

// Primer dato que falta o está mal en el formulario del trabajador ("" si está completo).
export function validarTrabajador(f) {
  if (f.tipoDoc === "01" ? !/^\d{8}$/.test(f.numDoc.trim()) : f.numDoc.trim().length < 4) return f.tipoDoc === "01" ? "El DNI debe tener 8 dígitos." : "Falta el número de documento.";
  if (!f.apellidoPaterno.trim() || !f.nombres.trim()) return "Faltan el apellido paterno o los nombres.";
  if (!f.fechaIngreso) return "Falta la fecha de ingreso.";
  if (f.fechaCese && f.fechaCese < f.fechaIngreso) return "El cese no puede ser anterior al ingreso.";
  if (f.remuneracionBasica === "" || !(Number(f.remuneracionBasica) >= 0)) return "Falta la remuneración básica.";
  if (f.pension.regimen === "afp" && !f.pension.afp) return "Elige la AFP del trabajador.";
  if (f.conceptosFijos.some((c) => !c.codigo || !(Number(c.monto) > 0))) return "Completa o quita los conceptos fijos vacíos.";
  if (f.quintaAnterior.some((q) => !/^\d{4}-\d{2}$/.test(q.mes))) return "Indica el mes de cada fila de renta de 5.ª anterior.";
  if (conPlanEps(f)) {
    const [prima, empresa, trabajador] = MONTOS_EPS.map((k) => Number(f.planEps[k]));
    if (MONTOS_EPS.some((k) => String(f.planEps[k]).trim() === "" || !(Number(f.planEps[k]) >= 0))) return "Completa los montos del plan EPS (0 o más) o déjalos todos vacíos.";
    if (Math.abs(empresa + trabajador - prima) > 0.005) return "El aporte de la empresa y el del trabajador deben sumar la prima total de la EPS.";
  }
  if (f.cuentaCts.cci.trim() && !/^\d{20}$/.test(f.cuentaCts.cci.trim())) return "El CCI de la cuenta CTS debe tener 20 dígitos.";
  return validarTregistro(f.tregistro);
}

// Un plan EPS sin ningún dato no se envía: el trabajador con EPS queda sin descuento.
const conPlanEps = (f) => f.salud === "eps" && Boolean(f.planEps) && Object.values(f.planEps).some((v) => String(v).trim() !== "");

// Sin estudios exigidos no se envía la sección: oculta, un año a medias no debe impedir guardar ni pisar lo guardado.
const tregistroDeCuerpo = ({ estudios, ...resto }) => (requiereEstudios(resto.situacionEducativa) ? { ...resto, estudios } : resto);

export const cuerpoDeTrabajador = ({ desbloqueo, ...f }) => ({
  ...f, tregistro: tregistroDeCuerpo(f.tregistro), cuentaCts: { entidad: f.cuentaCts.entidad.trim(), numero: f.cuentaCts.numero.trim(), codigoEntidad: f.cuentaCts.codigoEntidad, cci: f.cuentaCts.cci.trim() }, ...(desbloqueo === true && { desbloqueo }), centroCosto: f.centroCosto || null, remuneracionBasica: Number(f.remuneracionBasica),
  conceptosFijos: f.conceptosFijos.map((c) => ({ codigo: c.codigo, monto: Number(c.monto) })),
  quintaAnterior: f.quintaAnterior.map((q) => ({ periodo: q.mes.replace("-", ""), ingresos: Number(q.ingresos) || 0, retencion: Number(q.retencion) || 0 })),
  planEps: conPlanEps(f) ? { nombre: f.planEps.nombre.trim(), ...Object.fromEntries(MONTOS_EPS.map((k) => [k, Number(f.planEps[k])])) } : null,
});

// Parámetros del mes ↔ formulario (los inputs trabajan con texto).
const CAMPOS_PARAMETROS = ["uit", "rmv", "essalud", "onp"];
export const formularioDeParametros = (p, afps) => ({
  ...Object.fromEntries(CAMPOS_PARAMETROS.map((k) => [k, String(p[k] ?? "")])),
  afp: {
    aporte: String(p.afp?.aporte ?? ""), prima: String(p.afp?.prima ?? ""), tope: String(p.afp?.tope ?? ""),
    comisiones: Object.fromEntries(Object.keys(afps).map((a) => [a, { flujo: String(p.afp?.comisiones?.[a]?.flujo ?? ""), mixta: String(p.afp?.comisiones?.[a]?.mixta ?? "") }])),
  },
});
export const cuerpoDeParametros = (f) => ({
  ...Object.fromEntries(CAMPOS_PARAMETROS.map((k) => [k, Number(f[k])])),
  afp: {
    aporte: Number(f.afp.aporte), prima: Number(f.afp.prima), tope: Number(f.afp.tope),
    comisiones: Object.fromEntries(Object.entries(f.afp.comisiones).map(([a, c]) => [a, { flujo: Number(c.flujo), mixta: Number(c.mixta) }])),
  },
});
// Las tasas de AFP se copian cada mes de la SBS: sin prima ni tope el cálculo saldría sin seguro.
export const faltanTasasAfp = (f) => !(Number(f.afp.prima) > 0) || !(Number(f.afp.tope) > 0);

// El PUT reemplaza las cuentas generales y las de área que no se envían: se manda todo, con "" donde no hay cuenta.
export const cuerpoDeCuentas = (form) => ({
  ...form,
  porArea: Object.fromEntries(CLAVES_GASTO_AREA.map((k) => [k, Object.fromEntries(Object.keys(AREAS).map((a) => [a, form.porArea?.[k]?.[a] || ""]))])),
});

export const SUBTITULO_LIQUIDACION = "Liquidación de beneficios sociales";

// Celdas de una columna de la boleta: los conceptos del mes y, bajo un subtítulo, los de la liquidación.
export const celdasDeColumna = (conceptos) => {
  const mes = conceptos.filter((c) => !c.liquidacion);
  const liquidacion = conceptos.filter((c) => c.liquidacion);
  return liquidacion.length ? [...mes, { subtitulo: SUBTITULO_LIQUIDACION }, ...liquidacion] : mes;
};

// «¿Va al PLAME?», con la misma regla del servidor (utils/plame.js): un código de 4 dígitos va al .rem salvo los que calcula el PDT
// (`catalogos.plame.noImportar`); lo demás (DEV5, EPS, CTS depositada, provisiones) no va.
export const destinoPlame = (codigo, noImportar = []) => {
  if (!/^\d{4}$/.test(String(codigo ?? ""))) return "no";
  return noImportar.includes(codigo) ? "pdt" : "rem";
};

export const ETIQUETA_PLAME = {
  rem: { texto: "PLAME", ayuda: "Se importa en el archivo .rem del PLAME." },
  pdt: { texto: "PLAME · lo calcula el PDT", ayuda: "Va al PLAME, pero no se importa: el PDT lo calcula solo." },
  no: { texto: "No va al PLAME", ayuda: "Es un dato de la boleta o de control interno: no se declara en el PLAME." },
};

// El depósito de mayo cubre nov–abr (empieza el año anterior) y el de noviembre may–oct.
export const etiquetaPeriodoCts = (periodo) => {
  const anio = Number(String(periodo).slice(0, 4)), mes = String(periodo).slice(4);
  if (mes === "11") return `may–oct ${anio}`;
  if (mes === "05") return `nov ${anio - 1}–abr ${anio}`;
  return "";
};

const tasaTexto = (n) => String(Math.round(n * 10000) / 100).replace(".", ",");

// La fórmula de la gratificación calculada con los datos que guardó la boleta (ver spec §7).
export const detalleGratificacion = (g) => {
  if (!g) return null;
  const base = `${money(g.rc)} × ${g.meses} ${g.meses === 1 ? "mes" : "meses"} ÷ 6`;
  const conDias = g.diasNoLaborados > 0 ? `(${base} − ${money(g.rc)} ÷ 180 × ${g.diasNoLaborados} ${g.diasNoLaborados === 1 ? "día no laborado" : "días no laborados"})` : base;
  const factor = g.factor !== 1 ? ` × ${g.factor === 0.5 ? "½" : g.factor}` : "";
  return {
    formula: `${conDias}${factor}`,
    bonificacion: g.tasaBonificacion > 0 ? `Bonificación extraordinaria: ${tasaTexto(g.tasaBonificacion)} % de la gratificación` : "",
    avisos: g.avisos || [],
  };
};

export const ROTULOS_PROVISION = { cts: "CTS", gratificacion: "Gratificación", bonificacion: "Bonificación extraordinaria", vacaciones: "Vacaciones" };
