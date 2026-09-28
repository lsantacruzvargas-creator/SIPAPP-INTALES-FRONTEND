import { useState, useEffect } from "react";
import { fetchAuth, getUsuario } from "../utils/fetchAuth";
import ModalEmpresa from "../components/ModalEmpresa";
import TablaScroll from "../components/TablaScroll";
import ConfirmacionAccion from "../components/ConfirmacionAccion";
import AvisoAccion from "../components/AvisoAccion";

const TIPO_LABEL = { cliente: "Cliente", proveedor: "Proveedor", ambos: "Cliente y proveedor" };
const TIPO_BADGE = { cliente: "bg-blue-50 text-blue-700", proveedor: "bg-amber-50 text-amber-700", ambos: "bg-purple-50 text-purple-700" };

export default function Empresas() {
  const [empresas, setEmpresas] = useState([]);
  const [filtro, setFiltro] = useState("");
  const [filtroTipo, setFiltroTipo] = useState("");
  const [modal, setModal] = useState(false);
  const [editando, setEditando] = useState(null);
  const [eliminandoId, setEliminandoId] = useState(null);
  const [confirmandoEliminar, setConfirmandoEliminar] = useState(null);
  const [avisoError, setAvisoError] = useState("");
  const esAdmin = getUsuario()?.rol === "admin";

  const cargar = () =>
    fetchAuth("/empresas").then((res) => res.ok && res.json().then(setEmpresas));

  const eliminar = async () => {
    const empresa = confirmandoEliminar;
    setConfirmandoEliminar(null);
    setEliminandoId(empresa._id);
    const r = await fetchAuth(`/empresas/${empresa._id}`, { method: "DELETE" });
    if (r.ok) {
      await cargar();
    } else {
      const d = await r.json().catch(() => ({}));
      setAvisoError(d.mensaje || "Error al eliminar la empresa.");
    }
    setEliminandoId(null);
  };

  useEffect(() => { cargar(); }, []);

  const empresasFiltradas = empresas.filter((e) => {
    const q = filtro.toLowerCase();
    // razonSocial siempre existe (requerido en el modelo), pero ruc no —
    // muchas empresas importadas de OTs históricas no lo tienen (ver
    // Backend/src/models/Empresa.js). Sin optional chaining, `e.ruc.includes`
    // tira TypeError apenas hay una empresa sin RUC que no matchea por
    // nombre, y filter() completo revienta silenciosamente (el input parece
    // "no hacer nada").
    const coincideTexto = e.razonSocial?.toLowerCase().includes(q) || e.ruc?.toLowerCase().includes(q);
    const tipo = e.tipo || "cliente";
    const coincideTipo = !filtroTipo || tipo === "ambos" || tipo === filtroTipo;
    return coincideTexto && coincideTipo;
  });

  const abrirNuevo = () => {
    setEditando(null);
    setModal(true);
  };

  const abrirEditar = (empresa) => {
    setEditando(empresa);
    setModal(true);
  };

  return (
    <div className="p-6 m-0">
      <div className="flex flex-wrap justify-between items-center mb-6">
        <h2 className="text-xl font-semibold text-gray-800 mb-2">Empresas</h2>
        <div className="flex flex-wrap items-center gap-3">
          <select value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400">
            <option value="">Todas</option>
            <option value="cliente">Clientes</option>
            <option value="proveedor">Proveedores</option>
          </select>
          <input
            type="text"
            placeholder="Buscar por nombre o RUC…"
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-gray-400"
          />
          <button
            onClick={abrirNuevo}
            className="bg-gray-900 text-white px-4 py-2 rounded-lg text-sm hover:bg-gray-700 transition"
          >
            + Nueva empresa
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <TablaScroll className="overflow-x-auto">
        <table className="w-full text-sm min-w-[600px]">
          <thead className="bg-gray-500 text-white text-xs uppercase">
            <tr>
              <th className="px-4 py-3 text-left">Código</th>
              <th className="px-4 py-3 text-left">Alias</th>
              <th className="px-4 py-3 text-left">Razón social</th>
              <th className="px-4 py-3 text-left">RUC</th>
              <th className="px-4 py-3 text-left">Tipo</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {empresasFiltradas.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                  {filtro ? "Sin resultados para la búsqueda" : "Sin empresas registradas"}
                </td>
              </tr>
            ) : (
              empresasFiltradas.map((e) => (
                <tr key={e._id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-gray-400 text-xs">{e.codigo}</td>
                  <td className="px-4 py-3 font-medium">{e.alias}</td>
                  <td className="px-4 py-3">{e.razonSocial}</td>
                  <td className="px-4 py-3">{e.ruc}</td>
                  <td className="px-4 py-3">
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${TIPO_BADGE[e.tipo || "cliente"]}`}>
                      {TIPO_LABEL[e.tipo || "cliente"]}
                    </span>
                    {(e.tipoArticulos || []).length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {e.tipoArticulos.map((t) => (
                          <span key={t._id || t} className="text-[10px] bg-gray-100 text-gray-600 rounded px-1.5 py-0.5">{t.nombre}</span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right space-x-3">
                    <button
                      onClick={() => abrirEditar(e)}
                      className="text-blue-600 hover:underline text-xs"
                    >
                      Editar
                    </button>
                    {esAdmin && (
                      <button
                        onClick={() => setConfirmandoEliminar(e)}
                        disabled={eliminandoId === e._id}
                        className="text-red-500 hover:underline text-xs disabled:opacity-50"
                      >
                        {eliminandoId === e._id ? "Eliminando…" : "Eliminar"}
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        </TablaScroll>
      </div>

      {modal && (
        <ModalEmpresa
          empresa={editando}
          onClose={() => setModal(false)}
          onGuardada={async () => {
            await cargar();
            setModal(false);
          }}
        />
      )}

      {confirmandoEliminar && (
        <ConfirmacionAccion
          mensaje={`¿Eliminar la empresa "${confirmandoEliminar.razonSocial}"? Esta acción no se puede deshacer.`}
          onCancelar={() => setConfirmandoEliminar(null)}
          onConfirmar={eliminar}
          textoConfirmar="Eliminar"
        />
      )}

      {avisoError && <AvisoAccion mensaje={avisoError} onCerrar={() => setAvisoError("")} />}
    </div>
  );
}
