import { useState } from "react";
import { fetchAuth } from "../../utils/fetchAuth";
import SelectorTipoArticulo from "../SelectorTipoArticulo";

const INP = "border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300 w-full";
const lineaVacia = () => ({ key: `${Date.now()}-${Math.random()}`, tipo: "material", tipoArticulo: "", descripcion: "", cantidad: "", unidad: "und", centroCosto: "" });

// SC sin OT (gastos generales): el centro de costo es obligatorio por
// línea porque no hay OT de la cual deducirlo.
export default function ModalNuevaSC({ catalogos, onTipoCreado, onClose, onCreada }) {
  const [lineas, setLineas] = useState(() => [lineaVacia()]);
  const [observaciones, setObservaciones] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [exito, setExito] = useState("");

  const cambiar = (key, campo, valor) => setLineas((prev) => prev.map((l) => (l.key === key ? { ...l, [campo]: valor } : l)));
  const quitar = (key) => setLineas((prev) => prev.filter((l) => l.key !== key));

  const guardar = async () => {
    for (const [i, l] of lineas.entries()) {
      if (!l.descripcion.trim()) return setError(`Línea ${i + 1}: falta la descripción.`);
      if (!(Number(l.cantidad) > 0)) return setError(`Línea ${i + 1}: ingresa una cantidad válida.`);
      if (!l.centroCosto) return setError(`Línea ${i + 1}: elige el centro de costo.`);
    }
    setGuardando(true);
    setError("");
    const r = await fetchAuth("/solicitudes-compra", {
      method: "POST",
      body: JSON.stringify({
        observaciones,
        items: lineas.map((l) => ({
          tipo: l.tipo, descripcion: l.descripcion, unidad: l.unidad, cantidad: Number(l.cantidad),
          centroCosto: l.centroCosto, tipoArticulo: l.tipoArticulo || null,
        })),
      }),
    });
    setGuardando(false);
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      return setError(d.mensaje || "No se pudo crear la solicitud.");
    }
    const sc = await r.json();
    setExito(`Solicitud ${sc.codigo} creada.`);
    setTimeout(onCreada, 1500);
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <div>
            <h3 className="font-semibold text-gray-800">Nueva solicitud de compra</h3>
            <p className="text-xs text-gray-400 mt-0.5">Sin OT — gastos generales (oficina, EPPs, herramientas…)</p>
          </div>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl leading-none">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-3">
          <div className="hidden md:grid grid-cols-[110px_180px_1fr_80px_80px_170px_24px] gap-2 text-[11px] uppercase tracking-wide text-gray-400">
            <span>Tipo</span><span>Tipo de artículo</span><span>Descripción *</span><span>Cant. *</span><span>Und.</span><span>Centro de costo *</span><span />
          </div>
          {lineas.map((l) => (
            <div key={l.key} className="grid grid-cols-1 md:grid-cols-[110px_180px_1fr_80px_80px_170px_24px] gap-2 items-start">
              <select value={l.tipo} onChange={(e) => cambiar(l.key, "tipo", e.target.value)} className={INP}>
                <option value="material">Material</option>
                <option value="servicio">Servicio</option>
              </select>
              <SelectorTipoArticulo value={l.tipoArticulo} tipos={catalogos.tiposArticulo} onTipoCreado={onTipoCreado}
                onChange={(id) => cambiar(l.key, "tipoArticulo", id)} placeholder="Opcional" />
              <input value={l.descripcion} onChange={(e) => cambiar(l.key, "descripcion", e.target.value)} className={INP} placeholder="Ej: Guantes de nitrilo talla M" />
              <input type="number" min="0.01" step="any" value={l.cantidad} onChange={(e) => cambiar(l.key, "cantidad", e.target.value)} className={INP} />
              <input value={l.unidad} onChange={(e) => cambiar(l.key, "unidad", e.target.value)} className={INP} />
              <select value={l.centroCosto} onChange={(e) => cambiar(l.key, "centroCosto", e.target.value)} className={INP}>
                <option value="">Elegir…</option>
                {catalogos.centrosCosto.map((c) => <option key={c._id} value={c._id}>{c.nombre}</option>)}
              </select>
              <button type="button" onClick={() => quitar(l.key)} disabled={lineas.length === 1}
                className="text-gray-300 hover:text-red-500 disabled:opacity-30 pt-1.5">✕</button>
            </div>
          ))}
          <button type="button" onClick={() => setLineas((prev) => [...prev, lineaVacia()])}
            className="text-sm text-purple-600 hover:text-purple-800">+ Agregar línea</button>

          <div>
            <label className="text-xs text-gray-500 block mb-1">Observaciones</label>
            <textarea value={observaciones} onChange={(e) => setObservaciones(e.target.value)} rows={2} className={INP} />
          </div>

          {exito && <div className="bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg px-4 py-3">{exito}</div>}
          {error && <p className="text-sm text-red-500">{error}</p>}
        </div>

        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100 shrink-0">
          <button type="button" onClick={onClose} disabled={guardando || !!exito}
            className="text-sm border border-gray-300 px-4 py-2 rounded-lg hover:bg-gray-50 transition disabled:opacity-50">Cancelar</button>
          <button type="button" onClick={guardar} disabled={guardando || !!exito}
            className="text-sm bg-purple-600 text-white px-5 py-2 rounded-lg hover:bg-purple-700 disabled:opacity-50 transition font-medium">
            {guardando ? "Guardando…" : "Crear solicitud"}
          </button>
        </div>
      </div>
    </div>
  );
}
