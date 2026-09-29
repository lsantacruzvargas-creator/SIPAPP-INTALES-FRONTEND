import { useState, useEffect } from "react";
import { fetchAuth } from "../../utils/fetchAuth";
import { proveedorMasBarato, money } from "../../utils/compras";
import { exportarSolicitudCotizacionPdf } from "../../utils/compraPdf";
import ModalEnviarProveedores from "./ModalEnviarProveedores";
import ArchivosProveedor from "./ArchivosProveedor";
import ModalGenerarOCP from "./ModalGenerarOCP";
import useBloqueoEdicion from "../../hooks/useBloqueoEdicion";
import BarraEdicion from "../BarraEdicion";

const INP = "border border-gray-200 rounded-md px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-purple-300";

// Borrador editable: precios y cantidades como string para no pisar lo que
// el usuario está tipeando ("12." → 12).
function borradorDesde(lic) {
  return {
    items: Object.fromEntries(lic.items.map((i) => [i._id, {
      descripcion: i.descripcion, cantidad: String(i.cantidad), ganador: i.ganador ? String(i.ganador) : "",
    }])),
    proveedores: Object.fromEntries(lic.proveedores.map((p) => [p._id, {
      moneda: p.moneda,
      observaciones: p.observaciones || "",
      precios: Object.fromEntries(p.precios.map((x) => [String(x.itemId), String(x.precioUnitario)])),
    }])),
  };
}

export default function ModalCuadroComparativo({ licitacionId, catalogos, onClose, onAdjudicado }) {
  const [lic, setLic] = useState(null);
  const [borrador, setBorrador] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [invitarAbierto, setInvitarAbierto] = useState(false);
  const [generarAbierto, setGenerarAbierto] = useState(false);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const bloqueo = useBloqueoEdicion("licitacion", licitacionId, lic?.updatedAt);

  const aplicar = (l) => { setLic(l); setBorrador(borradorDesde(l)); };

  useEffect(() => {
    fetchAuth(`/licitaciones/${licitacionId}`).then(async (r) => {
      if (!r.ok) return;
      const l = await r.json();
      setLic(l);
      setBorrador(borradorDesde(l));
    });
  }, [licitacionId]);

  if (!lic || !borrador) {
    return (
      <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40">
        <p className="bg-white rounded-xl px-6 py-4 text-sm text-gray-500">Cargando cuadro comparativo…</p>
      </div>
    );
  }

  const setItem = (id, campo, valor) => setBorrador((b) => ({ ...b, items: { ...b.items, [id]: { ...b.items[id], [campo]: valor } } }));
  const setProv = (id, campo, valor) => setBorrador((b) => ({ ...b, proveedores: { ...b.proveedores, [id]: { ...b.proveedores[id], [campo]: valor } } }));
  const setPrecio = (provId, itemId, valor) => setBorrador((b) => ({
    ...b,
    proveedores: { ...b.proveedores, [provId]: { ...b.proveedores[provId], precios: { ...b.proveedores[provId].precios, [itemId]: valor } } },
  }));

  const guardar = async () => {
    setGuardando(true);
    setError("");
    setAviso("");
    const body = {
      items: lic.items.map((i) => ({
        _id: i._id,
        descripcion: borrador.items[i._id].descripcion,
        cantidad: Number(borrador.items[i._id].cantidad),
        ganador: borrador.items[i._id].ganador || null,
      })),
      proveedores: lic.proveedores.map((p) => ({
        _id: p._id,
        moneda: borrador.proveedores[p._id].moneda,
        observaciones: borrador.proveedores[p._id].observaciones,
        precios: Object.entries(borrador.proveedores[p._id].precios).map(([itemId, precioUnitario]) => ({ itemId, precioUnitario })),
      })),
    };
    const r = await bloqueo.fetch(`/licitaciones/${lic._id}`, { method: "PUT", body: JSON.stringify(body) });
    setGuardando(false);
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      setError(d.mensaje || "No se pudo guardar el cuadro.");
      return null;
    }
    const actualizada = await r.json();
    aplicar(actualizada);
    setAviso("Cuadro guardado.");
    return actualizada;
  };

  const invitar = async () => {
    if (await guardar()) setInvitarAbierto(true);
  };

  // Se guarda primero: el modal de OCs parte de los ganadores y precios persistidos.
  const abrirGenerar = async () => {
    if (await guardar()) setGenerarAbierto(true);
  };

  const comparables = lic.proveedores.map((p) => ({
    _id: p._id,
    moneda: borrador.proveedores[p._id].moneda,
    precios: Object.entries(borrador.proveedores[p._id].precios)
      .filter(([, v]) => v !== "")
      .map(([itemId, v]) => ({ itemId, precioUnitario: Number(v) })),
  }));

  const totalProveedor = (p) => lic.items.reduce((s, i) => {
    const v = borrador.proveedores[p._id].precios[i._id];
    return v === undefined || v === "" ? s : s + Number(v) * Number(borrador.items[i._id].cantidad || 0);
  }, 0);

  return (
    <div className="fixed inset-0 z-[70] flex bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full h-full flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <div>
            <h3 className="font-semibold text-gray-800">Cuadro comparativo — {lic.codigo}</h3>
            <p className="text-xs text-gray-400 mt-0.5">
              Precios unitarios sin IGV. El más barato de cada fila se resalta (USD convertido a S/ con TC {catalogos.tipoCambio} solo para comparar).
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl leading-none">✕</button>
        </div>

        <div className="flex-1 overflow-auto p-4">
          <fieldset disabled={!bloqueo.editando} className="min-w-0">
          <table className="text-sm border-collapse">
            <thead>
              <tr className="align-top">
                <th className="px-2 py-2 text-left text-xs text-gray-500 border-b">#</th>
                <th className="px-2 py-2 text-left text-xs text-gray-500 border-b">SC</th>
                <th className="px-2 py-2 text-left text-xs text-gray-500 border-b min-w-[240px]">Descripción</th>
                <th className="px-2 py-2 text-left text-xs text-gray-500 border-b">Cant.</th>
                <th className="px-2 py-2 text-left text-xs text-gray-500 border-b">Und.</th>
                {lic.proveedores.map((p) => (
                  <th key={p._id} className="px-3 py-2 text-left border-b border-l min-w-[200px] font-normal">
                    <p className="text-xs font-semibold text-gray-800">{p.empresa?.razonSocial || p.razonSocial}</p>
                    <p className="text-[11px] text-gray-400">RUC {p.empresa?.ruc || p.ruc || "—"}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <select value={borrador.proveedores[p._id].moneda} onChange={(e) => setProv(p._id, "moneda", e.target.value)} className={INP}>
                        <option value="PEN">S/</option>
                        <option value="USD">US$</option>
                      </select>
                      {/* Enlace: descargar el PDF es solo lectura y el fieldset del cuadro no debe bloquearlo. */}
                      <a href="#" role="button" onClick={(e) => { e.preventDefault(); exportarSolicitudCotizacionPdf(lic, p); }} className="text-[11px] text-purple-600 hover:underline">PDF</a>
                    </div>
                    <div className="mt-1">
                      <ArchivosProveedor licitacionId={lic._id} proveedor={p} puedeSubir={bloqueo.editando} puedeBorrar={bloqueo.editando} onCambio={setLic} bloqueo={bloqueo} />
                    </div>
                  </th>
                ))}
                <th className="px-2 py-2 text-left text-xs text-gray-500 border-b border-l">Sin adjudicar</th>
              </tr>
            </thead>
            <tbody>
              {lic.items.map((item, idx) => {
                const b = borrador.items[item._id];
                const masBarato = proveedorMasBarato(comparables, item._id, catalogos.tipoCambio);
                return (
                  <tr key={item._id} className="border-b border-gray-100 align-top">
                    <td className="px-2 py-2 text-xs text-gray-400">{idx + 1}</td>
                    <td className="px-2 py-2 font-mono text-xs text-gray-500">{item.scCodigo}</td>
                    <td className="px-2 py-2">
                      <input value={b.descripcion} onChange={(e) => setItem(item._id, "descripcion", e.target.value)} className={`${INP} w-full`} />
                    </td>
                    <td className="px-2 py-2">
                      <input type="number" min="0.01" step="any" value={b.cantidad} onChange={(e) => setItem(item._id, "cantidad", e.target.value)} className={`${INP} w-20`} />
                    </td>
                    <td className="px-2 py-2 text-xs text-gray-500">{item.unidad}</td>
                    {lic.proveedores.map((p) => (
                      <td key={p._id} className={`px-3 py-2 border-l ${masBarato === String(p._id) ? "bg-green-50" : ""}`}>
                        <div className="flex items-center gap-2">
                          <input type="radio" name={`ganador-${item._id}`} checked={b.ganador === String(p._id)}
                            onChange={() => setItem(item._id, "ganador", String(p._id))} title="Elegir como ganador" />
                          <input type="number" min="0" step="any" placeholder="—"
                            value={borrador.proveedores[p._id].precios[item._id] ?? ""}
                            onChange={(e) => setPrecio(p._id, item._id, e.target.value)} className={`${INP} w-24 text-right`} />
                        </div>
                      </td>
                    ))}
                    <td className="px-2 py-2 border-l text-center">
                      <input type="radio" name={`ganador-${item._id}`} checked={b.ganador === ""} onChange={() => setItem(item._id, "ganador", "")} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="align-top">
                <td colSpan={5} className="px-2 py-2 text-xs font-semibold text-gray-600 text-right">Total sin IGV</td>
                {lic.proveedores.map((p) => (
                  <td key={p._id} className="px-3 py-2 border-l text-sm font-semibold text-gray-800">
                    {money(totalProveedor(p), borrador.proveedores[p._id].moneda)}
                  </td>
                ))}
                <td className="border-l" />
              </tr>
              <tr className="align-top">
                <td colSpan={5} className="px-2 py-2 text-xs text-gray-500 text-right">Observaciones (plazo, condiciones)</td>
                {lic.proveedores.map((p) => (
                  <td key={p._id} className="px-3 py-2 border-l">
                    <textarea rows={2} value={borrador.proveedores[p._id].observaciones}
                      onChange={(e) => setProv(p._id, "observaciones", e.target.value)} className={`${INP} w-full`} />
                  </td>
                ))}
                <td className="border-l" />
              </tr>
            </tfoot>
          </table>
          </fieldset>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-3 px-6 py-4 border-t border-gray-100 shrink-0">
          <BarraEdicion bloqueo={bloqueo} onCancelar={onClose} className="mr-auto" />
          {error && <p className="text-sm text-red-500 mr-auto">{error}</p>}
          {aviso && !error && <p className="text-sm text-green-600 mr-auto">{aviso}</p>}
          <button type="button" onClick={invitar} disabled={guardando || !bloqueo.editando}
            className="text-sm border border-gray-300 px-4 py-2 rounded-lg hover:bg-gray-50 transition disabled:opacity-50">+ Invitar proveedor</button>
          <button type="button" onClick={guardar} disabled={guardando || !bloqueo.editando}
            className="text-sm bg-gray-900 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition disabled:opacity-50">
            {guardando ? "Guardando…" : "Guardar cuadro"}
          </button>
          <button type="button" onClick={abrirGenerar} disabled={guardando || !bloqueo.editando}
            className="text-sm bg-purple-600 text-white px-5 py-2 rounded-lg hover:bg-purple-700 transition disabled:opacity-50 font-medium">
            Generar OC(s)
          </button>
        </div>
      </div>

      {invitarAbierto && (
        <ModalEnviarProveedores licitacion={lic} bloqueo={bloqueo} proveedores={catalogos.proveedores}
          onClose={() => setInvitarAbierto(false)}
          onEnviado={(nueva) => { setInvitarAbierto(false); aplicar(nueva); }} />
      )}
      {generarAbierto && (
        <ModalGenerarOCP licitacion={lic} bloqueo={bloqueo} onClose={() => setGenerarAbierto(false)}
          onGenerado={(ocps) => { setGenerarAbierto(false); onAdjudicado(ocps); }} />
      )}
    </div>
  );
}
