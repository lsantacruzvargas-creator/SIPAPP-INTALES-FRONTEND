import { useState, useEffect, useCallback } from "react";
import { fetchAuth } from "../../utils/fetchAuth";
import { money, idDe } from "../../utils/compras";
import { periodoDeMes, textoPeriodo } from "../../utils/bancos";
import { totalesPlanilla, filasExcelPlanilla, textoPension } from "../../utils/planilla";
import { tramitesPendientesEnMes } from "../../utils/tregistro";
import { exportarHoja } from "../../utils/exportarTabla";
import { generarBoletaPdf, generarBoletasPdf, generarBoletasZip } from "../../utils/boletaPdf";
import { avisosDescargaBoletas } from "../../utils/boletasMasa";
import { abonadoTotal, porAbonar, abonadoMayorQueNeto } from "../../utils/abonos";
import TablaScroll from "../TablaScroll";
import AvisoAccion from "../AvisoAccion";
import ConfirmacionAccion from "../ConfirmacionAccion";
import ModalBoleta from "./ModalBoleta";
import ModalReportePlanilla from "./ModalReportePlanilla";
import PanelAbonos from "./PanelAbonos";

const INP = "border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300";

// Planilla de un mes: se genera con los trabajadores vigentes, se completa boleta por boleta y se cierra. Cerrada,
// de ella salen los archivos del PLAME y el asiento contable (Contabilidad → Automáticos).
export default function PanelPlanillaMes({ mes, setMes, catalogos, puedeEscribir, refrescarAvisos, avisosGenerales = [] }) {
  const periodo = periodoDeMes(mes);
  const [cargado, setCargado] = useState(null);
  const [abonos, setAbonos] = useState(null);
  const [aviso, setAviso] = useState("");
  const [procesando, setProcesando] = useState(false);
  const [confirmando, setConfirmando] = useState(null); // "cerrar" | "reabrir"
  const [boleta, setBoleta] = useState(null);
  const [verReporte, setVerReporte] = useState(false);
  const [tramitesPendientes, setTramitesPendientes] = useState(0);
  const [generando, setGenerando] = useState(null); // "zip" | "pdf" mientras se arman las boletas
  const [resultadoBoletas, setResultadoBoletas] = useState({ clave: "", avisos: [], error: "" });
  // Avisos del último «Generar» / «Recalcular» del mes: quedan a la vista hasta que se cierran o se vuelve a recalcular.
  const [avisosGenerar, setAvisosGenerar] = useState({ periodo: "", lista: [] });

  const cargar = useCallback(async () => {
    if (!/^\d{6}$/.test(periodo)) return;
    try {
      const [r, rt, ra] = await Promise.all([
        fetchAuth(`/planilla/${periodo}`),
        fetchAuth("/planilla/tregistro/trabajadores").catch(() => null),
        fetchAuth(`/planilla/abonos?periodo=${periodo}`).catch(() => null),
      ]);
      const d = await r.json().catch(() => ({}));
      if (r.ok) setCargado(d); else setAviso(d.mensaje || "No se pudo cargar la planilla.");
      const da = ra?.ok ? await ra.json().catch(() => null) : null;
      setAbonos(da || { periodo, error: "No se pudieron cargar los lotes de abono." });
      const lista = rt?.ok ? await rt.json().catch(() => []) : [];
      setTramitesPendientes(Array.isArray(lista) ? tramitesPendientesEnMes(lista, periodo) : 0);
    } catch {
      setAviso("Error de conexión con el servidor.");
    }
  }, [periodo]);
  useEffect(() => { const t = setTimeout(cargar, 200); return () => clearTimeout(t); }, [cargar]);
  // Al cambiar de mes no se muestra el anterior mientras llega el nuevo.
  const datos = cargado?.periodo === periodo ? cargado : null;
  const datosAbonos = abonos?.periodo === periodo ? abonos : null;

  const accion = async (ruta, textoError) => {
    setProcesando(true);
    try {
      const r = await fetchAuth(`/planilla/${periodo}/${ruta}`, { method: "POST" });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) return setAviso(d.mensaje || textoError);
      if (ruta === "generar") setAvisosGenerar({ periodo, lista: d.avisos || [] });
      await cargar();
      refrescarAvisos?.();
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
  const listaAvisosGenerar = avisosGenerar.periodo === periodo ? avisosGenerar.lista : [];
  const motivosDesactualizada = (!cerrada && datos?.motivosDesactualizada) || [];
  const netoNegativo = boletas.filter((b) => b.totales.neto < 0).map((b) => b.datos.nombre);
  const abonadoDeMas = datosAbonos?.abonado
    ? boletas.filter((b) => b.totales.neto >= 0 && abonadoMayorQueNeto(b, datosAbonos.abonado[idDe(b.trabajador)])).map((b) => b.datos.nombre) : [];
  // Lo que conviene revisar antes de congelar las boletas: se resume en la confirmación de «Cerrar planilla».
  const avisosAlCerrar = [
    ...(motivosDesactualizada.length ? [`La planilla está desactualizada (${motivosDesactualizada.join("; ")}): recalcúlala antes de cerrar`] : []),
    ...(netoNegativo.length ? [`El neto sale negativo para ${netoNegativo.join(", ")}: no se podrá cerrar`] : []),
    ...(abonadoDeMas.length ? [`Abonado mayor que el neto: ${abonadoDeMas.join(", ")}`] : []),
    ...(tramitesPendientes > 0 ? [`${tramitesPendientes} trámite(s) pendientes en T-Registro`] : []),
    ...listaAvisosGenerar,
    ...avisosGenerales,
  ];
  const exportar = () => exportarHoja(`planilla-${periodo}.xlsx`, "Planilla", filasExcelPlanilla(boletas, catalogos.afps), [{
    "Trabajador": "TOTAL", "Total ingresos": totales.ingresos, "Descuentos": totales.descuentos, "Neto a pagar": totales.neto, "EsSalud y EPS": totales.aportesEmpleador,
  }]);

  // Los avisos y el error de la descarga son de ese mes y estado: al cambiar alguno ya no se muestran.
  const claveBoletas = `${periodo}|${planilla?.estado}`;
  const { avisos: avisosBoletas, error: errorBoletas } = resultadoBoletas.clave === claveBoletas ? resultadoBoletas : { avisos: [], error: "" };

  const borrador = !cerrada;
  const descargarBoletas = async (formato) => {
    const clave = claveBoletas;
    setResultadoBoletas({ clave, avisos: avisosDescargaBoletas(boletas, { cerrada }), error: "" });
    setGenerando(formato);
    // Cede el hilo para que se pinte «Generando…» antes de que jsPDF bloquee la pantalla.
    await new Promise((r) => setTimeout(r, 30));
    try {
      const opciones = { empleador: catalogos.empleador, afps: catalogos.afps, borrador, periodo };
      if (formato === "zip") await generarBoletasZip(boletas, opciones); else generarBoletasPdf(boletas, opciones);
    } catch (e) {
      console.error(e);
      setResultadoBoletas((r) => ({ ...r, clave, error: "No se pudieron generar las boletas. Vuelve a intentarlo." }));
    } finally {
      setGenerando(null);
    }
  };

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
        {boletas.length > 0 && <button onClick={() => setVerReporte(true)} className="border border-gray-300 text-gray-700 px-3 py-2 rounded-lg text-sm hover:bg-gray-50">Reporte del mes</button>}
        {boletas.length > 0 && (
          <>
            <button onClick={() => descargarBoletas("zip")} disabled={!!generando} className="border border-gray-300 text-gray-700 px-3 py-2 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50">
              {generando === "zip" ? "Generando…" : "Descargar boletas (.zip)"}
            </button>
            <button onClick={() => descargarBoletas("pdf")} disabled={!!generando} className="border border-gray-300 text-gray-700 px-3 py-2 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50">
              {generando === "pdf" ? "Generando…" : "Imprimir todas (PDF)"}
            </button>
          </>
        )}
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
      {motivosDesactualizada.length > 0 && (
        <div className="text-sm text-amber-800 bg-amber-50 border border-amber-300 rounded-lg px-3 py-2 flex flex-wrap items-start gap-3">
          <div className="flex-1 min-w-[16rem]">
            <p className="font-medium">La planilla está desactualizada: los montos no reflejan los cambios hechos después de generarla.</p>
            <ul className="list-disc pl-5 mt-1">{motivosDesactualizada.map((m) => <li key={m}>{m}</li>)}</ul>
          </div>
          {puedeEscribir && (
            <button onClick={() => accion("generar", "No se pudo recalcular la planilla.")} disabled={procesando}
              className="bg-amber-600 text-white px-3 py-1.5 rounded-lg text-sm hover:bg-amber-700 disabled:opacity-50">
              {procesando ? "Recalculando…" : "Recalcular"}
            </button>
          )}
        </div>
      )}
      {listaAvisosGenerar.length > 0 && (
        <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex gap-3">
          <ul className="flex-1 list-disc pl-5">{listaAvisosGenerar.map((a) => <li key={a}>{a}</li>)}</ul>
          <button onClick={() => setAvisosGenerar({ periodo: "", lista: [] })} className="text-xs underline self-start">Cerrar</button>
        </div>
      )}
      {avisosBoletas.length > 0 && (
        <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex gap-3">
          <ul className="flex-1 list-disc pl-5">{avisosBoletas.map((a) => <li key={a}>{a}</li>)}</ul>
          <button onClick={() => setResultadoBoletas((r) => ({ ...r, avisos: [] }))} className="text-xs underline self-start">Cerrar</button>
        </div>
      )}
      {errorBoletas && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{errorBoletas}</p>}
      {tramitesPendientes > 0 && (
        <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          {tramitesPendientes} trámite(s) pendientes en T-Registro (no bloquea la planilla).
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
              <th className="py-2 pr-3 text-right">Neto a pagar</th><th className="py-2 pr-3 text-right">Abonado</th><th className="py-2 pr-3 text-right">Por abonar</th>
              <th className="py-2 pr-3 text-right">EsSalud / EPS</th><th className="py-2" />
            </tr>
          </thead>
          <tbody>
            {boletas.map((b) => {
              const abonado = datosAbonos?.abonado?.[idDe(b.trabajador)];
              return (
              <tr key={b._id} className="border-b border-gray-100">
                <td className="py-1.5 pr-3">{b.datos.nombre}<span className="block text-xs text-gray-400">{b.datos.numDoc} · {b.datos.cargo || "Sin cargo"}</span></td>
                <td className="py-1.5 pr-3 text-xs">{textoPension(b.datos.pension, catalogos.afps)}</td>
                <td className="py-1.5 pr-3 text-right tabular-nums">{b.dias?.remunerados}</td>
                <td className="py-1.5 pr-3 text-right tabular-nums">{money(b.totales.ingresos)}</td>
                <td className="py-1.5 pr-3 text-right tabular-nums">{money(b.totales.descuentos)}</td>
                <td className="py-1.5 pr-3 text-right tabular-nums">{money(b.totales.aportesTrabajador)}</td>
                <td className={`py-1.5 pr-3 text-right tabular-nums font-medium ${b.totales.neto < 0 ? "text-red-600" : ""}`}>{money(b.totales.neto)}</td>
                <td className="py-1.5 pr-3 text-right tabular-nums">
                  {datosAbonos?.abonado ? money(abonadoTotal(abonado)) : "—"}
                  {abonado?.adelantos > 0 && <span className="block text-xs text-gray-400">con adelanto {money(abonado.adelantos)}</span>}
                </td>
                <td className="py-1.5 pr-3 text-right tabular-nums">
                  {datosAbonos?.abonado ? money(porAbonar(b, abonado)) : "—"}
                  {datosAbonos?.abonado && abonadoMayorQueNeto(b, abonado) && <span className="block text-xs text-red-600">Abonado mayor que el neto</span>}
                </td>
                <td className="py-1.5 pr-3 text-right tabular-nums">{money(b.totales.aportesEmpleador)}</td>
                <td className="py-1.5 text-right whitespace-nowrap">
                  <button onClick={() => setBoleta(b)} className="text-xs text-purple-600 hover:underline mr-3">{puedeEscribir && !cerrada ? "Editar" : "Ver"}</button>
                  <button onClick={() => generarBoletaPdf(b, { empleador: catalogos.empleador, afps: catalogos.afps, borrador })} className="text-xs text-gray-600 hover:underline">PDF</button>
                </td>
              </tr>
              );
            })}
            {datos && boletas.length === 0 && (
              <tr><td colSpan={11} className="py-6 text-center text-gray-400 text-sm">
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
                <td colSpan={2} />
                <td className="py-2 pr-3 text-right tabular-nums">{money(totales.aportesEmpleador)}</td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </TablaScroll>

      {planilla && <PanelAbonos periodo={periodo} lotes={datosAbonos?.lotes ?? null} error={datosAbonos?.error} puedeEscribir={puedeEscribir} onCambio={cargar} />}

      {boleta && (
        <ModalBoleta key={boleta._id} boleta={boleta} catalogos={catalogos} editable={puedeEscribir && !cerrada} borrador={borrador}
          onClose={() => setBoleta(null)} onCambio={cargar} />
      )}
      {verReporte && (
        <ModalReportePlanilla boletas={boletas} contexto={{ empleador: catalogos.empleador, periodo, cerrada }} onClose={() => setVerReporte(false)} />
      )}
      {confirmando && (
        <ConfirmacionAccion procesando={procesando} onCancelar={() => setConfirmando(null)}
          textoConfirmar={confirmando === "cerrar" ? "Sí, cerrar" : "Sí, reabrir"} textoProcesando={confirmando === "cerrar" ? "Cerrando…" : "Reabriendo…"}
          mensaje={confirmando === "cerrar" ? (
            <div className="space-y-2">
              <p>¿Cerrar la planilla de {textoPeriodo(periodo)}? Las boletas quedan fijas y se habilitan el asiento y los archivos del PLAME.</p>
              <p className="font-medium">{boletas.length} {boletas.length === 1 ? "trabajador" : "trabajadores"} · Neto a pagar {money(totales.neto)}</p>
              {avisosAlCerrar.length > 0 && (
                <div className="text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  <p className="font-medium">Avisos vigentes:</p>
                  <ul className="list-disc pl-5">{avisosAlCerrar.map((a) => <li key={a}>{a}</li>)}</ul>
                </div>
              )}
            </div>
          ) : `¿Reabrir la planilla de ${textoPeriodo(periodo)}? Si ya declaraste el PLAME con ella, tendrás que rectificar.`}
          onConfirmar={() => accion(confirmando, "No se pudo completar la acción.")} />
      )}
      {aviso && <AvisoAccion mensaje={aviso} onCerrar={() => setAviso("")} />}
    </div>
  );
}
