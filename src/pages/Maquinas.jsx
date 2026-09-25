import { useState, useEffect } from "react";
import { fetchAuth, getUsuario } from "../utils/fetchAuth";
import TablaScroll from "../components/TablaScroll";

const INP = "border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 w-full";

// A diferencia de Centros de Costo, acá jefatura también gestiona — es quien
// mantiene la tarifa por hora de cada máquina (ver spec 2026-09-22).
export default function Maquinas() {
  const rolActual = getUsuario()?.rol;
  const puedeGestionar = ["admin", "jefatura"].includes(rolActual);
  const [maquinas, setMaquinas] = useState([]);
  const [nombre, setNombre] = useState("");
  const [tarifaHora, setTarifaHora] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [editandoTarifa, setEditandoTarifa] = useState({});

  const cargar = () => fetchAuth("/maquinas").then((r) => r.ok && r.json()).then((d) => setMaquinas(d || []));
  useEffect(() => { cargar(); }, []);

  const crear = async () => {
    if (!nombre.trim()) return setError("Ingresa un nombre.");
    setGuardando(true);
    setError("");
    const r = await fetchAuth("/maquinas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nombre: nombre.trim(), tarifaHora: Number(tarifaHora) || 0 }),
    });
    if (r.ok) {
      setNombre(""); setTarifaHora("");
      await cargar();
    } else {
      const d = await r.json().catch(() => ({}));
      setError(d.mensaje || "Error al crear la máquina.");
    }
    setGuardando(false);
  };

  const guardarTarifa = async (maquina) => {
    const valor = Number(editandoTarifa[maquina._id]);
    if (isNaN(valor) || valor < 0) return;
    const r = await fetchAuth(`/maquinas/${maquina._id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tarifaHora: valor }),
    });
    if (r.ok) {
      setEditandoTarifa((prev) => { const next = { ...prev }; delete next[maquina._id]; return next; });
      await cargar();
    }
  };

  const toggleActivo = async (maquina) => {
    const r = await fetchAuth(`/maquinas/${maquina._id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ activo: !maquina.activo }),
    });
    if (r.ok) await cargar();
  };

  if (!puedeGestionar) {
    return <p className="p-6 text-sm text-gray-400">No tenés permiso para ver esta página.</p>;
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-800">Máquinas</h1>
        <p className="text-sm text-gray-400 mt-0.5">Catálogo de equipos del taller y su costo por hora (horas máquina)</p>
      </div>

      <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm space-y-3">
        {error && <p className="text-sm text-red-500 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
        <div className="flex gap-2">
          <input value={nombre} onChange={(e) => setNombre(e.target.value)}
            placeholder="Ej. Torno CNC 01" className={INP} />
          <input type="number" min="0" step="0.01" value={tarifaHora} onChange={(e) => setTarifaHora(e.target.value)}
            placeholder="Tarifa/hora" className={INP} style={{ maxWidth: 140 }} />
          <button onClick={crear} disabled={guardando}
            className="shrink-0 text-sm bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition font-medium">
            {guardando ? "Creando…" : "+ Agregar"}
          </button>
        </div>
      </div>

      <div className="bg-white border border-gray-100 rounded-2xl shadow-sm">
        <TablaScroll className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs uppercase tracking-wide text-gray-400 border-b border-gray-100">
              <tr>
                <th className="text-left py-2 px-4">Nombre</th>
                <th className="text-left py-2 px-4">Tarifa/hora (S/)</th>
                <th className="text-center py-2 px-4">Activo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {maquinas.map((m) => (
                <tr key={m._id} className={m.activo ? "" : "opacity-50"}>
                  <td className="py-2 px-4 text-gray-800 font-medium">{m.nombre}</td>
                  <td className="py-2 px-4">
                    <div className="flex items-center gap-2">
                      <input type="number" min="0" step="0.01"
                        value={editandoTarifa[m._id] ?? m.tarifaHora}
                        onChange={(e) => setEditandoTarifa((prev) => ({ ...prev, [m._id]: e.target.value }))}
                        className="w-24 border border-gray-200 rounded-lg px-2 py-1 text-sm text-right" />
                      {editandoTarifa[m._id] !== undefined && Number(editandoTarifa[m._id]) !== m.tarifaHora && (
                        <button onClick={() => guardarTarifa(m)}
                          className="text-xs text-blue-600 hover:text-blue-800 underline">Guardar</button>
                      )}
                    </div>
                  </td>
                  <td className="py-2 px-4 text-center">
                    <button onClick={() => toggleActivo(m)}
                      className={`text-xs font-medium px-2.5 py-0.5 rounded-full transition ${m.activo ? "bg-green-100 text-green-700 hover:bg-green-200" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}>
                      {m.activo ? "Activo" : "Inactivo"}
                    </button>
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
