// Datos del trámite en T-Registro (SUNAT) que viajan en la ficha del trabajador: valores por defecto, bloqueos y textos.

const ESTUDIOS_SUPERIORES = /^(11|1[3-9]|20|21)$/;

export const TREGISTRO_VACIO = (config = {}) => ({
  fechaNacimiento: "", sexo: "", nacionalidad: "", telefono: "", correo: "", paisEmisor: "",
  direccion: {
    tipoVia: "", nombreVia: "", numeroVia: "", interior: "", manzana: "", lote: "", kilometro: "", block: "", etapa: "",
    tipoZona: "", nombreZona: "", referencia: "", ubigeo: "",
  },
  categoriaOcupacional: config.categoriaOcupacional ?? "", ocupacion: config.ocupacion ?? "", situacionEducativa: config.situacionEducativa ?? "",
  tipoContrato: config.tipoContrato ?? "", periodicidad: config.periodicidad ?? "", tipoPago: config.tipoPago ?? "",
  discapacidad: false, sindicalizado: false, jornadaMaxima: config.jornadaMaxima === true, horarioNocturno: false, regimenAlternativo: false,
  situacionEspecial: "", eps: "",
  estudios: { completaEnPeru: true, institucion: "", carrera: "", anioEgreso: "" },
  cuenta: { entidad: "", numero: "" },
  establecimiento: "",
  baja: { motivo: "" },
});

const TEXTO_ALTA = { "sin control": "sin control", pendiente: "pendiente", registrada: "registrada" };
const TEXTO_BAJA = { ninguna: "ninguna", "sin control": "sin control", pendiente: "pendiente", incompleta: "incompleta (falta el motivo)", registrada: "registrada" };

export const estadoTexto = (estado) => ({ alta: TEXTO_ALTA[estado?.alta] ?? "", baja: TEXTO_BAJA[estado?.baja] ?? "" });

export const camposBloqueados = (t, _rol) => {
  const altaRegistrada = t?.tregistro?.alta?.estado === "registrada";
  return { documento: altaRegistrada, ingreso: altaRegistrada, cese: t?.tregistro?.baja?.estado === "registrada" };
};

export const puedeDesbloquear = (rol) => rol === "contador";

export const requiereEstudios = (situacionEducativa) => ESTUDIOS_SUPERIORES.test(situacionEducativa ?? "");

export const requiereCuenta = (tipoPago) => tipoPago === "2";
