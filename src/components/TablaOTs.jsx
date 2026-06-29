import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { fetchAuth, getUsuario } from "../utils/fetchAuth.js";
import SelectorTipoOT from "./SelectorTipoOT.jsx";

const BADGE = {
  cotizado: "bg-blue-100 text-blue-700",
  en_proceso: "bg-yellow-100 text-yellow-700",
  entregado: "bg-green-100 text-green-700",
  anulado: "bg-red-100 text-red-700",
};
const ESTADO_LABEL = { cotizado: "Cotizado", en_proceso: "En proceso", entregado: "Entregado", anulado: "Anulado" };
const TIPO_BADGE = {
  cotizado: "bg-blue-50 text-blue-600",
  emergencia: "bg-orange-50 text-orange-600",
  trato_directo: "bg-green-50 text-green-700",
};
const TIPO_LABEL = { cotizado: "Cotizado", emergencia: "Emergencia", trato_directo: "Trato directo" };

export default function TablaOTs() {
  const navigate = useNavigate();
  const usuario = getUsuario();
  const esTecnico = usuario?.rol === "tecnico";
  const puedeCrear = ["admin", "ejecutivo"].includes(usuario?.rol);
  const puedeAnular = ["admin", "ejecutivo"].includes(usuario?.rol);

  const [ots, setOts] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [filtros, setFiltros] = useState({ estado: "", tipo: "", busqueda: "" });
  const [mostrarSelector, setMostrarSelector] = useState(false);
  const [confirmAnular, setConfirmAnular] = useState(null);

  const cargar = async () => {
    setCargando(true);
    const params = new URLSearchParams();
    if (filtros.estado) params.append("estado", filtros.estado);
    if (filtros.tipo) params.append("tipo", filtros.tipo);
    const res = await fetchAuth(`/api/ots?${params}`);
    const data = await res.json();
    setOts(Array.isArray(data) ? data : []);
    setCargando(false);
  };

  useEffect(() => { cargar(); }, [filtros.estado, filtros.tipo]);

  const handleAnular = async (ot) => {
    const res = await fetchAuth(`/api/ots/${ot._id}/anular`, { method: "PATCH" });
    if (res.ok) { setConfirmAnular(null); await cargar(); }
  };

  const exportarExcel = async () => {
    const params = new URLSearchParams();
    if (filtros.estado) params.append("estado", filtros.estado);
    const res = await fetchAuth(`/api/reportes/excel?${params}`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `OTs_INTALES_${new Date().toISOString().slice(0,10)}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const otsFiltradas = ots.filter(ot => {
    if (!filtros.busqueda) return true;
    const q = filtros.busqueda.toLowerCase();
    return (
      ot.codigo?.toLowerCase().includes(q) ||
      ot.empresa?.razonSocial?.toLowerCase().includes(q) ||
      ot.clienteNombre?.toLowerCase().includes(q) ||
      ot.solicitadoPor?.toLowerCase().includes(q) ||
      ot.items?.some(i => i.descripcion?.toLowerCase().includes(q))
    );
  });

  return (
    <div className="p-4 max-w-7xl mx-auto">
      {mostrarSelector && (
        <SelectorTipoOT
          onClose={() => setMostrarSelector(false)}
          onSelect={(tipo) => { setMostrarSelector(false); navigate(`/ots/nueva/${tipo}`); }}
        />
      )}

      {confirmAnular && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full">
            <h3 className="font-bold text-lg text-gray-800 mb-2">¿Anular {confirmAnular.codigo}?</h3>
            <p className="text-gray-500 text-sm mb-5">Esta acción no se puede revertir. La OT quedará marcada como anulada y no podrá editarse.</p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setConfirmAnular(null)} className="btn-secondary">Cancelar</button>
              <button onClick={() => handleAnular(confirmAnular)} className="btn-danger">Sí, anular</button>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-wrap justify-between items-center gap-3 mb-5">
        <h1 className="text-2xl font-bold text-gray-800">Órdenes de Trabajo</h1>
        <div className="flex gap-2">
          {!esTecnico && (
            <button onClick={exportarExcel} className="btn-secondary text-xs">📊 Exportar Excel</button>
          )}
          {puedeCrear && (
            <button onClick={() => setMostrarSelector(true)} className="btn-primary">+ Nueva OT</button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-3 mb-5">
        <input
          value={filtros.busqueda}
          onChange={e => setFiltros({ ...filtros, busqueda: e.target.value })}
          className="input-field max-w-xs"
          placeholder="Buscar por código, empresa, ítem..."
        />
        <select
          value={filtros.estado}
          onChange={e => setFiltros({ ...filtros, estado: e.target.value })}
          className="input-field w-40"
        >
          <option value="">Todos los estados</option>
          <option value="cotizado">Cotizado</option>
          <option value="en_proceso">En proceso</option>
          <option value="entregado">Entregado</option>
          <option value="anulado">Anulado</option>
        </select>
        <select
          value={filtros.tipo}
          onChange={e => setFiltros({ ...filtros, tipo: e.target.value })}
          className="input-field w-40"
        >
          <option value="">Todos los tipos</option>
          <option value="cotizado">Cotizado</option>
          <option value="emergencia">Emergencia</option>
          <option value="trato_directo">Trato directo</option>
        </select>
      </div>

      {cargando ? (
        <div className="text-center py-12 text-gray-400">Cargando...</div>
      ) : otsFiltradas.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <p className="text-3xl mb-2">📋</p>
          <p>No hay OTs{filtros.busqueda || filtros.estado || filtros.tipo ? " con esos filtros" : ""}</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-100 shadow-sm">
          <table className="w-full text-sm bg-white">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-3 font-semibold text-gray-500 text-xs uppercase">OT</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-500 text-xs uppercase">Tipo</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-500 text-xs uppercase">Empresa / Cliente</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-500 text-xs uppercase">Descripción</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-500 text-xs uppercase">F. entrega</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-500 text-xs uppercase">Garantía</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-500 text-xs uppercase">Estado</th>
                {!esTecnico && <th className="text-right px-4 py-3 font-semibold text-gray-500 text-xs uppercase">Monto</th>}
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {otsFiltradas.map((ot) => (
                <tr key={ot._id} className={`hover:bg-gray-50 transition-colors ${ot.estado === "anulado" ? "opacity-60" : ""}`}>
                  <td className="px-4 py-3">
                    <span className="font-bold text-blue-700">{ot.codigo}</span>
                    {ot.tipo === "emergencia" && (
                      <span className="ml-1 text-orange-500 text-xs" title="Urgente">⚠️</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${TIPO_BADGE[ot.tipo]}`}>
                      {TIPO_LABEL[ot.tipo]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-700">
                    {ot.empresa?.razonSocial || ot.clienteNombre || "—"}
                  </td>
                  <td className="px-4 py-3 text-gray-600 max-w-xs">
                    {ot.items?.[0]?.descripcion || ot.tipo === "trato_directo" ? (ot.items?.[0]?.descripcion || "Trato directo") : "—"}
                    {ot.items?.length > 1 && (
                      <span className="text-gray-400 text-xs ml-1">+{ot.items.length - 1} más</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {ot.fechaEntrega ? new Date(ot.fechaEntrega).toLocaleDateString("es-PE") : "—"}
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{ot.garantia || "—"}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-semibold ${BADGE[ot.estado]}`}>
                      {ESTADO_LABEL[ot.estado]}
                    </span>
                  </td>
                  {!esTecnico && (
                    <td className="px-4 py-3 text-right font-medium">
                      {ot.estado === "anulado" ? "—" : `S/ ${(ot.totalCotizado || 0).toLocaleString("es-PE", { minimumFractionDigits: 2 })}`}
                    </td>
                  )}
                  <td className="px-4 py-3">
                    <div className="flex gap-1 justify-end">
                      <button
                        onClick={() => navigate(`/ots/${ot._id}`)}
                        className="text-blue-500 hover:text-blue-700 text-xs px-2 py-1 rounded hover:bg-blue-50"
                      >Ver</button>
                      {puedeAnular && ot.estado !== "anulado" && (
                        <button
                          onClick={() => setConfirmAnular(ot)}
                          className="text-red-400 hover:text-red-600 text-xs px-2 py-1 rounded hover:bg-red-50"
                        >Anular</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-gray-400 mt-3">{otsFiltradas.length} resultado{otsFiltradas.length !== 1 ? "s" : ""}</p>
    </div>
  );
}
