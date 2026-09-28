import { useState, useEffect, useCallback } from "react";
import * as XLSX from "xlsx";
import { fetchAuth } from "../../utils/fetchAuth";
import { formatearFecha } from "../../utils/fecha";
import { money } from "../../utils/compras";
import { totalesMovimientos } from "../../utils/tesoreria";
import TablaScroll from "../TablaScroll";
import PromptAccion from "../PromptAccion";

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

  const cargar = useCallback(() => fetchAuth("/movimientos-tesoreria").then(async (r) => {
    if (r.ok) setMovs(await r.json());
  }), []);
  useEffect(() => { cargar(); }, [cargar]);

  const set = (campo) => (e) => setFiltros((f) => ({ ...f, [campo]: e.target.value }));
  const cuentas = [...new Map(movs.flatMap((m) => [m.cuenta, m.cuentaDestino]).filter(Boolean).map((c) => [c._id, c])).values()];
  const filtrados = movs.filter((m) => {
    const dia = String(m.fecha).slice(0, 10);
    return (!filtros.cuenta || m.cuenta?._id === filtros.cuenta || m.cuentaDestino?._id === filtros.cuenta)
      && (!filtros.desde || dia >= filtros.desde) && (!filtros.hasta || dia <= filtros.hasta);
  });
  const totales = totalesMovimientos(filtrados);

  const anular = async (motivo) => {
    setProcesando(true);
    setError("");
    try {
      const r = await fetchAuth(`/movimientos-tesoreria/${anulando._id}/anular`, { method: "PATCH", body: JSON.stringify({ motivo }) });
      if (r.ok) await cargar();
      else setError((await r.json().catch(() => ({}))).mensaje || "No se pudo anular el movimiento.");
    } catch {
      setError("Error de conexión con el servidor, intenta de nuevo.");
    } finally {
      setProcesando(false);
      setAnulando(null);
    }
  };

  const exportarExcel = () => {
    const filas = filtrados.map((m) => ({
      "CÓDIGO": m.codigo, FECHA: fecha(m.fecha), TIPO: TIPOS[m.tipo], CONCEPTO: m.concepto,
      DOCUMENTO: m.documentoRef?.comprobante || "", TERCERO: m.documentoRef?.tercero || "",
      CUENTA: m.cuenta?.nombre || "", DESTINO: m.cuentaDestino?.nombre || "", MEDIO: m.medio,
      "N° OPERACIÓN": m.numeroOperacion, MONEDA: m.moneda, MONTO: m.monto, ESTADO: m.anulado ? "Anulado" : "Vigente",
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(filas), "Movimientos");
    XLSX.writeFile(wb, "movimientos-tesoreria.xlsx");
  };

  return (
    <div className="space-y-4">
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
                  <td className="px-3 py-2">{m.documentoRef?.comprobante || "—"}</td>
                  <td className="px-3 py-2">{m.documentoRef?.tercero || "—"}</td>
                  <td className="px-3 py-2">{m.concepto === "neto" ? "Neto" : "Impuesto"}</td>
                  <td className="px-3 py-2">{m.cuenta?.nombre || "—"}{m.cuentaDestino ? ` → ${m.cuentaDestino.nombre}` : ""}</td>
                  <td className="px-3 py-2">{m.numeroOperacion || "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{money(m.monto, m.moneda)}</td>
                  <td className="px-3 py-2 text-right">
                    {!m.anulado && <button onClick={() => setAnulando(m)} className="text-xs text-red-500 hover:text-red-700">Anular</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TablaScroll>
      </div>
      {anulando && (
        <PromptAccion titulo={`Anular ${anulando.codigo}`} placeholder="Motivo de la anulación"
          onCancelar={() => setAnulando(null)} onConfirmar={anular} procesando={procesando} textoConfirmar="Anular" />
      )}
    </div>
  );
}
