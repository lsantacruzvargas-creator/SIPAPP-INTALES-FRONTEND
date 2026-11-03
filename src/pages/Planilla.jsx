import { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { fetchAuth, getUsuario } from "../utils/fetchAuth";
import { fechaHoyLima } from "../utils/fecha";
import PanelPlanillaMes from "../components/planilla/PanelPlanillaMes";
import PanelTrabajadores from "../components/planilla/PanelTrabajadores";
import PanelParametrosPlanilla from "../components/planilla/PanelParametrosPlanilla";
import PanelPlame from "../components/planilla/PanelPlame";
import PanelCuentasPlanilla from "../components/planilla/PanelCuentasPlanilla";
import PanelTRegistro from "../components/planilla/PanelTRegistro";
import PanelConfigTRegistro from "../components/planilla/PanelConfigTRegistro";
import PanelPerfilLaboral from "../components/planilla/PanelPerfilLaboral";

const TABS = [
  { id: "mes", label: "Planilla del mes" },
  { id: "trabajadores", label: "Trabajadores" },
  { id: "tregistro", label: "T-Registro" },
  { id: "configtr", label: "Config. T-Registro" },
  { id: "perfil", label: "Perfil laboral" },
  { id: "parametros", label: "Parámetros" },
  { id: "plame", label: "PLAME" },
  { id: "cuentas", label: "Cuentas contables" },
];

// Ven admin, jefatura y contador (sueldos); escriben admin y contador.
export default function Planilla() {
  const location = useLocation();
  const puedeEscribir = ["admin", "contador"].includes(getUsuario()?.rol);
  const [tab, setTab] = useState(() => TABS.find((t) => t.id === location.state?.tab)?.id || "mes");
  const [mes, setMes] = useState(() => fechaHoyLima().slice(0, 7));
  const [catalogos, setCatalogos] = useState(null);
  const [cuentas, setCuentas] = useState([]);
  const [centrosCosto, setCentrosCosto] = useState([]);
  const [error, setError] = useState("");
  const [avisosPerfil, setAvisosPerfil] = useState([]);

  useEffect(() => {
    Promise.all([fetchAuth("/planilla/catalogos"), fetchAuth("/contabilidad/cuentas"), fetchAuth("/centros-costo")]).then(async ([rc, rp, rk]) => {
      if (!rc.ok) return setError((await rc.json().catch(() => ({}))).mensaje || "No se pudo cargar Planilla.");
      setCatalogos(await rc.json());
      if (rp.ok) setCuentas(await rp.json());
      if (rk.ok) setCentrosCosto((await rk.json()).filter((c) => c.activo));
    }).catch(() => setError("Error de conexión con el servidor."));
  }, []);

  useEffect(() => {
    fetchAuth("/planilla/perfil").then(async (r) => {
      if (r.ok) setAvisosPerfil((await r.json()).avisos || []);
    }).catch(() => { /* los avisos son informativos: sin ellos la planilla sigue funcionando */ });
  }, []);

  // Las fichas nuevas toman sus valores por defecto de catalogos.tregistroConfig.
  const refrescarCatalogos = async () => {
    try {
      const r = await fetchAuth("/planilla/catalogos");
      if (r.ok) setCatalogos(await r.json());
    } catch { /* la configuración ya se guardó; los valores nuevos llegan al recargar */ }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-800">Planilla</h1>
        <p className="text-sm text-gray-400 mt-0.5">Remuneraciones del mes, boletas de pago, archivos del PLAME y asiento contable{puedeEscribir ? "" : " — solo lectura"}</p>
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
      {error && <p className="text-sm text-red-600">{error}</p>}
      {avisosPerfil.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-sm text-amber-800 space-y-1">
          {avisosPerfil.map((a, i) => <p key={i}>{a}</p>)}
          {tab !== "perfil" && <button onClick={() => setTab("perfil")} className="text-xs underline font-medium hover:text-amber-900">Ir al perfil laboral</button>}
        </div>
      )}
      {catalogos && (
        <>
          {tab === "mes" && <PanelPlanillaMes mes={mes} setMes={setMes} catalogos={catalogos} puedeEscribir={puedeEscribir} />}
          {tab === "trabajadores" && <PanelTrabajadores catalogos={catalogos} centrosCosto={centrosCosto} puedeEscribir={puedeEscribir} />}
          {tab === "tregistro" && <PanelTRegistro puedeEscribir={puedeEscribir} />}
          {tab === "configtr" && <PanelConfigTRegistro catalogos={catalogos} puedeEscribir={puedeEscribir} onGuardado={refrescarCatalogos} />}
          {tab === "perfil" && <PanelPerfilLaboral catalogos={catalogos} puedeEscribir={puedeEscribir} onGuardado={setAvisosPerfil} />}
          {tab === "parametros" && <PanelParametrosPlanilla mes={mes} setMes={setMes} catalogos={catalogos} puedeEscribir={puedeEscribir} />}
          {tab === "plame" && <PanelPlame mes={mes} setMes={setMes} />}
          {tab === "cuentas" && <PanelCuentasPlanilla cuentas={cuentas} catalogos={catalogos} puedeEscribir={puedeEscribir} />}
        </>
      )}
    </div>
  );
}
