import { useState, useEffect, useCallback } from "react";
import { fetchAuth } from "../../utils/fetchAuth";
import { periodoDeMes, textoPeriodo } from "../../utils/bancos";
import { formularioDeParametros, cuerpoDeParametros, faltanTasasAfp } from "../../utils/planilla";

const INP = "border border-gray-300 rounded-lg px-3 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-purple-300 disabled:bg-gray-50";

// Parámetros con los que se calcula la planilla de un mes. Se guardan por mes porque la SBS publica cada mes la
// comisión de cada AFP, la prima del seguro y la remuneración máxima asegurable.
export default function PanelParametrosPlanilla({ mes, setMes, catalogos, puedeEscribir }) {
  const periodo = periodoDeMes(mes);
  const [form, setForm] = useState(null);
  const [estado, setEstado] = useState({ guardado: false, copiadoDe: null });
  const [error, setError] = useState("");
  const [guardadoEn, setGuardadoEn] = useState(""); // periodo recién guardado
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async () => {
    if (!/^\d{6}$/.test(periodo)) return;
    try {
      const r = await fetchAuth(`/planilla/parametros/${periodo}`);
      const d = await r.json().catch(() => ({}));
      if (!r.ok) return setError(d.mensaje || "No se pudieron cargar los parámetros.");
      setForm(formularioDeParametros(d, catalogos.afps));
      setEstado({ guardado: d.guardado, copiadoDe: d.copiadoDe });
      setError("");
    } catch {
      setError("Error de conexión con el servidor.");
    }
  }, [periodo, catalogos.afps]);
  useEffect(() => { const t = setTimeout(cargar, 200); return () => clearTimeout(t); }, [cargar]);
  const ok = guardadoEn === periodo;

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const setAfp = (k) => (e) => setForm((f) => ({ ...f, afp: { ...f.afp, [k]: e.target.value } }));
  const setComision = (afp, k) => (e) => setForm((f) => ({ ...f, afp: { ...f.afp, comisiones: { ...f.afp.comisiones, [afp]: { ...f.afp.comisiones[afp], [k]: e.target.value } } } }));

  const guardar = async () => {
    setGuardando(true);
    setError("");
    setGuardadoEn("");
    try {
      const r = await fetchAuth(`/planilla/parametros/${periodo}`, { method: "PUT", body: JSON.stringify(cuerpoDeParametros(form)) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) return setError(d.mensaje || "No se pudieron guardar los parámetros.");
      setEstado({ guardado: true, copiadoDe: null });
      setGuardadoEn(periodo);
    } catch {
      setError("Error de conexión con el servidor.");
    } finally {
      setGuardando(false);
    }
  };

  const campo = (etiqueta, valor, onChange, ancho = "w-32") => (
    <label className="text-xs text-gray-500">{etiqueta}
      <input value={valor} onChange={onChange} disabled={!puedeEscribir} inputMode="decimal" className={`${INP} block ${ancho}`} />
    </label>
  );

  return (
    <div className="space-y-5 max-w-3xl">
      <div>
        <label className="text-xs text-gray-500 block">Mes</label>
        <input type="month" value={mes} onChange={(e) => setMes(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
      </div>
      {form && (
        <>
          {!estado.guardado && (
            <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              {estado.copiadoDe ? `Aún sin guardar: se muestran los de ${textoPeriodo(estado.copiadoDe)}.` : "Aún sin guardar: se muestran los valores iniciales."} Revísalos
              contra lo publicado para {textoPeriodo(periodo)} y guárdalos para poder calcular la planilla.
            </p>
          )}
          <div className="flex flex-wrap gap-4">
            {campo("UIT (S/)", form.uit, set("uit"))}
            {campo("Remuneración mínima (S/)", form.rmv, set("rmv"))}
            {campo("EsSalud (%)", form.essalud, set("essalud"), "w-24")}
            {campo("ONP (%)", form.onp, set("onp"), "w-24")}
          </div>
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-gray-700">AFP</h3>
            <div className="flex flex-wrap gap-4">
              {campo("Aporte al fondo (%)", form.afp.aporte, setAfp("aporte"), "w-24")}
              {campo("Prima de seguro (%)", form.afp.prima, setAfp("prima"), "w-24")}
              {campo("Remuneración máxima asegurable (S/)", form.afp.tope, setAfp("tope"), "w-36")}
            </div>
            <table className="text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500"><th className="py-1 pr-4">AFP</th><th className="py-1 pr-4">Comisión sobre flujo (%)</th><th className="py-1">Comisión mixta: parte sobre flujo (%)</th></tr>
              </thead>
              <tbody>
                {Object.entries(catalogos.afps).map(([afp, nombre]) => (
                  <tr key={afp}>
                    <td className="py-1 pr-4">{nombre}</td>
                    <td className="py-1 pr-4"><input value={form.afp.comisiones[afp].flujo} onChange={setComision(afp, "flujo")} disabled={!puedeEscribir} inputMode="decimal" className={`${INP} w-28`} /></td>
                    <td className="py-1"><input value={form.afp.comisiones[afp].mixta} onChange={setComision(afp, "mixta")} disabled={!puedeEscribir} inputMode="decimal" className={`${INP} w-28`} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-[11px] text-gray-400">
              Se copian cada mes de la SBS («Comisiones y primas de seguro del SPP», por mes de devengue). En la comisión mixta solo se descuenta del
              sueldo la parte sobre flujo; la parte sobre el saldo la cobra la AFP del fondo.
            </p>
          </div>
          {faltanTasasAfp(form) && <p className="text-xs text-amber-700">Faltan la prima de seguro o la remuneración máxima asegurable: sin ellas la AFP se calcularía sin seguro.</p>}
          {error && <p className="text-sm text-red-600">{error}</p>}
          {ok && <p className="text-sm text-green-700">Parámetros de {textoPeriodo(periodo)} guardados.</p>}
          {puedeEscribir && (
            <button onClick={guardar} disabled={guardando} className="bg-purple-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-purple-700 disabled:opacity-50">
              {guardando ? "Guardando…" : "Guardar parámetros del mes"}
            </button>
          )}
        </>
      )}
      {!form && error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
