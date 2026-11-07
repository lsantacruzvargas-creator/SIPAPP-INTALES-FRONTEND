import { useState, useEffect, useCallback } from "react";
import { fetchAuth, getUsuario } from "../../utils/fetchAuth";
import { money } from "../../utils/compras";
import { nombreTrabajador, textoPension, REGIMENES_SALUD, AREAS, TRABAJADOR_VACIO, formularioDeTrabajador, validarTrabajador, cuerpoDeTrabajador } from "../../utils/planilla";
import TablaScroll from "../TablaScroll";
import AvisoAccion from "../AvisoAccion";
import ConfirmacionAccion from "../ConfirmacionAccion";
import FichaTRegistro from "./FichaTRegistro";
import ModalLiquidacion from "./ModalLiquidacion";
import { TREGISTRO_VACIO, estadoTexto, camposBloqueados, puedeDesbloquear, puedeNuevoVinculo, lineaEdicion } from "../../utils/tregistro";
import { aplicarPrecarga, cambiaSctrRegistrado, errorFechaSctr, limiteFechaSctr } from "../../utils/perfilLaboral";
import { fechaHoyLima } from "../../utils/fecha";
import { liquidacionVigente } from "../../utils/liquidacion";
import { generarLiquidacionPdf } from "../../utils/liquidacionPdf";

const INP = "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300 disabled:bg-gray-50";
const textoTramite = (estado) => {
  if (!estado) return null;
  const { alta, baja } = estadoTexto(estado);
  return <>Alta: {alta}{estado.baja !== "ninguna" && <span className="block">Baja: {baja}</span>}{estado.sctr === "pendiente" && <span className="block text-amber-700">SCTR pendiente</span>}</>;
};
const fecha = (iso) => (iso ? iso.split("-").reverse().join("/") : "");

function ModalNuevoVinculo({ trabajador, onCerrar, onAbierto }) {
  const [fechaIngreso, setFechaIngreso] = useState("");
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [avisos, setAvisos] = useState([]);
  const minimo = trabajador.fechaCese;

  const confirmar = async () => {
    if (!minimo) return setError("Registra primero la fecha de cese del vínculo anterior en esta ficha.");
    if (!fechaIngreso) return setError("Indica la fecha de ingreso del nuevo vínculo.");
    if (fechaIngreso <= minimo) return setError(`El nuevo ingreso debe ser posterior al cese anterior (${fecha(minimo)}).`);
    setGuardando(true);
    setError("");
    try {
      const r = await fetchAuth("/planilla/tregistro/nuevo-vinculo", { method: "POST", body: JSON.stringify({ id: trabajador._id, fechaIngreso }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) return setError(d.mensaje || "No se pudo abrir el nuevo vínculo.");
      if (d.avisos?.length) setAvisos(d.avisos); else onAbierto();
    } catch {
      setError("Error de conexión con el servidor.");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/50 p-4" style={{ zIndex: 200 }}>
      <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-sm space-y-4">
        <h4 className="font-semibold text-gray-800 text-sm">Nuevo vínculo (reingreso)</h4>
        <p className="text-sm text-gray-600">
          El vínculo actual ({fecha(trabajador.fechaIngreso)}{trabajador.fechaCese ? ` – ${fecha(trabajador.fechaCese)}` : ""}) queda en el historial con sus trámites y
          se abre un alta pendiente. Los datos personales y laborales de la ficha se conservan.
        </p>
        {avisos.length > 0 ? (
          <>
            <p className="text-sm text-green-700">Nuevo vínculo abierto.</p>
            {avisos.map((a) => <p key={a} className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">{a}</p>)}
            <div className="flex justify-end">
              <button type="button" onClick={onAbierto} className="bg-gray-900 text-white px-4 py-2 rounded-lg text-sm hover:bg-gray-700">Entendido</button>
            </div>
          </>
        ) : (
          <>
            {!minimo && <p className="text-sm text-amber-700">Registra primero la fecha de cese del vínculo anterior en esta ficha.</p>}
            <label className="text-xs text-gray-500 block">Fecha de ingreso del nuevo vínculo
              <input type="date" value={fechaIngreso} min={minimo || undefined} disabled={!minimo} onChange={(e) => setFechaIngreso(e.target.value)} className={INP} />
            </label>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex justify-end gap-3">
              <button type="button" onClick={onCerrar} disabled={guardando} className="border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50">Cancelar</button>
              <button type="button" onClick={confirmar} disabled={guardando || !minimo} className="bg-purple-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-purple-700 disabled:opacity-50">
                {guardando ? "Guardando…" : "Abrir vínculo"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ModalTrabajador({ trabajador, estado, perfil, catalogos, centrosCosto, editable, onClose, onGuardado }) {
  const [form, setForm] = useState(() => {
    const base = trabajador ? formularioDeTrabajador(trabajador) : { ...TRABAJADOR_VACIO, tregistro: TREGISTRO_VACIO(catalogos.tregistroConfig) };
    return { ...base, aportes: { senati: base.aportes?.senati === true, sctr: base.aportes?.sctr === true }, vidaLeyPrima: base.vidaLeyPrima == null ? "" : String(base.vidaLeyPrima) };
  });
  const [tocados, setTocados] = useState({});
  const [sctrFecha, setSctrFecha] = useState(fechaHoyLima);
  const [error, setError] = useState("");
  const [confirmaDesbloqueo, setConfirmaDesbloqueo] = useState(false);
  const [nuevoVinculo, setNuevoVinculo] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));
  const setPension = (k) => (e) => setForm((f) => ({ ...f, pension: { ...f.pension, [k]: e.target.value } }));
  const setPlanEps = (k) => (e) => setForm((f) => ({ ...f, planEps: { ...f.planEps, [k]: e.target.value } }));
  const fila = (campo, i, parche) => setForm((f) => ({ ...f, [campo]: f[campo].map((x, j) => (j === i ? { ...x, ...parche } : x)) }));
  const quitar = (campo, i) => setForm((f) => ({ ...f, [campo]: f[campo].filter((_, j) => j !== i) }));
  const agregar = (campo, vacia) => setForm((f) => ({ ...f, [campo]: [...f[campo], vacia] }));
  const fijos = catalogos.conceptos.filter((c) => c.tipo === "ingreso");
  const rol = getUsuario()?.rol;
  const bloqueados = camposBloqueados(trabajador);
  const hayBloqueo = bloqueados.documento || bloqueados.ingreso || bloqueados.cese;
  const abierto = form.desbloqueo === true;
  const ediciones = trabajador?.tregistro?.ediciones ?? [];
  const vinculosAnteriores = trabajador?.tregistro?.vinculosAnteriores ?? [];
  // En la ficha nueva las casillas siguen a la categoría ocupacional hasta que el usuario toca alguna.
  const ficha = trabajador ? form : aplicarPrecarga(form, tocados, perfil);
  const riesgo = perfil?.sctr?.actividadRiesgo === true;
  const cambiaSctr = Boolean(trabajador) && riesgo && cambiaSctrRegistrado({ ...trabajador, estado }, ficha);
  const setAporte = (k) => (e) => {
    const marcada = e.target.checked;
    setTocados((t) => ({ ...t, [k]: true }));
    setForm((f) => ({ ...f, aportes: { ...f.aportes, [k]: marcada } }));
  };
  const sinDocumento = bloqueados.documento && !abierto, sinIngreso = bloqueados.ingreso && !abierto, sinCese = bloqueados.cese && !abierto;

  const guardar = async () => {
    const falta = validarTrabajador(form);
    if (falta) return setError(falta);
    const prima = String(form.vidaLeyPrima).trim();
    if (prima !== "" && !(Number.isFinite(Number(prima)) && Number(prima) >= 0)) return setError("La prima de vida ley debe ser un monto de 0 o más.");
    const errorSctr = cambiaSctr && errorFechaSctr(sctrFecha, fechaHoyLima(), { cierra: !ficha.aportes.sctr });
    if (errorSctr) return setError(errorSctr);
    setGuardando(true);
    setError("");
    try {
      const r = await fetchAuth(trabajador ? `/planilla/trabajadores/${trabajador._id}` : "/planilla/trabajadores", {
        method: trabajador ? "PUT" : "POST",
        body: JSON.stringify({ ...cuerpoDeTrabajador(form), aportes: ficha.aportes, vidaLeyPrima: prima === "" ? null : Number(prima), ...(cambiaSctr && { sctrFecha }) }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) return setError(d.mensaje || "No se pudo guardar el trabajador.");
      onGuardado();
    } catch {
      setError("Error de conexión con el servidor.");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center bg-black/50 p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-3xl space-y-4 my-6">
        <h3 className="font-semibold text-gray-800">{trabajador ? nombreTrabajador(trabajador) : "Nuevo trabajador"}</h3>
        {hayBloqueo && editable && (
          <div className="flex flex-wrap items-center gap-3 bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-lg px-3 py-2">
            <span className="flex-1">
              {abierto ? "Desbloqueado: SUNAT no se actualiza, corrige también el dato en T-Registro."
                : `Ya registrado en SUNAT: corrige también el dato en T-Registro.${puedeDesbloquear(rol) ? "" : " Solo el contador puede editarlo."}`}
            </span>
            {!abierto && puedeDesbloquear(rol) && (
              <button type="button" onClick={() => setConfirmaDesbloqueo(true)} className="text-xs text-purple-600 hover:underline">Editar</button>
            )}
          </div>
        )}
        {ediciones.length > 0 && (
          <div className="text-xs text-gray-500">
            <p className="font-medium">Historial de ediciones de datos ya registrados</p>
            <ul className="list-disc pl-4">{ediciones.map((e, i) => <li key={i}>{lineaEdicion(e)}</li>)}</ul>
          </div>
        )}
        {vinculosAnteriores.length > 0 && (
          <div className="text-xs text-gray-500">
            <p className="font-medium">Vínculos anteriores</p>
            <ul className="list-disc pl-4">
              {vinculosAnteriores.map((v, i) => (
                <li key={i}>
                  {fecha(v.fechaIngreso)} – {fecha(v.fechaCese)} · alta {estadoTexto({ alta: v.alta?.estado ?? "sin control" }).alta}
                  {v.baja?.estado ? `, baja ${v.baja.estado}` : ""}
                </li>
              ))}
            </ul>
          </div>
        )}
        {editable && puedeNuevoVinculo(rol, trabajador) && (
          <div>
            <button type="button" onClick={() => setNuevoVinculo(true)} className="text-xs text-purple-600 hover:underline">Nuevo vínculo (reingreso)</button>
          </div>
        )}
        <fieldset disabled={!editable} className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <label className="text-xs text-gray-500">Documento
              <select value={form.tipoDoc} onChange={set("tipoDoc")} disabled={sinDocumento} className={INP}>
                {Object.entries(catalogos.tiposDocumento).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>
            <label className="text-xs text-gray-500">Número
              <input value={form.numDoc} onChange={set("numDoc")} maxLength={15} readOnly={sinDocumento} className={INP} />
            </label>
            <label className="text-xs text-gray-500">Apellido paterno
              <input value={form.apellidoPaterno} onChange={set("apellidoPaterno")} maxLength={40} className={INP} />
            </label>
            <label className="text-xs text-gray-500">Apellido materno
              <input value={form.apellidoMaterno} onChange={set("apellidoMaterno")} maxLength={40} className={INP} />
            </label>
            <label className="text-xs text-gray-500 col-span-2">Nombres
              <input value={form.nombres} onChange={set("nombres")} maxLength={40} className={INP} />
            </label>
            <label className="text-xs text-gray-500">Cargo
              <input value={form.cargo} onChange={set("cargo")} maxLength={80} className={INP} />
            </label>
            <label className="text-xs text-gray-500">Centro de costo
              <select value={form.centroCosto} onChange={set("centroCosto")} className={INP}>
                <option value="">Sin centro</option>
                {centrosCosto.map((c) => <option key={c._id} value={c._id}>{c.nombre}</option>)}
              </select>
            </label>
            <label className="text-xs text-gray-500">Área contable
              <select value={form.area} onChange={set("area")} className={INP}>
                <option value="">Sin área</option>
                {Object.entries(AREAS).map(([k, n]) => <option key={k} value={k}>{n}</option>)}
              </select>
            </label>
            <label className="text-xs text-gray-500">Fecha de ingreso
              <input type="date" value={form.fechaIngreso} onChange={set("fechaIngreso")} readOnly={sinIngreso} className={INP} />
            </label>
            <label className="text-xs text-gray-500">Fecha de cese
              <input type="date" value={form.fechaCese} onChange={set("fechaCese")} readOnly={sinCese} className={INP} />
            </label>
            <label className="text-xs text-gray-500">Remuneración básica (S/ al mes)
              <input value={form.remuneracionBasica} onChange={set("remuneracionBasica")} inputMode="decimal" className={`${INP} text-right`} />
            </label>
            <label className="text-sm text-gray-700 flex items-center gap-2 mt-5">
              <input type="checkbox" checked={form.asignacionFamiliar} onChange={set("asignacionFamiliar")} />Asignación familiar
            </label>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <label className="text-xs text-gray-500">Régimen pensionario
              <select value={form.pension.regimen} onChange={setPension("regimen")} className={INP}>
                <option value="onp">ONP</option><option value="afp">AFP</option><option value="ninguno">Sin régimen</option>
              </select>
            </label>
            {form.pension.regimen === "afp" && (
              <>
                <label className="text-xs text-gray-500">AFP
                  <select value={form.pension.afp} onChange={setPension("afp")} className={INP}>
                    <option value="">Elegir…</option>
                    {Object.entries(catalogos.afps).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </label>
                <label className="text-xs text-gray-500">Comisión
                  <select value={form.pension.comision} onChange={setPension("comision")} className={INP}>
                    <option value="flujo">Sobre flujo (sueldo)</option><option value="mixta">Mixta (saldo)</option>
                  </select>
                </label>
                <label className="text-xs text-gray-500">CUSPP
                  <input value={form.pension.cuspp} onChange={setPension("cuspp")} maxLength={12} className={INP} />
                </label>
              </>
            )}
            <label className="text-xs text-gray-500">Salud
              <select value={form.salud} onChange={set("salud")} className={INP}>
                {Object.entries(REGIMENES_SALUD).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>
            {form.salud === "eps" && (
              <>
                <label className="text-xs text-gray-500">Plan EPS
                  <input value={form.planEps.nombre} onChange={setPlanEps("nombre")} maxLength={60} placeholder="Ej. Corporativo Oro" className={INP} />
                </label>
                <label className="text-xs text-gray-500">Prima total al mes
                  <input value={form.planEps.primaTotal} onChange={setPlanEps("primaTotal")} placeholder="S/" inputMode="decimal" className={`${INP} text-right`} />
                </label>
                <label className="text-xs text-gray-500">Aporte de la empresa
                  <input value={form.planEps.aporteEmpresa} onChange={setPlanEps("aporteEmpresa")} placeholder="S/" inputMode="decimal" className={`${INP} text-right`} />
                </label>
                <label className="text-xs text-gray-500">Aporte del trabajador (se descuenta en su boleta)
                  <input value={form.planEps.aporteTrabajador} onChange={setPlanEps("aporteTrabajador")} placeholder="S/" inputMode="decimal" className={`${INP} text-right`} />
                </label>
              </>
            )}
          </div>

          <div className="space-y-2">
            <h4 className="text-xs font-bold text-gray-600 uppercase">Otros ingresos fijos de cada mes</h4>
            {form.conceptosFijos.map((c, i) => (
              <div key={i} className="flex gap-2 items-center">
                <select value={c.codigo} onChange={(e) => fila("conceptosFijos", i, { codigo: e.target.value })} className={`${INP} flex-1 min-w-0`}>
                  <option value="">Concepto…</option>
                  {fijos.map((x) => <option key={x.codigo} value={x.codigo}>{x.codigo} {x.nombre}</option>)}
                </select>
                <input value={c.monto} onChange={(e) => fila("conceptosFijos", i, { monto: e.target.value })} placeholder="S/" inputMode="decimal" className={`${INP} !w-28 text-right`} />
                <button type="button" onClick={() => quitar("conceptosFijos", i)} className="text-xs text-red-600 hover:underline">Quitar</button>
              </div>
            ))}
            <button type="button" onClick={() => agregar("conceptosFijos", { codigo: "", monto: "" })} className="text-xs text-purple-600 hover:underline">+ Concepto fijo (movilidad, bonificación regular…)</button>
          </div>

          <div className="space-y-2">
            <h4 className="text-xs font-bold text-gray-600 uppercase">Renta de 5.ª de meses que no están en el sistema</h4>
            <p className="text-[11px] text-gray-400">
              Lo cobrado y lo retenido este año antes de llevar la planilla aquí (o con otro empleador). Puedes agrupar en una fila todo hasta el último
              corte ya pasado (marzo, abril, julio o agosto), con ese mes, y registrar aparte los meses siguientes: de eso depende cuánto se descuenta después.
            </p>
            {form.quintaAnterior.map((q, i) => (
              <div key={i} className="flex gap-2 items-center">
                <input type="month" value={q.mes} onChange={(e) => fila("quintaAnterior", i, { mes: e.target.value })} className={`${INP} !w-44`} />
                <input value={q.ingresos} onChange={(e) => fila("quintaAnterior", i, { ingresos: e.target.value })} placeholder="Ingresos afectos S/" inputMode="decimal" className={`${INP} text-right`} />
                <input value={q.retencion} onChange={(e) => fila("quintaAnterior", i, { retencion: e.target.value })} placeholder="Retenido S/" inputMode="decimal" className={`${INP} text-right`} />
                <button type="button" onClick={() => quitar("quintaAnterior", i)} className="text-xs text-red-600 hover:underline">Quitar</button>
              </div>
            ))}
            <button type="button" onClick={() => agregar("quintaAnterior", { mes: "", ingresos: "", retencion: "" })} className="text-xs text-purple-600 hover:underline">+ Mes anterior</button>
          </div>

          <div className="space-y-2">
            <h4 className="text-xs font-bold text-gray-600 uppercase">Aportes del empleador</h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 items-end">
              <label className="text-sm text-gray-700 flex items-center gap-2">
                <input type="checkbox" checked={ficha.aportes.senati} onChange={setAporte("senati")} />Aporta a SENATI
              </label>
              {riesgo && (
                <label className="text-sm text-gray-700 flex items-center gap-2">
                  <input type="checkbox" checked={ficha.aportes.sctr} onChange={setAporte("sctr")} />Expuesto a riesgo (SCTR)
                </label>
              )}
              <label className="text-xs text-gray-500">Prima de vida ley propia (opcional)
                <input value={form.vidaLeyPrima} onChange={set("vidaLeyPrima")} placeholder="S/ al mes" inputMode="decimal" className={`${INP} text-right`} />
              </label>
              {cambiaSctr && (
                <label className="text-xs text-gray-500">Fecha del cambio en SUNAT
                  <input type="date" value={sctrFecha} max={limiteFechaSctr(fechaHoyLima(), { cierra: !ficha.aportes.sctr })} onChange={(e) => setSctrFecha(e.target.value)} className={INP} />
                </label>
              )}
            </div>
            <p className="text-[11px] text-gray-400">Cuenta para la evaluación anual de SENATI (personal de instalación, reparación y mantenimiento, o todo el personal si la empresa es industrial).</p>
            {cambiaSctr && <p className="text-[11px] text-gray-400">El cambio de SCTR queda como modificación pendiente en T-Registro con esta fecha (inicio hasta 30 días a futuro, fin hasta 5).</p>}
          </div>

          <FichaTRegistro form={form} setForm={setForm} catalogos={catalogos} bloqueados={bloqueados} />
        </fieldset>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-3">
          <button onClick={onClose} className="border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm hover:bg-gray-50">{editable ? "Cancelar" : "Cerrar"}</button>
          {editable && (
            <button onClick={guardar} disabled={guardando} className="bg-purple-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-purple-700 disabled:opacity-50">
              {guardando ? "Guardando…" : "Guardar"}
            </button>
          )}
        </div>
      </div>
      {nuevoVinculo && <ModalNuevoVinculo trabajador={trabajador} onCerrar={() => setNuevoVinculo(false)} onAbierto={onGuardado} />}
      {confirmaDesbloqueo && (
        <ConfirmacionAccion mensaje="SUNAT no se actualiza: corrige también el dato en T-Registro. ¿Desbloquear para editar?" textoConfirmar="Desbloquear"
          onCancelar={() => setConfirmaDesbloqueo(false)} onConfirmar={() => { setForm((f) => ({ ...f, desbloqueo: true })); setConfirmaDesbloqueo(false); }} />
      )}
    </div>
  );
}

// Ficha de los trabajadores en planilla. No se borran: un trabajador sale con su fecha de cese.
export default function PanelTrabajadores({ catalogos, centrosCosto, puedeEscribir, refrescarAvisos, onLiquidacion, verCesadosInicial = false }) {
  const [lista, setLista] = useState([]);
  const [estados, setEstados] = useState({});
  const [perfil, setPerfil] = useState(null);
  const [modal, setModal] = useState(null); // { trabajador? }
  const [aviso, setAviso] = useState("");
  const [verCesados, setVerCesados] = useState(verCesadosInicial);
  const [liquidaciones, setLiquidaciones] = useState([]);
  const [liquidando, setLiquidando] = useState(null);

  const cargar = useCallback(() => Promise.all([
    fetchAuth("/planilla/trabajadores"), fetchAuth("/planilla/tregistro/trabajadores"), fetchAuth("/planilla/perfil"), fetchAuth("/planilla/liquidaciones"),
  ]).then(async ([r, rt, rp, rl]) => {
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return setAviso(d.mensaje || "No se pudieron cargar los trabajadores.");
    const tramites = await rt.json().catch(() => []);
    const liqs = await rl.json().catch(() => []);
    setLista(d);
    setLiquidaciones(rl.ok && Array.isArray(liqs) ? liqs : []);
    setPerfil(rp.ok ? (await rp.json().catch(() => ({}))).perfil ?? null : null);
    setEstados(rt.ok && Array.isArray(tramites) ? Object.fromEntries(tramites.map((x) => [x._id, x.estado])) : {});
  }).catch(() => setAviso("Error de conexión con el servidor.")), []);
  useEffect(() => { cargar(); }, [cargar]);

  const visibles = lista.filter((t) => verCesados || !t.fechaCese);
  const centro = (id) => centrosCosto.find((c) => c._id === id)?.nombre || "";
  // La lista llega de la más nueva a la más antigua.
  const liquidacionDe = (t) => liquidacionVigente(liquidaciones.filter((l) => String(l.trabajador) === t._id), t.fechaCese);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm text-gray-500 flex-1">{visibles.length} trabajadores{verCesados ? "" : " activos"}</p>
        <label className="text-sm text-gray-600 flex items-center gap-2">
          <input type="checkbox" checked={verCesados} onChange={(e) => setVerCesados(e.target.checked)} />Ver cesados
        </label>
        {puedeEscribir && <button onClick={() => setModal({})} className="bg-purple-600 text-white px-3 py-2 rounded-lg text-sm hover:bg-purple-700">+ Trabajador</button>}
      </div>
      <TablaScroll>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-gray-500 border-b">
              <th className="py-2 pr-3">Trabajador</th><th className="py-2 pr-3">Cargo</th><th className="py-2 pr-3">Centro de costo</th><th className="py-2 pr-3">Ingreso</th>
              <th className="py-2 pr-3 text-right">Básico</th><th className="py-2 pr-3">Pensión</th><th className="py-2 pr-3">Salud</th><th className="py-2 pr-3">Trámite T-Registro</th><th className="py-2" />
            </tr>
          </thead>
          <tbody>
            {visibles.map((t) => { const liq = liquidacionDe(t); return (
              <tr key={t._id} className={`border-b border-gray-100 ${t.fechaCese ? "text-gray-400" : ""}`}>
                <td className="py-1.5 pr-3">{nombreTrabajador(t)}<span className="block text-xs text-gray-400">{t.numDoc}</span></td>
                <td className="py-1.5 pr-3">{t.cargo}</td>
                <td className="py-1.5 pr-3">{centro(t.centroCosto) || <span className="text-amber-600 text-xs">Sin centro</span>}</td>
                <td className="py-1.5 pr-3 whitespace-nowrap">{fecha(t.fechaIngreso)}{t.fechaCese && <span className="block text-xs">cesó {fecha(t.fechaCese)}</span>}</td>
                <td className="py-1.5 pr-3 text-right tabular-nums">{money(t.remuneracionBasica)}{t.asignacionFamiliar && <span className="block text-xs text-gray-400">+ asig. familiar</span>}</td>
                <td className="py-1.5 pr-3 text-xs">{textoPension(t.pension, catalogos.afps)}</td>
                <td className="py-1.5 pr-3 text-xs">{REGIMENES_SALUD[t.salud]}</td>
                <td className="py-1.5 pr-3 text-xs">{textoTramite(estados[t._id])}</td>
                <td className="py-1.5 text-right whitespace-nowrap">
                  <button onClick={() => setModal({ trabajador: t })} className="text-xs text-purple-600 hover:underline">{puedeEscribir ? "Editar" : "Ver"}</button>
                  {/* Sin fecha de cese puede quedar un borrador de un cese que se borró de la ficha: se abre para eliminarlo. */}
                  {(t.fechaCese || liq) && (
                    <button onClick={() => setLiquidando(t)} className="block ml-auto text-xs text-purple-600 hover:underline">
                      Liquidación
                      {liq && (
                        <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium ${liq.estado === "confirmada" ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"}`}>
                          {liq.estado}
                        </span>
                      )}
                    </button>
                  )}
                </td>
              </tr>
            ); })}
            {visibles.length === 0 && <tr><td colSpan={9} className="py-6 text-center text-gray-400 text-sm">Sin trabajadores registrados</td></tr>}
          </tbody>
        </table>
      </TablaScroll>
      {modal && (
        <ModalTrabajador trabajador={modal.trabajador} estado={estados[modal.trabajador?._id]} perfil={perfil} catalogos={catalogos} centrosCosto={centrosCosto} editable={puedeEscribir}
          onClose={() => setModal(null)} onGuardado={() => { setModal(null); cargar(); refrescarAvisos?.(); onLiquidacion?.(); }} />
      )}
      {liquidando && (
        <ModalLiquidacion trabajador={liquidando} catalogos={catalogos} puedeEscribir={puedeEscribir}
          onClose={() => setLiquidando(null)} onCambio={() => { cargar(); onLiquidacion?.(); }}
          onPdf={(liq) => generarLiquidacionPdf(liq, { empleador: catalogos.empleador, afps: catalogos.afps, motivosBaja: catalogos.tregistro?.motivosBaja })} />
      )}
      {aviso && <AvisoAccion mensaje={aviso} onCerrar={() => setAviso("")} />}
    </div>
  );
}
