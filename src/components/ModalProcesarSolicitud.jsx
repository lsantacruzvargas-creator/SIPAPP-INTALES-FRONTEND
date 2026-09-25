import { useState, useEffect } from "react";
import { fetchAuth } from "../utils/fetchAuth";
import SelectorEmpresas from "./SelectorEmpresas";

// "Procesar solicitud" — asigna un proveedor (de la misma lista de Empresas)
// + monto por unidad (sin IGV) a cada ítem seleccionado, más un costo de
// transporte opcional. Sirve tanto para ítems de Requerimiento (material,
// solicitud de compra) como para Servicios Externos — `tipo` decide el
// endpoint. Soporta selección múltiple (checkboxes en Requerimientos.jsx):
// un solo proveedor para todo el lote, pero un monto unitario por ítem —
// las llamadas van secuenciales, nunca Promise.all, mismo criterio que el
// resto del proyecto para escrituras que no son sobre el mismo documento
// pero sí queremos ver errores parciales con claridad.
//
// `items`: [{ key, requerimientoId? , id, label, cantidad, unidad }]
// - Para material: requerimientoId + id (item._id dentro del Requerimiento).
// - Para servicio: solo id (el propio ServicioExterno._id).
export default function ModalProcesarSolicitud({ tipo, items, onClose, onProcesado }) {
  const [empresas, setEmpresas] = useState([]);
  const [selectorAbierto, setSelectorAbierto] = useState(false);
  const [proveedor, setProveedor] = useState(null);
  const [montos, setMontos] = useState(() => Object.fromEntries(items.map((it) => [it.key, ""])));
  const [costoTransporte, setCostoTransporte] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [exito, setExito] = useState("");

  useEffect(() => {
    fetchAuth("/empresas").then((r) => r.ok && r.json()).then((d) => setEmpresas(d || []));
  }, []);

  const setMonto = (key, valor) => setMontos((prev) => ({ ...prev, [key]: valor }));

  const guardar = async () => {
    if (!proveedor) return setError("Selecciona el proveedor.");
    const faltantes = items.filter((it) => !montos[it.key] || Number(montos[it.key]) <= 0);
    if (faltantes.length > 0) return setError("Ingresa el monto por unidad de todos los ítems.");
    setGuardando(true);
    setError("");

    const errores = [];
    for (const it of items) {
      const endpoint = tipo === "material"
        ? `/requerimientos/${it.requerimientoId}/items/${it.id}/procesar`
        : `/servicios-externos/${it.id}/procesar`;
      const res = await fetchAuth(endpoint, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          proveedor: proveedor._id,
          montoUnitario: Number(montos[it.key]),
          costoTransporte: costoTransporte ? Number(costoTransporte) : 0,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        errores.push(`${it.label}: ${d.mensaje || "error"}`);
      }
    }

    setGuardando(false);
    if (errores.length > 0) {
      setError(`No se pudo procesar: ${errores.join(" · ")}`);
      return;
    }
    setExito(`${items.length} solicitud${items.length !== 1 ? "es" : ""} procesada${items.length !== 1 ? "s" : ""} — ${items.length !== 1 ? "pasaron" : "pasó"} a Pendiente de pago.`);
    setTimeout(onProcesado, 1800);
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <div>
            <h3 className="font-semibold text-gray-800">Procesar solicitud</h3>
            <p className="text-xs text-gray-400 mt-0.5">{items.length} ítem{items.length !== 1 ? "s" : ""} seleccionado{items.length !== 1 ? "s" : ""}</p>
          </div>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl leading-none">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <div>
            <label className="text-xs text-gray-500 block mb-1">Proveedor *</label>
            <button type="button" onClick={() => setSelectorAbierto(true)}
              className="w-full text-left border border-gray-200 rounded-lg px-3 py-2 text-sm hover:border-gray-300 transition">
              {proveedor
                ? (proveedor.alias ? `${proveedor.alias} — ${proveedor.razonSocial}` : proveedor.razonSocial)
                : <span className="text-gray-400">Seleccionar empresa…</span>}
            </button>
          </div>

          <div className="space-y-2">
            <p className="text-xs text-gray-500">Monto por unidad (sin IGV) *</p>
            {items.map((it) => (
              <div key={it.key} className="flex items-center gap-3 border border-gray-100 rounded-lg px-3 py-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-700 truncate">{it.label}</p>
                  <p className="text-xs text-gray-400">{it.cantidad} {it.unidad || ""}</p>
                </div>
                <input type="number" min="0" step="0.01" value={montos[it.key]}
                  onChange={(e) => setMonto(it.key, e.target.value)} onWheel={(e) => e.target.blur()}
                  placeholder="0.00"
                  className="w-28 border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-right focus:outline-none focus:ring-2 focus:ring-purple-300" />
              </div>
            ))}
          </div>

          <div>
            <label className="text-xs text-gray-500 block mb-1">Costo de transporte (opcional)</label>
            <input type="number" min="0" step="0.01" value={costoTransporte}
              onChange={(e) => setCostoTransporte(e.target.value)} onWheel={(e) => e.target.blur()}
              placeholder="0.00"
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-purple-300" />
          </div>

          {exito && (
            <div className="bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg px-4 py-3">
              {exito}
            </div>
          )}
          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>

        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100 shrink-0">
          <button type="button" onClick={onClose} disabled={guardando || !!exito}
            className="text-sm border border-gray-300 px-4 py-2 rounded-lg hover:bg-gray-50 transition disabled:opacity-50">
            Cancelar
          </button>
          <button type="button" onClick={guardar} disabled={guardando || !!exito}
            className="text-sm bg-purple-600 text-white px-5 py-2 rounded-lg hover:bg-purple-700 disabled:opacity-50 transition font-medium">
            {guardando ? "Procesando…" : "Procesar solicitud"}
          </button>
        </div>
      </div>

      {selectorAbierto && (
        <SelectorEmpresas
          empresas={empresas}
          onClose={() => setSelectorAbierto(false)}
          onSeleccionar={(e) => { setProveedor(e); setSelectorAbierto(false); }}
          onCambio={async (guardada) => {
            const r = await fetchAuth("/empresas");
            setEmpresas(r.ok ? await r.json() : []);
            setProveedor(guardada);
          }}
        />
      )}
    </div>
  );
}
