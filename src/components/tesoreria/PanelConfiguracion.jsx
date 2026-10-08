import { useState, useEffect, useCallback } from "react";
import { fetchAuth } from "../../utils/fetchAuth";
import { money } from "../../utils/compras";
import { formatearFecha } from "../../utils/fecha";

const INP = "border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300";
const VACIA = { nombre: "", tipo: "banco", moneda: "PEN", saldoInicial: "", fechaSaldoInicial: "" };
const fecha = (d) => formatearFecha(d, { day: "2-digit", month: "2-digit", year: "numeric" });
const fechaIso = (d) => (d ? new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" }).format(new Date(d)) : "");
const conSaldoInicial = ({ saldoInicial, fechaSaldoInicial, ...resto }) =>
  (saldoInicial === "" ? resto : { ...resto, saldoInicial: Number(saldoInicial), fechaSaldoInicial });
const TIPOS = { banco: "Banco", caja: "Caja", detracciones: "Detracciones (Banco de la Nación)" };

export default function PanelConfiguracion({ onCambio }) {
  const [cuentas, setCuentas] = useState([]);
  const [config, setConfig] = useState({ esAgenteRetencion: false, tcCobros: "compra", tcPagos: "venta", coeficienteRenta: 0.015, regimenLaboral: "general" });
  const [coeficiente, setCoeficiente] = useState(null);
  const [nueva, setNueva] = useState(VACIA);
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  // Saldo inicial en edición (solo cuentas sin movimientos): { id, saldoInicial, fechaSaldoInicial }.
  const [editando, setEditando] = useState(null);

  const [cajaEditada, setCajaEditada] = useState(null); // { id, responsable, montoFondo, topeGasto }

  const cargar = useCallback(() => Promise.all([fetchAuth("/cuentas-tesoreria"), fetchAuth("/configuracion")]).then(async ([rc, rg]) => {
    if (rc.ok) setCuentas(await rc.json());
    if (rg.ok) setConfig(await rg.json());
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
  const crear = async () => { if (await guardar("/cuentas-tesoreria", "POST", conSaldoInicial(nueva))) setNueva(VACIA); };
  const guardarCaja = async (activa) => {
    const { id, ...datos } = cajaEditada;
    if (await guardar(`/caja-chica/cuentas/${id}`, "PUT", activa ? { ...datos, activa: true } : { activa: false })) setCajaEditada(null);
  };
  const guardarInicial = async () => {
    const { id, saldoInicial, fechaSaldoInicial } = editando;
    if (await guardar(`/cuentas-tesoreria/${id}`, "PUT", { saldoInicial: Number(saldoInicial) || 0, fechaSaldoInicial })) setEditando(null);
  };

  return (
    <div className="space-y-6 max-w-5xl">
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
        <label className="text-xs text-gray-500">Régimen laboral (planilla)
          <select value={config.regimenLaboral || "general"} disabled={guardando} onChange={(e) => guardar("/configuracion", "PUT", { regimenLaboral: e.target.value })} className={`${INP} block`}>
            <option value="general">Régimen general</option><option value="pequena">Pequeña empresa (REMYPE)</option><option value="micro">Microempresa (REMYPE)</option>
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
      <p className="text-[11px] text-gray-400 -mt-4">Por defecto, cobros al TC compra y pagos al TC venta (práctica de CONCAR/StarSoft); confirmar con el contador. El régimen laboral define las gratificaciones que proyecta la planilla (general: completas; pequeña empresa: la mitad; microempresa: ninguna) y aplica desde la siguiente vez que se calcule un mes.</p>
      <div className="space-y-2">
        <h3 className="text-sm font-bold text-gray-700 uppercase">Cuentas de tesorería</h3>
        <table className="w-full text-sm bg-white rounded-xl border border-gray-100">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500"><tr>{["Nombre", "Tipo", "Moneda", "Saldo inicial", "Saldo actual", "Activa"].map((h) => <th key={h} className="px-3 py-2 text-left">{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-gray-100">
            {cuentas.map((c) => (
              <tr key={c._id}>
                <td className="px-3 py-2">{c.nombre}</td>
                <td className="px-3 py-2">{TIPOS[c.tipo]}</td>
                <td className="px-3 py-2">{c.moneda}</td>
                <td className="px-3 py-2">
                  {editando?.id === c._id ? (
                    <div className="flex flex-wrap gap-1 items-center">
                      <input type="number" min="0" step="0.01" value={editando.saldoInicial} onChange={(e) => setEditando((x) => ({ ...x, saldoInicial: e.target.value }))} className={`${INP} w-28`} />
                      <input type="date" value={editando.fechaSaldoInicial} onChange={(e) => setEditando((x) => ({ ...x, fechaSaldoInicial: e.target.value }))} className={INP} />
                      <button onClick={guardarInicial} disabled={guardando || (Number(editando.saldoInicial) > 0 && !editando.fechaSaldoInicial)} className="text-xs text-purple-700 hover:text-purple-900 disabled:opacity-50">Guardar</button>
                      <button onClick={() => setEditando(null)} disabled={guardando} className="text-xs text-gray-500">Cancelar</button>
                    </div>
                  ) : (
                    <span>
                      {money(c.saldoInicial, c.moneda)}
                      {c.fechaSaldoInicial && <span className="text-[11px] text-gray-400"> al {fecha(c.fechaSaldoInicial)}</span>}
                      {c.moneda === "USD" && c.tipoCambioSaldoInicial && <span className="text-[11px] text-gray-400"> · TC {Number(c.tipoCambioSaldoInicial).toFixed(3)}</span>}
                      {!c.tieneMovimientos && (
                        <button onClick={() => setEditando({ id: c._id, saldoInicial: c.saldoInicial ? String(c.saldoInicial) : "", fechaSaldoInicial: fechaIso(c.fechaSaldoInicial) })}
                          className="ml-2 text-xs text-purple-600 hover:text-purple-800">Editar</button>
                      )}
                    </span>
                  )}
                </td>
                <td className={`px-3 py-2 tabular-nums ${c.saldo < 0 ? "text-red-600" : ""}`}>{money(c.saldo, c.moneda)}</td>
                <td className="px-3 py-2"><input type="checkbox" disabled={guardando} checked={c.activo} onChange={(e) => guardar(`/cuentas-tesoreria/${c._id}`, "PUT", { activo: e.target.checked })} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-[11px] text-gray-400">El saldo inicial es lo que había en la cuenta al empezar a usar el sistema; solo se edita mientras la cuenta no tenga movimientos (después, registra un ingreso o egreso manual en Movimientos). En dólares se guarda con el TC compra SUNAT de su fecha.</p>
        <div className="flex flex-wrap gap-2 items-center">
          <input value={nueva.nombre} onChange={set("nombre")} placeholder="Nombre de la cuenta" className={INP} />
          <select value={nueva.tipo} onChange={set("tipo")} className={INP}>{Object.entries(TIPOS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          <select value={nueva.moneda} onChange={set("moneda")} className={INP}><option value="PEN">PEN</option><option value="USD">USD</option></select>
          <input type="number" min="0" step="0.01" value={nueva.saldoInicial} onChange={set("saldoInicial")} placeholder="Saldo inicial" className={`${INP} w-32`} />
          <label className="text-xs text-gray-500 flex items-center gap-1">al
            <input type="date" value={nueva.fechaSaldoInicial} onChange={set("fechaSaldoInicial")} className={INP} />
          </label>
          <button onClick={crear} disabled={guardando || !nueva.nombre.trim() || (Number(nueva.saldoInicial) > 0 && !nueva.fechaSaldoInicial)} className="bg-purple-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-50">Agregar cuenta</button>
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>
      <div className="space-y-2">
        <h3 className="text-sm font-bold text-gray-700 uppercase">Cajas chicas (fondo fijo)</h3>
        <p className="text-[11px] text-gray-400">Una cuenta de tipo caja en soles. Después de configurarla, abre el fondo con una transferencia desde Bancos.</p>
        <table className="w-full text-sm bg-white rounded-xl border border-gray-100">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500"><tr><th className="px-3 py-2 text-left">Caja</th><th className="px-3 py-2 text-left">Caja chica</th></tr></thead>
          <tbody className="divide-y divide-gray-100">
            {cuentas.filter((c) => c.tipo === "caja" && c.moneda === "PEN").map((c) => (
              <tr key={c._id}>
                <td className="px-3 py-2">{c.nombre}</td>
                <td className="px-3 py-2">
                  {cajaEditada?.id === c._id ? (
                    <span className="flex flex-wrap gap-1 items-center">
                      <input value={cajaEditada.responsable} onChange={(e) => setCajaEditada((s) => ({ ...s, responsable: e.target.value }))} placeholder="Responsable" className={`${INP} py-1`} />
                      <input value={cajaEditada.montoFondo} onChange={(e) => setCajaEditada((s) => ({ ...s, montoFondo: e.target.value }))} placeholder="Fondo S/" inputMode="decimal" className={`${INP} w-28 py-1`} />
                      <input value={cajaEditada.topeGasto} onChange={(e) => setCajaEditada((s) => ({ ...s, topeGasto: e.target.value }))} placeholder="Tope por gasto" inputMode="decimal" className={`${INP} w-32 py-1`} />
                      <button onClick={() => guardarCaja(true)} disabled={guardando || !cajaEditada.responsable.trim() || !cajaEditada.montoFondo} className="text-xs text-purple-700 hover:underline disabled:opacity-50">Guardar</button>
                      {c.cajaChica?.activa && <button onClick={() => guardarCaja(false)} disabled={guardando} className="text-xs text-red-600 hover:underline">Quitar</button>}
                      <button onClick={() => setCajaEditada(null)} className="text-xs text-gray-500 hover:underline">Cancelar</button>
                    </span>
                  ) : (
                    <button onClick={() => setCajaEditada({ id: c._id, responsable: c.cajaChica?.responsable || "", montoFondo: String(c.cajaChica?.montoFondo || ""), topeGasto: String(c.cajaChica?.topeGasto || "") })}
                      className="text-xs text-gray-600 hover:underline">
                      {c.cajaChica?.activa ? `Sí · ${c.cajaChica.responsable} · fondo S/ ${Number(c.cajaChica.montoFondo).toFixed(2)}${c.cajaChica.topeGasto ? ` · tope S/ ${Number(c.cajaChica.topeGasto).toFixed(2)}` : ""}` : "Configurar como caja chica"}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
