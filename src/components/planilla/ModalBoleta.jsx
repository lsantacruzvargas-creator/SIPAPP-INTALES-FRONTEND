import { useState } from "react";
import { fetchAuth } from "../../utils/fetchAuth";
import { money } from "../../utils/compras";
import { TIPOS_CONCEPTO, textoPension } from "../../utils/planilla";
import { generarBoletaPdf } from "../../utils/boletaPdf";

const INP = "border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300 disabled:bg-gray-50";

// Boleta de un trabajador: se digitan la asistencia y los conceptos del mes; el servidor recalcula al guardar.
export default function ModalBoleta({ boleta: inicial, catalogos, editable, onClose, onCambio }) {
  const [boleta, setBoleta] = useState(inicial);
  const [form, setForm] = useState(() => ({
    suspensiones: (inicial.asistencia?.suspensiones || []).map((s) => ({ tipo: s.tipo, dias: String(s.dias) })),
    horasExtras25: String(inicial.asistencia?.horasExtras25 || ""), horasExtras35: String(inicial.asistencia?.horasExtras35 || ""),
    adicionales: (inicial.adicionales || []).map((a) => ({ codigo: a.codigo, monto: String(a.monto) })),
  }));
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [guardado, setGuardado] = useState(false);

  const cambiar = (campo, valor) => { setForm((f) => ({ ...f, [campo]: valor })); setGuardado(false); };
  const fila = (campo, i, parche) => cambiar(campo, form[campo].map((x, j) => (j === i ? { ...x, ...parche } : x)));
  const quitar = (campo, i) => cambiar(campo, form[campo].filter((_, j) => j !== i));

  const guardar = async () => {
    if (form.suspensiones.some((s) => !s.tipo || !(Number(s.dias) >= 1)) || form.adicionales.some((a) => !a.codigo || !(Number(a.monto) > 0))) {
      return setError("Completa o quita las filas vacías.");
    }
    setGuardando(true);
    setError("");
    try {
      const r = await fetchAuth(`/planilla/boletas/${boleta._id}`, { method: "PUT", body: JSON.stringify({
        asistencia: { suspensiones: form.suspensiones.map((s) => ({ tipo: s.tipo, dias: Number(s.dias) })), horasExtras25: Number(form.horasExtras25) || 0, horasExtras35: Number(form.horasExtras35) || 0 },
        adicionales: form.adicionales.map((a) => ({ codigo: a.codigo, monto: Number(a.monto) })),
      }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) return setError(d.mensaje || "No se pudo guardar la boleta.");
      setBoleta(d);
      setGuardado(true);
      onCambio();
    } catch {
      setError("Error de conexión con el servidor.");
    } finally {
      setGuardando(false);
    }
  };

  const d = boleta.datos, q = boleta.quinta;
  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center bg-black/50 p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-4xl space-y-4 my-6">
        <div className="flex items-start gap-3">
          <div className="flex-1">
            <h3 className="font-semibold text-gray-800">{d.nombre}</h3>
            <p className="text-xs text-gray-500">
              {d.numDoc} · {d.cargo || "Sin cargo"} · Básico {money(d.remuneracionBasica)}{d.asignacionFamiliar ? " + asignación familiar" : ""} · {textoPension(d.pension, catalogos.afps)}
            </p>
          </div>
          <button onClick={() => generarBoletaPdf(boleta, { empleador: catalogos.empleador, afps: catalogos.afps })}
            className="border border-gray-300 text-gray-700 px-3 py-1.5 rounded-lg text-sm hover:bg-gray-50">Boleta PDF</button>
        </div>

        <div className="grid md:grid-cols-2 gap-5">
          <section className="space-y-2">
            <h4 className="text-xs font-bold text-gray-600 uppercase">Asistencia del mes</h4>
            {form.suspensiones.map((s, i) => (
              <div key={i} className="flex gap-2 items-center">
                <select value={s.tipo} disabled={!editable} onChange={(e) => fila("suspensiones", i, { tipo: e.target.value })} className={`${INP} flex-1 min-w-0`}>
                  <option value="">Motivo…</option>
                  {Object.entries(catalogos.suspensiones).map(([codigo, x]) => <option key={codigo} value={codigo}>{x.nombre}{x.pagada ? "" : " (no se paga)"}</option>)}
                </select>
                <input value={s.dias} disabled={!editable} onChange={(e) => fila("suspensiones", i, { dias: e.target.value.replace(/\D/g, "") })} placeholder="Días" inputMode="numeric" className={`${INP} w-16 text-right`} />
                {editable && <button onClick={() => quitar("suspensiones", i)} className="text-xs text-red-600 hover:underline">Quitar</button>}
              </div>
            ))}
            {editable && <button onClick={() => cambiar("suspensiones", [...form.suspensiones, { tipo: "", dias: "" }])} className="text-xs text-purple-600 hover:underline">+ Días no laborados (faltas, vacaciones, licencias)</button>}
            <div className="flex gap-3">
              <label className="text-xs text-gray-500">Horas extras al 25 %
                <input value={form.horasExtras25} disabled={!editable} onChange={(e) => cambiar("horasExtras25", e.target.value)} inputMode="decimal" className={`${INP} block w-28 text-right`} />
              </label>
              <label className="text-xs text-gray-500">Horas extras al 35 %
                <input value={form.horasExtras35} disabled={!editable} onChange={(e) => cambiar("horasExtras35", e.target.value)} inputMode="decimal" className={`${INP} block w-28 text-right`} />
              </label>
            </div>
            <p className="text-[11px] text-gray-400">Las dos primeras horas extras del día van al 25 % y las siguientes al 35 %.</p>

            <h4 className="text-xs font-bold text-gray-600 uppercase pt-2">Otros conceptos del mes</h4>
            {form.adicionales.map((a, i) => (
              <div key={i} className="flex gap-2 items-center">
                <select value={a.codigo} disabled={!editable} onChange={(e) => fila("adicionales", i, { codigo: e.target.value })} className={`${INP} flex-1 min-w-0`}>
                  <option value="">Concepto…</option>
                  {catalogos.conceptos.map((c) => <option key={c.codigo} value={c.codigo}>{c.codigo} {c.nombre}{c.tipo === "descuento" ? " (descuento)" : ""}</option>)}
                </select>
                <input value={a.monto} disabled={!editable} onChange={(e) => fila("adicionales", i, { monto: e.target.value })} placeholder="S/" inputMode="decimal" className={`${INP} w-24 text-right`} />
                {editable && <button onClick={() => quitar("adicionales", i)} className="text-xs text-red-600 hover:underline">Quitar</button>}
              </div>
            ))}
            {editable && <button onClick={() => cambiar("adicionales", [...form.adicionales, { codigo: "", monto: "" }])} className="text-xs text-purple-600 hover:underline">+ Ingreso o descuento (comisión, gratificación, adelanto…)</button>}
          </section>

          <section className="space-y-3">
            <h4 className="text-xs font-bold text-gray-600 uppercase">Cálculo {guardado ? "(actualizado)" : ""}</h4>
            <p className="text-xs text-gray-500">Días pagados: {boleta.dias?.remunerados} de 30 · Horas ordinarias: {boleta.horas?.ordinarias}</p>
            {Object.entries(TIPOS_CONCEPTO).map(([tipo, titulo]) => {
              const lista = boleta.conceptos.filter((c) => c.tipo === tipo);
              return lista.length ? (
                <table key={tipo} className="w-full text-sm">
                  <thead><tr className="text-left text-xs text-gray-500 border-b"><th className="py-1" colSpan={2}>{titulo}</th></tr></thead>
                  <tbody>
                    {lista.map((c) => (
                      <tr key={c.codigo} className="border-b border-gray-100">
                        <td className="py-1 pr-2"><span className="font-mono text-xs text-gray-400 mr-1">{/^\d/.test(c.codigo) ? c.codigo : ""}</span>{c.nombre}</td>
                        <td className="py-1 text-right tabular-nums whitespace-nowrap">{money(c.monto)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : null;
            })}
            <p className="text-sm font-semibold text-gray-800 flex justify-between border-t pt-2"><span>Neto a pagar</span><span>{money(boleta.totales.neto)}</span></p>
            {q && (
              <p className="text-[11px] text-gray-400">
                Renta de 5.ª: proyección anual {money(q.brutaAnual)} (mes y anteriores {money(q.brutaAnual - q.proyectada - q.gratificaciones)}, por cobrar {money(q.proyectada)}, gratificaciones {money(q.gratificaciones)})
                − 7 UIT {money(q.deduccion)} = {money(q.netaAnual)}; impuesto del año {money(q.impuestoAnual)}, ya retenido {money(q.retenido)}, dividido entre {q.divisor}
                {q.adicional ? `; más ${money(q.adicional)} por pagos extraordinarios` : ""}.
              </p>
            )}
          </section>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-3">
          <button onClick={onClose} className="border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm hover:bg-gray-50">Cerrar</button>
          {editable && (
            <button onClick={guardar} disabled={guardando} className="bg-purple-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-purple-700 disabled:opacity-50">
              {guardando ? "Calculando…" : "Guardar y recalcular"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
