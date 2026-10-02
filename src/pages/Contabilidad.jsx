import { useState, useEffect, useCallback } from "react";
import { fetchAuth, getUsuario } from "../utils/fetchAuth";
import PanelPlanCuentas from "../components/contabilidad/PanelPlanCuentas";
import PanelAsientos from "../components/contabilidad/PanelAsientos";
import PanelAutomaticos from "../components/contabilidad/PanelAutomaticos";
import PanelExportarConcar from "../components/contabilidad/PanelExportarConcar";
import PanelConfiguracionContable from "../components/contabilidad/PanelConfiguracionContable";

const TABS = [
  { id: "asientos", label: "Asientos" },
  { id: "automaticos", label: "Automáticos" },
  { id: "concar", label: "Exportar CONCAR" },
  { id: "plan", label: "Plan de cuentas" },
  { id: "configuracion", label: "Configuración" },
];

// Escriben el contador y el admin; jefatura y tesorero solo ven (diseño contable 2026-10-01). Los asientos
// automáticos los generan y contabilizan además el tesorero (C2).
export default function Contabilidad() {
  const rol = getUsuario()?.rol;
  const puedeEscribir = ["admin", "contador"].includes(rol);
  const puedeGenerar = ["admin", "contador", "tesorero"].includes(rol);
  const [tab, setTab] = useState("asientos");
  const [cuentas, setCuentas] = useState([]);
  const [centrosCosto, setCentrosCosto] = useState([]);

  const cargarCuentas = useCallback(() => fetchAuth("/contabilidad/cuentas").then(async (r) => {
    if (r.ok) setCuentas(await r.json());
  }), []);
  useEffect(() => {
    cargarCuentas();
    fetchAuth("/centros-costo").then(async (r) => { if (r.ok) setCentrosCosto((await r.json()).filter((c) => c.activo)); });
  }, [cargarCuentas]);

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-800">Contabilidad</h1>
        <p className="text-sm text-gray-400 mt-0.5">Plan de cuentas (PCGE 2019), asientos y exportación a CONCAR{puedeEscribir ? "" : " — solo lectura"}</p>
      </div>
      <div className="flex border-b border-gray-200 gap-1 flex-wrap">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2.5 text-sm font-medium transition border-b-2 -mb-px ${
              tab === t.id ? "border-purple-600 text-purple-700" : "border-transparent text-gray-500 hover:text-gray-700"
            }`}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === "asientos" && <PanelAsientos cuentas={cuentas} centrosCosto={centrosCosto} puedeEscribir={puedeEscribir} />}
      {tab === "automaticos" && <PanelAutomaticos cuentas={cuentas} puedeGenerar={puedeGenerar} puedeEscribir={puedeEscribir} />}
      {tab === "concar" && <PanelExportarConcar puedeEscribir={puedeEscribir} />}
      {tab === "configuracion" && <PanelConfiguracionContable cuentas={cuentas} puedeEscribir={puedeEscribir} />}
      {tab === "plan" && <PanelPlanCuentas cuentas={cuentas} onCambio={cargarCuentas} puedeEscribir={puedeEscribir} />}
    </div>
  );
}
