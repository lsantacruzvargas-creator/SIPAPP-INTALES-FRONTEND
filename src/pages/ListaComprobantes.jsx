import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { fetchAuth, getUsuario } from "../utils/fetchAuth";
import { formatearFecha } from "../utils/fecha";
import TablaScroll from "../components/TablaScroll";
import {
  TIPO_DOC_CPE,
  ESTADO_COMPROBANTE,
  estadoComprobanteClase,
} from "../utils/catalogosSunat";
import { generarComprobantePdf } from "../utils/comprobantePdf";

const FILTROS_VACIO = { tipoDoc: "", estado: "", desde: "", hasta: "", receptorDoc: "" };
const SELECT = "input-field w-auto";

const TIPO_DOC_CLASE = {
  "01": "bg-blue-100 text-blue-700",
  "03": "bg-purple-100 text-purple-700",
  "07": "bg-amber-100 text-amber-700",
  "08": "bg-rose-100 text-rose-700",
};

const tipoDocTexto = (v) => TIPO_DOC_CPE.find((t) => t.valor === v)?.label.split(" — ")[1] ?? v;

const leerBase64 = (archivo) => !archivo ? Promise.resolve(undefined) : new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(String(r.result).split(",")[1]);
  r.onerror = reject;
  r.readAsDataURL(archivo);
});

// La consulta del hub puede traer solo el CDR (sin XML firmado): cuando la emisión se cortó y se resolvió con
// "Reintentar" en el panel de SmartPSE, el XML firmado se baja de ahí. Port de SIPAPP-HUAQUIAN.
function ModalAdjuntarSunat({ comprobante, onClose, onAdjuntado }) {
  const [archivos, setArchivos] = useState({ xml: null, cdr: null });
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const numero = `${comprobante.serie}-${String(comprobante.correlativo).padStart(8, "0")}`;

  const handleArchivo = (e) => setArchivos({ ...archivos, [e.target.name]: e.target.files[0] || null });

  const guardar = async () => {
    if (!archivos.xml && !archivos.cdr) return setError("Selecciona el XML firmado, el CDR o ambos.");
    setGuardando(true);
    setError("");
    try {
      const [xmlBase64, cdrBase64] = await Promise.all([leerBase64(archivos.xml), leerBase64(archivos.cdr)]);
      const res  = await fetchAuth(`/cpe/${comprobante._id}/adjuntar-sunat`, {
        method: "POST",
        body: JSON.stringify({ xmlBase64, cdrBase64 }),
      });
      const data = await res.json();
      if (!data.ok) { setError(data.error || data.mensaje || "No se pudieron adjuntar los archivos."); return; }
      onAdjuntado(data);
    } catch {
      setError("Error de conexión");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
        <h3 className="font-semibold text-gray-800 mb-1">Adjuntar XML/CDR de SmartPSE</h3>
        <p className="text-sm text-gray-500 mb-4">
          Descarga del panel de SmartPSE el XML firmado y el CDR de <span className="font-mono">{numero}</span> y súbelos aquí
          (.xml o .zip). El estado del comprobante se toma del CDR.
        </p>
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-2 mb-4">{error}</div>
        )}
        <label className="block text-xs font-medium text-gray-500 mb-1">XML firmado</label>
        <input type="file" name="xml" accept=".xml,.zip" onChange={handleArchivo} className="w-full text-sm mb-4" />
        <label className="block text-xs font-medium text-gray-500 mb-1">CDR (constancia de SUNAT)</label>
        <input type="file" name="cdr" accept=".xml,.zip" onChange={handleArchivo} className="w-full text-sm mb-5" />
        <div className="flex justify-end gap-3">
          <button onClick={onClose} disabled={guardando}
            className="border border-gray-300 text-gray-800 px-4 py-2 rounded-lg text-sm hover:bg-gray-50 transition">
            Cancelar
          </button>
          <button onClick={guardar} disabled={guardando}
            className="bg-gray-900 text-white px-4 py-2 rounded-lg text-sm hover:bg-gray-700 transition disabled:opacity-50">
            {guardando ? "Adjuntando…" : "Adjuntar"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ListaComprobantes() {
  const navigate = useNavigate();
  const [comprobantes, setComprobantes] = useState([]);
  const [filtros, setFiltros] = useState(FILTROS_VACIO);
  const [filtrosAplicados, setFiltrosAplicados] = useState(FILTROS_VACIO);
  const [pagina, setPagina] = useState(1);
  const [paginacion, setPaginacion] = useState({ total: 0, pages: 1 });
  const [seleccionado, setSeleccionado] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [errorDescarga, setErrorDescarga] = useState("");
  const [consultando, setConsultando] = useState(false);
  const [aviso, setAviso] = useState("");
  // Anulación hecha fuera del ERP (NC en SOL/SmartPSE, comunicación de baja): se registra a mano.
  const [anulando, setAnulando] = useState(null);
  const [guardandoAnulacion, setGuardandoAnulacion] = useState(false);
  const [errorAnulacion, setErrorAnulacion] = useState("");
  const [adjuntando, setAdjuntando] = useState(false);
  const puedeAdjuntar = ["admin", "facturacion", "jefatura"].includes(getUsuario()?.rol);

  const cargar = async () => {
    setCargando(true);
    const params = new URLSearchParams();
    Object.entries(filtrosAplicados).forEach(([k, v]) => v && params.set(k, v));
    params.set("page", pagina);
    params.set("limit", 20);
    const res  = await fetchAuth(`/cpe?${params.toString()}`);
    const data = await res.json();
    if (data.ok) { setComprobantes(data.data); setPaginacion(data.pagination); }
    setCargando(false);
  };

  useEffect(() => { cargar(); }, [filtrosAplicados, pagina]);

  const handleFiltro = (e) => setFiltros({ ...filtros, [e.target.name]: e.target.value });

  const buscar = () => {
    setFiltrosAplicados(filtros);
    setPagina(1);
  };

  const limpiar = () => {
    setFiltros(FILTROS_VACIO);
    setFiltrosAplicados(FILTROS_VACIO);
    setPagina(1);
  };

  const descargar = async (tipo) => {
    setErrorDescarga("");
    const res = await fetchAuth(`/cpe/${seleccionado._id}/${tipo}`);
    if (!res.ok) { setErrorDescarga(`${tipo.toUpperCase()} no disponible para este comprobante.`); return; }
    const blob = await res.blob();
    const url  = URL.createObjectURL(blob);
    // El nombre y la extensión real (.xml o .zip) los decide el backend según el contenido —
    // SmartPSE no siempre envuelve el XML firmado en un ZIP.
    const cd     = res.headers.get("Content-Disposition") || "";
    const nombre = cd.match(/filename="([^"]+)"/)?.[1] || seleccionado.nombreArchivo;
    const a = document.createElement("a");
    a.href = url;
    a.download = nombre;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  // Reconsulta el resultado en el hub SUNAT — necesario porque un "Reintentar" hecho
  // directamente en el panel del hub (SmartPSE) no le avisa a este ERP; sin este botón
  // el estado guardado acá se queda pegado en RECHAZADO/EN_PROCESO/ERROR para siempre.
  // Port del fix aplicado en SIPAPP-HUAQUIAN, mismo patrón que forzarActualizacion() en
  // ModalDetalleGuia.jsx.
  // Trae de nuevo el comprobante tras consultar/adjuntar: tieneXml/tieneCdr pueden haber cambiado.
  const refrescarSeleccionado = async (id) => {
    const data = await fetchAuth(`/cpe/${id}`).then((r) => r.json()).catch(() => null);
    if (data?.ok) setSeleccionado((prev) => (prev?._id === id ? { ...prev, ...data.data } : prev));
  };

  const consultarEstado = async () => {
    setConsultando(true);
    setErrorDescarga("");
    try {
      const res  = await fetchAuth(`/cpe/${seleccionado._id}/consultar`);
      const data = await res.json();
      if (!data.ok) { setErrorDescarga(data.error || "No se pudo consultar el estado en SUNAT."); return; }
      setSeleccionado((prev) => ({ ...prev, estado: data.estado, sunat: { ...prev.sunat, mensaje: data.mensaje } }));
      setAviso(data.aviso || "");
      await Promise.all([cargar(), refrescarSeleccionado(seleccionado._id)]);
    } catch {
      setErrorDescarga("Error de conexión al consultar SUNAT.");
    } finally {
      setConsultando(false);
    }
  };

  const registrarAnulacion = async () => {
    if (!anulando.documento.trim() || !anulando.motivo.trim()) {
      setErrorAnulacion("Indica el documento de anulación y el motivo.");
      return;
    }
    setGuardandoAnulacion(true);
    setErrorAnulacion("");
    try {
      const res  = await fetchAuth(`/cpe/${seleccionado._id}/anulacion-externa`, {
        method: "PATCH",
        body: JSON.stringify({ documento: anulando.documento.trim(), motivo: anulando.motivo.trim() }),
      });
      const data = await res.json();
      if (!data.ok) { setErrorAnulacion(data.error || "No se pudo registrar la anulación."); return; }
      setSeleccionado((prev) => ({ ...prev, estado: data.estado, anulacionExterna: data.anulacionExterna }));
      setAviso(data.aviso || "");
      setAnulando(null);
      await cargar();
    } catch {
      setErrorAnulacion("Error de conexión.");
    } finally {
      setGuardandoAnulacion(false);
    }
  };

  const cerrarDetalle = () => { setSeleccionado(null); setErrorDescarga(""); setAviso(""); };

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-5">
        <div>
          <h2 className="text-xl font-semibold text-gray-800">Comprobantes SUNAT</h2>
          <span className="text-sm text-gray-400">{paginacion.total} comprobante{paginacion.total !== 1 ? "s" : ""}</span>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/facturacion-electronica/guias")}
            className="text-sm text-blue-600 hover:text-blue-800 underline">
            Ver Guías de Remisión
          </button>
          <button onClick={() => navigate("/facturacion-electronica/emitir")} className="btn-primary">
            + Emitir comprobante
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 mb-5 flex flex-wrap gap-3 items-center">
        <select name="tipoDoc" value={filtros.tipoDoc} onChange={handleFiltro} className={SELECT}>
          <option value="">Todo tipo</option>
          {TIPO_DOC_CPE.map((t) => (
            <option key={t.valor} value={t.valor}>{t.label}</option>
          ))}
        </select>
        <select name="estado" value={filtros.estado} onChange={handleFiltro} className={SELECT}>
          <option value="">Todo estado</option>
          {ESTADO_COMPROBANTE.map((e) => (
            <option key={e.valor} value={e.valor}>{e.label}</option>
          ))}
        </select>
        <input type="date" name="desde" value={filtros.desde} onChange={handleFiltro} className={SELECT} />
        <input type="date" name="hasta" value={filtros.hasta} onChange={handleFiltro} className={SELECT} />
        <input
          name="receptorDoc"
          value={filtros.receptorDoc}
          onChange={handleFiltro}
          placeholder="Doc. del receptor…"
          className={`${SELECT} flex-1 min-w-40`}
        />
        <button onClick={buscar} className="btn-primary">Buscar</button>
        <button onClick={limpiar} className="text-sm text-gray-400 hover:text-gray-800 transition">Limpiar</button>
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <TablaScroll className="overflow-x-auto">
        <table className="erp-table w-full text-sm min-w-[700px]">
          <thead className="bg-gray-50 text-xs uppercase tracking-wide border-b-2 border-gray-100">
            <tr>
              <th className="px-4 py-3 text-left">Serie-Correlativo</th>
              <th className="px-4 py-3 text-center">Tipo</th>
              <th className="px-4 py-3 text-left">Receptor</th>
              <th className="px-4 py-3 text-right">Total</th>
              <th className="px-4 py-3 text-center">Emisión</th>
              <th className="px-4 py-3 text-center">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {cargando ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">Cargando…</td></tr>
            ) : comprobantes.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">Sin comprobantes para los filtros aplicados</td></tr>
            ) : (
              comprobantes.map((c) => (
                <tr key={c._id} className="hover:bg-gray-50 cursor-pointer transition-colors" onClick={() => setSeleccionado(c)}>
                  <td className="px-4 py-3 font-mono text-xs">{c.serie}-{String(c.correlativo).padStart(4, "0")}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${TIPO_DOC_CLASE[c.tipoDoc] ?? "bg-gray-100 text-gray-700"}`}>
                      {tipoDocTexto(c.tipoDoc)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-800">{c.receptor?.nombre || "—"}</td>
                  <td className="px-4 py-3 text-right font-medium">{c.totales?.totalPagar?.toFixed(2) ?? "—"}</td>
                  <td className="px-4 py-3 text-center text-gray-500">{formatearFecha(c.fechaEmision)}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${estadoComprobanteClase(c.estado)}`}>
                      {c.estado}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        </TablaScroll>
        {paginacion.pages > 1 && (
          <div className="flex justify-between items-center px-4 py-3 border-t border-gray-100 text-sm">
            <button
              onClick={() => setPagina((p) => Math.max(1, p - 1))}
              disabled={pagina <= 1}
              className="text-gray-500 hover:text-gray-800 disabled:opacity-30 disabled:cursor-not-allowed transition"
            >
              ← Anterior
            </button>
            <span className="text-gray-400">Página {pagina} de {paginacion.pages}</span>
            <button
              onClick={() => setPagina((p) => Math.min(paginacion.pages, p + 1))}
              disabled={pagina >= paginacion.pages}
              className="text-gray-500 hover:text-gray-800 disabled:opacity-30 disabled:cursor-not-allowed transition"
            >
              Siguiente →
            </button>
          </div>
        )}
      </div>

      {seleccionado && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="font-semibold text-gray-800">
                  {tipoDocTexto(seleccionado.tipoDoc)} {seleccionado.serie}-{String(seleccionado.correlativo).padStart(4, "0")}
                </h3>
                <span className="font-mono text-xs text-gray-400">{seleccionado.nombreArchivo}</span>
              </div>
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${estadoComprobanteClase(seleccionado.estado)}`}>
                {seleccionado.estado}
              </span>
            </div>

            {(seleccionado.estado === "RECHAZADO" || seleccionado.estado === "ERROR") && seleccionado.sunat?.mensaje && (
              /^\[HTTP\]/i.test(seleccionado.sunat.mensaje) ? (
                <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-lg px-4 py-3 mb-4">
                  <p className="font-medium">{seleccionado.sunat.mensaje} — SUNAT no respondió; no es un rechazo.</p>
                  <p className="mt-1">
                    No emitas otro comprobante por lo mismo. Usa “Consultar estado en SUNAT”; si no se resuelve, revisa
                    este número en el panel de SmartPSE: si aparece con “Reintentar”, reinténtalo ahí y luego usa
                    “Adjuntar XML/CDR” con los archivos que descargues.
                  </p>
                </div>
              ) : (
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 mb-4 whitespace-pre-wrap">
                  {seleccionado.sunat.mensaje}
                </div>
              )
            )}
            {seleccionado.estado === "ANULADO" && seleccionado.anulacionExterna?.documento && (
              <div className="bg-gray-50 border border-gray-200 text-gray-700 text-sm rounded-lg px-4 py-3 mb-4">
                Anulado en SUNAT con <strong>{seleccionado.anulacionExterna.documento}</strong>: {seleccionado.anulacionExterna.motivo}
                <span className="block text-xs text-gray-400 mt-1">
                  Registrado por {seleccionado.anulacionExterna.usuario || "—"} el {formatearFecha(seleccionado.anulacionExterna.fecha)}
                </span>
              </div>
            )}
            {aviso && (
              <div className="bg-amber-50 border border-amber-200 text-amber-700 text-sm rounded-lg px-4 py-2 mb-4">
                {aviso}
              </div>
            )}
            {errorDescarga && (
              <div className="bg-amber-50 border border-amber-200 text-amber-700 text-sm rounded-lg px-4 py-2 mb-4">
                {errorDescarga}
              </div>
            )}

            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <p className="text-xs font-medium text-gray-400 mb-1">Emisor</p>
                <p className="text-sm text-gray-800">{seleccionado.emisor?.nombre}</p>
                <p className="text-xs text-gray-400">{seleccionado.emisor?.numDoc}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-400 mb-1">Receptor</p>
                <p className="text-sm text-gray-800">{seleccionado.receptor?.nombre}</p>
                <p className="text-xs text-gray-400">{seleccionado.receptor?.numDoc}</p>
              </div>
            </div>

            {(seleccionado.tipoDoc === "07" || seleccionado.tipoDoc === "08") && seleccionado.referencia && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 mb-4">
                <p className="text-xs font-medium text-amber-700 mb-1">Documento afectado</p>
                <p className="text-sm text-gray-800">{seleccionado.referencia.docId}</p>
                <p className="text-xs text-gray-400 mt-1">
                  Motivo {seleccionado.referencia.motivoCodigo}: {seleccionado.referencia.motivoDesc}
                </p>
              </div>
            )}

            <table className="erp-table w-full text-sm mb-4">
              <thead className="bg-gray-50 text-xs uppercase tracking-wide border-b-2 border-gray-100">
                <tr>
                  <th className="px-3 py-2 text-left">Descripción</th>
                  <th className="px-3 py-2 text-right">Cant.</th>
                  <th className="px-3 py-2 text-right">P. Unit.</th>
                  <th className="px-3 py-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {seleccionado.items?.map((it, idx) => (
                  <tr key={idx}>
                    <td className="px-3 py-2">{it.descripcion}</td>
                    <td className="px-3 py-2 text-right">{it.cantidad} {it.unidad}</td>
                    <td className="px-3 py-2 text-right">{Number(it.precioUnitario).toFixed(2)}</td>
                    <td className="px-3 py-2 text-right font-medium">{Number(it.total).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-gray-100 bg-gray-50">
                <tr>
                  <td colSpan={3} className="px-3 py-2 text-right text-xs text-gray-500">Base imponible</td>
                  <td className="px-3 py-2 text-right font-medium">{seleccionado.totales?.baseImponible?.toFixed(2)}</td>
                </tr>
                <tr>
                  <td colSpan={3} className="px-3 py-2 text-right text-xs text-gray-500">IGV</td>
                  <td className="px-3 py-2 text-right font-medium">{seleccionado.totales?.totalIGV?.toFixed(2)}</td>
                </tr>
                <tr>
                  <td colSpan={3} className="px-3 py-2 text-right text-sm font-semibold text-gray-800">Total</td>
                  <td className="px-3 py-2 text-right font-bold text-gray-800">{seleccionado.totales?.totalPagar?.toFixed(2)}</td>
                </tr>
              </tfoot>
            </table>

            <div className="flex justify-end gap-3 pt-2">
              {(seleccionado.estado === "RECHAZADO" || seleccionado.estado === "ERROR" || seleccionado.estado === "EN_PROCESO") && (
                <button
                  onClick={consultarEstado}
                  disabled={consultando}
                  className="border border-blue-300 text-blue-700 px-4 py-2 rounded-lg text-sm hover:bg-blue-50 transition disabled:opacity-50"
                >
                  {consultando ? "Consultando…" : "Consultar estado en SUNAT"}
                </button>
              )}
              {seleccionado.estado === "ACEPTADO" && (seleccionado.tipoDoc === "01" || seleccionado.tipoDoc === "03") && (
                <button
                  onClick={() => navigate("/facturacion-electronica/emitir", { state: { comprobante: seleccionado } })}
                  className="border border-amber-300 text-amber-700 px-4 py-2 rounded-lg text-sm hover:bg-amber-50 transition"
                >
                  Emitir Nota de Crédito/Débito
                </button>
              )}
              {seleccionado.estado === "ACEPTADO" && (seleccionado.tipoDoc === "01" || seleccionado.tipoDoc === "03") && (
                <button
                  onClick={() => { setAnulando({ documento: "", motivo: "" }); setErrorAnulacion(""); }}
                  className="border border-red-300 text-red-700 px-4 py-2 rounded-lg text-sm hover:bg-red-50 transition"
                >
                  Registrar anulación en SUNAT
                </button>
              )}
              {puedeAdjuntar && (seleccionado.tipoDoc === "01" || seleccionado.tipoDoc === "03") && seleccionado.estado !== "ANULADO" && (
                <button onClick={() => setAdjuntando(true)} className="border border-gray-300 text-gray-800 px-4 py-2 rounded-lg text-sm hover:bg-gray-50 transition">
                  Adjuntar XML/CDR
                </button>
              )}
              <button onClick={() => descargar("cdr")} disabled={!seleccionado.tieneCdr}
                title={seleccionado.tieneCdr ? undefined : "Este comprobante no tiene CDR guardado"}
                className="border border-gray-300 text-gray-800 px-4 py-2 rounded-lg text-sm hover:bg-gray-50 transition disabled:opacity-40 disabled:cursor-not-allowed">
                Descargar CDR
              </button>
              <button onClick={() => descargar("xml")} disabled={!seleccionado.tieneXml}
                title={seleccionado.tieneXml ? undefined : "Este comprobante no tiene XML firmado guardado"}
                className="border border-gray-300 text-gray-800 px-4 py-2 rounded-lg text-sm hover:bg-gray-50 transition disabled:opacity-40 disabled:cursor-not-allowed">
                Descargar XML
              </button>
              <button onClick={() => generarComprobantePdf(seleccionado)} disabled={!seleccionado.tieneXml}
                title={seleccionado.tieneXml ? undefined : "Sin XML firmado no hay PDF: súbelo con “Adjuntar XML/CDR” (descárgalo del panel de SmartPSE)"}
                className="border border-gray-300 text-gray-800 px-4 py-2 rounded-lg text-sm hover:bg-gray-50 transition disabled:opacity-40 disabled:cursor-not-allowed">
                Descargar PDF
              </button>
              <button onClick={cerrarDetalle} className="bg-gray-900 text-white px-4 py-2 rounded-lg text-sm hover:bg-gray-700 transition">
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {seleccionado && adjuntando && (
        <ModalAdjuntarSunat
          comprobante={seleccionado}
          onClose={() => setAdjuntando(false)}
          onAdjuntado={(data) => {
            setSeleccionado((prev) => ({ ...prev, estado: data.estado, sunat: data.sunat, facturaInterna: data.facturaInterna }));
            setErrorDescarga("");
            setAdjuntando(false);
            cargar();
            refrescarSeleccionado(seleccionado._id);
          }}
        />
      )}

      {anulando && seleccionado && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h3 className="font-semibold text-gray-800 mb-2">Registrar anulación hecha en SUNAT</h3>
            <p className="text-sm text-gray-500 mb-4">
              Úsalo solo si {seleccionado.serie}-{seleccionado.correlativo} ya se anuló fuera del ERP (Nota de Crédito emitida en
              SOL o en SmartPSE, comunicación de baja). Pasará a ANULADO junto con su factura interna, salvo que esta tenga pagos.
            </p>
            {errorAnulacion && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-2 mb-3">{errorAnulacion}</div>
            )}
            <label className="block text-xs font-medium text-gray-500 mb-1">Documento de anulación</label>
            <input value={anulando.documento} maxLength={100} placeholder="Ej. FC01-15 o RA-20261105-1"
              onChange={(e) => setAnulando({ ...anulando, documento: e.target.value })}
              className="w-full input-field mb-3" />
            <label className="block text-xs font-medium text-gray-500 mb-1">Motivo</label>
            <textarea value={anulando.motivo} maxLength={500} rows={3}
              onChange={(e) => setAnulando({ ...anulando, motivo: e.target.value })}
              className="w-full input-field mb-4" />
            <div className="flex justify-end gap-3">
              <button onClick={() => setAnulando(null)} disabled={guardandoAnulacion}
                className="border border-gray-300 text-gray-800 px-4 py-2 rounded-lg text-sm hover:bg-gray-50 transition">
                Cancelar
              </button>
              <button onClick={registrarAnulacion} disabled={guardandoAnulacion}
                className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-red-700 transition disabled:opacity-50">
                {guardandoAnulacion ? "Guardando…" : "Registrar anulación"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
