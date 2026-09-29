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
