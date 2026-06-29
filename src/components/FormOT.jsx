import { useState, useEffect } from "react";
import { useNavigate, useLocation, useParams } from "react-router-dom";
import { fetchAuth } from "../utils/fetchAuth.js";

const GARANTIAS = ["No aplica", "15 días", "30 días", "60 días", "90 días"];
const ESTADOS = [
  { value: "cotizado", label: "Cotizado" },
  { value: "en_proceso", label: "En proceso" },
  { value: "entregado", label: "Entregado" },
];

const TIPO_LABEL = { cotizado: "Cotizado", emergencia: "Emergencia", trato_directo: "Trato directo" };
const TIPO_COLOR = {
  cotizado: "text-blue-700",
  emergencia: "text-orange-600",
  trato_directo: "text-green-700",
};

export default function FormOT() {
  const navigate = useNavigate();
  const location = useLocation();
  const { tipo: tipoParam } = useParams();
  const otEditar = location.state?.ot || null;
  const tipo = otEditar?.tipo || tipoParam;

  const [form, setForm] = useState({
    empresa: "",
    clienteNombre: "",
    solicitadoPor: "",
    numeroCotizacion: tipo === "emergencia" ? "Pendiente" : tipo === "trato_directo" ? "No aplica" : "",
    numeroOC: tipo === "cotizado" ? "Pendiente" : "",
    otRelacionada: "",
    fechaInicio: new Date().toISOString().slice(0, 10),
    fechaEntrega: "",
    garantia: "No aplica",
    plazoEntrega: "",
    montoAcordado: "",
    formaPago: "",
    estado: "cotizado",
    ...otEditar,
    empresa: otEditar?.empresa?._id || otEditar?.empresa || "",
    fechaInicio: otEditar?.fechaInicio ? otEditar.fechaInicio.slice(0, 10) : new Date().toISOString().slice(0, 10),
    fechaEntrega: otEditar?.fechaEntrega ? otEditar.fechaEntrega.slice(0, 10) : "",
  });

  const [clientes, setClientes] = useState([]);
  const [items, setItems] = useState(otEditar?.items || [{ descripcion: "", cantidad: 1, cotizacionRef: "", monto: 0 }]);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (tipo !== "trato_directo") {
      fetchAuth("/api/clientes").then(r => r.json()).then(setClientes);
    }
  }, [tipo]);

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleItem = (i, campo, valor) => {
    const arr = [...items];
    arr[i] = { ...arr[i], [campo]: campo === "monto" || campo === "cantidad" ? Number(valor) : valor };
    setItems(arr);
  };

  const addItem = () => setItems([...items, { descripcion: "", cantidad: 1, cotizacionRef: "", monto: 0 }]);
  const removeItem = (i) => setItems(items.filter((_, idx) => idx !== i));

  const totalCotizado = items.reduce((s, it) => s + (Number(it.monto) || 0), 0);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setGuardando(true);
    try {
      const body = { ...form, tipo, items };
      if (!body.empresa) delete body.empresa;
      const url = otEditar ? `/api/ots/${otEditar._id}` : "/api/ots";
      const method = otEditar ? "PUT" : "POST";
      const res = await fetchAuth(url, { method, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) { setError(data.error); return; }
      navigate("/ots");
    } catch {
      setError("Error al guardar");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-4">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate(-1)} className="text-gray-400 hover:text-gray-600 text-xl">&larr;</button>
        <div>
          <h1 className="text-xl font-bold text-gray-800">{otEditar ? `Editar ${otEditar.codigo}` : "Nueva OT"}</h1>
          <span className={`text-sm font-semibold ${TIPO_COLOR[tipo]}`}>{TIPO_LABEL[tipo]}</span>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="card space-y-4">
          <h3 className="font-semibold text-gray-700">Datos generales</h3>

          {tipo !== "trato_directo" ? (
            <div>
              <label className="label">Empresa *</label>
              <select name="empresa" value={form.empresa} onChange={handleChange} className="input-field" required>
                <option value="">Selecciona empresa...</option>
                {clientes.map(c => <option key={c._id} value={c._id}>{c.razonSocial}</option>)}
              </select>
            </div>
          ) : (
            <div>
              <label className="label">Cliente / Referencia</label>
              <input name="clienteNombre" value={form.clienteNombre} onChange={handleChange} className="input-field" placeholder="Nombre o referencia del cliente" />
            </div>
          )}

          <div>
            <label className="label">Solicitado por</label>
            <input name="solicitadoPor" value={form.solicitadoPor} onChange={handleChange} className="input-field" placeholder="Nombre del solicitante" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">
                N° Cotización {tipo === "cotizado" && <span className="text-red-500">*</span>}
              </label>
              <input
                name="numeroCotizacion"
                value={form.numeroCotizacion}
                onChange={tipo === "cotizado" ? handleChange : undefined}
                className="input-field"
                placeholder="COT-0142"
                disabled={tipo !== "cotizado"}
                required={tipo === "cotizado"}
              />
            </div>
            {tipo === "cotizado" && (
              <div>
                <label className="label">N° OC</label>
                <input name="numeroOC" value={form.numeroOC} onChange={handleChange} className="input-field" placeholder="Pendiente / OC-00231" />
              </div>
            )}
          </div>

          {tipo === "emergencia" && (
            <div>
              <label className="label">Plazo de entrega *</label>
              <input name="plazoEntrega" value={form.plazoEntrega} onChange={handleChange} className="input-field" placeholder="Hoy mismo · 4 horas" required />
            </div>
          )}

          {tipo === "trato_directo" && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Monto acordado (S/)</label>
                <input name="montoAcordado" type="number" value={form.montoAcordado} onChange={handleChange} className="input-field" placeholder="250" />
              </div>
              <div>
                <label className="label">Forma de pago</label>
                <input name="formaPago" value={form.formaPago} onChange={handleChange} className="input-field" placeholder="Efectivo, fuera de cuenta..." />
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Fecha inicio</label>
              <input type="date" name="fechaInicio" value={form.fechaInicio} onChange={handleChange} className="input-field" />
            </div>
            <div>
              <label className="label">Fecha entrega</label>
              <input type="date" name="fechaEntrega" value={form.fechaEntrega} onChange={handleChange} className="input-field" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Garantía</label>
              <select name="garantia" value={form.garantia} onChange={handleChange} className="input-field">
                {GARANTIAS.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
            <div>
              <label className="label">OT Relacionada</label>
              <input name="otRelacionada" value={form.otRelacionada} onChange={handleChange} className="input-field" placeholder="OT-0261 (opcional)" />
            </div>
          </div>

          {otEditar && (
            <div>
              <label className="label">Estado</label>
              <select name="estado" value={form.estado} onChange={handleChange} className="input-field">
                {ESTADOS.map(e => <option key={e.value} value={e.value}>{e.label}</option>)}
              </select>
            </div>
          )}
        </div>

        {tipo !== "trato_directo" && (
          <div className="card">
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-semibold text-gray-700">Ítems de la OT</h3>
              <button type="button" onClick={addItem} className="btn-secondary text-xs">+ Agregar ítem</button>
            </div>
            <div className="space-y-3">
              {items.map((item, i) => (
                <div key={i} className="border border-gray-200 rounded-lg p-3 space-y-2">
                  <div className="flex gap-2">
                    <input
                      value={item.descripcion}
                      onChange={e => handleItem(i, "descripcion", e.target.value)}
                      className="input-field flex-1"
                      placeholder="Descripción del trabajo..."
                    />
                    <input
                      type="number"
                      value={item.cantidad}
                      onChange={e => handleItem(i, "cantidad", e.target.value)}
                      className="input-field w-20"
                      placeholder="Cant."
                      min="1"
                    />
                  </div>
                  <div className="flex gap-2">
                    <input
                      value={item.cotizacionRef}
                      onChange={e => handleItem(i, "cotizacionRef", e.target.value)}
                      className="input-field flex-1"
                      placeholder="Cotiz. #1 (opcional)"
                    />
                    <div className="relative w-32">
                      <span className="absolute left-3 top-2 text-gray-400 text-sm">S/</span>
                      <input
                        type="number"
                        value={item.monto}
                        onChange={e => handleItem(i, "monto", e.target.value)}
                        className="input-field pl-8"
                        placeholder="0"
                        min="0"
                      />
                    </div>
                    {items.length > 1 && (
                      <button type="button" onClick={() => removeItem(i)} className="text-red-400 hover:text-red-600 px-2">✕</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3 text-right">
              <span className="text-sm text-gray-500">Total OT: </span>
              <span className="font-bold text-gray-800">S/ {totalCotizado.toLocaleString("es-PE", { minimumFractionDigits: 2 })}</span>
            </div>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-lg">{error}</div>
        )}

        <div className="flex gap-3 justify-end pb-8">
          <button type="button" onClick={() => navigate(-1)} className="btn-secondary">Cancelar</button>
          <button type="submit" disabled={guardando} className="btn-primary">
            {guardando ? "Guardando..." : otEditar ? "Guardar cambios" : "Crear OT"}
          </button>
        </div>
      </form>
    </div>
  );
}
