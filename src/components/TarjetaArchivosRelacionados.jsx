import { useState } from "react";
import { fetchAuth, uploadAuth, abrirArchivoProtegido } from "../utils/fetchAuth";
import ImagenProtegida from "./ImagenProtegida";

const EXT_IMAGEN = ["jpg", "jpeg", "png", "webp"];
const ACCEPT = [
  "image/jpeg", "image/png", "image/webp",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
].join(",");

const extension = (nombre = "") => nombre.split(".").pop()?.toLowerCase() || "";
const esImagen = (nombre) => EXT_IMAGEN.includes(extension(nombre));
const iconoPorExtension = (ext) => {
  if (ext === "pdf") return "📄";
  if (["doc", "docx"].includes(ext)) return "📝";
  if (["xls", "xlsx"].includes(ext)) return "📊";
  return "📎";
};
const formatoTamano = (bytes = 0) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

// Card "Datos relacionados" — sube/descarga imágenes y documentos (PDF/Word/
// Excel) sueltos, con miniatura de 200px para imágenes, igual que
// Requerimientos de Material/Servicios Externos en su propio card.
//
// Dos modos:
// - `ordenId` presente (DetalleOrdenTrabajo.jsx/DetalleSubOT.jsx/
//   DetalleCotizacion.jsx, el documento ya existe): cada archivo se sube de
//   inmediato vía API (`endpoint`/:ordenId/archivos) y `archivos` viene del
//   documento guardado (con `_id`/`url` reales).
// - `ordenId` ausente (ModalNuevaOT.jsx/ModalNuevaCotizacion.jsx, el
//   documento todavía no tiene _id): los archivos quedan pendientes en
//   memoria (`pendientes`/`onPendientesChange`, estado del padre) — el padre
//   los sube recién después de crear el documento.
//
// `archivosVinculados` (opcional): archivos del documento HERMANO en la
// cadena (ej. la Cotización que originó esta OT, o viceversa) — el vendedor
// sube los planos a la Cotización y deben verse también desde la OT
// generada, y en el sentido contrario (revisión del usuario, 2026-09-14). Se
// muestran de solo lectura acá (no se pueden borrar desde este lado) — para
// eso hay que abrir el documento dueño.
export default function TarjetaArchivosRelacionados({
  ordenId, archivos = [], onCambio,
  pendientes, onPendientesChange,
  archivosVinculados = [], vinculadoLabel = "",
  endpoint = "ordenes-trabajo",
  soloLectura = false,
  className = "",
}) {
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState("");
  const esPendiente = ordenId == null;
  const lista = esPendiente ? (pendientes || []) : archivos;

  const agregarArchivos = async (fileList) => {
    const files = Array.from(fileList || []);
    if (files.length === 0) return;
    setError("");

    if (esPendiente) {
      onPendientesChange?.([
        ...(pendientes || []),
        ...files.map((file) => ({ nombre: file.name, tamano: file.size, mimetype: file.type, file })),
      ]);
      return;
    }

    setSubiendo(true);
    let ultimaOrden = null;
    // Secuencial (no Promise.all): cada subida hace $push sobre el mismo
    // array `archivos` — en paralelo, dos respuestas basadas en el mismo
    // estado inicial pisarían la subida de la otra (misma razón por la que
    // el resto del proyecto evita Promise.all en escrituras concurrentes
    // sobre un mismo documento).
    for (const file of files) {
      const fd = new FormData();
      fd.append("archivo", file);
      const res = await uploadAuth(`/${endpoint}/${ordenId}/archivos`, fd);
      if (!res.ok) setError(`No se pudo subir "${file.name}" — formato o tamaño no permitido (máx. 20 MB).`);
      else ultimaOrden = await res.json();
    }
    setSubiendo(false);
    if (ultimaOrden) onCambio?.(ultimaOrden);
  };

  const eliminar = async (archivo, idx) => {
    if (esPendiente) {
      onPendientesChange?.((pendientes || []).filter((_, i) => i !== idx));
      return;
    }
    const res = await fetchAuth(`/${endpoint}/${ordenId}/archivos/${archivo._id}`, { method: "DELETE" });
    if (res.ok) onCambio?.(await res.json());
  };

  const abrir = (archivo) => {
    if (archivo.url) abrirArchivoProtegido(archivo.url);
    else if (archivo.file) window.open(URL.createObjectURL(archivo.file), "_blank");
  };

  const renderArchivo = (a, idx, { vinculado = false } = {}) => (
    <div key={a._id || idx} className="relative border border-gray-100 rounded-xl p-3 w-[200px] space-y-2">
      {!soloLectura && !vinculado && (
        <button type="button" onClick={() => eliminar(a, idx)}
          className="absolute -top-2 -right-2 bg-white border border-gray-200 text-red-400 hover:text-red-600 rounded-full w-6 h-6 text-xs leading-none z-10">
          ✕
        </button>
      )}
      <button type="button" onClick={() => abrir(a)} className="block w-full">
        {esImagen(a.nombre) && a.url ? (
          <ImagenProtegida src={a.url} alt={a.nombre} className="w-[200px] h-[200px] object-cover rounded-lg" />
        ) : esImagen(a.nombre) && a.file ? (
          <img src={URL.createObjectURL(a.file)} alt={a.nombre} className="w-[200px] h-[200px] object-cover rounded-lg" />
        ) : (
          <div className="w-[200px] h-[200px] bg-gray-50 rounded-lg flex items-center justify-center text-5xl">
            {iconoPorExtension(extension(a.nombre))}
          </div>
        )}
      </button>
      <button type="button" onClick={() => abrir(a)}
        className="text-xs text-blue-600 hover:text-blue-800 underline truncate block w-full text-left" title={a.nombre}>
        {a.nombre}
      </button>
      <div className="flex items-center justify-between gap-1">
        <p className="text-[11px] text-gray-400">{formatoTamano(a.tamano)}</p>
        {vinculado && (
          <span className="text-[10px] text-cyan-600 bg-cyan-50 rounded-full px-1.5 py-0.5 whitespace-nowrap">
            De {vinculadoLabel}
          </span>
        )}
      </div>
    </div>
  );

  const totalArchivos = lista.length + archivosVinculados.length;

  return (
    <div className={`bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4 ${className}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-5 rounded-full bg-cyan-500" />
          <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide">
            Datos relacionados ({totalArchivos})
          </h2>
        </div>
        {!soloLectura && (
          <label className={`text-sm bg-cyan-600 text-white px-4 py-2 rounded-lg transition font-medium ${subiendo ? "opacity-60" : "hover:bg-cyan-700 cursor-pointer"}`}>
            {subiendo ? "Subiendo…" : "+ Agregar archivo"}
            <input type="file" multiple accept={ACCEPT} className="hidden" disabled={subiendo}
              onChange={(e) => { agregarArchivos(e.target.files); e.target.value = ""; }} />
          </label>
        )}
      </div>

      {error && <p className="text-xs text-red-500">{error}</p>}

      {totalArchivos === 0 ? (
        <p className="text-sm text-gray-400">Sin imágenes ni archivos adjuntos</p>
      ) : (
        <div className="flex flex-wrap gap-4">
          {lista.map((a, idx) => renderArchivo(a, idx))}
          {archivosVinculados.map((a, idx) => renderArchivo(a, idx, { vinculado: true }))}
        </div>
      )}
    </div>
  );
}
