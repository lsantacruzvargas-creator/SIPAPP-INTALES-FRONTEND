import { useState, useEffect } from "react";
import { fetchAuth, getUsuario } from "../utils/fetchAuth";
import TablaScroll from "../components/TablaScroll";
import { conBloqueo } from "../utils/bloqueoApi";

const INP = "border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 w-full";

const TIPOS = [
  { valor: "", label: "— (ninguno)" },
  { valor: "material", label: "Compras de materiales" },
  { valor: "servicio", label: "Servicios externos" },
  { valor: "hh", label: "Horas hombre (HH)" },
  { valor: "hm", label: "Horas máquina (HM)" },
];

// "Por defecto para" = el centro que se autoasigna a los pedidos de ese tipo
// (uno solo por tipo: marcar otro desmarca el anterior en el backend). El
// resto son centros libres que se eligen por línea en Compras.
export default function CentrosCosto() {
  const esEditor = ["admin", "jefatura"].includes(getUsuario()?.rol);
  const [centros, setCentros] = useState([]);
  const [nombre, setNombre] = useState("");
  const [tipo, setTipo] = useState("");
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
      body: JSON.stringify({ nombre: nombre.trim(), tipo: tipo || null }),
    });
    if (r.ok) {
      setNombre("");
      setTipo("");
      await cargar();
    } else {
      const d = await r.json().catch(() => ({}));
      setError(d.mensaje || "Error al crear el centro de costo.");
    }
    setGuardando(false);
  };

  const actualizar = async (centro, cambios) => {
    setError("");
    const r = await conBloqueo("centroCosto", centro._id, (h) => fetchAuth(`/centros-costo/${centro._id}`, { method: "PUT", headers: h, body: JSON.stringify(cambios) }));
    if (r.ok) await cargar();
    else {
      const d = await r.json().catch(() => ({}));
      setError(d.mensaje || "No se pudo actualizar el centro de costo.");
    }
  };

  if (!esEditor) {
    return <p className="p-6 text-sm text-gray-400">No tienes permiso para ver esta página.</p>;
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-800">Centros de Costo</h1>
        <p className="text-sm text-gray-400 mt-0.5">
          Crea los centros que necesites (ej. Administración, Taller, Proyecto X). "Por defecto para" indica cuál se asigna solo a cada tipo de pedido.
        </p>
      </div>

      <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm space-y-3">
        {error && <p className="text-sm text-red-500 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
        <div className="flex flex-wrap gap-2">
          <div className="flex-1 min-w-[200px]">
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre del centro de costo" className={INP} />
          </div>
          <select value={tipo} onChange={(e) => setTipo(e.target.value)} className={INP} style={{ maxWidth: 240 }}>
            {TIPOS.map((t) => <option key={t.valor} value={t.valor}>{t.valor ? `Por defecto: ${t.label}` : "Sin uso por defecto"}</option>)}
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
                <th className="text-left py-2 px-4">Por defecto para</th>
                <th className="text-center py-2 px-4">Activo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {centros.map((c) => (
                <tr key={c._id} className={c.activo ? "" : "opacity-50"}>
                  <td className="py-2 px-4 text-gray-800 font-medium">{c.nombre}</td>
                  <td className="py-2 px-4">
                    <select value={c.tipo || ""} onChange={(e) => actualizar(c, { tipo: e.target.value || null })}
                      className="border border-gray-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-300">
                      {TIPOS.map((t) => <option key={t.valor} value={t.valor}>{t.label}</option>)}
                    </select>
                  </td>
                  <td className="py-2 px-4 text-center">
                    <button onClick={() => actualizar(c, { activo: !c.activo })}
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
