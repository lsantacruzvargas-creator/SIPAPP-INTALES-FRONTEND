import { useState, useEffect } from "react";
import { fetchAuth, getUsuario } from "../utils/fetchAuth";
import PromptAccion from "./PromptAccion";

const INP = "border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 w-full transition";
const ROLES_TECNICO = ["tecnico", "tecnico_prueba", "tecnico_intervencion", "supervisor"];

const money = (v) => "S/ " + Number(v ?? 0).toLocaleString("es-PE", { minimumFractionDigits: 2 });

// Detalle de una Notificación de Trabajo ya guardada — jefatura puede
// reabrirla (estado "abierta") y anular líneas puntuales; el supervisor,
// una vez abierta, sigue agregando líneas hasta volver a guardar (ver spec
// 2026-09-22, decisión #10).
export default function ModalDetalleNotificacionTrabajo({ notificacion: inicial, onClose, onActualizada }) {
  const rolActual = getUsuario()?.rol;
  const puedeGestionar = ["admin", "jefatura"].includes(rolActual);
  const puedeEditar = ["admin", "supervisor"].includes(rolActual);

  const [notificacion, setNotificacion] = useState(inicial);
  const [tecnicos, setTecnicos] = useState([]);
  const [maquinas, setMaquinas] = useState([]);
  const [nuevasLineas, setNuevasLineas] = useState([]);
  const [confirmandoAnular, setConfirmandoAnular] = useState(null);
  const [anulando, setAnulando] = useState(false);
  const [abriendo, setAbriendo] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (notificacion.estado !== "abierta" || !puedeEditar) return;
    fetchAuth("/usuarios/lista").then((r) => r.ok && r.json()).then((d) =>
      setTecnicos((d || []).filter((u) => ROLES_TECNICO.includes(u.rol)))
    );
    fetchAuth("/maquinas").then((r) => r.ok && r.json()).then((d) =>
      setMaquinas((d || []).filter((m) => m.activo))
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notificacion.estado]);

  const abrir = async () => {
    setAbriendo(true);
    const r = await fetchAuth(`/notificaciones-trabajo/${notificacion._id}/abrir`, { method: "PATCH" });
    if (r.ok) {
      const actualizada = await r.json();
      setNotificacion(actualizada);
      onActualizada(actualizada);
    }
    setAbriendo(false);
  };

  const anular = async (motivo) => {
    setAnulando(true);
    const r = await fetchAuth(`/notificaciones-trabajo/${notificacion._id}/items/${confirmandoAnular._id}/anular`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ motivo }),
    });
    setAnulando(false);
    setConfirmandoAnular(null);
    if (r.ok) {
      const actualizada = await r.json();
      setNotificacion(actualizada);
      onActualizada(actualizada);
    }
  };

  const agregarLinea = (tipo) => {
    setNuevasLineas((prev) => [...prev, { key: `${tipo}-${Date.now()}`, tipo, recurso: "", horas: "" }]);
  };
  const actualizarLinea = (key, campo, valor) => {
    setNuevasLineas((prev) => prev.map((it) => it.key === key ? { ...it, [campo]: valor } : it));
  };
  const quitarLinea = (key) => setNuevasLineas((prev) => prev.filter((it) => it.key !== key));

  const guardar = async () => {
    if (nuevasLineas.length === 0) { setError("Agrega al menos una línea nueva antes de guardar."); return; }
    for (const it of nuevasLineas) {
      if (!it.recurso) { setError("Selecciona el recurso de todas las líneas nuevas."); return; }
      if (!it.horas || Number(it.horas) <= 0) { setError("Ingresa horas válidas en todas las líneas nuevas."); return; }
    }
    setGuardando(true);
    setError("");
    const items = [
      ...notificacion.items.map((it) => ({ _id: it._id })),
      ...nuevasLineas.map((it) => ({ tipo: it.tipo, recurso: it.recurso, horas: Number(it.horas) })),
    ];
    const r = await fetchAuth(`/notificaciones-trabajo/${notificacion._id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items }),
    });
    if (r.ok) {
      const actualizada = await r.json();
      setNotificacion(actualizada);
      onActualizada(actualizada);
      setNuevasLineas([]);
    } else {
      const d = await r.json().catch(() => ({}));
      setError(d.mensaje || "No se pudo guardar.");
    }
    setGuardando(false);
  };

  const totalActivo = notificacion.items.filter((it) => !it.anulado).reduce((s, it) => s + it.costoTotal, 0);

  return (
    <>
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <div>
            <h3 className="font-semibold text-gray-800">{notificacion.codigo}</h3>
            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded mt-0.5 inline-block ${notificacion.estado === "abierta" ? "bg-amber-100 text-amber-700" : "bg-gray-100 text-gray-600"}`}>
              {notificacion.estado === "abierta" ? "Abierta" : "Cerrada"}
            </span>
          </div>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl leading-none">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-2">
          {notificacion.items.map((it) => (
            <div key={it._id} className={`flex items-center gap-3 border border-gray-100 rounded-xl px-3 py-2.5 ${it.anulado ? "opacity-50" : ""}`}>
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-orange-50 text-orange-700 shrink-0">
                {it.tipo === "hombre" ? "HH" : "HM"}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-800 truncate">{it.recursoNombre}</p>
                <p className="text-xs text-gray-400">
                  {it.horas} h × {money(it.tarifaHora)} = {money(it.costoTotal)}
                  {it.anulado && <span className="text-red-500"> — anulada{it.motivoAnulacion ? `: ${it.motivoAnulacion}` : ""}</span>}
                </p>
              </div>
              {puedeGestionar && !it.anulado && (
                <button type="button" onClick={() => setConfirmandoAnular(it)}
                  className="text-xs text-gray-400 hover:text-red-500 transition shrink-0">
                  Anular
                </button>
              )}
            </div>
          ))}

          <p className="text-sm font-semibold text-gray-700 text-right pt-2">Total: {money(totalActivo)}</p>

          {notificacion.estado === "abierta" && puedeEditar && (
            <div className="border-t border-gray-100 pt-4 mt-4 space-y-3">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Agregar líneas</p>
              <div className="flex gap-2">
                <button type="button" onClick={() => agregarLinea("hombre")}
                  className="text-sm border border-orange-300 text-orange-700 px-4 py-2 rounded-lg hover:bg-orange-50 transition font-medium">
                  + Técnico
                </button>
                <button type="button" onClick={() => agregarLinea("maquina")}
                  className="text-sm border border-orange-300 text-orange-700 px-4 py-2 rounded-lg hover:bg-orange-50 transition font-medium">
                  + Máquina
                </button>
              </div>
              {nuevasLineas.map((it) => (
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
              {error && <p className="text-xs text-red-500">{error}</p>}
              {nuevasLineas.length > 0 && (
                <button type="button" onClick={guardar} disabled={guardando}
                  className="text-sm bg-orange-600 text-white px-4 py-2 rounded-lg hover:bg-orange-700 disabled:opacity-50 transition font-medium">
                  {guardando ? "Guardando…" : "Guardar líneas nuevas"}
                </button>
              )}
            </div>
          )}
        </div>

        <div className="flex gap-2 justify-end px-6 py-4 border-t border-gray-100 shrink-0">
          {puedeGestionar && notificacion.estado === "cerrada" && (
            <button type="button" onClick={abrir} disabled={abriendo}
              className="text-sm border border-amber-300 text-amber-700 px-4 py-2 rounded-lg hover:bg-amber-50 disabled:opacity-50 transition font-medium">
              {abriendo ? "Abriendo…" : "Reabrir"}
            </button>
          )}
          <button type="button" onClick={onClose}
            className="text-sm border border-gray-300 px-4 py-2 rounded-lg hover:bg-gray-50 transition">
            Cerrar
          </button>
        </div>
      </div>
    </div>

    {confirmandoAnular && (
      <PromptAccion
        titulo={`Anular línea de ${confirmandoAnular.recursoNombre}`}
        label="Motivo de anulación"
        onCancelar={() => setConfirmandoAnular(null)}
        onConfirmar={anular}
        procesando={anulando}
        textoConfirmar="Anular"
      />
    )}
    </>
  );
}
