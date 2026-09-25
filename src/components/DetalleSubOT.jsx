import { useState, useEffect } from "react";
import { fetchAuth, getUsuario } from "../utils/fetchAuth";
import { formatearFecha } from "../utils/fecha";
import ModalRequerimiento from "./ModalRequerimiento";
import ModalNotificacionTrabajo from "./ModalNotificacionTrabajo";
import ModalDetalleNotificacionTrabajo from "./ModalDetalleNotificacionTrabajo";
import TablaServiciosExternos from "./TablaServiciosExternos";
import TablaScroll from "./TablaScroll";
import { Chip, BotonAnular, BotonCerrarCadena, BotonDesanular, BannerAnulado, bloqueadoPorCadenaCerrada } from "./detalleShared";

const INP = "border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300 w-full transition";

const ESTADOS = ["pendiente", "en progreso", "completado", "entregado"];

const colorEstado = (e, activo) => {
  if (!activo) return "bg-gray-100 text-gray-500 hover:bg-gray-200";
  if (e === "entregado")  return "bg-teal-600 text-white";
  if (e === "completado") return "bg-green-600 text-white";
  if (e === "en progreso") return "bg-blue-600 text-white";
  return "bg-amber-500 text-white";
};

// Descripción de un ítem de requerimiento — para solicitudes de compra sin
// SKU todavía no hay `material.nombre`, el detalle real vive en
// `camposCompra` (categoría "Otros" siempre trae `.descripcion`; el resto de
// categorías traen campos dinámicos definidos por el almacenero — ahí no hay
// una key fija, así que se cae a `categoriaNombre`).
const descripcionItem = (it) => it.esSolicitudCompra
  ? (it.camposCompra?.descripcion || it.categoriaNombre)
  : (it.material?.nombre || "—");

// Estado de un ítem de requerimiento — una solicitud de compra sigue el
// pipeline de pago (por_procesar/pendiente_pago/pagado, ver
// Requerimientos.jsx), independiente del pipeline de despacho de almacén
// (pendiente/atendido/rechazado) que sí aplica a los ítems de stock.
const ESTADO_ITEM_COMPRA = {
  por_procesar:   { clase: "bg-gray-100 text-gray-600",   label: "Por procesar" },
  pendiente_pago: { clase: "bg-amber-100 text-amber-700", label: "Pendiente de pago" },
  pagado:         { clase: "bg-green-100 text-green-700", label: "Pagado" },
};
const ESTADO_ITEM_STOCK = {
  pendiente: { clase: "bg-blue-100 text-blue-700",  label: "Pendiente" },
  atendido:  { clase: "bg-green-100 text-green-700", label: "Atendido" },
  rechazado: { clase: "bg-red-100 text-red-700",     label: "Rechazado" },
};
const estadoItem = (it) => it.esSolicitudCompra
  ? (ESTADO_ITEM_COMPRA[it.estadoPago || "por_procesar"] || ESTADO_ITEM_COMPRA.por_procesar)
  : (ESTADO_ITEM_STOCK[it.estado] || { clase: "bg-gray-100 text-gray-500", label: it.estado || "—" });

// Vista de detalle dedicada a una sub-OT — a propósito NO reutiliza el
// formulario completo de DetalleOrdenTrabajo.jsx: cliente/planta/N° OT/guía
// de llegada/etc. ya están fijados por el padre al crearla, así que
// mostrarlos de nuevo en un form editable es puro ruido repetido. Acá solo
// se edita lo propio de la sub-tarea; el contexto heredado se muestra en una
// franja de solo lectura, con un link para saltar al padre si hace falta.
export default function DetalleSubOT({ orden: inicial, onClose, onGuardada, onNavegar }) {
  const [ot, setOt] = useState(inicial);
  const [form, setForm] = useState({
    titulo:               inicial.titulo               || "",
    descripcion:           inicial.descripcion           || "",
    personalAsignado:      inicial.personalAsignado?._id || inicial.personalAsignado || "",
    estado:                 inicial.estado                 || "pendiente",
    fechaEntrega: inicial.fechaEntrega
      ? new Date(inicial.fechaEntrega).toISOString().split("T")[0] : "",
    numeroGuiaRemision:    inicial.numeroGuiaRemision    || "",
    observaciones:          inicial.observaciones          || "",
    irreparable:            inicial.irreparable            || false,
  });
  const rolActual = getUsuario()?.rol;
  const puedeEditarCampos = ["admin", "jefatura", "supervisor", "planner", "coordinadora"].includes(rolActual);
  // Anular un documento queda reservado a Admin y Jefatura — Facturación ya
  // no puede. Desanular y cerrar/abrir la cadena a mano son exclusivos de admin.
  const puedeAnular = ["admin", "jefatura"].includes(rolActual);
  const esAdmin = rolActual === "admin";
  const esTecnico = ["tecnico", "tecnico_prueba", "tecnico_intervencion"].includes(rolActual);
  // Tabla de Servicios Externos: la ven todos los roles menos técnico.
  const puedeVerServicios = !esTecnico;
  const cadenaCerrada = bloqueadoPorCadenaCerrada(ot.estadoCadena, rolActual);
  // Progreso (Encargado de Progreso) — mismo criterio que
  // DetalleOrdenTrabajo.jsx: card independiente del fieldset, editable por
  // el técnico cuyo nombre coincide con `encargado`.
  const nombreActual = getUsuario()?.nombre;
  const coincideNombre = (a, b) => !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();
  const puedeEditarEstado = puedeEditarCampos || (esTecnico && coincideNombre(ot.encargado, nombreActual));
  // Reasignar QUIÉN es Encargado de Progreso — a diferencia de arriba, no
  // exige ya ser el encargado (reasignar a otra persona es el propósito).
  // Estrictamente el rol "tecnico" (NO tecnico_prueba/tecnico_intervencion,
  // que solo editan su propia tarjeta de progreso más arriba).
  const puedeEditarEncargados = puedeEditarCampos || rolActual === "tecnico";
  const [usuarios, setUsuarios] = useState([]);
  const [tecnicos, setTecnicos] = useState([]);
  const [requerimientos, setRequerimientos] = useState([]);
  const [crearRequerimientoOpen, setCrearRequerimientoOpen] = useState(false);
  const [servicios, setServicios] = useState([]);
  const [notificacionesTrabajo, setNotificacionesTrabajo] = useState([]);
  const [crearNotificacionOpen, setCrearNotificacionOpen] = useState(false);
  const [detalleNotificacion, setDetalleNotificacion] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  // Notificar trabajo (HH/HM) — supervisor, +admin como excepción.
  const puedeNotificarTrabajo = ["supervisor", "admin"].includes(rolActual);

  const cargarRelaciones = () => {
    fetchAuth(`/requerimientos?ordenTrabajo=${ot._id}`)
      .then(r => r.ok && r.json())
      .then(reqs => setRequerimientos(reqs || []));
    if (puedeVerServicios) {
      fetchAuth(`/servicios-externos?ordenTrabajo=${ot._id}`)
        .then(r => r.ok && r.json())
        .then(servs => setServicios(servs || []));
      fetchAuth(`/notificaciones-trabajo?ordenTrabajo=${ot._id}`)
        .then(r => r.ok && r.json())
        .then(nots => setNotificacionesTrabajo(nots || []));
    }
  };

  useEffect(() => {
    fetchAuth("/personal/lista?todos=true").then(r => r.ok && r.json().then(u => setUsuarios(u || [])));
    // Encargado de Progreso se elige entre los usuarios con login y alguno
    // de los 3 roles de técnico (distinto de "Personal asignado") — ver Fase 13.
    fetchAuth("/usuarios/lista").then(r => r.ok && r.json()).then(u => setTecnicos((u || []).filter(x => ["tecnico", "tecnico_prueba", "tecnico_intervencion"].includes(x.rol))));
    cargarRelaciones();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ot._id]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
  };

  const guardar = async () => {
    if (!form.titulo.trim()) { setError("El título de la sub-OT es obligatorio."); return; }
    setGuardando(true); setError("");
    const body = { ...form };
    if (!body.personalAsignado) delete body.personalAsignado;
    if (!body.fechaEntrega) delete body.fechaEntrega;

    const res = await fetchAuth(`/ordenes-trabajo/${ot._id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const actualizada = await res.json();
      setOt(actualizada);
      onGuardada?.(actualizada);
    } else {
      setError("Error al guardar los cambios.");
    }
    setGuardando(false);
  };

  // Cambian de inmediato (sin pasar por "Guardar cambios", que técnico no
  // puede usar) — no llaman `onGuardada` a propósito: ese callback cierra el
  // modal entero, y marcar un estado no debería sacar al usuario de la vista.
  const cambiarEstado = async (nuevo) => {
    const res = await fetchAuth(`/ordenes-trabajo/${ot._id}/estado`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ estado: nuevo }),
    });
    if (res.ok) {
      const actualizada = await res.json();
      setOt(actualizada);
      setForm((f) => ({ ...f, estado: actualizada.estado }));
    }
  };

  const cambiarEncargado = async (campo, nombre) => {
    const res = await fetchAuth(`/ordenes-trabajo/${ot._id}/encargados`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [campo]: nombre }),
    });
    if (res.ok) {
      const actualizada = await res.json();
      setOt(actualizada);
      setForm((f) => ({ ...f, [campo]: actualizada[campo] }));
    }
  };

  const anular = async (motivo) => {
    const res = await fetchAuth(`/ordenes-trabajo/${ot._id}/anular`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ motivo }),
    });
    if (res.ok) {
      const actualizada = await res.json();
      setOt(actualizada);
      onGuardada?.(actualizada);
    } else {
      setError("Error al anular el documento.");
    }
  };

  const desanular = async () => {
    const res = await fetchAuth(`/ordenes-trabajo/${ot._id}/desanular`, { method: "PATCH" });
    if (res.ok) {
      const actualizada = await res.json();
      setOt(actualizada);
      onGuardada?.(actualizada);
    } else {
      setError("Error al desanular el documento.");
    }
  };

  const toggleCerrarCadena = async (cerrado) => {
    const res = await fetchAuth(`/ordenes-trabajo/${ot._id}/cerrar-cadena`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cerrado }),
    });
    if (res.ok) {
      const actualizada = await res.json();
      setOt(actualizada);
      onGuardada?.(actualizada);
    } else {
      setError("Error al cerrar/abrir la cadena.");
    }
  };

  const padre = ot.ordenPadre;

  // `ot.ordenPadre` viene liviano del backend (select: "codigo numeroOT",
  // solo para el breadcrumb) — navegar con eso tal cual monta el detalle del
  // padre con un `orden` incompleto y su form aparece vacío. Se busca el
  // documento completo antes de navegar (mismo patrón "traer todo y buscar
  // por id" que ya usa cargarRelaciones en el resto de la app).
  const irAlPadre = async () => {
    if (!padre) return;
    const r = await fetchAuth("/ordenes-trabajo");
    const lista = r.ok ? await r.json() : [];
    const padreCompleto = lista.find(o => o._id === padre._id);
    onNavegar?.({ tipo: "ot", data: padreCompleto || padre });
  };

  return (
    <div className="fixed inset-0 z-50 bg-gray-50 flex flex-col">
      {/* Header degradado */}
      <div className="shrink-0 bg-gradient-to-r from-violet-600 to-fuchsia-700 text-white">
        <div className="max-w-6xl mx-auto px-8 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={onClose}
              className="text-sm text-white/80 hover:text-white transition flex items-center gap-1.5 group shrink-0">
              <span className="group-hover:-translate-x-0.5 transition">←</span> Órdenes de Trabajo
            </button>
            <span className="w-px h-8 bg-white/20" />
            <div>
              <p className="text-lg font-bold text-white uppercase tracking-widest leading-none">Sub-Orden</p>
              <h1 className="text-lg font-bold font-mono leading-tight">{ot.numeroOT || ot.codigo}</h1>
              {padre && (
                <button type="button" onClick={irAlPadre}
                  className="text-xs font-normal text-white/70 hover:text-white leading-tight underline underline-offset-2">
                  Sub-OT de {padre.numeroOT || padre.codigo} — ver OT padre
                </button>
              )}
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-[10px] text-white/60 uppercase tracking-widest leading-none">Estado</p>
              <Chip className="mt-0.5 bg-white/20 text-white">{ot.estado}</Chip>
              {ot.irreparable && <Chip className="mt-1 bg-red-500/40 text-white block">Irreparable</Chip>}
            </div>
            {!ot.anulado && !cadenaCerrada && puedeAnular && <BotonAnular onAnular={anular} />}
            {esAdmin && ot.anulado && <BotonDesanular onDesanular={desanular} />}
            {esAdmin && <BotonCerrarCadena cerrado={cadenaCerrada} onToggle={toggleCerrarCadena} />}
            {!ot.anulado && !cadenaCerrada && puedeEditarCampos && (
              <button onClick={guardar} disabled={guardando}
                className="bg-white text-violet-700 text-sm px-5 py-2 rounded-lg hover:bg-violet-50 disabled:opacity-60 transition font-semibold shadow-sm shrink-0">
                {guardando ? "Guardando…" : "Guardar cambios"}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Franja de contexto heredado del padre — solo lectura */}
      <div className="shrink-0 bg-white border-b border-gray-100 shadow-sm">
        <div className="max-w-6xl mx-auto px-8 py-3 flex flex-wrap gap-x-8 gap-y-1 text-xs">
          <span><span className="text-gray-400">Cliente:</span> <span className="text-gray-700">{ot.empresa?.razonSocial || "—"}</span></span>
          <span><span className="text-gray-400">Planta:</span> <span className="text-gray-700">{ot.planta || "—"}</span></span>
          <span><span className="text-gray-400">Fecha de ingreso:</span> <span className="text-gray-700">{ot.fechaRecibida ? formatearFecha(ot.fechaRecibida) : "—"}</span></span>
          <span><span className="text-gray-400">Guía de llegada:</span> <span className="text-gray-700">{ot.numeroGuiaEmision || "—"}</span></span>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto px-8 pt-8">
          {/* Progreso (Encargado de Progreso) — card independiente del
              fieldset principal. */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-2 md:max-w-sm">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Progreso — Encargado de Progreso</p>
            <select value={ot.encargado || ""} disabled={!puedeEditarEncargados}
              onChange={(e) => cambiarEncargado("encargado", e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm disabled:bg-gray-50 disabled:text-gray-500">
              <option value="">Sin asignar</option>
              {tecnicos.map(t => (
                <option key={t._id} value={t.nombre}>{t.nombre}</option>
              ))}
            </select>
            <div className="flex gap-2">
              {ESTADOS.map(e => (
                <button key={e} type="button" disabled={!puedeEditarEstado}
                  onClick={() => cambiarEstado(e)}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-medium capitalize transition disabled:opacity-60 disabled:cursor-not-allowed ${colorEstado(e, ot.estado === e)}`}>
                  {e}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="max-w-6xl mx-auto px-8 py-8 grid grid-cols-1 lg:grid-cols-3 gap-8">

          {/* Datos editables — solo lo propio de la sub-tarea */}
          <fieldset disabled={ot.anulado || cadenaCerrada || !puedeEditarCampos} className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-5 self-start">
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-5 rounded-full bg-violet-500" />
              <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide">Datos de la sub-orden</h2>
            </div>

            {ot.anulado && (
              <BannerAnulado motivo={ot.motivoAnulacion} por={ot.anuladoPor} fecha={ot.fechaAnulacion} />
            )}

            {!ot.anulado && cadenaCerrada && (
              <p className="text-xs text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                La cadena de este documento está cerrada (factura pagada) — de solo lectura. Solo Jefatura puede editarlo.
              </p>
            )}

            <div>
              <label className="text-xs text-gray-500 block mb-1">Título</label>
              <input name="titulo" value={form.titulo} onChange={handleChange} placeholder="Título de la sub-tarea" className={INP} />
            </div>

            <div>
              <label className="text-xs text-gray-500 block mb-1">Descripción</label>
              <textarea name="descripcion" value={form.descripcion} onChange={handleChange}
                rows={2} className={`${INP} resize-none`} />
            </div>

            <div>
              <label className="text-xs text-gray-500 block mb-1">Personal asignado</label>
              <select name="personalAsignado" value={form.personalAsignado} onChange={handleChange} className={INP}>
                <option value="">Sin asignar</option>
                {usuarios.map(u => (
                  <option key={u._id} value={u._id}>{u.nombre}{!u.activo ? " (inactivo)" : ""}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs text-gray-500 block mb-1">Fecha de entrega</label>
              <input type="date" name="fechaEntrega" value={form.fechaEntrega} onChange={handleChange} className={INP} />
            </div>

            <div>
              <label className="text-xs text-gray-500 block mb-1">Guía de salida</label>
              <input name="numeroGuiaRemision" value={form.numeroGuiaRemision} onChange={handleChange} placeholder="—" className={INP} />
            </div>

            <div>
              <label className="text-xs text-gray-500 block mb-1">Observaciones</label>
              <textarea name="observaciones" value={form.observaciones} onChange={handleChange}
                rows={3} className={`${INP} resize-none`} />
            </div>

            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={form.irreparable}
                onChange={(e) => setForm({ ...form, irreparable: e.target.checked })} />
              Irreparable
            </label>

            {error && <p className="text-xs text-red-500">{error}</p>}
          </fieldset>
        </div>

        {/* Requerimientos de Material — propios de esta sub-OT */}
        <div className="max-w-6xl mx-auto px-8 pb-8">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-5 rounded-full bg-orange-500" />
                <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide">
                  Requerimientos de Material ({requerimientos.length})
                </h2>
              </div>
              {!ot.anulado && (
                <button type="button" onClick={() => setCrearRequerimientoOpen(true)}
                  className="text-sm bg-orange-600 text-white px-4 py-2 rounded-lg hover:bg-orange-700 transition font-medium">
                  + Nuevo requerimiento
                </button>
              )}
            </div>

            {requerimientos.length === 0 ? (
              <p className="text-sm text-gray-400">Sin requerimientos de material</p>
            ) : (
              <TablaScroll className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs uppercase tracking-wide text-gray-400 border-b border-gray-100">
                    <tr>
                      <th className="text-left py-2 pr-3">Código</th>
                      <th className="text-left py-2 pr-3">Solicitado por</th>
                      <th className="text-left py-2 pr-3">Ítems</th>
                      <th className="text-right py-2 pr-3">Cantidad</th>
                      <th className="text-left py-2 pr-3">Estado</th>
                      <th className="text-left py-2 pr-3">Fecha</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {requerimientos.map(req => (
                        <tr key={req._id}>
                          <td className="py-2 pr-3 font-mono text-xs text-gray-700">{req.codigo}</td>
                          <td className="py-2 pr-3 text-gray-600">{req.solicitadoPor}</td>
                          <td className="py-2 pr-3 text-gray-600">
                            {req.items.map((it, i) => (
                              <span key={i} className="block text-xs">{descripcionItem(it)}</span>
                            ))}
                          </td>
                          <td className="py-2 pr-3 text-right text-gray-600">
                            {req.items.map((it, i) => (
                              <span key={i} className="block text-xs">{it.cantidad}</span>
                            ))}
                          </td>
                          <td className="py-2 pr-3">
                            {req.items.map((it, i) => {
                              const { clase, label } = estadoItem(it);
                              return (
                                <span key={i} className="block mb-1 last:mb-0">
                                  <Chip className={clase}>{label}</Chip>
                                </span>
                              );
                            })}
                          </td>
                          <td className="py-2 pr-3 text-gray-500">
                            {req.createdAt ? formatearFecha(req.createdAt) : "—"}
                          </td>
                        </tr>
                    ))}
                  </tbody>
                </table>
              </TablaScroll>
            )}
          </div>
        </div>

        {puedeVerServicios && (
          <TablaServiciosExternos ot={ot} servicios={servicios}
            puedeEditar={puedeEditarCampos} onCambio={cargarRelaciones} />
        )}

        {puedeVerServicios && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-5 rounded-full bg-orange-500" />
                <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide">
                  Notificación de Trabajo ({notificacionesTrabajo.length})
                </h2>
              </div>
              {puedeNotificarTrabajo && !ot.anulado && (
                <button type="button" onClick={() => setCrearNotificacionOpen(true)}
                  className="text-sm bg-orange-600 text-white px-4 py-2 rounded-lg hover:bg-orange-700 transition font-medium">
                  + Notificar trabajo
                </button>
              )}
            </div>
            {notificacionesTrabajo.length === 0 ? (
              <p className="text-sm text-gray-400">Sin notificaciones de trabajo</p>
            ) : (
              <div className="space-y-2">
                {notificacionesTrabajo.map((n) => (
                  <button key={n._id} type="button" onClick={() => setDetalleNotificacion(n)}
                    className="w-full flex items-center justify-between border border-gray-100 rounded-xl px-4 py-2.5 hover:bg-gray-50 transition text-left">
                    <span className="font-mono text-xs text-gray-700">{n.codigo}</span>
                    <Chip className={n.estado === "abierta" ? "bg-amber-100 text-amber-700" : "bg-gray-100 text-gray-600"}>
                      {n.estado === "abierta" ? "Abierta" : "Cerrada"}
                    </Chip>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {crearRequerimientoOpen && (
        <ModalRequerimiento
          ot={ot}
          onClose={() => setCrearRequerimientoOpen(false)}
          onCreado={() => {
            setCrearRequerimientoOpen(false);
            cargarRelaciones();
          }}
        />
      )}

      {crearNotificacionOpen && (
        <ModalNotificacionTrabajo
          ot={ot}
          onClose={() => setCrearNotificacionOpen(false)}
          onCreado={() => {
            setCrearNotificacionOpen(false);
            cargarRelaciones();
          }}
        />
      )}

      {detalleNotificacion && (
        <ModalDetalleNotificacionTrabajo
          notificacion={detalleNotificacion}
          onClose={() => setDetalleNotificacion(null)}
          onActualizada={(actualizada) => {
            setDetalleNotificacion(actualizada);
            cargarRelaciones();
          }}
        />
      )}
    </div>
  );
}
