import { useState, useEffect, useCallback } from "react";
import { fetchAuth } from "../../utils/fetchAuth";
import { money } from "../../utils/compras";
import { formatearFechaHora } from "../../utils/fecha";
import { textoPeriodo } from "../../utils/bancos";
import { enviarConSobregiro } from "../../utils/sobregiro";
import {
  TIPOS, FORMATOS, ESTADOS, avisosDeApi, totalesFilas, nombreDeDisposicion, cuerpoGuardarLote, editablesDe, hayCambiosLote,
  libroExcelGenerico, libroFueraDeArchivo, descargarLibro, descargarBlob,
} from "../../utils/abonos";
import useConfirmar from "../../hooks/useConfirmar";
import ConfirmacionAccion from "../ConfirmacionAccion";
import FormNuevoLoteAbono, { AvisosFijos } from "./FormNuevoLoteAbono";
import TablaFilasLote from "./TablaFilasLote";

const INP = "border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300 disabled:bg-gray-50 disabled:text-gray-700";
const BTN = "border border-gray-300 text-gray-700 px-3 py-2 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50";
const MENSAJE_RED = "Error de conexión con el servidor.";
const cuando = (f) => formatearFechaHora(f, { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

const pantallaDe = (l) => ({ fecha: l.fecha, referencia: l.referencia || "", cargo: l.formato === "bcp" ? { tipo: l.cargo?.tipo || "C", numero: l.cargo?.numero || "" } : { tipo: "", numero: "" }, editables: editablesDe(l.filas) });

function ModalAnularLote({ lote, conEgreso, onCancelar, onAnulado }) {
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState("");
  const [procesando, setProcesando] = useState(false);

  const anular = async () => {
    const texto = motivo.trim();
    if (texto.length < 3) return setError("Escribe el motivo (de 3 a 200 caracteres).");
    setProcesando(true);
    setError("");
    try {
      const r = await fetchAuth(`/planilla/abonos/${lote._id}/anular`, { method: "POST", body: JSON.stringify({ motivo: texto }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) return setError(d.mensaje || "No se pudo anular el lote.");
      onAnulado(d);
    } catch {
      setError(MENSAJE_RED);
    } finally {
      setProcesando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-sm space-y-4">
        <h4 className="font-semibold text-gray-800 text-sm">Anular el lote {lote.codigo}</h4>
        <p className="text-sm text-gray-600">
          Deja de contar como abonado{conEgreso ? " y se anula su egreso en Tesorería" : ""}{lote.tipo === "adelanto" ? "; se quita el 0701 de las boletas (la planilla debe estar en borrador)" : ""}.
        </p>
        <label className="text-xs text-gray-500 block">Motivo
          <textarea autoFocus value={motivo} maxLength={200} rows={3} onChange={(e) => setMotivo(e.target.value)} className={`${INP} w-full resize-none`} />
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onCancelar} disabled={procesando} className={BTN}>Cancelar</button>
          <button type="button" onClick={anular} disabled={procesando} className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-red-700 disabled:opacity-50">
            {procesando ? "Anulando…" : "Anular"}
          </button>
        </div>
      </div>
    </div>
  );
}

// Un lote de abono: se crea (`nuevo`) o se abre (`loteId`). En borrador se corrigen montos y cabecera; confirmado se descarga.
export default function ModalLoteAbono({ loteId, nuevo, puedeEscribir, onClose, onCambio }) {
  const [lote, setLote] = useState(null);
  const [pantalla, setPantalla] = useState(null);
  const [error, setError] = useState("");
  const [procesando, setProcesando] = useState(false);
  const [bajando, setBajando] = useState("");
  const [modal, setModal] = useState(null); // "confirmar" | "anular" | "eliminar"
  const { confirmar: preguntar, dialogo } = useConfirmar("Sí, confirmar");

  const aplicar = useCallback((l) => {
    setLote(l);
    setPantalla(pantallaDe(l));
  }, []);

  useEffect(() => {
    if (!loteId) return undefined;
    let cancelado = false;
    fetchAuth(`/planilla/abonos/${loteId}`).then(async (r) => {
      const d = await r.json().catch(() => ({}));
      if (cancelado) return;
      if (r.ok) aplicar(d); else setError(d.mensaje || "No se pudo cargar el lote.");
    }).catch(() => { if (!cancelado) setError(MENSAJE_RED); });
    return () => { cancelado = true; };
  }, [loteId, aplicar]);

  const editable = puedeEscribir && lote?.estado === "borrador";
  const esBcp = lote?.formato === "bcp";
  const sucio = editable && hayCambiosLote({ lote, ...pantalla });
  const set = (parche) => setPantalla((p) => ({ ...p, ...parche }));

  const llamar = async (ruta, opciones, textoError) => {
    setProcesando(true);
    setError("");
    try {
      const r = await fetchAuth(`/planilla/abonos${ruta}`, opciones);
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setError(d.mensaje || textoError); return null; }
      return d;
    } catch {
      setError(MENSAJE_RED);
      return null;
    } finally {
      setProcesando(false);
    }
  };
  const terminar = (d) => {
    aplicar(d);
    onCambio?.();
  };

  const guardar = async () => {
    const { error: invalido, body } = cuerpoGuardarLote({ ...pantalla, esBcp });
    if (invalido) return setError(invalido);
    const d = await llamar(`/${lote._id}`, { method: "PUT", body: JSON.stringify(body) }, "No se pudo guardar el lote.");
    if (d) terminar(d);
  };
  const confirmar = async () => {
    setProcesando(true);
    setError("");
    try {
      const r = await enviarConSobregiro((b) => fetchAuth(`/planilla/abonos/${lote._id}/confirmar`, { method: "POST", body: JSON.stringify(b) }), {}, preguntar);
      const d = await r.json().catch(() => ({}));
      setModal(null);
      if (!r.ok) return setError(d.mensaje || "No se pudo confirmar el lote.");
      terminar(d);
    } catch {
      setModal(null);
      setError(MENSAJE_RED);
    } finally {
      setProcesando(false);
    }
  };
  const eliminar = async () => {
    const d = await llamar(`/${lote._id}`, { method: "DELETE" }, "No se pudo eliminar el lote.");
    setModal(null);
    if (!d) return;
    onCambio?.();
    onClose();
  };
  const alAnular = (d) => { setModal(null); terminar(d); };

  const descargar = async (clave, tarea) => {
    setBajando(clave);
    setError("");
    try {
      await tarea();
    } catch (e) {
      console.error(e);
      setError(e.mensaje || "No se pudo descargar el archivo. Vuelve a intentarlo.");
    } finally {
      setBajando("");
    }
  };
  const pedir = async (ruta) => {
    const r = await fetchAuth(`/planilla/abonos/${lote._id}${ruta}`);
    if (!r.ok) throw Object.assign(new Error("descarga"), { mensaje: (await r.json().catch(() => ({}))).mensaje || "No se pudo descargar el archivo." });
    return r;
  };
  const descargarTxt = () => descargar("txt", async () => {
    const r = await pedir("/archivo");
    descargarBlob(await r.blob(), nombreDeDisposicion(r.headers.get("Content-Disposition"), `abono-${lote.tipo}-${lote.periodo}-${lote.codigo}.txt`));
  });
  const descargarExcel = () => descargar("excel", async () => {
    const d = await (await pedir("/datos-excel")).json();
    await descargarLibro(await libroExcelGenerico(d), d.nombreArchivo);
  });
  const descargarFuera = () => descargar("fuera", async () => {
    const d = await (await pedir("/datos-excel")).json();
    await descargarLibro(await libroFueraDeArchivo(d), d.nombreFueraDelArchivo);
  });

  const alCrear = (d) => { aplicar(d); onCambio?.(); };
  const estado = lote && ESTADOS[lote.estado];
  const filaDe = new Map((lote?.filas || []).map((f) => [f.trabajador, f]));
  const t = lote ? totalesFilas(pantalla.editables.map((e) => ({ forma: filaDe.get(e.trabajador)?.forma, monto: editable ? e.monto : filaDe.get(e.trabajador)?.monto }))) : null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[92vh] overflow-y-auto p-6 space-y-4">
        {!lote && nuevo && !loteId && <FormNuevoLoteAbono nuevo={nuevo} onCreado={alCrear} onCerrar={onClose} />}
        {!lote && loteId && (
          <div className="space-y-3">
            {error ? <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p> : <p className="text-sm text-gray-500">Cargando…</p>}
            <div className="flex justify-end"><button type="button" onClick={onClose} className={BTN}>Cerrar</button></div>
          </div>
        )}

        {lote && pantalla && (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <h3 className="font-semibold text-gray-800">{lote.codigo} · {TIPOS[lote.tipo]} · {textoPeriodo(lote.periodo)}</h3>
              <span className={`text-xs px-2 py-1 rounded-full ${estado.clase}`}>{estado.texto}</span>
              <span className="text-xs text-gray-500">Formato {FORMATOS[lote.formato]} · Cuenta de cargo: {lote.cuentaCargo?.nombre}</span>
              <div className="flex-1" />
              <button type="button" onClick={onClose} className={BTN}>Cerrar</button>
            </div>

            <div className="grid sm:grid-cols-3 gap-3">
              <label className="text-xs text-gray-500">Fecha de pago
                <input type="date" value={pantalla.fecha} disabled={!editable || procesando} onChange={(e) => set({ fecha: e.target.value })} className={`${INP} block w-full`} />
              </label>
              <label className="text-xs text-gray-500 sm:col-span-2">Referencia
                <input value={pantalla.referencia} maxLength={40} disabled={!editable || procesando} onChange={(e) => set({ referencia: e.target.value })} className={`${INP} block w-full`} />
              </label>
              {esBcp && (
                <>
                  <label className="text-xs text-gray-500">Tipo de la cuenta de cargo
                    <select value={pantalla.cargo.tipo} disabled={!editable || procesando} onChange={(e) => set({ cargo: { ...pantalla.cargo, tipo: e.target.value } })} className={`${INP} block w-full`}>
                      <option value="C">Corriente</option>
                      <option value="M">Maestra</option>
                    </select>
                  </label>
                  <label className="text-xs text-gray-500 sm:col-span-2">Número de la cuenta de cargo (13 dígitos)
                    <input value={pantalla.cargo.numero} inputMode="numeric" maxLength={20} disabled={!editable || procesando}
                      onChange={(e) => set({ cargo: { ...pantalla.cargo, numero: e.target.value.replace(/\D/g, "") } })} className={`${INP} block w-full`} />
                  </label>
                </>
              )}
            </div>

            <AvisosFijos formato={lote.formato} tipo={lote.tipo} />
            {avisosDeApi(lote.avisos).length > 0 && (
              <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                <ul className="list-disc pl-5">{avisosDeApi(lote.avisos).map((a) => <li key={a}>{a}</li>)}</ul>
              </div>
            )}

            <div className="text-xs text-gray-500 space-y-0.5">
              {lote.confirmadoEn && <p>Confirmado por {lote.confirmadoPor} el {cuando(lote.confirmadoEn)}.</p>}
              {lote.movimiento && <p>Egreso en Tesorería: {lote.movimiento.codigo}{lote.movimiento.anulado ? " (anulado)" : ""}.</p>}
              {lote.estado === "anulado" && <p className="text-gray-600">Anulado por {lote.anuladoPor} el {cuando(lote.anuladoEn)}: {lote.motivoAnulacion}</p>}
              {lote.tipo === "adelanto" && lote.porcentaje != null && <p>Propuesto con el {lote.porcentaje} % de la remuneración básica.</p>}
            </div>
            {sucio && <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">Hay cambios sin guardar. Guarda antes de confirmar.</p>}

            <TablaFilasLote filas={lote.filas} editables={pantalla.editables} editable={editable} onMonto={(id, monto) => set({ editables: pantalla.editables.map((e) => (e.trabajador === id ? { ...e, monto } : e)) })}
              onQuitar={(id) => set({ editables: pantalla.editables.filter((e) => e.trabajador !== id) })} />

            {(lote.omitidos || []).length > 0 && (
              <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-600 space-y-0.5">
                <p className="font-medium text-gray-700">No entran en este lote</p>
                {lote.omitidos.map((o) => <p key={o.trabajador}>{o.nombre}: {o.motivo}</p>)}
              </div>
            )}

            {error && <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
            {puedeEscribir && (
              <div className="flex flex-wrap items-center justify-end gap-3">
                {lote.estado === "confirmado" && (
                  <>
                    {t.filasFuera > 0 && <button type="button" onClick={descargarFuera} disabled={!!bajando} className={BTN}>{bajando === "fuera" ? "Generando…" : "Descargar «Fuera del archivo»"}</button>}
                    {lote.formato === "excel"
                      ? <button type="button" onClick={descargarExcel} disabled={!!bajando || t.filasEnArchivo === 0} className="bg-purple-600 text-white px-3 py-2 rounded-lg text-sm hover:bg-purple-700 disabled:opacity-50">{bajando === "excel" ? "Generando…" : "Descargar Excel"}</button>
                      : <button type="button" onClick={descargarTxt} disabled={!!bajando || t.filasEnArchivo === 0} className="bg-purple-600 text-white px-3 py-2 rounded-lg text-sm hover:bg-purple-700 disabled:opacity-50">{bajando === "txt" ? "Descargando…" : "Descargar archivo (.txt)"}</button>}
                    <button type="button" onClick={() => setModal("anular")} disabled={procesando} className="border border-red-300 text-red-700 px-3 py-2 rounded-lg text-sm hover:bg-red-50 disabled:opacity-50">Anular</button>
                  </>
                )}
                {editable && (
                  <>
                    <button type="button" onClick={() => setModal("eliminar")} disabled={procesando} className="border border-red-300 text-red-700 px-3 py-2 rounded-lg text-sm hover:bg-red-50 disabled:opacity-50">Eliminar</button>
                    <button type="button" onClick={guardar} disabled={procesando || !sucio} className="border border-purple-600 text-purple-700 px-3 py-2 rounded-lg text-sm hover:bg-purple-50 disabled:opacity-50">Guardar</button>
                    <button type="button" onClick={() => setModal("confirmar")} disabled={procesando || sucio || pantalla.editables.length === 0} className="bg-purple-600 text-white px-3 py-2 rounded-lg text-sm hover:bg-purple-700 disabled:opacity-50">Confirmar</button>
                  </>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {modal === "confirmar" && lote && (
        <ConfirmacionAccion procesando={procesando} textoConfirmar="Confirmar" onCancelar={() => setModal(null)} onConfirmar={confirmar}
          mensaje={`Se confirma el lote ${lote.codigo}: ${t.filasEnArchivo} en el archivo por ${money(t.enArchivo)}${t.filasFuera > 0 ? ` y ${t.filasFuera} fuera del archivo por ${money(t.fueraDelArchivo)}` : ""}. ${t.filasEnArchivo > 0 ? `Se registra el egreso en ${lote.cuentaCargo?.nombre} por ${money(t.enArchivo)}` : "No se registra egreso en Tesorería (todo va fuera del archivo)"}${lote.tipo === "adelanto" ? "; se escribe el 0701 en las boletas (las filas en 0 se quitan)" : ""}. Después solo se puede anular. ¿Confirmar?`} />
      )}
      {modal === "eliminar" && lote && (
        <ConfirmacionAccion procesando={procesando} textoConfirmar="Eliminar" onCancelar={() => setModal(null)} onConfirmar={eliminar}
          mensaje={`Se elimina el borrador ${lote.codigo}. Podrás armar otro. ¿Eliminar?`} />
      )}
      {modal === "anular" && lote && <ModalAnularLote lote={lote} conEgreso={t.filasEnArchivo > 0} onCancelar={() => setModal(null)} onAnulado={alAnular} />}
      {dialogo}
    </div>
  );
}
