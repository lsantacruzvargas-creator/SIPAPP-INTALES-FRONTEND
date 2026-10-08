import { useState, useEffect, useCallback } from "react";
import { fetchAuth } from "../../utils/fetchAuth";
import { money } from "../../utils/compras";
import { periodoDeMes, textoPeriodo } from "../../utils/bancos";
import { totalesPlanilla, filasExcelPlanilla, textoPension } from "../../utils/planilla";
import { exportarHoja } from "../../utils/exportarTabla";
import { generarBoletaPdf } from "../../utils/boletaPdf";
import TablaScroll from "../TablaScroll";
import AvisoAccion from "../AvisoAccion";
import ConfirmacionAccion from "../ConfirmacionAccion";
import ModalBoleta from "./ModalBoleta";

const INP = "border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300";

// Planilla de un mes: se genera con los trabajadores vigentes, se completa boleta por boleta y se cierra. Cerrada,
// de ella salen los archivos del PLAME y el asiento contable (Contabilidad → Automáticos).
export default function PanelPlanillaMes({ mes, setMes, catalogos, puedeEscribir }) {
  const periodo = periodoDeMes(mes);
  const [cargado, setCargado] = useState(null);
  const [aviso, setAviso] = useState("");
  const [procesando, setProcesando] = useState(false);
  const [confirmando, setConfirmando] = useState(null); // "cerrar" | "reabrir"
  const [boleta, setBoleta] = useState(null);

  const cargar = useCallback(async () => {
    if (!/^\d{6}$/.test(periodo)) return;
    try {
      const r = await fetchAuth(`/planilla/${periodo}`);
      const d = await r.json().catch(() => ({}));
      if (r.ok) setCargado(d); else setAviso(d.mensaje || "No se pudo cargar la planilla.");
    } catch {
      setAviso("Error de conexión con el servidor.");
    }
  }, [periodo]);
  useEffect(() => { const t = setTimeout(cargar, 200); return () => clearTimeout(t); }, [cargar]);
  // Al cambiar de mes no se muestra el anterior mientras llega el nuevo.
  const datos = cargado?.periodo === periodo ? cargado : null;

  const accion = async (ruta, textoError) => {
    setProcesando(true);
    try {
      const r = await fetchAuth(`/planilla/${periodo}/${ruta}`, { method: "POST" });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) return setAviso(d.mensaje || textoError);
      if (d.avisos?.length) setAviso(d.avisos.join(" · "));
      await cargar();
    } catch {
      setAviso("Error de conexión con el servidor.");
    } finally {
      setProcesando(false);
      setConfirmando(null);
    }
  };

  const planilla = datos?.planilla, boletas = datos?.boletas || [];
  const cerrada = planilla?.estado === "cerrada";
  const totales = totalesPlanilla(boletas);
  const exportar = () => exportarHoja(`planilla-${periodo}.xlsx`, "Planilla", filasExcelPlanilla(boletas, catalogos.afps), [{
    "Trabajador": "TOTAL", "Total ingresos": totales.ingresos, "Descuentos": totales.descuentos, "Neto a pagar": totales.neto, "EsSalud y EPS": totales.aportesEmpleador,
  }]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="text-xs text-gray-500 block">Mes</label>
          <input type="month" value={mes} onChange={(e) => setMes(e.target.value)} className={INP} />
        </div>
        {planilla && (
          <span className={`text-xs px-2 py-1 rounded-full mb-2 ${cerrada ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>
            {cerrada ? `Cerrada por ${planilla.cerradaPor}` : "En borrador"} · {catalogos.regimenes[planilla.regimenLaboral]?.nombre}
          </span>
        )}
        <div className="flex-1" />
        {boletas.length > 0 && <button onClick={exportar} className="border border-gray-300 text-gray-700 px-3 py-2 rounded-lg text-sm hover:bg-gray-50">Exportar Excel</button>}
        {puedeEscribir && !cerrada && (
          <button onClick={() => accion("generar", "No se pudo generar la planilla.")} disabled={procesando || !datos}
            className="border border-purple-300 text-purple-700 px-3 py-2 rounded-lg text-sm hover:bg-purple-50 disabled:opacity-50">
            {planilla ? "Recalcular" : "Generar planilla"}
          </button>
        )}
        {puedeEscribir && planilla && !cerrada && boletas.length > 0 && (
          <button onClick={() => setConfirmando("cerrar")} disabled={procesando} className="bg-purple-600 text-white px-3 py-2 rounded-lg text-sm hover:bg-purple-700 disabled:opacity-50">Cerrar planilla</button>
        )}
        {puedeEscribir && cerrada && (
          <button onClick={() => setConfirmando("reabrir")} disabled={procesando} className="border border-gray-300 text-gray-700 px-3 py-2 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50">Reabrir</button>
        )}
      </div>

      {datos && !datos.parametrosGuardados && (
        <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          Antes de generar, revisa y guarda los parámetros de {textoPeriodo(periodo)} en la pestaña «Parámetros» (las tasas de AFP cambian cada mes).
        </p>
      )}
      {cerrada && (
        <p className="text-xs text-gray-500">
          {datos.asiento ? `Asiento ${datos.asiento.estado}${datos.asiento.estado === "contabilizado" ? ` (${datos.asiento.cuo})` : ""}.` : "Aún sin asiento:"} El asiento sale en Contabilidad → Automáticos
          al generar los asientos del mes; los archivos para SUNAT están en la pestaña «PLAME».
        </p>
      )}

      <TablaScroll>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-gray-500 border-b">
              <th className="py-2 pr-3">Trabajador</th><th className="py-2 pr-3">Pensión</th><th className="py-2 pr-3 text-right">Días</th>
              <th className="py-2 pr-3 text-right">Ingresos</th><th className="py-2 pr-3 text-right">Descuentos</th><th className="py-2 pr-3 text-right">Aportes</th>
              <th className="py-2 pr-3 text-right">Neto a pagar</th><th className="py-2 pr-3 text-right">EsSalud / EPS</th><th className="py-2" />
            </tr>
          </thead>
          <tbody>
            {boletas.map((b) => (
              <tr key={b._id} className="border-b border-gray-100">
                <td className="py-1.5 pr-3">{b.datos.nombre}<span className="block text-xs text-gray-400">{b.datos.numDoc} · {b.datos.cargo || "Sin cargo"}</span></td>
                <td className="py-1.5 pr-3 text-xs">{textoPension(b.datos.pension, catalogos.afps)}</td>
                <td className="py-1.5 pr-3 text-right tabular-nums">{b.dias?.remunerados}</td>
                <td className="py-1.5 pr-3 text-right tabular-nums">{money(b.totales.ingresos)}</td>
                <td className="py-1.5 pr-3 text-right tabular-nums">{money(b.totales.descuentos)}</td>
                <td className="py-1.5 pr-3 text-right tabular-nums">{money(b.totales.aportesTrabajador)}</td>
                <td className={`py-1.5 pr-3 text-right tabular-nums font-medium ${b.totales.neto < 0 ? "text-red-600" : ""}`}>{money(b.totales.neto)}</td>
                <td className="py-1.5 pr-3 text-right tabular-nums">{money(b.totales.aportesEmpleador)}</td>
                <td className="py-1.5 text-right whitespace-nowrap">
                  <button onClick={() => setBoleta(b)} className="text-xs text-purple-600 hover:underline mr-3">{puedeEscribir && !cerrada ? "Editar" : "Ver"}</button>
                  <button onClick={() => generarBoletaPdf(b, { empleador: catalogos.empleador, afps: catalogos.afps })} className="text-xs text-gray-600 hover:underline">PDF</button>
                </td>
              </tr>
            ))}
            {datos && boletas.length === 0 && (
              <tr><td colSpan={9} className="py-6 text-center text-gray-400 text-sm">
                {planilla ? "Ningún trabajador tiene vínculo en este mes" : "Aún no se genera la planilla de este mes"}
              </td></tr>
            )}
          </tbody>
          {boletas.length > 0 && (
            <tfoot>
              <tr className="font-semibold text-gray-700">
                <td className="py-2 pr-3" colSpan={3}>{boletas.length} trabajadores</td>
                <td className="py-2 pr-3 text-right tabular-nums">{money(totales.ingresos)}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{money(totales.descuentos)}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{money(totales.aportesTrabajador)}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{money(totales.neto)}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{money(totales.aportesEmpleador)}</td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </TablaScroll>

      {boleta && (
        <ModalBoleta key={boleta._id} boleta={boleta} catalogos={catalogos} editable={puedeEscribir && !cerrada}
          onClose={() => setBoleta(null)} onCambio={cargar} />
      )}
      {confirmando && (
        <ConfirmacionAccion procesando={procesando} onCancelar={() => setConfirmando(null)}
          textoConfirmar={confirmando === "cerrar" ? "Sí, cerrar" : "Sí, reabrir"}
          mensaje={confirmando === "cerrar"
            ? `¿Cerrar la planilla de ${textoPeriodo(periodo)}? Las boletas quedan fijas y se habilitan el asiento y los archivos del PLAME.`
            : `¿Reabrir la planilla de ${textoPeriodo(periodo)}? Si ya declaraste el PLAME con ella, tendrás que rectificar.`}
          onConfirmar={() => accion(confirmando, "No se pudo completar la acción.")} />
      )}
      {aviso && <AvisoAccion mensaje={aviso} onCerrar={() => setAviso("")} />}
    </div>
  );
}
