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
  const origen = (sc) => (sc.ordenTrabajo ? `OT ${sc.ordenTrabajo.numeroOT || sc.ordenTrabajo.codigo}` : "Manual");

  return (
    <div className="space-y-4">
      {error && <p className="text-sm text-red-500 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <TablaScroll className="overflow-x-auto">
          <table className="w-full text-sm min-w-[1150px]">
            <thead className="bg-gray-500 text-white text-xs uppercase">
              <tr>
                <th className="px-3 py-3 text-left">Licitación</th>
                <th className="px-3 py-3 text-left">SC</th>
                <th className="px-3 py-3 text-left">Fecha SC</th>
                <th className="px-3 py-3 text-left">Origen</th>
                <th className="px-3 py-3 text-left">Tipo</th>
                <th className="px-3 py-3 text-left">Tipo de artículo</th>
                <th className="px-3 py-3 text-left">Descripción</th>
                <th className="px-3 py-3 text-right">Cant.</th>
                <th className="px-3 py-3 text-left">Und.</th>
                <th className="px-3 py-3 text-left">Centro de costo</th>
                <th className="px-3 py-3 text-left">Solicitado por</th>
                <th className="px-3 py-3 text-left">Proveedores invitados</th>
                <th className="px-3 py-3 text-center">Cotizaciones</th>
                <th className="px-3 py-3" />
              </tr>
            </thead>
            {cargando ? (
              <tbody><tr><td colSpan={14} className="px-4 py-8 text-center text-gray-400">Cargando…</td></tr></tbody>
            ) : lics.length === 0 ? (
              <tbody><tr><td colSpan={14} className="px-4 py-8 text-center text-gray-400">Sin licitaciones abiertas</td></tr></tbody>
            ) : lics.map((lic) => {
              const n = lic.items.length || 1;
              // Celdas de la licitación: solo en la primera fila, abarcando todos sus ítems.
              const deLic = (i, contenido, className) => (i === 0 ? <td rowSpan={n} className={`px-3 py-2 align-top ${className}`}>{contenido}</td> : null);
              return (
                <tbody key={lic._id} className="divide-y divide-gray-100 border-t-2 border-gray-200">
                  {lic.items.map((it, i) => {
                    const sc = it.solicitudCompra || {};
                    return (
                      <tr key={it._id} className="hover:bg-gray-50">
                        {deLic(i, <><p className="font-mono text-xs text-gray-700">{lic.codigo}</p><p className="text-[11px] text-gray-400">{formatearFecha(lic.createdAt)}</p></>, "")}
                        <td className="px-3 py-2 font-mono text-xs text-gray-500">{it.scCodigo}</td>
                        <td className="px-3 py-2 text-xs text-gray-500">{sc.createdAt ? formatearFecha(sc.createdAt) : "—"}</td>
                        <td className="px-3 py-2 text-xs">{origen(sc)}</td>
                        <td className="px-3 py-2">
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${it.tipo === "servicio" ? "bg-cyan-50 text-cyan-700" : "bg-amber-50 text-amber-700"}`}>
                            {it.tipo === "servicio" ? "Servicio" : "Material"}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-xs">{it.tipoArticulo?.nombre || "Sin tipo"}</td>
                        <td className="px-3 py-2 text-gray-800">{it.descripcion}</td>
                        <td className="px-3 py-2 text-right">{it.cantidad}</td>
                        <td className="px-3 py-2 text-xs text-gray-500">{it.unidad}</td>
                        <td className="px-3 py-2 text-xs">{it.centroCosto?.nombre || "—"}</td>
                        <td className="px-3 py-2 text-xs text-gray-500">{sc.solicitadoPor || "—"}</td>
                        {deLic(i, lic.proveedores.map((p) => p.empresa?.razonSocial || p.razonSocial).join(" · "), "text-xs")}
                        {deLic(i, `${cotizadas(lic)}/${lic.proveedores.length}`, "text-center text-xs")}
                        {deLic(i, (
                          <div className="flex flex-col items-end gap-1 whitespace-nowrap">
                            <button onClick={() => setAbiertaId(lic._id)} className="text-purple-600 hover:underline text-xs font-medium">Cuadro comparativo</button>
                            <button onClick={() => setAnulando(lic)} className="text-red-500 hover:underline text-xs">Anular</button>
                          </div>
                        ), "text-right")}
                      </tr>
                    );
                  })}
                </tbody>
              );
            })}
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
