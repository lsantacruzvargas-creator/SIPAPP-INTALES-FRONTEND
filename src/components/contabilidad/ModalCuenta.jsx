import { useState } from "react";
import { fetchAuth } from "../../utils/fetchAuth";
import { conBloqueo } from "../../utils/bloqueoApi";
import BuscadorCuenta from "./BuscadorCuenta";

const INP = "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300";

// Crear (con `padre` opcional) o editar (`cuenta`) una cuenta. El código no se edita.
export default function ModalCuenta({ cuenta, padre, cuentas, onClose, onGuardada }) {
  const editando = !!cuenta;
  const [form, setForm] = useState(() => ({
    codigo: cuenta?.codigo || padre?.codigo || "",
    nombre: cuenta?.nombre || "",
    naturaleza: cuenta?.naturaleza || padre?.naturaleza || "",
    exigeCentroCosto: !!cuenta?.exigeCentroCosto,
    exigeTercero: cuenta ? !!cuenta.exigeTercero : !!padre?.exigeTercero,
    destinoDebe: (cuenta || padre)?.destino?.debe || "",
    destinoHaber: (cuenta || padre)?.destino?.haber || "",
  }));
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));
  const esGasto = /^6/.test(form.codigo);

  const guardar = async () => {
    setError("");
    setGuardando(true);
    const cuerpo = {
      nombre: form.nombre, exigeCentroCosto: form.exigeCentroCosto, exigeTercero: form.exigeTercero,
      ...(form.naturaleza ? { naturaleza: form.naturaleza } : {}),
      ...(esGasto ? { destino: { debe: form.destinoDebe, haber: form.destinoHaber } } : {}),
    };
    try {
      const r = editando
        ? await conBloqueo("cuentaContable", cuenta._id, (h) => fetchAuth(`/contabilidad/cuentas/${cuenta._id}`, { method: "PUT", headers: h, body: JSON.stringify(cuerpo) }))
        : await fetchAuth("/contabilidad/cuentas", { method: "POST", body: JSON.stringify({ ...cuerpo, codigo: form.codigo.trim() }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) return setError(d.mensaje || "No se pudo guardar la cuenta.");
      onGuardada(d);
    } catch {
      setError("Error de conexión con el servidor.");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-lg space-y-4">
        <h3 className="font-semibold text-gray-800">
          {editando ? `Editar cuenta ${cuenta.codigo}` : padre ? `Nueva subcuenta de ${padre.codigo} ${padre.nombre}` : "Nueva cuenta"}
        </h3>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-gray-500">Código</label>
            <input value={form.codigo} onChange={set("codigo")} disabled={editando} inputMode="numeric" className={`${INP} font-mono disabled:bg-gray-50`} />
          </div>
          <div className="col-span-2">
            <label className="text-xs text-gray-500">Nombre</label>
            <input value={form.nombre} onChange={set("nombre")} className={INP} autoFocus />
          </div>
          <div>
            <label className="text-xs text-gray-500">Naturaleza</label>
            <select value={form.naturaleza} onChange={set("naturaleza")} className={INP}>
              {!editando && <option value="">La del padre</option>}
              <option value="deudora">Deudora</option>
              <option value="acreedora">Acreedora</option>
            </select>
          </div>
          <label className="text-sm text-gray-600 flex items-center gap-1.5 mt-5">
            <input type="checkbox" checked={form.exigeCentroCosto} onChange={set("exigeCentroCosto")} /> Exige centro de costo
          </label>
          <label className="text-sm text-gray-600 flex items-center gap-1.5 mt-5">
            <input type="checkbox" checked={form.exigeTercero} onChange={set("exigeTercero")} /> Exige tercero
          </label>
        </div>
        {esGasto && (
          <div>
            <p className="text-xs text-gray-500 mb-1">Destino (gastos de la clase 6: lo propone el asiento automático, editable)</p>
            <div className="grid grid-cols-2 gap-3">
              <BuscadorCuenta cuentas={cuentas} valor={form.destinoDebe} onChange={(v) => setForm((f) => ({ ...f, destinoDebe: v }))} placeholder="Debe (9x)" />
              <BuscadorCuenta cuentas={cuentas} valor={form.destinoHaber} onChange={(v) => setForm((f) => ({ ...f, destinoHaber: v }))} placeholder="Haber (79)" />
            </div>
          </div>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-3">
          <button onClick={onClose} disabled={guardando} className="border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm hover:bg-gray-50">Cancelar</button>
          <button onClick={guardar} disabled={guardando || !form.nombre.trim() || !form.codigo.trim()}
            className="bg-purple-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-purple-700 disabled:opacity-50">
            {guardando ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}
