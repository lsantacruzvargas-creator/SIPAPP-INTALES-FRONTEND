import { useState, useEffect } from "react";
import { fetchAuth } from "../utils/fetchAuth";
import { conBloqueo } from "../utils/bloqueoApi";
import { avisoDeRespuesta } from "../utils/bloqueo";
import { montoAjustadoItem, subtotalPartida } from "../utils/cotizacionItems";
import { money } from "./detalleShared";

const INP    = "border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 w-full";
const INP_RO = "border border-gray-100 rounded-lg px-3 py-2 text-sm bg-gray-50 text-gray-500 w-full cursor-not-allowed";

const mensajeDe = (status, data, porDefecto) => avisoDeRespuesta(status, data)?.mensaje || data?.mensaje || porDefecto;

// Genera una OC nueva con los ítems `indices` de la cotización guardada, o los anexa a una OC existente
// como partida (una por cotización). `indices` vacío = cotización sin ítems. El monto lo fija el servidor
// con la misma fórmula (subtotalPartida); aquí solo se muestra.
export default function ModalGenerarOC({ cotizacion, indices, verPrecios = false, onClose, onCreada }) {
  const moneda = cotizacion.moneda;
  const items = cotizacion.items || [];
  const elegidos = indices.map((idx) => ({ idx, item: items[idx] })).filter((e) => e.item);
  const sinItemsLibres = items.length > 0 && elegidos.length === 0;
  const monto = subtotalPartida(cotizacion, elegidos.map((e) => e.idx));

  const [form, setForm] = useState(() => ({
    modo: "nueva",
    numeroOrden: "",
    titulo: elegidos.length === items.length
      ? cotizacion.titulo || ""
      : elegidos.map((e) => e.item.descripcion).filter(Boolean).join(" / "),
    ordenCompra: "",
  }));
  const [destinos, setDestinos] = useState(null);
  const [errorDestinos, setErrorDestinos] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  useEffect(() => {
    fetchAuth(`/ordenes-compra/destinos-anexo?cotizacion=${cotizacion._id}`)
      .then(async (r) => {
        if (r.ok) return setDestinos(await r.json());
        const data = await r.json().catch(() => ({}));
        setErrorDestinos(data.mensaje || "No se pudo cargar la lista de OC.");
        setDestinos([]);
      })
      .catch(() => { setErrorDestinos("No se pudo conectar con el servidor."); setDestinos([]); });
  }, [cotizacion._id]);

  const guardar = async () => {
    const anexar = form.modo === "anexar";
    if (sinItemsLibres) return setError("Todos los ítems de la cotización ya están en una orden de compra.");
    if (anexar && !form.ordenCompra) return setError("Elige la OC a la que se anexan los ítems.");
    if (!anexar && !form.numeroOrden.trim()) return setError("El número de orden de compra es obligatorio.");
    if (!anexar && !form.titulo.trim()) return setError("El título de la orden de compra es obligatorio.");
    setGuardando(true);
    setError("");
    const cuerpo = { cotizacion: cotizacion._id, indices: elegidos.map((e) => e.idx) };
    try {
      // Anexar escribe una OC existente: exige su bloqueo de edición (423 "En edición por …" si otro la tiene abierta).
      const res = anexar
        ? await conBloqueo("ordenCompra", form.ordenCompra, (h) => fetchAuth(`/ordenes-compra/${form.ordenCompra}/partidas`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...h },
          body: JSON.stringify(cuerpo),
        }))
        : await fetchAuth("/ordenes-compra/partidas", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...cuerpo, numeroOrden: form.numeroOrden.trim(), titulo: form.titulo.trim() }),
        });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(mensajeDe(res.status, data, "No se pudo generar la orden de compra."));
        setGuardando(false);
        return;
      }
      // `guardando` queda en true: el botón sigue deshabilitado hasta que el padre cierre el modal.
      onCreada(data);
    } catch {
      setError("Error de conexión con el servidor.");
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <h3 className="font-semibold text-gray-800">Generar Orden de Compra</h3>
          <button onClick={onClose} disabled={guardando} className="text-gray-400 hover:text-gray-700 text-xl leading-none disabled:opacity-50">✕</button>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto">
          <div className="bg-gray-50 rounded-xl p-4">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
              {cotizacion.numeroCotizacion || cotizacion.codigo}
              {items.length > 0 && ` · ${elegidos.length} de ${items.length} ítem${items.length !== 1 ? "s" : ""}`}
            </p>
            {elegidos.length > 0 ? (
              <ul className="divide-y divide-gray-200 text-sm">
                {elegidos.map(({ idx, item }) => (
                  <li key={idx} className="flex items-start justify-between gap-3 py-1.5">
                    <span className="text-gray-700"><span className="text-gray-400 mr-1.5">{idx + 1}.</span>{item.descripcion}</span>
                    {verPrecios && (
                      <span className="text-gray-600 tabular-nums whitespace-nowrap">{money(montoAjustadoItem(cotizacion, item), moneda)}</span>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-gray-600">
                {sinItemsLibres ? "Todos los ítems ya están en una orden de compra." : cotizacion.titulo}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            {[["nueva", "OC nueva"], ["anexar", "Anexar a OC existente"]].map(([valor, etiqueta]) => (
              <label key={valor}
                className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm cursor-pointer transition ${form.modo === valor ? "border-amber-400 bg-amber-50 text-amber-800 font-medium" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}>
                <input type="radio" name="modo" value={valor} checked={form.modo === valor} onChange={handleChange}
                  disabled={guardando} className="accent-amber-600" />
                {etiqueta}
              </label>
            ))}
          </div>

          {form.modo === "nueva" ? (
            <>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Número de orden de compra *</label>
                <input name="numeroOrden" value={form.numeroOrden} onChange={handleChange} className={INP} placeholder="Ej. 4500012345" />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Título *</label>
                <textarea name="titulo" value={form.titulo} onChange={handleChange} rows={2} className={INP} />
              </div>
            </>
          ) : (
            <div className="space-y-1.5">
              <p className="text-xs text-gray-500">OC vigentes y sin pagar de la misma empresa, moneda y afectación al IGV</p>
              {destinos === null && <p className="text-sm text-gray-400 py-4 text-center">Cargando…</p>}
              {errorDestinos && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{errorDestinos}</p>}
              {destinos?.length === 0 && !errorDestinos && (
                <p className="text-sm text-gray-400 py-4 text-center">No hay OC a las que se pueda anexar esta cotización.</p>
              )}
              {(destinos || []).map((d) => (
                <label key={d._id}
                  className={`flex items-start gap-3 rounded-xl border px-3 py-2.5 cursor-pointer transition ${form.ordenCompra === d._id ? "border-amber-400 bg-amber-50" : "border-gray-100 hover:bg-gray-50"}`}>
                  <input type="radio" name="ordenCompra" value={d._id} checked={form.ordenCompra === d._id} onChange={handleChange}
                    disabled={guardando} className="mt-1 accent-amber-600" />
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between gap-3">
                      <span className="font-mono text-xs text-amber-700">{d.numeroOrden || d.codigo}</span>
                      {verPrecios && <span className="text-xs text-gray-500 shrink-0 tabular-nums">{money(d.subtotal, moneda)} sin IGV</span>}
                    </div>
                    <p className="text-sm text-gray-700 truncate">{d.titulo}</p>
                    <p className="text-xs text-gray-400">
                      {d.codigo}{d.numeroDocumento != null && ` · Doc. N° ${d.numeroDocumento}`} · {d.nPartidas} partida{d.nPartidas !== 1 ? "s" : ""}
                    </p>
                  </div>
                </label>
              ))}
            </div>
          )}

          {verPrecios && (
            <div>
              <label className="text-xs text-gray-500 block mb-1">
                {form.modo === "nueva" ? "Monto sin IGV" : "Monto de los ítems que se anexan, sin IGV"} ({moneda === "USD" ? "US$" : "S/"})
              </label>
              <input value={monto.toFixed(2)} readOnly className={INP_RO} />
              <p className="text-[11px] text-gray-400 mt-1">Se calcula desde la cotización guardada (con su descuento); no se edita.</p>
            </div>
          )}

          {error && <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex gap-3 justify-end shrink-0">
          <button onClick={onClose} disabled={guardando}
            className="text-sm border border-gray-300 px-4 py-2 rounded-lg hover:bg-gray-50 transition disabled:opacity-50">
            Cancelar
          </button>
          <button onClick={guardar} disabled={guardando || sinItemsLibres}
            className="text-sm bg-amber-600 text-white px-5 py-2 rounded-lg hover:bg-amber-700 disabled:opacity-50 transition font-medium">
            {guardando ? "Generando…" : form.modo === "nueva" ? "Crear Orden de Compra" : "Anexar a la OC"}
          </button>
        </div>
      </div>
    </div>
  );
}
