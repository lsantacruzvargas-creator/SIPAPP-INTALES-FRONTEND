import { useState, useEffect, useCallback } from "react";
import { fetchAuth } from "../../utils/fetchAuth";
import { formatearFechaHora } from "../../utils/fecha";
import { mesAnteriorLima, periodoDeMes, mesDePeriodo, textoPeriodo } from "../../utils/bancos";
import TablaScroll from "../TablaScroll";
import AvisoAccion from "../AvisoAccion";
import ConfirmacionAccion from "../ConfirmacionAccion";
import PromptAccion from "../PromptAccion";

const INP = "border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300";

// Cierre de mes (C3): con todo generado, contabilizado y exportado, el tesorero cierra el mes y nada con efecto
// contable entra después (compras, pagos y cobros, bancos, caja chica, CPE, asientos). Reabrir pide motivo.
export default function PanelCierreMes({ puedeCerrar }) {
  const [mes, setMes] = useState(mesAnteriorLima());
  const [periodos, setPeriodos] = useState([]);
  const [verificacion, setVerificacion] = useState(null);
  const [confirmando, setConfirmando] = useState(false);
  const [reabriendo, setReabriendo] = useState(null);
  const [procesando, setProcesando] = useState(false);
  const [aviso, setAviso] = useState("");
  const periodo = periodoDeMes(mes);
  const actual = periodos.find((p) => p.periodo === periodo);
  const cerrado = actual?.estado === "cerrado";

  const leer = async (r, msj) => {
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(d.mensaje || msj), { datos: d });
    return d;
  };
  const cargar = useCallback(async () => {
    try {
      setPeriodos(await leer(await fetchAuth("/contabilidad/periodos"), "No se pudieron cargar los periodos."));
    } catch (e) {
      setAviso(e.message || "Error de conexión con el servidor.");
    }
  }, []);
  useEffect(() => { const t = setTimeout(cargar, 0); return () => clearTimeout(t); }, [cargar]);

  const verificar = useCallback(async () => {
    if (!/^\d{6}$/.test(periodo)) return;
    try {
      setVerificacion(await leer(await fetchAuth(`/contabilidad/periodos/${periodo}/verificacion`), "No se pudo verificar el mes."));
    } catch (e) {
      setAviso(e.message || "Error de conexión con el servidor.");
    }
  }, [periodo]);
  useEffect(() => { const t = setTimeout(verificar, 200); return () => clearTimeout(t); }, [verificar]);

  const accion = async (fn) => {
    setProcesando(true);
    try { await fn(); } catch (e) {
      if (e.datos?.problemas) setVerificacion({ periodo, puedeCerrar: false, problemas: e.datos.problemas });
      setAviso(e.message || "Error de conexión con el servidor.");
    } finally { setProcesando(false); cargar(); verificar(); }
  };
  const cerrar = () => accion(async () => {
    setConfirmando(false);
    await leer(await fetchAuth(`/contabilidad/periodos/${periodo}/cerrar`, { method: "POST" }), "No se pudo cerrar el mes.");
    setAviso(`El mes ${textoPeriodo(periodo)} quedó cerrado.`);
  });
  const reabrir = (motivo) => accion(async () => {
    await leer(await fetchAuth(`/contabilidad/periodos/${reabriendo}/reabrir`, { method: "POST", body: JSON.stringify({ motivo }) }), "No se pudo reabrir el mes.");
    setReabriendo(null);
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="text-xs text-gray-500 block">Mes</label>
          <input type="month" value={mes} onChange={(e) => setMes(e.target.value)} className={INP} />
        </div>
        <span className={`text-sm font-semibold pb-2 ${cerrado ? "text-red-700" : "text-green-700"}`}>{cerrado ? "Cerrado" : "Abierto"}</span>
        <div className="flex-1" />
        {puedeCerrar && !cerrado && (
          <button onClick={() => setConfirmando(true)} disabled={procesando || !verificacion?.puedeCerrar}
            className="bg-gray-900 text-white px-3 py-2 rounded-lg text-sm hover:bg-gray-700 disabled:opacity-40">Cerrar el mes</button>
        )}
        {puedeCerrar && cerrado && (
          <button onClick={() => setReabriendo(periodo)} disabled={procesando}
            className="border border-red-300 text-red-700 px-3 py-2 rounded-lg text-sm hover:bg-red-50">Reabrir el mes</button>
        )}
      </div>

      {!cerrado && verificacion?.periodo === periodo && (
        verificacion.puedeCerrar ? (
          <p className="text-sm text-green-700 bg-green-50 border border-green-100 rounded-lg px-3 py-2">
            Todo generado, contabilizado y exportado: el mes se puede cerrar{puedeCerrar ? "" : " (lo cierra el tesorero)"}.
          </p>
        ) : (
          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-amber-700">Falta para cerrar {textoPeriodo(periodo)}</h3>
            {verificacion.problemas.map((p) => (
              <div key={p.tipo + p.mensaje} className="border border-amber-200 bg-amber-50 rounded-lg px-3 py-2 text-sm">
                <p className="text-amber-800 font-medium">{p.mensaje}</p>
                {p.detalle.length > 0 && <ul className="list-disc pl-5 text-xs text-gray-600 mt-1">{p.detalle.map((d, i) => <li key={i}>{d}</li>)}</ul>}
              </div>
            ))}
            <p className="text-xs text-gray-400">Se resuelve en las pestañas Automáticos y Exportar CONCAR.</p>
          </section>
        )
      )}
      {cerrado && (
        <p className="text-sm text-gray-600">
          Cerrado por {actual.cerradoPor} el {formatearFechaHora(actual.cerradoEn)}. No se registran ni anulan compras, pagos, cobros,
          movimientos de banco, gastos de caja chica, comprobantes ni asientos con fecha de este mes.
        </p>
      )}

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-gray-700">Periodos</h3>
        <TablaScroll>
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-gray-500 border-b">
              <th className="py-2 pr-3">Mes</th><th className="py-2 pr-3">Estado</th><th className="py-2 pr-3">Cierre</th><th className="py-2 pr-3">Reaperturas</th>
            </tr></thead>
            <tbody>
              {periodos.map((p) => (
                <tr key={p.periodo} className="border-b border-gray-100 align-top">
                  <td className="py-1.5 pr-3"><button onClick={() => setMes(mesDePeriodo(p.periodo))} className="text-purple-600 hover:underline">{textoPeriodo(p.periodo)}</button></td>
                  <td className={`py-1.5 pr-3 ${p.estado === "cerrado" ? "text-red-700" : "text-green-700"}`}>{p.estado === "cerrado" ? "Cerrado" : "Abierto"}</td>
                  <td className="py-1.5 pr-3 text-xs text-gray-600">{p.cerradoEn ? `${p.cerradoPor} · ${formatearFechaHora(p.cerradoEn)}` : ""}</td>
                  <td className="py-1.5 pr-3 text-xs text-gray-600">
                    {(p.reaperturas || []).map((r, i) => <div key={i}>{r.por} · {formatearFechaHora(r.en)}: {r.motivo}</div>)}
                  </td>
                </tr>
              ))}
              {!periodos.length && <tr><td colSpan={4} className="py-4 text-center text-gray-400">Sin periodos todavía</td></tr>}
            </tbody>
          </table>
        </TablaScroll>
      </section>
      {confirmando && (
        <ConfirmacionAccion mensaje={`¿Cerrar ${textoPeriodo(periodo)}? Nada con fecha de este mes podrá registrarse ni anularse hasta reabrirlo.`}
          textoConfirmar="Cerrar el mes" procesando={procesando} onCancelar={() => setConfirmando(false)} onConfirmar={cerrar} />
      )}
      {reabriendo && (
        <PromptAccion titulo={`Reabrir ${textoPeriodo(reabriendo)}`} label="Motivo de la reapertura" procesando={procesando}
          textoConfirmar="Reabrir" onCancelar={() => setReabriendo(null)} onConfirmar={reabrir} />
      )}
      {aviso && <AvisoAccion mensaje={aviso} onCerrar={() => setAviso("")} />}
    </div>
  );
}
