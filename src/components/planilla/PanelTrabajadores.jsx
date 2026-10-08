import { useState, useEffect, useCallback } from "react";
import { fetchAuth } from "../../utils/fetchAuth";
import { money } from "../../utils/compras";
import { nombreTrabajador, textoPension, REGIMENES_SALUD, TRABAJADOR_VACIO, formularioDeTrabajador, validarTrabajador, cuerpoDeTrabajador } from "../../utils/planilla";
import TablaScroll from "../TablaScroll";
import AvisoAccion from "../AvisoAccion";

const INP = "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300 disabled:bg-gray-50";
const fecha = (iso) => (iso ? iso.split("-").reverse().join("/") : "");

function ModalTrabajador({ trabajador, catalogos, centrosCosto, editable, onClose, onGuardado }) {
  const [form, setForm] = useState(() => (trabajador ? formularioDeTrabajador(trabajador) : TRABAJADOR_VACIO));
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));
  const setPension = (k) => (e) => setForm((f) => ({ ...f, pension: { ...f.pension, [k]: e.target.value } }));
  const fila = (campo, i, parche) => setForm((f) => ({ ...f, [campo]: f[campo].map((x, j) => (j === i ? { ...x, ...parche } : x)) }));
  const quitar = (campo, i) => setForm((f) => ({ ...f, [campo]: f[campo].filter((_, j) => j !== i) }));
  const agregar = (campo, vacia) => setForm((f) => ({ ...f, [campo]: [...f[campo], vacia] }));
  const fijos = catalogos.conceptos.filter((c) => c.tipo === "ingreso");

  const guardar = async () => {
    const falta = validarTrabajador(form);
    if (falta) return setError(falta);
    setGuardando(true);
    setError("");
    try {
      const r = await fetchAuth(trabajador ? `/planilla/trabajadores/${trabajador._id}` : "/planilla/trabajadores", {
        method: trabajador ? "PUT" : "POST", body: JSON.stringify(cuerpoDeTrabajador(form)),
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
        <fieldset disabled={!editable} className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <label className="text-xs text-gray-500">Documento
              <select value={form.tipoDoc} onChange={set("tipoDoc")} className={INP}>
                {Object.entries(catalogos.tiposDocumento).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>
            <label className="text-xs text-gray-500">Número
              <input value={form.numDoc} onChange={set("numDoc")} maxLength={15} className={INP} />
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
            <label className="text-xs text-gray-500">Fecha de ingreso
              <input type="date" value={form.fechaIngreso} onChange={set("fechaIngreso")} className={INP} />
            </label>
            <label className="text-xs text-gray-500">Fecha de cese
              <input type="date" value={form.fechaCese} onChange={set("fechaCese")} className={INP} />
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
    </div>
  );
}

// Ficha de los trabajadores en planilla. No se borran: un trabajador sale con su fecha de cese.
export default function PanelTrabajadores({ catalogos, centrosCosto, puedeEscribir }) {
  const [lista, setLista] = useState([]);
  const [modal, setModal] = useState(null); // { trabajador? }
  const [aviso, setAviso] = useState("");
  const [verCesados, setVerCesados] = useState(false);

  const cargar = useCallback(() => fetchAuth("/planilla/trabajadores").then(async (r) => {
    const d = await r.json().catch(() => ({}));
    if (r.ok) setLista(d); else setAviso(d.mensaje || "No se pudieron cargar los trabajadores.");
  }).catch(() => setAviso("Error de conexión con el servidor.")), []);
  useEffect(() => { cargar(); }, [cargar]);

  const visibles = lista.filter((t) => verCesados || !t.fechaCese);
  const centro = (id) => centrosCosto.find((c) => c._id === id)?.nombre || "";

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
              <th className="py-2 pr-3 text-right">Básico</th><th className="py-2 pr-3">Pensión</th><th className="py-2 pr-3">Salud</th><th className="py-2" />
            </tr>
          </thead>
          <tbody>
            {visibles.map((t) => (
              <tr key={t._id} className={`border-b border-gray-100 ${t.fechaCese ? "text-gray-400" : ""}`}>
                <td className="py-1.5 pr-3">{nombreTrabajador(t)}<span className="block text-xs text-gray-400">{t.numDoc}</span></td>
                <td className="py-1.5 pr-3">{t.cargo}</td>
                <td className="py-1.5 pr-3">{centro(t.centroCosto) || <span className="text-amber-600 text-xs">Sin centro</span>}</td>
                <td className="py-1.5 pr-3 whitespace-nowrap">{fecha(t.fechaIngreso)}{t.fechaCese && <span className="block text-xs">cesó {fecha(t.fechaCese)}</span>}</td>
                <td className="py-1.5 pr-3 text-right tabular-nums">{money(t.remuneracionBasica)}{t.asignacionFamiliar && <span className="block text-xs text-gray-400">+ asig. familiar</span>}</td>
                <td className="py-1.5 pr-3 text-xs">{textoPension(t.pension, catalogos.afps)}</td>
                <td className="py-1.5 pr-3 text-xs">{REGIMENES_SALUD[t.salud]}</td>
                <td className="py-1.5 text-right"><button onClick={() => setModal({ trabajador: t })} className="text-xs text-purple-600 hover:underline">{puedeEscribir ? "Editar" : "Ver"}</button></td>
              </tr>
            ))}
            {visibles.length === 0 && <tr><td colSpan={8} className="py-6 text-center text-gray-400 text-sm">Sin trabajadores registrados</td></tr>}
          </tbody>
        </table>
      </TablaScroll>
      {modal && (
        <ModalTrabajador trabajador={modal.trabajador} catalogos={catalogos} centrosCosto={centrosCosto} editable={puedeEscribir}
          onClose={() => setModal(null)} onGuardado={() => { setModal(null); cargar(); }} />
      )}
      {aviso && <AvisoAccion mensaje={aviso} onCerrar={() => setAviso("")} />}
    </div>
  );
}
