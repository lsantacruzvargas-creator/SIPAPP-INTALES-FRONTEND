import { useState, useEffect } from "react";
import { fetchAuth } from "../utils/fetchAuth";
import TablaPorProcesar from "../components/compras/TablaPorProcesar";
import TablaLicitaciones from "../components/compras/TablaLicitaciones";

const TABS = [
  { id: "por-procesar", label: "Por procesar" },
  { id: "licitacion", label: "En licitación" },
];

const porNombre = (a, b) => a.nombre.localeCompare(b.nombre, "es");

// Catálogos compartidos por las pestañas — se cargan una sola vez acá para
// que una tabla con N filas no dispare N fetch.
export default function Compras() {
  const [tab, setTab] = useState("por-procesar");
  const [catalogos, setCatalogos] = useState({ tiposArticulo: [], centrosCosto: [], proveedores: [], tipoCambio: 3.75 });

  useEffect(() => {
    Promise.all([
      fetchAuth("/tipos-articulo"),
      fetchAuth("/centros-costo"),
      fetchAuth("/empresas?tipo=proveedor"),
      fetchAuth("/tipo-cambio"),
    ]).then(async ([rTipos, rCentros, rProveedores, rTc]) => {
      setCatalogos({
        tiposArticulo: rTipos.ok ? await rTipos.json() : [],
        centrosCosto: rCentros.ok ? (await rCentros.json()).filter((c) => c.activo) : [],
        proveedores: rProveedores.ok ? await rProveedores.json() : [],
        tipoCambio: rTc.ok ? (await rTc.json()).valor : 3.75,
      });
    });
  }, []);

  const agregarTipoArticulo = (tipo) =>
    setCatalogos((c) => ({ ...c, tiposArticulo: [...c.tiposArticulo, tipo].sort(porNombre) }));

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-800">Compras</h1>
        <p className="text-sm text-gray-400 mt-0.5">Solicitudes de compra de materiales y servicios → licitación con proveedores → orden de compra</p>
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

      {tab === "por-procesar" && (
        <TablaPorProcesar catalogos={catalogos} onTipoCreado={agregarTipoArticulo} onEnviado={() => setTab("licitacion")} />
      )}
      {tab === "licitacion" && <TablaLicitaciones catalogos={catalogos} />}
    </div>
  );
}
