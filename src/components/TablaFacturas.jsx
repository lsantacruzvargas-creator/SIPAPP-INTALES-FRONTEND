import { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { fetchAuth, getUsuario } from "../utils/fetchAuth.js";

const ESTADO_PAGO = {
  sin_pago:     "bg-red-100 text-red-700",
  pago_parcial: "bg-yellow-100 text-yellow-700",
  pagado:       "bg-green-100 text-green-700",
};
const LABEL_PAGO = { sin_pago: "Sin pago", pago_parcial: "Pago parcial", pagado: "Pagado" };

function fmt(n) { return Number(n || 0).toLocaleString("es-PE", { minimumFractionDigits: 2 }); }
function fmtFecha(d) { return d ? new Date(d).toLocaleDateString("es-PE") : "—"; }

const VACIO = {
  cotizacion: "", ordenCompra: "", cliente: "",
  numeroFactura: "", fechaEmision: "", fechaVencimiento: "", monto: "",
};

export default function TablaFacturas() {
  const location = useLocation();
  const usuario  = getUsuario();
  const puedeEditar = ["admin", "ejecutivo", "encargado"].includes(usuario?.rol);

  const [facturas, setFacturas] = useState([]);
  const [cots, setCots]         = useState([]);
  const [ocs, setOcs]           = useState([]);
  const [clientes, setClientes] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [modal, setModal]       = useState(false);
  const [modalPago, setModalPago] = useState(null);
  const [montoPagoInput, setMontoPagoInput] = useState("");
  const [form, setForm]         = useState(VACIO);
  const [editando, setEditando] = useState(null);
  const [error, setError]       = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("");
  const [confirmAnular, setConfirmAnular] = useState(null);

  const cargar = async () => {
    setCargando(true);
    const params = new URLSearchParams();
    if (filtroEstado) params.append("estadoPago", filtroEstado);
    const [rFac, rCots, rOcs, rCli] = await Promise.all([
      fetchAuth(`/api/facturas?${params}`).then(r => r.json()),
      fetchAuth("/api/cotizaciones").then(r => r.json()),
      fetchAuth("/api/ordenes-compra").then(r => r.json()),
      fetchAuth("/api/clientes").then(r => r.json()),
    ]);
    setFacturas(Array.isArray(rFac)  ? rFac  : []);
    setCots(Array.isArray(rCots) ? rCots.filter(c => !c.anulada) : []);
    setOcs(Array.isArray(rOcs)   ? rOcs.filter(o => !o.anulada) : []);
    setClientes(Array.isArray(rCli)  ? rCli  : []);
    setCargando(false);
  };

  useEffect(() => { cargar(); }, [filtroEstado]);

  useEffect(() => {
    const cotPresel = location.state?.cotizacion;
    if (cotPresel) {
      setForm({ ...VACIO, cotizacion: cotPresel._id, monto: cotPresel.monto });
      setEditando(null);
      setModal(true);
    }
  }, [location.state]);

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const abrir = (fac = null) => {
    setEditando(fac?._id || null);
    setError("");
    if (fac) {
      setForm({
        cotizacion:       fac.cotizacion?._id || "",
        ordenCompra:      fac.ordenCompra?._id || "",
        cliente:          fac.cliente?._id || "",
        numeroFactura:    fac.numeroFactura,
        fechaEmision:     fac.fechaEmision ? fac.fechaEmision.slice(0, 10) : "",
        fechaVencimiento: fac.fechaVencimiento ? fac.fechaVencimiento.slice(0, 10) : "",
        monto:            fac.monto,
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
    if (!body.ordenCompra) delete body.ordenCompra;
    if (!body.fechaVencimiento) delete body.fechaVencimiento;
    if (!body.fechaEmision) delete body.fechaEmision;
    const url    = editando ? `/api/facturas/${editando}` : "/api/facturas";
    const method = editando ? "PUT" : "POST";
    const res  = await fetchAuth(url, { method, body: JSON.stringify(body) });
    const data = await res.json();
    if (!res.ok) { setError(data.error); return; }
    setModal(false);
    await cargar();
  };

  const registrarPago = async () => {
    if (!modalPago) return;
    await fetchAuth(`/api/facturas/${modalPago._id}/pago`, {
      method: "PATCH",
      body: JSON.stringify({ montoPagado: Number(montoPagoInput) }),
    });
    setModalPago(null);
    await cargar();
  };

  const anular = async (fac) => {
    await fetchAuth(`/api/facturas/${fac._id}/anular`, { method: "PATCH" });
    setConfirmAnular(null);
    await cargar();
  };

  const filtradas = facturas.filter(f => {
    if (f.anulada) return false;
    if (!busqueda) return true;
    const q = busqueda.toLowerCase();
    return f.codigo?.toLowerCase().includes(q) || f.numeroFactura?.toLowerCase().includes(q) ||
      f.cotizacion?.codigo?.toLowerCase().includes(q);
  });

  const ocsParaCot = ocs.filter(o => !form.cotizacion || o.cotizacion?._id === form.cotizacion || o.cotizacion === form.cotizacion);

  return (
    <div className="p-4 max-w-7xl mx-auto">
      {modal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center px-6 py-4 border-b border-gray-100">
              <h2 className="font-bold text-lg text-gray-800">{editando ? "Editar factura" : "Nueva factura"}</h2>
              <button onClick={() => setModal(false)} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
            </div>
            <form onSubmit={guardar} className="p-6 space-y-4">
              <div>
                <label className="label">Cotización vinculada *</label>
                <select name="cotizacion" value={form.cotizacion} onChange={handleChange} className="input-field" required>
                  <option value="">— Seleccionar —</option>
                  {cots.map(c => <option key={c._id} value={c._id}>{c.codigo} — {c.titulo}</option>)}
                </select>
              </div>
              {ocsParaCot.length > 0 && (
                <div>
                  <label className="label">Orden de compra vinculada</label>
                  <select name="ordenCompra" value={form.ordenCompra} onChange={handleChange} className="input-field">
                    <option value="">Sin OC vinculada</option>
                    {ocsParaCot.map(o => <option key={o._id} value={o._id}>{o.codigo} {o.numeroOC ? `· ${o.numeroOC}` : ""}</option>)}
                  </select>
                </div>
              )}
              <div>
                <label className="label">N° de factura *</label>
                <input name="numeroFactura" value={form.numeroFactura} onChange={handleChange} className="input-field" required placeholder="F001-00000123" />
              </div>
              <div>
                <label className="label">Monto (S/) *</label>
                <input name="monto" type="number" value={form.monto} onChange={handleChange} className="input-field" required min="0" step="0.01" placeholder="0.00" />
                {form.cotizacion && form.monto && (
                  <p className="text-xs text-gray-400 mt-1">
                    Detracción 12% (servicios): S/ {fmt(Number(form.monto) * 0.12)} → Total a pagar: S/ {fmt(Number(form.monto) * 0.88)}
                  </p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Fecha emisión</label>
                  <input name="fechaEmision" type="date" value={form.fechaEmision} onChange={handleChange} className="input-field" />
                </div>
                <div>
                  <label className="label">Fecha vencimiento</label>
                  <input name="fechaVencimiento" type="date" value={form.fechaVencimiento} onChange={handleChange} className="input-field" />
                </div>
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

      {modalPago && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full">
            <h3 className="font-bold text-gray-800 mb-1">Registrar pago</h3>
            <p className="text-sm text-gray-500 mb-1">{modalPago.codigo} · {modalPago.numeroFactura}</p>
            <div className="bg-gray-50 rounded-lg p-3 mb-4 text-sm space-y-1">
              <div className="flex justify-between"><span className="text-gray-500">Monto</span><span>S/ {fmt(modalPago.monto)}</span></div>
              {modalPago.detraccion > 0 && <div className="flex justify-between"><span className="text-gray-500">Detracción 12%</span><span className="text-red-500">- S/ {fmt(modalPago.detraccion)}</span></div>}
              <div className="flex justify-between font-semibold"><span>Total a pagar</span><span>S/ {fmt(modalPago.totalAPagar)}</span></div>
            </div>
            <label className="label">Monto pagado hasta ahora (S/)</label>
            <input
              type="number" min="0" step="0.01"
              value={montoPagoInput}
              onChange={e => setMontoPagoInput(e.target.value)}
              className="input-field mb-4"
              placeholder={`Máx. S/ ${fmt(modalPago.totalAPagar)}`}
            />
            <div className="flex gap-3 justify-end">
              <button onClick={() => setModalPago(null)} className="btn-secondary">Cancelar</button>
              <button onClick={registrarPago} className="btn-primary">Guardar pago</button>
            </div>
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
        <h1 className="text-2xl font-bold text-gray-800">Facturas</h1>
        {puedeEditar && <button onClick={() => abrir()} className="btn-primary">+ Nueva factura</button>}
      </div>

      <div className="flex flex-wrap gap-3 mb-5">
        <input value={busqueda} onChange={e => setBusqueda(e.target.value)} className="input-field max-w-xs" placeholder="Buscar por código, N° factura, cotización..." />
        <select value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)} className="input-field w-44">
          <option value="">Todos los estados</option>
          <option value="sin_pago">Sin pago</option>
          <option value="pago_parcial">Pago parcial</option>
          <option value="pagado">Pagado</option>
        </select>
      </div>

      {cargando ? (
        <div className="text-center py-12 text-gray-400">Cargando...</div>
      ) : filtradas.length === 0 ? (
        <div className="text-center py-12 text-gray-400"><p className="text-3xl mb-2">🧾</p><p>No hay facturas</p></div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-100 shadow-sm">
          <table className="w-full text-sm bg-white">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-3 font-semibold text-gray-500 text-xs uppercase">Código</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-500 text-xs uppercase">N° Factura</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-500 text-xs uppercase">Cotización</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-500 text-xs uppercase">OC</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-500 text-xs uppercase">Monto</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-500 text-xs uppercase">Detrac.</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-500 text-xs uppercase">Total a pagar</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-500 text-xs uppercase">Pagado</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-500 text-xs uppercase">Estado pago</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-500 text-xs uppercase">Vencimiento</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtradas.map(f => (
                <tr key={f._id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-bold text-purple-700">{f.codigo}</td>
                  <td className="px-4 py-3 font-mono text-gray-700 text-xs">{f.numeroFactura}</td>
                  <td className="px-4 py-3">
                    <span className="text-blue-600 text-xs font-mono">{f.cotizacion?.codigo || "—"}</span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500 font-mono">{f.ordenCompra?.codigo || "—"}</td>
                  <td className="px-4 py-3 text-right">S/ {fmt(f.monto)}</td>
                  <td className="px-4 py-3 text-right text-red-500 text-xs">{f.detraccion > 0 ? `S/ ${fmt(f.detraccion)}` : "—"}</td>
                  <td className="px-4 py-3 text-right font-semibold">S/ {fmt(f.totalAPagar)}</td>
                  <td className="px-4 py-3 text-right text-green-600">S/ {fmt(f.montoPagado)}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-semibold ${ESTADO_PAGO[f.estadoPago]}`}>
                      {LABEL_PAGO[f.estadoPago]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">{fmtFecha(f.fechaVencimiento)}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1 justify-end flex-wrap">
                      {puedeEditar && f.estadoPago !== "pagado" && (
                        <button
                          onClick={() => { setModalPago(f); setMontoPagoInput(String(f.montoPagado || "")); }}
                          className="text-green-600 hover:text-green-800 text-xs px-2 py-1 rounded hover:bg-green-50"
                        >
                          Pago
                        </button>
                      )}
                      {puedeEditar && (
                        <button onClick={() => abrir(f)} className="text-blue-500 hover:text-blue-700 text-xs px-2 py-1 rounded hover:bg-blue-50">
                          Editar
                        </button>
                      )}
                      {["admin", "ejecutivo"].includes(usuario?.rol) && (
                        <button onClick={() => setConfirmAnular(f)} className="text-red-400 hover:text-red-600 text-xs px-2 py-1 rounded hover:bg-red-50">
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
