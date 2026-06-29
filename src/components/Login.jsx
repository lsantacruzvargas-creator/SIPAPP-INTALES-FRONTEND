import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { BASE } from "../utils/fetchAuth.js";

export default function Login() {
  const [form, setForm] = useState({ usuario: "", password: "" });
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);
  const navigate = useNavigate();

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!form.usuario.trim() || !form.password) {
      setError("Completa usuario y contraseña");
      return;
    }

    setCargando(true);
    try {
      const res = await fetch(`${BASE}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usuario: form.usuario.trim(), password: form.password }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Error al ingresar"); return; }
      localStorage.setItem("intales_token", data.token);
      localStorage.setItem("intales_usuario", JSON.stringify(data.usuario));
      navigate("/ots");
    } catch {
      setError("No se pudo conectar con el servidor. Verifica que el backend esté corriendo.");
    } finally {
      setCargando(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-900 to-blue-700">
      <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-blue-700 rounded-full flex items-center justify-center mx-auto mb-3">
            <span className="text-white text-2xl font-bold">I</span>
          </div>
          <h1 className="text-xl font-bold text-gray-800">INTALES</h1>
          <p className="text-gray-400 text-sm mt-1">Sistema de Gestión de OTs</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">Usuario</label>
            <input
              name="usuario"
              value={form.usuario}
              onChange={handleChange}
              className="input-field"
              placeholder="nombre de usuario"
              autoComplete="username"
              autoFocus
            />
          </div>
          <div>
            <label className="label">Contraseña</label>
            <input
              name="password"
              type="password"
              value={form.password}
              onChange={handleChange}
              className="input-field"
              placeholder="••••••••"
              autoComplete="current-password"
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-lg">
              {error}
            </div>
          )}

          <button type="submit" disabled={cargando} className="btn-primary w-full py-3">
            {cargando ? "Ingresando..." : "Ingresar"}
          </button>
        </form>
      </div>
    </div>
  );
}
