// Bloqueos de edición que tiene esta ventana. Al cerrar sesión o cerrar la app
// (Electron) se sueltan todos ANTES de borrar el token: después ya no hay con
// qué autenticar el DELETE y el documento quedaría tomado hasta vencer (2 min).
const activos = new Set();

export const registrarBloqueo = (clave) => { activos.add(clave); };
export const quitarBloqueo = (clave) => { activos.delete(clave); };
export const estaActivo = (clave) => activos.has(clave);

export function soltarTodos({ api, token, fetchImpl = fetch, esperaMaxMs = 1500 }) {
  if (!token || activos.size === 0) return Promise.resolve();
  const claves = [...activos];
  activos.clear();
  const envios = Promise.all(claves.map((c) => Promise.resolve(fetchImpl(`${api}/bloqueos/${c}`, {
    method: "DELETE", keepalive: true, headers: { Authorization: `Bearer ${token}` },
  })).catch(() => null)));
  let espera;
  const limite = new Promise((r) => { espera = setTimeout(r, esperaMaxMs); });
  return Promise.race([envios, limite]).finally(() => clearTimeout(espera));
}
