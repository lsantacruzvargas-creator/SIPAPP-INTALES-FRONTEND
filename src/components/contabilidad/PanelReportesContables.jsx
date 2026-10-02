import { useState } from "react";
import { fetchAuth } from "../../utils/fetchAuth";
import { formatearFecha } from "../../utils/fecha";
import { money } from "../../utils/compras";
import { SUBDIARIOS } from "../../utils/contabilidad";
import { mesAnteriorLima, periodoDeMes, textoPeriodo } from "../../utils/bancos";
import { exportarHoja } from "../../utils/exportarTabla";
import TablaScroll from "../TablaScroll";
import AvisoAccion from "../AvisoAccion";

const INP = "border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300";
const fecha = (d) => formatearFecha(d, { day: "2-digit", month: "2-digit", year: "numeric" });
const VISTAS = { balance: "Balance de comprobación", mayor: "Libro Mayor", diario: "Libro Diario" };
const num = (v) => (v ? money(v) : "");

// Reportes de control (C3) con los asientos contabilizados: para cuadrar con lo que importa el contador.
export default function PanelReportesContables({ centrosCosto }) {
  const [vista, setVista] = useState("balance");
  const [desde, setDesde] = useState(mesAnteriorLima());
  const [hasta, setHasta] = useState(mesAnteriorLima());
  const [f, setF] = useState({ nivel: "", cuenta: "", centroCosto: "", tercero: "", subdiario: "" });
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [aviso, setAviso] = useState("");

  const consultar = async () => {
    const qs = new URLSearchParams({ desde: periodoDeMes(desde), hasta: periodoDeMes(hasta) });
    if (vista === "balance" && f.nivel) qs.set("nivel", f.nivel);
    if (vista === "mayor") for (const k of ["cuenta", "centroCosto", "tercero"]) if (f[k]) qs.set(k, f[k]);
    if (vista === "diario" && f.subdiario) qs.set("subdiario", f.subdiario);
    setCargando(true);
    try {
      const r = await fetchAuth(`/contabilidad/reportes/${vista}?${qs}`);
      const d = await r.json().catch(() => ({}));
      if (!r.ok) return setAviso(d.mensaje || "No se pudo generar el reporte.");
      setDatos({ vista, ...d });
    } catch {
      setAviso("Error de conexión con el servidor.");
    } finally {
      setCargando(false);
    }
  };
  const cambiarVista = (v) => { setVista(v); setDatos(null); };
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const rango = datos ? `${textoPeriodo(datos.desde)}${datos.hasta !== datos.desde ? ` a ${textoPeriodo(datos.hasta)}` : ""}` : "";

  const exportar = () => {
    if (datos.vista === "balance") {
      exportarHoja(`balance-${datos.desde}-${datos.hasta}.xlsx`, "Balance", datos.cuentas.map((c) => ({
        Cuenta: c.codigo, Nombre: c.nombre, "Saldo anterior": c.saldoAnterior, Debe: c.debe, Haber: c.haber, Deudor: c.deudor, Acreedor: c.acreedor,
      })), [{ Cuenta: "TOTAL", "Saldo anterior": datos.totales.saldoAnterior, Debe: datos.totales.debe, Haber: datos.totales.haber, Deudor: datos.totales.deudor, Acreedor: datos.totales.acreedor }]);
    } else if (datos.vista === "mayor") {
      exportarHoja(`mayor-${datos.desde}-${datos.hasta}.xlsx`, "Mayor", datos.cuentas.flatMap((c) => [
        { Cuenta: c.codigo, Nombre: c.nombre, Glosa: "Saldo anterior", Saldo: c.saldoInicial },
        ...c.movimientos.map((m) => ({ Cuenta: c.codigo, Fecha: fecha(m.fecha), CUO: m.cuo, Glosa: m.glosa, Tercero: m.tercero?.numDoc || "",
          Documento: m.documento?.serie ? `${m.documento.serie}-${m.documento.numero}` : "", Debe: m.debe, Haber: m.haber, Saldo: m.saldo })),
        { Cuenta: c.codigo, Glosa: "Saldo final", Debe: c.debe, Haber: c.haber, Saldo: c.saldoFinal },
      ]));
    } else {
      exportarHoja(`diario-${datos.desde}-${datos.hasta}.xlsx`, "Diario", datos.asientos.flatMap((a) => a.lineas.map((l) => ({
        Fecha: fecha(a.fecha), CUO: a.cuo, Subdiario: SUBDIARIOS[a.subdiario], Glosa: a.glosa, Cuenta: l.cuenta, Nombre: l.nombreCuenta,
        Tercero: l.tercero?.numDoc || "", Documento: l.documento?.serie ? `${l.documento.serie}-${l.documento.numero}` : "",
        "Centro de costo": l.centroCosto?.nombre || "", Debe: l.debe, Haber: l.haber,
      }))), [{ Fecha: "TOTAL", Debe: datos.totales.debe, Haber: datos.totales.haber }]);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap">
        {Object.entries(VISTAS).map(([v, l]) => (
          <button key={v} onClick={() => cambiarVista(v)}
            className={`px-3 py-1.5 rounded-lg text-sm ${vista === v ? "bg-purple-600 text-white" : "border border-gray-300 text-gray-700 hover:bg-gray-50"}`}>{l}</button>
        ))}
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div><label className="text-xs text-gray-500 block">Desde</label><input type="month" value={desde} onChange={(e) => setDesde(e.target.value)} className={INP} /></div>
        <div><label className="text-xs text-gray-500 block">Hasta</label><input type="month" value={hasta} onChange={(e) => setHasta(e.target.value)} className={INP} /></div>
        {vista === "balance" && (
          <div><label className="text-xs text-gray-500 block">Nivel</label>
            <select value={f.nivel} onChange={set("nivel")} className={INP}>
              <option value="">Cuentas de movimiento</option><option value="2">2 dígitos</option><option value="3">3 dígitos</option><option value="4">4 dígitos</option>
            </select></div>
        )}
        {vista === "mayor" && (<>
          <div><label className="text-xs text-gray-500 block">Cuenta (empieza por)</label>
            <input value={f.cuenta} onChange={(e) => setF((x) => ({ ...x, cuenta: e.target.value.replace(/\D/g, "") }))} className={`${INP} w-32 font-mono`} /></div>
          <div><label className="text-xs text-gray-500 block">Centro de costo</label>
            <select value={f.centroCosto} onChange={set("centroCosto")} className={INP}>
              <option value="">Todos</option>{centrosCosto.map((c) => <option key={c._id} value={c._id}>{c.nombre}</option>)}
            </select></div>
          <div><label className="text-xs text-gray-500 block">RUC/DNI del tercero</label>
            <input value={f.tercero} onChange={(e) => setF((x) => ({ ...x, tercero: e.target.value.replace(/[^0-9A-Za-z-]/g, "") }))} className={`${INP} w-36 font-mono`} /></div>
        </>)}
        {vista === "diario" && (
          <div><label className="text-xs text-gray-500 block">Subdiario</label>
            <select value={f.subdiario} onChange={set("subdiario")} className={INP}>
              <option value="">Todos</option>{Object.entries(SUBDIARIOS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select></div>
        )}
        <button onClick={consultar} disabled={cargando} className="bg-purple-600 text-white px-3 py-2 rounded-lg text-sm hover:bg-purple-700 disabled:opacity-50">Ver</button>
        {datos && <button onClick={exportar} className="border border-gray-300 text-gray-700 px-3 py-2 rounded-lg text-sm hover:bg-gray-50">Exportar Excel</button>}
      </div>
      <p className="text-xs text-gray-400">Solo asientos contabilizados. Es un reporte de control: los libros oficiales los lleva el software del contador.</p>

      {datos?.vista === "balance" && (
        <TablaScroll>
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-gray-500 border-b">
              <th className="py-2 pr-3">Cuenta</th><th className="py-2 pr-3">Nombre</th><th className="py-2 pr-3 text-right">Saldo anterior</th>
              <th className="py-2 pr-3 text-right">Debe</th><th className="py-2 pr-3 text-right">Haber</th><th className="py-2 pr-3 text-right">Deudor</th><th className="py-2 pr-3 text-right">Acreedor</th>
            </tr></thead>
            <tbody>
              {datos.cuentas.map((c) => (
                <tr key={c.codigo} className="border-b border-gray-100">
                  <td className="py-1.5 pr-3 font-mono">{c.codigo}</td><td className="py-1.5 pr-3">{c.nombre}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{num(c.saldoAnterior)}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{num(c.debe)}</td><td className="py-1.5 pr-3 text-right tabular-nums">{num(c.haber)}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{num(c.deudor)}</td><td className="py-1.5 pr-3 text-right tabular-nums">{num(c.acreedor)}</td>
                </tr>
              ))}
              <tr className="font-semibold">
                <td className="py-2 pr-3" colSpan={2}>Total {rango}</td><td className="py-2 pr-3 text-right tabular-nums">{money(datos.totales.saldoAnterior)}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{money(datos.totales.debe)}</td><td className="py-2 pr-3 text-right tabular-nums">{money(datos.totales.haber)}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{money(datos.totales.deudor)}</td><td className="py-2 pr-3 text-right tabular-nums">{money(datos.totales.acreedor)}</td>
              </tr>
            </tbody>
          </table>
        </TablaScroll>
      )}

      {datos?.vista === "mayor" && (
        <div className="space-y-5">
          {!datos.cuentas.length && <p className="text-sm text-gray-400">Sin movimientos.</p>}
          {datos.cuentas.map((c) => (
            <section key={c.codigo} className="space-y-1">
              <h3 className="text-sm font-semibold text-gray-700"><span className="font-mono">{c.codigo}</span> {c.nombre}</h3>
              <TablaScroll>
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-xs text-gray-500 border-b">
                    <th className="py-2 pr-3">Fecha</th><th className="py-2 pr-3">CUO</th><th className="py-2 pr-3">Glosa</th><th className="py-2 pr-3">Tercero</th>
                    <th className="py-2 pr-3 text-right">Debe</th><th className="py-2 pr-3 text-right">Haber</th><th className="py-2 pr-3 text-right">Saldo</th>
                  </tr></thead>
                  <tbody>
                    <tr className="text-gray-500"><td className="py-1 pr-3" colSpan={6}>Saldo anterior</td><td className="py-1 pr-3 text-right tabular-nums">{money(c.saldoInicial)}</td></tr>
                    {c.movimientos.map((m, i) => (
                      <tr key={i} className="border-b border-gray-100">
                        <td className="py-1 pr-3 whitespace-nowrap">{fecha(m.fecha)}</td><td className="py-1 pr-3 font-mono text-xs">{m.cuo}</td>
                        <td className="py-1 pr-3">{m.glosa}</td><td className="py-1 pr-3 font-mono text-xs">{m.tercero?.numDoc || ""}</td>
                        <td className="py-1 pr-3 text-right tabular-nums">{num(m.debe)}</td><td className="py-1 pr-3 text-right tabular-nums">{num(m.haber)}</td>
                        <td className="py-1 pr-3 text-right tabular-nums">{money(m.saldo)}</td>
                      </tr>
                    ))}
                    <tr className="font-semibold"><td className="py-1.5 pr-3" colSpan={4}>Saldo final</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums">{money(c.debe)}</td><td className="py-1.5 pr-3 text-right tabular-nums">{money(c.haber)}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums">{money(c.saldoFinal)}</td></tr>
                  </tbody>
                </table>
              </TablaScroll>
            </section>
          ))}
        </div>
      )}

      {datos?.vista === "diario" && (
        <TablaScroll>
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-gray-500 border-b">
              <th className="py-2 pr-3">Fecha</th><th className="py-2 pr-3">CUO</th><th className="py-2 pr-3">Glosa</th><th className="py-2 pr-3">Cuenta</th>
              <th className="py-2 pr-3 text-right">Debe</th><th className="py-2 pr-3 text-right">Haber</th>
            </tr></thead>
            <tbody>
              {datos.asientos.map((a) => a.lineas.map((l, i) => (
                <tr key={`${a._id}-${i}`} className={i === a.lineas.length - 1 ? "border-b border-gray-200" : ""}>
                  <td className="py-1 pr-3 whitespace-nowrap">{i === 0 ? fecha(a.fecha) : ""}</td>
                  <td className="py-1 pr-3 font-mono text-xs">{i === 0 ? a.cuo : ""}</td>
                  <td className="py-1 pr-3">{i === 0 ? a.glosa : ""}</td>
                  <td className="py-1 pr-3"><span className="font-mono">{l.cuenta}</span> <span className="text-gray-500">{l.nombreCuenta}</span></td>
                  <td className="py-1 pr-3 text-right tabular-nums">{num(l.debe)}</td><td className="py-1 pr-3 text-right tabular-nums">{num(l.haber)}</td>
                </tr>
              )))}
              <tr className="font-semibold"><td className="py-2 pr-3" colSpan={4}>Total {rango}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{money(datos.totales.debe)}</td><td className="py-2 pr-3 text-right tabular-nums">{money(datos.totales.haber)}</td></tr>
            </tbody>
          </table>
        </TablaScroll>
      )}
      {aviso && <AvisoAccion mensaje={aviso} onCerrar={() => setAviso("")} />}
    </div>
  );
}
