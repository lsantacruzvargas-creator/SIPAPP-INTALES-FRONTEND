import { useState, useEffect, useCallback, useRef } from "react";
import { fetchAuth } from "../../utils/fetchAuth";
import { conBloqueo } from "../../utils/bloqueoApi";
import { formatearFecha, formatearFechaHora, fechaHoyLima } from "../../utils/fecha";
import { money } from "../../utils/compras";
import { etiquetaTipo } from "../../utils/cajaChica";
import { exportarHoja } from "../../utils/exportarTabla";
import TablaScroll from "../TablaScroll";
import PromptAccion from "../PromptAccion";
import ModalGastoCaja from "./ModalGastoCaja";

const INP = "border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300";
const fecha = (d) => formatearFecha(d, { day: "2-digit", month: "2-digit", year: "numeric" });
const VISTAS = [["pendientes", "Por rendir"], ["gastos", "Gastos"], ["rendiciones", "Rendiciones"], ["arqueos", "Arqueos"]];
const ESTADO_REND = { pendiente: "Pendiente de reponer", repuesta: "Repuesta", anulada: "Anulada" };

// Caja chica (spec 2026-10-02-caja-chica): gastos, rendición y reposición, arqueo.
export default function PanelCajaChica({ centrosCosto }) {
  const [cajas, setCajas] = useState([]);
  const [bancos, setBancos] = useState([]);
  const [sel, setSel] = useState("");
  const [vista, setVista] = useState("pendientes");
  const [datos, setDatos] = useState([]);
  const [modal, setModal] = useState(null); // "gasto" | "arqueo" | "reponer" | {anularGasto} | "anularRend"
  const [form, setForm] = useState({});
  const [error, setError] = useState("");
  const [procesando, setProcesando] = useState(false);
  const pedido = useRef(0);

  const cargarCajas = useCallback(() => fetchAuth("/caja-chica").then(async (r) => {
    if (!r.ok) return;
    const lista = await r.json();
    setCajas(lista);
    // Si la caja elegida dejó de ser caja chica, se pasa a la primera.
    setSel((s) => (lista.some((c) => c._id === s) ? s : lista[0]?._id || ""));
  }).catch(() => setError("Error de conexión con el servidor.")), []);
  useEffect(() => {
    cargarCajas();
    fetchAuth("/cuentas-tesoreria").then(async (r) => {
      if (r.ok) setBancos((await r.json()).filter((c) => c.activo && c.tipo === "banco" && c.moneda === "PEN"));
    }).catch(() => {});
  }, [cargarCajas]);
  const cargarVista = useCallback(() => {
    if (!sel) return Promise.resolve();
    const n = ++pedido.current;
    return fetchAuth(`/caja-chica/${sel}/${vista}`).then(async (r) => {
      const d = await r.json().catch(() => []);
      if (n === pedido.current) setDatos(r.ok ? d : []);
    }).catch(() => {});
  }, [sel, vista]);
  useEffect(() => { cargarVista(); }, [cargarVista]);

  const caja = cajas.find((c) => c._id === sel);
  const res = caja?.resumen;
  const refrescar = () => { cargarCajas(); cargarVista(); };
  const accion = async (fn, fallo) => {
    setError("");
    setProcesando(true);
    try {
      const r = await fn();
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setError(d.mensaje || fallo); return false; }
      setModal(null);
      refrescar();
      return true;
    } catch {
      setError("Error de conexión con el servidor.");
      return false;
    } finally {
      setProcesando(false);
    }
  };
  const rendir = () => accion(() => fetchAuth(`/caja-chica/${sel}/rendiciones`, { method: "POST", body: JSON.stringify({ hasta: form.hasta || fechaHoyLima() }) }), "No se pudo rendir.");
  const reponer = () => accion(() => conBloqueo("rendicionCajaChica", res.rendicionPendiente._id, (h) => fetchAuth(`/caja-chica/rendiciones/${res.rendicionPendiente._id}/reponer`, {
    method: "POST", headers: h, body: JSON.stringify({ cuentaOrigen: form.cuentaOrigen, fecha: form.fecha || fechaHoyLima(), medio: form.medio || "transferencia", numeroOperacion: form.numeroOperacion || "" }),
  })), "No se pudo reponer.");
  const anularRend = (motivo) => accion(() => conBloqueo("rendicionCajaChica", res.rendicionPendiente._id, (h) => fetchAuth(`/caja-chica/rendiciones/${res.rendicionPendiente._id}/anular`, {
    method: "POST", headers: h, body: JSON.stringify({ motivo }),
  })), "No se pudo anular la rendición.");
  const anularGasto = (motivo) => accion(() => conBloqueo("gastoCajaChica", modal.anularGasto._id, (h) => fetchAuth(`/caja-chica/gastos/${modal.anularGasto._id}/anular`, {
    method: "PATCH", headers: h, body: JSON.stringify({ motivo }),
  })), "No se pudo anular el gasto.");
  const arqueo = () => accion(() => fetchAuth(`/caja-chica/${sel}/arqueos`, { method: "POST", body: JSON.stringify({ efectivo: form.efectivo, observacion: form.observacion || "" }) }), "No se pudo registrar el arqueo.");
  const verRendicion = async (id) => {
    try {
      const r = await fetchAuth(`/caja-chica/rendiciones/${id}`);
      if (!r.ok) return setError("No se pudo abrir la rendición.");
      const d = await r.json();
      exportarHoja(`rendicion-${d.codigo}.xlsx`, "Rendición", d.movimientos.map((m) => ({
        FECHA: fecha(m.fecha), COMPROBANTE: etiquetaTipo(m.detalle.tipo), "SERIE-NÚMERO": m.detalle.comprobante, PROVEEDOR: m.detalle.tercero,
        "DESCRIPCIÓN": m.detalle.descripcion, IMPORTE: m.monto,
      })), [{ FECHA: "TOTAL", IMPORTE: d.total }]);
    } catch {
      setError("Error de conexión con el servidor.");
    }
  };

  if (!cajas.length) {
    if (error) return <p className="text-sm text-red-600">{error}</p>;
    return <p className="text-sm text-gray-500">No hay cajas chicas. Jefatura o admin la configura en Tesorería → Configuración (una cuenta de tipo caja en soles con responsable y monto del fondo); luego se abre el fondo con una transferencia desde Bancos.</p>;
  }
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-3 items-center">
        {cajas.length > 1 && (
          <select value={sel} onChange={(e) => { setSel(e.target.value); setDatos([]); }} className={INP}>
            {cajas.map((c) => <option key={c._id} value={c._id}>{c.nombre}</option>)}
          </select>
        )}
        {caja && <span className="text-sm text-gray-600">{caja.nombre} · responsable: <b>{caja.cajaChica.responsable}</b></span>}
        <div className="flex-1" />
        <button onClick={() => { setForm({ efectivo: "" }); setModal("arqueo"); }} className="border border-gray-300 text-gray-700 px-3 py-2 rounded-lg text-sm hover:bg-gray-50">Arqueo</button>
        <button onClick={() => { setForm({ hasta: fechaHoyLima() }); setModal("rendir"); }} disabled={!res?.porRendir || !!res?.rendicionPendiente}
          title={res?.rendicionPendiente ? "Primero repón la rendición pendiente" : ""}
          className="border border-purple-300 text-purple-700 px-3 py-2 rounded-lg text-sm hover:bg-purple-50 disabled:opacity-50">Rendir gastos</button>
        <button onClick={() => setModal("gasto")} className="bg-purple-600 text-white px-3 py-2 rounded-lg text-sm hover:bg-purple-700">+ Gasto</button>
      </div>

      {res && (
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-5 text-sm">
          <div className="bg-white border rounded-xl p-3"><p className="text-xs text-gray-500">Fondo fijo</p><p className="tabular-nums font-semibold">{money(res.fondo)}</p></div>
          <div className="bg-white border rounded-xl p-3"><p className="text-xs text-gray-500">Efectivo (saldo)</p><p className={`tabular-nums font-semibold ${res.saldo < res.fondo * 0.2 ? "text-red-600" : ""}`}>{money(res.saldo)}</p></div>
          <div className="bg-white border rounded-xl p-3"><p className="text-xs text-gray-500">Gastos por rendir</p><p className="tabular-nums">{money(res.porRendir)}</p></div>
          <div className="bg-white border rounded-xl p-3"><p className="text-xs text-gray-500">Rendición por reponer</p>
            {res.rendicionPendiente ? (
              <>
                <p className="tabular-nums">{money(res.rendicionPendiente.total)} <span className="text-xs text-gray-400">{res.rendicionPendiente.codigo}</span></p>
                <div className="flex gap-3 mt-1">
                  <button onClick={() => { setForm({ cuentaOrigen: bancos[0]?._id || "", fecha: fechaHoyLima(), medio: "transferencia" }); setModal("reponer"); }} className="text-xs text-purple-700 hover:underline">Reponer</button>
                  <button onClick={() => setModal("anularRend")} className="text-xs text-red-600 hover:underline">Anular</button>
                </div>
              </>
            ) : <p className="text-gray-400">—</p>}
          </div>
          <div className={`border rounded-xl p-3 ${res.descuadre === 0 ? "bg-emerald-50 border-emerald-200" : "bg-amber-50 border-amber-200"}`}>
            <p className="text-xs text-gray-500">Control del fondo</p>
            <p className="text-xs">{res.descuadre === 0 ? "Saldo + por reponer = fondo" : `Descuadre de ${money(res.descuadre)} (¿falta abrir o completar el fondo?)`}</p>
          </div>
        </div>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex border-b border-gray-200 gap-1">
        {VISTAS.map(([id, label]) => (
          <button key={id} onClick={() => { setVista(id); setDatos([]); }}
            className={`px-3 py-2 text-sm border-b-2 -mb-px ${vista === id ? "border-purple-600 text-purple-700" : "border-transparent text-gray-500 hover:text-gray-700"}`}>{label}</button>
        ))}
      </div>
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <TablaScroll className="overflow-x-auto">
          <table className="w-full text-sm" style={{ minWidth: "820px" }}>
            {vista === "pendientes" && (
              <>
                <thead className="bg-gray-50 text-xs uppercase text-gray-500"><tr>{["Fecha", "Comprobante", "Proveedor", "Descripción", "Importe"].map((h) => <th key={h} className="px-3 py-2 text-left">{h}</th>)}</tr></thead>
                <tbody className="divide-y divide-gray-100">
                  {datos.map((m) => (
                    <tr key={m._id}>
                      <td className="px-3 py-2">{fecha(m.fecha)}</td>
                      <td className="px-3 py-2">{etiquetaTipo(m.detalle?.tipo)} {m.detalle?.comprobante}</td>
                      <td className="px-3 py-2">{m.detalle?.tercero || "—"}</td>
                      <td className="px-3 py-2">{m.detalle?.descripcion}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{money(m.monto)}</td>
                    </tr>
                  ))}
                  {!datos.length && <tr><td colSpan={5} className="px-3 py-6 text-center text-gray-400">Nada por rendir</td></tr>}
                </tbody>
              </>
            )}
            {vista === "gastos" && (
              <>
                <thead className="bg-gray-50 text-xs uppercase text-gray-500"><tr>{["Código", "Fecha", "Comprobante", "Proveedor / trabajador", "Descripción", "C. costo", "Importe", ""].map((h) => <th key={h} className="px-3 py-2 text-left">{h}</th>)}</tr></thead>
                <tbody className="divide-y divide-gray-100">
                  {datos.map((g) => (
                    <tr key={g._id} className={g.anulado ? "opacity-40 line-through" : ""}>
                      <td className="px-3 py-2 font-medium">{g.codigo}</td>
                      <td className="px-3 py-2">{fecha(g.fecha)}</td>
                      <td className="px-3 py-2">{etiquetaTipo(g.tipoComprobante)} {g.serie ? `${g.serie}-${g.numero}` : ""}</td>
                      <td className="px-3 py-2">{g.proveedor?.nombre || g.trabajador || "—"}</td>
                      <td className="px-3 py-2">{g.descripcion}</td>
                      <td className="px-3 py-2">{g.centroCosto?.nombre || "—"}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{money(g.monto)}</td>
                      <td className="px-3 py-2 text-right">{!g.anulado && !g.movimiento?.rendicion && <button onClick={() => setModal({ anularGasto: g })} className="text-xs text-red-500 hover:text-red-700">Anular</button>}</td>
                    </tr>
                  ))}
                  {!datos.length && <tr><td colSpan={8} className="px-3 py-6 text-center text-gray-400">Sin gastos</td></tr>}
                </tbody>
              </>
            )}
            {vista === "rendiciones" && (
              <>
                <thead className="bg-gray-50 text-xs uppercase text-gray-500"><tr>{["Código", "Hasta", "Total", "Estado", "Repuesta", ""].map((h) => <th key={h} className="px-3 py-2 text-left">{h}</th>)}</tr></thead>
                <tbody className="divide-y divide-gray-100">
                  {datos.map((r) => (
                    <tr key={r._id} className={r.estado === "anulada" ? "opacity-40" : ""}>
                      <td className="px-3 py-2 font-medium">{r.codigo}</td>
                      <td className="px-3 py-2">{fecha(r.hasta)}</td>
                      <td className="px-3 py-2 tabular-nums">{money(r.total)}</td>
                      <td className="px-3 py-2">{ESTADO_REND[r.estado]}{r.motivoAnulacion ? ` (${r.motivoAnulacion})` : ""}</td>
                      <td className="px-3 py-2">{r.repuestaEn ? `${formatearFechaHora(r.repuestaEn)} · ${r.repuestaPor}` : "—"}</td>
                      <td className="px-3 py-2 text-right"><button onClick={() => verRendicion(r._id)} className="text-xs text-purple-700 hover:underline">Excel</button></td>
                    </tr>
                  ))}
                  {!datos.length && <tr><td colSpan={6} className="px-3 py-6 text-center text-gray-400">Sin rendiciones</td></tr>}
                </tbody>
              </>
            )}
            {vista === "arqueos" && (
              <>
                <thead className="bg-gray-50 text-xs uppercase text-gray-500"><tr>{["Fecha", "Efectivo contado", "Saldo en libros", "Diferencia", "Observación", "Por"].map((h) => <th key={h} className="px-3 py-2 text-left">{h}</th>)}</tr></thead>
                <tbody className="divide-y divide-gray-100">
                  {datos.map((a) => (
                    <tr key={a._id}>
                      <td className="px-3 py-2">{formatearFechaHora(a.fecha)}</td>
                      <td className="px-3 py-2 tabular-nums">{money(a.efectivo)}</td>
                      <td className="px-3 py-2 tabular-nums">{money(a.saldoLibros)}</td>
                      <td className={`px-3 py-2 tabular-nums ${a.diferencia < 0 ? "text-red-600" : a.diferencia > 0 ? "text-amber-700" : "text-emerald-700"}`}>
                        {a.diferencia === 0 ? "Cuadra" : `${a.diferencia < 0 ? "Faltante" : "Sobrante"} ${money(Math.abs(a.diferencia))}`}
                      </td>
                      <td className="px-3 py-2">{a.observacion || "—"}</td>
                      <td className="px-3 py-2">{a.registradoPor}</td>
                    </tr>
                  ))}
                  {!datos.length && <tr><td colSpan={6} className="px-3 py-6 text-center text-gray-400">Sin arqueos</td></tr>}
                </tbody>
              </>
            )}
          </table>
        </TablaScroll>
      </div>

      {modal === "gasto" && caja && (
        <ModalGastoCaja caja={caja} centrosCosto={centrosCosto} onClose={() => setModal(null)} onGuardado={() => { setModal(null); refrescar(); }} />
      )}
      {["rendir", "reponer", "arqueo"].includes(modal) && caja && (modal !== "reponer" || res?.rendicionPendiente) && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md space-y-4">
            {modal === "rendir" && (
              <>
                <h3 className="font-semibold text-gray-800">Rendir gastos de {caja.nombre}</h3>
                <label className="text-xs text-gray-500 block">Incluir gastos hasta
                  <input type="date" value={form.hasta} onChange={(e) => setForm({ ...form, hasta: e.target.value })} className={`${INP} block w-full`} />
                </label>
                <p className="text-xs text-gray-500">Se juntan los gastos y pagos aún no rendidos hasta esa fecha; luego se repone el total desde un banco.</p>
              </>
            )}
            {modal === "reponer" && (
              <>
                <h3 className="font-semibold text-gray-800">Reponer {res.rendicionPendiente.codigo}: {money(res.rendicionPendiente.total)}</h3>
                <label className="text-xs text-gray-500 block">Desde la cuenta
                  <select value={form.cuentaOrigen} onChange={(e) => setForm({ ...form, cuentaOrigen: e.target.value })} className={`${INP} block w-full`}>
                    <option value="">Elige…</option>
                    {bancos.map((b) => <option key={b._id} value={b._id}>{b.nombre}</option>)}
                  </select>
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="text-xs text-gray-500">Fecha<input type="date" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} className={`${INP} block w-full`} /></label>
                  <label className="text-xs text-gray-500">Medio
                    <select value={form.medio} onChange={(e) => setForm({ ...form, medio: e.target.value })} className={`${INP} block w-full`}>
                      <option value="transferencia">Transferencia</option><option value="efectivo">Efectivo (retiro)</option><option value="cheque">Cheque</option>
                    </select>
                  </label>
                </div>
                <label className="text-xs text-gray-500 block">N° de operación / cheque
                  <input value={form.numeroOperacion || ""} onChange={(e) => setForm({ ...form, numeroOperacion: e.target.value })} className={`${INP} block w-full`} />
                </label>
              </>
            )}
            {modal === "arqueo" && (
              <>
                <h3 className="font-semibold text-gray-800">Arqueo de {caja.nombre}</h3>
                <label className="text-xs text-gray-500 block">Efectivo contado (S/)
                  <input value={form.efectivo} onChange={(e) => setForm({ ...form, efectivo: e.target.value })} inputMode="decimal" className={`${INP} block w-full text-right`} />
                </label>
                <p className="text-xs text-gray-500">Saldo según el sistema: {money(res.saldo)}{form.efectivo !== "" && !Number.isNaN(Number(form.efectivo)) ? ` · diferencia ${money(Number(form.efectivo) - res.saldo)}` : ""}</p>
                <label className="text-xs text-gray-500 block">Observación
                  <input value={form.observacion || ""} onChange={(e) => setForm({ ...form, observacion: e.target.value })} className={`${INP} block w-full`} />
                </label>
              </>
            )}
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex justify-end gap-3">
              <button onClick={() => { setModal(null); setError(""); }} disabled={procesando} className="border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm hover:bg-gray-50">Cancelar</button>
              <button disabled={procesando || (modal === "reponer" && !form.cuentaOrigen) || (modal === "arqueo" && form.efectivo === "")}
                onClick={modal === "rendir" ? rendir : modal === "reponer" ? reponer : arqueo}
                className="bg-purple-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-purple-700 disabled:opacity-50">
                {procesando ? "Guardando…" : modal === "rendir" ? "Rendir" : modal === "reponer" ? "Reponer" : "Registrar arqueo"}
              </button>
            </div>
          </div>
        </div>
      )}
      {modal === "anularRend" && res?.rendicionPendiente && (
        <PromptAccion titulo={`Anular la rendición ${res.rendicionPendiente.codigo}`} label="Motivo" procesando={procesando}
          textoConfirmar="Anular" onCancelar={() => setModal(null)} onConfirmar={anularRend} />
      )}
      {modal?.anularGasto && (
        <PromptAccion titulo={`Anular el gasto ${modal.anularGasto.codigo}`} label="Motivo" procesando={procesando}
          textoConfirmar="Anular" onCancelar={() => setModal(null)} onConfirmar={anularGasto} />
      )}
    </div>
  );
}
