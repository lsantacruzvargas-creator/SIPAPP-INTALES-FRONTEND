import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { fetchAuth } from "../utils/fetchAuth.js";

const BADGE = {
  cotizado:   "bg-blue-100 text-blue-700",
  en_proceso: "bg-yellow-100 text-yellow-700",
  entregado:  "bg-green-100 text-green-700",
  anulado:    "bg-red-100 text-red-700",
};
const ESTADO_LABEL = {
  cotizado: "Cotizado", en_proceso: "En proceso", entregado: "Entregado", anulado: "Anulado",
};
const ESTADOS = ["cotizado", "en_proceso", "entregado", "anulado"];

function fmtFecha(fecha) {
  if (!fecha) return "—";
  return new Date(fecha).toLocaleString("es-PE", {
    timeZone: "America/Lima",
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default function TablaInformes() {
  const navigate = useNavigate();
  const [informes, setInformes]       = useState([]);
  const [cargando, setCargando]       = useState(true);
  const [busqueda, setBusqueda]       = useState("");
  const [filtroEstado, setFiltroEstado] = useState("");

  const cargar = async () => {
    setCargando(true);
    const res  = await fetchAuth("/api/informes");
    const data = await res.json();
    setInformes(Array.isArray(data) ? data : []);
    setCargando(false);
  };

  useEffect(() => { cargar(); }, []);

  const filtrados = informes.filter(inf => {
    if (filtroEstado && inf.ot?.estado !== filtroEstado) return false;
    if (!busqueda) return true;
    const q = busqueda.toLowerCase();
    return (
      inf.codigo?.toLowerCase().includes(q) ||
      inf.ot?.codigo?.toLowerCase().includes(q) ||
      inf.ot?.empresa?.razonSocial?.toLowerCase().includes(q) ||
      inf.ot?.clienteNombre?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="p-4 max-w-7xl mx-auto">
      <div className="flex flex-wrap justify-between items-center gap-3 mb-5">
        <h1 className="text-2xl font-bold text-gray-800">Informes de trabajo</h1>
      </div>

      <div className="flex flex-wrap gap-3 mb-5">
        <input
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          className="input-field max-w-xs"
          placeholder="Buscar por código, OT, empresa..."
        />
        <select
          value={filtroEstado}
          onChange={e => setFiltroEstado(e.target.value)}
          className="input-field w-44"
        >
          <option value="">Todos los estados</option>
          {ESTADOS.map(e => (
            <option key={e} value={e}>{ESTADO_LABEL[e]}</option>
          ))}
        </select>
      </div>

      {cargando ? (
        <div className="text-center py-12 text-gray-400">Cargando...</div>
      ) : filtrados.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <p className="text-3xl mb-2">📋</p>
          <p>No hay informes{busqueda || filtroEstado ? " que coincidan con los filtros" : " creados aún"}</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-100 shadow-sm">
          <table className="w-full text-sm bg-white">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-3 font-semibold text-gray-500 text-xs uppercase">Informe</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-500 text-xs uppercase">OT</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-500 text-xs uppercase">Empresa / Cliente</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-500 text-xs uppercase">Estado OT</th>
                <th className="text-center px-4 py-3 font-semibold text-gray-500 text-xs uppercase">Reportes</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-500 text-xs uppercase">Último reporte</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtrados.map(inf => {
                const ultimoReporte = inf.reportes?.length
                  ? inf.reportes[inf.reportes.length - 1]
                  : null;
                return (
                  <tr key={inf._id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-bold text-indigo-700 font-mono text-xs">
                      {inf.codigo}
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-semibold text-blue-700">{inf.ot?.codigo}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-700 max-w-[200px]">
                      <p className="truncate">
                        {inf.ot?.empresa?.razonSocial || inf.ot?.clienteNombre || "—"}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      {inf.ot?.estado ? (
                        <span className={`px-2 py-1 rounded-full text-xs font-semibold ${BADGE[inf.ot.estado]}`}>
                          {ESTADO_LABEL[inf.ot.estado]}
                        </span>
                      ) : "—"}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-gray-100 text-gray-700 text-xs font-bold">
                        {inf.reportes?.length ?? 0}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {ultimoReporte ? fmtFecha(ultimoReporte.fecha) : "Sin reportes"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => navigate(`/informes/${inf.ot?._id}`)}
                        className="text-blue-500 hover:text-blue-700 text-xs px-3 py-1 rounded hover:bg-blue-50 font-medium"
                      >
                        Ver
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-gray-400 mt-2">
        {filtrados.length} resultado{filtrados.length !== 1 ? "s" : ""}
      </p>
    </div>
  );
}
