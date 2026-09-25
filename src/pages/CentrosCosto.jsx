import { useState, useEffect } from "react";
import { fetchAuth, getUsuario } from "../utils/fetchAuth";
import TablaScroll from "../components/TablaScroll";

const INP = "border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 w-full";

const TIPOS = [
  { valor: "material", label: "Compras Materiales" },
  { valor: "servicio", label: "Servicios Externos" },
  { valor: "hh", label: "Horas Hombre (HH)" },
  { valor: "hm", label: "Horas Máquina (HM)" },
];

// Catálogo semilla (ver seedCentrosCosto.js) — admin puede agregar más del
// mismo `tipo` si más adelante quieren subdividir (ej. "HH Taller"/"HH
// Campo") sin tocar código, ver spec 2026-09-22.
export default function CentrosCosto() {
  const esAdmin = getUsuario()?.rol === "admin";
  const [centros, setCentros] = useState([]);
  const [nombre, setNombre] = useState("");
  const [tipo, setTipo] = useState("material");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  const cargar = () => fetchAuth("/centros-costo").then((r) => r.ok && r.json()).then((d) => setCentros(d || []));
  useEffect(() => { cargar(); }, []);

  const crear = async () => {
    if (!nombre.trim()) return setError("Ingresa un nombre.");
    setGuardando(true);
    setError("");
    const r = await fetchAuth("/centros-costo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nombre: nombre.trim(), tipo }),
    });
    if (r.ok) {
      setNombre("");
      await cargar();
    } else {
      const d = await r.json().catch(() => ({}));
      setError(d.mensaje || "Error al crear el centro de costo.");
    }
    setGuardando(false);
  };

  const toggleActivo = async (centro) => {
    const r = await fetchAuth(`/centros-costo/${centro._id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ activo: !centro.activo }),
    });
    if (r.ok) await cargar();
  };

  if (!esAdmin) {
    return <p className="p-6 text-sm text-gray-400">No tenés permiso para ver esta página.</p>;
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-800">Centros de Costo</h1>
        <p className="text-sm text-gray-400 mt-0.5">Catálogo usado para etiquetar el costo de materiales, servicios, horas hombre y horas máquina por OT</p>
      </div>

      <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm space-y-3">
        {error && <p className="text-sm text-red-500 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
        <div className="flex gap-2">
          <input value={nombre} onChange={(e) => setNombre(e.target.value)}
            placeholder="Nombre del centro de costo" className={INP} />
          <select value={tipo} onChange={(e) => setTipo(e.target.value)} className={INP} style={{ maxWidth: 220 }}>
            {TIPOS.map((t) => <option key={t.valor} value={t.valor}>{t.label}</option>)}
          </select>
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
                <th className="text-left py-2 px-4">Tipo</th>
                <th className="text-center py-2 px-4">Activo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {centros.map((c) => (
                <tr key={c._id} className={c.activo ? "" : "opacity-50"}>
                  <td className="py-2 px-4 text-gray-800 font-medium">{c.nombre}</td>
                  <td className="py-2 px-4 text-gray-500">{TIPOS.find((t) => t.valor === c.tipo)?.label || c.tipo}</td>
                  <td className="py-2 px-4 text-center">
                    <button onClick={() => toggleActivo(c)}
                      className={`text-xs font-medium px-2.5 py-0.5 rounded-full transition ${c.activo ? "bg-green-100 text-green-700 hover:bg-green-200" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}>
                      {c.activo ? "Activo" : "Inactivo"}
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
