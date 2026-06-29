import { useState, useEffect } from "react";
import { fetchAuth } from "../utils/fetchAuth.js";

const ROLES = ["admin", "ejecutivo", "encargado", "tecnico"];
const ROL_LABEL = { admin: "Admin", ejecutivo: "Ejecutivo", encargado: "Encargado", tecnico: "Técnico" };
const ROL_BADGE = {
  admin: "bg-purple-100 text-purple-700",
  ejecutivo: "bg-blue-100 text-blue-700",
  encargado: "bg-teal-100 text-teal-700",
  tecnico: "bg-orange-100 text-orange-700",
};
const VACIO = { nombre: "", usuario: "", password: "", rol: "ejecutivo", activo: true };

export default function GestionUsuarios() {
  const [usuarios, setUsuarios] = useState([]);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(VACIO);
  const [editando, setEditando] = useState(null);
  const [error, setError] = useState("");

  const cargar = () => fetchAuth("/api/usuarios").then(r => r.json()).then(setUsuarios);
  useEffect(() => { cargar(); }, []);

  const handleChange = (e) => {
    const val = e.target.type === "checkbox" ? e.target.checked : e.target.value;
    setForm({ ...form, [e.target.name]: val });
  };

  const abrir = (u = null) => {
    setEditando(u?._id || null);
    setForm(u ? { nombre: u.nombre, usuario: u.usuario, password: "", rol: u.rol, activo: u.activo } : VACIO);
    setError("");
    setModal(true);
  };

  const guardar = async (e) => {
    e.preventDefault();
    setError("");
    const body = { ...form };
    if (!body.password) delete body.password;
    const url = editando ? `/api/usuarios/${editando}` : "/api/usuarios";
    const method = editando ? "PUT" : "POST";
    const res = await fetchAuth(url, { method, body: JSON.stringify(body) });
    const data = await res.json();
    if (!res.ok) { setError(data.error); return; }
    setModal(false);
    await cargar();
  };

  return (
    <div className="p-4 max-w-4xl mx-auto">
      {modal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md">
            <div className="flex justify-between items-center mb-4">
              <h2 className="font-bold text-lg text-gray-800">{editando ? "Editar usuario" : "Nuevo usuario"}</h2>
              <button onClick={() => setModal(false)} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
            </div>
            <form onSubmit={guardar} className="space-y-3">
              <div>
                <label className="label">Nombre completo *</label>
                <input name="nombre" value={form.nombre} onChange={handleChange} className="input-field" required placeholder="Nombre apellido" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Usuario *</label>
                  <input name="usuario" value={form.usuario} onChange={handleChange} className="input-field" required placeholder="nombre.usuario" disabled={!!editando} />
                </div>
                <div>
                  <label className="label">{editando ? "Nueva contraseña" : "Contraseña *"}</label>
                  <input name="password" type="password" value={form.password} onChange={handleChange} className="input-field" required={!editando} placeholder={editando ? "Dejar en blanco para no cambiar" : "••••••••"} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Rol *</label>
                  <select name="rol" value={form.rol} onChange={handleChange} className="input-field">
                    {ROLES.map(r => <option key={r} value={r}>{ROL_LABEL[r]}</option>)}
                  </select>
                </div>
                {editando && (
                  <div className="flex items-end pb-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" name="activo" checked={form.activo} onChange={handleChange} className="w-4 h-4" />
                      <span className="text-sm text-gray-600">Usuario activo</span>
                    </label>
                  </div>
                )}
              </div>
              {error && <p className="text-red-600 text-sm">{error}</p>}
              <div className="flex gap-3 justify-end pt-2">
                <button type="button" onClick={() => setModal(false)} className="btn-secondary">Cancelar</button>
                <button type="submit" className="btn-primary">Guardar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="flex justify-between items-center mb-5">
        <h1 className="text-2xl font-bold text-gray-800">Usuarios</h1>
        <button onClick={() => abrir()} className="btn-primary">+ Nuevo usuario</button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-100 shadow-sm">
        <table className="w-full text-sm bg-white">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="text-left px-4 py-3 font-semibold text-gray-500 text-xs uppercase">Nombre</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-500 text-xs uppercase">Usuario</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-500 text-xs uppercase">Rol</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-500 text-xs uppercase">Estado</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {usuarios.map(u => (
              <tr key={u._id} className={`hover:bg-gray-50 ${!u.activo ? "opacity-50" : ""}`}>
                <td className="px-4 py-3 font-medium text-gray-800">{u.nombre}</td>
                <td className="px-4 py-3 font-mono text-gray-500">{u.usuario}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${ROL_BADGE[u.rol]}`}>{ROL_LABEL[u.rol]}</span>
                </td>
                <td className="px-4 py-3">
                  <span className={`text-xs font-medium ${u.activo ? "text-green-600" : "text-gray-400"}`}>
                    {u.activo ? "Activo" : "Inactivo"}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => abrir(u)} className="text-blue-500 hover:text-blue-700 text-xs">Editar</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
