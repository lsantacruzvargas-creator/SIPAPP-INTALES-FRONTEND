import { useState } from "react";
import { fetchAuth } from "../utils/fetchAuth";
import { formatearFecha } from "../utils/fecha";
import ModalServicioExterno from "./ModalServicioExterno";
import TablaScroll from "./TablaScroll";
import PromptAccion from "./PromptAccion";
import { Chip } from "./detalleShared";

// Mismo pipeline de pago que Requerimientos.jsx (por_procesar → pendiente_pago
// → pagado) — acá se resume en un solo Chip por fila, ya que a diferencia de
// un Requerimiento (con ítems), un Servicio Externo es un único documento
// con un solo `estadoPago`.
const ESTADO_SERVICIO = {
  por_procesar:   { clase: "bg-gray-100 text-gray-600",   label: "Por procesar" },
  pendiente_pago: { clase: "bg-amber-100 text-amber-700", label: "Pendiente de pago" },
  pagado:         { clase: "bg-green-100 text-green-700", label: "Pagado" },
};

// Sección full-width de Servicios Externos (terceros) para el detalle de una
// OT/sub-OT — no la ve el rol técnico (gate ya hecho en el componente padre
// vía `puedeVerServicios`, este componente asume que ya se filtró). Se
// monta igual en DetalleOrdenTrabajo.jsx (vista agregada padre+sub-OTs vía
// `?ordenTrabajoPadre=`) y en DetalleSubOT.jsx (solo lo propio).
export default function TablaServiciosExternos({ ot, subOTs = [], servicios, puedeEditar, onCambio }) {
  const [crearOpen, setCrearOpen] = useState(false);
  const [confirmandoAnular, setConfirmandoAnular] = useState(null);
  const [anulando, setAnulando] = useState(false);

  const anular = async (motivo) => {
    setAnulando(true);
    const res = await fetchAuth(`/servicios-externos/${confirmandoAnular._id}/anular`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ motivo }),
    });
    setAnulando(false);
    setConfirmandoAnular(null);
    if (res.ok) onCambio();
  };

  return (
    <div className="max-w-6xl mx-auto px-8 pb-8">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-5 rounded-full bg-purple-500" />
            <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide">
              Servicios Externos ({servicios.length})
            </h2>
          </div>
          {puedeEditar && !ot.anulado && (
            <button type="button" onClick={() => setCrearOpen(true)}
              className="text-sm bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition font-medium">
              + Agregar servicio
            </button>
          )}
        </div>

        {servicios.length === 0 ? (
          <p className="text-sm text-gray-400">Sin servicios externos registrados</p>
        ) : (
          <TablaScroll className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase tracking-wide text-gray-400 border-b border-gray-100">
                <tr>
                  <th className="text-left py-2 pr-3">Código</th>
                  <th className="text-left py-2 pr-3">Proveedor</th>
                  <th className="text-left py-2 pr-3">Tipo de Servicio</th>
                  <th className="text-left py-2 pr-3">Material(es)</th>
                  <th className="text-left py-2 pr-3">Sub-OT</th>
                  <th className="text-right py-2 pr-3">Cantidad</th>
                  <th className="text-left py-2 pr-3">Estado</th>
                  <th className="text-left py-2 pr-3">Fecha</th>
                  {puedeEditar && <th className="text-left py-2 pr-3"></th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {servicios.map(s => {
                  const otOrigenId = s.ordenTrabajo?._id || s.ordenTrabajo;
                  const esPrincipal = otOrigenId === ot._id;
                  const subOrigen = subOTs.find(sub => sub._id === otOrigenId);
                  const { clase, label } = ESTADO_SERVICIO[s.estadoPago || "por_procesar"] || ESTADO_SERVICIO.por_procesar;
                  return (
                    <tr key={s._id} className={s.anulado ? "opacity-50" : ""}>
                      <td className="py-2 pr-3 font-mono text-xs text-gray-700">{s.codigo}</td>
                      <td className="py-2 pr-3 text-gray-700">{s.nombreProveedor || "—"}</td>
                      <td className="py-2 pr-3 text-gray-600">{s.tipoTrabajo}</td>
                      <td className="py-2 pr-3 text-gray-600">{s.material || "—"}</td>
                      <td className="py-2 pr-3 text-gray-600">
                        {esPrincipal ? "Principal" : (subOrigen?.numeroOT || s.ordenTrabajo?.numeroOT || "—")}
                      </td>
                      <td className="py-2 pr-3 text-right text-gray-700 tabular-nums">{s.cantidad}</td>
                      <td className="py-2 pr-3">
                        <Chip className={clase}>{label}</Chip>
                      </td>
                      <td className="py-2 pr-3 text-gray-500">
                        {s.createdAt ? formatearFecha(s.createdAt) : "—"}
                      </td>
                      {puedeEditar && (
                        <td className="py-2 pr-3">
                          {!s.anulado && (
                            <button type="button" onClick={() => setConfirmandoAnular(s)}
                              className="text-xs text-gray-400 hover:text-red-500 transition">
                              Anular
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TablaScroll>
        )}
      </div>

      {crearOpen && (
        <ModalServicioExterno ot={ot} onClose={() => setCrearOpen(false)}
          onCreado={() => { setCrearOpen(false); onCambio(); }} />
      )}

      {confirmandoAnular && (
        <PromptAccion
          titulo={`Anular servicio ${confirmandoAnular.codigo}`}
          label="Motivo de anulación"
          onCancelar={() => setConfirmandoAnular(null)}
          onConfirmar={anular}
          procesando={anulando}
          textoConfirmar="Anular"
        />
      )}
    </div>
  );
}
