import { useState, useEffect } from "react";
import { fetchAuth, getUsuario } from "../utils/fetchAuth";
import TablaScroll from "../components/TablaScroll";

// Página aparte de Usuarios.jsx (admin-only a nivel de ruta) — jefatura
// necesita mantener la tarifa/hora de los técnicos sin abrirle el resto de
// la gestión de cuentas (rol, contraseña, etc.), ver spec 2026-09-22.
const ROLES_TECNICO = ["tecnico", "tecnico_prueba", "tecnico_intervencion", "supervisor"];

export default function TarifasPersonal() {
  const puedeGestionar = ["admin", "jefatura"].includes(getUsuario()?.rol);
  const [usuarios, setUsuarios] = useState([]);
  const [editando, setEditando] = useState({});

  const cargar = () => fetchAuth("/usuarios/lista").then((r) => r.ok && r.json())
    .then((d) => setUsuarios((d || []).filter((u) => ROLES_TECNICO.includes(u.rol))));
  useEffect(() => { cargar(); }, []);

  const guardar = async (usuario) => {
    const valor = Number(editando[usuario._id]);
    if (isNaN(valor) || valor < 0) return;
    const r = await fetchAuth(`/usuarios/${usuario._id}/tarifa-hora`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tarifaHora: valor }),
    });
    if (r.ok) {
      setEditando((prev) => { const next = { ...prev }; delete next[usuario._id]; return next; });
      await cargar();
    }
  };

  if (!puedeGestionar) {
    return <p className="p-6 text-sm text-gray-400">No tenés permiso para ver esta página.</p>;
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-800">Tarifas de Personal</h1>
        <p className="text-sm text-gray-400 mt-0.5">Costo por hora de cada técnico, usado al notificar trabajo (horas hombre) en una OT</p>
      </div>

      <div className="bg-white border border-gray-100 rounded-2xl shadow-sm">
        <TablaScroll className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs uppercase tracking-wide text-gray-400 border-b border-gray-100">
              <tr>
                <th className="text-left py-2 px-4">Nombre</th>
                <th className="text-left py-2 px-4">Rol</th>
                <th className="text-left py-2 px-4">Tarifa/hora (S/)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {usuarios.length === 0 ? (
                <tr><td colSpan={3} className="px-4 py-8 text-center text-gray-400">Sin técnicos registrados</td></tr>
              ) : usuarios.map((u) => (
                <tr key={u._id}>
                  <td className="py-2 px-4 text-gray-800 font-medium">{u.nombre}</td>
                  <td className="py-2 px-4 text-gray-500 capitalize">{u.rol}</td>
                  <td className="py-2 px-4">
                    <div className="flex items-center gap-2">
                      <input type="number" min="0" step="0.01"
                        value={editando[u._id] ?? u.tarifaHora ?? 0}
                        onChange={(e) => setEditando((prev) => ({ ...prev, [u._id]: e.target.value }))}
                        className="w-24 border border-gray-200 rounded-lg px-2 py-1 text-sm text-right" />
                      {editando[u._id] !== undefined && Number(editando[u._id]) !== (u.tarifaHora ?? 0) && (
                        <button onClick={() => guardar(u)}
                          className="text-xs text-blue-600 hover:text-blue-800 underline">Guardar</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TablaScroll>
      </div>
    </div>
  );
}
