import { useState, useEffect, useCallback } from "react";
import { fetchAuth } from "../../utils/fetchAuth";
import { formatearFecha } from "../../utils/fecha";
import TablaScroll from "../TablaScroll";
import PromptAccion from "../PromptAccion";
import ModalCuadroComparativo from "./ModalCuadroComparativo";
import { conBloqueo } from "../../utils/bloqueoApi";

export default function TablaLicitaciones({ catalogos, onAdjudicado }) {
  const [lics, setLics] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [abiertaId, setAbiertaId] = useState(null);
  const [anulando, setAnulando] = useState(null);
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState("");

  const cargar = useCallback(() => fetchAuth("/licitaciones?estado=abierta").then(async (r) => {
    if (r.ok) setLics(await r.json());
    setCargando(false);
  }), []);
  useEffect(() => { cargar(); }, [cargar]);

  const anular = async (motivo) => {
    setProcesando(true);
    setError("");
    const r = await conBloqueo("licitacion", anulando._id, (h) => fetchAuth(`/licitaciones/${anulando._id}/anular`, { headers: h, method: "PATCH", body: JSON.stringify({ motivo }) }));
    if (r.ok) await cargar();
    else {
      const d = await r.json().catch(() => ({}));
      setError(d.mensaje || "No se pudo anular la licitación.");
    }
    setProcesando(false);
    setAnulando(null);
  };

  const cotizadas = (lic) => lic.proveedores.filter((p) => p.precios.length > 0).length;
  const scs = (lic) => [...new Set(lic.items.map((i) => i.scCodigo))].join(", ");

  return (
    <div className="space-y-4">
      {error && <p className="text-sm text-red-500 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <TablaScroll className="overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead className="bg-gray-500 text-white text-xs uppercase">
              <tr>
                <th className="px-3 py-3 text-left">Licitación</th>
                <th className="px-3 py-3 text-left">Fecha</th>
                <th className="px-3 py-3 text-right">Ítems</th>
                <th className="px-3 py-3 text-left">SCs</th>
                <th className="px-3 py-3 text-left">Proveedores invitados</th>
                <th className="px-3 py-3 text-center">Cotizaciones cargadas</th>
                <th className="px-3 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {cargando ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">Cargando…</td></tr>
              ) : lics.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">Sin licitaciones abiertas</td></tr>
              ) : lics.map((lic) => (
                <tr key={lic._id} className="hover:bg-gray-50">
                  <td className="px-3 py-2 font-mono text-xs text-gray-700">{lic.codigo}</td>
                  <td className="px-3 py-2 text-xs text-gray-500">{formatearFecha(lic.createdAt)}</td>
                  <td className="px-3 py-2 text-right">{lic.items.length}</td>
                  <td className="px-3 py-2 font-mono text-xs text-gray-500">{scs(lic)}</td>
                  <td className="px-3 py-2 text-xs">{lic.proveedores.map((p) => p.empresa?.razonSocial || p.razonSocial).join(" · ")}</td>
                  <td className="px-3 py-2 text-center text-xs">{cotizadas(lic)}/{lic.proveedores.length}</td>
                  <td className="px-3 py-2 text-right space-x-3 whitespace-nowrap">
                    <button onClick={() => setAbiertaId(lic._id)} className="text-purple-600 hover:underline text-xs font-medium">Cuadro comparativo</button>
                    <button onClick={() => setAnulando(lic)} className="text-red-500 hover:underline text-xs">Anular</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TablaScroll>
      </div>

      {abiertaId && (
        <ModalCuadroComparativo licitacionId={abiertaId} catalogos={catalogos}
          onClose={() => { setAbiertaId(null); cargar(); }}
          onAdjudicado={() => { setAbiertaId(null); cargar(); onAdjudicado?.(); }} />
      )}
      {anulando && (
        <PromptAccion titulo={`Anular ${anulando.codigo}`} placeholder="Las líneas volverán a Por procesar"
          onCancelar={() => setAnulando(null)} onConfirmar={anular} procesando={procesando} textoConfirmar="Anular licitación" />
      )}
    </div>
  );
}
