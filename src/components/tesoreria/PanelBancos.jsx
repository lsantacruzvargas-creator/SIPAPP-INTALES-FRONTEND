import { useState, useEffect, useCallback, useRef } from "react";
import { fetchAuth } from "../../utils/fetchAuth";
import { formatearFecha } from "../../utils/fecha";
import { money } from "../../utils/compras";
import { textoPeriodo, descripcionMovimiento } from "../../utils/bancos";
import { puedeMovimientoManual, rolDeSesion } from "../../utils/roles";
import { exportarHoja } from "../../utils/exportarTabla";
import TablaScroll from "../TablaScroll";
import ModalMovimientoManual from "./ModalMovimientoManual";

const INP = "border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300";
const fecha = (d) => formatearFecha(d, { day: "2-digit", month: "2-digit", year: "numeric" });
const TIPO_CUENTA = { banco: "Banco", caja: "Caja", detracciones: "Detracciones" };

// Saldos por cuenta y libro de cada cuenta (libro de bancos). Los ingresos/egresos manuales y las transferencias usan
// el mismo formulario que la pestaña Movimientos.
export default function PanelBancos() {
  const manual = puedeMovimientoManual(rolDeSesion());
  const [cuentas, setCuentas] = useState([]);
  const [sel, setSel] = useState("");
  const [rango, setRango] = useState({ desde: "", hasta: "" });
  const [libro, setLibro] = useState(null);
  const [modal, setModal] = useState(null); // "manual" | "transferencia"
  const [error, setError] = useState("");

  const cargarSaldos = useCallback(() => fetchAuth("/bancos/saldos").then(async (r) => {
    if (r.ok) setCuentas(await r.json());
  }).catch(() => setError("Error de conexión con el servidor.")), []);
  // Solo cuenta la última consulta: al cambiar rápido de cuenta no se mezcla el libro de otra.
  const pedido = useRef(0);
  const cargarLibro = useCallback(() => {
    if (!sel) return Promise.resolve();
    const n = ++pedido.current;
    const qs = new URLSearchParams(Object.entries(rango).filter(([, v]) => v));
    return fetchAuth(`/bancos/cuentas/${sel}/libro?${qs}`).then(async (r) => {
      const d = await r.json().catch(() => ({}));
      if (n !== pedido.current) return;
      if (r.ok) { setLibro(d); setError(""); } else { setLibro(null); setError(d.mensaje || "No se pudo cargar el libro."); }
    }).catch(() => { if (n === pedido.current) { setLibro(null); setError("Error de conexión con el servidor."); } });
  }, [sel, rango]);
  useEffect(() => { cargarSaldos(); }, [cargarSaldos]);
  useEffect(() => { cargarLibro(); }, [cargarLibro]);

  const guardado = () => { setModal(null); cargarSaldos(); cargarLibro(); };
  const actual = cuentas.find((c) => c._id === sel);
  // Si llegó el libro de otra cuenta (no debería), no se muestra.
  const libroVisible = libro && String(libro.cuenta?._id) === String(sel) ? libro : null;
  const descripcion = descripcionMovimiento;

  const exportar = () => libroVisible && exportarHoja(`libro-${actual?.nombre || "cuenta"}.xlsx`, "Libro", [
    { "FECHA": "", "CÓDIGO": "SALDO ANTERIOR", "DESCRIPCIÓN": "", "N° OPERACIÓN": "", "ENTRADA": "", "SALIDA": "", "SALDO": libroVisible.saldoAnterior },
    ...libroVisible.movimientos.map((m) => ({
      "FECHA": fecha(m.fecha), "CÓDIGO": m.codigo, "DESCRIPCIÓN": descripcion(m), "N° OPERACIÓN": m.numeroOperacion,
      "ENTRADA": m.entrada || "", "SALIDA": m.salida || "", "SALDO": m.saldo,
    })),
  ]);

  return (
    <div className="space-y-5">
      {manual && (
        <div className="flex flex-wrap gap-2 justify-end">
          <button onClick={() => setModal("transferencia")} className="border border-purple-300 text-purple-700 px-3 py-2 rounded-lg text-sm hover:bg-purple-50">Transferencia entre cuentas</button>
          <button onClick={() => setModal("manual")} className="bg-purple-600 text-white px-3 py-2 rounded-lg text-sm hover:bg-purple-700">+ Ingreso / egreso manual</button>
        </div>
      )}
      <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        {cuentas.filter((c) => c.activo).map((c) => (
          <button key={c._id} onClick={() => { if (c._id !== sel) { setLibro(null); setSel(c._id); } }}
            className={`text-left rounded-xl border p-4 transition ${sel === c._id ? "border-purple-400 bg-purple-50" : "border-gray-200 bg-white hover:border-purple-200"}`}>
            <p className="text-xs text-gray-500">{TIPO_CUENTA[c.tipo]}{c.conciliadoHasta ? ` · conciliada a ${textoPeriodo(c.conciliadoHasta)}` : ""}</p>
            <p className="font-semibold text-gray-800">{c.nombre}</p>
            <p className={`text-lg tabular-nums ${c.saldo < 0 ? "text-red-600" : "text-gray-900"}`}>{money(c.saldo, c.moneda)}</p>
          </button>
        ))}
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {actual && libroVisible && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-3 items-center">
            <h3 className="font-semibold text-gray-700">Libro de {actual.nombre}</h3>
            <input type="date" value={rango.desde} onChange={(e) => setRango((r) => ({ ...r, desde: e.target.value }))} className={INP} />
            <input type="date" value={rango.hasta} onChange={(e) => setRango((r) => ({ ...r, hasta: e.target.value }))} className={INP} />
            <button onClick={exportar} className="ml-auto border border-gray-300 text-gray-600 px-3 py-2 rounded-lg text-sm hover:bg-gray-50">Exportar Excel</button>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <TablaScroll className="overflow-x-auto">
              <table className="w-full text-sm" style={{ minWidth: "860px" }}>
                <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                  <tr>{["Fecha", "Código", "Descripción", "N° operación", "Entrada", "Salida", "Saldo"].map((h) => <th key={h} className="px-3 py-2 text-left">{h}</th>)}</tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  <tr className="bg-gray-50/50 text-gray-500"><td colSpan={6} className="px-3 py-2">Saldo anterior</td><td className="px-3 py-2 text-right tabular-nums">{money(libroVisible.saldoAnterior, actual.moneda)}</td></tr>
                  {libroVisible.movimientos.map((m) => (
                    <tr key={m._id} className={m.saldoInicial ? "bg-emerald-50/40" : ""}>
                      <td className="px-3 py-2 whitespace-nowrap">{fecha(m.fecha)}</td>
                      <td className="px-3 py-2 font-medium">{m.codigo}</td>
                      <td className="px-3 py-2">{descripcion(m)}</td>
                      <td className="px-3 py-2">{m.numeroOperacion || "—"}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-emerald-700">{m.entrada ? money(m.entrada, actual.moneda) : ""}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-red-600">{m.salida ? money(m.salida, actual.moneda) : ""}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{money(m.saldo, actual.moneda)}</td>
                    </tr>
                  ))}
                  {!libroVisible.movimientos.length && <tr><td colSpan={7} className="px-3 py-6 text-center text-gray-400">Sin movimientos en el rango</td></tr>}
                </tbody>
                <tfoot className="bg-gray-50 font-semibold"><tr><td colSpan={6} className="px-3 py-2">Saldo final</td><td className="px-3 py-2 text-right tabular-nums">{money(libroVisible.saldoFinal, actual.moneda)}</td></tr></tfoot>
              </table>
            </TablaScroll>
          </div>
          <p className="text-[11px] text-gray-400">Los movimientos se anulan desde la pestaña Movimientos. Lo de un mes ya conciliado no se puede registrar ni anular.</p>
        </div>
      )}
      {!sel && <p className="text-sm text-gray-400">Elige una cuenta para ver su libro.</p>}
      {modal && (
        <ModalMovimientoManual modo={modal} cuentas={cuentas} onClose={() => setModal(null)} onGuardado={guardado} />
      )}
    </div>
  );
}
