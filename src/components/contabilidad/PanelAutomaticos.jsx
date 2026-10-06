import { useState, useEffect, useCallback } from "react";
import { fetchAuth } from "../../utils/fetchAuth";
import { formatearFecha } from "../../utils/fecha";
import { money } from "../../utils/compras";
import { round2, SUBDIARIOS } from "../../utils/contabilidad";
import { mesAnteriorLima, periodoDeMes } from "../../utils/bancos";
import TablaScroll from "../TablaScroll";
import AvisoAccion from "../AvisoAccion";
import BuscadorCuenta from "./BuscadorCuenta";
import ModalAsiento from "./ModalAsiento";

const INP = "border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300";
const fecha = (d) => formatearFecha(d, { day: "2-digit", month: "2-digit", year: "numeric" });
const total = (a, k) => round2(a.lineas.reduce((s, l) => s + (l[k] || 0), 0));
const ASIGNABLES = ["FacturaProveedor", "Comprobante"];

// Asientos automáticos del mes (C2): generar desde compras, ventas y Tesorería; resolver pendientes; contabilizar.
export default function PanelAutomaticos({ cuentas, centrosCosto, puedeGenerar, puedeEscribir }) {
  const [modal, setModal] = useState(null); // asiento abierto para ver o completar
  const [mes, setMes] = useState(mesAnteriorLima());
  const [pendientes, setPendientes] = useState(null);
  const [resultado, setResultado] = useState(null);
  const [borradores, setBorradores] = useState([]);
  const [observados, setObservados] = useState([]);
  const [elegidos, setElegidos] = useState(new Set());
  const [cuentaDe, setCuentaDe] = useState({});
  const [procesando, setProcesando] = useState(false);
  const [aviso, setAviso] = useState("");
  const periodo = periodoDeMes(mes);

  const leer = async (r, msj) => {
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.mensaje || msj);
    return d;
  };
  const cargar = useCallback(async () => {
    if (!/^\d{6}$/.test(periodo)) return;
    try {
      const [p, e] = await Promise.all([
        fetchAuth(`/contabilidad/automaticos/pendientes?periodo=${periodo}`).then((r) => leer(r, "No se pudieron revisar los pendientes.")),
        fetchAuth(`/contabilidad/automaticos/estado?periodo=${periodo}`).then((r) => leer(r, "No se pudieron cargar los borradores.")),
      ]);
      setPendientes(p);
      setBorradores(e.borradores);
      setObservados(e.observados);
      setElegidos(new Set());
    } catch (e) {
      setAviso(e.message || "Error de conexión con el servidor.");
    }
  }, [periodo]);
  useEffect(() => { const t = setTimeout(cargar, 200); return () => clearTimeout(t); }, [cargar]);

  const accion = async (fn) => {
    setProcesando(true);
    try { await fn(); } catch (e) { setAviso(e.message || "Error de conexión con el servidor."); } finally { setProcesando(false); cargar(); }
  };
  const generar = () => accion(async () => {
    const d = await leer(await fetchAuth("/contabilidad/automaticos/generar", { method: "POST", body: JSON.stringify({ periodo }) }), "No se pudieron generar los asientos.");
    setResultado(d);
  });
  // Por selección o todo el mes; los que no se pueden contabilizar se informan y los demás siguen.
  const contabilizar = (todoElMes) => accion(async () => {
    const cuerpo = todoElMes ? { periodo } : { ids: [...elegidos] };
    const d = await leer(await fetchAuth("/contabilidad/automaticos/contabilizar", { method: "POST", body: JSON.stringify(cuerpo) }), "No se pudo contabilizar.");
    setAviso(`${d.contabilizados} asiento(s) contabilizados.${d.errores?.length ? ` No se contabilizaron ${d.errores.length}: ${d.errores.slice(0, 5).join(" · ")}${d.errores.length > 5 ? " …" : ""}` : ""}`);
  });
  // Borrador del ajuste al TC SUNAT del último día del mes, con lo ya contabilizado.
  const diferenciaCambio = () => accion(async () => {
    const d = await leer(await fetchAuth("/contabilidad/automaticos/diferencia-cambio", { method: "POST", body: JSON.stringify({ periodo }) }), "No se pudo calcular la diferencia de cambio.");
    setAviso(d.asiento
      ? `Ajuste por diferencia de cambio en borrador (TC compra ${d.tcCompra}, venta ${d.tcVenta}): ganancia ${money(d.ganancia)} y pérdida ${money(d.perdida)}. Revísalo abajo y contabilízalo.`
      : `Sin diferencia de cambio por ajustar al ${formatearFecha(`${d.fecha}T12:00:00-05:00`)}.`);
  });
  const resolver = (a) => accion(async () => {
    await leer(await fetchAuth(`/contabilidad/automaticos/${a._id}/resolver`, { method: "POST" }), "No se pudo resolver.");
  });
  const asignar = (p) => accion(async () => {
    await leer(await fetchAuth("/contabilidad/automaticos/asignar-cuenta", {
      method: "POST", body: JSON.stringify({ tipo: p.origen.tipo, id: p.origen.id, cuenta: cuentaDe[p.origen.id] }),
    }), "No se pudo asignar la cuenta.");
    setCuentaDe((c) => ({ ...c, [p.origen.id]: undefined }));
  });

  // Abre el borrador completo (con todos sus datos) para verlo o completarlo a mano.
  const abrir = async (a) => {
    try {
      const r = await fetchAuth(`/contabilidad/asientos/${a._id}`);
      const d = await r.json().catch(() => ({}));
      if (r.ok) setModal(d);
      else setAviso(d.mensaje || "No se pudo abrir el asiento.");
    } catch {
      setAviso("Error de conexión con el servidor.");
    }
  };

  const alternar = (id) => setElegidos((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const todos = borradores.length > 0 && elegidos.size === borradores.length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="text-xs text-gray-500 block">Periodo</label>
          <input type="month" value={mes} onChange={(e) => setMes(e.target.value)} className={INP} />
        </div>
        {puedeGenerar && (
          <button onClick={generar} disabled={procesando} className="bg-purple-600 text-white px-3 py-2 rounded-lg text-sm hover:bg-purple-700 disabled:opacity-50">
            Generar asientos del mes
          </button>
        )}
        <p className="text-xs text-gray-400 flex-1 min-w-64">
          Crea o actualiza los borradores de compras, ventas, cobros, pagos y movimientos de Tesorería del mes. Lo
          contabilizado no se toca: si su documento cambió o se anuló, se marca abajo.
        </p>
      </div>

      {resultado && (
        <p className="text-sm text-gray-700 bg-purple-50 border border-purple-100 rounded-lg px-3 py-2">
          Creados {resultado.creados} · actualizados {resultado.actualizados} · sin cambios {resultado.sinCambios} ·
          quitados {resultado.quitados} · marcados {resultado.marcados} · pendientes {resultado.pendientes.length}
        </p>
      )}

      {pendientes?.pendientes.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-amber-700">Pendientes: sin asiento hasta completar el dato ({pendientes.pendientes.length})</h3>
          <TablaScroll>
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-gray-500 border-b"><th className="py-2 pr-3">Documento</th><th className="py-2 pr-3">Falta</th><th className="py-2" /></tr></thead>
              <tbody>
                {pendientes.pendientes.map((p) => (
                  <tr key={p.origen.id} className="border-b border-gray-100 align-top">
                    <td className="py-1.5 pr-3">{p.referencia}</td>
                    <td className="py-1.5 pr-3 text-amber-700">{p.faltas.join(" · ")}</td>
                    <td className="py-1.5 w-96">
                      {puedeEscribir && ASIGNABLES.includes(p.origen.tipo) && (
                        <div className="flex gap-2">
                          <BuscadorCuenta cuentas={cuentas} valor={cuentaDe[p.origen.id] || ""} className="flex-1"
                            placeholder={p.origen.tipo === "Comprobante" ? "Cuenta de ingreso" : "Cuenta de gasto"}
                            onChange={(v) => setCuentaDe((c) => ({ ...c, [p.origen.id]: v }))} />
                          <button onClick={() => asignar(p)} disabled={procesando || !cuentaDe[p.origen.id]}
                            className="text-xs bg-gray-900 text-white px-3 rounded-lg disabled:opacity-40">Asignar</button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TablaScroll>
          <p className="text-xs text-gray-400">Las cuentas de bancos, las de los movimientos manuales (por concepto) y el resto se completan en la pestaña Configuración.</p>
        </section>
      )}

      {observados.length > 0 && (
        <section className="space-y-1">
          <h3 className="text-sm font-semibold text-red-700">Contabilizados cuyo documento cambió o se anuló ({observados.length})</h3>
          <p className="text-xs text-gray-500">
            Si no se exportó: anúlalo en la pestaña Asientos y vuelve a generar el mes. Si ya se exportó: registra un
            asiento manual de ajuste (también se exporta) y dalo por resuelto.
          </p>
          <ul className="text-sm text-gray-700 list-disc pl-5">
            {observados.map((a) => (
              <li key={a._id}>
                <span className="font-mono text-xs">{a.cuo}</span> {a.glosa} — {a.origenAnulado ? "documento anulado" : "documento cambiado"}
                {a.exportacion?.lote && <span className="text-xs text-green-700"> · exportado {a.exportacion.numero}</span>}
                {puedeEscribir && <button onClick={() => resolver(a)} disabled={procesando} className="ml-2 text-xs text-purple-600 hover:underline">Dar por resuelto</button>}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-2">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-semibold text-gray-700">Borradores del mes ({borradores.length})</h3>
          <div className="flex-1" />
          {puedeGenerar && (
            <button onClick={diferenciaCambio} disabled={procesando || borradores.some((a) => a.subdiario !== "ajuste")}
              title="Ajusta al tipo de cambio de cierre los saldos en dólares de clientes, proveedores y bancos. Primero contabiliza los borradores del mes."
              className="border border-gray-300 text-gray-700 px-3 py-2 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-40">
              Diferencia de cambio al cierre
            </button>
          )}
          {puedeGenerar && (
            <button onClick={() => contabilizar(true)} disabled={procesando || !borradores.length}
              className="border border-gray-300 text-gray-700 px-3 py-2 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-40">
              Contabilizar todo el mes
            </button>
          )}
          {puedeGenerar && (
            <button onClick={() => contabilizar(false)} disabled={procesando || !elegidos.size}
              className="bg-gray-900 text-white px-3 py-2 rounded-lg text-sm hover:bg-gray-700 disabled:opacity-40">
              Contabilizar seleccionados ({elegidos.size})
            </button>
          )}
        </div>
        <TablaScroll>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 border-b">
                <th className="py-2 pr-3">{puedeGenerar && <input type="checkbox" aria-label="Todos" checked={todos} onChange={() => setElegidos(todos ? new Set() : new Set(borradores.map((a) => a._id)))} />}</th>
                <th className="py-2 pr-3">Fecha</th><th className="py-2 pr-3">Subdiario</th><th className="py-2 pr-3">Glosa</th>
                <th className="py-2 pr-3">Cuentas</th><th className="py-2 pr-3 text-right">Debe S/</th><th className="py-2 pr-3 text-right">Haber S/</th><th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {borradores.map((a) => (
                <tr key={a._id} className="border-b border-gray-100 align-top">
                  <td className="py-1.5 pr-3">{puedeGenerar && <input type="checkbox" checked={elegidos.has(a._id)} onChange={() => alternar(a._id)} />}</td>
                  <td className="py-1.5 pr-3 whitespace-nowrap">{fecha(a.fecha)}</td>
                  <td className="py-1.5 pr-3 whitespace-nowrap">{SUBDIARIOS[a.subdiario]} <span className="text-xs text-gray-400">({a.subdiarioExport})</span></td>
                  <td className="py-1.5 pr-3">{a.glosa}{a.moneda === "USD" && <span className="ml-1 text-xs text-blue-600">US$ · TC {a.tipoCambio}</span>}
                    {a.editadoManualmente && <span className="ml-1 text-xs text-purple-600">· editado a mano</span>}
                    {a.origenCambiado && <span className="ml-1 text-xs text-red-600">· su documento cambió</span>}
                  </td>
                  <td className="py-1.5 pr-3 font-mono text-xs">
                    {a.lineas.map((l, i) => <div key={i}>{l.debe ? "D" : "H"} {l.cuenta} {money(l.debe || l.haber)}</div>)}
                  </td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{money(total(a, "debe"))}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{money(total(a, "haber"))}</td>
                  <td className="py-1.5 text-right">
                    <button onClick={() => abrir(a)} disabled={procesando} className="text-xs text-purple-600 hover:underline disabled:opacity-40">{puedeEscribir ? "Editar" : "Ver"}</button>
                  </td>
                </tr>
              ))}
              {!borradores.length && <tr><td colSpan={8} className="py-4 text-center text-gray-400 text-sm">Sin borradores en el periodo</td></tr>}
            </tbody>
          </table>
        </TablaScroll>
      </section>
      {modal && (
        <ModalAsiento asiento={modal} cuentas={cuentas} centrosCosto={centrosCosto} puedeEscribir={puedeEscribir}
          onClose={() => setModal(null)} onGuardado={() => { setModal(null); cargar(); }} />
      )}
      {aviso && <AvisoAccion mensaje={aviso} onCerrar={() => setAviso("")} />}
    </div>
  );
}
