import { useState, useEffect, useCallback } from "react";
import { fetchAuth } from "../../utils/fetchAuth";
import { formatearFecha, aInputFecha } from "../../utils/fecha";
import { money } from "../../utils/compras";
import { totalesMovimientos, referenciaMovimiento } from "../../utils/tesoreria";
import { puedeMovimientoManual, rolDeSesion } from "../../utils/roles";
import { sumarPorMoneda, textoMontos, exportarHoja, filasSubtotal } from "../../utils/exportarTabla";
import TablaScroll from "../TablaScroll";
import PromptAccion from "../PromptAccion";
import ModalMovimientoManual from "./ModalMovimientoManual";
import { enviarConSobregiro } from "../../utils/sobregiro";
import useConfirmar from "../../hooks/useConfirmar";

const INP = "border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300";
const fecha = (d) => formatearFecha(d, { day: "2-digit", month: "2-digit", year: "numeric" });
const TIPOS = { egreso: "Egreso", ingreso: "Ingreso", transferencia: "Transferencia", retencion: "Retención" };
const COLOR = { egreso: "text-red-600", ingreso: "text-emerald-600", transferencia: "text-blue-600", retencion: "text-amber-600" };

export default function TablaMovimientos() {
  const [movs, setMovs] = useState([]);
  const [filtros, setFiltros] = useState({ cuenta: "", desde: "", hasta: "" });
  const [anulando, setAnulando] = useState(null);
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState("");
  const [cuentas, setCuentas] = useState([]);
  const [modal, setModal] = useState(null);
  const { confirmar, dialogo } = useConfirmar("Sí, anular");
  const puedeManual = puedeMovimientoManual(rolDeSesion());

  const cargar = useCallback(() => Promise.all([fetchAuth("/movimientos-tesoreria"), fetchAuth("/cuentas-tesoreria")]).then(async ([rm, rc]) => {
    if (rm.ok) setMovs(await rm.json());
    if (rc.ok) setCuentas(await rc.json());
  }), []);
  useEffect(() => { cargar(); }, [cargar]);

  const set = (campo) => (e) => setFiltros((f) => ({ ...f, [campo]: e.target.value }));
  const filtrados = movs.filter((m) => {
    const dia = aInputFecha(m.fecha);
    return (!filtros.cuenta || m.cuenta?._id === filtros.cuenta || m.cuentaDestino?._id === filtros.cuenta)
      && (!filtros.desde || dia >= filtros.desde) && (!filtros.hasta || dia <= filtros.hasta);
  });
  const totales = totalesMovimientos(filtrados);
  const vigentes = filtrados.filter((m) => !m.anulado);
  const subIngresos = sumarPorMoneda(vigentes.filter((m) => m.tipo === "ingreso"), (m) => m.monto, (m) => m.moneda);
  const subEgresos = sumarPorMoneda(vigentes.filter((m) => m.tipo === "egreso"), (m) => m.monto, (m) => m.moneda);

  // Tras un movimiento, la tabla y los saldos aún son los viejos hasta que termina la recarga: mientras tanto no se
  // puede volver a registrar (con red lenta invitaba a pagar dos veces).
  const [recargando, setRecargando] = useState(false);
  const recargar = async () => {
    setRecargando(true);
    try { await cargar(); } finally { setRecargando(false); }
  };

  // Anular un ingreso ya gastado deja un banco en negativo: el servidor pide confirmar el sobregiro.
  const anular = async (motivo) => {
    const mov = anulando;
    setAnulando(null);
    setProcesando(true);
    setError("");
    try {
      const r = await enviarConSobregiro((b) => fetchAuth(`/movimientos-tesoreria/${mov._id}/anular`, { method: "PATCH", body: JSON.stringify(b) }), { motivo }, confirmar);
      if (r.ok) await cargar();
      else setError((await r.json().catch(() => ({}))).mensaje || "No se pudo anular el movimiento.");
    } catch {
      setError("Error de conexión con el servidor, intenta de nuevo.");
    } finally {
      setProcesando(false);
    }
  };

  const exportarExcel = () => {
    const filas = filtrados.map((m) => ({
      "CÓDIGO": m.codigo, FECHA: fecha(m.fecha), TIPO: TIPOS[m.tipo], CONCEPTO: referenciaMovimiento(m).parte,
      DOCUMENTO: referenciaMovimiento(m).documento, "TERCERO / DESCRIPCIÓN": referenciaMovimiento(m).tercero,
      CUENTA: m.cuenta?.nombre || "", DESTINO: m.cuentaDestino?.nombre || "", MEDIO: m.medio,
      "N° OPERACIÓN": m.numeroOperacion, MONEDA: m.moneda, MONTO: m.monto,
      TC: m.moneda === "USD" ? m.tipoCambio : "", "TC DOC.": m.moneda === "USD" ? m.tipoCambioDoc ?? m.tipoCambio : "",
      "DIF. CAMBIO S/": m.difCambio || 0, ESTADO: m.anulado ? "Anulado" : "Vigente",
    }));
    exportarHoja("movimientos-tesoreria.xlsx", "Movimientos", filas, [
      ...filasSubtotal("CÓDIGO", { MONTO: subIngresos }).map((r) => ({ ...r, "CÓDIGO": r["CÓDIGO"].replace("SUBTOTAL", "INGRESOS") })),
      ...filasSubtotal("CÓDIGO", { MONTO: subEgresos }).map((r) => ({ ...r, "CÓDIGO": r["CÓDIGO"].replace("SUBTOTAL", "EGRESOS") })),
    ]);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-stretch">
        {cuentas.filter((c) => c.activo).map((c) => (
          <div key={c._id} className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-2 min-w-[11rem]">
            <p className="text-xs text-gray-500">{c.nombre} <span className="text-gray-400">({c.moneda})</span></p>
            <p className={`text-base font-semibold tabular-nums ${c.saldo < 0 ? "text-red-600" : "text-gray-800"}`}>{money(c.saldo, c.moneda)}</p>
          </div>
        ))}
        {puedeManual && (
          <div className="flex gap-2 items-center ml-auto">
            <button onClick={() => setModal("manual")} className="bg-purple-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-purple-700">Ingreso / egreso</button>
            <button onClick={() => setModal("transferencia")} className="border border-purple-300 text-purple-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-purple-50">Transferencia</button>
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-3 items-center">
        <select value={filtros.cuenta} onChange={set("cuenta")} className={INP}>
          <option value="">Todas las cuentas</option>
          {cuentas.map((c) => <option key={c._id} value={c._id}>{c.nombre}</option>)}
        </select>
        <input type="date" value={filtros.desde} onChange={set("desde")} className={INP} />
        <input type="date" value={filtros.hasta} onChange={set("hasta")} className={INP} />
        <span className="text-sm text-emerald-700">Ingresos {money(totales.ingresos)}</span>
        <span className="text-sm text-red-600">Egresos {money(totales.egresos)}</span>
        <button onClick={exportarExcel} className="ml-auto border border-gray-300 text-gray-600 px-4 py-2 rounded-lg text-sm hover:bg-gray-50">Exportar Excel</button>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <TablaScroll className="overflow-x-auto">
          <table className="w-full text-sm" style={{ minWidth: "1000px" }}>
            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
              <tr>{["Código", "Fecha", "Tipo", "Documento", "Tercero", "Parte", "Cuenta", "N° operación", "Monto", ""].map((h) => <th key={h} className="px-3 py-2 text-left">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtrados.length === 0 && <tr><td colSpan={10} className="px-3 py-8 text-center text-gray-400">Sin movimientos</td></tr>}
              {filtrados.map((m) => (
                <tr key={m._id} className={m.anulado ? "opacity-40 line-through" : ""}>
                  <td className="px-3 py-2 font-medium">{m.codigo}</td>
                  <td className="px-3 py-2">{fecha(m.fecha)}</td>
                  <td className={`px-3 py-2 ${COLOR[m.tipo]}`}>{TIPOS[m.tipo]}</td>
                  <td className="px-3 py-2">{referenciaMovimiento(m).documento || "—"}</td>
                  <td className="px-3 py-2">{referenciaMovimiento(m).tercero || "—"}</td>
                  <td className="px-3 py-2">{referenciaMovimiento(m).parte}</td>
                  <td className="px-3 py-2">{m.cuenta?.nombre || "—"}{m.cuentaDestino ? ` → ${m.cuentaDestino.nombre}` : ""}</td>
                  <td className="px-3 py-2">{m.numeroOperacion || "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{money(m.monto, m.moneda)}
                    {m.moneda === "USD" && (
                      <span className="block text-[11px] text-gray-400">
                        TC {Number(m.tipoCambio).toFixed(3)}{m.difCambio ? <> · dif. <span className={m.difCambio > 0 ? "text-emerald-700" : "text-red-600"}>{money(m.difCambio)}</span></> : null}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {!m.anulado && (!m.conceptoManual || puedeManual) && <button onClick={() => setAnulando(m)} disabled={procesando || recargando} className="text-xs text-red-500 hover:text-red-700 disabled:opacity-40">Anular</button>}
                  </td>
                </tr>
              ))}
            </tbody>
            {filtrados.length > 0 && (
              <tfoot className="bg-gray-50 font-semibold text-gray-700">
                <tr>
                  <td colSpan={8} className="px-3 py-2">Subtotal vigentes ({vigentes.length} movimientos)</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    <span className="block text-emerald-700">Ingresos {textoMontos(subIngresos)}</span>
                    <span className="block text-red-600">Egresos {textoMontos(subEgresos)}</span>
                  </td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </TablaScroll>
      </div>
      {anulando && (
        <PromptAccion titulo={`Anular ${anulando.codigo}`} placeholder="Motivo de la anulación"
          onCancelar={() => setAnulando(null)} onConfirmar={anular} procesando={procesando} textoConfirmar="Anular" />
      )}
      {modal && (
        <ModalMovimientoManual modo={modal} cuentas={cuentas} onClose={() => setModal(null)}
          onGuardado={() => { setModal(null); recargar(); }} />
      )}
      {dialogo}
    </div>
  );
}
