import { useState } from "react";
import { fetchAuth } from "../../utils/fetchAuth";
import { money } from "../../utils/compras";
import { TIPOS_CONCEPTO, textoPension, detalleGratificacion, detalleSubsidio, ROTULOS_PROVISION } from "../../utils/planilla";
import EtiquetaPlame, { LeyendaPlame } from "./EtiquetaPlame";
import { generarBoletaPdf } from "../../utils/boletaPdf";
import { validarDiasVendidos } from "../../utils/vacaciones";

const SE_PAGAN_CON_FACTURA = ["0803", "0805", "0810"];
const INP = "border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300 disabled:bg-gray-50";

// Boleta de un trabajador: se digitan la asistencia y los conceptos del mes; el servidor recalcula al guardar.
export default function ModalBoleta({ boleta: inicial, catalogos, editable, borrador, onClose, onCambio }) {
  const [boleta, setBoleta] = useState(inicial);
  const [form, setForm] = useState(() => ({
    suspensiones: (inicial.asistencia?.suspensiones || []).map((s) => ({ tipo: s.tipo, dias: String(s.dias) })),
    horasExtras25: String(inicial.asistencia?.horasExtras25 || ""), horasExtras35: String(inicial.asistencia?.horasExtras35 || ""),
    diasVendidos: String(inicial.asistencia?.diasVendidos || ""),
    minutosTardanza: String(inicial.asistencia?.minutosTardanza || ""),
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
    const errorVenta = validarDiasVendidos(form.diasVendidos);
    if (errorVenta) return setError(errorVenta);
    setGuardando(true);
    setError("");
    try {
      const r = await fetchAuth(`/planilla/boletas/${boleta._id}`, { method: "PUT", body: JSON.stringify({
        asistencia: { suspensiones: form.suspensiones.map((s) => ({ tipo: s.tipo, dias: Number(s.dias) })), horasExtras25: Number(form.horasExtras25) || 0, horasExtras35: Number(form.horasExtras35) || 0, diasVendidos: Number(form.diasVendidos) || 0, minutosTardanza: Number(form.minutosTardanza) || 0 },
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
  const noImportar = catalogos.plame?.noImportar || [];
  const grat = detalleGratificacion(boleta.gratificacion);
  const subsidio = detalleSubsidio(boleta.subsidio);
  const primerSubsidio = subsidio?.items[0]?.codigo;
  const provisiones = boleta.provisiones || [], consumos = boleta.consumos || [];
  const mesAnio = (p) => `${p.slice(4)}/${p.slice(0, 4)}`;
  const rotulo = (x) => `${ROTULOS_PROVISION[x.tipo] || x.tipo}${x.periodo ? ` (${x.tipo === "cts" ? "depósito" : "pago"} ${mesAnio(x.periodo)})` : ""}`;
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
          <button onClick={() => generarBoletaPdf(boleta, { empleador: catalogos.empleador, afps: catalogos.afps, borrador })}
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
            <div className="flex gap-3 flex-wrap">
              <label className="text-xs text-gray-500">Horas extras al 25 %
                <input value={form.horasExtras25} disabled={!editable} onChange={(e) => cambiar("horasExtras25", e.target.value)} inputMode="decimal" className={`${INP} block w-28 text-right`} />
              </label>
              <label className="text-xs text-gray-500">Horas extras al 35 %
                <input value={form.horasExtras35} disabled={!editable} onChange={(e) => cambiar("horasExtras35", e.target.value)} inputMode="decimal" className={`${INP} block w-28 text-right`} />
              </label>
              <label className="text-xs text-gray-500">Días de vacaciones vendidos
                <input value={form.diasVendidos} disabled={!editable} onChange={(e) => cambiar("diasVendidos", e.target.value.replace(/\D/g, ""))} inputMode="numeric" className={`${INP} block w-28 text-right`} />
              </label>
              <label className="text-xs text-gray-500">Tardanza (minutos)
                <input value={form.minutosTardanza} disabled={!editable} onChange={(e) => cambiar("minutosTardanza", e.target.value.replace(/\D/g, ""))} inputMode="numeric" className={`${INP} block w-28 text-right`} />
              </label>
            </div>
            <p className="text-[11px] text-gray-400">Las dos primeras horas extras del día van al 25 % y las siguientes al 35 %. Los días vendidos se pagan como compensación vacacional (0117). Los minutos de tardanza solo se informan en el reporte del mes: el descuento se registra como concepto 0704.</p>

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
            {editable && <button onClick={() => cambiar("adicionales", [...form.adicionales, { codigo: "", monto: "" }])} className="text-xs text-purple-600 hover:underline">+ Ingreso o descuento (comisión, bono, descuento…)</button>}
            <p className="text-[11px] text-gray-400">El adelanto (0701) no se digita aquí: sale de los lotes de adelanto confirmados en Abonos al banco.</p>
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
                        <td className="py-1 pr-2"><span className="font-mono text-xs text-gray-400 mr-1">{/^\d/.test(c.codigo) ? c.codigo : ""}</span>{c.nombre}<EtiquetaPlame codigo={c.codigo} noImportar={noImportar} />{c.calculado && <span className="ml-1.5 text-[10px] text-green-700">calculado</span>}
                          {SE_PAGAN_CON_FACTURA.includes(c.codigo) && <span className="block text-[11px] text-gray-400">se paga con la factura de la aseguradora</span>}
                          {c.calculado && c.codigo === "0406" && grat && (
                            <span className="block text-[11px] text-gray-400">
                              {grat.formula}
                              {grat.avisos.map((a, i) => <span key={i} className="block text-amber-700">{a}</span>)}
                            </span>
                          )}
                          {c.calculado && c.codigo === "0312" && grat?.bonificacion && <span className="block text-[11px] text-gray-400">{grat.bonificacion}</span>}
                          {subsidio?.items.filter((x) => x.codigo === c.codigo).map((x, i) => <span key={i} className="block text-[11px] text-gray-400">{x.texto}</span>)}
                          {c.codigo === primerSubsidio && subsidio.avisos.map((a, i) => <span key={i} className="block text-[11px] text-amber-700">{a}</span>)}</td>
                        <td className="py-1 text-right tabular-nums whitespace-nowrap">{money(c.monto)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : null;
            })}
            <p className="text-sm font-semibold text-gray-800 flex justify-between border-t pt-2"><span>Neto a pagar</span><span>{money(boleta.totales.neto)}</span></p>
            {(provisiones.length > 0 || consumos.length > 0) && (
              <div className="border border-gray-200 rounded-lg px-3 py-2 space-y-1">
                <p className="text-xs font-bold text-gray-600 uppercase">Provisiones del mes (solo lectura)<EtiquetaPlame destino="no" texto="No va al PLAME (informativo)" /></p>
                <table className="w-full text-sm">
                  <tbody>
                    {provisiones.map((x, i) => (
                      <tr key={i} className="border-b border-gray-100">
                        <td className="py-1 pr-2">{rotulo(x)}<span className="block text-[11px] text-gray-400">Acumulado {money(x.devengado)}{x.monto < 0 ? " · reversión del mes" : ""}</span>
                          {x.aviso && <span className="block text-[11px] text-amber-700">{x.aviso}</span>}</td>
                        <td className="py-1 text-right tabular-nums whitespace-nowrap">{money(x.monto)}</td>
                      </tr>
                    ))}
                    {consumos.map((x, i) => (
                      <tr key={`c${i}`} className="border-b border-gray-100 text-gray-600">
                        <td className="py-1 pr-2">Pagado contra la provisión: {rotulo(x)}{x.reversion ? <span className="block text-[11px] text-gray-400">Saldo devuelto al gasto: {money(x.reversion)}</span> : null}</td>
                        <td className="py-1 text-right tabular-nums whitespace-nowrap">{money(x.monto)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="text-[11px] text-gray-400">Son estimaciones contables del gasto: no cambian el neto, las bases ni la boleta que recibe el trabajador.</p>
              </div>
            )}
            <LeyendaPlame />
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
