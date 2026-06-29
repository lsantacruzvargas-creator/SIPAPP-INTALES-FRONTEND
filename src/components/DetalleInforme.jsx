import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { fetchAuth, getUsuario } from "../utils/fetchAuth.js";

const BADGE = {
  cotizado:   "bg-blue-100 text-blue-700",
  en_proceso: "bg-yellow-100 text-yellow-700",
  entregado:  "bg-green-100 text-green-700",
  anulado:    "bg-red-100 text-red-700",
};
const ESTADOS_OT = ["cotizado", "en_proceso", "entregado", "anulado"];
const ESTADO_LABEL = { cotizado: "Cotizado", en_proceso: "En proceso", entregado: "Entregado", anulado: "Anulado" };

function iconoArchivo(mime) {
  if (mime?.includes("pdf")) return "📄";
  if (mime?.includes("word") || mime?.includes("doc")) return "📝";
  if (mime?.includes("sheet") || mime?.includes("xls")) return "📊";
  return "📎";
}

function fmtFecha(fecha) {
  return new Date(fecha).toLocaleString("es-PE", {
    timeZone: "America/Lima",
    dateStyle: "medium",
    timeStyle: "short",
  });
}

const FORM_VACIO = { descripcion: "", reportadoPor: "", ejecutadoPor: "" };

export default function DetalleInforme() {
  const { otId } = useParams();
  const navigate = useNavigate();
  const usuario = getUsuario();
  const puedeGestion = ["admin", "ejecutivo", "encargado"].includes(usuario?.rol);

  const [informe, setInforme] = useState(null);
  const [ot, setOt] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [lightbox, setLightbox] = useState(null);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(FORM_VACIO);
  const [guardando, setGuardando] = useState(false);
  const [nuevoEstado, setNuevoEstado] = useState("");
  const [actualizandoEstado, setActualizandoEstado] = useState(false);
  const [subiendo, setSubiendo] = useState(null); // reporteId que está subiendo
  const fileRefs = useRef({});

  const cargar = async () => {
    setCargando(true);
    const [rInf, rOt] = await Promise.all([
      fetchAuth(`/api/informes?ot=${otId}`).then(r => r.json()),
      fetchAuth(`/api/ots/${otId}`).then(r => r.json()),
    ]);
    setInforme(rInf);
    setOt(rOt);
    setNuevoEstado(rOt?.estado || "");
    setCargando(false);
  };

  useEffect(() => { cargar(); }, [otId]);

  // Obtener o crear el informe antes de agregar el primer reporte
  const obtenerOCrearInforme = async () => {
    if (informe) return informe;
    const res = await fetchAuth("/api/informes", {
      method: "POST",
      body: JSON.stringify({ ot: otId }),
    });
    const nuevo = await res.json();
    setInforme(nuevo);
    return nuevo;
  };

  const handleAgregarReporte = async (e) => {
    e.preventDefault();
    setGuardando(true);
    const inf = await obtenerOCrearInforme();
    const res = await fetchAuth(`/api/informes/${inf._id}/reportes`, {
      method: "POST",
      body: JSON.stringify(form),
    });
    if (res.ok) {
      setModal(false);
      setForm(FORM_VACIO);
      await cargar();
    }
    setGuardando(false);
  };

  const handleSubirDocs = async (e, reporteId) => {
    const files = e.target.files;
    if (!files.length) return;
    setSubiendo(reporteId);
    const fd = new FormData();
    for (const f of files) fd.append("documentos", f);
    const res = await fetchAuth(`/api/informes/${informe._id}/reportes/${reporteId}/documentos`, {
      method: "POST",
      body: fd,
    });
    if (res.ok) await cargar();
    setSubiendo(null);
    if (fileRefs.current[reporteId]) fileRefs.current[reporteId].value = "";
  };

  const handleEliminarDoc = async (reporteId, docId) => {
    if (!window.confirm("¿Eliminar este archivo?")) return;
    await fetchAuth(`/api/informes/${informe._id}/reportes/${reporteId}/documentos/${docId}`, {
      method: "DELETE",
    });
    await cargar();
  };

  const handleActualizarEstado = async () => {
    if (!nuevoEstado || nuevoEstado === ot.estado) return;
    setActualizandoEstado(true);
    const inf = await obtenerOCrearInforme();
    await fetchAuth(`/api/informes/${inf._id}/estado-ot`, {
      method: "PATCH",
      body: JSON.stringify({ estado: nuevoEstado }),
    });
    await cargar();
    setActualizandoEstado(false);
  };

  if (cargando) return <div className="flex items-center justify-center h-64 text-gray-400">Cargando...</div>;
  if (!ot) return <div className="p-6 text-red-600">OT no encontrada</div>;

  const reportes = informe ? [...informe.reportes].reverse() : [];

  return (
    <div className="max-w-4xl mx-auto p-4 pb-12">
      {/* Lightbox */}
      {lightbox && (
        <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4" onClick={() => setLightbox(null)}>
          <img src={lightbox} alt="" className="max-w-full max-h-full rounded-lg object-contain" onClick={e => e.stopPropagation()} />
          <button onClick={() => setLightbox(null)} className="absolute top-4 right-4 text-white text-3xl">&times;</button>
        </div>
      )}

      {/* Modal nuevo reporte */}
      {modal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
            <div className="flex justify-between items-center px-6 py-4 border-b border-gray-100">
              <h2 className="font-bold text-lg text-gray-800">Agregar reporte</h2>
              <button onClick={() => setModal(false)} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
            </div>
            <form onSubmit={handleAgregarReporte} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Reporta *</label>
                  <input
                    className="input-field"
                    placeholder="Nombre de quien reporta"
                    value={form.reportadoPor}
                    onChange={e => setForm({ ...form, reportadoPor: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <label className="label">Ejecuta *</label>
                  <input
                    className="input-field"
                    placeholder="Nombre de quien ejecuta"
                    value={form.ejecutadoPor}
                    onChange={e => setForm({ ...form, ejecutadoPor: e.target.value })}
                    required
                  />
                </div>
              </div>
              <div>
                <label className="label">Descripción del trabajo / avance *</label>
                <textarea
                  className="input-field min-h-[100px] resize-y"
                  placeholder="Detalle el trabajo realizado o el avance del día..."
                  value={form.descripcion}
                  onChange={e => setForm({ ...form, descripcion: e.target.value })}
                  required
                />
              </div>
              <div className="flex gap-3 justify-end pt-1">
                <button type="button" onClick={() => setModal(false)} className="btn-secondary">Cancelar</button>
                <button type="submit" disabled={guardando} className="btn-primary">
                  {guardando ? "Guardando..." : "Guardar reporte"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Encabezado */}
      <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(`/ots/${otId}`)} className="text-gray-400 hover:text-gray-600 text-xl">&larr;</button>
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Informe — {ot.codigo}</h1>
            <p className="text-sm text-gray-400">
              {ot.empresa?.razonSocial || ot.clienteNombre || "Sin empresa"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`px-3 py-1 rounded-full text-sm font-semibold ${BADGE[ot.estado]}`}>
            {ESTADO_LABEL[ot.estado]}
          </span>
          <button onClick={() => setModal(true)} className="btn-primary text-sm">
            + Agregar reporte
          </button>
        </div>
      </div>

      {/* Cambio de estado OT */}
      {puedeGestion && (
        <div className="card flex flex-wrap items-center gap-3 mb-6">
          <span className="text-sm font-medium text-gray-600">Estado de la OT:</span>
          <select
            value={nuevoEstado}
            onChange={e => setNuevoEstado(e.target.value)}
            className="input-field w-44"
          >
            {ESTADOS_OT.map(e => (
              <option key={e} value={e}>{ESTADO_LABEL[e]}</option>
            ))}
          </select>
          <button
            onClick={handleActualizarEstado}
            disabled={actualizandoEstado || nuevoEstado === ot.estado}
            className="btn-primary text-sm disabled:opacity-50"
          >
            {actualizandoEstado ? "Actualizando..." : "Actualizar estado"}
          </button>
        </div>
      )}

      {/* Lista de reportes */}
      {reportes.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-4xl mb-3">📋</p>
          <p className="font-medium">Sin reportes aún</p>
          <p className="text-sm mt-1">Agrega el primer reporte de avance</p>
        </div>
      ) : (
        <div className="space-y-5">
          {reportes.map((r, idx) => {
            const fotos    = r.documentos?.filter(d => d.esFoto) || [];
            const archivos = r.documentos?.filter(d => !d.esFoto) || [];
            return (
              <div key={r._id} className="card space-y-4">
                {/* Cabecera del reporte */}
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-xs text-gray-400 font-mono">{fmtFecha(r.fecha)}</p>
                    <div className="flex flex-wrap gap-3 mt-1 text-sm">
                      <span><span className="font-semibold text-gray-600">Reporta:</span> {r.reportadoPor}</span>
                      <span><span className="font-semibold text-gray-600">Ejecuta:</span> {r.ejecutadoPor}</span>
                    </div>
                  </div>
                  <span className="text-xs text-gray-300 font-mono">#{reportes.length - idx}</span>
                </div>

                {/* Descripción */}
                <p className="text-gray-700 text-sm whitespace-pre-line">{r.descripcion}</p>

                {/* Galería de fotos */}
                {fotos.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Fotos</p>
                    <div className="grid grid-cols-3 gap-2">
                      {fotos.map(doc => (
                        <div key={doc._id} className="relative group aspect-square rounded-lg overflow-hidden bg-gray-100 cursor-pointer">
                          <img
                            src={doc.url}
                            alt={doc.nombre}
                            className="w-full h-full object-cover"
                            onClick={() => setLightbox(doc.url)}
                          />
                          <button
                            onClick={() => handleEliminarDoc(r._id, doc._id)}
                            className="absolute top-1 right-1 bg-black/60 text-white rounded-full w-6 h-6 text-xs opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Lista de documentos */}
                {archivos.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Documentos</p>
                    <ul className="space-y-1">
                      {archivos.map(doc => (
                        <li key={doc._id} className="flex items-center gap-2 text-sm bg-gray-50 rounded-lg px-3 py-2">
                          <span className="text-lg">{iconoArchivo(doc.mimeType)}</span>
                          <span className="flex-1 truncate text-gray-700">{doc.nombre}</span>
                          <a href={doc.url} target="_blank" rel="noreferrer" className="text-blue-500 hover:text-blue-700 text-xs px-2">↓</a>
                          <button onClick={() => handleEliminarDoc(r._id, doc._id)} className="text-red-400 hover:text-red-600 text-xs px-1">✕</button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Subir archivos al reporte */}
                <div className="pt-1 border-t border-gray-50">
                  <input
                    type="file"
                    multiple
                    accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
                    className="hidden"
                    ref={el => fileRefs.current[r._id] = el}
                    onChange={e => handleSubirDocs(e, r._id)}
                  />
                  <button
                    onClick={() => fileRefs.current[r._id]?.click()}
                    disabled={subiendo === r._id}
                    className="text-xs text-blue-600 hover:text-blue-800 disabled:text-gray-400"
                  >
                    {subiendo === r._id ? "Subiendo..." : "📎 Adjuntar archivos"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
