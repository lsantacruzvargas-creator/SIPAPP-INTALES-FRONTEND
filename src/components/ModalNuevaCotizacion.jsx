import { useState, useEffect } from "react";
import { fetchAuth, getUsuario } from "../utils/fetchAuth";
import { calcSubtotal, itemInvalido } from "../utils/cotizacionItems";
import TablaItemsCotizacion from "./TablaItemsCotizacion";
import SelectorEmpresas from "./SelectorEmpresas";
import { FlujoNegocio, TarjetaRelacion, money } from "./detalleShared";

const INP = "border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300 w-full transition";

// Formato único de Intales: SUB TOTAL -> IGV (18%) -> TOTAL, sin descuento
// global — mismo criterio en DetalleCotizacion.jsx.
function calcular(sub) {
  const s = Math.round(Number(sub) * 100) / 100 || 0;
  const igv = Math.round(s * 0.18 * 100) / 100;
  return { subtotal: s, igv, total: Math.round((s + igv) * 100) / 100 };
}

const FORM_VACIO = {
  empresa: "", tipo: "venta", atencion: "", rq: "",
  fecha: new Date().toISOString().split("T")[0], fechaRecibida: "",
  encargado: "", planta: "", personaContacto: "", condicionPago: "Factura 30 días",
  lugarEntrega: "",
  numeroGuiaEmision: "", numeroGuiaRemision: "", codigoSap: "", fechaSalida: "",
  subtotal: "", moneda: "PEN",
};

const PASOS_VACIOS = [
  { tipo: "ot", activo: false },
  { tipo: "informe", activo: false },
  { tipo: "oc", activo: false },
  { tipo: "factura", activo: false },
];

// Cotización "en frío": se crea sin partir de ninguna Orden de Trabajo (se
// cotiza antes de inspeccionar el equipo). Reutiliza TablaItemsCotizacion
// para el catálogo de servicios; "Generar OT" queda deshabilitado aquí
// (seleccionables=false) porque la cotización aún no tiene `_id`.
//
// El shell (header degradado + stepper + panel de Relaciones) replica el
// de DetalleCotizacion.jsx a propósito, para que crear y ver/editar una
// cotización se sientan como la misma pantalla — antes esto era un modal
// centrado sin ese diseño.
export default function ModalNuevaCotizacion({ onClose, onCreada }) {
  const [form, setForm] = useState(FORM_VACIO);
  const [items, setItems] = useState([]);
  const [empresas, setEmpresas] = useState([]);
  const [empresasOpen, setEmpresasOpen] = useState(false);
  // Texto libre además del selector (ver SelectorEmpresas.jsx) — si el
  // usuario escribe un nombre que no coincide con ninguna empresa ya
  // registrada, se manda como `empresaNombre` y el backend la crea sola
  // (mismo criterio que ModalNuevaOT.jsx).
  const [busquedaEmpresa, setBusquedaEmpresa] = useState("");
  const [listaEmpresaAbierta, setListaEmpresaAbierta] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [intentoGuardar, setIntentoGuardar] = useState(false);
  const [error, setError] = useState("");
  // Precios: información sensible, solo Admin/Facturación/Jefatura los ven —
  // ni Asistente ni Planner, aunque puedan crear la cotización.
  const puedeVerPrecios = ["admin", "facturacion", "jefatura"].includes(getUsuario()?.rol);

  const cargarEmpresas = () =>
    fetchAuth("/empresas").then(r => r.ok && r.json()).then(d => setEmpresas(d || []));

  useEffect(() => {
    cargarEmpresas();
  }, []);

  const empresaSel = empresas.find(e => e._id === form.empresa);
  const plantasEmpresa = empresaSel?.plantas ?? [];
  const plantaSel = plantasEmpresa.find(p => p.nombre === form.planta);
  const contactosPlanta = plantaSel?.contactos ?? [];
  const contactoSel = contactosPlanta.find(c => c.nombre === form.personaContacto);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm(prev => ({
      ...prev,
      [name]: value,
      ...(name === "empresa" ? { planta: "", personaContacto: "" } : {}),
      ...(name === "planta" ? { personaContacto: "" } : {}),
    }));
  };

  const qEmpresa = busquedaEmpresa.trim().toLowerCase();
  const empresasFiltradas = (qEmpresa
    ? empresas.filter(e => [e.razonSocial, e.alias, e.ruc].some(v => v?.toLowerCase().includes(qEmpresa)))
    : empresas
  ).slice(0, 50);

  const seleccionarEmpresa = (e) => {
    setForm(f => ({ ...f, empresa: e._id, planta: "", personaContacto: "" }));
    setBusquedaEmpresa(e.alias ? `${e.alias} — ${e.razonSocial}` : e.razonSocial);
    setListaEmpresaAbierta(false);
  };

  const cambiarBusquedaEmpresa = (e) => {
    setBusquedaEmpresa(e.target.value);
    setListaEmpresaAbierta(true);
    if (form.empresa) setForm(f => ({ ...f, empresa: "", planta: "", personaContacto: "" }));
  };

  const subtotalItems = parseFloat(items.reduce((acc, i) => acc + calcSubtotal(i), 0).toFixed(2));
  const usarTotalesDeItems = items.length > 0;
  const totalesMostrados = calcular(usarTotalesDeItems ? subtotalItems : form.subtotal);

  const guardar = async () => {
    setIntentoGuardar(true);
    const itemsInvalidos = items.some(itemInvalido);
    if (itemsInvalidos) {
      return setError("Hay ítems con campos obligatorios sin completar (descripción, cantidad o precio). Corrígelos antes de guardar — resaltados en rojo.");
    }
    setError(""); setGuardando(true);

    const payload = {
      tipo: form.tipo,
      condicionPago: form.condicionPago,
      rq: form.rq,
      atencion: form.atencion,
      encargado: form.encargado,
      planta: form.planta,
      personaContacto: form.personaContacto,
      lugarEntrega: form.lugarEntrega,
      moneda: form.moneda,
      subtotal: totalesMostrados.subtotal,
      igv: totalesMostrados.igv,
      total: totalesMostrados.total,
      numeroGuiaEmision: form.numeroGuiaEmision,
      numeroGuiaRemision: form.numeroGuiaRemision,
      codigoSap: form.codigoSap,
      fechaSalida: form.fechaSalida || null,
      items: items.map(i => {
        const it = {
          descripcion: i.descripcion, codigo: i.codigo || "", unidad: i.unidad || "und",
          cantidad: i.cantidad, precio: i.precio, moneda: i.moneda, subtotal: calcSubtotal(i),
        };
        if (i.diasEntrega !== "" && i.diasEntrega != null) it.diasEntrega = i.diasEntrega;
        if (i.subItems?.length > 0) it.subItems = i.subItems.map(s => s.texto).filter(Boolean);
        if (i.imagenes?.length > 0) it.imagenes = i.imagenes;
        return it;
      }),
    };
    if (form.empresa) payload.empresa = form.empresa;
    else if (busquedaEmpresa.trim()) payload.empresaNombre = busquedaEmpresa.trim();
    if (form.fecha) payload.fecha = form.fecha;
    if (form.fechaRecibida) payload.fechaRecibida = form.fechaRecibida;

    const res = await fetchAuth("/cotizaciones", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      const nueva = await res.json();
      onCreada?.(nueva);
    } else {
      setError("Error al crear la cotización.");
      setGuardando(false);
    }
  };

  const pasos = [{ tipo: "cotizacion", activo: true, codigo: "Nueva" }, ...PASOS_VACIOS];

  return (
    <div className="fixed inset-0 z-50 bg-gray-50 flex flex-col">
      {/* Header degradado */}
      <div className="shrink-0 bg-gradient-to-r from-sky-600 to-indigo-700 text-white">
        <div className="max-w-6xl mx-auto px-8 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={onClose}
              className="text-sm text-white/80 hover:text-white transition flex items-center gap-1.5 group shrink-0">
              <span className="group-hover:-translate-x-0.5 transition">←</span> Cotizaciones
            </button>
            <span className="w-px h-8 bg-white/20" />
            <div>
              <p className="text-lg font-bold text-white uppercase tracking-widest leading-none">Cotización</p>
              <h1 className="text-lg font-bold font-mono leading-tight">
                Nueva Cotización
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {puedeVerPrecios && (
              <div className="text-right">
                <p className="text-[10px] text-white/60 uppercase tracking-widest leading-none">Total</p>
                <p className="text-lg font-bold leading-tight">{money(totalesMostrados.total, form.moneda)}</p>
              </div>
            )}
            <button onClick={guardar} disabled={guardando}
              className="bg-white text-sky-700 text-sm px-5 py-2 rounded-lg hover:bg-sky-50 disabled:opacity-60 transition font-semibold shadow-sm shrink-0">
              {guardando ? "Creando…" : "Crear Cotización"}
            </button>
          </div>
        </div>
      </div>

      {/* Stepper de flujo */}
      <div className="shrink-0 bg-white border-b border-gray-100 shadow-sm">
        <div className="max-w-4xl mx-auto px-8 py-5">
          <FlujoNegocio pasos={pasos} />
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto px-8 py-8 grid grid-cols-1 lg:grid-cols-3 gap-8">

          {/* Datos editables */}
          <div className="lg:col-span-2 space-y-6 self-start">

            {/* Datos del cliente + cotización — formato único de Intales,
                ver docs/superpowers/specs/2026-09-10-cotizacion-intales-design.md */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-5">
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-5 rounded-full bg-sky-500" />
                <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide">Datos del cliente</h2>
              </div>

              <div>
                <label className="text-xs text-gray-500 block mb-1">Empresa</label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input
                      type="text"
                      value={busquedaEmpresa}
                      onChange={cambiarBusquedaEmpresa}
                      onFocus={() => setListaEmpresaAbierta(true)}
                      onBlur={() => setListaEmpresaAbierta(false)}
                      placeholder="Escribe el nombre de la empresa…"
                      className={INP}
                      autoComplete="off"
                    />
                    {listaEmpresaAbierta && empresasFiltradas.length > 0 && (
                      <div className="absolute z-10 mt-1 w-full max-h-64 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg">
                        {empresasFiltradas.map(e => (
                          <button type="button" key={e._id}
                            onMouseDown={() => seleccionarEmpresa(e)}
                            className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 transition border-b border-gray-50 last:border-0">
                            {e.alias ? `${e.alias} — ` : ""}{e.razonSocial}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <button type="button" onClick={() => setEmpresasOpen(true)}
                    className="shrink-0 text-xs border border-gray-300 px-3 rounded-lg hover:bg-gray-50 transition">
                    Empresas
                  </button>
                </div>
                {!form.empresa && busquedaEmpresa.trim() && (
                  <p className="text-[11px] text-amber-600 mt-1">Se creará una empresa nueva con este nombre.</p>
                )}
              </div>

              <div>
                <label className="text-xs text-gray-500 block mb-1">Planta</label>
                {plantasEmpresa.length > 0 ? (
                  <select name="planta" value={form.planta} onChange={handleChange} className={INP}>
                    <option value="">— Seleccionar planta —</option>
                    {plantasEmpresa.map((p, i) => <option key={i} value={p.nombre}>{p.nombre}</option>)}
                  </select>
                ) : (
                  <input name="planta" value={form.planta} onChange={handleChange} placeholder="Planta o sede" className={INP} />
                )}
              </div>

              <div>
                <label className="text-xs text-gray-500 block mb-1">Persona de contacto</label>
                <select name="personaContacto" value={form.personaContacto} onChange={handleChange} className={INP}>
                  <option value="">— Sin contacto —</option>
                  {contactosPlanta.map((c) => (
                    <option key={c.nombre} value={c.nombre}>{c.nombre}</option>
                  ))}
                </select>
                {contactoSel && (contactoSel.telefono || contactoSel.correo) && (
                  <p className="text-xs text-gray-400 mt-1">
                    {[contactoSel.telefono, contactoSel.correo].filter(Boolean).join(" · ")}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Atención</label>
                  <input name="atencion" value={form.atencion} onChange={handleChange} placeholder="Ej. Ing. Jorge Torres" className={INP} />
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">RQ</label>
                  <input name="rq" value={form.rq} onChange={handleChange} placeholder="Ej. Proyección 2026" className={INP} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Fecha</label>
                  <input type="date" name="fecha" value={form.fecha} onChange={handleChange} className={INP} />
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Tipo</label>
                  <select name="tipo" value={form.tipo} onChange={handleChange} className={INP}>
                    <option value="venta">Venta</option>
                    <option value="servicio">Servicio</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Moneda</label>
                  <select name="moneda" value={form.moneda} onChange={handleChange} className={INP}>
                    <option value="PEN">Soles (S/)</option>
                    <option value="USD">Dólares (US$)</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Forma de pago</label>
                  <input name="condicionPago" value={form.condicionPago} onChange={handleChange} placeholder="Factura 30 días" className={INP} />
                </div>
              </div>
              <p className="text-xs text-gray-400">
                Tiempo de entrega: <span className="font-medium">Días hábiles</span> — se define por ítem, en la tabla de abajo.
              </p>

              <div hidden>
                <label className="text-xs text-gray-500 block mb-1">Encargado</label>
                <input name="encargado" value={form.encargado} onChange={handleChange} placeholder="Nombre del encargado" className={INP} />
              </div>

              <div hidden>
                <label className="text-xs text-gray-500 block mb-1">Lugar de entrega</label>
                <input name="lugarEntrega" value={form.lugarEntrega} onChange={handleChange} placeholder="Ej. Planta Chilca" className={INP} />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div hidden>
                  <label className="text-xs text-gray-500 block mb-1">Fecha recibida</label>
                  <input type="date" name="fechaRecibida" value={form.fechaRecibida} onChange={handleChange} className={INP} />
                </div>
                <div hidden>
                  <label className="text-xs text-gray-500 block mb-1">N° guía de llegada</label>
                  <input name="numeroGuiaEmision" value={form.numeroGuiaEmision} onChange={handleChange} placeholder="—" className={INP} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div hidden>
                  <label className="text-xs text-gray-500 block mb-1">N° guía de salida</label>
                  <input name="numeroGuiaRemision" value={form.numeroGuiaRemision} onChange={handleChange} placeholder="—" className={INP} />
                </div>
                <div hidden>
                  <label className="text-xs text-gray-500 block mb-1">Fecha de salida</label>
                  <input type="date" name="fechaSalida" value={form.fechaSalida} onChange={handleChange} className={INP} />
                </div>
              </div>

              <div hidden>
                <label className="text-xs text-gray-500 block mb-1">Código SAP</label>
                <input name="codigoSap" value={form.codigoSap} onChange={handleChange} placeholder="—" className={INP} />
              </div>
            </div>

            {/* Cálculos — precios, información sensible: oculto sin privilegio */}
            {puedeVerPrecios && (
            <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-6">
              <div className="rounded-xl bg-gradient-to-br from-gray-50 to-sky-50/40 border border-gray-100 p-4 space-y-4">
                <div>
                  <label className="text-xs text-gray-500 block mb-1">
                    Subtotal sin IGV
                    {usarTotalesDeItems && <span className="text-gray-400 font-normal"> (calculado desde Ítems)</span>}
                  </label>
                  {usarTotalesDeItems ? (
                    <p className={`${INP} text-lg font-semibold bg-gray-50 text-gray-700 border-transparent`}>
                      {totalesMostrados.subtotal.toFixed(2)}
                    </p>
                  ) : (
                    <input type="number" name="subtotal" value={form.subtotal} onChange={handleChange}
                      step="0.01" min="0" placeholder="0.00" className={`${INP} text-lg font-semibold`} />
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="text-center">
                    <p className="text-xs text-gray-400">IGV 18%</p>
                    <p className="font-semibold text-gray-700">{totalesMostrados.igv.toFixed(2)}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-gray-400">Total</p>
                    <p className="font-semibold text-gray-700">{totalesMostrados.total.toFixed(2)}</p>
                  </div>
                </div>
              </div>
            </div>
            )}

            {error && <p className="text-xs text-red-500">{error}</p>}
          </div>

          {/* Relaciones */}
          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-5 rounded-full bg-indigo-500" />
              <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide">Relaciones</h2>
            </div>

            <TarjetaRelacion tipo="cotizacion" codigo="Nueva" actual>
              <p className="text-sm text-gray-600 line-clamp-2">{form.rq || "—"}</p>
            </TarjetaRelacion>
            <TarjetaRelacion tipo="ot" vacio />
            <TarjetaRelacion tipo="informe" vacio />
            <TarjetaRelacion tipo="oc" vacio />
            <TarjetaRelacion tipo="factura" vacio />
          </section>
        </div>

        {/* Ítems — ancho completo, debajo de Datos + Relaciones */}
        <div className="max-w-6xl mx-auto px-8 pb-8">
          <TablaItemsCotizacion
            items={items}
            onItemsChange={setItems}
            tipo={form.tipo}
            puedeEditar
            disabled={false}
            intentoGuardar={intentoGuardar}
            totalesMostrados={totalesMostrados}
            seleccionables={false}
            puedeVerPrecios={puedeVerPrecios}
          />
        </div>
      </div>

      {empresasOpen && (
        <SelectorEmpresas
          empresas={empresas}
          onClose={() => setEmpresasOpen(false)}
          onSeleccionar={(e) => {
            seleccionarEmpresa(e);
            setEmpresasOpen(false);
          }}
          onCambio={async (guardada, { esNueva }) => {
            await cargarEmpresas();
            if (esNueva) {
              setForm(f => ({ ...f, empresa: guardada._id, planta: "", personaContacto: "" }));
              setBusquedaEmpresa(guardada.alias ? `${guardada.alias} — ${guardada.razonSocial}` : guardada.razonSocial);
            }
          }}
        />
      )}
    </div>
  );
}
