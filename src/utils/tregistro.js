// Datos del trámite en T-Registro (SUNAT) que viajan en la ficha del trabajador: valores por defecto, bloqueos y textos.

import { formatearFechaHora } from "./fecha.js";

const ESTUDIOS_SUPERIORES = /^(11|1[3-9]|20|21)$/;

export const TREGISTRO_VACIO = (config = {}) => ({
  fechaNacimiento: "", sexo: "", nacionalidad: "9589", telefono: "", correo: "", paisEmisor: "",
  direccion: {
    tipoVia: "", nombreVia: "", numeroVia: "", interior: "", manzana: "", lote: "", kilometro: "", block: "", etapa: "",
    tipoZona: "", nombreZona: "", referencia: "", ubigeo: "",
  },
  categoriaOcupacional: config.categoriaOcupacional ?? "", ocupacion: config.ocupacion ?? "", situacionEducativa: config.situacionEducativa ?? "",
  tipoContrato: config.tipoContrato ?? "", periodicidad: config.periodicidad ?? "", tipoPago: config.tipoPago ?? "",
  discapacidad: false, sindicalizado: false, jornadaMaxima: config.jornadaMaxima === true, horarioNocturno: false, regimenAlternativo: false,
  situacionEspecial: "0", eps: "",
  estudios: { completaEnPeru: true, institucion: "", carrera: "", anioEgreso: "" },
  cuenta: { entidad: "", numero: "" },
  establecimiento: "",
  baja: { motivo: "" },
});

const TEXTO_ALTA = { "sin control": "sin control", pendiente: "pendiente", registrada: "registrada", anulada: "anulada" };
const TEXTO_BAJA = { ninguna: "ninguna", "sin control": "sin control", pendiente: "pendiente", incompleta: "incompleta (falta el motivo)", registrada: "registrada" };

export const estadoTexto = (estado) => ({ alta: TEXTO_ALTA[estado?.alta] ?? "", baja: TEXTO_BAJA[estado?.baja] ?? "" });

export const camposBloqueados = (t) => {
  const altaRegistrada = t?.tregistro?.alta?.estado === "registrada";
  return { documento: altaRegistrada, ingreso: altaRegistrada, cese: t?.tregistro?.baja?.estado === "registrada" };
};

export const puedeDesbloquear = (rol) => rol === "contador";

const TD_CON_PAIS = ["07", "24"];

export const paisEmisorBloqueado = ({ tipoDoc }, bloqueados, desbloqueo) => bloqueados.documento && !desbloqueo && TD_CON_PAIS.includes(tipoDoc);

export const puedeAnularAlta = (rol, t) => rol === "contador" && t?.estado?.alta === "pendiente";

export const puedeNuevoVinculo = (rol, t) => rol === "contador" && (t?.tregistro?.baja?.estado === "registrada" || t?.tregistro?.alta?.estado === "anulada");

const CAMPOS_EDICION = { tipoDoc: "tipo de documento", numDoc: "número de documento", fechaIngreso: "fecha de ingreso", fechaCese: "fecha de cese", "baja.motivo": "motivo de baja", paisEmisor: "país emisor" };

export const lineaEdicion = ({ fecha, por, campos = [] }) => [
  fecha ? formatearFechaHora(fecha, { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }) : "",
  por, campos.map((c) => CAMPOS_EDICION[c] ?? c).join(", "),
].filter(Boolean).join(" · ");

export const requiereEstudios = (situacionEducativa) => ESTUDIOS_SUPERIORES.test(situacionEducativa ?? "");

export const requiereCuenta = (tipoPago) => tipoPago === "2";

const BAJA_GENERABLE = ["pendiente", "incompleta", "sin control"];

// Por selección solo se genera el alta pendiente: la «sin control» se asume hecha a mano y se genera con la acción de su fila.
export const puedeGenerar = (t, tipo) => (tipo === "alta"
  ? t?.estado?.alta === "pendiente"
  : Boolean(t?.fechaCese) && BAJA_GENERABLE.includes(t?.estado?.baja));

export const puedeGenerarAltaSinControl = (t) => t?.estado?.alta === "sin control" && !t.fechaCese && t.estado.baja === "ninguna";

// El servidor rechaza la modificación SCTR con el alta pendiente (va en el archivo de alta) o la baja ya registrada.
export const puedeSctr = (t) => t?.estado?.sctr === "pendiente" && t.estado.alta !== "pendiente" && t.estado.baja !== "registrada";

export const puedeElegir = (t) => puedeGenerar(t, "alta") || puedeGenerar(t, "baja") || puedeMarcar(t, "alta") || puedeSctr(t);

export const idsElegibles = (trabajadores, seleccion, tipo) =>
  trabajadores.filter((t) => seleccion.has(t._id) && puedeGenerar(t, tipo)).map((t) => t._id);

const MARCA_ALTA = ["pendiente", "sin control"];
const MARCA_BAJA = ["pendiente", "sin control"];

// Lo que el servidor acepta en «marcar»: la baja incompleta o con el alta pendiente o anulada se rechaza.
export const puedeMarcar = (t, tipo) => (tipo === "alta"
  ? MARCA_ALTA.includes(t?.estado?.alta)
  : Boolean(t?.fechaCese) && MARCA_BAJA.includes(t?.estado?.baja) && !["pendiente", "anulada"].includes(t?.estado?.alta));

export const idsMarcables = (trabajadores, seleccion, tipo) =>
  trabajadores.filter((t) => seleccion.has(t._id) && puedeMarcar(t, tipo)).map((t) => t._id);

export const idsSctr = (trabajadores, seleccion) =>
  trabajadores.filter((t) => seleccion.has(t._id) && puedeSctr(t)).map((t) => t._id);

const motivoNoMarcable = (t, tipo) => {
  const { alta, baja } = t.estado ?? {};
  if (alta === "anulada") return "su alta fue anulada";
  if (tipo === "alta") return alta === "registrada" ? "su alta ya está registrada" : "";
  if (baja === "registrada") return "la baja ya está registrada";
  if (baja === "incompleta") return "falta el motivo de la baja";
  if (alta === "pendiente") return "su alta sigue pendiente: regístrala primero";
  return baja === "ninguna" || !t.fechaCese ? "no tiene fecha de cese" : "";
};

// Mismas condiciones que puedeSctr; "" si la modificación sí se puede generar o marcar.
export const motivoSinSctr = (t) => {
  if (t?.estado?.sctr !== "pendiente") return "no tiene una modificación de SCTR pendiente";
  if (t.estado.alta === "pendiente") return "su alta sigue pendiente: el SCTR va en el archivo de alta";
  return t.estado.baja === "registrada" ? "la baja ya está registrada" : "";
};

export const excluidosDeMarcar = (trabajadores, seleccion, tipo) => trabajadores
  .filter((t) => seleccion.has(t._id) && !puedeMarcar(t, tipo))
  .map((t) => ({ nombre: t.nombre, motivo: motivoNoMarcable(t, tipo) }));

// El trámite que el usuario suele querer marcar: el alta pendiente, luego la baja pendiente, y al final el alta sin control.
export const tipoMarcarPorDefecto = (trabajadores, seleccion) => {
  const elegidos = trabajadores.filter((t) => seleccion.has(t._id));
  if (elegidos.some((t) => t.estado?.alta === "pendiente")) return "alta";
  if (elegidos.some((t) => t.estado?.baja === "pendiente" && puedeMarcar(t, "baja"))) return "baja";
  return elegidos.some((t) => puedeMarcar(t, "alta")) ? "alta" : "baja";
};

// Acción explícita aparte de «Seleccionar todo»: marca las altas sin control para darlas de alta o marcarlas como registradas.
export const sinControlSeleccionables = (trabajadores) => trabajadores.filter((t) => t.estado?.alta === "sin control");

export const esPendiente = (t) => t?.estado?.alta === "pendiente" || ["pendiente", "incompleta"].includes(t?.estado?.baja) || puedeSctr(t);

// «Seleccionar todo» solo toma lo que tiene un trámite por hacer (incluida la modificación SCTR); las filas sin control se eligen una a una.
export const seleccionablesEnMasa = (trabajadores) =>
  trabajadores.filter((t) => esPendiente(t) && (puedeGenerar(t, "alta") || puedeGenerar(t, "baja") || puedeSctr(t)));

// En una fila sin control el alta no es un trabajo pendiente: sus problemas solo importan si se va a dar de alta.
export const resumenProblemas = (t) => {
  const alta = t.problemasAlta?.length ?? 0;
  const baja = t.problemasBaja?.length ?? 0;
  if (t.estado?.alta === "anulada") return { activos: baja, atenuados: 0 };
  return t.estado?.alta === "sin control" ? { activos: baja, atenuados: alta } : { activos: alta + baja, atenuados: 0 };
};

export const bajasDeAltaSinControl = (trabajadores, ids) => trabajadores
  .filter((t) => ids.includes(t._id) && t.estado?.alta === "sin control").map((t) => t.nombre);

// Los trámites pendientes son del vínculo actual: los de vínculos anteriores ya están cerrados.
const conVinculoEn = (t, periodo) => {
  const mes = `${periodo.slice(0, 4)}-${periodo.slice(4)}`;
  return Boolean(t.fechaIngreso) && t.fechaIngreso <= `${mes}-31` && (!t.fechaCese || t.fechaCese >= `${mes}-01`);
};

export const tramitesPendientesEnMes = (trabajadores, periodo) => trabajadores.filter((t) => conVinculoEn(t, periodo))
  .reduce((n, t) => n + (t.estado?.alta === "pendiente") + ["pendiente", "incompleta"].includes(t.estado?.baja), 0);

const RESERVADOS = ["com", "gob", "gov", "es", "pe"];

// Mismo criterio que el servidor (manual del PVS, estructura E4 campo 12); "" si el correo es válido o está vacío.
export const mensajeCorreo = (correo) => {
  const c = String(correo ?? "").trim();
  if (!c) return "";
  const [usuario = "", resto, ...sobra] = c.split("@");
  const palabras = usuario.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (["no", "tengo", "correo"].every((p) => palabras.includes(p))) return "El correo no puede decir «no tengo correo»: escribe uno real del trabajador.";
  const [servidor = "", dominio = "", subdominio, ...mas] = (resto ?? "").split(".");
  const valido = resto !== undefined && !sobra.length && !mas.length
    && /^[a-z0-9._-]{3,}$/i.test(usuario) && /^[a-z0-9_-]{2,}$/i.test(servidor) && /^[a-z]{2,}$/i.test(dominio)
    && (subdominio === undefined || /^[a-z]{2,}$/i.test(subdominio));
  if (!valido) return "El correo electrónico no es válido: el usuario necesita 3 caracteres o más (letras, números, . _ -), el servidor 2 o más y el dominio solo letras.";
  return RESERVADOS.includes(servidor.toLowerCase()) ? "El servidor del correo no puede ser «com», «gob», «gov», «es» ni «pe»." : "";
};

export const nombreZip = (contentDisposition, tipo) => contentDisposition?.match(/filename="?([^";]+)"?/i)?.[1] ?? `t-registro-${tipo}.zip`;
