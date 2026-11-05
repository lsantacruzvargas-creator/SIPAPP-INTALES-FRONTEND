import { useState, useEffect, useCallback } from "react";
import * as XLSX from "xlsx";
import { fetchAuth } from "../../utils/fetchAuth";
import { formatearFecha } from "../../utils/fecha";
import { ESTADOS_PERIODO, fechaDMA, validarAjuste, filasExcelVacaciones } from "../../utils/vacaciones";
import TablaScroll from "../TablaScroll";
import ConfirmacionAccion from "../ConfirmacionAccion";

const INP = "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300 disabled:bg-gray-50";
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "setiembre", "octubre", "noviembre", "diciembre"];
const MENSAJE_RED = "Error de conexión con el servidor.";

const dias = (n) => String(n).replace(".", ",");
const mesDMA = (p) => `${p.slice(4)}/${p.slice(0, 4)}`;
const textoMes = (p) => `${MESES[Number(p.slice(4)) - 1]} de ${p.slice(0, 4)}`;
const entero = (v) => /^-?\d+$/.test(String(v).trim()) && Math.abs(Number(v)) <= 60;

function Estado({ valor }) {
  const e = ESTADOS_PERIODO[valor] || { texto: valor, clase: "bg-gray-100 text-gray-600" };
  return <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium whitespace-nowrap ${e.clase}`}>{e.texto}</span>;
}

function Avisos({ avisos }) {
  if (!avisos?.length) return null;
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-sm text-amber-800 space-y-1">
      {avisos.map((a, i) => <p key={i}>{a}</p>)}
    </div>
  );
}

function ModalAjuste({ detalle, onCerrar, onGuardado }) {
  const [form, setForm] = useState({ periodoInicio: "", dias: "", motivo: "" });
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const cambiar = (campo, valor) => setForm((f) => ({ ...f, [campo]: valor }));

  const guardar = async () => {
    const invalido = validarAjuste(form);
    if (invalido) return setError(invalido);
    setGuardando(true);
    setError("");
    try {
      const r = await fetchAuth(`/planilla/vacaciones/${detalle.trabajador._id}/ajustes`, {
        method: "POST", body: JSON.stringify({ periodoInicio: form.periodoInicio, dias: Number(form.dias), motivo: form.motivo.trim() }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) return setError(d.mensaje || "No se pudo guardar el ajuste.");
      onGuardado(d);
    } catch {
      setError(MENSAJE_RED);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/50 p-4" style={{ zIndex: 200 }}>
      <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md space-y-4">
        <h4 className="font-semibold text-gray-800 text-sm">Ajustar días — {detalle.trabajador.nombre}</h4>
        <p className="text-xs text-gray-500">Suma o resta días al derecho de un periodo (por ejemplo, un goce anterior al sistema). Usa un número negativo para restar.</p>
        <label className="text-xs text-gray-500 block">Periodo
          <select value={form.periodoInicio} onChange={(e) => cambiar("periodoInicio", e.target.value)} className={INP}>
            <option value="">Elige el periodo…</option>
            {detalle.periodos.map((p) => <option key={p.inicio} value={p.inicio}>{fechaDMA(p.inicio)} – {fechaDMA(p.fin)}</option>)}
          </select>
        </label>
        <label className="text-xs text-gray-500 block">Días (+ o −)
          <input value={form.dias} onChange={(e) => cambiar("dias", e.target.value.replace(/[^\d-]/g, ""))} inputMode="numeric" className={INP} />
        </label>
        <label className="text-xs text-gray-500 block">Motivo
          <input value={form.motivo} maxLength={200} onChange={(e) => cambiar("motivo", e.target.value)} className={INP} />
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-3">
          <button onClick={onCerrar} disabled={guardando} className="border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50">Cancelar</button>
          <button onClick={guardar} disabled={guardando} className="bg-purple-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-purple-700 disabled:opacity-50">
            {guardando ? "Guardando…" : "Guardar ajuste"}
          </button>
        </div>
      </div>
    </div>
  );
}

// Lo que quedaba pendiente por periodo antes de la primera planilla del sistema; el goce y la venta del sistema se descuentan después.
function ModalCargaInicial({ detalle, onCerrar, onGuardado }) {
  const primerDia = `${detalle.corte.slice(0, 4)}-${detalle.corte.slice(4)}-01`;
  const periodos = detalle.periodos.filter((p) => p.ganado && !p.liquidado && p.fin < primerDia);
  const [valores, setValores] = useState(() => Object.fromEntries(periodos.map((p) => [p.inicio, String(p.derecho + p.ajustes)])));
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const { cargaInicial } = detalle.trabajador;

  const guardar = async () => {
    if (periodos.some((p) => !entero(valores[p.inicio]))) return setError("Los días pendientes de cada periodo deben ser enteros entre -60 y 60.");
    setGuardando(true);
    setError("");
    try {
      const r = await fetchAuth(`/planilla/vacaciones/${detalle.trabajador._id}/carga-inicial`, {
        method: "POST", body: JSON.stringify({ saldos: periodos.map((p) => ({ periodoInicio: p.inicio, pendientes: Number(valores[p.inicio]) })) }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) return setError(d.mensaje || "No se pudo guardar la carga inicial.");
      onGuardado(d);
    } catch {
      setError(MENSAJE_RED);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 flex items-start justify-center bg-black/50 p-4 overflow-y-auto" style={{ zIndex: 200 }}>
      <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-3xl space-y-4 my-6">
        <h4 className="font-semibold text-gray-800 text-sm">Carga inicial — {detalle.trabajador.nombre}</h4>
        <p className="text-xs text-gray-500">
          Indica cuántos días quedaban pendientes de cada periodo ganado antes de {textoMes(detalle.corte)}, el mes de la primera planilla del sistema.
          Cada diferencia con el derecho queda como un ajuste «Carga inicial». El goce y la venta que ya hay en el sistema se descuentan aparte.
        </p>
        {cargaInicial && (
          <p className="text-xs text-gray-500">Ya se cargó el {formatearFecha(cargaInicial.en, { day: "2-digit", month: "2-digit", year: "numeric" })} por {cargaInicial.por}. Si vuelves a guardar, solo se ajusta la diferencia.</p>
        )}
        {periodos.length === 0 ? (
          <p className="text-sm text-gray-600">No hay periodos ganados antes de {textoMes(detalle.corte)}: no hay saldos que cargar. Confirma para dejar la carga inicial como hecha.</p>
        ) : (
          <TablaScroll className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 border-b">
                  <th className="py-1 pr-2">Periodo</th>
                  <th className="pr-2 text-right">Derecho</th>
                  <th className="pr-2 text-right">Gozado en el sistema</th>
                  <th className="pr-2 text-right">Vendido en el sistema</th>
                  <th className="text-right">Pendientes antes de {textoMes(detalle.corte)}</th>
                </tr>
              </thead>
              <tbody>
                {periodos.map((p) => (
                  <tr key={p.inicio} className="border-b border-gray-100">
                    <td className="py-1.5 pr-2 whitespace-nowrap">{fechaDMA(p.inicio)} – {fechaDMA(p.fin)}</td>
                    <td className="pr-2 text-right tabular-nums">{dias(p.derecho)}</td>
                    <td className="pr-2 text-right tabular-nums">{dias(p.gozados)}</td>
                    <td className="pr-2 text-right tabular-nums">{dias(p.vendidos)}</td>
                    <td className="text-right">
                      <input value={valores[p.inicio]} onChange={(e) => { setValores((v) => ({ ...v, [p.inicio]: e.target.value.replace(/[^\d-]/g, "") })); }}
                        inputMode="numeric" className={`${INP} w-24 text-right`} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TablaScroll>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-3">
          <button onClick={onCerrar} disabled={guardando} className="border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50">Cancelar</button>
          <button onClick={guardar} disabled={guardando} className="bg-purple-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-purple-700 disabled:opacity-50">
            {guardando ? "Guardando…" : "Guardar carga inicial"}
          </button>
        </div>
      </div>
    </div>
  );
}

function TablaAjustes({ ajustes, mostrarPeriodo, puedeEscribir, onBorrar }) {
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="text-left text-gray-500 border-b">
          {mostrarPeriodo && <th className="py-1 pr-2">Periodo</th>}
          <th className="py-1 pr-2 text-right">Días</th><th className="pr-2">Motivo</th><th className="pr-2">Por</th><th className="pr-2">Fecha</th>{puedeEscribir && <th />}
        </tr>
      </thead>
      <tbody>
        {ajustes.map((a) => (
          <tr key={a._id} className="border-b border-gray-100">
            {mostrarPeriodo && <td className="py-1 pr-2 whitespace-nowrap">{fechaDMA(a.periodoInicio)}</td>}
            <td className="py-1 pr-2 text-right tabular-nums">{a.dias > 0 ? `+${a.dias}` : a.dias}</td>
            <td className="pr-2">{a.motivo}</td>
            <td className="pr-2">{a.creadoPor}</td>
            <td className="pr-2 whitespace-nowrap">{formatearFecha(a.createdAt, { day: "2-digit", month: "2-digit", year: "numeric" })}</td>
            {puedeEscribir && <td className="text-right"><button onClick={() => onBorrar(a)} className="text-red-600 hover:underline">Borrar</button></td>}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ModalDetalle({ id, puedeEscribir, onCerrar, onCambio }) {
  const [detalle, setDetalle] = useState(null);
  const [error, setError] = useState("");
  const [modal, setModal] = useState(null); // "ajuste" | "carga"
  const [borrar, setBorrar] = useState(null);
  const [borrando, setBorrando] = useState(false);

  useEffect(() => {
    let vigente = true;
    fetchAuth(`/planilla/vacaciones/${id}`)
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!vigente) return;
        if (r.ok) setDetalle(d); else setError(d.mensaje || "No se pudo cargar el detalle de vacaciones.");
      })
      .catch(() => { if (vigente) setError(MENSAJE_RED); });
    return () => { vigente = false; };
  }, [id]);

  const recibir = (d) => { setDetalle(d); setModal(null); setError(""); onCambio(); };

  const confirmarBorrado = async () => {
    setBorrando(true);
    try {
      const r = await fetchAuth(`/planilla/vacaciones/${id}/ajustes/${borrar._id}`, { method: "DELETE" });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) setError(d.mensaje || "No se pudo borrar el ajuste.");
      else recibir(d);
    } catch {
      setError(MENSAJE_RED);
    } finally {
      setBorrando(false);
      setBorrar(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center bg-black/50 p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-5xl space-y-4 my-6">
        {!detalle ? (
          <>
            {error ? <p className="text-sm text-red-600">{error}</p> : <p className="text-sm text-gray-400">Cargando…</p>}
            <div className="flex justify-end"><button onClick={onCerrar} className="border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm hover:bg-gray-50">Cerrar</button></div>
          </>
        ) : (
          <>
            <div className="flex items-start gap-3 flex-wrap">
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-gray-800">{detalle.trabajador.nombre}</h3>
                <p className="text-xs text-gray-500">
                  {detalle.trabajador.numDoc} · Ingreso {fechaDMA(detalle.trabajador.fechaIngreso)} · {dias(detalle.diasPorAnio)} días por periodo, tope de venta {dias(detalle.topeVenta)} días
                </p>
                <p className="text-sm text-gray-700 mt-1">
                  Pendientes: <b>{dias(detalle.pendientes)}</b> · Próximo vencimiento: <b>{fechaDMA(detalle.proximoVencimiento)}</b>
                </p>
              </div>
              {puedeEscribir && (
                <div className="flex gap-2">
                  <button onClick={() => setModal("ajuste")} className="border border-gray-300 text-gray-700 px-3 py-1.5 rounded-lg text-sm hover:bg-gray-50">Ajustar días</button>
                  <button onClick={() => setModal("carga")}
                    className={detalle.cargado ? "border border-gray-300 text-gray-700 px-3 py-1.5 rounded-lg text-sm hover:bg-gray-50" : "bg-purple-600 text-white px-3 py-1.5 rounded-lg text-sm hover:bg-purple-700"}>
                    Carga inicial
                  </button>
                </div>
              )}
            </div>
            <Avisos avisos={detalle.avisos} />
            {error && <p className="text-sm text-red-600">{error}</p>}

            <TablaScroll className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-500 border-b">
                    <th className="py-1 pr-2">Periodo</th>
                    {["Derecho", "Gozados", "Vendidos", "Ajustes", "Saldo"].map((h) => <th key={h} className="pr-2 text-right">{h}</th>)}
                    <th className="pr-2">Vence</th><th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {detalle.periodos.map((p) => (
                    <FilaPeriodo key={p.inicio} p={p} topeVenta={detalle.topeVenta} puedeEscribir={puedeEscribir} onBorrar={setBorrar} />
                  ))}
                </tbody>
              </table>
            </TablaScroll>

            {detalle.huerfanos.length > 0 && (
              <section className="border border-amber-200 bg-amber-50 rounded-lg p-3 space-y-2">
                <h4 className="text-xs font-bold text-amber-800 uppercase">Ajustes sin periodo</h4>
                <p className="text-[11px] text-amber-800">Corresponden a un periodo que ya no existe (por ejemplo, tras cambiar la fecha de ingreso): no suman al saldo.</p>
                <TablaAjustes ajustes={detalle.huerfanos} mostrarPeriodo puedeEscribir={puedeEscribir} onBorrar={setBorrar} />
              </section>
            )}

            <div className="flex justify-end">
              <button onClick={onCerrar} className="border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm hover:bg-gray-50">Cerrar</button>
            </div>
          </>
        )}
      </div>
      {detalle && modal === "ajuste" && <ModalAjuste detalle={detalle} onCerrar={() => setModal(null)} onGuardado={recibir} />}
      {detalle && modal === "carga" && <ModalCargaInicial detalle={detalle} onCerrar={() => setModal(null)} onGuardado={recibir} />}
      {borrar && (
        <ConfirmacionAccion mensaje={`¿Borrar el ajuste de ${borrar.dias > 0 ? "+" : ""}${borrar.dias} días («${borrar.motivo}»)?`} textoConfirmar="Borrar"
          procesando={borrando} onCancelar={() => setBorrar(null)} onConfirmar={confirmarBorrado} />
      )}
    </div>
  );
}

function FilaPeriodo({ p, topeVenta, puedeEscribir, onBorrar }) {
  const hayDetalle = p.imputaciones.length > 0 || p.detalleAjustes.length > 0;
  return (
    <>
      <tr className={hayDetalle ? "" : "border-b border-gray-100"}>
        <td className="py-1.5 pr-2 whitespace-nowrap">{fechaDMA(p.inicio)} – {fechaDMA(p.fin)}</td>
        <td className="pr-2 text-right tabular-nums">{dias(p.derecho)}</td>
        <td className="pr-2 text-right tabular-nums">{dias(p.gozados)}</td>
        <td className={`pr-2 text-right tabular-nums ${p.vendidos > topeVenta ? "text-amber-700 font-semibold" : ""}`} title={p.vendidos > topeVenta ? `Supera el tope de venta (${dias(topeVenta)} días)` : undefined}>{dias(p.vendidos)}</td>
        <td className="pr-2 text-right tabular-nums">{p.ajustes > 0 ? `+${p.ajustes}` : p.ajustes}</td>
        <td className={`pr-2 text-right tabular-nums font-semibold ${p.saldo < 0 ? "text-red-600" : ""}`}>{dias(p.saldo)}</td>
        <td className="pr-2 whitespace-nowrap">{fechaDMA(p.vence)}</td>
        <td><Estado valor={p.estado} /></td>
      </tr>
      {hayDetalle && (
        <tr className="border-b border-gray-100">
          <td colSpan={8} className="pb-2 pl-4 space-y-1.5">
            {p.imputaciones.length > 0 && (
              <p className="text-[11px] text-gray-500">
                {p.imputaciones.map((i) => `${mesDMA(i.periodo)}: ${i.tipo === "venta" ? "venta" : "goce"} ${dias(i.dias)}`).join(" · ")}
              </p>
            )}
            {p.detalleAjustes.length > 0 && <TablaAjustes ajustes={p.detalleAjustes} puedeEscribir={puedeEscribir} onBorrar={onBorrar} />}
          </td>
        </tr>
      )}
    </>
  );
}

// Saldo de vacaciones por trabajador activo. Solo avisa: nunca bloquea el goce ni la venta. Lo ven admin, jefatura y contador; escriben admin y contador.
export default function PanelVacaciones({ puedeEscribir, onAvisos }) {
  const [lista, setLista] = useState(null);
  const [error, setError] = useState("");
  const [abierto, setAbierto] = useState(null);

  const cargar = useCallback(async () => {
    try {
      const r = await fetchAuth("/planilla/vacaciones");
      const d = await r.json().catch(() => ({}));
      if (!r.ok) return setError(d.mensaje || "No se pudo cargar las vacaciones.");
      setError("");
      setLista(d);
      onAvisos?.(d.avisos.length);
    } catch {
      setError(MENSAJE_RED);
    }
  }, [onAvisos]);
  useEffect(() => { const t = setTimeout(cargar, 0); return () => clearTimeout(t); }, [cargar]);

  const exportar = () => {
    const ws = XLSX.utils.json_to_sheet(filasExcelVacaciones(lista.trabajadores));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Vacaciones");
    XLSX.writeFile(wb, "vacaciones.xlsx");
  };

  if (!lista) return error ? <p className="text-sm text-red-600">{error}</p> : <p className="text-sm text-gray-400">Cargando…</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 flex-wrap">
        <p className="flex-1 min-w-0 text-sm text-gray-500">
          Saldo de vacaciones de los trabajadores activos: {dias(lista.diasPorAnio)} días por periodo, tope de venta {dias(lista.topeVenta)} días.
          El sistema avisa, pero no impide el goce ni la venta cuando falta saldo.
        </p>
        <button onClick={exportar} disabled={lista.trabajadores.length === 0} className="border border-gray-300 text-gray-700 px-3 py-1.5 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50">Exportar Excel</button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <Avisos avisos={lista.avisos} />
      <TablaScroll className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-gray-500 border-b">
              <th className="py-1 pr-2">Trabajador</th><th className="pr-2">Documento</th><th className="pr-2">Ingreso</th>
              <th className="pr-2 text-right">Días pendientes</th><th className="pr-2">Próximo vencimiento</th><th className="pr-2">Avisos</th><th />
            </tr>
          </thead>
          <tbody>
            {lista.trabajadores.map((t) => (
              <tr key={t._id} className="border-b border-gray-100 align-top">
                <td className="py-1.5 pr-2 font-medium text-gray-800">{t.nombre}</td>
                <td className="pr-2">{t.numDoc}</td>
                <td className="pr-2 whitespace-nowrap">{fechaDMA(t.fechaIngreso)}</td>
                <td className="pr-2 text-right tabular-nums">{dias(t.pendientes)}</td>
                <td className="pr-2 whitespace-nowrap">{fechaDMA(t.proximoVencimiento)}</td>
                <td className="pr-2 text-xs text-amber-800">{t.avisos.map((a, i) => <span key={i} className="block">{a}</span>)}</td>
                <td className="text-right"><button onClick={() => setAbierto(t._id)} className="text-xs text-purple-600 hover:underline">Ver detalle</button></td>
              </tr>
            ))}
            {lista.trabajadores.length === 0 && <tr><td colSpan={7} className="py-4 text-center text-sm text-gray-400">No hay trabajadores activos.</td></tr>}
          </tbody>
        </table>
      </TablaScroll>
      {abierto && <ModalDetalle id={abierto} puedeEscribir={puedeEscribir} onCerrar={() => setAbierto(null)} onCambio={cargar} />}
    </div>
  );
}
