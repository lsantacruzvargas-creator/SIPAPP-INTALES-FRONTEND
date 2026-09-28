import { useState } from "react";
import { fetchAuth } from "../../utils/fetchAuth";
import { money } from "../../utils/compras";
import { calcularImpuesto, partes, CODIGOS_DETRACCION } from "../../utils/tesoreria";

const INP = "border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300 w-full";

// Solo mientras la factura no tenga cobros (el backend lo valida también).
export default function ModalImpuestoVenta({ factura, onClose, onGuardada }) {
  const [form, setForm] = useState({
    tipo: factura.impuesto?.tipo || "ninguno",
    codigoSunat: factura.impuesto?.codigoSunat || "037",
    quienDeposita: factura.impuesto?.quienDeposita === "nosotros" ? "nosotros" : "cliente",
  });
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const set = (campo) => (e) => setForm((f) => ({ ...f, [campo]: e.target.value }));

  const { monto } = calcularImpuesto({ tipo: form.tipo, codigoSunat: form.codigoSunat, total: factura.total });
  const quien = form.tipo === "detraccion" ? form.quienDeposita : "cliente";
  const { neto } = partes({ lado: "venta", total: factura.total, impuesto: { tipo: form.tipo, monto, quienDeposita: quien } });

  const guardar = async () => {
    setGuardando(true);
    setError("");
    try {
      const r = await fetchAuth(`/facturas/${factura._id}/impuesto`, { method: "PATCH", body: JSON.stringify({ ...form, quienDeposita: quien }) });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) return setError(data.mensaje || "No se pudo cambiar el impuesto.");
      onGuardada(data);
    } catch {
      setError("Error de conexión con el servidor, intenta de nuevo.");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4" style={{ zIndex: 60 }}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
        <h3 className="text-lg font-bold text-gray-800">Impuesto de {factura.numeroFactura || factura.codigo}</h3>
        <label className="text-xs text-gray-500 block">Tipo
          <select value={form.tipo} onChange={set("tipo")} className={INP}>
            <option value="ninguno">Ninguno</option><option value="detraccion">Detracción</option><option value="retencion">Retención 3 % (cliente agente)</option>
          </select>
        </label>
        {form.tipo === "detraccion" && (
          <>
            <label className="text-xs text-gray-500 block">Bien o servicio
              <select value={form.codigoSunat} onChange={set("codigoSunat")} className={INP}>
                {CODIGOS_DETRACCION.map((c) => <option key={c.codigo} value={c.codigo}>{c.codigo} — {c.descripcion} ({c.porcentaje}%)</option>)}
              </select>
            </label>
            <label className="text-xs text-gray-500 block">¿Quién deposita?
              <select value={form.quienDeposita} onChange={set("quienDeposita")} className={INP}>
                <option value="cliente">El cliente (nos paga el neto)</option>
                <option value="nosotros">Nosotros (el cliente pagó el total)</option>
              </select>
            </label>
          </>
        )}
        <div className="flex justify-between text-sm border-t border-gray-100 pt-3">
          <span>Impuesto {money(monto)}</span>
          <span className="font-bold text-emerald-700">Neto a cobrar {money(neto)}</span>
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Cancelar</button>
          <button onClick={guardar} disabled={guardando} className="bg-purple-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-50">
            {guardando ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}
