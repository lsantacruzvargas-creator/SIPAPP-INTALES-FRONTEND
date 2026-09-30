import { useState, useEffect, useCallback } from "react";
import { fetchAuth } from "../../utils/fetchAuth";
import { formatearFecha, fechaHoyLima } from "../../utils/fecha";
import { money } from "../../utils/compras";
import { FILTROS_TESORERIA, filtrarFacturas, semaforo, etiquetaImpuesto } from "../../utils/tesoreria";
import { sumarPorMoneda, textoMontos, exportarHoja, filasSubtotal } from "../../utils/exportarTabla";
import TablaScroll from "../TablaScroll";
import PromptAccion from "../PromptAccion";
import ModalMovimiento from "./ModalMovimiento";
import { conBloqueo } from "../../utils/bloqueoApi";

const INP = "border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300";
const fecha = (d) => (d ? formatearFecha(d, { day: "2-digit", month: "2-digit", year: "numeric" }) : "—");
const COLOR_VENC = { vencida: "text-red-600 font-semibold", por_vencer: "text-amber-600", al_dia: "text-gray-600" };
const Check = ({ ok, visible = true }) => (visible ? <span className={ok ? "text-emerald-600" : "text-gray-300"}>{ok ? "☑" : "☐"}</span> : <span className="text-gray-300">—</span>);

export default function TablaPorPagar({ recarga, onRegistrarFactura }) {
  const [datos, setDatos] = useState({ ocps: [], facturas: [] });
  const [vista, setVista] = useState("oc");
  const [filtros, setFiltros] = useState(FILTROS_TESORERIA);
  const [pagando, setPagando] = useState(null);
  const [anulando, setAnulando] = useState(null);
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState("");
  const hoyIso = fechaHoyLima();

  const cargar = useCallback(() => fetchAuth("/tesoreria/por-pagar").then(async (r) => {
    if (r.ok) setDatos(await r.json());
  }), []);
  useEffect(() => { cargar(); }, [cargar, recarga]);

  const set = (campo) => (e) => setFiltros((f) => ({ ...f, [campo]: e.target.value }));
  const facturas = filtrarFacturas(datos.facturas, filtros, { lado: "compra", hoyIso });
  const ocps = datos.ocps.filter((o) => !filtros.tercero || `${o.proveedorRazonSocial} ${o.proveedorRuc}`.toLowerCase().includes(filtros.tercero.toLowerCase()));

  const monedaOc = (o) => o.moneda;
  const subOc = {
    total: sumarPorMoneda(ocps, (o) => o.total, monedaOc),
    facturado: sumarPorMoneda(ocps, (o) => o.montoFacturado, monedaOc),
    porFacturar: sumarPorMoneda(ocps, (o) => o.saldoPorFacturar, monedaOc),
    saldoNeto: sumarPorMoneda(ocps, (o) => o.saldoNeto, monedaOc),
    saldoImpuesto: sumarPorMoneda(ocps, (o) => o.saldoImpuesto),
  };
  const monedaFp = (f) => f.moneda;
  const hayImpFp = (f) => f.impuesto?.tipo !== "ninguno";
  const subFp = {
    total: sumarPorMoneda(facturas, (f) => f.total, monedaFp),
    impuesto: sumarPorMoneda(facturas.filter(hayImpFp), (f) => f.impuesto.monto),
    neto: sumarPorMoneda(facturas, (f) => f.netoAPagar, monedaFp),
    saldoNeto: sumarPorMoneda(facturas, (f) => f.saldoNeto, monedaFp),
    saldoImpuesto: sumarPorMoneda(facturas, (f) => f.saldoImpuesto),
  };
  const exportarExcel = () => (vista === "oc"
    ? exportarHoja("por-pagar-oc.xlsx", "Por OC", ocps.map((o) => ({
      OC: o.codigo, FECHA: fecha(o.fecha), PROVEEDOR: o.proveedorRazonSocial, MONEDA: o.moneda, TOTAL: o.total,
      FACTURADO: o.montoFacturado || 0, "POR FACTURAR": o.saldoPorFacturar, "SALDO NETO": o.saldoNeto,
      "SALDO IMPUESTO": o.saldoImpuesto, "PRÓX. VENCIMIENTO": fecha(o.proximoVencimiento),
    })), filasSubtotal("OC", { TOTAL: subOc.total, FACTURADO: subOc.facturado, "POR FACTURAR": subOc.porFacturar, "SALDO NETO": subOc.saldoNeto, "SALDO IMPUESTO": subOc.saldoImpuesto }))
    : exportarHoja("por-pagar-facturas.xlsx", "Por factura", facturas.map((f) => ({
      FP: f.codigo, COMPROBANTE: `${f.serie}-${f.numero}`, PROVEEDOR: f.proveedorRazonSocial,
      OC: f.ordenCompraProveedor?.codigo || "", "EMISIÓN": fecha(f.fechaEmision), VENCE: fecha(f.fechaVencimiento),
      MONEDA: f.moneda, TOTAL: f.total, IMPUESTO: hayImpFp(f) ? f.impuesto.monto : 0, NETO: f.netoAPagar,
      "SALDO NETO": f.saldoNeto, "SALDO IMPUESTO": f.saldoImpuesto,
    })), filasSubtotal("FP", { TOTAL: subFp.total, IMPUESTO: subFp.impuesto, NETO: subFp.neto, "SALDO NETO": subFp.saldoNeto, "SALDO IMPUESTO": subFp.saldoImpuesto })));

  const anular = async (motivo) => {
    setProcesando(true);
    setError("");
    try {
      const r = await conBloqueo("facturaProveedor", anulando._id, (h) => fetchAuth(`/facturas-proveedor/${anulando._id}/anular`, { headers: h, method: "PATCH", body: JSON.stringify({ motivo }) }));
      if (r.ok) await cargar();
      else setError((await r.json().catch(() => ({}))).mensaje || "No se pudo anular la factura.");
    } catch {
      setError("Error de conexión con el servidor, intenta de nuevo.");
    } finally {
      setProcesando(false);
      setAnulando(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-center">
        <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm">
          {[["oc", "Por OC"], ["factura", "Por factura"]].map(([v, l]) => (
            <button key={v} onClick={() => setVista(v)} className={`px-3 py-2 ${vista === v ? "bg-purple-600 text-white" : "text-gray-600"}`}>{l}</button>
          ))}
        </div>
        <input value={filtros.tercero} onChange={set("tercero")} placeholder="Proveedor o RUC" className={INP} />
        {vista === "factura" && (
          <>
            <select value={filtros.estado} onChange={set("estado")} className={INP}>
              <option value="">Todo estado</option><option value="pendiente">Pendiente</option><option value="parcial">Parcial</option><option value="pagada">Pagada</option>
            </select>
            <select value={filtros.vencimiento} onChange={set("vencimiento")} className={INP}>
              <option value="">Todo vencimiento</option><option value="vencida">Vencidas</option><option value="por_vencer">Por vencer (≤ 7 días)</option>
            </select>
            <input type="date" value={filtros.desde} onChange={set("desde")} className={INP} />
            <input type="date" value={filtros.hasta} onChange={set("hasta")} className={INP} />
          </>
        )}
        <button onClick={exportarExcel} className="border border-gray-300 text-gray-600 px-4 py-2 rounded-lg text-sm hover:bg-gray-50" style={{ marginLeft: "auto" }}>Exportar Excel</button>
        <button onClick={() => onRegistrarFactura({})} className="bg-purple-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-purple-700">+ Factura sin OC</button>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <TablaScroll className="overflow-x-auto">
          {vista === "oc" ? (
            <table className="w-full text-sm" style={{ minWidth: "1000px" }}>
              <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                <tr>{["OC", "Fecha", "Proveedor", "Total", "Facturado", "Por facturar", "Saldo neto", "Saldo impuesto", "Próx. vencimiento", ""].map((h) => <th key={h} className="px-3 py-2 text-left">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {ocps.length === 0 && <tr><td colSpan={10} className="px-3 py-8 text-center text-gray-400">Sin órdenes de compra vigentes</td></tr>}
                {ocps.map((o) => {
                  const sem = semaforo(o.proximoVencimiento, o.saldoNeto + o.saldoImpuesto > 0.009, hoyIso);
                  return (
                    <tr key={o._id}>
                      <td className="px-3 py-2 font-medium">{o.codigo}</td>
                      <td className="px-3 py-2">{fecha(o.fecha)}</td>
                      <td className="px-3 py-2">{o.proveedorRazonSocial}</td>
                      <td className="px-3 py-2 tabular-nums">{money(o.total, o.moneda)}</td>
                      <td className="px-3 py-2 tabular-nums">{money(o.montoFacturado || 0, o.moneda)}</td>
                      <td className="px-3 py-2 tabular-nums">{money(o.saldoPorFacturar, o.moneda)}</td>
                      <td className="px-3 py-2 tabular-nums">{money(o.saldoNeto, o.moneda)}</td>
                      <td className="px-3 py-2 tabular-nums">{money(o.saldoImpuesto)}</td>
                      <td className={`px-3 py-2 ${COLOR_VENC[sem] || "text-gray-400"}`}>{fecha(o.proximoVencimiento)}</td>
                      <td className="px-3 py-2 text-right">
                        {o.saldoPorFacturar > 0.1 && <button onClick={() => onRegistrarFactura({ ocpId: o._id })} className="text-xs text-purple-600 hover:text-purple-800">+ Registrar factura</button>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {ocps.length > 0 && (
                <tfoot className="bg-gray-50 font-semibold text-gray-700">
                  <tr>
                    <td colSpan={3} className="px-3 py-2">Subtotal ({ocps.length} OC)</td>
                    <td className="px-3 py-2 tabular-nums">{textoMontos(subOc.total)}</td>
                    <td className="px-3 py-2 tabular-nums">{textoMontos(subOc.facturado)}</td>
                    <td className="px-3 py-2 tabular-nums">{textoMontos(subOc.porFacturar)}</td>
                    <td className="px-3 py-2 tabular-nums">{textoMontos(subOc.saldoNeto)}</td>
                    <td className="px-3 py-2 tabular-nums">{textoMontos(subOc.saldoImpuesto)}</td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              )}
            </table>
          ) : (
            <table className="w-full text-sm" style={{ minWidth: "1200px" }}>
              <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                <tr>{["FP", "Comprobante", "Proveedor", "OC", "Emisión", "Vence", "Total", "Impuesto", "☐ Imp.", "Neto", "☐ Neto", "Saldo", ""].map((h) => <th key={h} className="px-3 py-2 text-left">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {facturas.length === 0 && <tr><td colSpan={13} className="px-3 py-8 text-center text-gray-400">Sin facturas</td></tr>}
                {facturas.map((f) => {
                  const pendiente = f.saldoNeto > 0.009 || f.saldoImpuesto > 0.009;
                  const sem = semaforo(f.fechaVencimiento, pendiente, hoyIso);
                  const hayImpuesto = f.impuesto?.tipo !== "ninguno" && f.impuesto?.quienDeposita !== "proveedor";
                  return (
                    <tr key={f._id}>
                      <td className="px-3 py-2 font-medium">{f.codigo}</td>
                      <td className="px-3 py-2">{f.serie}-{f.numero}</td>
                      <td className="px-3 py-2">{f.proveedorRazonSocial}</td>
                      <td className="px-3 py-2">{f.ordenCompraProveedor?.codigo || (f.esFleteDe ? `Flete ${f.esFleteDe.codigo || ""}` : "—")}</td>
                      <td className="px-3 py-2">{fecha(f.fechaEmision)}</td>
                      <td className={`px-3 py-2 ${COLOR_VENC[sem] || "text-gray-400"}`}>{fecha(f.fechaVencimiento)}</td>
                      <td className="px-3 py-2 tabular-nums">{money(f.total, f.moneda)}</td>
                      <td className="px-3 py-2 text-xs">{f.impuesto?.tipo === "ninguno" ? "—" : `${etiquetaImpuesto(f.impuesto)} ${money(f.impuesto.monto)}${f.impuesto.quienDeposita === "proveedor" ? " (proveedor)" : ""}`}</td>
                      <td className="px-3 py-2 text-center"><Check ok={f.saldoImpuesto <= 0.009} visible={hayImpuesto} /></td>
                      <td className="px-3 py-2 tabular-nums">{money(f.netoAPagar, f.moneda)}</td>
                      <td className="px-3 py-2 text-center"><Check ok={f.saldoNeto <= 0.009} /></td>
                      <td className="px-3 py-2 tabular-nums">{money(f.saldoNeto, f.moneda)}{f.saldoImpuesto > 0.009 ? ` + ${money(f.saldoImpuesto)}` : ""}</td>
                      <td className="px-3 py-2 text-right whitespace-nowrap space-x-2">
                        {pendiente && <button onClick={() => setPagando(f)} className="text-xs text-purple-600 hover:text-purple-800">Registrar pago</button>}
                        {f.pagadoNeto + f.pagadoImpuesto === 0 && <button onClick={() => setAnulando(f)} className="text-xs text-red-500 hover:text-red-700">Anular</button>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {facturas.length > 0 && (
                <tfoot className="bg-gray-50 font-semibold text-gray-700">
                  <tr>
                    <td colSpan={6} className="px-3 py-2">Subtotal ({facturas.length} facturas)</td>
                    <td className="px-3 py-2 tabular-nums">{textoMontos(subFp.total)}</td>
                    <td className="px-3 py-2 text-xs tabular-nums">{textoMontos(subFp.impuesto)}</td>
                    <td />
                    <td className="px-3 py-2 tabular-nums">{textoMontos(subFp.neto)}</td>
                    <td />
                    <td className="px-3 py-2 tabular-nums">{textoMontos(sumarPorMoneda(facturas, (f) => (f.saldoNeto || 0), monedaFp))}{subFp.saldoImpuesto.PEN ? ` + ${textoMontos(subFp.saldoImpuesto)}` : ""}</td>
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
          )}
        </TablaScroll>
      </div>

      {pagando && <ModalMovimiento lado="compra" documento={pagando} onClose={() => setPagando(null)} onGuardado={() => { setPagando(null); cargar(); }} />}
      {anulando && (
        <PromptAccion titulo={`Anular ${anulando.codigo}`} placeholder="Motivo de la anulación"
          onCancelar={() => setAnulando(null)} onConfirmar={anular} procesando={procesando} textoConfirmar="Anular" />
      )}
    </div>
  );
}
