import { useState, useEffect, useCallback } from "react";
import { fetchAuth } from "../../utils/fetchAuth";
import { conBloqueo } from "../../utils/bloqueoApi";
import { formatearFecha } from "../../utils/fecha";
import { money } from "../../utils/compras";
import { round2, SUBDIARIOS } from "../../utils/contabilidad";
import { exportarHoja } from "../../utils/exportarTabla";
import TablaScroll from "../TablaScroll";
import PromptAccion from "../PromptAccion";
import AvisoAccion from "../AvisoAccion";
import ModalAsiento from "./ModalAsiento";

const INP = "border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300";
const fecha = (d) => formatearFecha(d, { day: "2-digit", month: "2-digit", year: "numeric" });
const ESTADOS = { borrador: "Borrador", contabilizado: "Contabilizado", anulado: "Anulado" };
const total = (a, k) => round2(a.lineas.reduce((s, l) => s + (l[k] || 0), 0));

export default function PanelAsientos({ cuentas, centrosCosto, puedeEscribir }) {
  const [datos, setDatos] = useState({ asientos: [], total: 0 });
  const [filtros, setFiltros] = useState({ periodo: "", subdiario: "", cuenta: "", estado: "", q: "" });
  const [modal, setModal] = useState(null); // { asiento? }
  const [anulando, setAnulando] = useState(null);
  const [procesando, setProcesando] = useState(false);
  const [aviso, setAviso] = useState("");

  const consulta = useCallback((pagina = 1) => {
    const qs = new URLSearchParams(Object.entries({ ...filtros, periodo: filtros.periodo.replace("-", ""), pagina }).filter(([, v]) => v));
    return fetchAuth(`/contabilidad/asientos?${qs}`).then(async (r) => {
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.mensaje || "No se pudieron cargar los asientos.");
      return d;
    });
  }, [filtros]);
  const cargar = useCallback(() => consulta().then(setDatos).catch((e) => setAviso(e.message || "Error de conexión con el servidor.")), [consulta]);
  useEffect(() => { const t = setTimeout(cargar, 250); return () => clearTimeout(t); }, [cargar]);

  const set = (k) => (e) => setFiltros((f) => ({ ...f, [k]: e.target.value }));
  const vigentes = datos.asientos.filter((a) => a.estado !== "anulado");

  const abrir = async (a) => {
    try {
      const r = await fetchAuth(`/contabilidad/asientos/${a._id}`);
      if (r.ok) setModal({ asiento: await r.json() });
      else setAviso((await r.json().catch(() => ({}))).mensaje || "No se pudo abrir el asiento.");
    } catch {
      setAviso("Error de conexión con el servidor.");
    }
  };

  const anular = async (motivo) => {
    setProcesando(true);
    try {
      const r = await conBloqueo("asiento", anulando._id, (h) => fetchAuth(`/contabilidad/asientos/${anulando._id}/anular`, {
        method: "PATCH", headers: h, body: JSON.stringify({ motivo }),
      }));
      if (!r.ok) return setAviso((await r.json().catch(() => ({}))).mensaje || "No se pudo anular el asiento.");
      setAnulando(null);
      cargar();
    } catch {
      setAviso("Error de conexión con el servidor.");
    } finally {
      setProcesando(false);
    }
  };

  // Exporta todo lo filtrado (todas las páginas), no solo lo que está en pantalla.
  const exportar = async () => {
    try {
      const todos = [...datos.asientos];
      for (let p = 2; todos.length < datos.total; p++) {
        const d = await consulta(p);
        if (!d.asientos.length) break;
        todos.push(...d.asientos);
      }
      exportarAsientos(todos);
    } catch (e) {
      setAviso(e.message || "No se pudo exportar.");
    }
  };
  const exportarAsientos = (lista) => exportarHoja("asientos.xlsx", "Asientos", lista.flatMap((a) => a.lineas.map((l) => ({
    "CUO": a.cuo, "Fecha": fecha(a.fecha), "Subdiario": SUBDIARIOS[a.subdiario], "Glosa": a.glosa, "Estado": ESTADOS[a.estado],
    "Moneda": a.moneda, "TC": a.tipoCambio, "Cuenta": l.cuenta, "Glosa línea": l.glosa, "Debe S/": l.debe, "Haber S/": l.haber,
    "Debe ME": l.debeME, "Haber ME": l.haberME, "Tercero": l.tercero?.numDoc || "",
  }))), [{
    "CUO": "TOTAL (vigentes)",
    "Debe S/": round2(lista.filter((a) => a.estado !== "anulado").reduce((s, a) => s + total(a, "debe"), 0)),
    "Haber S/": round2(lista.filter((a) => a.estado !== "anulado").reduce((s, a) => s + total(a, "haber"), 0)),
  }]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="text-xs text-gray-500 block">Periodo</label>
          <input type="month" value={filtros.periodo} onChange={set("periodo")} className={INP} />
        </div>
        <div>
          <label className="text-xs text-gray-500 block">Subdiario</label>
          <select value={filtros.subdiario} onChange={set("subdiario")} className={INP}>
            <option value="">Todos</option>
            {Object.entries(SUBDIARIOS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-500 block">Cuenta (empieza por)</label>
          <input value={filtros.cuenta} onChange={(e) => setFiltros((f) => ({ ...f, cuenta: e.target.value.replace(/\D/g, "") }))} className={`${INP} w-28 font-mono`} />
        </div>
        <div>
          <label className="text-xs text-gray-500 block">Estado</label>
          <select value={filtros.estado} onChange={set("estado")} className={INP}>
            <option value="">Todos</option>
            {Object.entries(ESTADOS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-500 block">Glosa o CUO</label>
          <input value={filtros.q} onChange={set("q")} className={`${INP} w-56`} />
        </div>
        <div className="flex-1" />
        <button onClick={exportar} className="border border-gray-300 text-gray-700 px-3 py-2 rounded-lg text-sm hover:bg-gray-50">Exportar Excel</button>
        {puedeEscribir && (
          <button onClick={() => setModal({})} className="bg-purple-600 text-white px-3 py-2 rounded-lg text-sm hover:bg-purple-700">+ Asiento manual</button>
        )}
      </div>
      <p className="text-xs text-gray-400">
        {datos.total} asientos{datos.total > datos.asientos.length ? ` (se muestran ${datos.asientos.length}: afina los filtros)` : ""} ·
        Vigentes: debe {money(vigentes.reduce((s, a) => s + total(a, "debe"), 0))} · haber {money(vigentes.reduce((s, a) => s + total(a, "haber"), 0))}
      </p>
      <TablaScroll>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-gray-500 border-b">
              <th className="py-2 pr-3">Fecha</th><th className="py-2 pr-3">CUO</th><th className="py-2 pr-3">Subdiario</th>
              <th className="py-2 pr-3">Glosa</th><th className="py-2 pr-3 text-right">Debe S/</th><th className="py-2 pr-3 text-right">Haber S/</th>
              <th className="py-2 pr-3">Estado</th><th className="py-2" />
            </tr>
          </thead>
          <tbody>
            {datos.asientos.map((a) => (
              <tr key={a._id} className={`border-b border-gray-100 ${a.estado === "anulado" ? "text-gray-400 line-through" : ""}`}>
                <td className="py-1.5 pr-3 whitespace-nowrap">{fecha(a.fecha)}</td>
                <td className="py-1.5 pr-3 font-mono text-xs whitespace-nowrap">{a.cuo}</td>
                <td className="py-1.5 pr-3">{SUBDIARIOS[a.subdiario]}</td>
                <td className="py-1.5 pr-3">{a.glosa}{a.moneda === "USD" && <span className="ml-1 text-xs text-blue-600">US$ · TC {a.tipoCambio}</span>}</td>
                <td className="py-1.5 pr-3 text-right tabular-nums">{money(total(a, "debe"))}</td>
                <td className="py-1.5 pr-3 text-right tabular-nums">{money(total(a, "haber"))}</td>
                <td className="py-1.5 pr-3 text-xs no-underline">
                  {ESTADOS[a.estado]}
                  {a.origen?.tipo !== "manual" && <span className="ml-1 text-gray-400">· automático</span>}
                  {a.exportacion?.lote && <span className="ml-1 text-green-700">· exportado {a.exportacion.numero}</span>}
                  {a.estado === "contabilizado" && (a.origenCambiado || a.origenAnulado) && (
                    <span className="ml-1 text-red-600">· documento {a.origenAnulado ? "anulado" : "cambiado"}</span>
                  )}
                </td>
                <td className="py-1.5 text-right whitespace-nowrap">
                  <button onClick={() => abrir(a)} className="text-xs text-purple-600 hover:underline mr-3">Ver</button>
                  {puedeEscribir && a.estado === "contabilizado" && !a.exportacion?.lote && (
                    <button onClick={() => setAnulando(a)} className="text-xs text-red-600 hover:underline">Anular</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TablaScroll>
      {modal && (
        <ModalAsiento asiento={modal.asiento} cuentas={cuentas} centrosCosto={centrosCosto} puedeEscribir={puedeEscribir}
          onClose={() => setModal(null)} onGuardado={() => { setModal(null); cargar(); }} />
      )}
      {anulando && (
        <PromptAccion titulo={`Anular asiento ${anulando.cuo}`} label="Motivo de la anulación" procesando={procesando}
          textoConfirmar="Anular" onCancelar={() => setAnulando(null)} onConfirmar={anular} />
      )}
      {aviso && <AvisoAccion mensaje={aviso} onCerrar={() => setAviso("")} />}
    </div>
  );
}
