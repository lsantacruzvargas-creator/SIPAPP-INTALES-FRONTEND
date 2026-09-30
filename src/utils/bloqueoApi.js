import { fetchAuth } from "./fetchAuth";
import { cabecerasBloqueo } from "./bloqueo";
import { registrarBloqueo, quitarBloqueo, estaActivo } from "./bloqueosActivos";

export async function tomarBloqueo(entidad, documento) {
  const r = await fetchAuth("/bloqueos", { method: "POST", body: JSON.stringify({ entidad, documento }) });
  const data = await r.clone().json().catch(() => ({}));
  if (r.ok && data.clave) registrarBloqueo(data.clave);
  return { r, data };
}

// alCerrar: la ventana se está cerrando — keepalive deja que la petición salga igual.
// Si ya se soltó (cierre de sesión o de la app), no se envía de nuevo sin token.
export const soltarBloqueo = (clave, { alCerrar = false } = {}) => {
  if (!estaActivo(clave)) return Promise.resolve(null);
  quitarBloqueo(clave);
  return fetchAuth(`/bloqueos/${clave}`, { method: "DELETE", keepalive: alCerrar }).catch(() => null);
};

// Acción puntual sobre un documento que no se está editando (anular, subir un
// archivo, vincular): toma el bloqueo, ejecuta fn(cabeceras) y lo suelta. Si otro
// lo tiene devuelve su respuesta 423 ("En edición por …").
export async function conBloqueo(entidad, documento, fn) {
  const { r, data } = await tomarBloqueo(entidad, documento);
  if (!r.ok) return r;
  try {
    return await fn(cabecerasBloqueo(data.clave), data);
  } finally {
    await soltarBloqueo(data.clave);
  }
}
