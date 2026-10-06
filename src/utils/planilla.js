// Planilla de remuneraciones: textos, formulario del trabajador y hojas de Excel. El cálculo lo hace el servidor.

export const TIPOS_CONCEPTO = { ingreso: "Ingresos", descuento: "Descuentos", aporteTrabajador: "Aportes del trabajador", aporteEmpleador: "Aportes del empleador" };
export const REGIMENES_SALUD = { essalud: "EsSalud", eps: "EsSalud + EPS", sis: "SIS (microempresa)" };

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
  tipoDoc: "01", numDoc: "", apellidoPaterno: "", apellidoMaterno: "", nombres: "", cargo: "", centroCosto: "", fechaIngreso: "", fechaCese: "",
  remuneracionBasica: "", asignacionFamiliar: false, conceptosFijos: [], pension: { regimen: "onp", afp: "", comision: "flujo", cuspp: "" },
  salud: "essalud", quintaAnterior: [],
};

export const formularioDeTrabajador = (t) => ({
  ...TRABAJADOR_VACIO, ...t, centroCosto: t.centroCosto || "", fechaCese: t.fechaCese || "", remuneracionBasica: String(t.remuneracionBasica ?? ""),
  pension: { ...TRABAJADOR_VACIO.pension, ...t.pension },
  conceptosFijos: (t.conceptosFijos || []).map((c) => ({ codigo: c.codigo, monto: String(c.monto) })),
  quintaAnterior: (t.quintaAnterior || []).map((q) => ({ mes: `${q.periodo.slice(0, 4)}-${q.periodo.slice(4)}`, ingresos: String(q.ingresos), retencion: String(q.retencion) })),
});

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
  return "";
}

export const cuerpoDeTrabajador = (f) => ({
  ...f, centroCosto: f.centroCosto || null, remuneracionBasica: Number(f.remuneracionBasica),
  conceptosFijos: f.conceptosFijos.map((c) => ({ codigo: c.codigo, monto: Number(c.monto) })),
  quintaAnterior: f.quintaAnterior.map((q) => ({ periodo: q.mes.replace("-", ""), ingresos: Number(q.ingresos) || 0, retencion: Number(q.retencion) || 0 })),
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
