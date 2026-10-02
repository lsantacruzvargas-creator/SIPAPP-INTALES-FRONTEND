import { useState, useEffect, useCallback } from "react";
import { fetchAuth, getUsuario } from "../../utils/fetchAuth";
import { formatearFecha, formatearFechaHora } from "../../utils/fecha";
import { money } from "../../utils/compras";
import { avisoDeRespuesta } from "../../utils/bloqueo";
import { resumenConciliacion, periodoDeMes, textoPeriodo, mesAnteriorLima, descripcionMovimiento } from "../../utils/bancos";
import useBloqueoEdicion from "../../hooks/useBloqueoEdicion";
import BarraEdicion from "../BarraEdicion";
import PromptAccion from "../PromptAccion";
import TablaScroll from "../TablaScroll";

const INP = "border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300";
const fecha = (d) => formatearFecha(d, { day: "2-digit", month: "2-digit", year: "numeric" });

// Conciliación bancaria mensual por cuenta (spec 2026-10-02-bancos-b7).
export default function PanelConciliacion() {
  const puedeReabrir = ["jefatura", "admin"].includes(getUsuario()?.rol);
  const [cuentas, setCuentas] = useState([]);
  const [cuenta, setCuenta] = useState("");
  const [mes, setMes] = useState(mesAnteriorLima());
  const [historial, setHistorial] = useState([]);
  const [conc, setConc] = useState(null);
  const [extracto, setExtracto] = useState("");
  const [marcados, setMarcados] = useState([]);
  const [error, setError] = useState("");
  const [procesando, setProcesando] = useState(false);
  const [reabriendo, setReabriendo] = useState(false);

  const abierta = conc?.estado === "abierta";
  const bloqueo = useBloqueoEdicion("conciliacionBancaria", conc?._id, conc?.updatedAt, { autoEditar: abierta });
  const editable = abierta && bloqueo.editando;

  useEffect(() => {
    fetchAuth("/cuentas-tesoreria").then(async (r) => {
      if (r.ok) setCuentas((await r.json()).filter((c) => c.activo && c.tipo !== "caja"));
    }).catch(() => {});
  }, []);
  const cargarHistorial = useCallback(() => {
    if (!cuenta) return Promise.resolve();
    return fetchAuth(`/bancos/conciliaciones?cuenta=${cuenta}`).then(async (r) => { if (r.ok) setHistorial(await r.json()); }).catch(() => {});
  }, [cuenta]);
  useEffect(() => { cargarHistorial(); }, [cargarHistorial]);

  const mostrar = (c) => {
    setConc(c);
    setExtracto(c.saldoExtracto ?? "");
    setMarcados(c.calculo.pendientes.filter((m) => m.marcado).map((m) => m._id));
  };
  const pedir = async (fn, fallo) => {
    setError("");
    setProcesando(true);
    try {
      const r = await fn();
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { if (!avisoDeRespuesta(r.status, d)) setError(d.mensaje || fallo); return null; }
      return d;
    } catch {
      setError("Error de conexión con el servidor.");
      return null;
    } finally {
      setProcesando(false);
    }
  };

  const abrir = async () => {
    const d = await pedir(() => fetchAuth("/bancos/conciliaciones", { method: "POST", body: JSON.stringify({ cuenta, periodo: periodoDeMes(mes) }) }), "No se pudo abrir la conciliación.");
    if (d) { mostrar(d); cargarHistorial(); }
  };
  const ver = async (id) => {
    const d = await pedir(() => fetchAuth(`/bancos/conciliaciones/${id}`), "No se pudo abrir la conciliación.");
    if (d) mostrar(d);
  };
  const guardar = async () => {
    const d = await pedir(() => bloqueo.fetch(`/bancos/conciliaciones/${conc._id}`, {
      method: "PUT", body: JSON.stringify({ saldoExtracto: extracto === "" ? null : extracto, movimientos: marcados }),
    }), "No se pudo guardar.");
    if (d) mostrar(d);
    return d;
  };
  const cerrar = async () => {
    if (!(await guardar())) return;
    const d = await pedir(() => bloqueo.fetch(`/bancos/conciliaciones/${conc._id}/cerrar`, { method: "POST" }), "No se pudo cerrar.");
    if (d) { mostrar(d); cargarHistorial(); }
  };
  const reabrir = async (motivo) => {
    const d = await pedir(() => bloqueo.fetch(`/bancos/conciliaciones/${conc._id}/reabrir`, { method: "POST", body: JSON.stringify({ motivo }) }), "No se pudo reabrir.");
    setReabriendo(false);
    if (d) { mostrar(d); cargarHistorial(); }
  };

  const moneda = conc?.cuenta?.moneda || "PEN";
  const res = conc ? resumenConciliacion({ pendientes: conc.calculo.pendientes, marcados, saldoExtracto: extracto, saldoLibros: conc.calculo.saldoLibros }) : null;
  const marcar = (id) => setMarcados((ms) => (ms.includes(id) ? ms.filter((x) => x !== id) : [...ms, id]));
  const descripcion = descripcionMovimiento;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-3 items-end">
        <label className="text-xs text-gray-500">Cuenta
          <select value={cuenta} onChange={(e) => { setCuenta(e.target.value); setConc(null); setHistorial([]); }} className={`${INP} block`}>
            <option value="">Elige…</option>
            {cuentas.map((c) => <option key={c._id} value={c._id}>{c.nombre} ({c.moneda})</option>)}
          </select>
        </label>
        <label className="text-xs text-gray-500">Mes
          <input type="month" value={mes} onChange={(e) => setMes(e.target.value)} className={`${INP} block`} />
        </label>
        <button onClick={abrir} disabled={!cuenta || !mes || procesando} className="bg-purple-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-purple-700 disabled:opacity-50">Conciliar este mes</button>
        {historial.length > 0 && (
          <div className="flex flex-wrap gap-1 items-center text-xs">
            <span className="text-gray-500">Historial:</span>
            {historial.map((h) => (
              <button key={h._id} onClick={() => ver(h._id)}
                className={`px-2 py-1 rounded-md border ${h.estado === "cerrada" ? "border-emerald-200 text-emerald-700 bg-emerald-50" : "border-amber-200 text-amber-700 bg-amber-50"}`}>
                {textoPeriodo(h.periodo)} {h.estado === "cerrada" ? "✓" : "(abierta)"}
              </button>
            ))}
          </div>
        )}
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}

      {conc && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <h3 className="font-semibold text-gray-700">{conc.cuenta?.nombre} · {textoPeriodo(conc.periodo)}</h3>
            {abierta ? <BarraEdicion bloqueo={bloqueo} /> : (
              <span className="text-xs text-emerald-700">Cerrada por {conc.cerradaPor} el {formatearFechaHora(conc.cerradaEn)}</span>
            )}
            {!abierta && puedeReabrir && (
              <button onClick={() => setReabriendo(true)} className="text-xs text-red-600 hover:underline">Reabrir</button>
            )}
          </div>

          <div className="grid gap-3 grid-cols-2 lg:grid-cols-6 text-sm">
            <div className="bg-white border rounded-xl p-3"><p className="text-xs text-gray-500">Saldo según extracto</p>
              <input value={extracto} onChange={(e) => setExtracto(e.target.value)} disabled={!editable} inputMode="decimal"
                className="mt-1 w-full border border-gray-300 rounded-lg px-2 py-1 text-right tabular-nums disabled:bg-gray-50" />
            </div>
            <div className="bg-white border rounded-xl p-3"><p className="text-xs text-gray-500">+ Ingresos en tránsito</p><p className="tabular-nums text-emerald-700">{money(res.ingresosTransito, moneda)}</p></div>
            <div className="bg-white border rounded-xl p-3"><p className="text-xs text-gray-500">− Egresos en tránsito</p><p className="tabular-nums text-red-600">{money(res.egresosTransito, moneda)}</p></div>
            <div className="bg-white border rounded-xl p-3"><p className="text-xs text-gray-500">= Saldo conciliado</p><p className="tabular-nums">{res.saldoConciliado == null ? "—" : money(res.saldoConciliado, moneda)}</p></div>
            <div className="bg-white border rounded-xl p-3"><p className="text-xs text-gray-500">Saldo en libros</p><p className="tabular-nums">{money(conc.calculo.saldoLibros, moneda)}</p></div>
            <div className={`border rounded-xl p-3 ${res.cuadra ? "bg-emerald-50 border-emerald-200" : "bg-amber-50 border-amber-200"}`}>
              <p className="text-xs text-gray-500">Diferencia</p>
              <p className={`tabular-nums font-semibold ${res.cuadra ? "text-emerald-700" : "text-amber-700"}`}>{res.diferencia == null ? "—" : money(res.diferencia, moneda)}</p>
            </div>
          </div>
          <p className="text-[11px] text-gray-400">
            Marca los movimientos que figuran en el extracto del banco; los no marcados quedan en tránsito y pasan al mes siguiente.
            Si el extracto trae cargos o abonos que no están en libros (comisiones, ITF, intereses), regístralos en Bancos como movimiento sin documento.
          </p>

          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <TablaScroll className="overflow-x-auto">
              <table className="w-full text-sm" style={{ minWidth: "820px" }}>
                <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                  <tr>
                    <th className="px-3 py-2 text-left">
                      {editable && <input type="checkbox" title="Marcar todos"
                        checked={marcados.length === conc.calculo.pendientes.length && marcados.length > 0}
                        onChange={(e) => setMarcados(e.target.checked ? conc.calculo.pendientes.map((m) => m._id) : [])} />}
                    </th>
                    {["Fecha", "Código", "Descripción", "N° operación", "Entrada", "Salida"].map((h) => <th key={h} className="px-3 py-2 text-left">{h}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {conc.calculo.pendientes.map((m) => {
                    const ok = marcados.includes(m._id);
                    return (
                      <tr key={m._id} className={ok ? "bg-emerald-50/40" : ""}>
                        <td className="px-3 py-2"><input type="checkbox" checked={ok} disabled={!editable} onChange={() => marcar(m._id)} /></td>
                        <td className="px-3 py-2 whitespace-nowrap">{fecha(m.fecha)}</td>
                        <td className="px-3 py-2 font-medium">{m.codigo}</td>
                        <td className="px-3 py-2">{descripcion(m)}</td>
                        <td className="px-3 py-2">{m.numeroOperacion || "—"}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-emerald-700">{m.entrada ? money(m.entrada, moneda) : ""}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-red-600">{m.salida ? money(m.salida, moneda) : ""}</td>
                      </tr>
                    );
                  })}
                  {!conc.calculo.pendientes.length && <tr><td colSpan={7} className="px-3 py-6 text-center text-gray-400">Sin movimientos por conciliar</td></tr>}
                </tbody>
              </table>
            </TablaScroll>
          </div>

          {editable && (
            <div className="flex justify-end gap-3">
              <button onClick={guardar} disabled={procesando} className="border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50">Guardar avance</button>
              <button onClick={cerrar} disabled={procesando || !res.cuadra} title={res.cuadra ? "" : "La diferencia debe ser 0"}
                className="bg-purple-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-purple-700 disabled:opacity-50">Cerrar conciliación</button>
            </div>
          )}
        </div>
      )}
      {reabriendo && (
        <PromptAccion titulo={`Reabrir la conciliación de ${textoPeriodo(conc.periodo)}`} label="Motivo de la reapertura" procesando={procesando}
          textoConfirmar="Reabrir" onCancelar={() => setReabriendo(false)} onConfirmar={reabrir} />
      )}
    </div>
  );
}
