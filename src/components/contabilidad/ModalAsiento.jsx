import { useState, useEffect, useMemo } from "react";
import { fetchAuth } from "../../utils/fetchAuth";
import { avisoDeRespuesta } from "../../utils/bloqueo";
import useBloqueoEdicion from "../../hooks/useBloqueoEdicion";
import BarraEdicion from "../BarraEdicion";
import { fechaHoyLima } from "../../utils/fecha";
import { money } from "../../utils/compras";
import { fechaConsultableTc, estadoTcComprobante } from "../../utils/tesoreria";
import { totalesAsiento, validarLineas, lineasParaEnviar, lineasDeAsiento, SUBDIARIOS, SUBDIARIOS_MANUALES } from "../../utils/contabilidad";
import BuscadorCuenta from "./BuscadorCuenta";

const INP = "w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300 disabled:bg-gray-50";
const lineaVacia = () => ({ cuenta: "", glosa: "", debe: "", haber: "", centroCosto: "", tercero: { tipoDoc: "6", numDoc: "", nombre: "" } });
const fechaInput = (d) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" }).format(new Date(d));

// Asiento manual: crear o editar (solo los manuales no anulados). Los demás se muestran en lectura.
export default function ModalAsiento({ asiento, cuentas, centrosCosto, puedeEscribir, onClose, onGuardado }) {
  const editableSegunEstado = puedeEscribir && (!asiento || (asiento.origen?.tipo === "manual" && asiento.estado !== "anulado"));
  // Abrir = editar: un asiento manual existente se toma al abrirlo; si otro lo tiene, queda en lectura.
  const bloqueo = useBloqueoEdicion("asiento", asiento?._id, asiento?.updatedAt, { autoEditar: !!asiento && editableSegunEstado });
  const editable = editableSegunEstado && (!asiento || bloqueo.editando);
  const [form, setForm] = useState(() => ({
    fecha: asiento ? fechaInput(asiento.fecha) : fechaHoyLima(),
    subdiario: asiento?.subdiario || "diario",
    glosa: asiento?.glosa || "",
    moneda: asiento?.moneda || "PEN",
    tipoCambio: asiento?.moneda === "USD" ? String(asiento.tipoCambio) : "",
  }));
  const [lineas, setLineas] = useState(() => (asiento ? lineasDeAsiento(asiento) : [lineaVacia(), lineaVacia()]));
  const [tcAviso, setTcAviso] = useState("");
  const [tcSoloLectura, setTcSoloLectura] = useState(false);
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  const porCodigo = useMemo(() => new Map(cuentas.map((c) => [c.codigo, c])), [cuentas]);
  const totales = totalesAsiento(lineas);
  const errores = validarLineas(lineas, porCodigo);
  const errorDe = (i) => errores.find((e) => e.indice === i)?.mensaje;

  // TC SUNAT de la fecha (venta), como en los comprobantes; editable si no se pudo consultar.
  const claveTc = editable && form.moneda === "USD" && fechaConsultableTc(form.fecha) ? form.fecha : null;
  useEffect(() => {
    if (!claveTc || (asiento && claveTc === fechaInput(asiento.fecha))) return undefined;
    let vigente = true;
    fetchAuth(`/sunat/tipo-cambio?fecha=${claveTc}`)
      .then(async (r) => { const datos = await r.json().catch(() => ({})); return r.ok ? { ok: true, datos } : { ok: false, mensaje: datos.mensaje }; })
      .catch(() => ({ ok: false }))
      .then((consulta) => {
        if (!vigente) return;
        const estado = estadoTcComprobante(consulta);
        setTcAviso(estado.aviso);
        setTcSoloLectura(estado.soloLectura);
        setForm((f) => ({ ...f, tipoCambio: estado.tc }));
      });
    return () => { vigente = false; };
  }, [claveTc, asiento]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const setLinea = (i, cambios) => setLineas((ls) => ls.map((l, j) => (j === i ? { ...l, ...cambios } : l)));
  const cuentaDe = (l) => porCodigo.get(l.cuenta);

  const puedeGuardar = editable && !guardando && totales.cuadra && !errores.length && form.glosa.trim()
    && (form.moneda !== "USD" || Number(form.tipoCambio) > 0);

  const guardar = async () => {
    setError("");
    setGuardando(true);
    const cuerpo = JSON.stringify({ ...form, tipoCambio: Number(form.tipoCambio) || 1, lineas: lineasParaEnviar(lineas, form.moneda) });
    try {
      const r = asiento
        ? await bloqueo.fetch(`/contabilidad/asientos/${asiento._id}`, { method: "PUT", body: cuerpo })
        : await fetchAuth("/contabilidad/asientos", { method: "POST", body: cuerpo });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) return avisoDeRespuesta(r.status, d) ? undefined : setError(d.mensaje || "No se pudo guardar el asiento.");
      onGuardado(d);
    } catch {
      setError("Error de conexión con el servidor: revisa la lista antes de reintentar.");
    } finally {
      setGuardando(false);
    }
  };

  const simbolo = form.moneda === "USD" ? "US$" : "S/";
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-6xl max-h-[92vh] overflow-auto space-y-4">
        <div className="flex items-start justify-between">
          <h3 className="font-semibold text-gray-800">
            {asiento ? `Asiento ${asiento.cuo}` : "Nuevo asiento manual"}
            {asiento?.estado === "anulado" && <span className="ml-2 text-sm text-red-600">Anulado: {asiento.anulacion?.motivo}</span>}
          </h3>
          {asiento && <p className="text-xs text-gray-400">Creado por {asiento.creadoPor || "—"}{asiento.modificadoPor ? ` · modificado por ${asiento.modificadoPor}` : ""}</p>}
        </div>
        {asiento && editableSegunEstado && <BarraEdicion bloqueo={bloqueo} />}
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          <div>
            <label className="text-xs text-gray-500">Fecha</label>
            <input type="date" value={form.fecha} onChange={set("fecha")} disabled={!editable} className={INP} />
          </div>
          <div>
            <label className="text-xs text-gray-500">Subdiario</label>
            <select value={form.subdiario} onChange={set("subdiario")} disabled={!editable || !!asiento} className={INP}>
              {(asiento ? [asiento.subdiario] : SUBDIARIOS_MANUALES).map((s) => <option key={s} value={s}>{SUBDIARIOS[s]}</option>)}
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="text-xs text-gray-500">Glosa</label>
            <input value={form.glosa} onChange={set("glosa")} disabled={!editable} className={INP} />
          </div>
          <div>
            <label className="text-xs text-gray-500">Moneda</label>
            <select value={form.moneda} onChange={set("moneda")} disabled={!editable} className={INP}>
              <option value="PEN">Soles</option>
              <option value="USD">Dólares</option>
            </select>
          </div>
          {form.moneda === "USD" && (
            <div>
              <label className="text-xs text-gray-500">Tipo de cambio</label>
              <input value={form.tipoCambio} onChange={set("tipoCambio")} disabled={!editable || tcSoloLectura} inputMode="decimal" className={INP} />
              {tcAviso && <p className="text-[11px] text-gray-400">{tcAviso}</p>}
            </div>
          )}
        </div>

        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-gray-500 border-b">
              <th className="py-1.5 pr-2 w-64">Cuenta</th><th className="py-1.5 pr-2">Glosa de la línea</th>
              <th className="py-1.5 pr-2 w-28 text-right">Debe {simbolo}</th><th className="py-1.5 pr-2 w-28 text-right">Haber {simbolo}</th>
              {form.moneda === "USD" && <th className="py-1.5 pr-2 w-24 text-right">Debe/Haber S/</th>}
              <th className="py-1.5 pr-2 w-40">Centro de costo / Tercero</th><th className="w-6" />
            </tr>
          </thead>
          <tbody>
            {lineas.map((l, i) => {
              const c = cuentaDe(l);
              const err = editable && (l.cuenta || l.debe || l.haber) ? errorDe(i) : null;
              return (
                <tr key={i} className="align-top border-b border-gray-50">
                  <td className="py-1 pr-2">
                    <BuscadorCuenta cuentas={cuentas} valor={l.cuenta} onChange={(v) => setLinea(i, { cuenta: v })} disabled={!editable} />
                    {err && <p className="text-[11px] text-red-600 mt-0.5">{err}</p>}
                  </td>
                  <td className="py-1 pr-2"><input value={l.glosa} onChange={(e) => setLinea(i, { glosa: e.target.value })} disabled={!editable} className={INP} /></td>
                  <td className="py-1 pr-2"><input value={l.debe} inputMode="decimal" disabled={!editable} className={`${INP} text-right`}
                    onChange={(e) => setLinea(i, { debe: e.target.value, ...(e.target.value ? { haber: "" } : {}) })} /></td>
                  <td className="py-1 pr-2"><input value={l.haber} inputMode="decimal" disabled={!editable} className={`${INP} text-right`}
                    onChange={(e) => setLinea(i, { haber: e.target.value, ...(e.target.value ? { debe: "" } : {}) })} /></td>
                  {form.moneda === "USD" && (
                    <td className="py-1 pr-2 text-right text-xs text-gray-500 tabular-nums pt-2.5">
                      {money((Number(l.debe) || Number(l.haber) || 0) * (Number(form.tipoCambio) || 0))}
                    </td>
                  )}
                  <td className="py-1 pr-2 space-y-1">
                    {(c?.exigeCentroCosto || l.centroCosto) && (
                      <select value={l.centroCosto} onChange={(e) => setLinea(i, { centroCosto: e.target.value })} disabled={!editable} className={INP}>
                        <option value="">Centro de costo…</option>
                        {centrosCosto.map((cc) => <option key={cc._id} value={cc._id}>{cc.nombre}</option>)}
                      </select>
                    )}
                    {(c?.exigeTercero || l.tercero?.numDoc) && (
                      <input value={l.tercero?.numDoc || ""} placeholder="RUC / DNI del tercero" disabled={!editable} className={INP}
                        onChange={(e) => setLinea(i, { tercero: { ...l.tercero, numDoc: e.target.value.trim(), tipoDoc: e.target.value.trim().length === 8 ? "1" : "6" } })} />
                    )}
                  </td>
                  <td className="py-1 text-right">
                    {editable && lineas.length > 2 && (
                      <button onClick={() => setLineas((ls) => ls.filter((_, j) => j !== i))} className="text-gray-400 hover:text-red-600 text-sm" title="Quitar línea">✕</button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="text-sm font-semibold">
              <td className="pt-2">
                {editable && <button onClick={() => setLineas((ls) => [...ls, lineaVacia()])} className="text-xs text-purple-600 hover:underline font-normal">+ Agregar línea</button>}
              </td>
              <td className="pt-2 text-right text-gray-500">Totales</td>
              <td className="pt-2 pr-2 text-right tabular-nums">{money(totales.debe, form.moneda)}</td>
              <td className="pt-2 pr-2 text-right tabular-nums">{money(totales.haber, form.moneda)}</td>
              <td colSpan={3} className={`pt-2 text-sm ${totales.diferencia === 0 ? "text-emerald-600" : "text-red-600"}`}>
                {totales.diferencia === 0 ? (totales.debe > 0 ? "Cuadra" : "") : `Diferencia ${money(Math.abs(totales.diferencia), form.moneda)}`}
              </td>
            </tr>
          </tfoot>
        </table>

        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-3">
          <button onClick={onClose} disabled={guardando} className="border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm hover:bg-gray-50">
            {editable ? "Cancelar" : "Cerrar"}
          </button>
          {editable && (
            <button onClick={guardar} disabled={!puedeGuardar}
              title={!totales.cuadra ? "El asiento debe cuadrar (debe = haber)" : ""}
              className="bg-purple-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-purple-700 disabled:opacity-50">
              {guardando ? "Guardando…" : "Guardar"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
