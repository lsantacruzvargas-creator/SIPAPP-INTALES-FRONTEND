import { useState, useEffect } from "react";
import { fetchAuth } from "../utils/fetchAuth";

const INP = "border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 w-full transition";
const ROLES_TECNICO = ["tecnico", "tecnico_prueba", "tecnico_intervencion", "supervisor"];

// Notifica trabajo (horas hombre/máquina) en una OT — el supervisor solo
// elige recurso + horas, la tarifa/centro de costo se resuelven solos en el
// backend (ver routes/notificacionesTrabajo.js). Mismo patrón de
// items[] local que ModalRequerimiento.jsx.
export default function ModalNotificacionTrabajo({ ot, onClose, onCreado }) {
  const [tecnicos, setTecnicos] = useState([]);
  const [maquinas, setMaquinas] = useState([]);
  const [items, setItems] = useState([]);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [exito, setExito] = useState("");

  useEffect(() => {
    fetchAuth("/usuarios/lista").then((r) => r.ok && r.json()).then((d) =>
      setTecnicos((d || []).filter((u) => ROLES_TECNICO.includes(u.rol)))
    );
    fetchAuth("/maquinas").then((r) => r.ok && r.json()).then((d) =>
      setMaquinas((d || []).filter((m) => m.activo))
    );
  }, []);

  const agregarLinea = (tipo) => {
    setItems((prev) => [...prev, { key: `${tipo}-${Date.now()}`, tipo, recurso: "", horas: "" }]);
  };

  const actualizarLinea = (key, campo, valor) => {
    setItems((prev) => prev.map((it) => it.key === key ? { ...it, [campo]: valor } : it));
  };

  const quitarLinea = (key) => setItems((prev) => prev.filter((it) => it.key !== key));

  const guardar = async () => {
    if (items.length === 0) { setError("Agrega al menos una línea de horas."); return; }
    for (const it of items) {
      if (!it.recurso) { setError("Selecciona el recurso (técnico o máquina) de todas las líneas."); return; }
      if (!it.horas || Number(it.horas) <= 0) { setError("Ingresa horas válidas en todas las líneas."); return; }
    }
    setGuardando(true);
    setError("");
    const res = await fetchAuth("/notificaciones-trabajo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ordenTrabajo: ot._id,
        items: items.map((it) => ({ tipo: it.tipo, recurso: it.recurso, horas: Number(it.horas) })),
      }),
    });
    if (res.ok) {
      const data = await res.json();
      setExito(`Notificación ${data.codigo} registrada.`);
      setTimeout(() => onCreado(data), 1800);
    } else {
      const d = await res.json().catch(() => ({}));
      setError(d.mensaje || "No se pudo registrar la notificación de trabajo.");
    }
    setGuardando(false);
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <div>
            <h3 className="font-semibold text-gray-800">Nueva notificación de trabajo</h3>
            <p className="text-xs text-gray-400 mt-0.5">{ot.numeroOT || ot.codigo} — {ot.titulo}</p>
          </div>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl leading-none">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <div className="flex gap-2">
            <button type="button" onClick={() => agregarLinea("hombre")}
              className="text-sm border border-orange-300 text-orange-700 px-4 py-2 rounded-lg hover:bg-orange-50 transition font-medium">
              + Agregar técnico
            </button>
            <button type="button" onClick={() => agregarLinea("maquina")}
              className="text-sm border border-orange-300 text-orange-700 px-4 py-2 rounded-lg hover:bg-orange-50 transition font-medium">
              + Agregar máquina
            </button>
          </div>

          <div className="space-y-2">
            {items.length === 0 && (
              <p className="text-sm text-gray-300 text-center py-6">Sin líneas agregadas</p>
            )}
            {items.map((it) => (
              <div key={it.key} className="flex items-center gap-2 border border-gray-100 rounded-xl px-3 py-2.5">
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-orange-50 text-orange-700 shrink-0">
                  {it.tipo === "hombre" ? "HH" : "HM"}
                </span>
                <select value={it.recurso} onChange={(e) => actualizarLinea(it.key, "recurso", e.target.value)}
                  className={`${INP} flex-1`}>
                  <option value="">Seleccionar…</option>
                  {(it.tipo === "hombre" ? tecnicos : maquinas).map((r) => (
                    <option key={r._id} value={r._id}>{r.nombre}</option>
                  ))}
                </select>
                <input type="number" min="0.01" step="0.5" value={it.horas}
                  onChange={(e) => actualizarLinea(it.key, "horas", e.target.value)}
                  onWheel={(e) => e.target.blur()}
                  placeholder="Horas" className="w-24 border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-right" />
                <button type="button" onClick={() => quitarLinea(it.key)} className="text-gray-300 hover:text-red-500 transition shrink-0">✕</button>
              </div>
            ))}
          </div>

          {exito && (
            <div className="bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg px-4 py-3">
              {exito}
            </div>
          )}
          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>

        <div className="flex gap-2 justify-end px-6 py-4 border-t border-gray-100 shrink-0">
          <button type="button" onClick={onClose} disabled={guardando || !!exito}
            className="text-sm border border-gray-300 px-4 py-2 rounded-lg hover:bg-gray-50 transition disabled:opacity-50">
            Cancelar
          </button>
          <button type="button" onClick={guardar} disabled={guardando || !!exito}
            className="text-sm bg-orange-600 text-white px-5 py-2 rounded-lg hover:bg-orange-700 disabled:opacity-50 transition font-medium">
            {guardando ? "Guardando…" : "Notificar trabajo"}
          </button>
        </div>
      </div>
    </div>
  );
}
