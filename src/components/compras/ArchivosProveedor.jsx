import { useState } from "react";
import { fetchAuth, uploadAuth, abrirArchivoProtegido } from "../../utils/fetchAuth";
import { conBloqueo } from "../../utils/bloqueoApi";

const ACCEPT = [
  "image/jpeg", "image/png", "image/webp",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
].join(",");

// Versión compacta de TarjetaArchivosRelacionados para caber en una columna
// del cuadro comparativo: cotizaciones que devolvió un proveedor.
export default function ArchivosProveedor({ licitacionId, proveedor, puedeSubir = true, puedeBorrar = false, onCambio, bloqueo }) {
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState("");
  const base = `/licitaciones/${licitacionId}/proveedores/${proveedor._id}/archivos`;

  const subir = async (fileList) => {
    const files = Array.from(fileList || []);
    if (files.length === 0) return;
    setSubiendo(true);
    setError("");
    let ultima = null;
    // Secuencial: cada subida hace push sobre el mismo documento.
    for (const file of files) {
      const fd = new FormData();
      fd.append("archivo", file);
      const r = await (bloqueo ? bloqueo.upload(base, fd) : conBloqueo("licitacion", licitacionId, (h) => uploadAuth(base, fd, h)));
      if (r.ok) ultima = await r.json();
      else if (r.status === 423) { setError((await r.json().catch(() => ({}))).mensaje); break; }
      else setError(`No se pudo subir "${file.name}" — formato o tamaño no permitido (máx. 20 MB).`);
    }
    setSubiendo(false);
    if (ultima) onCambio(ultima);
  };

  const borrar = async (archivo) => {
    const r = await (bloqueo ? bloqueo.fetch(`${base}/${archivo._id}`, { method: "DELETE" })
      : conBloqueo("licitacion", licitacionId, (h) => fetchAuth(`${base}/${archivo._id}`, { method: "DELETE", headers: h })));
    if (r.ok) onCambio(await r.json());
    else {
      const d = await r.json().catch(() => ({}));
      setError(d.mensaje || "No se pudo quitar el archivo.");
    }
  };

  return (
    <div className="space-y-1">
      {(proveedor.archivos || []).map((a) => (
        <div key={a._id} className="flex items-center gap-1 text-xs">
          <button type="button" onClick={() => abrirArchivoProtegido(a.url)} title={a.nombre}
            className="text-blue-600 hover:underline truncate max-w-[170px] text-left">📎 {a.nombre}</button>
          {puedeBorrar && <button type="button" onClick={() => borrar(a)} className="text-gray-300 hover:text-red-500">✕</button>}
        </div>
      ))}
      {puedeSubir && (
        <label className={`inline-block text-xs text-cyan-700 ${subiendo ? "opacity-60" : "hover:underline cursor-pointer"}`}>
          {subiendo ? "Subiendo…" : "+ Adjuntar cotización"}
          <input type="file" multiple accept={ACCEPT} className="hidden" disabled={subiendo}
            onChange={(e) => { subir(e.target.files); e.target.value = ""; }} />
        </label>
      )}
      {error && <p className="text-[11px] text-red-500">{error}</p>}
    </div>
  );
}
