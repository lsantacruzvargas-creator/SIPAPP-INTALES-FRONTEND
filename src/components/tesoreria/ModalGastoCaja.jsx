import { useState } from "react";
import { fetchAuth } from "../../utils/fetchAuth";
import { fechaHoyLima } from "../../utils/fecha";
import { TIPOS_GASTO, conComprobante, erroresGasto } from "../../utils/cajaChica";

const INP = "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300";

// Gasto pagado con la caja chica (boleta, ticket, movilidad, vale…).
export default function ModalGastoCaja({ caja, centrosCosto, onClose, onGuardado }) {
  const [g, setG] = useState({
    fecha: fechaHoyLima(), tipoComprobante: "03", serie: "", numero: "", numDoc: "", nombre: "", trabajador: "",
    descripcion: "", monto: "", centroCosto: "", cuentaContable: "",
  });
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const set = (k) => (e) => setG((x) => ({ ...x, [k]: e.target.value }));
  const errores = erroresGasto(g, { tope: caja.cajaChica.topeGasto, saldo: caja.resumen.saldo });
  const tocado = g.monto !== "" || g.descripcion !== "";

  const guardar = async () => {
    setError("");
    setGuardando(true);
    try {
      const r = await fetchAuth(`/caja-chica/${caja._id}/gastos`, {
        method: "POST",
        body: JSON.stringify({
          fecha: g.fecha, tipoComprobante: g.tipoComprobante, serie: g.serie, numero: g.numero,
          proveedor: { numDoc: g.numDoc.trim(), nombre: g.nombre }, trabajador: g.trabajador, descripcion: g.descripcion,
          monto: g.monto, centroCosto: g.centroCosto || null, cuentaContable: g.cuentaContable.trim(),
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) return setError(d.mensaje || "No se pudo registrar el gasto.");
      onGuardado(d);
    } catch {
      setError("Error de conexión: revisa la lista de gastos antes de reintentar.");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-2xl space-y-4">
        <h3 className="font-semibold text-gray-800">Gasto de {caja.nombre}</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <label className="text-xs text-gray-500">Fecha<input type="date" value={g.fecha} onChange={set("fecha")} className={INP} /></label>
          <label className="text-xs text-gray-500">Comprobante
            <select value={g.tipoComprobante} onChange={set("tipoComprobante")} className={INP}>
              {TIPOS_GASTO.map((t) => <option key={t.valor} value={t.valor}>{t.label}</option>)}
            </select>
          </label>
          <label className="text-xs text-gray-500">Monto (S/)<input value={g.monto} onChange={set("monto")} inputMode="decimal" className={`${INP} text-right`} /></label>
          {conComprobante(g.tipoComprobante) && (
            <>
              <label className="text-xs text-gray-500">Serie<input value={g.serie} onChange={set("serie")} className={INP} /></label>
              <label className="text-xs text-gray-500">Número<input value={g.numero} onChange={set("numero")} className={INP} /></label>
              <label className="text-xs text-gray-500">RUC / DNI del emisor<input value={g.numDoc} onChange={set("numDoc")} inputMode="numeric" className={INP} /></label>
              <label className="text-xs text-gray-500 md:col-span-3">Razón social / nombre<input value={g.nombre} onChange={set("nombre")} className={INP} /></label>
            </>
          )}
          {g.tipoComprobante === "MV" && (
            <label className="text-xs text-gray-500 md:col-span-3">Trabajador<input value={g.trabajador} onChange={set("trabajador")} className={INP} /></label>
          )}
          <label className="text-xs text-gray-500 col-span-2 md:col-span-3">Descripción
            <input value={g.descripcion} onChange={set("descripcion")} placeholder="Qué se compró o pagó y para qué" className={INP} />
          </label>
          <label className="text-xs text-gray-500">Centro de costo (opcional)
            <select value={g.centroCosto} onChange={set("centroCosto")} className={INP}>
              <option value="">—</option>
              {centrosCosto.map((c) => <option key={c._id} value={c._id}>{c.nombre}</option>)}
            </select>
          </label>
          <label className="text-xs text-gray-500">Cuenta contable (opcional)
            <input value={g.cuentaContable} onChange={set("cuentaContable")} inputMode="numeric" className={`${INP} font-mono`} />
          </label>
        </div>
        {g.tipoComprobante === "01" && (
          <p className="text-xs text-amber-700">Así la factura no da crédito fiscal. Para usar el IGV, regístrala en Por pagar como comprobante de compra con «Ya se pagó» desde esta caja chica.</p>
        )}
        <p className="text-[11px] text-gray-400">
          Saldo de la caja: S/ {caja.resumen.saldo.toFixed(2)}{caja.cajaChica.topeGasto ? ` · tope por gasto: S/ ${caja.cajaChica.topeGasto.toFixed(2)}` : ""}
        </p>
        {tocado && errores.length > 0 && <ul className="text-xs text-red-600 list-disc pl-5">{errores.map((e) => <li key={e}>{e}</li>)}</ul>}
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-3">
          <button onClick={onClose} disabled={guardando} className="border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm hover:bg-gray-50">Cancelar</button>
          <button onClick={guardar} disabled={guardando || errores.length > 0} className="bg-purple-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-purple-700 disabled:opacity-50">
            {guardando ? "Guardando…" : "Registrar gasto"}
          </button>
        </div>
      </div>
    </div>
  );
}
