import { useState, useEffect } from "react";
import { fetchAuth } from "../../utils/fetchAuth";
import { fechaHoyLima } from "../../utils/fecha";

const INP = "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300";
const MEDIOS = [["transferencia", "Transferencia"], ["deposito", "Depósito"], ["efectivo", "Efectivo"], ["cheque", "Cheque"]];

// Movimiento de banco sin documento (modo "libre") o transferencia entre cuentas propias.
export default function ModalMovimientoBanco({ modo, cuentas, cuentaInicial, centrosCosto, onClose, onGuardado }) {
  const [tipos, setTipos] = useState([]);
  const [form, setForm] = useState({
    cuenta: cuentaInicial || "", cuentaDestino: "", tipoMovimiento: "", fecha: fechaHoyLima(), monto: "",
    medio: "transferencia", numeroOperacion: "", glosa: "", centroCosto: "",
  });
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const libre = modo === "libre";
  const activas = cuentas.filter((c) => c.activo && c.tipo !== "detracciones");

  useEffect(() => {
    if (!libre) return;
    fetchAuth("/bancos/tipos-movimiento").then(async (r) => { if (r.ok) setTipos((await r.json()).filter((t) => t.activo)); }).catch(() => {});
  }, [libre]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const origen = cuentas.find((c) => c._id === form.cuenta);
  const destinos = activas.filter((c) => c._id !== form.cuenta && (!origen || c.moneda === origen.moneda));
  const tipo = tipos.find((t) => t._id === form.tipoMovimiento);

  const guardar = async () => {
    setError("");
    setGuardando(true);
    try {
      const body = libre
        ? { cuenta: form.cuenta, tipoMovimiento: form.tipoMovimiento, fecha: form.fecha, monto: form.monto, medio: form.medio,
            numeroOperacion: form.numeroOperacion, glosa: form.glosa, centroCosto: form.centroCosto || null }
        : { cuenta: form.cuenta, cuentaDestino: form.cuentaDestino, fecha: form.fecha, monto: form.monto, medio: form.medio,
            numeroOperacion: form.numeroOperacion, glosa: form.glosa };
      const r = await fetchAuth(libre ? "/bancos/movimientos" : "/bancos/transferencias", { method: "POST", body: JSON.stringify(body) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) return setError(d.mensaje || "No se pudo registrar.");
      onGuardado(d);
    } catch {
      setError("Error de conexión: revisa el libro de la cuenta antes de reintentar.");
    } finally {
      setGuardando(false);
    }
  };

  const listo = form.cuenta && form.fecha && Number(form.monto) > 0 && (libre ? form.tipoMovimiento && form.glosa.trim() : form.cuentaDestino);
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-xl space-y-4">
        <h3 className="font-semibold text-gray-800">{libre ? "Movimiento de banco sin documento" : "Transferencia entre cuentas propias"}</h3>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs text-gray-500">{libre ? "Cuenta" : "Cuenta de origen"}
            <select value={form.cuenta} onChange={(e) => setForm((f) => ({ ...f, cuenta: e.target.value, cuentaDestino: "" }))} className={INP}>
              <option value="">Elige…</option>
              {activas.map((c) => <option key={c._id} value={c._id}>{c.nombre} ({c.moneda})</option>)}
            </select>
          </label>
          {libre ? (
            <label className="text-xs text-gray-500">Tipo de movimiento
              <select value={form.tipoMovimiento} onChange={set("tipoMovimiento")} className={INP}>
                <option value="">Elige…</option>
                {["egreso", "ingreso"].map((lado) => (
                  <optgroup key={lado} label={lado === "egreso" ? "Egresos (salen de la cuenta)" : "Ingresos (entran a la cuenta)"}>
                    {tipos.filter((t) => t.lado === lado).map((t) => <option key={t._id} value={t._id}>{t.nombre}</option>)}
                  </optgroup>
                ))}
              </select>
            </label>
          ) : (
            <label className="text-xs text-gray-500">Cuenta de destino
              <select value={form.cuentaDestino} onChange={set("cuentaDestino")} className={INP}>
                <option value="">Elige…</option>
                {destinos.map((c) => <option key={c._id} value={c._id}>{c.nombre} ({c.moneda})</option>)}
              </select>
            </label>
          )}
          <label className="text-xs text-gray-500">Fecha
            <input type="date" value={form.fecha} onChange={set("fecha")} className={INP} />
          </label>
          <label className="text-xs text-gray-500">Monto {origen ? `(${origen.moneda === "USD" ? "US$" : "S/"})` : ""}
            <input value={form.monto} onChange={set("monto")} inputMode="decimal" className={`${INP} text-right`} />
          </label>
          <label className="text-xs text-gray-500">Medio
            <select value={form.medio} onChange={set("medio")} className={INP}>{MEDIOS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          </label>
          <label className="text-xs text-gray-500">N° de operación
            <input value={form.numeroOperacion} onChange={set("numeroOperacion")} className={INP} />
          </label>
          <label className="text-xs text-gray-500 col-span-2">Glosa {libre ? "" : "(opcional)"}
            <input value={form.glosa} onChange={set("glosa")} placeholder={libre ? "Ej.: Comisión de mantenimiento setiembre" : ""} className={INP} />
          </label>
          {libre && (
            <label className="text-xs text-gray-500 col-span-2">Centro de costo (opcional)
              <select value={form.centroCosto} onChange={set("centroCosto")} className={INP}>
                <option value="">—</option>
                {centrosCosto.map((c) => <option key={c._id} value={c._id}>{c.nombre}</option>)}
              </select>
            </label>
          )}
        </div>
        {tipo && <p className={`text-xs ${tipo.lado === "egreso" ? "text-red-600" : "text-emerald-700"}`}>{tipo.lado === "egreso" ? "Sale de la cuenta" : "Entra a la cuenta"}</p>}
        {origen?.moneda === "USD" && <p className="text-[11px] text-gray-400">En dólares se valoriza al TC SUNAT de la fecha.</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-3">
          <button onClick={onClose} disabled={guardando} className="border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm hover:bg-gray-50">Cancelar</button>
          <button onClick={guardar} disabled={guardando || !listo} className="bg-purple-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-purple-700 disabled:opacity-50">
            {guardando ? "Guardando…" : "Registrar"}
          </button>
        </div>
      </div>
    </div>
  );
}
