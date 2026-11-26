import { useState, useEffect } from "react";
import { fetchAuth, getUsuario } from "../utils/fetchAuth";
import { r2, r0 } from "../utils/redondeo";

const leerError = async (r, fallback) => (await r.json().catch(() => null))?.mensaje || fallback;
// Base sin IGV de la cotización (total − igv), no el total con IGV.
const baseSinIgvCotizacion = (cot) => {
  const total = Number(cot.total) || 0;
  const igv = Number(cot.igv) || 0;
  if (cot.afectoIgv === false && total > 0) return total;
  return total > 0 && igv > 0 ? r2(total - igv) : Number(cot.subtotal) || 0;
};

const INP     = "border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 w-full";
const INP_DIS = "border border-gray-100 rounded-lg px-3 py-2 text-sm bg-gray-50 text-gray-500 w-full";

// `afectoIgv: false` = OC de una cotización de trabajo en el extranjero: sin IGV ni detracción.
function calcular(sub, afectoIgv = true) {
  const s = r2(Number(sub)) || 0;
  const igv = afectoIgv ? r2(s * 0.18) : 0;
  const total = r2((s + igv));
  // R.S. 178-2005/SUNAT: aplica solo si el total (con IGV) es >= S/ 701, y el
  // depósito se hace en números enteros (sin decimales).
  const detraccion = afectoIgv && total >= 701 ? r0(total * 0.12) : 0;
  return { igv, total, detraccion, totalAPagar: r2((total - detraccion)) };
}

function BuscadorCotizacion({ onSelect, onClose }) {
  const [lista, setLista] = useState([]);
  const [q, setQ]         = useState("");
  useEffect(() => {
    fetchAuth("/cotizaciones").then(r => r.ok && r.json()).then(d => setLista(d || []));
  }, []);
  const filtradas = lista.filter(c => !q ||
    [c.codigo, c.titulo, c.empresa?.razonSocial]
      .some(v => v?.toLowerCase().includes(q.toLowerCase())));
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[80vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h4 className="font-semibold text-gray-800">Buscar cotización</h4>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl">✕</button>
        </div>
        <div className="px-4 pt-4">
          <input autoFocus value={q} onChange={e => setQ(e.target.value)}
            placeholder="Código, título o empresa…" className={INP} />
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-1">
          {filtradas.length === 0
            ? <p className="text-sm text-gray-400 text-center py-8">Sin resultados</p>
            : filtradas.map(c => (
              <button key={c._id} onClick={() => onSelect(c)}
                className="w-full text-left px-4 py-3 rounded-xl hover:bg-blue-50 border border-transparent hover:border-blue-100 transition">
                <div className="flex justify-between">
                  <span className="font-mono text-xs text-blue-600">{c.codigo}</span>
                  <span className="text-xs text-gray-400">{c.moneda === "USD" ? "US$" : "S/"} {Number(c.total ?? 0).toFixed(2)}</span>
                </div>
                <p className="text-sm text-gray-700 truncate">{c.titulo}</p>
                {c.empresa && <p className="text-xs text-gray-400">{c.empresa.razonSocial}</p>}
              </button>
            ))}
        </div>
      </div>
    </div>
  );
}

export default function ModalCrearOrdenCompra({ onClose, onCreada }) {
  // Administración crea OC sin ver/editar el monto — lo completa después un
  // rol con acceso a precios (mismo criterio que cotizaciones, Fase 16).
  const esAsistente = getUsuario()?.rol === "asistente";
  const [form, setForm] = useState({
    numeroOrden: "", numeroFactura: "",
    empresa: "", titulo: "",
    subtotal: "", descripcion: "",
    planta: "", personaContacto: "",
    moneda: "PEN",
  });
  const [cotVinculada, setCot]   = useState(null);
  const [empresas, setEmpresas]  = useState([]);
  const [busquedaEmpresa, setBusquedaEmpresa] = useState("");
  const [listaEmpresaAbierta, setListaEmpresaAbierta] = useState(false);
  const [buscadorCot, setBCot]   = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError]         = useState("");
  const [exito, setExito]         = useState(null);
  const [avisoDesvinculo, setAvisoDesvinculo] = useState(false);

  useEffect(() => {
    fetchAuth("/empresas?tipo=cliente").then(r => r.ok && r.json()).then(d => setEmpresas(d || []));
  }, []);

  const plantasEmpresa = empresas.find(e => e._id === form.empresa)?.plantas ?? [];
  // Contactos de la planta elegida; sin planta, los de todas las plantas de la empresa.
  const contactosEmpresa = [...new Set(
    (form.planta ? plantasEmpresa.filter(p => p.nombre === form.planta) : plantasEmpresa)
      .flatMap(p => (p.contactos || []).map(c => c.nombre?.trim()).filter(Boolean))
  )];
  // Con cotización vinculada la OC toma su moneda (lo fuerza el pre("save")
  // de OrdenCompra), así que el selector solo decide en la OC independiente.
  const moneda = cotVinculada?.moneda || form.moneda;
  const simbolo = moneda === "USD" ? "US$" : "S/";
  // Igual que la moneda, la OC hereda `afectoIgv` de su cotización (pre("save") de OrdenCompra).
  const afectoIgv = cotVinculada?.afectoIgv !== false;
  const calc = calcular(form.subtotal, afectoIgv);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm(prev => ({
      ...prev,
      [name]: value,
      ...(name === "empresa" ? { planta: "", personaContacto: "" } : {}),
      // Al cambiar de planta, el contacto elegido se limpia si no pertenece a la nueva.
      ...(name === "planta" && value && !(plantasEmpresa.find(p => p.nombre === value)?.contactos || [])
        .some(c => c.nombre?.trim() === prev.personaContacto) ? { personaContacto: "" } : {}),
    }));
  };

  const nombreEmpresa = (e) => (e.alias ? `${e.alias} — ${e.razonSocial}` : e.razonSocial);

  const qEmpresa = busquedaEmpresa.trim().toLowerCase();
  const empresasFiltradas = (qEmpresa
    ? empresas.filter(e => [e.razonSocial, e.alias, e.ruc].some(v => v?.toLowerCase().includes(qEmpresa)))
    : empresas
  ).slice(0, 50);

  const seleccionarEmpresa = (e) => {
    setForm(f => ({ ...f, empresa: e._id, planta: "", personaContacto: "" }));
    setBusquedaEmpresa(nombreEmpresa(e));
    setListaEmpresaAbierta(false);
  };

  const cambiarBusquedaEmpresa = (e) => {
    setBusquedaEmpresa(e.target.value);
    setListaEmpresaAbierta(true);
    if (form.empresa) setForm(f => ({ ...f, empresa: "", planta: "", personaContacto: "" }));
  };

  const seleccionarCot = (cot) => {
    setCot(cot);
    setBCot(false);
    setAvisoDesvinculo(false);
    if (!form.empresa && cot.empresa?._id) setBusquedaEmpresa(nombreEmpresa(cot.empresa));
    setForm(prev => {
      const base = baseSinIgvCotizacion(cot);
      const nuevoSub = prev.subtotal || (base > 0 ? String(base) : prev.subtotal);
      return {
        ...prev,
        titulo:   prev.titulo   || cot.titulo           || "",
        empresa:  prev.empresa  || cot.empresa?._id     || "",
        planta:   prev.planta   || cot.planta           || "",
        personaContacto: prev.personaContacto || cot.personaContacto || "",
        subtotal: nuevoSub,
        // Se copia para que al desvincular la OC no vuelva a S/ con un monto que estaba en US$.
        moneda:   cot.moneda || prev.moneda,
      };
    });
  };

  const desvincularCot = () => {
    setCot(null);
    setAvisoDesvinculo(true);
  };

  const guardar = async () => {
    // Administración no ve/edita el monto — su OC se crea en 0 y un rol con
    // acceso a precios lo completa después (mismo criterio que cotizaciones).
    if (!esAsistente && (!form.subtotal || Number(form.subtotal) <= 0)) {
      return setError("El subtotal debe ser mayor a 0.");
    }
    setError(""); setGuardando(true);

    const payload = {
      titulo:        form.titulo       || "por definir",
      numeroOrden:   form.numeroOrden,
      numeroFactura: form.numeroFactura,
      subtotal:      Number(form.subtotal),
      igv:           calc.igv,
      total:         calc.total,
      monto:         Number(form.subtotal),
      descripcion:   form.descripcion,
      planta:        form.planta,
      personaContacto: form.personaContacto,
      moneda,
      cotizacion:    cotVinculada?._id,
    };
    if (form.empresa)       payload.empresa    = form.empresa;
    if (!payload.cotizacion) delete payload.cotizacion;

    try {
      const res = await fetchAuth("/ordenes-compra", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const data = await res.json();
        setExito(data.codigo);
        setTimeout(() => onCreada(data), 1800);
      } else {
        setError(await leerError(res, "No se pudo crear la orden de compra."));
      }
    } catch {
      setError("No se pudo crear la orden de compra.");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <>
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl flex flex-col max-h-[90vh]">

        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <h3 className="font-semibold text-gray-800">Nueva Orden de Compra</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">

          {/* Cotización vinculada (opcional) */}
          <div className="border border-dashed border-gray-200 rounded-xl p-3">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Cotización (opcional)</p>
            {cotVinculada ? (
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-mono text-xs text-blue-600">{cotVinculada.codigo}</p>
                  <p className="text-xs text-gray-500 truncate">{cotVinculada.titulo}</p>
                  {cotVinculada.empresa && (
                    <p className="text-xs text-gray-400">{cotVinculada.empresa.razonSocial}</p>
                  )}
                </div>
                <button onClick={desvincularCot} title="Quitar cotización" className="text-gray-300 hover:text-red-400 text-lg leading-none">✕</button>
              </div>
            ) : (
              <button onClick={() => setBCot(true)}
                className="text-xs text-blue-600 hover:text-blue-800 underline">
                + Vincular cotización existente
              </button>
            )}
          </div>

          {/* Identificación */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-gray-500 block mb-1">N° de orden</label>
              <input name="numeroOrden" value={form.numeroOrden} onChange={handleChange}
                placeholder="Ej. OC-2024-001" className={INP} />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">N° de factura</label>
              <input name="numeroFactura" value={form.numeroFactura} onChange={handleChange}
                placeholder="Ej. F001-00123" className={INP} />
            </div>
          </div>

          {/* Empresa */}
          <div>
            <label className="text-xs text-gray-500 block mb-1">Empresa</label>
            <div className="relative">
              <input
                type="text"
                value={busquedaEmpresa}
                onChange={cambiarBusquedaEmpresa}
                onFocus={() => setListaEmpresaAbierta(true)}
                onBlur={() => setListaEmpresaAbierta(false)}
                placeholder="Escribe el nombre, alias o RUC…"
                className={INP}
                autoComplete="off"
              />
              {listaEmpresaAbierta && empresasFiltradas.length > 0 && (
                <div className="absolute z-10 mt-1 w-full max-h-64 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg">
                  {empresasFiltradas.map(e => (
                    <button type="button" key={e._id}
                      onMouseDown={() => seleccionarEmpresa(e)}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 transition border-b border-gray-50 last:border-0">
                      {nombreEmpresa(e)}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {!form.empresa && busquedaEmpresa.trim() && (
              <p className="text-[11px] text-amber-600 mt-1">Elige una empresa de la lista; si no, la OC se crea sin empresa.</p>
            )}
          </div>

          {/* Planta y contacto: listas de la empresa elegida; texto libre si no tiene. */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-gray-500 block mb-1">Planta</label>
              {plantasEmpresa.length > 0 ? (
                <select name="planta" value={form.planta} onChange={handleChange} className={INP}>
                  <option value="">— Seleccionar planta —</option>
                  {plantasEmpresa.map((p, i) => (
                    <option key={i} value={p.nombre}>{p.nombre}</option>
                  ))}
                </select>
              ) : (
                <input name="planta" value={form.planta} onChange={handleChange}
                  placeholder="Planta o sede" className={INP} />
              )}
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Persona de contacto</label>
              {contactosEmpresa.length > 0 ? (
                <select name="personaContacto" value={form.personaContacto} onChange={handleChange} className={INP}>
                  <option value="">— Sin contacto —</option>
                  {contactosEmpresa.map((nombre) => (
                    <option key={nombre} value={nombre}>{nombre}</option>
                  ))}
                </select>
              ) : (
                <input name="personaContacto" value={form.personaContacto} onChange={handleChange}
                  placeholder="Nombre del contacto" className={INP} />
              )}
            </div>
          </div>

          <div>
            <label className="text-xs text-gray-500 block mb-1">Título de la orden</label>
            <textarea name="titulo" value={form.titulo} onChange={handleChange} rows={2}
              placeholder="Descripción del servicio u obra" className={`${INP} resize-y`} />
          </div>

          <div>
            <label className="text-xs text-gray-500 block mb-1">Moneda</label>
            <select name="moneda" value={moneda} onChange={handleChange} disabled={!!cotVinculada}
              className={cotVinculada ? INP_DIS : INP}>
              <option value="PEN">Soles (S/)</option>
              <option value="USD">Dólares (US$)</option>
            </select>
            {cotVinculada && <p className="text-xs text-gray-400 mt-1">Se toma de la cotización vinculada.</p>}
            {avisoDesvinculo && (
              <p className="text-xs text-amber-600 mt-1">
                Se quitó la cotización: revisa moneda y monto (la OC sin cotización siempre lleva IGV).
              </p>
            )}
          </div>

          {/* Cálculos — ocultos para Administración, que no ve/edita montos */}
          {!esAsistente && (
            <div className="bg-gray-50 rounded-xl p-4 grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="text-xs text-gray-500 block mb-1">
                  Subtotal sin IGV ({simbolo}) *
                </label>
                <input type="number" name="subtotal" value={form.subtotal} onChange={handleChange}
                  disabled={esAsistente} step="0.01" min="0" placeholder="0.00" className={INP} />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">{afectoIgv ? "IGV 18%" : "IGV (no afecto)"}</label>
                <input value={calc.igv.toFixed(2)} disabled className={INP_DIS} />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Total</label>
                <input value={calc.total.toFixed(2)} disabled className={INP_DIS} />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Detracción (12%)</label>
                <input value={calc.detraccion.toFixed(2)} disabled className={INP_DIS} />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Total a pagar</label>
                <input value={calc.totalAPagar.toFixed(2)} disabled className={`${INP_DIS} font-semibold`} />
              </div>
            </div>
          )}

          {exito && (
            <div className="bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg px-4 py-3">
              Orden <strong>{exito}</strong> creada exitosamente.
            </div>
          )}
          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex gap-3 justify-end shrink-0">
          <button onClick={onClose} disabled={guardando || !!exito}
            className="text-sm border border-gray-300 px-4 py-2 rounded-lg hover:bg-gray-50 transition disabled:opacity-50">
            Cancelar
          </button>
          <button onClick={guardar} disabled={guardando || !!exito}
            className="text-sm bg-blue-700 text-white px-5 py-2 rounded-lg hover:bg-blue-800 disabled:opacity-50 transition font-medium">
            {guardando ? "Creando…" : "Crear Orden de Compra"}
          </button>
        </div>
      </div>
    </div>

    {buscadorCot && <BuscadorCotizacion onSelect={seleccionarCot} onClose={() => setBCot(false)} />}
    </>
  );
}
