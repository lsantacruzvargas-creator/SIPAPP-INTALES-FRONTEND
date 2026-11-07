import { useState, useEffect, useCallback } from "react";
import { useLocation } from "react-router-dom";
import { fetchAuth, getUsuario } from "../utils/fetchAuth";
import { fechaHoyLima } from "../utils/fecha";
import { mostrarCambioPerfil } from "../utils/perfilLaboral";
import PanelPlanillaMes from "../components/planilla/PanelPlanillaMes";
import PanelTrabajadores from "../components/planilla/PanelTrabajadores";
import PanelParametrosPlanilla from "../components/planilla/PanelParametrosPlanilla";
import PanelPlame from "../components/planilla/PanelPlame";
import PanelCuentasPlanilla from "../components/planilla/PanelCuentasPlanilla";
import PanelTRegistro from "../components/planilla/PanelTRegistro";
import PanelConfigTRegistro from "../components/planilla/PanelConfigTRegistro";
import PanelPerfilLaboral from "../components/planilla/PanelPerfilLaboral";
import PanelVacaciones from "../components/planilla/PanelVacaciones";
import { resumenAvisosVacaciones } from "../utils/vacaciones";

const TABS = [
  { id: "mes", label: "Planilla del mes" },
  { id: "trabajadores", label: "Trabajadores" },
  { id: "vacaciones", label: "Vacaciones" },
  { id: "tregistro", label: "T-Registro" },
  { id: "configtr", label: "Config. T-Registro" },
  { id: "perfil", label: "Perfil laboral" },
  { id: "parametros", label: "Parámetros" },
  { id: "plame", label: "PLAME" },
  { id: "cuentas", label: "Cuentas contables" },
];

const CLAVE_VISTO = "planilla.cambioPerfil.visto";
const leerVisto = () => { try { return localStorage.getItem(CLAVE_VISTO) || ""; } catch { return ""; } };
const guardarVisto = (fecha) => { try { localStorage.setItem(CLAVE_VISTO, fecha); } catch { /* sin almacenamiento el aviso reaparece al recargar */ } };

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
  const [cambioPerfil, setCambioPerfil] = useState(null);
  const [cambioVisto, setCambioVisto] = useState(leerVisto);
  const [avisosVacaciones, setAvisosVacaciones] = useState([]);
  const [avisosLiquidacion, setAvisosLiquidacion] = useState([]);
  // Cada «Ir a los cesados» remonta el panel de trabajadores con «Ver cesados» marcado; 0 = entrada normal.
  const [irCesados, setIrCesados] = useState(0);

  useEffect(() => {
    Promise.all([fetchAuth("/planilla/catalogos"), fetchAuth("/contabilidad/cuentas"), fetchAuth("/centros-costo")]).then(async ([rc, rp, rk]) => {
      if (!rc.ok) return setError((await rc.json().catch(() => ({}))).mensaje || "No se pudo cargar Planilla.");
      setCatalogos(await rc.json());
      if (rp.ok) setCuentas(await rp.json());
      if (rk.ok) setCentrosCosto((await rk.json()).filter((c) => c.activo));
    }).catch(() => setError("Error de conexión con el servidor."));
  }, []);

  const aplicarAvisos = (d) => { setAvisosPerfil(d.avisos || []); setCambioPerfil(d.cambioPerfil || null); };

  // Lo cambian las fichas, la generación o cierre de la planilla y los trámites de T-Registro.
  const refrescarAvisos = useCallback(async () => {
    try {
      const r = await fetchAuth("/planilla/perfil");
      if (r.ok) aplicarAvisos(await r.json());
    } catch { /* los avisos son informativos: sin ellos la planilla sigue funcionando */ }
  }, []);
  useEffect(() => { const t = setTimeout(refrescarAvisos, 0); return () => clearTimeout(t); }, [refrescarAvisos]);

  // Los avisos de vacaciones cambian con las boletas (goce y venta) y con el panel de vacaciones (ajustes y carga inicial).
  const refrescarVacaciones = useCallback(async () => {
    try {
      const r = await fetchAuth("/planilla/vacaciones");
      if (r.ok) setAvisosVacaciones((await r.json()).avisos);
    } catch { /* los avisos son informativos: sin ellos la planilla sigue funcionando */ }
  }, []);
  useEffect(() => { const t = setTimeout(refrescarVacaciones, 0); return () => clearTimeout(t); }, [refrescarVacaciones, tab]);

  // Cesados sin liquidación confirmada: cambian con la fecha de cese de las fichas y al confirmar o anular una liquidación.
  const refrescarLiquidaciones = useCallback(async () => {
    try {
      const r = await fetchAuth("/planilla/liquidaciones/avisos");
      if (r.ok) setAvisosLiquidacion((await r.json()).avisos);
    } catch { /* los avisos son informativos: sin ellos la planilla sigue funcionando */ }
  }, []);
  useEffect(() => { const t = setTimeout(refrescarLiquidaciones, 0); return () => clearTimeout(t); }, [refrescarLiquidaciones, tab]);
  const irACesados = () => { setIrCesados((n) => n + 1); setTab("trabajadores"); };

  const entendido = () => { guardarVisto(cambioPerfil.fecha); setCambioVisto(cambioPerfil.fecha); };
  const verCambio = mostrarCambioPerfil(cambioPerfil, cambioVisto);

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
          <button key={t.id} onClick={() => { setTab(t.id); setIrCesados(0); }}
            className={`px-4 py-2.5 text-sm font-medium transition border-b-2 -mb-px ${
              tab === t.id ? "border-purple-600 text-purple-700" : "border-transparent text-gray-500 hover:text-gray-700"
            }`}>
            {t.label}
            {t.id === "vacaciones" && avisosVacaciones.length > 0 && <span className="ml-1.5 bg-amber-500 text-white text-[10px] font-semibold rounded-full px-1.5 py-0.5">{avisosVacaciones.length}</span>}
          </button>
        ))}
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {(avisosPerfil.length > 0 || verCambio) && tab !== "perfil" && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-sm text-amber-800 space-y-1">
          {verCambio && (
            <p>
              {cambioPerfil.texto}{" "}
              <button onClick={entendido} className="text-xs underline font-medium hover:text-amber-900">Entendido</button>
            </p>
          )}
          {avisosPerfil.map((a, i) => <p key={i}>{a}</p>)}
          <button onClick={() => setTab("perfil")} className="text-xs underline font-medium hover:text-amber-900">Ir al perfil laboral</button>
        </div>
      )}
      {avisosVacaciones.length > 0 && tab !== "vacaciones" && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-sm text-amber-800 space-y-1">
          {resumenAvisosVacaciones(avisosVacaciones).map((a, i) => <p key={i}>{a}</p>)}
          <button onClick={() => setTab("vacaciones")} className="text-xs underline font-medium hover:text-amber-900">Ir a vacaciones</button>
        </div>
      )}
      {avisosLiquidacion.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-sm text-amber-800 space-y-1">
          {avisosLiquidacion.map((a, i) => <p key={i}>{a}</p>)}
          <button onClick={irACesados} className="text-xs underline font-medium hover:text-amber-900">Ir a los cesados</button>
        </div>
      )}
      {catalogos && (
        <>
          {tab === "mes" && <PanelPlanillaMes mes={mes} setMes={setMes} catalogos={catalogos} puedeEscribir={puedeEscribir} refrescarAvisos={refrescarAvisos} />}
          {tab === "trabajadores" && <PanelTrabajadores key={irCesados} catalogos={catalogos} centrosCosto={centrosCosto} puedeEscribir={puedeEscribir}
            refrescarAvisos={refrescarAvisos} onLiquidacion={refrescarLiquidaciones} verCesadosInicial={irCesados > 0} />}
          {tab === "vacaciones" && <PanelVacaciones puedeEscribir={puedeEscribir} onAvisos={setAvisosVacaciones} />}
          {tab === "tregistro" && <PanelTRegistro puedeEscribir={puedeEscribir} refrescarAvisos={refrescarAvisos} />}
          {tab === "configtr" && <PanelConfigTRegistro catalogos={catalogos} puedeEscribir={puedeEscribir} onGuardado={refrescarCatalogos} />}
          {tab === "perfil" && <PanelPerfilLaboral catalogos={catalogos} puedeEscribir={puedeEscribir} onGuardado={(d) => { aplicarAvisos(d); refrescarCatalogos(); }} />}
          {tab === "parametros" && <PanelParametrosPlanilla mes={mes} setMes={setMes} catalogos={catalogos} puedeEscribir={puedeEscribir} />}
          {tab === "plame" && <PanelPlame mes={mes} setMes={setMes} catalogos={catalogos} />}
          {tab === "cuentas" && <PanelCuentasPlanilla cuentas={cuentas} catalogos={catalogos} puedeEscribir={puedeEscribir} />}
        </>
      )}
    </div>
  );
}
