import { useState, useEffect, useCallback } from "react";
import { fetchAuth, getUsuario } from "../utils/fetchAuth";
import TablaPorPagar from "../components/tesoreria/TablaPorPagar";
import TablaPorCobrar from "../components/tesoreria/TablaPorCobrar";
import TablaMovimientos from "../components/tesoreria/TablaMovimientos";
import PanelSire from "../components/tesoreria/PanelSire";
import PanelResumenTributario from "../components/tesoreria/PanelResumenTributario";
import PanelDiferenciaCambio from "../components/tesoreria/PanelDiferenciaCambio";
import PanelConfiguracion from "../components/tesoreria/PanelConfiguracion";
import ModalFacturaProveedor from "../components/tesoreria/ModalFacturaProveedor";

const TABS = [
  { id: "por-pagar", label: "Por pagar" },
  { id: "por-cobrar", label: "Por cobrar" },
  { id: "movimientos", label: "Movimientos" },
  { id: "sire", label: "SIRE" },
  { id: "resumen-tributario", label: "Resumen tributario" },
  { id: "diferencia-cambio", label: "Dif. de cambio" },
  { id: "configuracion", label: "Configuración", soloJefatura: true },
];

// El modal de factura vive aquí porque lo abren dos pestañas (Por pagar y SIRE).
export default function Tesoreria() {
  const puedeConfigurar = ["jefatura", "admin"].includes(getUsuario()?.rol);
  const [tab, setTab] = useState("por-pagar");
  const [catalogos, setCatalogos] = useState({ proveedores: [], centrosCosto: [], esAgenteRetencion: false, tipoCambio: 3.75 });
  const [modalFactura, setModalFactura] = useState(null);
  const [recarga, setRecarga] = useState(0);

  const cargarCatalogos = useCallback(() => Promise.all([
    fetchAuth("/empresas?tipo=proveedor"), fetchAuth("/centros-costo"), fetchAuth("/configuracion"), fetchAuth("/tipo-cambio"),
  ]).then(async ([rP, rC, rG, rT]) => {
    setCatalogos({
      proveedores: rP.ok ? await rP.json() : [],
      centrosCosto: rC.ok ? (await rC.json()).filter((c) => c.activo) : [],
      esAgenteRetencion: rG.ok ? !!(await rG.json()).esAgenteRetencion : false,
      tipoCambio: rT.ok ? (await rT.json()).valor : 3.75,
    });
  }), []);
  useEffect(() => { cargarCatalogos(); }, [cargarCatalogos]);

  const facturaGuardada = () => {
    setModalFactura(null);
    setRecarga((n) => n + 1);
    setTab("por-pagar");
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-800">Tesorería</h1>
        <p className="text-sm text-gray-400 mt-0.5">Cuentas por pagar y por cobrar, pagos, detracciones y retenciones, conciliación con el SIRE</p>
      </div>
      <div className="flex border-b border-gray-200 gap-1 flex-wrap">
        {TABS.filter((t) => !t.soloJefatura || puedeConfigurar).map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2.5 text-sm font-medium transition border-b-2 -mb-px ${
              tab === t.id ? "border-purple-600 text-purple-700" : "border-transparent text-gray-500 hover:text-gray-700"
            }`}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === "por-pagar" && <TablaPorPagar recarga={recarga} onRegistrarFactura={setModalFactura} />}
      {tab === "por-cobrar" && <TablaPorCobrar />}
      {tab === "movimientos" && <TablaMovimientos />}
      {tab === "sire" && <PanelSire onRegistrarFactura={setModalFactura} />}
      {tab === "resumen-tributario" && <PanelResumenTributario />}
      {tab === "diferencia-cambio" && <PanelDiferenciaCambio />}
      {tab === "configuracion" && puedeConfigurar && <PanelConfiguracion onCambio={cargarCatalogos} />}
      {modalFactura && (
        <ModalFacturaProveedor ocpId={modalFactura.ocpId} precarga={modalFactura.precarga} catalogos={catalogos}
          onClose={() => setModalFactura(null)} onGuardada={facturaGuardada} />
      )}
    </div>
  );
}
