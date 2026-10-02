import { useState, useEffect, useCallback } from "react";
import { fetchAuth } from "../../utils/fetchAuth";

const INP = "border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300";
const VACIA = { nombre: "", tipo: "banco", moneda: "PEN" };
const TIPOS = { banco: "Banco", caja: "Caja", detracciones: "Detracciones (Banco de la Nación)" };

export default function PanelConfiguracion({ onCambio }) {
  const [cuentas, setCuentas] = useState([]);
  const [config, setConfig] = useState({ esAgenteRetencion: false, tcCobros: "compra", tcPagos: "venta", coeficienteRenta: 0.015 });
  const [coeficiente, setCoeficiente] = useState(null);
  const [nueva, setNueva] = useState(VACIA);
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  const [tipos, setTipos] = useState([]);
  const [nuevoTipo, setNuevoTipo] = useState({ nombre: "", lado: "egreso" });
  const [saldoEditado, setSaldoEditado] = useState(null); // { id, monto, fecha, tipoCambio }

  const cargar = useCallback(() => Promise.all([fetchAuth("/cuentas-tesoreria"), fetchAuth("/configuracion"), fetchAuth("/bancos/tipos-movimiento")]).then(async ([rc, rg, rt]) => {
    if (rc.ok) setCuentas(await rc.json());
    if (rg.ok) setConfig(await rg.json());
    if (rt.ok) setTipos(await rt.json());
  }).catch(() => setError("Error de conexión con el servidor.")), []);
  useEffect(() => { cargar(); }, [cargar]);

  const guardar = async (ruta, metodo, body) => {
    setGuardando(true);
    setError("");
    try {
      const r = await fetchAuth(ruta, { method: metodo, body: JSON.stringify(body) });
      if (!r.ok) {
        setError((await r.json().catch(() => ({}))).mensaje || "No se pudo guardar.");
        return false;
      }
      await cargar();
      onCambio();
      return true;
    } catch {
      setError("Error de conexión con el servidor, intenta de nuevo.");
      return false;
    } finally {
      setGuardando(false);
    }
  };
  const set = (campo) => (e) => setNueva((n) => ({ ...n, [campo]: e.target.value }));
  const crear = async () => { if (await guardar("/cuentas-tesoreria", "POST", nueva)) setNueva(VACIA); };
  const crearTipo = async () => { if (await guardar("/bancos/tipos-movimiento", "POST", nuevoTipo)) setNuevoTipo({ nombre: "", lado: "egreso" }); };
  const guardarSaldo = async () => {
    const { id, ...body } = saldoEditado;
    if (await guardar(`/bancos/cuentas/${id}/saldo-inicial`, "PUT", body)) setSaldoEditado(null);
  };
  const fechaInput = (d) => (d ? new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" }).format(new Date(d)) : "");

  return (
    <div className="space-y-6 max-w-3xl">
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" disabled={guardando} checked={!!config.esAgenteRetencion} onChange={(e) => guardar("/configuracion", "PUT", { esAgenteRetencion: e.target.checked })} />
        INTALES es agente de retención (habilita la retención del 3 % en compras)
      </label>
      <div className="flex flex-wrap gap-4 items-end text-sm">
        <label className="text-xs text-gray-500">TC SUNAT en cobros en dólares
          <select value={config.tcCobros} disabled={guardando} onChange={(e) => guardar("/configuracion", "PUT", { tcCobros: e.target.value })} className={`${INP} block`}>
            <option value="compra">Compra</option><option value="venta">Venta</option>
          </select>
        </label>
        <label className="text-xs text-gray-500">TC SUNAT en pagos en dólares
          <select value={config.tcPagos} disabled={guardando} onChange={(e) => guardar("/configuracion", "PUT", { tcPagos: e.target.value })} className={`${INP} block`}>
            <option value="compra">Compra</option><option value="venta">Venta</option>
          </select>
        </label>
        <label className="text-xs text-gray-500">Coeficiente de pago a cuenta de renta (%)
          <input type="number" step="0.01" min="0" max="10" disabled={guardando}
            value={coeficiente ?? String(Math.round((config.coeficienteRenta ?? 0.015) * 10000) / 100)}
            onChange={(e) => setCoeficiente(e.target.value)}
            onBlur={async () => { if (coeficiente != null && (await guardar("/configuracion", "PUT", { coeficienteRenta: Number(coeficiente) / 100 }))) setCoeficiente(null); }}
            className={`${INP} block w-32`} />
        </label>
      </div>
      <p className="text-[11px] text-gray-400 -mt-4">Por defecto, cobros al TC compra y pagos al TC venta (práctica de CONCAR/StarSoft); confirmar con el contador.</p>
      <div className="space-y-2">
        <h3 className="text-sm font-bold text-gray-700 uppercase">Cuentas de tesorería</h3>
        <table className="w-full text-sm bg-white rounded-xl border border-gray-100">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500"><tr><th className="px-3 py-2 text-left">Nombre</th><th className="px-3 py-2 text-left">Tipo</th><th className="px-3 py-2 text-left">Moneda</th><th className="px-3 py-2 text-left">Saldo inicial</th><th className="px-3 py-2 text-left">Activa</th></tr></thead>
          <tbody className="divide-y divide-gray-100">
            {cuentas.map((c) => (
              <tr key={c._id}>
                <td className="px-3 py-2">{c.nombre}</td>
                <td className="px-3 py-2">{TIPOS[c.tipo]}</td>
                <td className="px-3 py-2">{c.moneda}</td>
                <td className="px-3 py-2">
                  {saldoEditado?.id === c._id ? (
                    <span className="flex flex-wrap gap-1 items-center">
                      <input value={saldoEditado.monto} onChange={(e) => setSaldoEditado((s) => ({ ...s, monto: e.target.value }))} placeholder="Saldo" inputMode="decimal" className={`${INP} w-28 py-1`} />
                      <input type="date" value={saldoEditado.fecha} onChange={(e) => setSaldoEditado((s) => ({ ...s, fecha: e.target.value }))} className={`${INP} py-1`} />
                      {c.moneda === "USD" && <input value={saldoEditado.tipoCambio} onChange={(e) => setSaldoEditado((s) => ({ ...s, tipoCambio: e.target.value }))} placeholder="TC" inputMode="decimal" className={`${INP} w-20 py-1`} />}
                      <button onClick={guardarSaldo} disabled={guardando || saldoEditado.monto === "" || !saldoEditado.fecha} className="text-xs text-purple-700 hover:underline disabled:opacity-50">Guardar</button>
                      <button onClick={() => setSaldoEditado(null)} className="text-xs text-gray-500 hover:underline">Cancelar</button>
                    </span>
                  ) : (
                    <button onClick={() => setSaldoEditado({ id: c._id, monto: String(c.saldoInicial?.monto ?? 0), fecha: fechaInput(c.saldoInicial?.fecha), tipoCambio: String(c.saldoInicial?.tipoCambio || "") })}
                      className="text-xs text-gray-600 hover:underline" title="Saldo al inicio del día indicado; los movimientos anteriores se consideran incluidos">
                      {c.saldoInicial?.fecha ? `${Number(c.saldoInicial.monto).toFixed(2)} al ${fechaInput(c.saldoInicial.fecha)}` : "Definir"}
                    </button>
                  )}
                </td>
                <td className="px-3 py-2"><input type="checkbox" disabled={guardando} checked={c.activo} onChange={(e) => guardar(`/cuentas-tesoreria/${c._id}`, "PUT", { activo: e.target.checked })} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex flex-wrap gap-2 items-center">
          <input value={nueva.nombre} onChange={set("nombre")} placeholder="Nombre de la cuenta" className={INP} />
          <select value={nueva.tipo} onChange={set("tipo")} className={INP}>{Object.entries(TIPOS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          <select value={nueva.moneda} onChange={set("moneda")} className={INP}><option value="PEN">PEN</option><option value="USD">USD</option></select>
          <button onClick={crear} disabled={guardando || !nueva.nombre.trim()} className="bg-purple-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-50">Agregar cuenta</button>
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>
      <div className="space-y-2">
        <h3 className="text-sm font-bold text-gray-700 uppercase">Tipos de movimiento de banco</h3>
        <p className="text-[11px] text-gray-400">Para movimientos sin documento (comisiones, ITF, tributos, préstamos…). La cuenta contable la define el contador.</p>
        <table className="w-full text-sm bg-white rounded-xl border border-gray-100">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500"><tr><th className="px-3 py-2 text-left">Nombre</th><th className="px-3 py-2 text-left">Tipo</th><th className="px-3 py-2 text-left">Cuenta contable</th><th className="px-3 py-2 text-left">Activo</th></tr></thead>
          <tbody className="divide-y divide-gray-100">
            {tipos.map((t) => (
              <tr key={t._id}>
                <td className="px-3 py-2">{t.nombre}</td>
                <td className={`px-3 py-2 ${t.lado === "egreso" ? "text-red-600" : "text-emerald-700"}`}>{t.lado === "egreso" ? "Egreso" : "Ingreso"}</td>
                <td className="px-3 py-2">
                  <input defaultValue={t.cuentaContable} placeholder="Ej.: 6391" inputMode="numeric" disabled={guardando}
                    onBlur={async (e) => {
                      const input = e.target;
                      if (input.value.trim() === (t.cuentaContable || "")) return;
                      // Rechazada: vuelve al valor guardado (el mensaje queda arriba).
                      if (!(await guardar(`/bancos/tipos-movimiento/${t._id}`, "PUT", { cuentaContable: input.value.trim() }))) input.value = t.cuentaContable || "";
                    }}
                    className={`${INP} w-28 py-1 font-mono`} />
                </td>
                <td className="px-3 py-2"><input type="checkbox" disabled={guardando} checked={t.activo} onChange={(e) => guardar(`/bancos/tipos-movimiento/${t._id}`, "PUT", { activo: e.target.checked })} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex flex-wrap gap-2 items-center">
          <input value={nuevoTipo.nombre} onChange={(e) => setNuevoTipo((n) => ({ ...n, nombre: e.target.value }))} placeholder="Nombre del tipo" className={INP} />
          <select value={nuevoTipo.lado} onChange={(e) => setNuevoTipo((n) => ({ ...n, lado: e.target.value }))} className={INP}>
            <option value="egreso">Egreso</option><option value="ingreso">Ingreso</option>
          </select>
          <button onClick={crearTipo} disabled={guardando || !nuevoTipo.nombre.trim()} className="bg-purple-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-50">Agregar tipo</button>
        </div>
      </div>
    </div>
  );
}
