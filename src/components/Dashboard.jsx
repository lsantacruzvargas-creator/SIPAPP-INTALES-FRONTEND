import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { fetchAuth, getUsuario } from "../utils/fetchAuth.js";

const BADGE = {
  cotizado:   "bg-blue-100 text-blue-700 border-blue-200",
  en_proceso: "bg-yellow-100 text-yellow-700 border-yellow-200",
  entregado:  "bg-green-100 text-green-700 border-green-200",
  anulado:    "bg-red-100 text-red-700 border-red-200",
};
const ESTADOS = ["cotizado", "en_proceso", "entregado", "anulado"];
const ESTADO_LABEL = { cotizado: "Cotizado", en_proceso: "En proceso", entregado: "Entregado", anulado: "Anulado" };

function KPICard({ label, value, sub, color = "text-gray-800", onClick }) {
  return (
    <div className={`card flex flex-col gap-1 ${onClick ? "cursor-pointer hover:shadow-md transition-shadow" : ""}`} onClick={onClick}>
      <p className="text-xs text-gray-400 uppercase font-semibold">{label}</p>
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400">{sub}</p>}
    </div>
  );
}

function fmt(n) { return Number(n || 0).toLocaleString("es-PE", { minimumFractionDigits: 0 }); }

export default function Dashboard() {
  const navigate  = useNavigate();
  const usuario   = getUsuario();
  const esTecnico = usuario?.rol === "tecnico";

  const [ots,      setOts]      = useState([]);
  const [facturas, setFacturas] = useState([]);
  const [ocs,      setOcs]      = useState([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    Promise.all([
      fetchAuth("/api/ots").then(r => r.json()),
      esTecnico ? Promise.resolve([]) : fetchAuth("/api/facturas").then(r => r.json()),
      esTecnico ? Promise.resolve([]) : fetchAuth("/api/ordenes-compra").then(r => r.json()),
    ]).then(([rOts, rFac, rOcs]) => {
      setOts(Array.isArray(rOts) ? rOts : []);
      setFacturas(Array.isArray(rFac) ? rFac : []);
      setOcs(Array.isArray(rOcs) ? rOcs : []);
      setCargando(false);
    });
  }, []);

  const hoy      = new Date();
  const activas  = ots.filter(o => o.estado !== "anulado" && o.estado !== "entregado");
  const vencidas = activas.filter(o => o.fechaEntrega && new Date(o.fechaEntrega) < hoy);
  const margenTotal = ots.filter(o => o.estado === "entregado").reduce((s, o) => s + (o.margen || 0), 0);

  const porEstado = ESTADOS.reduce((acc, e) => {
    acc[e] = ots.filter(o => o.estado === e);
    return acc;
  }, {});

  const factsActivas   = facturas.filter(f => !f.anulada);
  const totalFacturado = factsActivas.reduce((s, f) => s + (f.monto || 0), 0);
  const porCobrar      = factsActivas
    .filter(f => f.estadoPago !== "pagado")
    .reduce((s, f) => s + ((f.totalAPagar || 0) - (f.montoPagado || 0)), 0);
  const totalPagado    = factsActivas.reduce((s, f) => s + (f.montoPagado || 0), 0);

  const ocsPendientes = ocs.filter(o => !o.anulada && o.estado === "pendiente").length;

  if (cargando) return <div className="flex items-center justify-center h-64 text-gray-400">Cargando...</div>;

  return (
    <div className="p-4 max-w-7xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-800">Dashboard</h1>
        <p className="text-sm text-gray-400">{hoy.toLocaleDateString("es-PE", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</p>
      </div>

      {!esTecnico && (
        <div>
          <p className="text-xs text-gray-400 uppercase font-semibold mb-2">Órdenes de trabajo</p>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KPICard label="OTs activas" value={activas.length} sub={vencidas.length > 0 ? `${vencidas.length} vencidas` : "Al día"} color={vencidas.length > 0 ? "text-red-600" : "text-gray-800"} onClick={() => navigate("/ots")} />
            <KPICard label="Entregadas" value={porEstado.entregado?.length || 0} onClick={() => navigate("/ots")} />
            <KPICard label="Monto entregadas" value={`S/ ${fmt(ots.filter(o => o.estado === "entregado").reduce((s, o) => s + (o.totalCotizado || 0), 0))}`} color="text-blue-700" />
            <KPICard label="Margen entregadas" value={`S/ ${fmt(margenTotal)}`} color={margenTotal >= 0 ? "text-green-600" : "text-red-600"} />
          </div>
        </div>
      )}

      {esTecnico && (
        <div className="grid grid-cols-2 gap-4">
          <KPICard label="OTs activas" value={activas.length} sub={vencidas.length > 0 ? `${vencidas.length} vencidas` : "Al día"} color={vencidas.length > 0 ? "text-red-600" : "text-gray-800"} />
          <KPICard label="Entregadas" value={porEstado.entregado?.length || 0} />
        </div>
      )}

      {!esTecnico && (
        <div>
          <p className="text-xs text-gray-400 uppercase font-semibold mb-2">Facturación y cobros</p>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KPICard
              label="Total facturado"
              value={`S/ ${fmt(totalFacturado)}`}
              sub={`${factsActivas.length} factura${factsActivas.length !== 1 ? "s" : ""}`}
              color="text-blue-700"
              onClick={() => navigate("/facturas")}
            />
            <KPICard
              label="Por cobrar"
              value={`S/ ${fmt(porCobrar)}`}
              sub={`${factsActivas.filter(f => f.estadoPago !== "pagado").length} pendiente${factsActivas.filter(f => f.estadoPago !== "pagado").length !== 1 ? "s" : ""}`}
              color={porCobrar > 0 ? "text-orange-600" : "text-gray-400"}
              onClick={() => navigate("/facturas")}
            />
            <KPICard
              label="Cobrado"
              value={`S/ ${fmt(totalPagado)}`}
              color="text-green-600"
              onClick={() => navigate("/facturas")}
            />
            <KPICard
              label="OC pendientes"
              value={ocsPendientes}
              sub="Órdenes de compra"
              color={ocsPendientes > 0 ? "text-yellow-600" : "text-gray-400"}
              onClick={() => navigate("/ordenes-compra")}
            />
          </div>
        </div>
      )}

      <div>
        <p className="text-xs text-gray-400 uppercase font-semibold mb-2">Estado de OTs</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {ESTADOS.map(estado => (
            <div key={estado} className="space-y-2">
              <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${BADGE[estado]}`}>
                <span className="font-semibold text-sm">{ESTADO_LABEL[estado]}</span>
                <span className="ml-auto bg-white/60 rounded-full px-2 text-xs font-bold">{porEstado[estado]?.length || 0}</span>
              </div>
              <div className="space-y-2">
                {porEstado[estado]?.slice(0, 8).map(ot => (
                  <div
                    key={ot._id}
                    onClick={() => navigate(`/ots/${ot._id}`)}
                    className="bg-white border border-gray-100 rounded-lg p-3 shadow-sm cursor-pointer hover:shadow-md hover:border-blue-200 transition-all"
                  >
                    <div className="flex justify-between items-start mb-1">
                      <span className="font-bold text-blue-700 text-sm">{ot.codigo}</span>
                      {ot.tipo === "emergencia" && <span className="text-orange-500 text-xs">⚠️</span>}
                    </div>
                    <p className="text-xs text-gray-500 truncate">{ot.empresa?.razonSocial || ot.clienteNombre || "—"}</p>
                    {ot.items?.[0]?.descripcion && (
                      <p className="text-xs text-gray-400 truncate mt-1">{ot.items[0].descripcion}</p>
                    )}
                    {!esTecnico && (
                      <p className="text-xs font-semibold text-gray-700 mt-2">
                        S/ {fmt(ot.totalCotizado || 0)}
                      </p>
                    )}
                    {ot.fechaEntrega && (
                      <p className={`text-xs mt-1 ${new Date(ot.fechaEntrega) < hoy && estado !== "entregado" && estado !== "anulado" ? "text-red-500 font-semibold" : "text-gray-400"}`}>
                        📅 {new Date(ot.fechaEntrega).toLocaleDateString("es-PE")}
                      </p>
                    )}
                  </div>
                ))}
                {porEstado[estado]?.length > 8 && (
                  <button onClick={() => navigate(`/ots?estado=${estado}`)} className="text-xs text-blue-500 hover:text-blue-700 w-full text-center py-1">
                    +{porEstado[estado].length - 8} más...
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
