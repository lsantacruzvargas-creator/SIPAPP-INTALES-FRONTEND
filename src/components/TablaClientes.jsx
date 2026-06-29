import { useState, useEffect } from "react";
import { fetchAuth, getUsuario } from "../utils/fetchAuth.js";

const VACIO = { razonSocial: "", ruc: "", contacto: "", telefono: "", email: "" };

export default function TablaClientes() {
  const usuario = getUsuario();
  const puedeEditar = ["admin", "ejecutivo", "encargado"].includes(usuario?.rol);

  const [clientes, setClientes] = useState([]);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(VACIO);
  const [editando, setEditando] = useState(null);
  const [error, setError] = useState("");
  const [busqueda, setBusqueda] = useState("");

  const cargar = () => fetchAuth("/api/clientes").then(r => r.json()).then(setClientes);
  useEffect(() => { cargar(); }, []);

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const abrir = (cliente = null) => {
    setEditando(cliente?._id || null);
    setForm(cliente ? { razonSocial: cliente.razonSocial, ruc: cliente.ruc || "", contacto: cliente.contacto || "", telefono: cliente.telefono || "", email: cliente.email || "" } : VACIO);
    setError("");
    setModal(true);
  };

  const guardar = async (e) => {
    e.preventDefault();
    setError("");
    const url = editando ? `/api/clientes/${editando}` : "/api/clientes";
    const method = editando ? "PUT" : "POST";
    const res = await fetchAuth(url, { method, body: JSON.stringify(form) });
    const data = await res.json();
    if (!res.ok) { setError(data.error); return; }
    setModal(false);
    await cargar();
  };

  const filtrados = clientes.filter(c =>
    !busqueda || c.razonSocial?.toLowerCase().includes(busqueda.toLowerCase()) || c.ruc?.includes(busqueda)
  );

  return (
    <div className="p-4 max-w-5xl mx-auto">
      {modal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md">
            <div className="flex justify-between items-center mb-4">
              <h2 className="font-bold text-lg text-gray-800">{editando ? "Editar cliente" : "Nuevo cliente"}</h2>
              <button onClick={() => setModal(false)} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
            </div>
            <form onSubmit={guardar} className="space-y-3">
              <div>
                <label className="label">Razón Social *</label>
                <input name="razonSocial" value={form.razonSocial} onChange={handleChange} className="input-field" required placeholder="Nombre de la empresa" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">RUC</label>
                  <input name="ruc" value={form.ruc} onChange={handleChange} className="input-field" placeholder="20XXXXXXXXX" />
                </div>
                <div>
                  <label className="label">Teléfono</label>
                  <input name="telefono" value={form.telefono} onChange={handleChange} className="input-field" placeholder="9XXXXXXXX" />
                </div>
              </div>
              <div>
                <label className="label">Contacto</label>
                <input name="contacto" value={form.contacto} onChange={handleChange} className="input-field" placeholder="Nombre del contacto" />
              </div>
              <div>
                <label className="label">Email</label>
                <input name="email" type="email" value={form.email} onChange={handleChange} className="input-field" placeholder="contacto@empresa.com" />
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
        <h1 className="text-2xl font-bold text-gray-800">Clientes / Empresas</h1>
        {puedeEditar && <button onClick={() => abrir()} className="btn-primary">+ Nuevo cliente</button>}
      </div>

      <input
        value={busqueda}
        onChange={e => setBusqueda(e.target.value)}
        className="input-field max-w-xs mb-4"
        placeholder="Buscar por nombre o RUC..."
      />

      <div className="overflow-x-auto rounded-xl border border-gray-100 shadow-sm">
        <table className="w-full text-sm bg-white">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="text-left px-4 py-3 font-semibold text-gray-500 text-xs uppercase">Código</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-500 text-xs uppercase">Razón Social</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-500 text-xs uppercase">RUC</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-500 text-xs uppercase">Contacto</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-500 text-xs uppercase">Teléfono</th>
              {puedeEditar && <th className="px-4 py-3"></th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {filtrados.map(c => (
              <tr key={c._id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-mono text-xs text-gray-500">{c.codigo}</td>
                <td className="px-4 py-3 font-medium text-gray-800">{c.razonSocial}</td>
                <td className="px-4 py-3 text-gray-500">{c.ruc || "—"}</td>
                <td className="px-4 py-3 text-gray-500">{c.contacto || "—"}</td>
                <td className="px-4 py-3 text-gray-500">{c.telefono || "—"}</td>
                {puedeEditar && (
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => abrir(c)} className="text-blue-500 hover:text-blue-700 text-xs">Editar</button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-gray-400 mt-2">{filtrados.length} cliente{filtrados.length !== 1 ? "s" : ""}</p>
    </div>
  );
}
