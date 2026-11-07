import { useState, useEffect } from "react";
import { fetchAuth } from "../../utils/fetchAuth";
import { money } from "../../utils/compras";
import { nombreTrabajador } from "../../utils/planilla";
import { fechaDMA } from "../../utils/vacaciones";
import { formatearFechaHora } from "../../utils/fecha";
import { totalesEnPantalla, validarLinea, liquidacionVigente, lineasParaEnviar, fusionarRespuesta } from "../../utils/liquidacion";
import ConfirmacionAccion from "../ConfirmacionAccion";

const INP = "border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300 disabled:bg-gray-50";
const MENSAJE_RED = "Error de conexión con el servidor.";
const ESTADOS = {
  borrador: { texto: "Borrador", clase: "bg-amber-100 text-amber-800" },
  confirmada: { texto: "Confirmada", clase: "bg-green-100 text-green-800" },
  anulada: { texto: "Anulada", clase: "bg-gray-100 text-gray-600" },
};
const BASES = [["rcVacaciones", "Para vacaciones"], ["sextoGratificacion", "Sexto de gratificación"], ["rcGratificacion", "Para gratificación"]];
const CAMPOS_BLOQUE = {
  cts: [["meses", "Meses"], ["dias", "Días"], ["noComputables", "Días no computables"]],
  truncas: [["meses", "Meses"], ["dias", "Días"], ["usados", "Días gozados o vendidos"]],
  gratificacion: [["meses", "Meses"]],
};
// La 0118 la calcula el sistema en la boleta, pero en la liquidación se puede agregar a mano (vacaciones no gozadas).
const CONCEPTO_0118 = { codigo: "0118", nombre: "REMUNERACIÓN VACACIONAL", tipo: "ingreso" };

const cuando = (f) => formatearFechaHora(f, { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
const mesAnio = (p) => `${p.slice(4)}/${p.slice(0, 4)}`;
const tramo = (b) => `${fechaDMA(b.desde)} – ${fechaDMA(b.hasta)}`;
const formula = (detalle) => (detalle || [])
  .map((d, i) => `${d.cantidad < 0 ? (i ? " − " : "− ") : i ? " + " : ""}${money(d.base)} ÷ ${d.divisor} × ${Math.abs(d.cantidad)} ${d.unidad}`).join("");

const formDe = (l) => ({
  bases: Object.fromEntries(BASES.map(([k]) => [k, String(l.bases?.[k] ?? 0)])),
  bloques: Object.fromEntries(Object.entries(CAMPOS_BLOQUE).filter(([b]) => l.bloques?.[b])
    .map(([b, campos]) => [b, Object.fromEntries(campos.map(([c]) => [c, String(l.bloques[b][c] ?? 0)]))])),
  lineas: l.lineas.map((x) => ({ ...x, monto: String(x.monto) })),
  quitadas: l.quitadas || [],
  observaciones: l.observaciones || "",
});

function cuerpoDe(form) {
  if (Object.values(form.bases).some((v) => !/^\d+(\.\d{1,2})?$/.test(v.trim()))) return { error: "Remuneración computable: escribe importes de 0 o más, con hasta 2 decimales." };
  if (Object.values(form.bloques).some((b) => Object.values(b).some((v) => !/^\d+$/.test(v.trim())))) return { error: "Meses y días van en números enteros." };
  for (const [i, l] of form.lineas.entries()) {
    const error = validarLinea(l);
    if (error) return { error: `Línea ${i + 1}: ${error}` };
  }
  return {
    cuerpo: {
      bases: Object.fromEntries(Object.entries(form.bases).map(([k, v]) => [k, Number(v)])),
      bloques: Object.fromEntries(Object.entries(form.bloques).map(([b, campos]) => [b, Object.fromEntries(Object.entries(campos).map(([c, v]) => [c, Number(v)]))])),
      lineas: form.lineas.map((l) => ({ ...l, descripcion: (l.descripcion || "").trim(), monto: Number(l.monto) })),
      quitadas: form.quitadas,
      observaciones: form.observaciones,
    },
  };
}

function ModalAnular({ codigo, onCancelar, onAnulada, id }) {
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState("");
  const [procesando, setProcesando] = useState(false);

  const anular = async () => {
    const texto = motivo.trim();
    if (texto.length < 3) return setError("Escribe el motivo (de 3 a 200 caracteres).");
    setProcesando(true);
    setError("");
    try {
      const r = await fetchAuth(`/planilla/liquidaciones/${id}/anular`, { method: "POST", body: JSON.stringify({ motivo: texto }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) return setError(d.mensaje || "No se pudo anular la liquidación.");
      onAnulada(d);
    } catch {
      setError(MENSAJE_RED);
    } finally {
      setProcesando(false);
    }
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/50 p-4" style={{ zIndex: 200 }}>
      <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-sm space-y-4">
        <h4 className="font-semibold text-gray-800 text-sm">Anular la liquidación {codigo}</h4>
        <p className="text-sm text-gray-600">Se quitan sus líneas de la boleta del mes de cese y se recalcula. Después puedes crear otra.</p>
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

// Liquidación de beneficios sociales del cese de un trabajador (spec 2026-11-06-liquidacion §4–§5). El servidor arma la
// propuesta y la vista previa de los descuentos de ley; aquí se editan bases, meses, días, líneas y observaciones.
// `onPdf(liquidacion)`: la descarga del PDF; sin ella no se muestra el botón.
export default function ModalLiquidacion({ trabajador, catalogos, puedeEscribir, onClose, onCambio, onPdf }) {
  const [liq, setLiq] = useState(null);
  const [form, setForm] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState("");
  const [confirmar, setConfirmar] = useState(null); // "propuesta" | "eliminar" | "confirmar"
  const [anulando, setAnulando] = useState(false);
  const [fallo, setFallo] = useState(false);
  const [intento, setIntento] = useState(0);

  const mostrar = (d) => { setLiq(d); setForm(d ? formDe(d) : null); };

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const r = await fetchAuth(`/planilla/liquidaciones?trabajador=${trabajador._id}`);
        const lista = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(lista.mensaje || "No se pudo cargar la liquidación.");
        const elegida = liquidacionVigente(lista, trabajador.fechaCese) || lista.find((l) => trabajador.fechaCese && l.fechaCese === trabajador.fechaCese);
        let d = null;
        if (elegida) {
          const rd = await fetchAuth(`/planilla/liquidaciones/${elegida._id}`);
          d = await rd.json().catch(() => ({}));
          if (!rd.ok) throw new Error(d.mensaje || "No se pudo cargar la liquidación.");
        }
        if (vivo) mostrar(d);
      } catch (err) {
        if (vivo) { setError(err instanceof TypeError ? MENSAJE_RED : err.message); setFallo(true); }
      } finally {
        if (vivo) setCargando(false);
      }
    })();
    return () => { vivo = false; };
  }, [trabajador._id, trabajador.fechaCese, intento]);
  const reintentar = () => { setError(""); setFallo(false); setCargando(true); setIntento((n) => n + 1); };

  const pedir = async (ruta, opciones, { cambia = false } = {}) => {
    setProcesando(true);
    setError("");
    try {
      const r = await fetchAuth(ruta, opciones);
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setError(d.mensaje || "No se pudo completar la operación."); return null; }
      if (cambia) onCambio?.();
      return d;
    } catch {
      setError(MENSAJE_RED);
      return null;
    } finally {
      setProcesando(false);
    }
  };

  const crear = async () => {
    const d = await pedir("/planilla/liquidaciones", { method: "POST", body: JSON.stringify({ trabajador: trabajador._id }) }, { cambia: true });
    if (d) mostrar(d);
  };

  // `alSalir`: guardado de una base, meses o días; los montos y filas a medio editar se quedan en pantalla sin guardar.
  const guardar = async (f = form, { alSalir = false } = {}) => {
    const { envio, pendientes, montosLocales } = alSalir ? lineasParaEnviar(f.lineas, guardado.lineas) : { envio: f.lineas, pendientes: [], montosLocales: {} };
    const { error: invalido, cuerpo } = cuerpoDe({ ...f, lineas: envio });
    if (invalido) return setError(invalido);
    const d = await pedir(`/planilla/liquidaciones/${liq._id}`, { method: "PUT", body: JSON.stringify(cuerpo) });
    if (!d) return;
    setLiq(d);
    setForm((actual) => fusionarRespuesta({ nuevo: formDe(d), enviado: f, actual, montosLocales, pendientes }));
  };

  const ejecutar = async () => {
    const accion = confirmar;
    setConfirmar(null);
    if (accion === "eliminar") {
      if (await pedir(`/planilla/liquidaciones/${liq._id}`, { method: "DELETE" }, { cambia: true })) mostrar(null);
      return;
    }
    const d = await pedir(`/planilla/liquidaciones/${liq._id}/${accion}`, { method: "POST" }, { cambia: true });
    if (d) mostrar(d);
  };

  const editable = puedeEscribir && liq?.estado === "borrador";
  const guardado = liq ? formDe(liq) : null;
  const sucio = Boolean(liq) && JSON.stringify(form) !== JSON.stringify(guardado);

  const setBase = (k, v) => setForm((f) => ({ ...f, bases: { ...f.bases, [k]: v } }));
  const setBloque = (b, c, v) => setForm((f) => ({ ...f, bloques: { ...f.bloques, [b]: { ...f.bloques[b], [c]: v } } }));
  // Bases, meses y días recalculan las fórmulas en el servidor: se guardan al salir del campo.
  const alSalir = (cambiado) => { if (cambiado) guardar(form, { alSalir: true }); };
  const setLinea = (i, parche) => setForm((f) => ({ ...f, lineas: f.lineas.map((l, j) => (j === i ? { ...l, ...parche } : l)) }));
  const quitarLinea = (i) => setForm((f) => {
    const l = f.lineas[i];
    if (l.origen !== "propuesta") return { ...f, lineas: f.lineas.filter((_, j) => j !== i) };
    // Sin la gratificación no hay bonificación: el servidor quita las dos.
    const fuera = l.clave === "gratificacion" ? ["gratificacion", "bonificacion"] : [l.clave];
    return { ...f, lineas: f.lineas.filter((x) => !fuera.includes(x.clave)), quitadas: [...new Set([...f.quitadas, l.clave])] };
  });
  const usarFormula = (i) => guardar({ ...form, lineas: form.lineas.map((l, j) => (j === i ? { ...l, editada: false, monto: String(guardado.lineas.find((g) => g.clave === l.clave)?.monto ?? l.monto) } : l)) });
  const conceptos = [...(catalogos?.conceptos || []), CONCEPTO_0118].sort((a, b) => a.codigo.localeCompare(b.codigo));
  const elegirConcepto = (i, codigo) => {
    const c = conceptos.find((x) => x.codigo === codigo);
    setLinea(i, { codigo, tipo: c?.tipo || "ingreso" });
  };
  const agregarLinea = () => setForm((f) => ({ ...f, lineas: [...f.lineas, { codigo: "", descripcion: "", tipo: "ingreso", monto: "", origen: "manual", editada: false }] }));

  const descuentosLey = liq ? (liq.estado === "borrador" ? liq.vistaPrevia?.descuentos : liq.descuentos) || [] : [];
  const totales = form ? totalesEnPantalla(form.lineas, descuentosLey) : null;
  const enLetras = liq && !sucio ? (liq.estado === "borrador" ? liq.vistaPrevia?.totalEnLetras : liq.totalEnLetras) : "";
  const b = liq?.bases;
  const bl = liq?.bloques;

  const campoBloque = (bloque, campo, etiqueta) => (
    <label key={campo} className="text-xs text-gray-500">{etiqueta}
      <input value={form.bloques[bloque][campo]} disabled={!editable} inputMode="numeric"
        onChange={(e) => setBloque(bloque, campo, e.target.value.replace(/\D/g, ""))}
        onBlur={() => alSalir(form.bloques[bloque][campo] !== guardado.bloques[bloque][campo])}
        className={`${INP} block w-24 text-right`} />
    </label>
  );

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center bg-black/50 p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-5xl space-y-4 my-6">
        <div className="flex items-start gap-3">
          <div className="flex-1">
            <h3 className="font-semibold text-gray-800">
              Liquidación de beneficios sociales — {nombreTrabajador(trabajador)}
              {liq && <span className={`ml-2 px-2 py-0.5 rounded-full text-[11px] font-medium align-middle ${ESTADOS[liq.estado].clase}`}>{liq.codigo} · {ESTADOS[liq.estado].texto}</span>}
            </h3>
            <p className="text-xs text-gray-500">
              {trabajador.numDoc} · {trabajador.cargo || "Sin cargo"} · Ingreso {fechaDMA(liq?.fechaIngreso || trabajador.fechaIngreso)} · Cese {fechaDMA(liq?.fechaCese || trabajador.fechaCese)}
              {liq?.periodoTrabajo ? ` · ${liq.periodoTrabajo}` : ""}{liq?.motivoCese ? ` · Motivo: ${liq.motivoCese}` : ""}
            </p>
          </div>
          {liq && onPdf && (
            <button type="button" onClick={() => onPdf(liq)} className="border border-gray-300 text-gray-700 px-3 py-1.5 rounded-lg text-sm hover:bg-gray-50">PDF</button>
          )}
        </div>

        {cargando && <p className="text-sm text-gray-400">Cargando…</p>}

        {fallo && (
          <div className="flex items-center gap-3">
            <p className="text-sm text-red-600 flex-1">{error}</p>
            <button type="button" onClick={reintentar} className="border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm hover:bg-gray-50">Reintentar</button>
          </div>
        )}

        {!cargando && !fallo && (!liq || liq.estado === "anulada") && (
          <div className="border border-dashed border-gray-300 rounded-lg p-4 text-sm text-gray-600 flex flex-wrap items-center gap-3">
            <span className="flex-1">
              {liq ? "Esta liquidación está anulada." : "Este trabajador aún no tiene liquidación."}
              {" "}El sistema arma la propuesta con su ficha, sus boletas y sus vacaciones; requiere los parámetros del mes de cese.
            </span>
            {puedeEscribir && trabajador.fechaCese && (
              <button type="button" onClick={crear} disabled={procesando} className="bg-purple-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-purple-700 disabled:opacity-50">
                {procesando ? "Armando…" : liq ? "Crear otra liquidación" : "Crear liquidación"}
              </button>
            )}
          </div>
        )}

        {liq && form && (
          <>
            {(liq.fichaCambio || liq.avisos?.length > 0) && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-sm text-amber-800 space-y-1">
                {liq.fichaCambio && <p className="font-medium">La ficha cambió: vuelve a la propuesta o revisa</p>}
                {liq.avisos.map((a, i) => <p key={i}>{a}</p>)}
              </div>
            )}
            {liq.estado === "confirmada" && (
              <p className="text-xs text-gray-500">Confirmada por {liq.confirmadaPor} el {cuando(liq.confirmadaEn)}: sus líneas están en la boleta de {mesAnio(liq.periodo)}.</p>
            )}
            {liq.estado === "anulada" && (
              <p className="text-xs text-gray-500">Anulada por {liq.anuladaPor} el {cuando(liq.anuladaEn)}. Motivo: {liq.motivoAnulacion}</p>
            )}

            <div className="grid md:grid-cols-2 gap-5">
              <section className="space-y-2">
                <h4 className="text-xs font-bold text-gray-600 uppercase">Remuneración computable</h4>
                <table className="w-full text-sm">
                  <tbody>
                    <tr className="border-b border-gray-100"><td className="py-1">Básico</td><td className="py-1 text-right tabular-nums">{money(b.basico)}</td></tr>
                    {b.asignacion > 0 && <tr className="border-b border-gray-100"><td className="py-1">Asignación familiar</td><td className="py-1 text-right tabular-nums">{money(b.asignacion)}</td></tr>}
                    {(b.fijos || []).map((f) => (
                      <tr key={f.codigo} className="border-b border-gray-100"><td className="py-1"><span className="font-mono text-xs text-gray-400 mr-1">{f.codigo}</span>{f.nombre}</td><td className="py-1 text-right tabular-nums">{money(f.monto)}</td></tr>
                    ))}
                    <tr className="border-b border-gray-100"><td className="py-1">Promedio de variables</td><td className="py-1 text-right tabular-nums">{money(b.promedioVariables)}</td></tr>
                    {(b.variables || []).map((v) => (
                      <tr key={v.codigo} className="text-xs text-gray-500">
                        <td className="py-0.5 pl-3"><span className="font-mono mr-1">{v.codigo}</span>{v.nombre}: {money(v.total)} en {v.meses} meses ÷ 6</td>
                        <td className="py-0.5 text-right tabular-nums">{money(v.promedio)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="flex flex-wrap gap-3">
                  {BASES.map(([k, etiqueta]) => (
                    <label key={k} className="text-xs text-gray-500">{etiqueta}
                      <input value={form.bases[k]} disabled={!editable} inputMode="decimal"
                        onChange={(e) => setBase(k, e.target.value)} onBlur={() => alSalir(form.bases[k] !== guardado.bases[k])}
                        className={`${INP} block w-32 text-right`} />
                    </label>
                  ))}
                  <div className="text-xs text-gray-500">Para CTS
                    <p className="py-1.5 text-sm text-gray-800 text-right tabular-nums w-32">{money(b.rcCts)}</p>
                  </div>
                </div>
                <p className="text-[11px] text-gray-400">
                  Para CTS = para vacaciones + sexto de gratificación
                  {b.gratificacionReferencia ? ` (1/6 de ${money(b.gratificacionReferencia.monto)}, gratificación de ${mesAnio(b.gratificacionReferencia.periodo)})` : ""}.
                </p>
              </section>

              <section className="space-y-3">
                {bl.cts && (
                  <div className="space-y-1">
                    <h4 className="text-xs font-bold text-gray-600 uppercase">CTS trunca <span className="font-normal normal-case text-gray-400">{tramo(bl.cts)}{bl.cts.factor !== 1 ? ` · factor ${bl.cts.factor}` : ""}</span></h4>
                    <div className="flex flex-wrap gap-3">{CAMPOS_BLOQUE.cts.map(([c, e]) => campoBloque("cts", c, e))}</div>
                  </div>
                )}
                <div className="space-y-1">
                  <h4 className="text-xs font-bold text-gray-600 uppercase">Vacaciones</h4>
                  {(bl.pendientes || []).map((p) => (
                    <p key={p.inicio} className="text-xs text-gray-600">
                      Periodo {fechaDMA(p.inicio)} – {fechaDMA(p.fin)}: {p.dias} días pendientes{p.indemnizacion ? ` · venció el ${fechaDMA(p.vence)} (con indemnización)` : ""}
                    </p>
                  ))}
                  {bl.truncas ? (
                    <>
                      <p className="text-xs text-gray-400">Truncas {tramo(bl.truncas)}{bl.truncas.factor !== 1 ? ` · factor ${bl.truncas.factor}` : ""}</p>
                      <div className="flex flex-wrap gap-3">{CAMPOS_BLOQUE.truncas.map(([c, e]) => campoBloque("truncas", c, e))}</div>
                    </>
                  ) : !(bl.pendientes || []).length && <p className="text-xs text-gray-400">Sin vacaciones por pagar.</p>}
                </div>
                {bl.gratificacion && (
                  <div className="space-y-1">
                    <h4 className="text-xs font-bold text-gray-600 uppercase">Gratificación trunca <span className="font-normal normal-case text-gray-400">{tramo(bl.gratificacion)}{bl.gratificacion.factor !== 1 ? ` · factor ${bl.gratificacion.factor}` : ""}</span></h4>
                    <div className="flex flex-wrap gap-3 items-end">
                      {CAMPOS_BLOQUE.gratificacion.map(([c, e]) => campoBloque("gratificacion", c, e))}
                      <p className="text-xs text-gray-500 pb-2">Bonificación extraordinaria: {bl.gratificacion.tasaBonificacion} %</p>
                    </div>
                  </div>
                )}
              </section>
            </div>

            <section className="space-y-2">
              <h4 className="text-xs font-bold text-gray-600 uppercase">Líneas de la liquidación</h4>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-500 border-b">
                    <th className="py-1 pr-2 w-64">Concepto</th><th className="py-1 pr-2">Descripción</th><th className="py-1 pr-2 text-right w-32">Monto</th><th className="py-1 w-20" />
                  </tr>
                </thead>
                <tbody>
                  {form.lineas.map((l, i) => (
                    <tr key={l.clave || `manual-${i}`} className="border-b border-gray-100 align-top">
                      <td className="py-1 pr-2">
                        {l.origen === "manual" && editable ? (
                          <select value={l.codigo} onChange={(e) => elegirConcepto(i, e.target.value)} className={`${INP} w-full`}>
                            <option value="">Concepto…</option>
                            {conceptos.map((c) => <option key={c.codigo} value={c.codigo}>{c.codigo} {c.nombre}{c.tipo === "descuento" ? " (descuento)" : ""}</option>)}
                          </select>
                        ) : (
                          <span><span className="font-mono text-xs text-gray-400 mr-1">{l.codigo}</span>{l.tipo === "descuento" ? "Descuento" : "Ingreso"}{l.origen === "manual" ? " (agregado)" : ""}</span>
                        )}
                      </td>
                      <td className="py-1 pr-2">
                        <input value={l.descripcion} maxLength={80} disabled={!editable} onChange={(e) => setLinea(i, { descripcion: e.target.value })} className={`${INP} w-full`} />
                        {l.origen === "propuesta" && (
                          <p className="text-[11px] text-gray-400 mt-0.5">
                            {l.editada ? "Monto ajustado por el contador" : formula(l.detalle)}
                            {l.editada && editable && <button type="button" onClick={() => usarFormula(i)} disabled={procesando} className="ml-2 text-purple-600 hover:underline">Usar la fórmula</button>}
                          </p>
                        )}
                      </td>
                      <td className="py-1 pr-2">
                        <input value={l.monto} disabled={!editable} inputMode="decimal" onChange={(e) => setLinea(i, { monto: e.target.value })}
                          className={`${INP} w-full text-right ${l.tipo === "descuento" ? "text-red-700" : ""}`} />
                      </td>
                      <td className="py-1 text-right">
                        {editable && <button type="button" onClick={() => quitarLinea(i)} disabled={procesando} className="text-xs text-red-600 hover:underline">Quitar</button>}
                      </td>
                    </tr>
                  ))}
                  {form.lineas.length === 0 && <tr><td colSpan={4} className="py-3 text-center text-gray-400 text-sm">Sin líneas</td></tr>}
                </tbody>
              </table>
              <div className="flex flex-wrap items-center gap-3">
                {editable && <button type="button" onClick={agregarLinea} disabled={procesando} className="text-xs text-purple-600 hover:underline">+ Concepto</button>}
                {form.quitadas.length > 0 && <p className="text-[11px] text-gray-400">{form.quitadas.length} línea(s) de la propuesta quitada(s): vuelven con «Volver a la propuesta».</p>}
              </div>
            </section>

            <div className="grid md:grid-cols-2 gap-5">
              <section className="space-y-1">
                <h4 className="text-xs font-bold text-gray-600 uppercase">Observaciones</h4>
                <textarea value={form.observaciones} maxLength={1000} rows={4} disabled={!editable}
                  onChange={(e) => setForm((f) => ({ ...f, observaciones: e.target.value }))} className={`${INP} w-full resize-none`} />
              </section>
              <section className="space-y-1">
                <h4 className="text-xs font-bold text-gray-600 uppercase">Descuentos de ley</h4>
                <table className="w-full text-sm">
                  <tbody>
                    {descuentosLey.map((d) => (
                      <tr key={d.codigo} className="border-b border-gray-100">
                        <td className="py-1 pr-2"><span className="font-mono text-xs text-gray-400 mr-1">{d.codigo}</span>{d.nombre}
                          <span className="block text-[11px] text-gray-400">Base {money(d.base)}{d.tasa != null ? ` × ${d.tasa} %` : ""}</span>
                        </td>
                        <td className="py-1 text-right tabular-nums">{money(d.monto)}</td>
                      </tr>
                    ))}
                    {descuentosLey.length === 0 && <tr><td colSpan={2} className="py-1 text-gray-400 text-sm">Sin descuentos de ley</td></tr>}
                  </tbody>
                </table>
                {liq.estado === "borrador" && <p className="text-[11px] text-gray-400">Vista previa con la boleta de {mesAnio(liq.periodo)}{sucio ? "; se actualiza al guardar" : ""}.</p>}
                <div className="text-sm border-t pt-2 space-y-0.5">
                  <p className="flex justify-between text-gray-600"><span>Ingresos</span><span className="tabular-nums">{money(totales.ingresos)}</span></p>
                  <p className="flex justify-between text-gray-600"><span>Descuentos</span><span className="tabular-nums">{money(totales.descuentos)}</span></p>
                  <p className="flex justify-between text-gray-600"><span>Descuentos de ley</span><span className="tabular-nums">{money(totales.leyes)}</span></p>
                  <p className="flex justify-between font-semibold text-gray-800"><span>Total a recibir</span><span className="tabular-nums">{money(totales.neto)}</span></p>
                  {enLetras && <p className="text-[11px] text-gray-500">Son: {enLetras}</p>}
                </div>
              </section>
            </div>
          </>
        )}

        {error && !fallo && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex flex-wrap justify-end gap-3">
          {editable && (
            <>
              <button type="button" onClick={() => setConfirmar("eliminar")} disabled={procesando} className="text-sm text-red-600 hover:underline mr-auto disabled:opacity-50">Eliminar borrador</button>
              <button type="button" onClick={() => setConfirmar("propuesta")} disabled={procesando} className="border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50">Volver a la propuesta</button>
            </>
          )}
          <button type="button" onClick={onClose} className="border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm hover:bg-gray-50">Cerrar</button>
          {editable && (
            <>
              <button type="button" onClick={() => guardar()} disabled={procesando || !sucio} className="bg-purple-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-purple-700 disabled:opacity-50">
                {procesando ? "Guardando…" : "Guardar"}
              </button>
              <button type="button" onClick={() => (sucio ? setError("Guarda los cambios antes de confirmar.") : setConfirmar("confirmar"))} disabled={procesando}
                className="bg-gray-900 text-white px-4 py-2 rounded-lg text-sm hover:bg-gray-700 disabled:opacity-50">Confirmar</button>
            </>
          )}
          {puedeEscribir && liq?.estado === "confirmada" && (
            <button type="button" onClick={() => setAnulando(true)} disabled={procesando} className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-red-700 disabled:opacity-50">Anular</button>
          )}
        </div>
      </div>

      {confirmar && (
        <ConfirmacionAccion
          mensaje={{
            propuesta: "Se descarta lo editado (montos, líneas agregadas y quitadas) y se vuelve a calcular la propuesta con la ficha actual. ¿Continuar?",
            eliminar: `Se elimina el borrador ${liq.codigo}. ¿Continuar?`,
            confirmar: `Se escriben las líneas en la boleta de ${mesAnio(liq.periodo)} y se recalcula (la planilla de ese mes debe estar generada y abierta). Después solo se puede anular. ¿Confirmar la liquidación?`,
          }[confirmar]}
          textoConfirmar={{ propuesta: "Volver a la propuesta", eliminar: "Eliminar", confirmar: "Confirmar" }[confirmar]}
          onCancelar={() => setConfirmar(null)} onConfirmar={ejecutar} />
      )}
      {anulando && (
        <ModalAnular id={liq._id} codigo={liq.codigo} onCancelar={() => setAnulando(false)}
          onAnulada={(d) => { setAnulando(false); mostrar(d); onCambio?.(); }} />
      )}
    </div>
  );
}
