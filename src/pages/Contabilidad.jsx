import { useState, useEffect, useCallback } from "react";
import { fetchAuth, getUsuario } from "../utils/fetchAuth";
import PanelPlanCuentas from "../components/contabilidad/PanelPlanCuentas";
import PanelAsientos from "../components/contabilidad/PanelAsientos";
import PanelAutomaticos from "../components/contabilidad/PanelAutomaticos";
import PanelExportarConcar from "../components/contabilidad/PanelExportarConcar";
import PanelConfiguracionContable from "../components/contabilidad/PanelConfiguracionContable";
import PanelReportesContables from "../components/contabilidad/PanelReportesContables";
import PanelCierreMes from "../components/contabilidad/PanelCierreMes";
import PanelLibrosPle from "../components/contabilidad/PanelLibrosPle";
import PanelAyuda from "../components/contabilidad/PanelAyuda";

const TABS = [
  { id: "asientos", label: "Asientos" },
  { id: "automaticos", label: "Automáticos" },
  { id: "concar", label: "Exportar CONCAR" },
  { id: "cierre", label: "Cierre de mes" },
  { id: "ple", label: "Libros PLE" },
  { id: "reportes", label: "Reportes" },
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
  const [ayuda, setAyuda] = useState(false);
  const cerrarAyuda = useCallback(() => setAyuda(false), []);
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
      <div className="flex items-start gap-3">
       <div className="flex-1">
        <h1 className="text-xl font-bold text-gray-800">Contabilidad</h1>
        <p className="text-sm text-gray-400 mt-0.5">Plan de cuentas (PCGE 2019), asientos, exportación a CONCAR y libros PLE{puedeEscribir ? "" : " — solo lectura"}</p>
       </div>
        <button onClick={() => setAyuda(true)} title="Qué significa cada término de esta pantalla"
          className="flex items-center gap-1.5 border border-purple-200 text-purple-700 px-3 py-1.5 rounded-lg text-sm hover:bg-purple-50">
          <span className="w-5 h-5 rounded-full bg-purple-600 text-white text-xs font-bold flex items-center justify-center">?</span>
          Ayuda
        </button>
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
      {tab === "automaticos" && <PanelAutomaticos cuentas={cuentas} centrosCosto={centrosCosto} puedeGenerar={puedeGenerar} puedeEscribir={puedeEscribir} />}
      {tab === "concar" && <PanelExportarConcar puedeEscribir={puedeEscribir} />}
      {tab === "cierre" && <PanelCierreMes puedeCerrar={rol === "tesorero"} />}
      {tab === "ple" && <PanelLibrosPle />}
      {tab === "reportes" && <PanelReportesContables centrosCosto={centrosCosto} />}
      {tab === "configuracion" && <PanelConfiguracionContable cuentas={cuentas} puedeEscribir={puedeEscribir} />}
      {tab === "plan" && <PanelPlanCuentas cuentas={cuentas} onCambio={cargarCuentas} puedeEscribir={puedeEscribir} />}
      {ayuda && <PanelAyuda key={tab} seccionInicial={tab} onCerrar={cerrarAyuda} />}
    </div>
  );
}
