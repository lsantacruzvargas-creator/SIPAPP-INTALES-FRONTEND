import { useState, useEffect } from "react";
import { fetchAuth } from "../../utils/fetchAuth";
import { formatearFecha } from "../../utils/fecha";
import { money, idDe } from "../../utils/compras";
import { exportarOrdenCompraProveedorPdf } from "../../utils/compraPdf";
import ArchivosProveedor from "./ArchivosProveedor";

export default function DetalleOCP({ ocpId, onClose }) {
  const [ocp, setOcp] = useState(null);

  useEffect(() => {
    fetchAuth(`/ordenes-compra-proveedor/${ocpId}`).then(async (r) => { if (r.ok) setOcp(await r.json()); });
  }, [ocpId]);

  if (!ocp) {
    return (
      <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40">
        <p className="bg-white rounded-xl px-6 py-4 text-sm text-gray-500">Cargando orden de compra…</p>
      </div>
    );
  }

  const m = (v) => money(v, ocp.moneda);
  const esGanador = (p) => idDe(p.empresa) === idDe(ocp.proveedor);
  // POST de archivos devuelve la licitación entera; acá solo interesan sus proveedores.
  const actualizarLicitacion = (lic) => setOcp((o) => ({ ...o, licitacion: { ...o.licitacion, proveedores: lic.proveedores } }));
  const dato = (label, valor) => (
    <div><dt className="text-[11px] uppercase text-gray-400">{label}</dt><dd className="text-sm text-gray-800">{valor || "—"}</dd></div>
  );

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl flex flex-col max-h-[92vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-gray-800">Orden de compra {ocp.codigo}</h3>
            {ocp.anulada && <span className="text-[11px] font-semibold bg-red-50 text-red-600 rounded-full px-2 py-0.5">Anulada</span>}
          </div>
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => exportarOrdenCompraProveedorPdf(ocp)} className="text-sm text-purple-600 hover:underline">Descargar PDF</button>
            <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl leading-none">✕</button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          <dl className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {dato("Proveedor", ocp.proveedorRazonSocial)}
            {dato("RUC", ocp.proveedorRuc)}
            {dato("Fecha", formatearFecha(ocp.fecha))}
            {dato("Licitación", ocp.licitacion?.codigo)}
            {dato("Forma de pago", ocp.formaPago)}
            {dato("Lugar de entrega", ocp.lugarEntrega)}
            {dato("Fecha de entrega", ocp.fechaEntrega ? formatearFecha(ocp.fechaEntrega) : "")}
            {dato("Emitida por", ocp.emitidaPor)}
          </dl>
          {ocp.anulada && (
            <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">Anulada por {ocp.anuladoPor}: {ocp.motivoAnulacion}</p>
          )}

          <table className="w-full text-sm">
            <thead className="text-[11px] uppercase text-gray-400 border-b">
              <tr>
                <th className="text-left py-1">Descripción</th>
                <th className="text-left py-1">Tipo de artículo</th>
                <th className="text-left py-1">Centro de costo</th>
                <th className="text-left py-1">OT / SC</th>
                <th className="text-right py-1">Cant.</th>
                <th className="text-right py-1">P. unit.</th>
                <th className="text-right py-1">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {ocp.items.map((it) => (
                <tr key={it._id} className="border-b border-gray-50">
                  <td className="py-1.5 pr-2">{it.descripcion}</td>
                  <td className="py-1.5 text-xs text-gray-500">{it.tipoArticulo?.nombre || "—"}</td>
                  <td className="py-1.5 text-xs text-gray-500">{it.centroCosto?.nombre || "—"}</td>
                  <td className="py-1.5 text-xs font-mono text-gray-500">{it.ordenTrabajo?.numeroOT || it.ordenTrabajo?.codigo || "Manual"} · {it.scCodigo}</td>
                  <td className="py-1.5 text-right">{it.cantidad} {it.unidad}</td>
                  <td className="py-1.5 text-right">{m(it.precioUnitario)}</td>
                  <td className="py-1.5 text-right">{m(it.subtotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex justify-end">
            <dl className="text-sm grid grid-cols-2 gap-x-6 gap-y-0.5">
              <dt className="text-gray-500">Subtotal</dt><dd className="text-right">{m(ocp.subtotal)}</dd>
              <dt className="text-gray-500">{ocp.afectoIgv ? "IGV 18%" : "No afecto"}</dt><dd className="text-right">{m(ocp.igv)}</dd>
              <dt className="font-semibold">Total</dt><dd className="text-right font-semibold">{m(ocp.total)}</dd>
            </dl>
          </div>
          {ocp.observaciones && <p className="text-sm text-gray-600"><span className="font-semibold">Observaciones:</span> {ocp.observaciones}</p>}

          <div className="border border-gray-100 rounded-xl p-4 space-y-3">
            <h4 className="text-sm font-bold text-gray-700 uppercase tracking-wide">Cotizaciones recibidas</h4>
            {(ocp.licitacion?.proveedores || []).map((p) => (
              <div key={p._id} className="flex flex-wrap items-start gap-3 border-b border-gray-50 pb-2">
                <div className="w-64">
                  <p className="text-sm text-gray-800">{p.razonSocial}</p>
                  {esGanador(p) && <span className="text-[10px] font-semibold bg-green-50 text-green-700 rounded-full px-2 py-0.5">Ganador</span>}
                </div>
                <ArchivosProveedor licitacionId={ocp.licitacion._id} proveedor={p}
                  puedeSubir={esGanador(p) && !ocp.anulada} puedeBorrar={false} onCambio={actualizarLicitacion} />
                {(p.archivos || []).length === 0 && !(esGanador(p) && !ocp.anulada) && <p className="text-xs text-gray-400">Sin archivos</p>}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
