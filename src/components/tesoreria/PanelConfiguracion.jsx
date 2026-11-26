import { useState, useEffect, useCallback } from "react";
import { fetchAuth } from "../../utils/fetchAuth";
import { money } from "../../utils/compras";
import { formatearFecha } from "../../utils/fecha";
import { Link } from "react-router-dom";
import useConfirmar from "../../hooks/useConfirmar";

const INP = "border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300";
const VACIA = { nombre: "", tipo: "banco", moneda: "PEN", saldoInicial: "", fechaSaldoInicial: "" };
const fecha = (d) => formatearFecha(d, { day: "2-digit", month: "2-digit", year: "numeric" });
const fechaIso = (d) => (d ? new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" }).format(new Date(d)) : "");
const conSaldoInicial = ({ saldoInicial, fechaSaldoInicial, ...resto }) =>
  (saldoInicial === "" ? resto : { ...resto, saldoInicial: Number(saldoInicial), fechaSaldoInicial });
const REGIMENES = { general: "Régimen general", pequena: "Pequeña empresa (REMYPE)", micro: "Microempresa (REMYPE)" };
const TIPOS = { banco: "Banco", caja: "Caja", detracciones: "Detracciones (Banco de la Nación)" };
const TC = { compra: "compra", venta: "venta" };

// soloSaldoInicial (contador): todo en solo lectura salvo el saldo inicial de cada cuenta.
export default function PanelConfiguracion({ onCambio, soloSaldoInicial = false }) {
  const [cuentas, setCuentas] = useState([]);
  const [config, setConfig] = useState({ esAgenteRetencion: false, tcCobros: "compra", tcPagos: "venta", coeficienteRenta: 0.015, regimenLaboral: "general" });
  const [coeficiente, setCoeficiente] = useState(null);
  const [nueva, setNueva] = useState(VACIA);
  // Resultado del último guardado, junto al control que lo causó: { donde, ok, mensaje }.
  const [estado, setEstado] = useState(null);
  const [errorCarga, setErrorCarga] = useState("");
  const [guardando, setGuardando] = useState(false);
  const { confirmar, dialogo } = useConfirmar("Sí, cambiar");
  // Saldo inicial en edición (solo cuentas sin movimientos): { id, saldoInicial, fechaSaldoInicial }.
  const [editando, setEditando] = useState(null);

  const [cajaEditada, setCajaEditada] = useState(null); // { id, responsable, montoFondo, topeGasto }
  const bloqueado = guardando || soloSaldoInicial;

  const cargar = useCallback(() => Promise.all([fetchAuth("/cuentas-tesoreria"), fetchAuth("/configuracion")]).then(async ([rc, rg]) => {
    const [dc, dg] = await Promise.all([rc.json().catch(() => null), rg.json().catch(() => null)]);
    if (rc.ok && dc) setCuentas(dc);
    if (rg.ok && dg) setConfig(dg);
    setErrorCarga(!(rc.ok && dc) ? dc?.mensaje || "No se pudieron cargar las cuentas de tesorería."
      : !(rg.ok && dg) ? dg?.mensaje || "No se pudo cargar la configuración: lo que ves puede no ser lo guardado." : "");
  }), []);
  useEffect(() => { cargar(); }, [cargar]);
  useEffect(() => {
    if (!estado?.ok) return undefined;
    const t = setTimeout(() => setEstado(null), 2500);
    return () => clearTimeout(t);
  }, [estado]);

  const guardar = async (ruta, metodo, body, donde = "cuentas") => {
    setGuardando(true);
    setEstado(null);
    try {
      const r = await fetchAuth(ruta, { method: metodo, body: JSON.stringify(body) });
      if (!r.ok) {
        setEstado({ donde, ok: false, mensaje: (await r.json().catch(() => ({}))).mensaje || "No se pudo guardar." });
        return false;
      }
      await cargar();
      onCambio();
      setEstado({ donde, ok: true, mensaje: "Guardado" });
      return true;
    } catch {
      setEstado({ donde, ok: false, mensaje: "Error de conexión con el servidor, intenta de nuevo." });
      return false;
    } finally {
      setGuardando(false);
    }
  };
  const aviso = (donde) => (estado?.donde === donde
    ? <span className={`text-xs ${estado.ok ? "text-emerald-700" : "text-red-600"}`}>{estado.mensaje}</span>
    : null);
  // Ajustes tributarios: cambian cómo se registran los documentos desde ahora, por eso se confirman.
  const cambiarTributario = async (campo, valor, mensaje) => {
    if (await confirmar(<p>{mensaje} Los documentos y movimientos ya registrados no cambian. ¿Continuar?</p>)) guardar("/configuracion", "PUT", { [campo]: valor }, campo);
  };
  const set = (campo) => (e) => setNueva((n) => ({ ...n, [campo]: e.target.value }));
  const crear = async () => { if (await guardar("/cuentas-tesoreria", "POST", conSaldoInicial(nueva))) setNueva(VACIA); };
  const guardarCaja = async (activa) => {
    const { id, ...datos } = cajaEditada;
    if (await guardar(`/caja-chica/cuentas/${id}`, "PUT", activa ? { ...datos, activa: true } : { activa: false }, "cajas")) setCajaEditada(null);
  };
  const guardarInicial = async () => {
    const { id, saldoInicial, fechaSaldoInicial } = editando;
    if (await guardar(`/cuentas-tesoreria/${id}`, "PUT", { saldoInicial: Number(saldoInicial) || 0, fechaSaldoInicial })) setEditando(null);
  };

  return (
    <div className="space-y-6 max-w-5xl">
      {errorCarga && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {errorCarga} <button onClick={cargar} className="ml-2 underline font-medium">Reintentar</button>
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" disabled={bloqueado} checked={!!config.esAgenteRetencion} onChange={(e) => cambiarTributario("esAgenteRetencion", e.target.checked, e.target.checked
            ? "INTALES pasará a ser agente de retención: en los comprobantes de compra que se registren desde ahora se podrá aplicar (y se sugerirá) la retención del 3 %."
            : "INTALES dejará de ser agente de retención: ya no se podrá registrar la retención del 3 % en compras nuevas.")} />
          INTALES es agente de retención (habilita la retención del 3 % en compras)
        </label>
        {aviso("esAgenteRetencion")}
      </div>
      <div className="flex flex-wrap gap-4 items-end text-sm">
        <label className="text-xs text-gray-500">TC SUNAT en cobros en dólares
          <select value={config.tcCobros} disabled={bloqueado} onChange={(e) => cambiarTributario("tcCobros", e.target.value,
            `Los cobros en dólares que se registren desde ahora usarán el TC SUNAT de ${TC[e.target.value]} (antes: ${TC[config.tcCobros]}).`)} className={`${INP} block`}>
            <option value="compra">Compra</option><option value="venta">Venta</option>
          </select>
          <span className="block h-4">{aviso("tcCobros")}</span>
        </label>
        <label className="text-xs text-gray-500">TC SUNAT en pagos en dólares
          <select value={config.tcPagos} disabled={bloqueado} onChange={(e) => cambiarTributario("tcPagos", e.target.value,
            `Los pagos en dólares que se registren desde ahora usarán el TC SUNAT de ${TC[e.target.value]} (antes: ${TC[config.tcPagos]}).`)} className={`${INP} block`}>
            <option value="compra">Compra</option><option value="venta">Venta</option>
          </select>
          <span className="block h-4">{aviso("tcPagos")}</span>
        </label>
        <div className="text-xs text-gray-500">Régimen laboral (planilla)
          <p className="text-sm text-gray-800 py-2">{REGIMENES[config.regimenLaboral] || REGIMENES.general}</p>
          <Link to="/planilla" state={{ tab: "perfil" }} className="text-purple-600 hover:underline">Se edita en Planilla → Perfil laboral</Link>
        </div>
        <label className="text-xs text-gray-500">Coeficiente de pago a cuenta de renta (%)
          <input type="number" step="0.01" min="0" max="10" disabled={bloqueado}
            value={coeficiente ?? String(Math.round((config.coeficienteRenta ?? 0.015) * 10000) / 100)}
            onChange={(e) => setCoeficiente(e.target.value)}
            onBlur={async () => { if (coeficiente != null && (await guardar("/configuracion", "PUT", { coeficienteRenta: Number(coeficiente) / 100 }, "coeficienteRenta"))) setCoeficiente(null); }}
            className={`${INP} block w-32`} />
          <span className="block h-4">{aviso("coeficienteRenta")}</span>
        </label>
      </div>
      <p className="text-[11px] text-gray-400 -mt-4">Por defecto, cobros al TC compra y pagos al TC venta (práctica de CONCAR/StarSoft); confirmar con el contador. El régimen laboral (Planilla → Perfil laboral) define las gratificaciones que proyecta la planilla (general: completas; pequeña empresa: la mitad; microempresa: ninguna) y aplica desde la siguiente vez que se calcule un mes.</p>
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
                <td className="px-3 py-2">
                  <input type="checkbox" disabled={bloqueado} checked={c.activo} onChange={(e) => guardar(`/cuentas-tesoreria/${c._id}`, "PUT", { activo: e.target.checked }, `activo-${c._id}`)} />
                  <span className="ml-2">{aviso(`activo-${c._id}`)}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-[11px] text-gray-400">El saldo inicial es lo que había en la cuenta al empezar a usar el sistema; solo se edita mientras la cuenta no tenga movimientos (después, registra un ingreso o egreso manual en Movimientos). En dólares se guarda con el TC compra SUNAT de su fecha.</p>
        {!soloSaldoInicial && <div className="flex flex-wrap gap-2 items-center">
          <input value={nueva.nombre} onChange={set("nombre")} placeholder="Nombre de la cuenta" className={INP} />
          <select value={nueva.tipo} onChange={set("tipo")} className={INP}>{Object.entries(TIPOS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          <select value={nueva.moneda} onChange={set("moneda")} className={INP}><option value="PEN">PEN</option><option value="USD">USD</option></select>
          <input type="number" min="0" step="0.01" value={nueva.saldoInicial} onChange={set("saldoInicial")} placeholder="Saldo inicial" className={`${INP} w-32`} />
          <label className="text-xs text-gray-500 flex items-center gap-1">al
            <input type="date" value={nueva.fechaSaldoInicial} onChange={set("fechaSaldoInicial")} className={INP} />
          </label>
          <button onClick={crear} disabled={guardando || !nueva.nombre.trim() || (Number(nueva.saldoInicial) > 0 && !nueva.fechaSaldoInicial)} className="bg-purple-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-50">Agregar cuenta</button>
        </div>}
        {aviso("cuentas")}
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
                  {soloSaldoInicial ? (
                    <span className="text-xs text-gray-600">{c.cajaChica?.activa ? `Sí · ${c.cajaChica.responsable} · fondo S/ ${Number(c.cajaChica.montoFondo).toFixed(2)}` : "No"}</span>
                  ) : cajaEditada?.id === c._id ? (
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
        {aviso("cajas")}
      </div>
      {dialogo}
    </div>
  );
}
