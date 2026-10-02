// Envía; si la cuenta es un banco y quedaría en negativo (409 SOBREGIRO), pregunta con un diálogo
// propio (nunca window.confirm: en Electron deja el foco congelado) y reintenta confirmando en la
// raíz del body. `enviar(body)` hace el fetch; `confirmar(mensaje)` resuelve true/false.
export async function enviarConSobregiro(enviar, body, confirmar) {
  const res = await enviar(body);
  if (res.status !== 409) return res;
  const data = await res.clone().json().catch(() => ({}));
  if (data.codigo !== "SOBREGIRO" || !(await confirmar(`${data.mensaje}. ¿Registrar de todos modos?`))) return res;
  return enviar({ ...body, confirmarSobregiro: true });
}
