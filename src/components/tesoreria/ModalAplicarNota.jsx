import { useState } from "react";
import { fetchAuth } from "../../utils/fetchAuth";
import { money, round2 } from "../../utils/compras";
import { etiquetaComprobante } from "../../utils/tesoreria";

const INP = "border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300 w-full";

// Aplicar el saldo a favor de una nota de crédito a otro comprobante del mismo
// proveedor y moneda (no anulado, que no sea otra NC y con saldo pendiente).
export default function ModalAplicarNota({ nota, facturas, onClose, onAplicada }) {
  const destinos = facturas.filter((f) => String(f.proveedor?._id || f.proveedor) === String(nota.proveedor?._id || nota.proveedor)
    && f.moneda === nota.moneda && !f.anulada && f.tipoComprobante !== "07" && f.saldoNeto > 0.009);
  const [destino, setDestino] = useState("");
  const [monto, setMonto] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  const elegir = (e) => {
    const d = destinos.find((f) => f._id === e.target.value);
    setDestino(e.target.value);
    setMonto(d ? String(round2(Math.min(nota.saldoAFavor, d.saldoNeto))) : "");
  };

  const aplicar = async () => {
    setGuardando(true);
    setError("");
    try {
      const r = await fetchAuth(`/facturas-proveedor/${nota._id}/aplicar`, { method: "POST", body: JSON.stringify({ documento: destino, monto: Number(monto) }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setError(d.mensaje || "No se pudo aplicar la nota de crédito."); return; }
      onAplicada(d);
    } catch {
      setError("Error de conexión con el servidor.");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
        <h3 className="text-lg font-bold text-gray-800">Aplicar nota de crédito {nota.serie}-{nota.numero}</h3>
        <p className="text-sm text-gray-600">Saldo a favor: <b>{money(nota.saldoAFavor, nota.moneda)}</b> · {nota.proveedorRazonSocial}</p>
        {destinos.length === 0 ? (
          <p className="text-sm text-gray-400">Este proveedor no tiene comprobantes con saldo en {nota.moneda}.</p>
        ) : (
          <>
            <label className="text-xs text-gray-500 block">Comprobante
              <select value={destino} onChange={elegir} className={INP}>
                <option value="">Elegir…</option>
                {destinos.map((f) => <option key={f._id} value={f._id}>{etiquetaComprobante(f)} — saldo {money(f.saldoNeto, f.moneda)}</option>)}
              </select>
            </label>
            <label className="text-xs text-gray-500 block">Monto a aplicar
              <input type="number" step="0.01" min="0" value={monto} onChange={(e) => setMonto(e.target.value)} className={INP} />
            </label>
          </>
        )}
        {error && <p className="text-xs text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} disabled={guardando} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Cancelar</button>
          <button onClick={aplicar} disabled={guardando || !destino || !(Number(monto) > 0)}
            className="bg-purple-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-50">
            {guardando ? "Aplicando…" : "Aplicar"}
          </button>
        </div>
      </div>
    </div>
  );
}
