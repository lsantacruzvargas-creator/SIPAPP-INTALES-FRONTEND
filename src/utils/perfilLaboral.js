// Perfil laboral de la empresa (SENATI, SCTR, vida ley) y las casillas de aportes de la ficha del trabajador.

export const PERFIL_VACIO = {
  remype: { inscrita: false, desde: "" },
  ciiu: { codigo: "", descripcion: "" },
  actividadIndustrial: false,
  senati: { anio: null, aporta: false, origen: "manual", evaluaciones: [] },
  sctr: {
    actividadRiesgo: false,
    salud: { entidad: "essalud", eps: "", tasa: "" },
    pension: { entidad: "onp", aseguradora: "", tasa: "" },
  },
  vidaLey: { aseguradora: "", poliza: "", vigenciaDesde: "", vigenciaHasta: "", calculo: "tasa", valor: "" },
  cambios: [],
};

// Obrero (01) → marcadas; empleado (02) y ejecutivo (03) → desmarcadas. En una empresa industrial SENATI va para todos.
export const precargaAportes = (categoriaOcupacional, { actividadIndustrial } = {}) => {
  const obrero = categoriaOcupacional === "01";
  return { senati: Boolean(actividadIndustrial) || obrero, sctr: obrero };
};

// `tocados` dice qué casillas ya eligió el usuario en esta ficha: esas se respetan.
export const aplicarPrecarga = (form, tocados, perfil) => {
  const precarga = precargaAportes(form.tregistro?.categoriaOcupacional, perfil);
  const aportes = { ...form.aportes };
  for (const k of ["senati", "sctr"]) if (!tocados?.[k]) aportes[k] = precarga[k];
  return { ...form, aportes };
};

// Cambiar la casilla SCTR de un trabajador ya dado de alta en SUNAT genera una modificación en T-Registro.
export const cambiaSctrRegistrado = (trabajadorGuardado, form) => {
  if (Boolean(trabajadorGuardado?.aportes?.sctr) === Boolean(form?.aportes?.sctr)) return false;
  const alta = trabajadorGuardado?.estado?.alta;
  return !alta || alta === "registrada" || alta === "sin control";
};
