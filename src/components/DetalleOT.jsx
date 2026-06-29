import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { fetchAuth, getUsuario } from "../utils/fetchAuth.js";

const BADGE = {
  cotizado: "bg-blue-100 text-blue-700",
  en_proceso: "bg-yellow-100 text-yellow-700",
  entregado: "bg-green-100 text-green-700",
  anulado: "bg-red-100 text-red-700",
};
const ESTADO_LABEL = { cotizado: "Cotizado", en_proceso: "En proceso", entregado: "Entregado", anulado: "Anulado" };
const TIPO_LABEL = { material: "Material", tercerizado: "Tercerizado", tratamiento_termico: "Trat. térmico" };

function iconoArchivo(mime) {
  if (mime?.includes("pdf")) return "📄";
  if (mime?.includes("word") || mime?.includes("doc")) return "📝";
  if (mime?.includes("sheet") || mime?.includes("xls")) return "📊";
  return "📎";
}

export default function DetalleOT() {
  const { id } = useParams();
  const navigate = useNavigate();
  const usuario = getUsuario();
  const esTecnico = usuario?.rol === "tecnico";
  const puedeEditar = ["admin", "ejecutivo"].includes(usuario?.rol);

  const [ot, setOt] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [lightbox, setLightbox] = useState(null);
  const [subiendo, setSubiendo] = useState(false);
  const [compraForm, setCompraForm] = useState({ descripcion: "", tipo: "material", monto: "", proveedor: "" });
  const [agregandoCompra, setAgregandoCompra] = useState(false);
  const [guardandoCompra, setGuardandoCompra] = useState(false);
  const fileRef = useRef();

  const cargar = async () => {
    const res = await fetchAuth(`/api/ots/${id}`);
    const data = await res.json();
    setOt(data);
    setCargando(false);
  };

  useEffect(() => { cargar(); }, [id]);

  const handleSubirDocs = async (e) => {
    const files = e.target.files;
    if (!files.length) return;
    setSubiendo(true);
    const fd = new FormData();
    for (const f of files) fd.append("documentos", f);
    const res = await fetchAuth(`/api/ots/${id}/documentos`, { method: "POST", body: fd });
    if (res.ok) await cargar();
    setSubiendo(false);
    fileRef.current.value = "";
  };

  const handleEliminarDoc = async (docId) => {
    if (!window.confirm("¿Eliminar este documento?")) return;
    await fetchAuth(`/api/ots/${id}/documentos/${docId}`, { method: "DELETE" });
    await cargar();
  };

  const handleGuardarCompra = async () => {
    if (!compraForm.descripcion || !compraForm.monto) return;
    setGuardandoCompra(true);
    const nuevasCompras = [...(ot.compras || []), compraForm];
    const res = await fetchAuth(`/api/ots/${id}`, {
      method: "PUT",
      body: JSON.stringify({ ...ot, empresa: ot.empresa?._id || ot.empresa, compras: nuevasCompras }),
    });
    if (res.ok) { await cargar(); setAgregandoCompra(false); setCompraForm({ descripcion: "", tipo: "material", monto: "", proveedor: "" }); }
    setGuardandoCompra(false);
  };

  const handleEliminarCompra = async (idx) => {
    const nuevasCompras = ot.compras.filter((_, i) => i !== idx);
    await fetchAuth(`/api/ots/${id}`, {
      method: "PUT",
      body: JSON.stringify({ ...ot, empresa: ot.empresa?._id || ot.empresa, compras: nuevasCompras }),
    });
    await cargar();
  };

  const exportarExcel = async () => {
    const res = await fetchAuth(`/api/reportes/excel`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `OTs_INTALES_${new Date().toISOString().slice(0, 10)}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (cargando) return <div className="flex items-center justify-center h-64 text-gray-400">Cargando...</div>;
  if (!ot) return <div className="p-6 text-red-600">OT no encontrada</div>;

  const fotos = ot.documentos?.filter(d => d.esFoto) || [];
  const archivos = ot.documentos?.filter(d => !d.esFoto) || [];
  const anulada = ot.estado === "anulado";

  return (
    <div className="max-w-4xl mx-auto p-4 pb-12">
      {lightbox && (
        <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4" onClick={() => setLightbox(null)}>
          <img src={lightbox} alt="" className="max-w-full max-h-full rounded-lg object-contain" onClick={e => e.stopPropagation()} />
          <button onClick={() => setLightbox(null)} className="absolute top-4 right-4 text-white text-3xl">&times;</button>
        </div>
      )}

      <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="text-gray-400 hover:text-gray-600 text-xl">&larr;</button>
          <div>
            <h1 className="text-2xl font-bold text-gray-800">{ot.codigo}</h1>
            <p className="text-sm text-gray-400">
              Creada {new Date(ot.createdAt).toLocaleDateString("es-PE")} ·{" "}
              {ot.empresa?.razonSocial || ot.clienteNombre || "Sin empresa"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`px-3 py-1 rounded-full text-sm font-semibold ${BADGE[ot.estado]}`}>
            {ESTADO_LABEL[ot.estado]}
          </span>
          {!esTecnico && (
            <button onClick={exportarExcel} className="btn-secondary text-xs">📊 Exportar Excel</button>
          )}
          <button onClick={() => navigate(`/informes/${ot._id}`)} className="btn-secondary text-xs">
            📋 Informe
          </button>
          {puedeEditar && !anulada && (
            <button onClick={() => navigate("/ots/editar", { state: { ot } })} className="btn-primary text-xs">Editar</button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="space-y-5">
          <div className="card space-y-3">
            <h3 className="font-semibold text-gray-700">Información general</h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-gray-400 text-xs uppercase font-semibold">Tipo</p>
                <p className="font-medium capitalize">{ot.tipo?.replace("_", " ")}</p>
              </div>
              <div>
                <p className="text-gray-400 text-xs uppercase font-semibold">Solicitado por</p>
                <p className="font-medium">{ot.solicitadoPor || "—"}</p>
              </div>
              <div>
                <p className="text-gray-400 text-xs uppercase font-semibold">N° Cotización</p>
                <p className="font-medium">{ot.numeroCotizacion || "—"}</p>
              </div>
              <div>
                <p className="text-gray-400 text-xs uppercase font-semibold">N° OC</p>
                <p className="font-medium">{ot.numeroOC || "—"}</p>
              </div>
              <div>
                <p className="text-gray-400 text-xs uppercase font-semibold">Fecha inicio</p>
                <p className="font-medium">{ot.fechaInicio ? new Date(ot.fechaInicio).toLocaleDateString("es-PE") : "—"}</p>
              </div>
              <div>
                <p className="text-gray-400 text-xs uppercase font-semibold">Fecha entrega</p>
                <p className="font-medium">{ot.fechaEntrega ? new Date(ot.fechaEntrega).toLocaleDateString("es-PE") : "—"}</p>
              </div>
              <div>
                <p className="text-gray-400 text-xs uppercase font-semibold">Garantía</p>
                <p className="font-medium">{ot.garantia || "No aplica"}</p>
              </div>
              <div>
                <p className="text-gray-400 text-xs uppercase font-semibold">OT relacionada</p>
                <p className="font-medium">{ot.otRelacionada || "—"}</p>
              </div>
              {ot.tipo === "emergencia" && (
                <div className="col-span-2">
                  <p className="text-gray-400 text-xs uppercase font-semibold">Plazo urgente</p>
                  <p className="font-medium text-orange-600">{ot.plazoEntrega}</p>
                </div>
              )}
              {ot.tipo === "trato_directo" && (
                <div className="col-span-2">
                  <p className="text-gray-400 text-xs uppercase font-semibold">Forma de pago</p>
                  <p className="font-medium text-green-700">{ot.formaPago}</p>
                </div>
              )}
            </div>
          </div>

          {ot.items?.length > 0 && (
            <div className="card">
              <h3 className="font-semibold text-gray-700 mb-3">Ítems de la OT</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="text-left py-1 text-gray-400 font-medium">Descripción</th>
                      <th className="text-center py-1 text-gray-400 font-medium w-12">Cant.</th>
                      <th className="text-left py-1 text-gray-400 font-medium">Cotiz.</th>
                      {!esTecnico && <th className="text-right py-1 text-gray-400 font-medium">Monto</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {ot.items.map((item, i) => (
                      <tr key={i} className="border-b border-gray-50">
                        <td className="py-2">{item.descripcion}</td>
                        <td className="text-center">{item.cantidad}</td>
                        <td className="text-blue-600 text-xs">{item.cotizacionRef || "—"}</td>
                        {!esTecnico && <td className="text-right font-medium">S/ {(item.monto || 0).toLocaleString("es-PE", { minimumFractionDigits: 2 })}</td>}
                      </tr>
                    ))}
                  </tbody>
                  {!esTecnico && (
                    <tfoot>
                      <tr className="border-t border-gray-200">
                        <td colSpan={3} className="py-2 font-semibold text-gray-600">Total OT</td>
                        <td className="text-right font-bold text-gray-800">
                          S/ {(ot.totalCotizado || 0).toLocaleString("es-PE", { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
          )}
        </div>

        <div className="space-y-5">
          {!esTecnico && (
            <div className="card">
              <div className="flex justify-between items-center mb-3">
                <h3 className="font-semibold text-gray-700">Compras / Costos</h3>
                {puedeEditar && !anulada && (
                  <button onClick={() => setAgregandoCompra(true)} className="btn-primary text-xs">+ Agregar compra</button>
                )}
              </div>

              {ot.compras?.length === 0 && !agregandoCompra && (
                <p className="text-gray-400 text-sm">Sin compras registradas</p>
              )}

              <div className="space-y-2">
                {ot.compras?.map((c, i) => (
                  <div key={i} className="flex justify-between items-start">
                    <div>
                      <p className="text-sm font-medium">{c.descripcion}</p>
                      <p className="text-xs text-gray-400">{TIPO_LABEL[c.tipo]}{c.proveedor ? ` · ${c.proveedor}` : ""}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm">S/ {(c.monto || 0).toLocaleString("es-PE", { minimumFractionDigits: 2 })}</span>
                      {puedeEditar && !anulada && (
                        <button onClick={() => handleEliminarCompra(i)} className="text-red-300 hover:text-red-500 text-xs">✕</button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {agregandoCompra && (
                <div className="border border-gray-200 rounded-lg p-3 mt-3 space-y-2">
                  <input value={compraForm.descripcion} onChange={e => setCompraForm({ ...compraForm, descripcion: e.target.value })} className="input-field" placeholder="Descripción (ej. Plancha acero 1/4&quot;)" />
                  <div className="flex gap-2">
                    <select value={compraForm.tipo} onChange={e => setCompraForm({ ...compraForm, tipo: e.target.value })} className="input-field">
                      <option value="material">Material</option>
                      <option value="tercerizado">Tercerizado</option>
                      <option value="tratamiento_termico">Trat. térmico</option>
                    </select>
                    <input type="number" value={compraForm.monto} onChange={e => setCompraForm({ ...compraForm, monto: Number(e.target.value) })} className="input-field w-28" placeholder="S/ 0" min="0" />
                  </div>
                  <input value={compraForm.proveedor} onChange={e => setCompraForm({ ...compraForm, proveedor: e.target.value })} className="input-field" placeholder="Proveedor (opcional)" />
                  <div className="flex gap-2">
                    <button onClick={handleGuardarCompra} disabled={guardandoCompra} className="btn-primary text-xs">{guardandoCompra ? "..." : "Guardar"}</button>
                    <button onClick={() => setAgregandoCompra(false)} className="btn-secondary text-xs">Cancelar</button>
                  </div>
                </div>
              )}

              <div className="border-t border-gray-100 mt-4 pt-3 space-y-1 text-sm">
                <div className="flex justify-between text-gray-500">
                  <span>Total cotizado</span>
                  <span>S/ {(ot.totalCotizado || 0).toLocaleString("es-PE", { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between text-gray-500">
                  <span>Costos</span>
                  <span>S/ {(ot.totalCostos || 0).toLocaleString("es-PE", { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between font-bold text-base">
                  <span>Margen</span>
                  <span className={(ot.margen || 0) >= 0 ? "text-green-600" : "text-red-600"}>
                    S/ {(ot.margen || 0).toLocaleString("es-PE", { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            </div>
          )}

          <div className="card">
            <div className="flex justify-between items-center mb-3">
              <div>
                <h3 className="font-semibold text-gray-700">Documentos</h3>
                {ot.documentos?.length > 0 && (
                  <p className="text-xs text-gray-400 mt-0.5">
                    {fotos.length > 0 && `${fotos.length} imagen${fotos.length > 1 ? "es" : ""}`}
                    {fotos.length > 0 && archivos.length > 0 && " · "}
                    {archivos.length > 0 && `${archivos.length} archivo${archivos.length > 1 ? "s" : ""}`}
                  </p>
                )}
              </div>
              {puedeEditar && !anulada && (
                <label className="btn-secondary text-xs cursor-pointer">
                  {subiendo ? "Subiendo..." : "📎 Subir archivos"}
                  <input type="file" multiple ref={fileRef} onChange={handleSubirDocs} className="hidden" accept="image/*,.pdf,.doc,.docx,.xls,.xlsx" />
                </label>
              )}
            </div>

            {ot.documentos?.length === 0 && (
              <div className="border-2 border-dashed border-gray-200 rounded-lg p-6 text-center text-gray-400 text-sm">
                <p className="text-2xl mb-1">📁</p>
                <p>OC, fotos, guías, facturas...</p>
              </div>
            )}

            {fotos.length > 0 && (
              <div className="grid grid-cols-3 gap-2 mb-3">
                {fotos.map((foto) => (
                  <div key={foto._id} className="relative group">
                    <img
                      src={foto.url}
                      alt={foto.nombre}
                      className="w-full h-20 object-cover rounded-lg cursor-pointer hover:opacity-90 transition-opacity"
                      onClick={() => setLightbox(foto.url)}
                    />
                    {puedeEditar && !anulada && (
                      <button
                        onClick={() => handleEliminarDoc(foto._id)}
                        className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-5 h-5 text-xs hidden group-hover:flex items-center justify-center"
                      >✕</button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {archivos.length > 0 && (
              <div className="space-y-2">
                {archivos.map((arch) => (
                  <div key={arch._id} className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-lg">{iconoArchivo(arch.mimeType)}</span>
                      <span className="text-sm text-gray-700 truncate">{arch.nombre}</span>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <a href={arch.url} target="_blank" rel="noreferrer" className="text-blue-500 hover:text-blue-700 text-xs">↓</a>
                      {puedeEditar && !anulada && (
                        <button onClick={() => handleEliminarDoc(arch._id)} className="text-red-400 hover:text-red-600 text-xs ml-1">✕</button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
