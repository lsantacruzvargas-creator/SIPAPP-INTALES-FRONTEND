export const BASE = import.meta.env.VITE_API_URL || "http://localhost:3002";

export function getToken() {
  return localStorage.getItem("intales_token");
}

export function getUsuario() {
  const u = localStorage.getItem("intales_usuario");
  return u ? JSON.parse(u) : null;
}

export function logout() {
  localStorage.removeItem("intales_token");
  localStorage.removeItem("intales_usuario");
}

export async function fetchAuth(url, options = {}) {
  const token = getToken();
  const headers = { ...(options.headers || {}), Authorization: `Bearer ${token}` };
  if (!(options.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }
  const res = await fetch(`${BASE}${url}`, { ...options, headers });
  if (res.status === 401) {
    logout();
    window.location.hash = "/login";
  }
  return res;
}
