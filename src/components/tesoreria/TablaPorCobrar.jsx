import { useState, useEffect, useCallback } from "react";
import { fetchAuth } from "../../utils/fetchAuth";
import { formatearFecha, fechaHoyLima } from "../../utils/fecha";
import { money } from "../../utils/compras";
import { FILTROS_TESORERIA, filtrarFacturas, semaforo, vencimientoDe, etiquetaImpuesto } from "../../utils/tesoreria";
import { sumarPorMoneda, textoMontos, exportarHoja, filasSubtotal } from "../../utils/exportarTabla";
import TablaScroll from "../TablaScroll";
import ModalMovimiento from "./ModalMovimiento";
import ModalImpuestoVenta from "./ModalImpuestoVenta";

const INP = "border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300";
const fecha = (d) => (d ? formatearFecha(d, { day: "2-digit", month: "2-digit", year: "numeric" }) : "—");
const COLOR_VENC = { vencida: "text-red-600 font-semibold", por_vencer: "text-amber-600", al_dia: "text-gray-600" };
const Check = ({ ok, visible = true }) => (visible ? <span className={ok ? "text-emerald-600" : "text-gray-300"}>{ok ? "☑" : "☐"}</span> : <span className="text-gray-300">—</span>);

export default function TablaPorCobrar() {
  const [facturas, setFacturas] = useState([]);
  const [filtros, setFiltros] = useState(FILTROS_TESORERIA);
  const [cobrando, setCobrando] = useState(null);
  const [editandoImpuesto, setEditandoImpuesto] = useState(null);
  const hoyIso = fechaHoyLima();

  const cargar = useCallback(() => fetchAuth("/tesoreria/por-cobrar").then(async (r) => {
    if (r.ok) setFacturas(await r.json());
  }), []);
  useEffect(() => { cargar(); }, [cargar]);

  const set = (campo) => (e) => setFiltros((f) => ({ ...f, [campo]: e.target.value }));
  const filtradas = filtrarFacturas(facturas, filtros, { lado: "venta", hoyIso });

  const hayImp = (f) => f.impuesto?.tipo && f.impuesto.tipo !== "ninguno";
  const sub = {
    total: sumarPorMoneda(filtradas, (f) => f.total),
    impuesto: sumarPorMoneda(filtradas.filter(hayImp), (f) => f.impuesto.monto),
    neto: sumarPorMoneda(filtradas, (f) => f.totalAPagar),
    saldo: sumarPorMoneda(filtradas, (f) => (f.saldoNeto || 0) + (f.saldoImpuesto || 0)),
  };
  const exportarExcel = () => exportarHoja("por-cobrar.xlsx", "Por cobrar", filtradas.map((f) => ({
    FACTURA: f.numeroFactura || f.codigo, CLIENTE: f.empresa?.razonSocial || "", "EMISIÓN": fecha(f.fechaEmision),
    VENCE: fecha(vencimientoDe(f, "venta")), TOTAL: f.total, IMPUESTO: hayImp(f) ? f.impuesto.monto : 0,
    NETO: f.totalAPagar, "SALDO NETO": f.saldoNeto, "SALDO IMPUESTO": f.saldoImpuesto,
  })), filasSubtotal("FACTURA", { TOTAL: sub.total, IMPUESTO: sub.impuesto, NETO: sub.neto, "SALDO NETO": sumarPorMoneda(filtradas, (f) => f.saldoNeto), "SALDO IMPUESTO": sumarPorMoneda(filtradas, (f) => f.saldoImpuesto) }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-center">
        <input value={filtros.tercero} onChange={set("tercero")} placeholder="Cliente o RUC" className={INP} />
        <select value={filtros.estado} onChange={set("estado")} className={INP}>
          <option value="">Todo estado</option><option value="pendiente">Sin cobro</option><option value="parcial">Parcial</option><option value="pagada">Cobrada</option>
        </select>
        <select value={filtros.vencimiento} onChange={set("vencimiento")} className={INP}>
          <option value="">Todo vencimiento</option><option value="vencida">Vencidas</option><option value="por_vencer">Por vencer (≤ 7 días)</option>
        </select>
        <input type="date" value={filtros.desde} onChange={set("desde")} className={INP} />
        <input type="date" value={filtros.hasta} onChange={set("hasta")} className={INP} />
        <button onClick={exportarExcel} className="border border-gray-300 text-gray-600 px-4 py-2 rounded-lg text-sm hover:bg-gray-50" style={{ marginLeft: "auto" }}>Exportar Excel</button>
      </div>
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <TablaScroll className="overflow-x-auto">
          <table className="w-full text-sm" style={{ minWidth: "1200px" }}>
            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
              <tr>{["Factura", "Cliente", "Emisión", "Vence", "Cuotas", "Total", "Impuesto", "☐ Imp.", "Neto", "☐ Neto", "Saldo", ""].map((h) => <th key={h} className="px-3 py-2 text-left">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtradas.length === 0 && <tr><td colSpan={12} className="px-3 py-8 text-center text-gray-400">Sin facturas</td></tr>}
              {filtradas.map((f) => {
                const pendiente = f.saldoNeto > 0.009 || f.saldoImpuesto > 0.009;
                const venc = vencimientoDe(f, "venta");
                const sem = semaforo(venc, pendiente, hoyIso);
                const hayImpuesto = f.impuesto?.tipo && f.impuesto.tipo !== "ninguno";
                const sinCobros = (f.pagadoNeto || 0) + (f.pagadoImpuesto || 0) === 0;
                return (
                  <tr key={f._id}>
                    <td className="px-3 py-2 font-medium">{f.numeroFactura || f.codigo}</td>
                    <td className="px-3 py-2">{f.empresa?.razonSocial || "—"}</td>
                    <td className="px-3 py-2">{fecha(f.fechaEmision)}</td>
                    <td className={`px-3 py-2 ${COLOR_VENC[sem] || "text-gray-400"}`}>{fecha(venc)}</td>
                    <td className="px-3 py-2 text-xs">{f.cuotas?.length ? `${f.cuotas.filter((c) => c.pagado).length}/${f.cuotas.length}` : "—"}</td>
                    <td className="px-3 py-2 tabular-nums">{money(f.total, f.moneda)}{f.moneda === "USD" ? <span className="block text-[11px] text-gray-400">TC {Number(f.tipoCambio).toFixed(3)}</span> : null}
                      {f.aplicadoNC > 0 && <span className="block text-[11px] text-red-600" title={(f.notasCredito || []).map((n) => n.serieNumero).join(", ")}>NC aplicadas −{money(f.aplicadoNC, f.moneda)}</span>}</td>
                    <td className="px-3 py-2 text-xs">{hayImpuesto ? `${etiquetaImpuesto(f.impuesto)} ${money(f.impuesto.monto)}${f.impuesto.quienDeposita === "nosotros" ? " (nosotros)" : ""}` : "—"}</td>
                    <td className="px-3 py-2 text-center"><Check ok={f.saldoImpuesto <= 0.009} visible={hayImpuesto} /></td>
                    <td className="px-3 py-2 tabular-nums">{money(f.totalAPagar, f.moneda)}</td>
                    <td className="px-3 py-2 text-center"><Check ok={f.saldoNeto <= 0.009} /></td>
                    <td className="px-3 py-2 tabular-nums">{money(f.saldoNeto, f.moneda)}{f.saldoImpuesto > 0.009 ? ` + ${money(f.saldoImpuesto)}` : ""}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap space-x-2">
                      {pendiente && <button onClick={() => setCobrando(f)} className="text-xs text-purple-600 hover:text-purple-800">Registrar cobro</button>}
                      {sinCobros && <button onClick={() => setEditandoImpuesto(f)} className="text-xs text-gray-500 hover:text-gray-700">Impuesto</button>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {filtradas.length > 0 && (
              <tfoot className="bg-gray-50 font-semibold text-gray-700">
                <tr>
                  <td colSpan={5} className="px-3 py-2">Subtotal ({filtradas.length} facturas)</td>
                  <td className="px-3 py-2 tabular-nums">{textoMontos(sub.total)}</td>
                  <td className="px-3 py-2 text-xs tabular-nums">{textoMontos(sub.impuesto)}</td>
                  <td />
                  <td className="px-3 py-2 tabular-nums">{textoMontos(sub.neto)}</td>
                  <td />
                  <td className="px-3 py-2 tabular-nums">{textoMontos(sub.saldo)}</td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </TablaScroll>
      </div>
      {cobrando && <ModalMovimiento lado="venta" documento={cobrando} onClose={() => setCobrando(null)} onGuardado={() => { setCobrando(null); cargar(); }} />}
      {editandoImpuesto && <ModalImpuestoVenta factura={editandoImpuesto} onClose={() => setEditandoImpuesto(null)} onGuardada={() => { setEditandoImpuesto(null); cargar(); }} />}
    </div>
  );
}
