import { useState, useEffect, useCallback } from "react";
import { fetchAuth } from "../../utils/fetchAuth";
import { money } from "../../utils/compras";
import { fechaHoyLima, formatearFechaHora } from "../../utils/fecha";
import { opcionesDeposito, totalesCts, filaEditable, cuerpoGuardarCts, hayCambiosCts, hojasDisponibles, avisosDescargaHojasCts } from "../../utils/cts";
import { generarHojaCtsPdf, zipHojasCts } from "../../utils/ctsPdf";
import TablaScroll from "../TablaScroll";
import ConfirmacionAccion from "../ConfirmacionAccion";

const INP = "border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300 disabled:bg-gray-50 disabled:text-gray-700";
const NUM = `${INP} w-24 text-right tabular-nums`;
const MENSAJE_RED = "Error de conexión con el servidor.";
const ESTADOS = {
  borrador: { texto: "Borrador", clase: "bg-amber-100 text-amber-800" },
  confirmado: { texto: "Confirmado", clase: "bg-green-100 text-green-800" },
  anulado: { texto: "Anulado", clase: "bg-gray-100 text-gray-600" },
};
const CAMPOS_ENTEROS = [["meses", "Meses"], ["dias", "Días"], ["noComputables", "No comput."]];

const cuando = (f) => formatearFechaHora(f, { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
const soloImporte = (v) => v.replace(/[^\d.]/g, "");
const soloEntero = (v) => v.replace(/\D/g, "");

function ModalAnular({ deposito, onCancelar, onAnulado }) {
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState("");
  const [procesando, setProcesando] = useState(false);

  const anular = async () => {
    const texto = motivo.trim();
    if (texto.length < 3) return setError("Escribe el motivo (de 3 a 200 caracteres).");
    setProcesando(true);
    setError("");
    try {
      const r = await fetchAuth(`/planilla/cts/${deposito._id}/anular`, { method: "POST", body: JSON.stringify({ motivo: texto }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) return setError(d.mensaje || "No se pudo anular el depósito.");
      onAnulado(d);
    } catch {
      setError(MENSAJE_RED);
    } finally {
      setProcesando(false);
    }
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/50 p-4" style={{ zIndex: 200 }}>
      <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-sm space-y-4">
        <h4 className="font-semibold text-gray-800 text-sm">Anular el depósito {deposito.codigo}</h4>
        <p className="text-sm text-gray-600">Se quita el depósito de las boletas del mes y su asiento (si aún no está contabilizado). Después puedes calcular otro.</p>
        <label className="text-xs text-gray-500 block">Motivo
          <textarea autoFocus value={motivo} maxLength={200} rows={3} onChange={(e) => setMotivo(e.target.value)} className={`${INP} w-full resize-none`} />
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onCancelar} disabled={procesando} className="border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50">Cancelar</button>
          <button type="button" onClick={anular} disabled={procesando} className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-red-700 disabled:opacity-50">
            {procesando ? "Anulando…" : "Anular"}
          </button>
        </div>
      </div>
    </div>
  );
}

// CTS semestral (spec 2026-11-07 §6): el servidor calcula el depósito; aquí se revisa, se corrige, se confirma y se imprimen las hojas.
export default function PanelCts({ catalogos, puedeEscribir, onCambio }) {
  const [anio, setAnio] = useState(() => Number(fechaHoyLima().slice(0, 4)));
  // El depósito que toca: mayo hasta mayo, noviembre desde junio.
  const [periodo, setPeriodo] = useState(() => `${fechaHoyLima().slice(0, 4)}${Number(fechaHoyLima().slice(5, 7)) > 5 ? "11" : "05"}`);
  const [lista, setLista] = useState(null);
  const [idAnulado, setIdAnulado] = useState("");
  const [doc, setDoc] = useState(null);
  const [editables, setEditables] = useState([]);
  const [fechaDeposito, setFechaDeposito] = useState("");
  const [error, setError] = useState("");
  const [avisos, setAvisos] = useState([]);
  const [procesando, setProcesando] = useState(false);
  const [modal, setModal] = useState(null); // "confirmar" | "anular" | "eliminar"
  const [generando, setGenerando] = useState(false);

  const entradas = (lista || []).filter((e) => e.periodo === periodo);
  const vigente = entradas.find((e) => e.estado !== "anulado");
  const anulados = entradas.filter((e) => e.estado === "anulado");
  const idActivo = idAnulado || vigente?._id || "";
  const actual = doc && doc._id === idActivo ? doc : null;
  const editable = puedeEscribir && actual?.estado === "borrador";

  const aplicar = useCallback((d) => {
    setDoc(d);
    setEditables(d.trabajadores.map(filaEditable));
    setFechaDeposito(d.fechaDeposito || "");
  }, []);

  const cargarLista = useCallback(async () => {
    try {
      const r = await fetchAuth(`/planilla/cts?anio=${anio}`);
      const d = await r.json().catch(() => ({}));
      if (r.ok) setLista(d); else setError(d.mensaje || "No se pudo cargar los depósitos de CTS.");
    } catch {
      setError(MENSAJE_RED);
    }
  }, [anio]);
  useEffect(() => { const t = setTimeout(cargarLista, 0); return () => clearTimeout(t); }, [cargarLista]);

  useEffect(() => {
    if (!idActivo) return undefined;
    const t = setTimeout(async () => {
      try {
        const r = await fetchAuth(`/planilla/cts/${idActivo}`);
        const d = await r.json().catch(() => ({}));
        if (r.ok) aplicar(d); else setError(d.mensaje || "No se pudo cargar el depósito.");
      } catch {
        setError(MENSAJE_RED);
      }
    }, 0);
    return () => clearTimeout(t);
  }, [idActivo, aplicar]);

  const elegirAnio = (n) => { setAnio(n); setLista(null); setPeriodo(`${n}${periodo.slice(4)}`); setIdAnulado(""); setError(""); setAvisos([]); };
  const elegirPeriodo = (p) => { setPeriodo(p); setIdAnulado(""); setError(""); setAvisos([]); };

  // Cada llamada del panel: muestra el error del servidor, aplica el documento que devuelve y refresca la lista y el banner.
  const llamar = async (ruta, opciones, textoError) => {
    setProcesando(true);
    setError("");
    setAvisos([]);
    try {
      const r = await fetchAuth(`/planilla/cts${ruta}`, opciones);
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setError(d.mensaje || textoError);
        if (r.status === 409) cargarLista();
        return null;
      }
      return d;
    } catch {
      setError(MENSAJE_RED);
      return null;
    } finally {
      setProcesando(false);
    }
  };
  const terminar = async (d) => {
    if (d.avisos?.length) setAvisos(d.avisos);
    aplicar(d);
    await cargarLista();
    onCambio?.();
  };

  const calcular = async () => {
    const d = await llamar("", { method: "POST", body: JSON.stringify({ periodo }) }, "No se pudo calcular el depósito de CTS.");
    if (d) await terminar(d);
  };
  const guardar = async () => {
    const { error: invalido, trabajadores } = cuerpoGuardarCts(editables);
    if (invalido) return setError(invalido);
    const d = await llamar(`/${actual._id}`, { method: "PUT", body: JSON.stringify({ trabajadores }) }, "No se pudo guardar el depósito.");
    if (d) await terminar(d);
  };
  const recalcular = async () => {
    const d = await llamar(`/${actual._id}/recalcular`, { method: "POST" }, "No se pudo recalcular el depósito.");
    if (d) await terminar(d);
  };
  const confirmar = async () => {
    const d = await llamar(`/${actual._id}/confirmar`, { method: "POST" }, "No se pudo confirmar el depósito.");
    setModal(null);
    if (d) await terminar(d);
  };
  const guardarFecha = async () => {
    const d = await llamar(`/${actual._id}/fecha-deposito`, { method: "PUT", body: JSON.stringify({ fechaDeposito }) }, "No se pudo guardar la fecha de depósito.");
    if (d) await terminar(d);
  };
  const eliminar = async () => {
    const d = await llamar(`/${actual._id}`, { method: "DELETE" }, "No se pudo eliminar el depósito.");
    setModal(null);
    if (!d) return;
    setDoc(null);
    await cargarLista();
    onCambio?.();
  };
  const alAnular = async (d) => {
    setModal(null);
    setIdAnulado(d._id);
    await terminar(d);
  };

  const cambiar = (id, parche) => setEditables((l) => l.map((e) => (e.trabajador === id ? { ...e, ...parche } : e)));
  const descartar = () => { setEditables(actual.trabajadores.map(filaEditable)); setError(""); };

  const descargarZip = async () => {
    setAvisos(avisosDescargaHojasCts(actual));
    setGenerando(true);
    // Cede el hilo para que se pinte «Generando…» antes de que jsPDF bloquee la pantalla.
    await new Promise((r) => setTimeout(r, 30));
    try {
      await zipHojasCts(actual, { empleador: catalogos.empleador });
    } catch (e) {
      console.error(e);
      setError("No se pudieron generar las hojas. Vuelve a intentarlo.");
    } finally {
      setGenerando(false);
    }
  };

  const sucio = actual ? hayCambiosCts(editables, actual.trabajadores) : false;
  const totales = actual ? totalesCts(actual.trabajadores) : null;
  const hojas = actual ? hojasDisponibles(actual) : [];
  const porId = new Map((actual?.trabajadores || []).map((f) => [f.trabajador, f]));
  const estado = actual && ESTADOS[actual.estado];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs text-gray-500">Año
          <select value={anio} onChange={(e) => elegirAnio(Number(e.target.value))} className={`${INP} block`}>
            {Array.from({ length: 5 }, (_, i) => Number(fechaHoyLima().slice(0, 4)) + 1 - i).map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <label className="text-xs text-gray-500">Depósito
          <select value={periodo} onChange={(e) => elegirPeriodo(e.target.value)} className={`${INP} block`}>
            {opcionesDeposito(anio).map((o) => <option key={o.periodo} value={o.periodo}>{o.texto}</option>)}
          </select>
        </label>
        {estado && <span className={`text-xs px-2 py-1 rounded-full mb-1.5 ${estado.clase}`}>{actual.codigo} · {estado.texto}</span>}
        <div className="flex-1" />
        {actual && hojas.length > 0 && (
          <button onClick={descargarZip} disabled={generando} className="border border-gray-300 text-gray-700 px-3 py-2 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50">
            {generando ? "Generando…" : "Hojas de CTS (.zip)"}
          </button>
        )}
        {puedeEscribir && lista && !vigente && !idAnulado && (
          <button onClick={calcular} disabled={procesando} className="bg-purple-600 text-white px-3 py-2 rounded-lg text-sm hover:bg-purple-700 disabled:opacity-50">
            {procesando ? "Calculando…" : "Calcular"}
          </button>
        )}
        {editable && (
          <>
            <button onClick={recalcular} disabled={procesando || sucio} title={sucio ? "Guarda o descarta los cambios antes de recalcular" : ""}
              className="border border-purple-300 text-purple-700 px-3 py-2 rounded-lg text-sm hover:bg-purple-50 disabled:opacity-50">Recalcular</button>
            <button onClick={() => setModal("eliminar")} disabled={procesando} className="border border-red-300 text-red-700 px-3 py-2 rounded-lg text-sm hover:bg-red-50 disabled:opacity-50">Eliminar</button>
            <button onClick={guardar} disabled={procesando || !sucio} className="border border-purple-600 text-purple-700 px-3 py-2 rounded-lg text-sm hover:bg-purple-50 disabled:opacity-50">Guardar</button>
            <button onClick={() => setModal("confirmar")} disabled={procesando || sucio || totales.incluidos === 0}
              title={sucio ? "Guarda los cambios antes de confirmar" : ""} className="bg-purple-600 text-white px-3 py-2 rounded-lg text-sm hover:bg-purple-700 disabled:opacity-50">Confirmar</button>
          </>
        )}
        {puedeEscribir && actual?.estado === "confirmado" && (
          <button onClick={() => setModal("anular")} disabled={procesando} className="border border-red-300 text-red-700 px-3 py-2 rounded-lg text-sm hover:bg-red-50 disabled:opacity-50">Anular</button>
        )}
      </div>

      {error && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
      {avisos.length > 0 && (
        <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex gap-3">
          <ul className="flex-1 list-disc pl-5">{avisos.map((a) => <li key={a}>{a}</li>)}</ul>
          <button onClick={() => setAvisos([])} className="text-xs underline self-start">Cerrar</button>
        </div>
      )}
      {lista && !vigente && !idAnulado && (
        <p className="text-sm text-gray-500">
          {puedeEscribir ? "Aún no hay un depósito de este semestre: «Calcular» arma el borrador con los trabajadores que entran." : "Aún no hay un depósito de este semestre."}
        </p>
      )}
      {anulados.length > 0 && (
        <p className="text-xs text-gray-500">
          Anulados de este semestre:{" "}
          {anulados.map((a) => (
            <button key={a._id} onClick={() => setIdAnulado(a._id)} className="underline mr-2 hover:text-gray-700">{a.codigo}</button>
          ))}
          {idAnulado && <button onClick={() => setIdAnulado("")} className="underline text-purple-700">Cerrar vista</button>}
        </p>
      )}

      {actual && (
        <>
          <div className="text-xs text-gray-500 space-y-0.5">
            {actual.confirmadoEn && <p>Confirmado por {actual.confirmadoPor} el {cuando(actual.confirmadoEn)}.</p>}
            {actual.estado === "anulado" && <p className="text-gray-600">Anulado por {actual.anuladoPor} el {cuando(actual.anuladoEn)}: {actual.motivoAnulacion}</p>}
            {actual.estado === "confirmado" && (
              <p>{actual.asiento ? `Asiento ${actual.asiento.estado}${actual.asiento.estado === "contabilizado" ? ` (${actual.asiento.cuo})` : ""}.` : "Aún sin asiento:"} El asiento sale en Contabilidad → Automáticos al generar los asientos del mes.</p>
            )}
            {actual.provision && <p>Con provisión de CTS: el depósito consume el saldo provisionado.</p>}
          </div>

          {actual.estado !== "anulado" && (
            <div className="flex flex-wrap items-end gap-3">
              <label className="text-xs text-gray-500">Fecha de depósito
                <input type="date" value={fechaDeposito} disabled={!puedeEscribir || procesando} onChange={(e) => setFechaDeposito(e.target.value)} className={`${INP} block`} />
              </label>
              {puedeEscribir && fechaDeposito !== (actual.fechaDeposito || "") && (
                <button onClick={guardarFecha} disabled={procesando} className="border border-gray-300 text-gray-700 px-3 py-2 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50">Guardar fecha</button>
              )}
              <p className="text-xs text-gray-400 pb-2">Se anota a mano y sale en las hojas; no se valida contra Tesorería.</p>
            </div>
          )}
          {editable && sucio && (
            <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex gap-3">
              <span className="flex-1">Hay cambios sin guardar: el monto de cada fila se recalcula con la fórmula al guardar, salvo los ajustados.</span>
              <button onClick={descartar} className="text-xs underline self-start">Descartar</button>
            </p>
          )}

          <TablaScroll>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 border-b">
                  <th className="py-2 pr-3">Trabajador</th>
                  <th className="py-2 pr-3 text-right">RC</th>
                  <th className="py-2 pr-3 text-right">1/6 grat.</th>
                  {CAMPOS_ENTEROS.map(([k, t]) => <th key={k} className="py-2 pr-3 text-right">{t}</th>)}
                  <th className="py-2 pr-3 text-right">Monto CTS</th>
                  {editable && <th className="py-2 pr-3 text-center">Excluir</th>}
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {editables.map((e) => {
                  const f = porId.get(e.trabajador);
                  if (!f) return null;
                  const ajustado = e.montoTocado || (f.editado && !e.volverAFormula);
                  return (
                    <tr key={e.trabajador} className={`border-b border-gray-100 align-top ${e.excluido ? "opacity-60" : ""}`}>
                      <td className="py-1.5 pr-3">
                        {f.datos.nombre}
                        <span className="block text-xs text-gray-400">{f.datos.numDoc} · {f.datos.cargo || "Sin cargo"} · {f.desde.split("-").reverse().join("/")} al {f.hasta.split("-").reverse().join("/")}</span>
                        {(f.avisos || []).map((a) => <span key={a} className="block text-xs text-amber-700">{a}</span>)}
                        {e.excluido && !editable && <span className="block text-xs text-gray-500">Excluido: {e.motivoExclusion}</span>}
                        {e.excluido && editable && (
                          <input value={e.motivoExclusion} maxLength={200} onChange={(ev) => cambiar(e.trabajador, { motivoExclusion: ev.target.value })} placeholder="Motivo de la exclusión" className={`${INP} w-full mt-1`} />
                        )}
                      </td>
                      <td className="py-1.5 pr-3 text-right">
                        <input value={e.rc} disabled={!editable} inputMode="decimal" onChange={(ev) => cambiar(e.trabajador, { rc: soloImporte(ev.target.value) })} className={NUM} />
                      </td>
                      <td className="py-1.5 pr-3 text-right">
                        <input value={e.sexto} disabled={!editable} inputMode="decimal" onChange={(ev) => cambiar(e.trabajador, { sexto: soloImporte(ev.target.value) })} className={NUM} />
                      </td>
                      {CAMPOS_ENTEROS.map(([k]) => (
                        <td key={k} className="py-1.5 pr-3 text-right">
                          <input value={e[k]} disabled={!editable} inputMode="numeric" onChange={(ev) => cambiar(e.trabajador, { [k]: soloEntero(ev.target.value) })} className={`${NUM} w-16`} />
                        </td>
                      ))}
                      <td className="py-1.5 pr-3 text-right">
                        {editable ? (
                          <input value={e.monto} inputMode="decimal" onChange={(ev) => cambiar(e.trabajador, { monto: soloImporte(ev.target.value), montoTocado: true, volverAFormula: false })}
                            className={`${NUM} ${ajustado ? "border-amber-400" : ""}`} />
                        ) : <span className="tabular-nums font-medium">{money(f.monto)}</span>}
                        {ajustado && (
                          <span className="block text-[11px] text-amber-700">
                            ajustado
                            {editable && <button onClick={() => cambiar(e.trabajador, { volverAFormula: true, montoTocado: false, monto: String(f.calculado?.monto ?? f.monto) })} className="ml-1 underline">volver a la fórmula</button>}
                          </span>
                        )}
                      </td>
                      {editable && (
                        <td className="py-1.5 pr-3 text-center">
                          <input type="checkbox" checked={e.excluido} onChange={(ev) => cambiar(e.trabajador, { excluido: ev.target.checked })} />
                        </td>
                      )}
                      <td className="py-1.5 text-right whitespace-nowrap">
                        {!f.excluido && actual.estado !== "anulado" && (
                          <button onClick={() => generarHojaCtsPdf(actual, f, { empleador: catalogos.empleador })} className="text-xs text-gray-600 hover:underline">PDF</button>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {editables.length === 0 && (
                  <tr><td colSpan={9} className="py-6 text-center text-gray-400 text-sm">Ningún trabajador entra en este depósito</td></tr>
                )}
              </tbody>
              <tfoot>
                <tr className="font-semibold text-gray-700">
                  <td className="py-2 pr-3" colSpan={6}>
                    {totales.incluidos} {totales.incluidos === 1 ? "trabajador" : "trabajadores"}{totales.excluidos > 0 ? ` · ${totales.excluidos} excluido(s)` : ""}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums">{money(totales.total)}</td>
                  <td colSpan={editable ? 2 : 1} />
                </tr>
              </tfoot>
            </table>
          </TablaScroll>

          {(actual.omitidos || []).length > 0 && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-600 space-y-0.5">
              <p className="font-medium text-gray-700">No entran en este depósito</p>
              {actual.omitidos.map((o) => <p key={o.trabajador}>{o.nombre}: {o.motivo}</p>)}
            </div>
          )}
        </>
      )}

      {modal === "confirmar" && actual && (
        <ConfirmacionAccion procesando={procesando} textoConfirmar="Confirmar" onCancelar={() => setModal(null)} onConfirmar={confirmar}
          mensaje={`Se confirma el depósito ${actual.codigo}: ${totales.incluidos} ${totales.incluidos === 1 ? "trabajador" : "trabajadores"}, ${money(totales.total)}. Se genera su asiento y el monto sale en la boleta de ${periodo.slice(4)}/${periodo.slice(0, 4)} si sigue en borrador. Después solo se puede anular. ¿Confirmar?`} />
      )}
      {modal === "eliminar" && actual && (
        <ConfirmacionAccion procesando={procesando} textoConfirmar="Eliminar" onCancelar={() => setModal(null)} onConfirmar={eliminar}
          mensaje={`Se elimina el borrador ${actual.codigo} con sus ajustes. Podrás calcular otro. ¿Eliminar?`} />
      )}
      {modal === "anular" && actual && <ModalAnular deposito={actual} onCancelar={() => setModal(null)} onAnulado={alAnular} />}
    </div>
  );
}
