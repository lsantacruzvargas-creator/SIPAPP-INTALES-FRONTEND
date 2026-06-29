import { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { fetchAuth, getUsuario } from "../utils/fetchAuth.js";

const ESTADO_OC = {
  pendiente: "bg-yellow-100 text-yellow-700",
  aprobada:  "bg-green-100 text-green-700",
  rechazada: "bg-red-100 text-red-700",
};
const ESTADOS = ["pendiente", "aprobada", "rechazada"];

const VACIO = { cotizacion: "", cliente: "", titulo: "", monto: "", numeroOC: "", estado: "pendiente" };

function fmt(n) { return Number(n || 0).toLocaleString("es-PE", { minimumFractionDigits: 2 }); }

export default function TablaOrdenesCompra() {
  const location = useLocation();
  const usuario  = getUsuario();
  const puedeEditar = ["admin", "ejecutivo", "encargado"].includes(usuario?.rol);

  const [ocs, setOcs] = useState([]);
  const [cots, setCots] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(VACIO);
  const [editando, setEditando] = useState(null);
  const [error, setError] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("");
  const [confirmAnular, setConfirmAnular] = useState(null);

  const cargar = async () => {
    setCargando(true);
    const params = new URLSearchParams();
    if (filtroEstado) params.append("estado", filtroEstado);
    const [rOcs, rCots, rCli] = await Promise.all([
      fetchAuth(`/api/ordenes-compra?${params}`).then(r => r.json()),
      fetchAuth("/api/cotizaciones").then(r => r.json()),
      fetchAuth("/api/clientes").then(r => r.json()),
    ]);
    setOcs(Array.isArray(rOcs) ? rOcs : []);
    setCots(Array.isArray(rCots) ? rCots.filter(c => !c.anulada) : []);
    setClientes(Array.isArray(rCli) ? rCli : []);
    setCargando(false);
  };

  useEffect(() => { cargar(); }, [filtroEstado]);

  useEffect(() => {
    const cotPresel = location.state?.cotizacion;
    if (cotPresel) {
      setForm({ ...VACIO, cotizacion: cotPresel._id, titulo: cotPresel.titulo, monto: cotPresel.monto });
      setEditando(null);
      setModal(true);
    }
  }, [location.state]);

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const abrir = (oc = null) => {
    setEditando(oc?._id || null);
    setError("");
    if (oc) {
      setForm({
        cotizacion: oc.cotizacion?._id || "", cliente: oc.cliente?._id || "",
        titulo: oc.titulo, monto: oc.monto, numeroOC: oc.numeroOC || "", estado: oc.estado,
      });
    } else {
      setForm(VACIO);
    }
    setModal(true);
  };

  const guardar = async (e) => {
    e.preventDefault();
    setError("");
    const body = { ...form, monto: Number(form.monto) };
    if (!body.cliente) delete body.cliente;
    const url    = editando ? `/api/ordenes-compra/${editando}` : "/api/ordenes-compra";
    const method = editando ? "PUT" : "POST";
    const res = await fetchAuth(url, { method, body: JSON.stringify(body) });
    const data = await res.json();
    if (!res.ok) { setError(data.error); return; }
    setModal(false);
    await cargar();
  };

  const anular = async (oc) => {
    await fetchAuth(`/api/ordenes-compra/${oc._id}/anular`, { method: "PATCH" });
    setConfirmAnular(null);
    await cargar();
  };

  const filtradas = ocs.filter(oc => {
    if (oc.anulada) return false;
    if (!busqueda) return true;
    const q = busqueda.toLowerCase();
    return oc.codigo?.toLowerCase().includes(q) || oc.titulo?.toLowerCase().includes(q) ||
      oc.numeroOC?.toLowerCase().includes(q) || oc.cotizacion?.codigo?.toLowerCase().includes(q);
  });

  return (
    <div className="p-4 max-w-7xl mx-auto">
      {modal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center px-6 py-4 border-b border-gray-100">
              <h2 className="font-bold text-lg text-gray-800">{editando ? "Editar orden de compra" : "Nueva orden de compra"}</h2>
              <button onClick={() => setModal(false)} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
            </div>
            <form onSubmit={guardar} className="p-6 space-y-4">
              <div>
                <label className="label">Cotización vinculada *</label>
                <select name="cotizacion" value={form.cotizacion} onChange={handleChange} className="input-field" required>
                  <option value="">— Seleccionar —</option>
                  {cots.map(c => (
                    <option key={c._id} value={c._id}>{c.codigo} — {c.titulo}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Título *</label>
                <input name="titulo" value={form.titulo} onChange={handleChange} className="input-field" required placeholder="Ej. OC Fabricación soporte metálico" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">N° OC del cliente</label>
                  <input name="numeroOC" value={form.numeroOC} onChange={handleChange} className="input-field" placeholder="OC-2026-001" />
                </div>
                <div>
                  <label className="label">Estado</label>
                  <select name="estado" value={form.estado} onChange={handleChange} className="input-field">
                    {ESTADOS.map(e => <option key={e} value={e}>{e.charAt(0).toUpperCase() + e.slice(1)}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="label">Monto (S/) *</label>
                <input name="monto" type="number" value={form.monto} onChange={handleChange} className="input-field" required min="0" step="0.01" placeholder="0.00" />
              </div>
              <div>
                <label className="label">Cliente</label>
                <select name="cliente" value={form.cliente} onChange={handleChange} className="input-field">
                  <option value="">Sin cliente registrado</option>
                  {clientes.map(c => <option key={c._id} value={c._id}>{c.razonSocial}</option>)}
                </select>
              </div>
              {error && <p className="text-red-600 text-sm">{error}</p>}
              <div className="flex gap-3 justify-end pt-2">
                <button type="button" onClick={() => setModal(false)} className="btn-secondary">Cancelar</button>
                <button type="submit" className="btn-primary">Guardar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {confirmAnular && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full">
            <h3 className="font-bold text-gray-800 mb-2">¿Anular {confirmAnular.codigo}?</h3>
            <p className="text-sm text-gray-500 mb-5">Esta acción no se puede revertir.</p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setConfirmAnular(null)} className="btn-secondary">Cancelar</button>
              <button onClick={() => anular(confirmAnular)} className="btn-danger">Anular</button>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-wrap justify-between items-center gap-3 mb-5">
        <h1 className="text-2xl font-bold text-gray-800">Órdenes de compra</h1>
        {puedeEditar && <button onClick={() => abrir()} className="btn-primary">+ Nueva OC</button>}
      </div>

      <div className="flex flex-wrap gap-3 mb-5">
        <input value={busqueda} onChange={e => setBusqueda(e.target.value)} className="input-field max-w-xs" placeholder="Buscar por código, título, N° OC..." />
        <select value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)} className="input-field w-40">
          <option value="">Todos los estados</option>
          {ESTADOS.map(e => <option key={e} value={e}>{e.charAt(0).toUpperCase() + e.slice(1)}</option>)}
        </select>
      </div>

      {cargando ? (
        <div className="text-center py-12 text-gray-400">Cargando...</div>
      ) : filtradas.length === 0 ? (
        <div className="text-center py-12 text-gray-400"><p className="text-3xl mb-2">📋</p><p>No hay órdenes de compra</p></div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-100 shadow-sm">
          <table className="w-full text-sm bg-white">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-3 font-semibold text-gray-500 text-xs uppercase">Código</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-500 text-xs uppercase">Título</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-500 text-xs uppercase">N° OC</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-500 text-xs uppercase">Cotización</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-500 text-xs uppercase">Cliente</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-500 text-xs uppercase">Monto</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-500 text-xs uppercase">Estado</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtradas.map(oc => (
                <tr key={oc._id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-bold text-green-700">{oc.codigo}</td>
                  <td className="px-4 py-3 text-gray-800 font-medium max-w-xs">
                    <p className="truncate">{oc.titulo}</p>
                  </td>
                  <td className="px-4 py-3 font-mono text-gray-500 text-xs">{oc.numeroOC || "—"}</td>
                  <td className="px-4 py-3">
                    <span className="text-blue-600 text-xs font-mono">{oc.cotizacion?.codigo}</span>
                    <p className="text-gray-400 text-xs truncate max-w-[120px]">{oc.cotizacion?.titulo}</p>
                  </td>
                  <td className="px-4 py-3 text-gray-600 text-xs">{oc.cliente?.razonSocial || "—"}</td>
                  <td className="px-4 py-3 text-right font-semibold">S/ {fmt(oc.monto)}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-semibold ${ESTADO_OC[oc.estado]}`}>
                      {oc.estado.charAt(0).toUpperCase() + oc.estado.slice(1)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1 justify-end">
                      {puedeEditar && (
                        <button onClick={() => abrir(oc)} className="text-blue-500 hover:text-blue-700 text-xs px-2 py-1 rounded hover:bg-blue-50">
                          Editar
                        </button>
                      )}
                      {["admin", "ejecutivo"].includes(usuario?.rol) && (
                        <button onClick={() => setConfirmAnular(oc)} className="text-red-400 hover:text-red-600 text-xs px-2 py-1 rounded hover:bg-red-50">
                          Anular
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-gray-400 mt-2">{filtradas.length} resultado{filtradas.length !== 1 ? "s" : ""}</p>
    </div>
  );
}
