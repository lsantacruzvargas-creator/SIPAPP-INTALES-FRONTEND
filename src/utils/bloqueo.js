// Espejo del mensaje del backend (utils/bloqueo.js) para el estado consultado.
const horaLima = (d) => new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(d));

export function mensajeOcupado({ ocupado = true, usuarioNombre, tomadoEn, propio }) {
  if (!ocupado) return "";
  if (propio) return "En edición por ti en otra ventana";
  return `En edición por ${usuarioNombre} desde las ${horaLima(tomadoEn)}`;
}

export const ACTIVIDAD_RECIENTE_MS = 60 * 1000;
export const huboActividad = (ultimaMs, ahoraMs) => ahoraMs - ultimaMs < ACTIVIDAD_RECIENTE_MS;

export function avisoDeRespuesta(status, data) {
  if (status === 423) return { tipo: "ocupado", mensaje: data?.mensaje || "El documento lo está editando otra persona" };
  if (status === 409 && data?.cambio) return { tipo: "cambio", mensaje: data.mensaje };
  return null;
}

export const cabecerasBloqueo = (clave, version) => ({ "X-Bloqueo": clave, ...(version ? { "X-Version": version } : {}) });

// Qué versión anotar tras una escritura propia exitosa. Editando, la releída (nadie
// más pudo escribir). Desde lectura (bloqueo temporal) solo si al tomarlo el documento
// seguía igual al del formulario; si no, se conserva la vieja para que "Editar" avise
// que cambió — adoptar la nueva dejaría guardar un formulario viejo encima de otro.
export function versionTrasAccion({ editando, versionFormulario, versionTomada, versionNueva }) {
  if (editando || versionTomada === versionFormulario) return versionNueva;
  return versionFormulario;
}

// Formularios abiertos desde el "Editar" de una fila: se toman solos una vez al
// abrir. "marcar" = se abrió ocupado: cuando se libere queda el botón "Editar"
// (no se retoma solo, quien esperaba puede haberse ido y lo dejaría tomado).
export function pasoAutoEditar({ autoEditar, estado, intentado, documento }) {
  if (!autoEditar || !documento || intentado === documento) return null;
  if (estado === "lectura") return "editar";
  if (estado === "ocupado") return "marcar";
  return null;
}
