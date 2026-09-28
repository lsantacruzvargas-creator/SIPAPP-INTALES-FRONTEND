import { useState } from "react";
import { fetchAuth } from "../../utils/fetchAuth";
import { totalesOCP, money } from "../../utils/compras";
import { exportarOrdenCompraProveedorPdf } from "../../utils/compraPdf";
import SelectFormaPago from "../SelectFormaPago";

const INP = "border border-gray-200 rounded-md px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-purple-300";

// Una OC por proveedor ganador, precargada con lo guardado en el cuadro;
// cantidad y precio siguen editables hasta confirmar.
function gruposDesde(lic) {
  return lic.proveedores
    .map((p) => ({
      proveedorId: p._id,
      razonSocial: p.empresa?.razonSocial || p.razonSocial,
      moneda: p.moneda,
      afectoIgv: true,
      formaPago: "Factura a 30 días",
      lugarEntrega: "",
      fechaEntrega: "",
      observaciones: p.observaciones || "",
      items: lic.items
        .filter((i) => String(i.ganador) === String(p._id))
        .map((i) => ({
          itemId: i._id,
          descripcion: i.descripcion,
          unidad: i.unidad,
          cantidad: String(i.cantidad),
          precioUnitario: String(p.precios.find((x) => String(x.itemId) === String(i._id))?.precioUnitario ?? ""),
        })),
    }))
    .filter((g) => g.items.length > 0);
}

export default function ModalGenerarOCP({ licitacion, onClose, onGenerado }) {
  const [grupos, setGrupos] = useState(() => gruposDesde(licitacion));
  const [generando, setGenerando] = useState(false);
  const [error, setError] = useState("");
  const [exito, setExito] = useState("");
  const sinGanador = licitacion.items.filter((i) => !i.ganador);

  const setGrupo = (idx, campo, valor) => setGrupos((gs) => gs.map((g, i) => (i === idx ? { ...g, [campo]: valor } : g)));
  const setItem = (idx, itemId, campo, valor) => setGrupos((gs) => gs.map((g, i) => (
    i !== idx ? g : { ...g, items: g.items.map((it) => (it.itemId === itemId ? { ...it, [campo]: valor } : it)) }
  )));

  const generar = async () => {
    for (const g of grupos) {
      for (const it of g.items) {
        if (!(Number(it.cantidad) > 0)) return setError(`${g.razonSocial}: cantidad inválida en "${it.descripcion}".`);
        if (it.precioUnitario === "" || !(Number(it.precioUnitario) >= 0)) return setError(`${g.razonSocial}: falta el precio de "${it.descripcion}".`);
      }
    }
    setGenerando(true);
    setError("");
    const r = await fetchAuth(`/licitaciones/${licitacion._id}/adjudicar`, {
      method: "POST",
      body: JSON.stringify({
        ordenes: grupos.map((g) => ({
          proveedorId: g.proveedorId,
          moneda: g.moneda,
          afectoIgv: g.afectoIgv,
          formaPago: g.formaPago,
          lugarEntrega: g.lugarEntrega,
          // Mediodía de Lima: un "YYYY-MM-DD" pelado se guarda como 00:00 UTC y
          // se mostraría como el día anterior en hora Lima.
          fechaEntrega: g.fechaEntrega ? `${g.fechaEntrega}T12:00:00-05:00` : null,
          observaciones: g.observaciones,
          items: g.items.map((it) => ({ itemId: it.itemId, cantidad: Number(it.cantidad), precioUnitario: Number(it.precioUnitario) })),
        })),
      }),
    });
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      setError(d.mensaje || "No se pudieron generar las órdenes de compra.");
      setGenerando(false);
      return;
    }
    const ocps = await r.json();
    for (const ocp of ocps) await exportarOrdenCompraProveedorPdf(ocp);
    setGenerando(false);
    setExito(`${ocps.map((o) => o.codigo).join(", ")} generada${ocps.length !== 1 ? "s" : ""} — PDF descargado.`);
    setTimeout(() => onGenerado(ocps), 1800);
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl flex flex-col max-h-[92vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <div>
            <h3 className="font-semibold text-gray-800">Generar orden(es) de compra — {licitacion.codigo}</h3>
            <p className="text-xs text-gray-400 mt-0.5">Una OC por proveedor ganador. Precios unitarios sin IGV.</p>
          </div>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl leading-none">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {grupos.length === 0 && (
            <p className="text-sm text-gray-500 text-center py-6">Elige al menos un ganador en el cuadro comparativo.</p>
          )}
          {sinGanador.length > 0 && grupos.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-lg px-4 py-3">
              {sinGanador.length} ítem{sinGanador.length !== 1 ? "s" : ""} sin ganador volverá{sinGanador.length !== 1 ? "n" : ""} a Por procesar: {sinGanador.map((i) => i.descripcion).join(" · ")}
            </div>
          )}

          {grupos.map((g, idx) => {
            const totales = totalesOCP(g.items, g.afectoIgv);
            return (
              <div key={g.proveedorId} className="border border-gray-200 rounded-xl p-4 space-y-3">
                <p className="font-semibold text-gray-800">{g.razonSocial}</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <label className="text-xs text-gray-500">Moneda
                    <select value={g.moneda} onChange={(e) => setGrupo(idx, "moneda", e.target.value)} className={`${INP} w-full mt-1`}>
                      <option value="PEN">Soles (S/)</option>
                      <option value="USD">Dólares (US$)</option>
                    </select>
                  </label>
                  <label className="text-xs text-gray-500">Forma de pago
                    <div className="mt-1">
                      <SelectFormaPago name="formaPago" value={g.formaPago} onChange={(e) => setGrupo(idx, "formaPago", e.target.value)} className={`${INP} w-full`} />
                    </div>
                  </label>
                  <label className="text-xs text-gray-500">Lugar de entrega
                    <input value={g.lugarEntrega} onChange={(e) => setGrupo(idx, "lugarEntrega", e.target.value)} className={`${INP} w-full mt-1`} />
                  </label>
                  <label className="text-xs text-gray-500">Fecha de entrega
                    <input type="date" value={g.fechaEntrega} onChange={(e) => setGrupo(idx, "fechaEntrega", e.target.value)} className={`${INP} w-full mt-1`} />
                  </label>
                </div>
                <label className="flex items-center gap-2 text-xs text-gray-600">
                  <input type="checkbox" checked={g.afectoIgv} onChange={(e) => setGrupo(idx, "afectoIgv", e.target.checked)} />
                  Afecto a IGV (desmarcar para recibo por honorarios u operación no gravada)
                </label>

                <table className="w-full text-sm">
                  <thead className="text-[11px] uppercase text-gray-400 border-b">
                    <tr>
                      <th className="text-left py-1">Descripción</th>
                      <th className="text-left py-1">Und.</th>
                      <th className="text-right py-1">Cant.</th>
                      <th className="text-right py-1">P. unit.</th>
                      <th className="text-right py-1">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.items.map((it) => (
                      <tr key={it.itemId} className="border-b border-gray-50">
                        <td className="py-1.5 pr-2">{it.descripcion}</td>
                        <td className="py-1.5 text-xs text-gray-500">{it.unidad}</td>
                        <td className="py-1.5 text-right">
                          <input type="number" min="0.01" step="any" value={it.cantidad} onChange={(e) => setItem(idx, it.itemId, "cantidad", e.target.value)} className={`${INP} w-20 text-right`} />
                        </td>
                        <td className="py-1.5 text-right">
                          <input type="number" min="0" step="any" value={it.precioUnitario} onChange={(e) => setItem(idx, it.itemId, "precioUnitario", e.target.value)} className={`${INP} w-24 text-right`} />
                        </td>
                        <td className="py-1.5 text-right">{money(Number(it.cantidad || 0) * Number(it.precioUnitario || 0), g.moneda)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="flex justify-end">
                  <dl className="text-sm grid grid-cols-2 gap-x-6 gap-y-0.5">
                    <dt className="text-gray-500">Subtotal</dt><dd className="text-right">{money(totales.subtotal, g.moneda)}</dd>
                    <dt className="text-gray-500">{g.afectoIgv ? "IGV 18%" : "No afecto"}</dt><dd className="text-right">{money(totales.igv, g.moneda)}</dd>
                    <dt className="font-semibold">Total</dt><dd className="text-right font-semibold">{money(totales.total, g.moneda)}</dd>
                  </dl>
                </div>
                <label className="text-xs text-gray-500 block">Observaciones
                  <textarea rows={2} value={g.observaciones} onChange={(e) => setGrupo(idx, "observaciones", e.target.value)} className={`${INP} w-full mt-1`} />
                </label>
              </div>
            );
          })}

          {exito && <div className="bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg px-4 py-3">{exito}</div>}
          {error && <p className="text-sm text-red-500">{error}</p>}
        </div>

        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100 shrink-0">
          <button type="button" onClick={onClose} disabled={generando || !!exito}
            className="text-sm border border-gray-300 px-4 py-2 rounded-lg hover:bg-gray-50 transition disabled:opacity-50">Cancelar</button>
          {grupos.length > 0 && (
            <button type="button" onClick={generar} disabled={generando || !!exito}
              className="text-sm bg-purple-600 text-white px-5 py-2 rounded-lg hover:bg-purple-700 disabled:opacity-50 transition font-medium">
              {generando ? "Generando…" : `Generar ${grupos.length} OC y descargar PDF`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
