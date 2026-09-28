import { useState, useEffect } from "react";
import { fetchAuth } from "../../utils/fetchAuth";
import { fechaHoyLima } from "../../utils/fecha";
import { money } from "../../utils/compras";
import { cuentasPara, tipoMovimientoEsperado, etiquetaImpuesto, avisoMoneda } from "../../utils/tesoreria";

const INP = "border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300 w-full";
const MEDIOS = [
  { valor: "transferencia", label: "Transferencia" }, { valor: "deposito", label: "Depósito" },
  { valor: "efectivo", label: "Efectivo" }, { valor: "cheque", label: "Cheque" },
];

// Registra un pago (compras) o cobro (ventas) de UNA parte del comprobante:
// el neto o el impuesto (detracción / retención), cada una con su saldo.
export default function ModalMovimiento({ lado, documento, onClose, onGuardado }) {
  const d = documento;
  const moneda = d.moneda || "PEN";
  const concepto0 = d.saldoNeto > 0.009 ? "neto" : "impuesto";
  const [cuentas, setCuentas] = useState([]);
  const [form, setForm] = useState({
    concepto: concepto0, monto: String(concepto0 === "neto" ? d.saldoNeto : d.saldoImpuesto), fecha: fechaHoyLima(),
    cuenta: "", cuentaDestino: "", medio: "transferencia", numeroOperacion: "",
  });
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchAuth("/cuentas-tesoreria").then(async (r) => { if (r.ok) setCuentas(await r.json()); });
  }, []);

  const set = (campo) => (e) => setForm((f) => ({ ...f, [campo]: e.target.value }));
  const elegirConcepto = (concepto) => setForm((f) => ({
    ...f, concepto, cuenta: "", cuentaDestino: "", monto: String(concepto === "neto" ? d.saldoNeto : d.saldoImpuesto),
  }));

  const tipo = tipoMovimientoEsperado({ lado, concepto: form.concepto, impuesto: d.impuesto });
  const { origen, destino } = cuentasPara({ cuentas, lado, concepto: form.concepto, impuesto: d.impuesto });
  const esDetraccion = form.concepto === "impuesto" && d.impuesto?.tipo === "detraccion";
  const etiquetaOperacion = tipo === "retencion" ? "N° de comprobante de retención"
    : esDetraccion ? "N° de constancia de depósito" : "N° de operación";
  const verbo = lado === "compra" ? "pago" : "cobro";
  const aviso = tipo === "retencion" ? null
    : avisoMoneda(cuentas.find((c) => c._id === form.cuenta), form.concepto === "neto" ? moneda : "PEN");

  const guardar = async () => {
    setGuardando(true);
    setError("");
    const body = {
      documento: { tipo: lado === "compra" ? "facturaProveedor" : "facturaVenta", id: d._id },
      concepto: form.concepto, monto: Number(form.monto), fecha: form.fecha, medio: form.medio, numeroOperacion: form.numeroOperacion,
    };
    if (tipo !== "retencion") body.cuenta = form.cuenta;
    if (tipo === "transferencia") body.cuentaDestino = form.cuentaDestino;
    try {
      const r = await fetchAuth("/movimientos-tesoreria", { method: "POST", body: JSON.stringify(body) });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) return setError(data.mensaje || `No se pudo registrar el ${verbo}.`);
      onGuardado(data);
    } catch {
      setError("Error de conexión con el servidor: el pago no se registró, intenta de nuevo.");
    } finally {
      setGuardando(false);
    }
  };

  const parte = (concepto, titulo, saldo, mon) => (
    <label className={`flex-1 border rounded-lg p-3 cursor-pointer ${form.concepto === concepto ? "border-purple-500 bg-purple-50" : "border-gray-200"} ${saldo <= 0.009 ? "opacity-40 cursor-not-allowed" : ""}`}>
      <input type="radio" className="sr-only" disabled={saldo <= 0.009} checked={form.concepto === concepto} onChange={() => elegirConcepto(concepto)} />
      <p className="text-xs text-gray-500">{titulo}</p>
      <p className="font-semibold text-gray-800">{money(saldo, mon)}</p>
      <p className="text-[11px] text-gray-400">saldo</p>
    </label>
  );

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4" style={{ zIndex: 60 }}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 space-y-4">
        <div>
          <h3 className="text-lg font-bold text-gray-800">Registrar {verbo}</h3>
          <p className="text-xs text-gray-400">{d.codigo} · {d.serie ? `${d.serie}-${d.numero}` : d.numeroFactura}</p>
        </div>
        <div className="flex gap-3">
          {parte("neto", lado === "compra" ? "Neto al proveedor" : "Neto del cliente", d.saldoNeto, moneda)}
          {d.impuesto?.tipo !== "ninguno" && parte("impuesto", etiquetaImpuesto(d.impuesto), d.saldoImpuesto, "PEN")}
        </div>
        {tipo === "transferencia" && (
          <p className="text-xs text-amber-700 bg-amber-50 rounded-lg p-2">El cliente pagó el total: la detracción se transfiere de nuestra cuenta a la cuenta de detracciones.</p>
        )}
        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs text-gray-500">Monto
            <input type="number" min="0" step="0.01" value={form.monto} onChange={set("monto")} className={INP} />
          </label>
          <label className="text-xs text-gray-500">Fecha
            <input type="date" value={form.fecha} onChange={set("fecha")} className={INP} />
          </label>
          {tipo !== "retencion" && (
            <>
              <label className="text-xs text-gray-500">{tipo === "transferencia" ? "Cuenta de origen" : "Cuenta"}
                <select value={form.cuenta} onChange={set("cuenta")} className={INP}>
                  <option value="">Elegir…</option>
                  {origen.map((c) => <option key={c._id} value={c._id}>{c.nombre} ({c.moneda})</option>)}
                </select>
              </label>
              <label className="text-xs text-gray-500">Medio
                <select value={form.medio} onChange={set("medio")} className={INP}>
                  {MEDIOS.map((m) => <option key={m.valor} value={m.valor}>{m.label}</option>)}
                </select>
              </label>
            </>
          )}
          {tipo === "transferencia" && (
            <label className="text-xs text-gray-500">Cuenta de detracciones
              <select value={form.cuentaDestino} onChange={set("cuentaDestino")} className={INP}>
                <option value="">Elegir…</option>
                {destino.map((c) => <option key={c._id} value={c._id}>{c.nombre}</option>)}
              </select>
            </label>
          )}
          <label className="text-xs text-gray-500 col-span-2">{etiquetaOperacion}
            <input value={form.numeroOperacion} onChange={set("numeroOperacion")} className={INP} />
          </label>
        </div>
        {aviso && <p className="text-xs text-amber-700 bg-amber-50 rounded-lg p-2">{aviso}</p>}
        {error && <p className="text-xs text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Cancelar</button>
          <button onClick={guardar} disabled={guardando || !(Number(form.monto) > 0)}
            className="bg-purple-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-50">
            {guardando ? "Guardando…" : `Registrar ${verbo}`}
          </button>
        </div>
      </div>
    </div>
  );
}
