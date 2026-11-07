import { Fragment, useState, useEffect } from "react";
import { fetchAuth } from "../../utils/fetchAuth";
import BuscadorCuenta from "../contabilidad/BuscadorCuenta";
import { AREAS, cuerpoDeCuentas } from "../../utils/planilla";

// [clave, etiqueta, general obligatoria, ayuda]. Las columnas de área se completan solo si la empresa separa el gasto por área.
const GASTO = [
  ["remuneraciones", "Remuneraciones", true, "6211 / 62111 / 62112 / 62113"],
  ["asignacionFamiliar", "Asignación familiar", false, "6221x; vacía: la de remuneraciones del área o general"],
  ["bonificaciones", "Bonificaciones", false, "6222x; vacía: la de remuneraciones del área o general"],
  ["vacaciones", "Vacaciones", false, "6215x; vacía: la de remuneraciones del área o general"],
  ["gratificaciones", "Gratificaciones", false, "6214x; vacía: la de remuneraciones del área o general"],
  ["salud", "EsSalud", true, "6271x"],
  ["eps", "EPS", false, "vacía: la de EsSalud"],
  ["senati", "SENATI", false, "6277x; solo si la empresa aporta"],
  ["sctr", "SCTR", false, "6273x; solo si hay trabajadores expuestos"],
  ["cts", "CTS", false, "6291x; sin respaldo: obligatoria si una boleta la usa"],
  ["indemnizaciones", "Indemnizaciones", false, "623 / 62311; sin respaldo: obligatoria si una boleta la usa"],
];

const CUENTAS = [
  ["Por pagar", [
    ["porPagar", "Remuneraciones por pagar (ej. 4111)", true],
    ["quinta", "Renta de 5.ª (ej. 40173)", true],
    ["essalud", "EsSalud (ej. 4031)", true],
    ["onp", "ONP (ej. 4032)", true],
    ["afp", "AFP (ej. 407)", true],
    ["epsPorPagar", "EPS (solo si hay trabajadores con EPS)"],
    ["descuentos", "Adelantos y otros descuentos al trabajador (ej. 141)"],
    ["senatiPorPagar", "SENATI por pagar (ej. 4033)"],
  ]],
];

// Cuentas del asiento de la planilla (PCGE 2019). El régimen laboral se cambia en Planilla → Perfil laboral.
export default function PanelCuentasPlanilla({ cuentas, catalogos, puedeEscribir }) {
  const [form, setForm] = useState(null);
  const [error, setError] = useState("");
  const [ok, setOk] = useState(false);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    fetchAuth("/planilla/cuentas").then(async (r) => {
      const d = await r.json().catch(() => ({}));
      if (r.ok) setForm(d); else setError(d.mensaje || "No se pudieron cargar las cuentas.");
    }).catch(() => setError("Error de conexión con el servidor."));
  }, []);

  const guardar = async () => {
    setGuardando(true);
    setError("");
    setOk(false);
    try {
      const r = await fetchAuth("/planilla/cuentas", { method: "PUT", body: JSON.stringify(cuerpoDeCuentas(form)) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) return setError(d.mensaje || "No se pudieron guardar las cuentas.");
      setForm(d);
      setOk(true);
    } catch {
      setError("Error de conexión con el servidor.");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="space-y-5 max-w-6xl">
      <p className="text-sm text-gray-600">
        Régimen laboral de la empresa: <b>{catalogos.regimenes[catalogos.regimenLaboral]?.nombre}</b>
        <span className="text-xs text-gray-400"> — se edita en la pestaña Perfil laboral.</span>
      </p>
      {form && (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-gray-700">Gasto</h3>
          <p className="text-[11px] text-gray-400">
            Cada concepto usa la cuenta de su área si está llena; si no, la General; y si la General está vacía, la de respaldo indicada.
            La columna del área depende del «Área contable» de la ficha del trabajador (sin área usa solo la General).
          </p>
          <div className="grid grid-cols-[minmax(9rem,1.2fr)_repeat(4,minmax(0,1fr))] gap-x-2 gap-y-2 items-start">
            <span />
            {["General", ...Object.values(AREAS)].map((t) => <span key={t} className="text-xs font-semibold text-gray-600">{t}</span>)}
            {GASTO.map(([clave, etiqueta, obligatoria, ayuda]) => (
              <Fragment key={clave}>
                <span className="text-xs text-gray-600 pt-1.5">{etiqueta}<span className="block text-[10px] text-gray-400">{ayuda}</span></span>
                <BuscadorCuenta cuentas={cuentas} valor={form[clave] || ""} disabled={!puedeEscribir} permitirVacio={!obligatoria}
                  onChange={(v) => { setForm((f) => ({ ...f, [clave]: v })); setOk(false); }} />
                {Object.keys(AREAS).map((area) => (
                  <BuscadorCuenta key={area} cuentas={cuentas} valor={form.porArea?.[clave]?.[area] || ""} disabled={!puedeEscribir} permitirVacio
                    onChange={(v) => { setForm((f) => ({ ...f, porArea: { ...f.porArea, [clave]: { ...f.porArea?.[clave], [area]: v } } })); setOk(false); }} />
                ))}
              </Fragment>
            ))}
          </div>
        </section>
      )}
      {form && CUENTAS.map(([titulo, campos]) => (
        <section key={titulo} className="space-y-2">
          <h3 className="text-sm font-semibold text-gray-700">{titulo}</h3>
          <div className="grid md:grid-cols-2 gap-3 max-w-3xl">
            {campos.map(([clave, etiqueta, obligatoria]) => (
              <label key={clave} className="text-xs text-gray-500">{etiqueta}
                <BuscadorCuenta cuentas={cuentas} valor={form[clave] || ""} disabled={!puedeEscribir} permitirVacio={!obligatoria}
                  onChange={(v) => { setForm((f) => ({ ...f, [clave]: v })); setOk(false); }} />
              </label>
            ))}
          </div>
        </section>
      ))}
      <p className="text-[11px] text-gray-400">
        El asiento sale al cerrar la planilla y generar los asientos del mes en Contabilidad → Automáticos, y se puede completar a mano
        (provisiones de gratificación, CTS y vacaciones). Los pagos se registran en Tesorería como egreso manual con el concepto «Planilla».
      </p>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {ok && <p className="text-sm text-green-700">Cuentas guardadas.</p>}
      {form && puedeEscribir && (
        <button onClick={guardar} disabled={guardando} className="bg-purple-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-purple-700 disabled:opacity-50">
          {guardando ? "Guardando…" : "Guardar cuentas"}
        </button>
      )}
    </div>
  );
}
