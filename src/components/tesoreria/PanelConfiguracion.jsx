import { useState, useEffect, useCallback } from "react";
import { fetchAuth } from "../../utils/fetchAuth";

const INP = "border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300";
const VACIA = { nombre: "", tipo: "banco", moneda: "PEN" };
const TIPOS = { banco: "Banco", caja: "Caja", detracciones: "Detracciones (Banco de la Nación)" };

export default function PanelConfiguracion({ onCambio }) {
  const [cuentas, setCuentas] = useState([]);
  const [config, setConfig] = useState({ esAgenteRetencion: false });
  const [nueva, setNueva] = useState(VACIA);
  const [error, setError] = useState("");

  const cargar = useCallback(() => Promise.all([fetchAuth("/cuentas-tesoreria"), fetchAuth("/configuracion")]).then(async ([rc, rg]) => {
    if (rc.ok) setCuentas(await rc.json());
    if (rg.ok) setConfig(await rg.json());
  }), []);
  useEffect(() => { cargar(); }, [cargar]);

  const guardar = async (ruta, metodo, body) => {
    setError("");
    const r = await fetchAuth(ruta, { method: metodo, body: JSON.stringify(body) });
    if (!r.ok) return setError((await r.json().catch(() => ({}))).mensaje || "No se pudo guardar.");
    await cargar();
    onCambio();
  };
  const set = (campo) => (e) => setNueva((n) => ({ ...n, [campo]: e.target.value }));
  const crear = async () => { await guardar("/cuentas-tesoreria", "POST", nueva); setNueva(VACIA); };

  return (
    <div className="space-y-6 max-w-3xl">
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={!!config.esAgenteRetencion} onChange={(e) => guardar("/configuracion", "PUT", { esAgenteRetencion: e.target.checked })} />
        INTALES es agente de retención (habilita la retención del 3 % en compras)
      </label>
      <div className="space-y-2">
        <h3 className="text-sm font-bold text-gray-700 uppercase">Cuentas de tesorería</h3>
        <table className="w-full text-sm bg-white rounded-xl border border-gray-100">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500"><tr><th className="px-3 py-2 text-left">Nombre</th><th className="px-3 py-2 text-left">Tipo</th><th className="px-3 py-2 text-left">Moneda</th><th className="px-3 py-2 text-left">Activa</th></tr></thead>
          <tbody className="divide-y divide-gray-100">
            {cuentas.map((c) => (
              <tr key={c._id}>
                <td className="px-3 py-2">{c.nombre}</td>
                <td className="px-3 py-2">{TIPOS[c.tipo]}</td>
                <td className="px-3 py-2">{c.moneda}</td>
                <td className="px-3 py-2"><input type="checkbox" checked={c.activo} onChange={(e) => guardar(`/cuentas-tesoreria/${c._id}`, "PUT", { activo: e.target.checked })} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex flex-wrap gap-2 items-center">
          <input value={nueva.nombre} onChange={set("nombre")} placeholder="Nombre de la cuenta" className={INP} />
          <select value={nueva.tipo} onChange={set("tipo")} className={INP}>{Object.entries(TIPOS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          <select value={nueva.moneda} onChange={set("moneda")} className={INP}><option value="PEN">PEN</option><option value="USD">USD</option></select>
          <button onClick={crear} disabled={!nueva.nombre.trim()} className="bg-purple-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-50">Agregar cuenta</button>
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>
    </div>
  );
}
