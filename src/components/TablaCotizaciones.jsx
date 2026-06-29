import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { fetchAuth, getUsuario } from "../utils/fetchAuth.js";

const ESTADO_BADGE = {
  borrador:  "bg-gray-100 text-gray-600",
  enviada:   "bg-blue-100 text-blue-700",
  aprobada:  "bg-green-100 text-green-700",
  rechazada: "bg-red-100 text-red-700",
};
const ESTADOS = ["borrador", "enviada", "aprobada", "rechazada"];
const TIPO_BADGE = { servicio: "bg-purple-50 text-purple-700", venta: "bg-orange-50 text-orange-700" };

const VACIO = { titulo: "", tipo: "servicio", cliente: "", clienteNombre: "", ot: "", monto: "", descripcion: "", estado: "borrador" };

function fmt(n) { return Number(n || 0).toLocaleString("es-PE", { minimumFractionDigits: 2 }); }

export default function TablaCotizaciones() {
  const navigate = useNavigate();
  const usuario = getUsuario();
  const puedeEditar = ["admin", "ejecutivo"].includes(usuario?.rol);

  const [cots, setCots] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [ots, setOts] = useState([]);
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
    const [rCots, rCli, rOts] = await Promise.all([
      fetchAuth(`/api/cotizaciones?${params}`).then(r => r.json()),
      fetchAuth("/api/clientes").then(r => r.json()),
      fetchAuth("/api/ots").then(r => r.json()),
    ]);
    setCots(Array.isArray(rCots) ? rCots : []);
    setClientes(Array.isArray(rCli) ? rCli : []);
    setOts(Array.isArray(rOts) ? rOts : []);
    setCargando(false);
  };

  useEffect(() => { cargar(); }, [filtroEstado]);

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const abrir = (cot = null) => {
    setEditando(cot?._id || null);
    setError("");
    if (cot) {
      setForm({
        titulo: cot.titulo, tipo: cot.tipo, descripcion: cot.descripcion || "",
        cliente: cot.cliente?._id || "", clienteNombre: cot.clienteNombre || "",
        ot: cot.ot?._id || "", monto: cot.monto, estado: cot.estado,
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
    if (!body.ot) delete body.ot;
    const url = editando ? `/api/cotizaciones/${editando}` : "/api/cotizaciones";
    const method = editando ? "PUT" : "POST";
    const res = await fetchAuth(url, { method, body: JSON.stringify(body) });
    const data = await res.json();
    if (!res.ok) { setError(data.error); return; }
    setModal(false);
    await cargar();
  };

  const anular = async (cot) => {
    await fetchAuth(`/api/cotizaciones/${cot._id}/anular`, { method: "PATCH" });
    setConfirmAnular(null);
    await cargar();
  };

  const filtradas = cots.filter(c => {
    if (c.anulada) return false;
    if (!busqueda) return true;
    const q = busqueda.toLowerCase();
    return c.codigo?.toLowerCase().includes(q) || c.titulo?.toLowerCase().includes(q) ||
      c.cliente?.razonSocial?.toLowerCase().includes(q);
  });

  return (
    <div className="p-4 max-w-7xl mx-auto">
      {modal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center px-6 py-4 border-b border-gray-100">
              <h2 className="font-bold text-lg text-gray-800">{editando ? "Editar cotización" : "Nueva cotización"}</h2>
              <button onClick={() => setModal(false)} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
            </div>
            <form onSubmit={guardar} className="p-6 space-y-4">
              <div>
                <label className="label">Título *</label>
                <input name="titulo" value={form.titulo} onChange={handleChange} className="input-field" required placeholder="Ej. Fabricación soporte metálico" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Tipo</label>
                  <select name="tipo" value={form.tipo} onChange={handleChange} className="input-field">
                    <option value="servicio">Servicio</option>
                    <option value="venta">Venta</option>
                  </select>
                </div>
                <div>
                  <label className="label">Estado</label>
                  <select name="estado" value={form.estado} onChange={handleChange} className="input-field">
                    {ESTADOS.map(e => <option key={e} value={e}>{e.charAt(0).toUpperCase() + e.slice(1)}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="label">Cliente</label>
                <select name="cliente" value={form.cliente} onChange={handleChange} className="input-field">
                  <option value="">Sin cliente registrado</option>
                  {clientes.map(c => <option key={c._id} value={c._id}>{c.razonSocial}</option>)}
                </select>
              </div>
              {!form.cliente && (
                <div>
                  <label className="label">Nombre de cliente (libre)</label>
                  <input name="clienteNombre" value={form.clienteNombre} onChange={handleChange} className="input-field" placeholder="Empresa o persona" />
                </div>
              )}
              <div>
                <label className="label">OT vinculada</label>
                <select name="ot" value={form.ot} onChange={handleChange} className="input-field">
                  <option value="">Sin OT vinculada</option>
                  {ots.filter(o => o.estado !== "anulado").map(o => (
                    <option key={o._id} value={o._id}>{o.codigo} — {o.empresa?.razonSocial || o.clienteNombre || ""}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Monto cotizado (S/) *</label>
                <input name="monto" type="number" value={form.monto} onChange={handleChange} className="input-field" required min="0" step="0.01" placeholder="0.00" />
              </div>
              <div>
                <label className="label">Descripción / Notas</label>
                <textarea name="descripcion" value={form.descripcion} onChange={handleChange} className="input-field" rows={2} placeholder="Opcional..." />
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
        <h1 className="text-2xl font-bold text-gray-800">Cotizaciones</h1>
        {puedeEditar && <button onClick={() => abrir()} className="btn-primary">+ Nueva cotización</button>}
      </div>

      <div className="flex flex-wrap gap-3 mb-5">
        <input value={busqueda} onChange={e => setBusqueda(e.target.value)} className="input-field max-w-xs" placeholder="Buscar por código, título, cliente..." />
        <select value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)} className="input-field w-40">
          <option value="">Todos los estados</option>
          {ESTADOS.map(e => <option key={e} value={e}>{e.charAt(0).toUpperCase() + e.slice(1)}</option>)}
        </select>
      </div>

      {cargando ? (
        <div className="text-center py-12 text-gray-400">Cargando...</div>
      ) : filtradas.length === 0 ? (
        <div className="text-center py-12 text-gray-400"><p className="text-3xl mb-2">📄</p><p>No hay cotizaciones</p></div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-100 shadow-sm">
          <table className="w-full text-sm bg-white">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-3 font-semibold text-gray-500 text-xs uppercase">Código</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-500 text-xs uppercase">Título</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-500 text-xs uppercase">Tipo</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-500 text-xs uppercase">Cliente</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-500 text-xs uppercase">OT</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-500 text-xs uppercase">Monto</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-500 text-xs uppercase">Estado</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtradas.map(cot => (
                <tr key={cot._id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-bold text-blue-700">{cot.codigo}</td>
                  <td className="px-4 py-3 text-gray-800 max-w-xs">
                    <p className="font-medium truncate">{cot.titulo}</p>
                    {cot.descripcion && <p className="text-xs text-gray-400 truncate">{cot.descripcion}</p>}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${TIPO_BADGE[cot.tipo]}`}>
                      {cot.tipo === "servicio" ? "Servicio" : "Venta"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{cot.cliente?.razonSocial || cot.clienteNombre || "—"}</td>
                  <td className="px-4 py-3">
                    {cot.ot ? (
                      <button onClick={() => navigate(`/ots/${cot.ot._id}`)} className="text-blue-500 hover:text-blue-700 text-xs font-mono">
                        {cot.ot.codigo}
                      </button>
                    ) : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold">S/ {fmt(cot.monto)}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-semibold ${ESTADO_BADGE[cot.estado]}`}>
                      {cot.estado.charAt(0).toUpperCase() + cot.estado.slice(1)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1 justify-end flex-wrap">
                      {puedeEditar && (
                        <button onClick={() => abrir(cot)} className="text-blue-500 hover:text-blue-700 text-xs px-2 py-1 rounded hover:bg-blue-50">
                          Editar
                        </button>
                      )}
                      <button onClick={() => navigate("/ordenes-compra", { state: { cotizacion: cot } })} className="text-green-600 hover:text-green-800 text-xs px-2 py-1 rounded hover:bg-green-50">
                        + OC
                      </button>
                      <button onClick={() => navigate("/facturas", { state: { cotizacion: cot } })} className="text-purple-600 hover:text-purple-800 text-xs px-2 py-1 rounded hover:bg-purple-50">
                        + Factura
                      </button>
                      {puedeEditar && (
                        <button onClick={() => setConfirmAnular(cot)} className="text-red-400 hover:text-red-600 text-xs px-2 py-1 rounded hover:bg-red-50">
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
