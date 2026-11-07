import { useState, useEffect } from "react";
import { fetchAuth } from "../../utils/fetchAuth";
import { fechaHoyLima, formatearFecha } from "../../utils/fecha";
import { PERFIL_VACIO, errorFechaSctr, limiteFechaSctr, beneficiosDeFormulario, cuerpoBeneficios, errorBeneficios, textoHistorialBeneficios, avisoBeneficios } from "../../utils/perfilLaboral";
import { Texto, Casilla } from "./FichaTRegistro";

const INP = "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300 disabled:bg-gray-50";
const ORIGEN = { manual: "Definido a mano", calculado: "Calculado por el sistema", pendiente: "Pendiente de confirmar" };

function Seccion({ titulo, ayuda, children }) {
  return (
    <section className="border border-gray-200 rounded-xl p-4 space-y-3">
      <div>
        <h3 className="text-xs font-bold text-gray-600 uppercase">{titulo}</h3>
        {ayuda && <p className="text-[11px] text-gray-400 mt-0.5">{ayuda}</p>}
      </div>
      {children}
    </section>
  );
}

function Selector({ etiqueta, valor, onChange, opciones, ancho = "" }) {
  return (
    <label className={`text-xs text-gray-500 ${ancho}`}>{etiqueta}
      <select value={valor} onChange={onChange} className={INP}>
        {opciones.map(([v, n]) => <option key={v} value={v}>{n}</option>)}
      </select>
    </label>
  );
}

// El servidor devuelve fechas nulas y tasas en 0: en el formulario van como texto vacío.
const aFormulario = ({ regimenLaboral, perfil }) => {
  const f = structuredClone(PERFIL_VACIO);
  const vacio = (v) => (v == null || v === 0 ? "" : v);
  return {
    ...f, ...perfil, regimenLaboral,
    remype: { ...perfil.remype, desde: perfil.remype.desde || "" },
    beneficios: beneficiosDeFormulario(perfil.beneficios),
    sctr: {
      ...perfil.sctr,
      salud: { ...perfil.sctr.salud, tasa: vacio(perfil.sctr.salud.tasa) },
      pension: { ...perfil.sctr.pension, tasa: vacio(perfil.sctr.pension.tasa) },
    },
    vidaLey: { ...perfil.vidaLey, vigenciaDesde: perfil.vidaLey.vigenciaDesde || "", vigenciaHasta: perfil.vidaLey.vigenciaHasta || "", valor: vacio(perfil.vidaLey.valor) },
  };
};

const codigosSctr = (s) => (s.actividadRiesgo ? `${s.salud.entidad}/${s.pension.entidad}` : null);

// Perfil laboral del empleador: lo editan admin y contador, lo ve también jefatura.
export default function PanelPerfilLaboral({ catalogos, puedeEscribir, onGuardado }) {
  const [form, setForm] = useState(() => ({ regimenLaboral: "general", ...structuredClone(PERFIL_VACIO) }));
  const [base, setBase] = useState(null); // lo último guardado: sirve para saber si cambió una entidad del SCTR
  const [baseBeneficios, setBaseBeneficios] = useState(null);
  const [conteo, setConteo] = useState(null);
  const [avisos, setAvisos] = useState([]);
  const [senatiTocado, setSenatiTocado] = useState(false);
  const [sctrFecha, setSctrFecha] = useState(fechaHoyLima);
  const [error, setError] = useState("");
  const [guardado, setGuardado] = useState(false);
  const [guardando, setGuardando] = useState(false);

  const recibir = (d) => {
    setForm(aFormulario(d));
    setBase(d.perfil.sctr);
    setBaseBeneficios(beneficiosDeFormulario(d.perfil.beneficios));
    setConteo(d.conteo);
    setAvisos([...(d.cambioPerfil ? [d.cambioPerfil.texto] : []), ...d.avisos]);
    setSenatiTocado(false);
    setSctrFecha(fechaHoyLima());
  };

  useEffect(() => {
    let vigente = true;
    fetchAuth("/planilla/perfil")
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!vigente) return;
        if (r.ok) recibir(d); else setError(d.mensaje || "No se pudo cargar el perfil laboral.");
      })
      .catch(() => { if (vigente) setError("Error de conexión con el servidor."); });
    return () => { vigente = false; };
  }, []);

  const poner = (ruta, valor) => {
    setGuardado(false);
    setForm((f) => {
      const n = structuredClone(f);
      const claves = ruta.split(".");
      const hoja = claves.slice(0, -1).reduce((o, k) => o[k], n);
      hoja[claves.at(-1)] = valor;
      return n;
    });
  };
  const handleChange = (ruta) => (e) => poner(ruta, e.target.type === "checkbox" ? e.target.checked : e.target.value);
  const handleSenati = (ruta) => (e) => {
    setSenatiTocado(true);
    handleChange(ruta)(e);
  };

  if (!base) return error ? <p className="text-sm text-red-600">{error}</p> : <p className="text-sm text-gray-400">Cargando…</p>;

  const anioActual = Number(fechaHoyLima().slice(0, 4));
  const pideFecha = codigosSctr(form.sctr) !== codigosSctr(base);
  // Alta de la cobertura (antes sin SCTR): inicio hasta +30 días. Baja o cambio de entidad cierran la anterior: fin hasta +5.
  const cierra = codigosSctr(base) !== null;
  const { sctr, vidaLey, senati, beneficios } = form;
  const avisoBen = avisoBeneficios(beneficios, baseBeneficios);
  const historialBen = textoHistorialBeneficios(baseBeneficios.historial);

  const guardar = async () => {
    if (form.ciiu.codigo && !/^\d{4}$/.test(form.ciiu.codigo)) return setError("El CIIU debe tener 4 dígitos.");
    const errorBen = errorBeneficios(form.beneficios, baseBeneficios);
    if (errorBen) return setError(errorBen);
    const errorSctr = pideFecha && errorFechaSctr(sctrFecha, fechaHoyLima(), { cierra });
    if (errorSctr) return setError(errorSctr);
    setGuardando(true);
    setError("");
    try {
      const body = {
        regimenLaboral: form.regimenLaboral,
        remype: form.remype,
        ciiu: form.ciiu,
        actividadIndustrial: form.actividadIndustrial,
        sctr: {
          actividadRiesgo: sctr.actividadRiesgo,
          salud: { ...sctr.salud, tasa: Number(sctr.salud.tasa) || 0 },
          pension: { ...sctr.pension, tasa: Number(sctr.pension.tasa) || 0 },
        },
        vidaLey: { ...vidaLey, valor: Number(vidaLey.valor) || 0 },
      };
      const cambioBen = cuerpoBeneficios(form.beneficios, baseBeneficios);
      if (cambioBen) body.beneficios = cambioBen;
      if (senatiTocado) body.senati = { anio: Number(senati.anio) || anioActual, aporta: senati.aporta };
      if (pideFecha) body.sctrFecha = sctrFecha;
      const r = await fetchAuth("/planilla/perfil", { method: "PUT", body: JSON.stringify(body) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) return setError(d.mensaje || "No se pudo guardar el perfil laboral.");
      recibir(d);
      setGuardado(true);
      onGuardado?.(d);
    } catch {
      setError("Error de conexión con el servidor.");
    } finally {
      setGuardando(false);
    }
  };

  const regimenes = Object.entries(catalogos.regimenes).map(([k, v]) => [k, v.nombre]);
  const cambios = [...form.cambios].reverse();

  return (
    <div className="space-y-4 max-w-4xl">
      <p className="text-sm text-gray-500">
        Datos del empleador que gobiernan la planilla: régimen laboral, registro de beneficios sociales, SENATI, SCTR y vida ley. Los cambios aplican a las planillas en borrador al regenerarlas;
        las planillas cerradas no se modifican.
      </p>
      <fieldset disabled={!puedeEscribir || guardando} className="space-y-4 border-0 p-0 m-0 min-w-0">
        <Seccion titulo="Empresa">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 items-end">
            <Selector etiqueta="Régimen laboral" valor={form.regimenLaboral} onChange={handleChange("regimenLaboral")} opciones={regimenes} ancho="col-span-2" />
            <div className="col-span-2 md:col-span-1"><Casilla etiqueta="Inscrita en REMYPE" valor={form.remype.inscrita} onChange={handleChange("remype.inscrita")} /></div>
            <Texto etiqueta="Inscrita desde" type="date" valor={form.remype.desde} onChange={handleChange("remype.desde")} />
            <Texto etiqueta="CIIU (4 dígitos)" valor={form.ciiu.codigo} max={4} inputMode="numeric" onChange={(e) => poner("ciiu.codigo", e.target.value.replace(/\D/g, ""))} />
            <Texto etiqueta="Descripción de la actividad" valor={form.ciiu.descripcion} max={120} ancho="col-span-2 md:col-span-3" onChange={handleChange("ciiu.descripcion")} />
            <div className="col-span-2 md:col-span-4">
              <Casilla etiqueta="Actividad industrial (SENATI alcanza a todos los trabajadores)" valor={form.actividadIndustrial} onChange={handleChange("actividadIndustrial")} />
            </div>
          </div>
        </Seccion>

        <Seccion titulo="Registro de beneficios sociales" ayuda="Cómo se registra el gasto de la CTS, las gratificaciones y las vacaciones. Con provisión, cada planilla mensual devenga el gasto contra las cuentas por pagar; no cambia el neto de la boleta.">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 items-end">
            <Selector etiqueta="Registro" valor={beneficios.registro} onChange={handleChange("beneficios.registro")} ancho="col-span-2"
              opciones={[["gasto", "Gasto al pagar"], ["provision", "Provisión mensual"]]} />
            <Texto etiqueta="Rige desde" type="month" valor={beneficios.desde} onChange={handleChange("beneficios.desde")} />
          </div>
          {historialBen.length > 0 ? (
            <ul className="text-xs text-gray-600 space-y-0.5">
              {historialBen.map((t, i) => <li key={i}>{t}</li>)}
            </ul>
          ) : <p className="text-xs text-gray-400">Sin elección guardada: se registra como gasto al pagar.</p>}
          {avisoBen && <p className="text-[11px] bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-3 py-2">{avisoBen}</p>}
          <p className="text-[11px] text-gray-400">Las planillas cerradas no cambian. Elegir otra vez un mes ya guardado reescribe la elección desde ese mes.</p>
        </Seccion>

        <Seccion titulo="SENATI" ayuda="Aporte del 0,75 % de la planilla. Obligan más de 20 trabajadores en el promedio del año anterior (Ley 26272, art. 13).">
          {senati.origen === "pendiente" && (
            <p className="text-sm bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-3 py-2">
              El sistema no pudo evaluar el año anterior completo y mantuvo el valor. Revisa el promedio y confirma el valor.
              {" "}{senatiTocado
                ? <b>Se confirmará al guardar.</b>
                : <button type="button" onClick={() => setSenatiTocado(true)} className="underline font-medium hover:text-amber-900">Confirmar el valor actual</button>}
            </p>
          )}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 items-end">
            <Texto etiqueta="Año de vigencia" valor={senati.anio ?? ""} placeholder={String(anioActual)} inputMode="numeric" max={4}
              onChange={(e) => { setSenatiTocado(true); poner("senati.anio", e.target.value ? Number(e.target.value.replace(/\D/g, "")) : null); }} />
            <div className="col-span-2"><Casilla etiqueta="La empresa aporta a SENATI este año" valor={senati.aporta} onChange={handleSenati("senati.aporta")} /></div>
            <p className="text-xs text-gray-500">Origen: <b>{ORIGEN[senati.origen] || senati.origen}</b></p>
          </div>
          {conteo && (
            <p className="text-xs text-gray-500">
              Trabajadores con vínculo en el mes actual: <b>{conteo.mesActual}</b>.{" "}
              {conteo.promedioAnterior
                ? <>Promedio de {conteo.promedioAnterior.anio} con SENATI marcado: <b>{conteo.promedioAnterior.promedio}</b> en {conteo.promedioAnterior.meses} {conteo.promedioAnterior.meses === 1 ? "mes" : "meses"} con planilla.</>
                : "Sin planillas del año anterior en el sistema."}
            </p>
          )}
          {senati.evaluaciones.length > 0 && (
            <table className="w-full text-xs">
              <thead><tr className="text-left text-gray-500 border-b">{["Año evaluado", "Promedio", "Meses", "Obliga", "Estado"].map((h) => <th key={h} className="py-1 pr-2">{h}</th>)}</tr></thead>
              <tbody>
                {senati.evaluaciones.map((e, i) => (
                  <tr key={i} className="border-b border-gray-100">
                    <td className="py-1 pr-2">{e.anio}</td><td className="pr-2">{e.promedio}</td><td className="pr-2">{e.meses}</td>
                    <td className="pr-2">{e.obliga ? "Sí" : "No"}</td>
                    <td>{e.aplicada ? "Aplicada" : e.confirmadoPor ? `Confirmada por ${e.confirmadoPor}` : "Pendiente de confirmar"}{e.fecha ? ` · ${formatearFecha(e.fecha, { day: "2-digit", month: "2-digit", year: "numeric" })}` : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Seccion>

        <Seccion titulo="SCTR" ayuda="Seguro complementario de trabajo de riesgo, solo para los trabajadores marcados como expuestos en su ficha. Se paga con la factura de la aseguradora.">
          <Casilla etiqueta="La empresa tiene actividad de riesgo" valor={sctr.actividadRiesgo} onChange={handleChange("sctr.actividadRiesgo")} />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 items-end">
            <Selector etiqueta="Salud" valor={sctr.salud.entidad} onChange={handleChange("sctr.salud.entidad")} opciones={[["essalud", "EsSalud"], ["eps", "EPS"]]} />
            {sctr.salud.entidad === "eps" && <Texto etiqueta="EPS" valor={sctr.salud.eps} max={60} onChange={handleChange("sctr.salud.eps")} />}
            <Texto etiqueta="Tasa de salud (%)" type="number" min="0" max="100" step="0.01" valor={sctr.salud.tasa} onChange={handleChange("sctr.salud.tasa")} />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 items-end">
            <Selector etiqueta="Pensión" valor={sctr.pension.entidad} onChange={handleChange("sctr.pension.entidad")} opciones={[["onp", "ONP"], ["privada", "Compañía privada"]]} />
            {sctr.pension.entidad === "privada" && <Texto etiqueta="Aseguradora" valor={sctr.pension.aseguradora} max={60} onChange={handleChange("sctr.pension.aseguradora")} />}
            <Texto etiqueta="Tasa de pensión (%)" type="number" min="0" max="100" step="0.01" valor={sctr.pension.tasa} onChange={handleChange("sctr.pension.tasa")} />
          </div>
          {pideFecha && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-1">
              <Texto etiqueta="Fecha del cambio" type="date" valor={sctrFecha} onChange={(e) => setSctrFecha(e.target.value)} ancho="block max-w-xs" ayuda={`Hasta el ${formatearFecha(limiteFechaSctr(fechaHoyLima(), { cierra }))}`} />
              <p className="text-[11px] text-amber-800">
                Cambió la cobertura del SCTR: los trabajadores marcados y ya registrados en T-Registro quedan con una modificación pendiente en esa fecha.
              </p>
            </div>
          )}
        </Seccion>

        <Seccion titulo="Vida ley" ayuda="Obligatoria desde el primer día de cada trabajador. Se paga con la factura de la aseguradora.">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 items-end">
            <Texto etiqueta="Aseguradora" valor={vidaLey.aseguradora} max={60} ancho="col-span-2" onChange={handleChange("vidaLey.aseguradora")} />
            <Texto etiqueta="Póliza" valor={vidaLey.poliza} max={40} ancho="col-span-2" onChange={handleChange("vidaLey.poliza")} />
            <Texto etiqueta="Vigente desde" type="date" valor={vidaLey.vigenciaDesde} onChange={handleChange("vidaLey.vigenciaDesde")} />
            <Texto etiqueta="Vigente hasta" type="date" valor={vidaLey.vigenciaHasta} onChange={handleChange("vidaLey.vigenciaHasta")} />
            <Selector etiqueta="Cálculo" valor={vidaLey.calculo} onChange={handleChange("vidaLey.calculo")} opciones={[["tasa", "Tasa sobre la remuneración"], ["monto", "Monto fijo por trabajador"]]} />
            <Texto etiqueta={vidaLey.calculo === "tasa" ? "Tasa (%)" : "Monto por trabajador (S/)"} type="number" min="0" step="0.01" valor={vidaLey.valor} onChange={handleChange("vidaLey.valor")} />
          </div>
        </Seccion>
      </fieldset>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {guardado && <p className="text-sm text-green-700">Perfil laboral guardado.</p>}
      {avisos.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-sm text-amber-800 space-y-1">
          {avisos.map((a, i) => <p key={i}>{a}</p>)}
        </div>
      )}
      {puedeEscribir && (
        <button onClick={guardar} disabled={guardando} className="bg-purple-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-purple-700 disabled:opacity-50">
          {guardando ? "Guardando…" : "Guardar perfil laboral"}
        </button>
      )}

      <Seccion titulo="Historial de cambios">
        {cambios.length === 0 ? <p className="text-xs text-gray-400">Aún no hay cambios registrados.</p> : (
          <table className="w-full text-xs">
            <thead><tr className="text-left text-gray-500 border-b">{["Fecha", "Por", "Campos"].map((h) => <th key={h} className="py-1 pr-2">{h}</th>)}</tr></thead>
            <tbody>
              {cambios.map((c, i) => (
                <tr key={i} className="border-b border-gray-100 align-top">
                  <td className="py-1 pr-2 whitespace-nowrap">{formatearFecha(c.fecha, { day: "2-digit", month: "2-digit", year: "numeric" })}</td>
                  <td className="pr-2">{c.por}</td>
                  <td className="font-mono text-[11px] text-gray-600">{c.campos.join(", ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Seccion>
    </div>
  );
}
