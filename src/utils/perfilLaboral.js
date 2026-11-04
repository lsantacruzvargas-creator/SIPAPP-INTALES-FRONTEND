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

// El aviso del cambio del perfil se esconde con «Entendido» hasta que el servidor informe uno más reciente.
export const mostrarCambioPerfil = (cambio, vistoFecha) => {
  if (!cambio?.fecha) return false;
  const visto = Date.parse(vistoFecha);
  return Number.isNaN(visto) || Date.parse(cambio.fecha) > visto;
};

// Obrero (01) → marcadas; empleado (02) y ejecutivo (03) → desmarcadas. En una empresa industrial SENATI va para todos.
export const precargaAportes = (categoriaOcupacional, { actividadIndustrial } = {}) => {
  const obrero = categoriaOcupacional === "01";
  return { senati: Boolean(actividadIndustrial) || obrero, sctr: obrero };
};

// `tocados` dice qué casillas ya eligió el usuario en esta ficha: esas se respetan.
export const aplicarPrecarga = (form, tocados, perfil) => {
  const precarga = precargaAportes(form.tregistro?.categoriaOcupacional, perfil ?? {});
  const aportes = { ...form.aportes };
  for (const k of ["senati", "sctr"]) if (!tocados?.[k]) aportes[k] = precarga[k];
  return { ...form, aportes };
};

// Cambiar la casilla SCTR de un trabajador ya dado de alta en SUNAT genera una modificación en T-Registro; con la baja
// registrada el servidor no crea ninguna.
export const cambiaSctrRegistrado = (trabajadorGuardado, form) => {
  if (Boolean(trabajadorGuardado?.aportes?.sctr) === Boolean(form?.aportes?.sctr)) return false;
  const { alta, baja } = trabajadorGuardado?.estado ?? {};
  return baja !== "registrada" && (!alta || alta === "registrada" || alta === "sin control");
};

const sumarDias = (iso, n) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);

// Reglas del PVS (ETR17.x), las mismas del servidor: el inicio de una cobertura admite hasta +30 días desde hoy y el fin
// de la que se cierra (baja o cambio de entidad) hasta +5. `cierra` dice si el cambio cierra una cobertura vigente.
export const limiteFechaSctr = (hoy, { cierra }) => sumarDias(hoy, cierra ? 5 : 30);

export const errorFechaSctr = (fecha, hoy, { cierra }) => {
  if (!fecha) return "Indica la fecha del cambio de SCTR en SUNAT.";
  if (fecha <= limiteFechaSctr(hoy, { cierra })) return "";
  return cierra ? "El fin del SCTR no puede ser más de 5 días posterior a hoy." : "El inicio del SCTR no puede ser más de 30 días posterior a hoy.";
};
