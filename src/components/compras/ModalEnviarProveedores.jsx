import { useState } from "react";
import { fetchAuth } from "../../utils/fetchAuth";
import { ordenarProveedores, idDe } from "../../utils/compras";
import { exportarSolicitudCotizacionPdf } from "../../utils/compraPdf";
import { conBloqueo } from "../../utils/bloqueoApi";

// Sin `licitacion`: crea la Licitación con las líneas marcadas. Con
// `licitacion`: invita proveedores adicionales a una licitación abierta.
// En ambos casos descarga un PDF de Solicitud de Cotización por proveedor.
export default function ModalEnviarProveedores({ lineas = [], proveedores, licitacion = null, bloqueo, onClose, onEnviado }) {
  // Con el bloqueo del cuadro si viene de ahí; si no, uno temporal para esta acción.
  const llamar = (url, opciones) => (bloqueo ? bloqueo.fetch(url, opciones)
    : conBloqueo("licitacion", licitacion._id, (h) => fetchAuth(url, { ...opciones, headers: h })));
  const modoInvitar = !!licitacion;
  const items = modoInvitar ? licitacion.items : lineas;
  const yaInvitados = new Set(modoInvitar ? licitacion.proveedores.map((p) => idDe(p.empresa)) : []);
  const [busqueda, setBusqueda] = useState("");
  const [marcados, setMarcados] = useState(() => new Set());
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");
  const [exito, setExito] = useState("");

  const q = busqueda.trim().toLowerCase();
  const visibles = proveedores.filter((p) =>
    !yaInvitados.has(String(p._id)) && (!q || [p.razonSocial, p.alias, p.ruc].some((v) => v?.toLowerCase().includes(q)))
  );
  const { sugeridos, otros, totalTipos } = ordenarProveedores(visibles, items.map((i) => i.tipoArticulo));

  const toggle = (id) => setMarcados((prev) => {
    const s = new Set(prev);
    if (s.has(id)) s.delete(id); else s.add(id);
    return s;
  });

  const fallar = async (r, mensaje) => {
    const d = await r.json().catch(() => ({}));
    setError(d.mensaje || mensaje);
    setEnviando(false);
  };

  const confirmar = async () => {
    if (marcados.size === 0) return setError("Selecciona al menos un proveedor.");
    setEnviando(true);
    setError("");
    let lic = null;
    if (modoInvitar) {
      for (const empresa of marcados) {
        const r = await llamar(`/licitaciones/${licitacion._id}/proveedores`, { method: "POST", body: JSON.stringify({ empresa }) });
        if (!r.ok) return fallar(r, "No se pudo invitar al proveedor.");
        lic = await r.json();
      }
    } else {
      const r = await fetchAuth("/licitaciones", {
        method: "POST",
        body: JSON.stringify({
          lineas: lineas.map((l) => ({ solicitudCompra: l.sc._id, lineaId: l._id })),
          proveedores: [...marcados],
        }),
      });
      if (!r.ok) return fallar(r, "No se pudo enviar la solicitud.");
      lic = await r.json();
    }
    for (const prov of lic.proveedores.filter((p) => marcados.has(idDe(p.empresa)))) {
      await exportarSolicitudCotizacionPdf(lic, prov);
    }
    setEnviando(false);
    setExito(`${lic.codigo}: se descargó ${marcados.size === 1 ? "1 PDF" : `${marcados.size} PDFs`} para enviar a los proveedores.`);
    setTimeout(() => onEnviado(lic), 1800);
  };

  const filaProveedor = ({ proveedor: p, coincidencias }) => (
    <label key={p._id} className="flex items-start gap-3 px-3 py-2 rounded-lg hover:bg-gray-50 cursor-pointer">
      <input type="checkbox" checked={marcados.has(String(p._id))} onChange={() => toggle(String(p._id))} className="mt-1 w-4 h-4" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-800">{p.alias ? `${p.alias} — ` : ""}{p.razonSocial}</p>
        <p className="text-xs text-gray-400">RUC {p.ruc || "—"}</p>
        {(p.tipoArticulos || []).length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {p.tipoArticulos.map((t) => (
              <span key={t._id || t} className="text-[10px] bg-gray-100 text-gray-600 rounded px-1.5 py-0.5">{t.nombre}</span>
            ))}
          </div>
        )}
      </div>
      {coincidencias > 0 && (
        <span className="shrink-0 text-[10px] font-semibold bg-green-50 text-green-700 rounded-full px-2 py-0.5">
          {coincidencias}/{totalTipos} tipos
        </span>
      )}
    </label>
  );

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <div>
            <h3 className="font-semibold text-gray-800">{modoInvitar ? `Invitar proveedores — ${licitacion.codigo}` : "Enviar a proveedores"}</h3>
            <p className="text-xs text-gray-400 mt-0.5">{items.length} ítem{items.length !== 1 ? "s" : ""} · se descargará un PDF por proveedor</p>
          </div>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl leading-none">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <ul className="text-xs text-gray-600 bg-gray-50 rounded-lg p-3 space-y-1 max-h-32 overflow-y-auto">
            {items.map((it) => (
              <li key={it._id}>
                <span className="font-mono text-gray-400">{it.scCodigo || it.sc?.codigo}</span> · {it.descripcion} — {it.cantidad} {it.unidad}
              </li>
            ))}
          </ul>

          <input autoFocus value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar proveedor por razón social, alias o RUC…"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300" />

          {sugeridos.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-green-700 uppercase tracking-wide mb-1">Sugeridos por tipo de artículo</p>
              {sugeridos.map(filaProveedor)}
            </div>
          )}
          <div>
            {sugeridos.length > 0 && <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1 pt-2 border-t border-gray-100">Otros proveedores</p>}
            {otros.map(filaProveedor)}
            {visibles.length === 0 && <p className="text-sm text-gray-400 text-center py-4">No hay proveedores que coincidan. Márcalos como proveedor en Empresas.</p>}
          </div>

          {exito && <div className="bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg px-4 py-3">{exito}</div>}
          {error && <p className="text-sm text-red-500">{error}</p>}
        </div>

        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100 shrink-0">
          <button type="button" onClick={onClose} disabled={enviando || !!exito}
            className="text-sm border border-gray-300 px-4 py-2 rounded-lg hover:bg-gray-50 transition disabled:opacity-50">Cancelar</button>
          <button type="button" onClick={confirmar} disabled={enviando || !!exito}
            className="text-sm bg-purple-600 text-white px-5 py-2 rounded-lg hover:bg-purple-700 disabled:opacity-50 transition font-medium">
            {enviando ? "Enviando…" : `Enviar (${marcados.size}) y descargar PDF`}
          </button>
        </div>
      </div>
    </div>
  );
}
