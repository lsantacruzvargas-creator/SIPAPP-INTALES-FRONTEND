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

// Tomar es asíncrono: si mientras tanto se cerró el formulario o se pasó a otra
// fila, la respuesta ya no aplica (y el bloqueo obtenido hay que soltarlo).
export const tomaVigente = ({ documentoPedido, documentoActual }) => documentoPedido === documentoActual;

// Estado de la barra tras consultar si el documento está tomado. Si la consulta
// falla la barra no se queda en "cargando": muestra el motivo y deja reintentar.
export function resultadoConsulta({ ok, status, data, errorRed = false }) {
  const prefijo = "No se pudo verificar si alguien está editando";
  if (errorRed) return { estado: "error", mensaje: `${prefijo} (sin conexión con el servidor).` };
  if (!ok) return { estado: "error", mensaje: `${prefijo}: ${data?.mensaje || `error ${status}`}.` };
  if (data.ocupado) return { estado: "ocupado", mensaje: mensajeOcupado(data) };
  return { estado: "lectura", mensaje: "" };
}

// Mientras se edita, un 423 al guardar solo puede significar que el bloqueo propio
// venció (PC suspendida, red caída): se avisa en el acto, sin esperar al latido.
// Los cambios siguen en pantalla; "Editar" vuelve a tomarlo si nadie lo cambió.
export function edicionPerdida({ editando, status, data }) {
  if (!editando || status !== 423) return null;
  const base = "Tu edición se liberó (el bloqueo venció) y no se guardó.";
  if (data?.mensaje?.startsWith("En edición por")) return `${base} ${data.mensaje}.`;
  return `${base} Pulsa «Editar» para volver a tomarlo: tus cambios siguen en pantalla.`;
}
