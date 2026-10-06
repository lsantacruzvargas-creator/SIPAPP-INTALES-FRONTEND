import { useState, useEffect } from "react";
import { fetchAuth } from "../../utils/fetchAuth";
import BuscadorCuenta from "../contabilidad/BuscadorCuenta";

const CUENTAS = [
  ["Gasto", [
    ["remuneraciones", "Remuneraciones (ej. 6211)", true],
    ["vacaciones", "Vacaciones (ej. 6215; vacía: la de remuneraciones)"],
    ["gratificaciones", "Gratificaciones (ej. 6214; vacía: la de remuneraciones)"],
    ["salud", "EsSalud (ej. 6271)", true],
    ["eps", "EPS (vacía: la de EsSalud)"],
  ]],
  ["Por pagar", [
    ["porPagar", "Remuneraciones por pagar (ej. 4111)", true],
    ["quinta", "Renta de 5.ª (ej. 40173)", true],
    ["essalud", "EsSalud (ej. 4031)", true],
    ["onp", "ONP (ej. 4032)", true],
    ["afp", "AFP (ej. 407)", true],
    ["epsPorPagar", "EPS (solo si hay trabajadores con EPS)"],
    ["descuentos", "Adelantos y otros descuentos al trabajador (ej. 141)"],
  ]],
];

// Cuentas del asiento de la planilla (PCGE 2019). El régimen laboral se cambia en Tesorería → Configuración.
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
      const r = await fetchAuth("/planilla/cuentas", { method: "PUT", body: JSON.stringify(form) });
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
    <div className="space-y-5 max-w-3xl">
      <p className="text-sm text-gray-600">
        Régimen laboral de la empresa: <b>{catalogos.regimenes[catalogos.regimenLaboral]?.nombre}</b>
        <span className="text-xs text-gray-400"> — lo cambia el administrador en Tesorería → Configuración.</span>
      </p>
      {form && CUENTAS.map(([titulo, campos]) => (
        <section key={titulo} className="space-y-2">
          <h3 className="text-sm font-semibold text-gray-700">{titulo}</h3>
          <div className="grid md:grid-cols-2 gap-3">
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
