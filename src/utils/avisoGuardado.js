const METODOS_ESCRITURA = ["POST", "PUT", "PATCH", "DELETE"];

// Una escritura exitosa avisa al menú y a las alertas para que se refresquen.
// sinAvisoGuardado: llamadas que no cambian datos (tomar, latido y soltar del
// bloqueo de edición) — si no, cada latido recargaría el menú cada 60 s.
export const avisaGuardado = (ok, { method, sinAvisoGuardado } = {}) =>
  ok && METODOS_ESCRITURA.includes(method) && !sinAvisoGuardado;
