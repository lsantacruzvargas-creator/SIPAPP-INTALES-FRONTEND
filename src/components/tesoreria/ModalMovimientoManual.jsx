import { useState } from "react";
import { fetchAuth } from "../../utils/fetchAuth";
import { fechaHoyLima } from "../../utils/fecha";
import { CONCEPTOS_MANUALES, textoCuenta } from "../../utils/tesoreria";
import { enviarConSobregiro } from "../../utils/sobregiro";
import useConfirmar from "../../hooks/useConfirmar";

const INP = "border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300 w-full";
const MEDIOS = [
  { valor: "efectivo", label: "Efectivo" }, { valor: "transferencia", label: "Transferencia" },
  { valor: "deposito", label: "Depósito" }, { valor: "cheque", label: "Cheque" },
];
const TITULOS = { ingreso: "Ingreso manual", egreso: "Egreso manual", transferencia: "Transferencia entre cuentas" };

// Dinero sin comprobante (aporte, préstamo, retiro, gasto bancario, otros) o transferencia entre
// cuentas propias de la misma moneda. `modo`: "manual" (ingreso/egreso) o "transferencia".
export default function ModalMovimientoManual({ modo, cuentas, onClose, onGuardado }) {
  const activas = cuentas.filter((c) => c.activo);
  const [form, setForm] = useState({
    tipo: modo === "transferencia" ? "transferencia" : "ingreso", cuenta: "", cuentaDestino: "", conceptoManual: "aporte",
    descripcion: "", monto: "", fecha: fechaHoyLima(), medio: modo === "transferencia" ? "transferencia" : "efectivo", numeroOperacion: "",
  });
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const { confirmar, dialogo } = useConfirmar();
  const set = (campo) => (e) => setForm((f) => ({ ...f, [campo]: e.target.value }));
  const esTransferencia = form.tipo === "transferencia";
  const origen = activas.find((c) => c._id === form.cuenta);
  const destinos = activas.filter((c) => c._id !== form.cuenta && (!origen || (c.moneda || "PEN") === (origen.moneda || "PEN")));
  const faltaDescripcion = !esTransferencia && form.conceptoManual === "otros" && !form.descripcion.trim();
  const listo = form.cuenta && (!esTransferencia || form.cuentaDestino) && Number(form.monto) > 0 && form.fecha && !faltaDescripcion;

  const guardar = async () => {
    setGuardando(true);
    setError("");
    const { tipo, conceptoManual, cuentaDestino, ...comun } = form;
    const body = { ...comun, monto: Number(form.monto) };
    const ruta = esTransferencia ? "/movimientos-tesoreria/transferencia" : "/movimientos-tesoreria/manual";
    if (esTransferencia) body.cuentaDestino = cuentaDestino;
    else Object.assign(body, { tipo, conceptoManual });
    try {
      const r = await enviarConSobregiro((b) => fetchAuth(ruta, { method: "POST", body: JSON.stringify(b) }), body, confirmar);
      const data = await r.json().catch(() => ({}));
      if (!r.ok) return setError(data.mensaje || "No se pudo registrar el movimiento.");
      onGuardado(data);
    } catch {
      setError("Error de conexión con el servidor: verifica en Movimientos si quedó registrado antes de reintentar.");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4" style={{ zIndex: 60 }}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 space-y-4">
        <h3 className="text-lg font-bold text-gray-800">{TITULOS[form.tipo]}</h3>
        {!esTransferencia && (
          <div className="flex gap-3 text-sm">
            {["ingreso", "egreso"].map((t) => (
              <label key={t} className="flex items-center gap-1.5">
                <input type="radio" checked={form.tipo === t} onChange={() => setForm((f) => ({ ...f, tipo: t }))} />{t === "ingreso" ? "Ingreso" : "Egreso"}
              </label>
            ))}
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs text-gray-500 col-span-2">{esTransferencia ? "Cuenta de origen" : "Cuenta"}
            <select value={form.cuenta} onChange={(e) => setForm((f) => ({ ...f, cuenta: e.target.value, cuentaDestino: "" }))} className={INP}>
              <option value="">Elegir…</option>
              {activas.map((c) => <option key={c._id} value={c._id}>{textoCuenta(c)}</option>)}
            </select>
          </label>
          {esTransferencia ? (
            <label className="text-xs text-gray-500 col-span-2">Cuenta de destino (misma moneda)
              <select value={form.cuentaDestino} onChange={set("cuentaDestino")} className={INP}>
                <option value="">Elegir…</option>
                {destinos.map((c) => <option key={c._id} value={c._id}>{textoCuenta(c)}</option>)}
              </select>
            </label>
          ) : (
            <label className="text-xs text-gray-500 col-span-2">Concepto
              <select value={form.conceptoManual} onChange={set("conceptoManual")} className={INP}>
                {CONCEPTOS_MANUALES.map((c) => <option key={c.valor} value={c.valor}>{c.label}</option>)}
              </select>
            </label>
          )}
          <label className="text-xs text-gray-500">Monto{origen ? ` (${origen.moneda || "PEN"})` : ""}
            <input type="number" min="0" step="0.01" value={form.monto} onChange={set("monto")} className={INP} />
          </label>
          <label className="text-xs text-gray-500">Fecha
            <input type="date" value={form.fecha} onChange={set("fecha")} className={INP} />
          </label>
          <label className="text-xs text-gray-500">Medio
            <select value={form.medio} onChange={set("medio")} className={INP}>
              {MEDIOS.map((m) => <option key={m.valor} value={m.valor}>{m.label}</option>)}
            </select>
          </label>
          <label className="text-xs text-gray-500">N° de operación
            <input value={form.numeroOperacion} onChange={set("numeroOperacion")} className={INP} />
          </label>
          <label className="text-xs text-gray-500 col-span-2">Descripción{form.conceptoManual === "otros" && !esTransferencia ? " (obligatoria)" : ""}
            <input value={form.descripcion} maxLength={250} onChange={set("descripcion")} className={INP} />
          </label>
        </div>
        {origen?.moneda === "USD" && <p className="text-[11px] text-gray-500">En dólares se registra con el TC SUNAT del día de la fecha.</p>}
        {error && <p className="text-xs text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} disabled={guardando} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Cancelar</button>
          <button onClick={guardar} disabled={guardando || !listo}
            className="bg-purple-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-50">
            {guardando ? "Guardando…" : "Registrar"}
          </button>
        </div>
      </div>
      {dialogo}
    </div>
  );
}
