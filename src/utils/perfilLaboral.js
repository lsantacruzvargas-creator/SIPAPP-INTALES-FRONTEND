// Perfil laboral de la empresa (SENATI, SCTR, vida ley) y las casillas de aportes de la ficha del trabajador.

export const PERFIL_VACIO = {
  remype: { inscrita: false, desde: "" },
  ciiu: { codigo: "", descripcion: "" },
  actividadIndustrial: false,
  porcentajeQuincena: 50,
  senati: { anio: null, aporta: false, origen: "manual", evaluaciones: [] },
  sctr: {
    actividadRiesgo: false,
    salud: { entidad: "essalud", eps: "", tasa: "" },
    pension: { entidad: "onp", aseguradora: "", tasa: "" },
  },
  vidaLey: { aseguradora: "", poliza: "", vigenciaDesde: "", vigenciaHasta: "", calculo: "tasa", valor: "" },
  beneficios: { registro: "gasto", desde: "", historial: [] },
  cambios: [],
};

export const errorPorcentajeQuincena = (v) => {
  const n = Number(v);
  return v == null || String(v).trim() === "" || !Number.isFinite(n) || n < 0 || n > 100 ? "El adelanto de quincena debe ser un porcentaje entre 0 y 100." : "";
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

// Registro de beneficios sociales. En el formulario el mes va como AAAA-MM (input month); el servidor usa AAAAMM.
export const beneficiosDeFormulario = (b) => ({
  registro: b?.registro || "gasto",
  desde: b?.desde ? `${b.desde.slice(0, 4)}-${b.desde.slice(4)}` : "",
  historial: b?.historial || [],
});

const cambioBeneficios = (form, base) => form.registro !== base.registro || form.desde !== base.desde;

// Otro registro vacía «Rige desde»: con el mes anterior, el cambio reescribiría el historial desde ese mes sin que el usuario
// lo eligiera. Volver al registro guardado recupera su mes.
export const conRegistroBeneficios = (form, registro, base) => ({ ...form, registro, desde: registro === base.registro ? base.desde : "" });

// Sin cambio no se envía. Cada cambio manda la elección completa: repetir un mes reescribe desde él.
export const cuerpoBeneficios = (form, base) => (
  cambioBeneficios(form, base) ? { registro: form.registro, desde: form.desde.replace("-", "") } : undefined
);

export const errorBeneficios = (form, base) => (
  cambioBeneficios(form, base) && !form.desde ? "Indica desde qué mes rige el registro de beneficios sociales." : ""
);

const ROTULO_REGISTRO = { gasto: "Gasto al pagar", provision: "Provisión mensual" };

export const textoHistorialBeneficios = (historial = []) =>
  historial.map((h) => `${ROTULO_REGISTRO[h.registro]} desde ${h.desde.slice(4)}/${h.desde.slice(0, 4)}`);

export const avisoBeneficios = (form, base) => {
  if (!cambioBeneficios(form, base)) return "";
  if (form.registro === "provision") {
    return "Si el mes elegido cae a mitad de un periodo (semestre de CTS o de gratificación), la primera planilla provisiona lo acumulado del periodo de una vez.";
  }
  return base.registro === "provision"
    ? "Los saldos provisionados siguen en las cuentas por pagar: al pagar cada beneficio se consumen igual, y el resto se limpia en la liquidación."
    : "";
};
