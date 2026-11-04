import { useState, useEffect, useCallback } from "react";
import { fetchAuth, getUsuario } from "../../utils/fetchAuth";
import { fechaHoyLima } from "../../utils/fecha";
import {
  estadoTexto, idsElegibles, esPendiente, nombreZip, idsMarcables, excluidosDeMarcar, seleccionablesEnMasa, resumenProblemas,
  bajasDeAltaSinControl, puedeAnularAlta, puedeGenerarAltaSinControl, tipoMarcarPorDefecto, puedeElegir, puedeSctr, sinControlSeleccionables, idsSctr, motivoSinSctr,
} from "../../utils/tregistro";
import TablaScroll from "../TablaScroll";
import AvisoAccion from "../AvisoAccion";

const INP = "border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300";
const BOTON = "border border-purple-300 text-purple-700 px-3 py-2 rounded-lg text-sm hover:bg-purple-50 disabled:opacity-50";
const CHIP = {
  registrada: "bg-green-100 text-green-700", pendiente: "bg-amber-100 text-amber-700",
  incompleta: "bg-orange-100 text-orange-700", "sin control": "bg-gray-100 text-gray-600", anulada: "bg-red-100 text-red-700",
};
const TIPOS = { alta: "Alta", baja: "Baja", sctr: "Modificación SCTR" };
const fecha = (iso) => (iso ? iso.split("-").reverse().join("/") : "—");
const textoSctr = ({ antes, despues } = {}) => (!antes ? "alta de cobertura" : !despues ? "baja de cobertura" : "cambio de cobertura");
const lineaProblema = (p) => `${p.codigo} — ${p.mensaje}${p.campo ? ` (${p.campo})` : ""}`;

function Chip({ estado, texto }) {
  return <span className={`text-xs px-2 py-0.5 rounded-full whitespace-nowrap ${CHIP[estado] ?? ""}`}>{texto}</span>;
}

function ModalMarcar({ trabajadores, marcando, onCerrar, onMarcado, onConflicto }) {
  const [form, setForm] = useState(() => {
    const elegidos = new Set(marcando.ids);
    const soloSctr = !idsMarcables(trabajadores, elegidos, "alta").length && !idsMarcables(trabajadores, elegidos, "baja").length && idsSctr(trabajadores, elegidos).length > 0;
    return { tipo: marcando.tipo ?? (soloSctr ? "sctr" : tipoMarcarPorDefecto(trabajadores, elegidos)), fecha: fechaHoyLima(), ticket: "" };
  });
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const handleChange = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
  const elegidos = new Set(marcando.ids);
  const esSctr = form.tipo === "sctr";
  const ids = esSctr ? idsSctr(trabajadores, elegidos) : idsMarcables(trabajadores, elegidos, form.tipo);
  const excluidos = esSctr
    ? trabajadores.filter((t) => elegidos.has(t._id) && !puedeSctr(t)).map((t) => ({ nombre: t.nombre, motivo: motivoSinSctr(t) }))
    : excluidosDeMarcar(trabajadores, elegidos, form.tipo);

  const confirmar = async () => {
    if (!form.fecha) return setError("Indica la fecha de registro.");
    if (form.fecha > fechaHoyLima()) return setError("La fecha de registro no puede ser futura.");
    setGuardando(true);
    setError("");
    try {
      const r = await fetchAuth("/planilla/tregistro/marcar", {
        method: "POST", body: JSON.stringify({ tipo: form.tipo, ids, fecha: form.fecha, ticket: form.ticket.trim() }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        if (r.status === 409) onConflicto();
        return setError(d.mensaje || "No se pudo marcar como registrados.");
      }
      onMarcado(ids);
    } catch {
      setError("Error de conexión con el servidor.");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md space-y-4">
        <h3 className="font-semibold text-gray-800">Marcar como registrados en SUNAT</h3>
        {marcando.tipo ? (
          <p className="text-sm text-gray-600">{TIPOS[form.tipo]} de {marcando.nombre}.</p>
        ) : (
          <label className="text-xs text-gray-500 block">Trámite
            <select name="tipo" value={form.tipo} onChange={handleChange} className={`${INP} w-full`}>
              <option value="alta">Alta (inscripción)</option>
              <option value="baja">Baja (cese)</option>
              <option value="sctr">Modificación SCTR</option>
            </select>
          </label>
        )}
        <label className="text-xs text-gray-500 block">Fecha de registro
          <input type="date" name="fecha" value={form.fecha} max={fechaHoyLima()} onChange={handleChange} className={`${INP} w-full`} />
        </label>
        <label className="text-xs text-gray-500 block">Ticket de SUNAT (opcional)
          <input name="ticket" value={form.ticket} maxLength={40} onChange={handleChange} className={`${INP} w-full`} />
        </label>
        {!marcando.tipo && (
          <p className="text-xs text-gray-500">
            {ids.length
              ? `${ids.length} trabajador(es) de los seleccionados se marcarán con ${{ alta: "el alta", baja: "la baja", sctr: "la modificación de SCTR" }[form.tipo]} registrada.`
              : `Ninguno de los seleccionados tiene ${{ alta: "un alta", baja: "una baja", sctr: "una modificación de SCTR" }[form.tipo]} por registrar.`}
          </p>
        )}
        {!marcando.tipo && excluidos.length > 0 && (
          <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            <p className="font-medium">No se marcarán {excluidos.length}:</p>
            <ul className="list-disc pl-4">{excluidos.map((x) => <li key={x.nombre}>{x.nombre}: {x.motivo}</li>)}</ul>
          </div>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-3">
          <button onClick={onCerrar} disabled={guardando} className="border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50">Cancelar</button>
          <button onClick={confirmar} disabled={guardando || !ids.length} className="bg-purple-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-purple-700 disabled:opacity-50">
            {guardando ? "Guardando…" : "Marcar como registrados"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ModalAnular({ anulando, onCerrar, onAnulada }) {
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  const confirmar = async () => {
    const texto = motivo.trim();
    if (!texto) return setError("Indica el motivo de la anulación.");
    setGuardando(true);
    setError("");
    try {
      const r = await fetchAuth("/planilla/tregistro/anular-alta", { method: "POST", body: JSON.stringify({ id: anulando._id, motivo: texto }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) return setError(d.mensaje || "No se pudo anular el alta.");
      onAnulada();
    } catch {
      setError("Error de conexión con el servidor.");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md space-y-4">
        <h3 className="font-semibold text-gray-800">Anular el alta de {anulando.nombre}</h3>
        <p className="text-sm text-gray-600">
          Úsalo cuando el alta no debe registrarse en SUNAT (por ejemplo, el ingreso no se concretó o la ficha se creó por error). El trabajador sigue en la planilla con sus fechas de ingreso y cese.
        </p>
        <label className="text-xs text-gray-500 block">Motivo de la anulación
          <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={120} rows={3} className={`${INP} w-full`} />
          <span className="block text-right text-[11px] text-gray-400">{motivo.length}/120</span>
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-3">
          <button onClick={onCerrar} disabled={guardando} className="border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50">Cancelar</button>
          <button onClick={confirmar} disabled={guardando} className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-red-700 disabled:opacity-50">
            {guardando ? "Guardando…" : "Anular alta"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ModalProblemas({ problemas, onCerrar }) {
  const porTrabajador = new Map();
  for (const p of problemas.lista) porTrabajador.set(p.trabajador, [...(porTrabajador.get(p.trabajador) ?? []), p]);
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-2xl space-y-3 max-h-[90vh] flex flex-col">
        <h3 className="font-semibold text-gray-800">No se pudo generar el archivo</h3>
        <p className="text-sm text-gray-600">{problemas.mensaje}. Corrige estos datos en la ficha del trabajador y vuelve a descargar.</p>
        <div className="overflow-y-auto space-y-3">
          {[...porTrabajador].map(([trabajador, lista]) => (
            <div key={trabajador}>
              <p className="text-sm font-medium text-gray-700">{trabajador}</p>
              <ul className="list-disc pl-5 text-sm text-gray-600">
                {lista.map((p, i) => <li key={i}>{lineaProblema(p)}</li>)}
              </ul>
            </div>
          ))}
        </div>
        <div className="flex justify-end">
          <button onClick={onCerrar} className="bg-gray-900 text-white px-4 py-2 rounded-lg text-sm hover:bg-gray-700">Cerrar</button>
        </div>
      </div>
    </div>
  );
}

function BuscadorErrores() {
  const [q, setQ] = useState("");
  const [resultado, setResultado] = useState({ q: "", lista: [] });
  const [error, setError] = useState("");

  useEffect(() => {
    const texto = q.trim();
    if (!texto) return;
    let vigente = true;
    const espera = setTimeout(async () => {
      try {
        const r = await fetchAuth(`/planilla/tregistro/errores?q=${encodeURIComponent(texto)}`);
        const d = await r.json().catch(() => []);
        if (!vigente) return;
        if (r.ok && Array.isArray(d)) { setError(""); setResultado({ q: texto, lista: d }); } else setError(d.mensaje || "No se pudo buscar.");
      } catch {
        if (vigente) setError("Error de conexión con el servidor.");
      }
    }, 300);
    return () => { vigente = false; clearTimeout(espera); };
  }, [q]);

  const texto = q.trim();
  const actual = texto && resultado.q === texto ? resultado.lista : null;
  return (
    <div className="border border-gray-200 rounded-xl p-4 space-y-3">
      <h3 className="font-semibold text-gray-800 text-sm">Buscar código de error</h3>
      <input value={q} onChange={(e) => setQ(e.target.value)} maxLength={60} placeholder="Código (ej. EPR1.56) o parte del mensaje…" className={`${INP} w-full`} />
      {error && <p className="text-sm text-red-600">{error}</p>}
      {actual?.length === 0 && <p className="text-sm text-gray-400">Sin resultados</p>}
      {actual?.length > 0 && (
        <ul className="divide-y divide-gray-100 max-h-96 overflow-y-auto">
          {actual.map((e) => (
            <li key={e.codigo} className="py-2 text-sm">
              <p><span className="font-mono font-semibold text-gray-800">{e.codigo}</span>{e.campo && <span className="text-xs text-gray-400 ml-2">{e.campo}</span>}</p>
              <p className="text-gray-700">{e.mensaje}</p>
              <p className="text-gray-500"><span className="font-medium">Cómo corregir:</span> {e.correccion}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Altas y bajas de los trabajadores ante SUNAT: se descarga el .zip con los archivos del PVS T-Registro, se valida y se
// sube en SOL; después se marcan como registrados aquí.
export default function PanelTRegistro({ puedeEscribir, refrescarAvisos }) {
  const [trabajadores, setTrabajadores] = useState(null);
  const [filtro, setFiltro] = useState("todos");
  const [seleccion, setSeleccion] = useState(() => new Set());
  const [abiertos, setAbiertos] = useState(() => new Set());
  const [descargando, setDescargando] = useState("");
  const [marcando, setMarcando] = useState(null);
  const [anulando, setAnulando] = useState(null);
  const [problemas, setProblemas] = useState(null);
  const [aviso, setAviso] = useState("");

  const cargar = useCallback(async () => {
    try {
      const r = await fetchAuth("/planilla/tregistro/trabajadores");
      const d = await r.json().catch(() => ({}));
      if (r.ok) setTrabajadores(d); else setAviso(d.mensaje || "No se pudo cargar la lista de trabajadores.");
    } catch {
      setAviso("Error de conexión con el servidor.");
    }
  }, []);
  useEffect(() => { const t = setTimeout(cargar, 0); return () => clearTimeout(t); }, [cargar]);
  const recargar = () => { cargar(); refrescarAvisos?.(); };

  const visibles = (trabajadores ?? []).filter((t) => filtro === "todos" || esPendiente(t));
  const elegibles = seleccionablesEnMasa(visibles);
  const todosElegidos = elegibles.length > 0 && elegibles.every((t) => seleccion.has(t._id));
  const seleccionVisible = visibles.filter((t) => seleccion.has(t._id)).map((t) => t._id);
  const idsAlta = idsElegibles(visibles, seleccion, "alta");
  const idsBaja = idsElegibles(visibles, seleccion, "baja");
  const sinAltaPropia = bajasDeAltaSinControl(visibles, idsBaja);
  const idsModificacionSctr = idsSctr(visibles, seleccion);
  const hayMarcables = idsMarcables(visibles, seleccion, "alta").length > 0 || idsMarcables(visibles, seleccion, "baja").length > 0 || idsModificacionSctr.length > 0;
  const sinControl = sinControlSeleccionables(visibles);
  const hayBajaSctr = visibles.some((t) => t.estado.sctr === "pendiente" && t.sctr && !t.sctr.despues);
  const rol = getUsuario()?.rol;

  const alternar = (id) => setSeleccion((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const alternarTodos = () => setSeleccion((s) => {
    const n = new Set(s);
    for (const t of elegibles) { if (todosElegidos) n.delete(t._id); else n.add(t._id); }
    return n;
  });
  const agregarSinControl = () => setSeleccion((s) => new Set([...s, ...sinControl.map((t) => t._id)]));
  const alternarProblemas = (id) => setAbiertos((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const descargar = async (tipo, ids) => {
    setDescargando(tipo);
    try {
      const r = await fetchAuth(`/planilla/tregistro/archivo/${tipo}`, { method: "POST", body: JSON.stringify({ ids }) });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        if (r.status === 400 && d.problemas?.length) return setProblemas({ mensaje: d.mensaje, lista: d.problemas });
        return setAviso(d.mensaje || "No se pudo generar el archivo.");
      }
      const url = URL.createObjectURL(await r.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = nombreZip(r.headers.get("Content-Disposition"), tipo);
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      refrescarAvisos?.();
    } catch {
      setAviso("Error de conexión con el servidor.");
    } finally {
      setDescargando("");
    }
  };

  const marcado = (ids) => {
    setMarcando(null);
    setSeleccion((s) => { const n = new Set(s); ids.forEach((id) => n.delete(id)); return n; });
    recargar();
  };

  const accionesFila = (t) => {
    const tipos = ["alta", "baja"].filter((tipo) => t.estado[tipo] === "sin control");
    return (
      <>
        {tipos.map((tipo) => (
          <button key={tipo} onClick={() => setMarcando({ tipo, ids: [t._id], nombre: t.nombre })} className="block text-xs text-purple-600 hover:underline whitespace-nowrap ml-auto">
            {tipos.length === 1 ? "Ya registrado en SUNAT" : `${TIPOS[tipo]}: ya registrado en SUNAT`}
          </button>
        ))}
        {puedeEscribir && puedeGenerarAltaSinControl(t) && (
          <button onClick={() => descargar("alta", [t._id])} disabled={Boolean(descargando)} className="block text-xs text-purple-600 hover:underline whitespace-nowrap ml-auto disabled:opacity-50">Generar alta</button>
        )}
        {puedeAnularAlta(rol, t) && (
          <button onClick={() => setAnulando(t)} className="block text-xs text-red-600 hover:underline whitespace-nowrap ml-auto">Anular alta</button>
        )}
      </>
    );
  };

  const columnas = puedeEscribir ? 9 : 7;
  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">
        Descarga el .zip, ábrelo en el PVS T-Registro para validarlo y súbelo en SOL; luego márcalos como registrados.
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex rounded-lg border border-gray-300 overflow-hidden text-sm">
          {[["pendientes", "Pendientes"], ["todos", "Todos"]].map(([id, texto]) => (
            <button key={id} onClick={() => setFiltro(id)} className={`px-3 py-2 ${filtro === id ? "bg-purple-600 text-white" : "text-gray-600 hover:bg-gray-50"}`}>{texto}</button>
          ))}
        </div>
        <div className="flex-1" />
        {puedeEscribir && (
          <>
            <span className="text-xs text-gray-500">{seleccionVisible.length} seleccionado(s)</span>
            <button onClick={() => descargar("alta", idsAlta)} disabled={!idsAlta.length || Boolean(descargando)} className={BOTON}>
              {descargando === "alta" ? "Generando…" : `Descargar altas (${idsAlta.length})`}
            </button>
            <button onClick={() => descargar("baja", idsBaja)} disabled={!idsBaja.length || Boolean(descargando)} className={BOTON}>
              {descargando === "baja" ? "Generando…" : `Descargar bajas (${idsBaja.length})`}
            </button>
            <button onClick={() => descargar("sctr", idsModificacionSctr)} disabled={!idsModificacionSctr.length || Boolean(descargando)} className={BOTON}>
              {descargando === "sctr" ? "Generando…" : `Descargar modificaciones SCTR (${idsModificacionSctr.length})`}
            </button>
            <button onClick={agregarSinControl} disabled={!sinControl.length} className={BOTON} title="Agrega a la selección las altas que se asumen hechas a mano en SUNAT, para marcarlas como registradas en lote">
              Seleccionar sin control ({sinControl.length})
            </button>
            <button onClick={() => setMarcando({ ids: seleccionVisible })} disabled={!hayMarcables}
              className="bg-purple-600 text-white px-3 py-2 rounded-lg text-sm hover:bg-purple-700 disabled:opacity-50">
              Marcar como registrados
            </button>
          </>
        )}
      </div>

      {hayBajaSctr && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          Si el PVS rechaza la baja de cobertura (ETR17.21), regístrala en T-Registro en línea y luego márcala aquí como registrada.
        </p>
      )}

      {sinAltaPropia.length > 0 && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          Se asume que su alta se hizo a mano en SUNAT: {sinAltaPropia.join(", ")}.
        </p>
      )}

      <TablaScroll>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-gray-500 border-b">
              {puedeEscribir && (
                <th className="py-2 pr-3 w-8">
                  <input type="checkbox" checked={todosElegidos} disabled={!elegibles.length} onChange={alternarTodos} title="Seleccionar todo lo pendiente: altas, bajas y modificaciones SCTR (las filas sin control se eligen una a una)" />
                </th>
              )}
              <th className="py-2 pr-3">Trabajador</th><th className="py-2 pr-3">Ingreso</th><th className="py-2 pr-3">Cese</th>
              <th className="py-2 pr-3">Alta</th><th className="py-2 pr-3">Baja</th><th className="py-2 pr-3">SCTR</th><th className="py-2 pr-3">Problemas</th>
              {puedeEscribir && <th className="py-2" />}
            </tr>
          </thead>
          <tbody>
            {visibles.map((t) => {
              const texto = estadoTexto(t.estado);
              const { activos, atenuados } = resumenProblemas(t);
              const abierto = abiertos.has(t._id);
              return (
                <tr key={t._id} className="border-b border-gray-100 align-top">
                  {puedeEscribir && (
                    <td className="py-1.5 pr-3">
                      <input type="checkbox" checked={seleccion.has(t._id)} onChange={() => alternar(t._id)}
                        disabled={!puedeElegir(t)} aria-label={`Elegir a ${t.nombre}`} />
                    </td>
                  )}
                  <td className="py-1.5 pr-3">{t.nombre}<span className="block text-xs text-gray-400">{t.numDoc}</span></td>
                  <td className="py-1.5 pr-3 tabular-nums">{fecha(t.fechaIngreso)}</td>
                  <td className="py-1.5 pr-3 tabular-nums">{fecha(t.fechaCese)}</td>
                  <td className="py-1.5 pr-3"><Chip estado={t.estado.alta} texto={texto.alta} /></td>
                  <td className="py-1.5 pr-3">{t.estado.baja === "ninguna" ? <span className="text-gray-300">—</span> : <Chip estado={t.estado.baja} texto={texto.baja} />}</td>
                  <td className="py-1.5 pr-3">
                    {t.estado.sctr === "pendiente" ? (
                      <>
                        <Chip estado="pendiente" texto="SCTR pendiente" />
                        {t.sctr && <span className="block text-xs text-gray-400">{textoSctr(t.sctr)} · {fecha(t.sctr.fecha)}</span>}
                        {!puedeSctr(t) && <span className="block text-xs text-gray-400">{motivoSinSctr(t)}</span>}
                      </>
                    ) : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="py-1.5 pr-3 min-w-56">
                    {activos + atenuados === 0 ? <span className="text-xs text-gray-300">—</span> : (
                      <>
                        <button onClick={() => alternarProblemas(t._id)} className={`text-xs hover:underline ${activos ? "text-red-600" : "text-gray-400"}`}>
                          {activos > 0 && `${activos} problema(s)`}{activos > 0 && atenuados > 0 && " · "}
                          {atenuados > 0 && `${atenuados} del alta (solo si vas a dar de alta)`} {abierto ? "▴" : "▾"}
                        </button>
                        {abierto && (
                          <div className="mt-1 text-xs text-gray-600 space-y-1">
                            {[["Alta", t.problemasAlta, atenuados > 0], ["Baja", t.problemasBaja, false]].filter(([, l]) => l.length).map(([titulo, l, atenuada]) => (
                              <div key={titulo} className={atenuada ? "text-gray-400" : ""}>
                                <span className="font-medium">{titulo}{atenuada && " (solo si vas a dar de alta)"}</span>
                                <ul className="list-disc pl-4">{l.map((p, i) => <li key={i}>{lineaProblema(p)}</li>)}</ul>
                              </div>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </td>
                  {puedeEscribir && <td className="py-1.5 text-right">{accionesFila(t)}</td>}
                </tr>
              );
            })}
            {trabajadores && visibles.length === 0 && (
              <tr><td colSpan={columnas} className="py-6 text-center text-gray-400 text-sm">
                {trabajadores.length === 0 ? "Aún no hay trabajadores" : "Ningún trabajador pendiente. Elige «Todos» para ver el resto."}
              </td></tr>
            )}
          </tbody>
        </table>
      </TablaScroll>

      <BuscadorErrores />

      {marcando && <ModalMarcar trabajadores={trabajadores ?? []} marcando={marcando} onCerrar={() => setMarcando(null)} onMarcado={marcado} onConflicto={recargar} />}
      {anulando && <ModalAnular anulando={anulando} onCerrar={() => setAnulando(null)} onAnulada={() => { setAnulando(null); recargar(); }} />}
      {problemas && <ModalProblemas problemas={problemas} onCerrar={() => setProblemas(null)} />}
      {aviso && <AvisoAccion mensaje={aviso} onCerrar={() => setAviso("")} />}
    </div>
  );
}
