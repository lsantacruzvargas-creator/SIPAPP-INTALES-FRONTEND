import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { fetchAuth, getUsuario } from "../utils/fetchAuth";
import { formatearFecha, fechaHoyLima, aInputFecha } from "../utils/fecha";
import { costoEn } from "../utils/costos";
import { estadoComprobanteClase } from "../utils/catalogosSunat";
import ModalDetalleGuia from "./ModalDetalleGuia";
import ModalReporteCosto from "./ModalReporteCosto";
import {
  FlujoNegocio, TarjetaRelacion, Chip,
  badgePago, badgeOT, money, BotonAnular, BotonCerrarCadena, BotonDesanular, BannerAnulado, bloqueadoPorCadenaCerrada,
} from "./detalleShared";
import useBloqueoEdicion from "../hooks/useBloqueoEdicion";
import BarraEdicion from "./BarraEdicion";
import ConfirmacionAccion from "./ConfirmacionAccion";
import { r2, r0 } from "../utils/redondeo";

const leerError = async (r, fallback) => (await r.json().catch(() => null))?.mensaje || fallback;

const codigoDeGuia = (g) => `${g.serie}-${String(g.correlativo).padStart(4, "0")}`;

const INP = "border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 w-full transition";

// `afectoIgv: false` = OC de una cotización de trabajo en el extranjero: sin IGV ni detracción.
function calcular(sub, afectoIgv = true) {
  const s = r2(Number(sub)) || 0;
  const igv = afectoIgv ? r2(s * 0.18) : 0;
  const total = r2(s + igv);
  // R.S. 178-2005/SUNAT: aplica solo si el total (con IGV) es >= S/ 701, y el
  // depósito se hace en números enteros (sin decimales).
  const detraccion = afectoIgv && total >= 701 ? r0(total * 0.12) : 0;
  return { igv, total, detraccion, totalAPagar: r2(total - detraccion) };
}

// El backend (GET /ordenes-compra/:id/anexables) ya filtra: misma empresa, moneda y afectación al
// IGV, sin OC ni factura. Anexar usa el bloqueo de edición de la OC (bloqueo.fetch).
function ModalAnexarCotizaciones({ orden, bloqueo, moneda, verPrecios, onClose, onAnexada }) {
  const [datos, setDatos] = useState(null);
  const [elegidas, setElegidas] = useState([]);
  const [q, setQ] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchAuth(`/ordenes-compra/${orden._id}/anexables`)
      .then(async (r) => (r.ok ? r.json() : { motivo: "No se pudo cargar la lista de cotizaciones.", cotizaciones: [] }))
      .then(setDatos);
  }, [orden._id]);

  const lista = (datos?.cotizaciones || []).filter((c) =>
    !q || [c.numeroCotizacion, c.codigo, c.titulo, ...(c.ots || [])].some((v) => String(v || "").toLowerCase().includes(q.toLowerCase())));
  const alternar = (id) => setElegidas((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const suma = (datos?.cotizaciones || []).filter((c) => elegidas.includes(c._id)).reduce((s, c) => s + c.subtotalOC, 0);

  const anexar = async () => {
    setGuardando(true); setError("");
    const res = await bloqueo.fetch(`/ordenes-compra/${orden._id}/anexar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cotizaciones: elegidas }),
    });
    const data = await res.json().catch(() => ({}));
    setGuardando(false);
    if (!res.ok) return setError(data.mensaje || "No se pudieron anexar las cotizaciones.");
    onAnexada(data);
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[85vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h3 className="font-semibold text-gray-800">Anexar cotizaciones a la OC</h3>
            <p className="text-xs text-gray-400">Cada cotización pasa a la cadena de esta OC y se factura en su propia línea.</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl">✕</button>
        </div>
        <div className="px-6 pt-4">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por N° cotización, título u OT…" className={INP} />
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-3 space-y-1.5">
          {!datos && <p className="text-sm text-gray-400 py-6 text-center">Cargando…</p>}
          {datos?.motivo && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{datos.motivo}</p>}
          {datos && !datos.motivo && lista.length === 0 && (
            <p className="text-sm text-gray-400 py-6 text-center">No hay cotizaciones de esta empresa, en la misma moneda y sin OC.</p>
          )}
          {lista.map((c) => (
            <label key={c._id} className={`flex items-start gap-3 rounded-xl border px-3 py-2.5 cursor-pointer transition ${elegidas.includes(c._id) ? "border-blue-300 bg-blue-50" : "border-gray-100 hover:bg-gray-50"}`}>
              <input type="checkbox" checked={elegidas.includes(c._id)} onChange={() => alternar(c._id)} className="mt-1 w-4 h-4" />
              <div className="flex-1 min-w-0">
                <div className="flex justify-between gap-3">
                  <span className="font-mono text-xs text-blue-600">{c.numeroCotizacion || c.codigo}</span>
                  {verPrecios && <span className="text-xs text-gray-500 shrink-0">{money(c.subtotalOC, moneda)} sin IGV</span>}
                </div>
                <p className="text-sm text-gray-700 truncate">{c.titulo}</p>
                <p className="text-xs text-gray-400">OT: {c.ots.join(", ") || "—"}</p>
              </div>
            </label>
          ))}
        </div>
        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between gap-3">
          <span className="text-xs text-gray-500">
            {elegidas.length} seleccionada{elegidas.length !== 1 ? "s" : ""}{verPrecios && elegidas.length > 0 && ` · ${money(suma, moneda)} sin IGV`}
          </span>
          <div className="flex items-center gap-3">
            {error && <span className="text-xs text-red-500">{error}</span>}
            <button onClick={anexar} disabled={!elegidas.length || guardando}
              className="bg-blue-600 text-white text-sm px-5 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition font-semibold">
              {guardando ? "Anexando…" : "Anexar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function DetalleOrdenCompra({ orden, onClose, onGuardada, facturaVinculada, onNavegar }) {
  const subtotalInicial = orden.subtotal ?? orden.monto ?? 0;

  const [form, setForm] = useState({
    numeroOrden:   orden.numeroOrden   || "",
    numeroFactura: orden.numeroFactura || "",
    empresa:       orden.empresa?._id  || "",
    titulo:        orden.titulo        || "",
    subtotal:      subtotalInicial > 0 ? String(subtotalInicial) : "",
    descripcion:   orden.descripcion   || "",
    encargado:     orden.encargado     || "",
    planta:        orden.planta        || "",
    numeroGuiaEmision:  orden.numeroGuiaEmision  || "",
    numeroGuiaRemision: orden.numeroGuiaRemision || "",
    codigoSap:          orden.codigoSap          || "",
    fechaSalida: orden.fechaSalida
      ? aInputFecha(orden.fechaSalida) : "",
  });
  const calc = calcular(form.subtotal, orden.afectoIgv !== false);
  const [empresas, setEmpresas]   = useState([]);
  const [ots, setOts]             = useState([]);
  const [otCargada, setOtCargada] = useState(false);
  const [crearOTsOpen, setCrearOTsOpen] = useState(false);
  const [informes, setInformes]   = useState([]);
  const [gres, setGres]           = useState([]);
  const [guiaDetalle, setGuiaDetalle] = useState(null);
  const [costos, setCostos] = useState(null);
  // La tarjeta abre en la moneda de la OC; el desglose permite cambiarla y la fecha del TC.
  const [vista, setVista] = useState({ moneda: orden.moneda || "PEN", fecha: fechaHoyLima(), tc: null, error: false });
  const [reporteOpen, setReporteOpen] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError]         = useState("");
  const [cargandoFactura, setCargandoFactura] = useState(false);
  const [cargandoCot, setCargandoCot] = useState(false);
  const [cargandoCrearFactura, setCargandoCrearFactura] = useState(false);
  const navigate = useNavigate();
  const [ordenActual, setOrdenActual] = useState(orden);
  const consolidada = (ordenActual.lineas || []).length > 0;
  const [todasOTs, setTodasOTs] = useState([]);
  const [anexando, setAnexando] = useState(false);
  const [lineaADesanexar, setLineaADesanexar] = useState(null);
  const [desanexando, setDesanexando] = useState(false);
  const [guardandoConfirmacion, setGuardandoConfirmacion] = useState("");
  const rolActual = getUsuario()?.rol;
  const puedeEditar = ["admin", "asistente", "facturacion", "jefatura"].includes(rolActual);
  // Anular un documento queda reservado a Admin y Jefatura — Facturación ya
  // no puede. Desanular y cerrar/abrir la cadena a mano son exclusivos de admin.
  const puedeAnular = ["admin", "jefatura"].includes(rolActual);
  const esAdmin = rolActual === "admin";
  const cadenaCerrada = bloqueadoPorCadenaCerrada(orden.estadoCadena, rolActual);
  const bloqueo = useBloqueoEdicion("ordenCompra", orden._id, orden.updatedAt, { autoEditar: puedeEditar && !orden.anulado && !cadenaCerrada });
  const puedeConfirmarHesActa = ["admin", "asistente", "facturacion", "jefatura"].includes(rolActual);
  // Montos/cálculos exclusivos de admin/jefatura/facturación — mismo criterio
  // que ListaOrdenesCompra.jsx y que precios de Cotización (Fase 16). Antes
  // era una lista de bloqueo (solo excluía asistente/coordinadora) que
  // dejaba pasar a planner y otros roles por error.
  const puedeVerPrecios = ["admin", "facturacion", "jefatura", "coordinadora"].includes(rolActual);
  // Generar factura es libre (ya no exige confirmar HES/Acta antes) — Admin,
  // Facturación y Jefatura pueden (mismo gate en el backend, POST /facturas
  // puedeCrear en routes/facturas.js; Admin sumado a pedido explícito del
  // usuario, 2026-09-04, revierte la exclusión de la Fase 15).
  const puedeCrearFacturaRol = ["admin", "facturacion", "jefatura"].includes(rolActual);
  // Mismo set de roles que ve el card de GRE en DetalleOrdenTrabajo.jsx.
  const puedeGenerarGRE = ["admin", "asistente", "facturacion", "almacenero", "jefatura", "planner", "coordinadora"].includes(rolActual);
  // Card "Costo de fabricación" (OC vs costo real de la OT) — jefatura y
  // vendedor, +admin como excepción (mismo criterio que el resto de acciones
  // restringidas de la app), incluso aunque vendedor no tenga
  // puedeVerPrecios general (acá compara, no edita el subtotal).
  const puedeVerReporte = ["jefatura", "vendedor", "admin"].includes(rolActual);
  // Mismos roles que crean una OT standalone (POST /ordenes-trabajo).
  const puedeCrearOT = ["admin", "asistente", "supervisor", "planner", "jefatura", "coordinadora"].includes(rolActual);
  const puedeCrearOTAqui = puedeCrearOT && !orden.anulado && !cadenaCerrada;
  const exigeHes  = !!ordenActual.empresa?.requiereHes;
  const exigeActa = !!ordenActual.empresa?.requiereActaConformidad;

  const confirmarHesActa = async (campo, valor) => {
    setGuardandoConfirmacion(campo); setError("");
    try {
      const res = await bloqueo.fetch(`/ordenes-compra/${orden._id}/confirmaciones`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [campo]: valor }),
      });
      if (res.ok) {
        // No se usa `onGuardada` acá a propósito: ese callback cierra el modal
        // (ver DetalleDocumento.jsx `cerrarGuardando`), y marcar un checkbox no
        // debería sacar al usuario de la vista — solo se actualiza el estado
        // local; la lista se refresca sola al cerrar (mismo patrón que ya usa
        // el resto del detalle).
        setOrdenActual(await res.json());
      } else {
        setError(await leerError(res, "No se pudo guardar la confirmación."));
      }
    } catch {
      setError("No se pudo guardar la confirmación.");
    } finally {
      setGuardandoConfirmacion("");
    }
  };

  const abrirFactura = async () => {
    if (!facturaVinculada || cargandoFactura) return;
    setCargandoFactura(true);
    const res = await fetchAuth("/facturas");
    const lista = res.ok ? await res.json() : [];
    const full = lista.find(f => f._id === facturaVinculada._id) || facturaVinculada;
    setCargandoFactura(false);
    onNavegar?.({ tipo: "factura", data: full });
  };

  // `orden.cotizacion` viene de un populate() acotado (solo trae codigo,
  // numeroCotizacion, titulo, total, tipo, moneda — ver
  // Backend/src/routes/ordenesCompra.js) — pasarlo tal cual a
  // DetalleCotizacion dejaba el resto de sus ~25 campos (empresa, planta,
  // items, moneda, etc.) en blanco. Mismo fix que `abrirFactura`.
  const abrirCotizacion = async () => {
    if (!cot || cargandoCot) return;
    setCargandoCot(true);
    const res = await fetchAuth("/cotizaciones");
    const lista = res.ok ? await res.json() : [];
    const full = lista.find(c => c._id === cot._id) || cot;
    setCargandoCot(false);
    onNavegar?.({ tipo: "cotizacion", data: full });
  };

  // Emitir Factura desde una OC: lleva a la página completa de Emitir CPE
  // (en vez del pequeño ModalCrearFactura) con emisor/receptor/ítems y
  // precios precargados desde la Cotización vinculada — la OC no tiene
  // ítems propios (ver OrdenCompra.js), solo un monto global.
  const crearFacturaDesdeOC = async () => {
    if (cargandoCrearFactura) return;
    setCargandoCrearFactura(true);
    let cotizacionCompleta = null;
    if (cot) {
      const res = await fetchAuth("/cotizaciones");
      const lista = res.ok ? await res.json() : [];
      cotizacionCompleta = lista.find(c => c._id === cot._id) || null;
    }
    setCargandoCrearFactura(false);
    navigate("/facturacion-electronica/emitir", {
      state: { prellenarDesdeOC: { oc: ordenActual, cotizacion: cotizacionCompleta } },
    });
  };

  // Misma navegación que DetalleOrdenTrabajo.jsx: un ítem por cada OT de la OC.
  const crearGREDesdeOC = () => {
    if (!ots.length) return;
    const empresa = ots[0].empresa;
    navigate("/facturacion-electronica/guias/emitir", {
      state: {
        prellenarGRE: {
          items: ots.map(o => ({ descripcion: o.titulo, cantidad: o.cantidad || 1, unidad: "NIU" })),
          destinatario: empresa
            ? { schemeID: "6", numDoc: empresa.ruc || "", nombre: empresa.razonSocial || "" }
            : undefined,
          ordenesTrabajo: ots.map(o => o._id),
        },
      },
    });
  };

  const juntar = (urls) =>
    Promise.all(urls.map(u => fetchAuth(u).then(r => r.ok ? r.json() : []))).then(ls => ls.flat());

  // Con cotización: las OTs de esa cotización (en una OC consolidada, las de todas sus
  // cotizaciones). OC independiente: las OTs que comparten su numeroDocumento (ver POST
  // /ordenes-compra/:id/generar-ot).
  const cargarOTeInformes = (lineasOC = ordenActual.lineas || []) => {
    const cotId = orden.cotizacion?._id || orden.cotizacion;
    const cotIds = lineasOC.length ? lineasOC.map(l => l.cotizacion?._id || l.cotizacion) : [cotId];
    fetchAuth("/ordenes-trabajo").then(r => r.ok ? r.json() : null).then(todas => {
      setOtCargada(true);
      if (!todas) return;
      setTodasOTs(todas);
      const propias = todas
        .filter(o => !o.ordenPadre && (cotId
          ? cotIds.includes(o.cotizacion?._id || o.cotizacion)
          : orden.numeroDocumento != null && o.numeroDocumento === orden.numeroDocumento))
        .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
      setOts(propias);
      if (!propias.length) return;
      const ids = propias.map(o => o._id);
      juntar(ids.map(id => `/informes?ordenTrabajo=${id}`)).then(infs =>
        setInformes(infs.sort((a, b) => String(a.fechaHoraGuardado).localeCompare(String(b.fechaHoraGuardado)))));
      if (puedeGenerarGRE) {
        fetchAuth(`/guias?ordenesTrabajo=${ids.join(",")}&estado=ACEPTADO&limit=1000`)
          .then(r => r.ok && r.json())
          .then(data => setGres(data?.ok ? data.data : []));
      }
      if (puedeVerReporte) {
        // Costo de fabricación de cada OT (cada una ya agrega sus sub-OTs), sumado.
        Promise.all(ids.map(id => fetchAuth(`/reportes/costos-fabricacion/${id}`).then(r => (r.ok ? r.json() : null))))
          .then(lista => setCostos(sumarCostos(lista.filter(Boolean))));
      }
    });
  };

  useEffect(() => {
    fetchAuth("/empresas?tipo=cliente").then(r => r.ok && r.json()).then(emps => setEmpresas(emps || []));
    cargarOTeInformes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const plantasEmpresa = empresas.find(e => e._id === form.empresa)?.plantas ?? [];

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm(prev => ({
      ...prev,
      [name]: value,
      ...(name === "empresa" ? { planta: "" } : {}),
    }));
  };

  const guardar = async () => {
    setGuardando(true); setError("");
    const payload = {
      numeroOrden:   form.numeroOrden,
      numeroFactura: form.numeroFactura,
      titulo:        form.titulo    || "por definir",
      subtotal:      Number(form.subtotal) || 0,
      igv:           calc.igv,
      total:         calc.total,
      monto:         Number(form.subtotal) || 0,
      descripcion:   form.descripcion,
      encargado:     form.encargado,
      planta:        form.planta,
      numeroGuiaEmision:  form.numeroGuiaEmision,
      numeroGuiaRemision: form.numeroGuiaRemision,
      codigoSap:          form.codigoSap,
      fechaSalida:        form.fechaSalida || null,
    };
    if (form.empresa) payload.empresa = form.empresa;
    // Ocultos en una OC consolidada (propios de cada cotización y su OT): no se reenvían para no
    // pisar los de la cotización de origen; el monto lo fija el backend (suma de líneas).
    if (consolidada) {
      ["titulo", "encargado", "planta", "numeroGuiaEmision", "numeroGuiaRemision", "codigoSap", "fechaSalida",
        "subtotal", "igv", "total", "monto"].forEach((k) => delete payload[k]);
    }

    try {
      const res = await bloqueo.fetch(`/ordenes-compra/${orden._id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) { const actualizada = await res.json(); await bloqueo.terminar(actualizada.updatedAt); onGuardada(actualizada); }
      else { setError(await leerError(res, "Error al guardar los cambios.")); }
    } catch {
      setError("Error al guardar los cambios.");
    } finally {
      setGuardando(false);
    }
  };

  const anular = async (motivo) => {
    const res = await bloqueo.fetch(`/ordenes-compra/${orden._id}/anular`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ motivo }),
    });
    if (res.ok) { onGuardada(await res.json()); }
    else { return leerError(res, "Error al anular el documento."); }
  };

  const desanular = async () => {
    const res = await bloqueo.fetch(`/ordenes-compra/${orden._id}/desanular`, { method: "PATCH" });
    if (res.ok) { onGuardada(await res.json()); }
    else { setError(await leerError(res, "Error al desanular el documento.")); }
  };

  const toggleCerrarCadena = async (cerrado) => {
    const res = await bloqueo.fetch(`/ordenes-compra/${orden._id}/cerrar-cadena`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cerrado }),
    });
    if (res.ok) { onGuardada(await res.json()); }
    else { setError(await leerError(res, "Error al cerrar/abrir la cadena.")); }
  };

  // Con el desglose abierto el TC ya lo pide SelectorMonedaTC: aquí solo con el modal cerrado.
  useEffect(() => {
    if (!puedeVerReporte || reporteOpen || vista.tc || vista.error) return;
    fetchAuth(`/sunat/tipo-cambio?fecha=${vista.fecha}`)
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null)
      .then((d) => setVista((v) => ({ ...v, tc: d?.venta || null, error: !d })));
  }, [puedeVerReporte, reporteOpen, vista.tc, vista.error, vista.fecha]);

  const cot     = orden.cotizacion;
  const factura = facturaVinculada;
  const ultimo  = informes[informes.length - 1];

  // OC consolidada (varias cotizaciones enteras en una OC): ver routes/ordenesCompra.js.
  const cotId = cot?._id || cot;
  const lineas = ordenActual.lineas || [];
  const lineasMostradas = lineas.length ? lineas : (cot ? [{ cotizacion: cot, titulo: cot.titulo, subtotal: ordenActual.subtotal }] : []);
  // Una OC parcial (por ítems) no consolida otras cotizaciones (el backend lo rechaza).
  const puedeAnexar = puedeEditar && !orden.anulado && !cadenaCerrada && !factura && !ordenActual.numeroFactura
    && !ordenActual.desdeItemsCotizacion && !!cot;
  const otsDeCotizacion = (id) => todasOTs
    .filter(o => !o.ordenPadre && (o.cotizacion?._id || o.cotizacion) === id)
    .map(o => o.numeroOT || o.codigo);
  const aplicarOrden = (nueva) => {
    setOrdenActual(nueva);
    setForm(prev => ({ ...prev, subtotal: String(nueva.subtotal ?? 0) }));
    cargarOTeInformes(nueva.lineas || []);
  };
  const confirmarDesanexo = async () => {
    setDesanexando(true);
    const res = await bloqueo.fetch(`/ordenes-compra/${orden._id}/desanexar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cotizacion: lineaADesanexar.cotizacion?._id || lineaADesanexar.cotizacion }),
    });
    const data = await res.json().catch(() => ({}));
    setDesanexando(false);
    setLineaADesanexar(null);
    if (res.ok) aplicarOrden(data);
    else setError(data.mensaje || "No se pudo desanexar la cotización.");
  };

  // Costo de fabricación (spec 2026-09-30): lo calcula el servidor en soles
  // (comprometido + consumido) y se muestra en la moneda elegida al TC de una fecha.
  // Se compara contra ESTA OC (una cotización puede tener más de una).
  const monedaVista = vista.moneda === "USD" && !vista.tc ? "PEN" : vista.moneda;
  const costoVista = costos
    ? costoEn({ ...costos, ocSubtotal: Number(ordenActual.subtotal ?? ordenActual.monto) || 0, ocMoneda: orden.moneda || "PEN" }, monedaVista, vista.tc)
    : null;
  const margen = costoVista?.margen ?? null;
  const margenPct = margen != null && costoVista.ocSubtotal > 0 ? (margen / costoVista.ocSubtotal) * 100 : null;

  const pasos = [
    { tipo: "cotizacion", activo: !!cot,             codigo: cot?.codigo },
    { tipo: "ot",         activo: ots.length > 0,    codigo: ots.length === 1 ? ots[0].codigo : ots.length ? `${ots.length} OTs` : "" },
    { tipo: "informe",    activo: informes.length>0, codigo: ultimo?.codigo || (informes.length ? `${informes.length} av.` : "") },
    { tipo: "oc",         activo: true,              codigo: orden.codigo },
    { tipo: "factura",    activo: !!factura,         codigo: factura?.codigo },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-gray-50 flex flex-col">
      {/* Header degradado */}
      <div className="shrink-0 bg-gradient-to-r from-blue-600 to-indigo-700 text-white">
        <div className="max-w-6xl mx-auto px-8 py-2.5 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button onClick={onClose}
                className="text-sm text-white/80 hover:text-white transition flex items-center gap-1.5 group shrink-0">
                <span className="group-hover:-translate-x-0.5 transition">←</span> Órdenes de Compra
              </button>
              <span className="w-px h-8 bg-white/20" />
              <div>
                <p className="text-lg font-bold text-white uppercase tracking-widest leading-none">Orden de Compra</p>
                <h1 className="text-lg font-bold font-mono leading-tight">
                  {form.numeroOrden || orden.codigo}
                </h1>
                <p className="text-xs font-normal text-white/60 leading-tight">
                  {orden.codigo}{orden.numeroDocumento != null && ` · Doc. N° ${orden.numeroDocumento}`}
                </p>
                {orden.empresa && <p className="text-xs text-white/80 leading-tight">{orden.empresa.razonSocial}</p>}
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right">
                {puedeVerPrecios && (
                  <>
                    <p className="text-[10px] text-white/60 uppercase tracking-widest leading-none">Total a pagar</p>
                    <p className="text-lg font-bold leading-tight">{money(calc.totalAPagar, orden.moneda)}</p>
                  </>
                )}
                {factura?.estadoPago && (
                  <Chip className="mt-0.5 bg-white/20 text-white">{factura.estadoPago}</Chip>
                )}
              </div>
              {!orden.anulado && !cadenaCerrada && puedeAnular && <BotonAnular onAnular={anular} />}
              {esAdmin && orden.anulado && <BotonDesanular onDesanular={desanular} />}
              {esAdmin && <BotonCerrarCadena cerrado={cadenaCerrada} onToggle={toggleCerrarCadena} />}
              {!orden.anulado && !cadenaCerrada && <BarraEdicion bloqueo={bloqueo} />}
              {!orden.anulado && !cadenaCerrada && puedeEditar && (
                <button onClick={guardar} disabled={guardando || !bloqueo.editando}
                  className="bg-white text-blue-700 text-sm px-5 py-2 rounded-lg hover:bg-blue-50 disabled:opacity-60 transition font-semibold shadow-sm shrink-0">
                  {guardando ? "Guardando…" : "Guardar cambios"}
                </button>
              )}
            </div>
        </div>
        {(exigeHes || exigeActa) && (
          <div className="bg-blue-800/40 border-t border-white/10">
            <div className="max-w-6xl mx-auto px-8 py-2.5 flex items-center gap-6">
              <span className="text-xs text-white/70 uppercase tracking-wide font-semibold">Requisitos de facturación</span>
              {exigeHes && (
                <label className="flex items-center gap-2 text-sm text-white cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!ordenActual.hesConfirmado}
                    disabled={!puedeConfirmarHesActa || ordenActual.anulado || guardandoConfirmacion === "hesConfirmado"}
                    onChange={(e) => confirmarHesActa("hesConfirmado", e.target.checked)}
                    className="w-4 h-4"
                  />
                  HES confirmado
                  {ordenActual.hesConfirmadoPor && (
                    <span className="text-xs text-white/50">— {ordenActual.hesConfirmadoPor}</span>
                  )}
                </label>
              )}
              {exigeActa && (
                <label className="flex items-center gap-2 text-sm text-white cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!ordenActual.actaConformidadConfirmada}
                    disabled={!puedeConfirmarHesActa || ordenActual.anulado || guardandoConfirmacion === "actaConformidadConfirmada"}
                    onChange={(e) => confirmarHesActa("actaConformidadConfirmada", e.target.checked)}
                    className="w-4 h-4"
                  />
                  Acta de Conformidad confirmada
                  {ordenActual.actaConformidadConfirmadaPor && (
                    <span className="text-xs text-white/50">— {ordenActual.actaConformidadConfirmadaPor}</span>
                  )}
                </label>
              )}
            </div>
          </div>
        )}
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
          <fieldset disabled={orden.anulado || cadenaCerrada || !puedeEditar || !bloqueo.editando} className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-5 self-start">
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-5 rounded-full bg-blue-500" />
              <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide">Datos de la orden</h2>
            </div>

            {orden.anulado && (
              <BannerAnulado motivo={orden.motivoAnulacion} por={orden.anuladoPor} fecha={orden.fechaAnulacion} />
            )}

            {!orden.anulado && cadenaCerrada && (
              <p className="text-xs text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                La cadena de este documento está cerrada (factura pagada) — de solo lectura. Solo Jefatura puede editarlo.
              </p>
            )}

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

            <div>
              <label className="text-xs text-gray-500 block mb-1">Empresa</label>
              <select name="empresa" value={form.empresa} onChange={handleChange} className={INP}>
                <option value="">— Sin empresa —</option>
                {empresas.map(e => (
                  <option key={e._id} value={e._id}>
                    {e.alias ? `${e.alias} — ` : ""}{e.razonSocial}
                  </option>
                ))}
              </select>
            </div>

            {/* OC consolidada: estos datos son propios de cada cotización y su OT (se editan allí). */}
            {!consolidada && (<>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-gray-500 block mb-1">Encargado</label>
                <input name="encargado" value={form.encargado} onChange={handleChange}
                  placeholder="Nombre del encargado" className={INP} />
              </div>
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
            </div>

            <div>
              <label className="text-xs text-gray-500 block mb-1">Título / Descripción</label>
              <input name="titulo" value={form.titulo} onChange={handleChange}
                placeholder="Descripción del servicio u obra" className={INP} />
            </div>
            </>)}

            <div className="grid grid-cols-2 gap-4" hidden>
              <div>
                <label className="text-xs text-gray-500 block mb-1">N° guía de llegada</label>
                <input name="numeroGuiaEmision" value={form.numeroGuiaEmision} onChange={handleChange}
                  placeholder="—" className={INP} />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">N° guía de salida</label>
                <input name="numeroGuiaRemision" value={form.numeroGuiaRemision} onChange={handleChange}
                  placeholder="—" className={INP} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4" hidden>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Código SAP</label>
                <input name="codigoSap" value={form.codigoSap} onChange={handleChange}
                  placeholder="—" className={INP} />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Fecha de salida</label>
                <input type="date" name="fechaSalida" value={form.fechaSalida} onChange={handleChange} className={INP} />
              </div>
            </div>

            {/* Cálculos — ocultos para Administración y Coordinadora, que no ven/editan montos */}
            {puedeVerPrecios && (
              <div className="rounded-xl bg-gradient-to-br from-gray-50 to-blue-50/40 border border-gray-100 p-4 space-y-4">
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Subtotal sin IGV</label>
                  <input type="number" name="subtotal" value={form.subtotal} onChange={handleChange}
                    disabled
                    step="0.01" min="0" placeholder="0.00" className={`${INP} text-lg font-semibold disabled:bg-gray-50 disabled:text-gray-500`} />
                </div>
                <div className="grid grid-cols-3 gap-3 text-sm">
                  <div className="text-center">
                    <p className="text-xs text-gray-400">{orden.afectoIgv === false ? "IGV (no afecto)" : "IGV 18%"}</p>
                    <p className="font-semibold text-gray-700">{calc.igv.toFixed(2)}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-gray-400">Total</p>
                    <p className="font-semibold text-gray-700">{calc.total.toFixed(2)}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-gray-400">Detracción 12%</p>
                    <p className="font-semibold text-gray-700">{calc.detraccion.toFixed(2)}</p>
                  </div>
                </div>
                <div className="flex items-center justify-between pt-3 border-t border-gray-200">
                  <span className="text-sm font-medium text-gray-600">Total a pagar</span>
                  <span className="text-lg font-bold text-blue-700">{money(calc.totalAPagar, orden.moneda)}</span>
                </div>
              </div>
            )}

            {error && <p className="text-xs text-red-500">{error}</p>}
          </fieldset>

          {/* Relaciones */}
          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-5 rounded-full bg-indigo-500" />
              <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide">Relaciones</h2>
            </div>

            <TarjetaRelacion tipo="cotizacion" codigo={cot?.codigo} numero={cot?.numeroCotizacion} vacio={!cot}
              onClick={cot ? abrirCotizacion : undefined} cargando={cargandoCot}>
              <p className="text-sm text-gray-700 line-clamp-2">{cot?.titulo}</p>
              {puedeVerPrecios && cot?.total > 0 && <p className="text-xs text-gray-500">{money(cot.total, cot.moneda)}</p>}
            </TarjetaRelacion>

            {ots.length === 0 ? (
              <TarjetaRelacion tipo="ot" vacio
                onCrear={otCargada && puedeCrearOTAqui ? () => setCrearOTsOpen(true) : undefined}
                crearLabel="OT" />
            ) : (
              <TarjetaRelacion tipo="ot"
                codigo={ots.length === 1 ? ots[0].codigo : `${ots.length} OTs`}
                numero={ots.length === 1 ? ots[0].numeroOT : undefined}
                onClick={ots.length === 1 ? () => onNavegar?.({ tipo: "ot", data: ots[0] }) : undefined}>
                {ots.length === 1 ? (
                  <>
                    {ots[0].estado && <Chip className={badgeOT(ots[0].estado)}>{ots[0].estado}</Chip>}
                    {ots[0].personalEncargado?.nombre && (
                      <p className="text-xs text-gray-500">Técnico: {ots[0].personalEncargado.nombre}</p>
                    )}
                  </>
                ) : (
                  <div className="space-y-1">
                    {ots.map(o => (
                      <button key={o._id} type="button"
                        onClick={(e) => { e.stopPropagation(); onNavegar?.({ tipo: "ot", data: o }); }}
                        className="w-full flex items-center gap-2 text-left bg-white rounded-lg px-2 py-1 shadow-sm hover:bg-blue-50">
                        <span className="font-mono text-xs font-bold text-blue-700 shrink-0">{o.numeroOT || o.codigo}</span>
                        <span className="text-xs text-gray-600 truncate flex-1">{o.titulo}</span>
                        {o.estado && <Chip className={badgeOT(o.estado)}>{o.estado}</Chip>}
                      </button>
                    ))}
                  </div>
                )}
                {puedeCrearOTAqui && (
                  <button type="button"
                    onClick={(e) => { e.stopPropagation(); setCrearOTsOpen(true); }}
                    className="text-xs text-blue-600 hover:text-blue-800 underline mt-0.5">
                    + Agregar OTs
                  </button>
                )}
              </TarjetaRelacion>
            )}

            {puedeGenerarGRE && ots.length > 0 && (gres.length === 0 ? (
              <TarjetaRelacion tipo="gre" vacio
                onCrear={!orden.anulado ? crearGREDesdeOC : undefined} crearLabel="GRE" />
            ) : (
              <TarjetaRelacion tipo="gre"
                codigo={gres.length === 1 ? codigoDeGuia(gres[0]) : `${gres.length} guías`}
                onClick={gres.length === 1 ? () => setGuiaDetalle(gres[0]) : undefined}>
                {gres.length === 1 ? (
                  <Chip className={estadoComprobanteClase(gres[0].estado)}>{gres[0].estado}</Chip>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {gres.map(g => (
                      <button key={g._id} type="button"
                        onClick={(e) => { e.stopPropagation(); setGuiaDetalle(g); }}
                        className="font-mono text-xs text-purple-700 bg-white rounded-lg px-2 py-0.5 shadow-sm hover:underline">
                        {codigoDeGuia(g)}
                      </button>
                    ))}
                  </div>
                )}
                {!orden.anulado && (
                  <button type="button"
                    onClick={(e) => { e.stopPropagation(); crearGREDesdeOC(); }}
                    className="text-xs text-blue-600 hover:text-blue-800 underline mt-0.5">
                    + Crear otra GRE
                  </button>
                )}
              </TarjetaRelacion>
            ))}

            <TarjetaRelacion
              tipo="informe"
              codigo={informes.length ? `${informes.length} avance${informes.length !== 1 ? "s" : ""}` : null}
              vacio={informes.length === 0}>
              {ultimo?.fechaHoraGuardado && (
                <p className="text-xs text-gray-500">
                  Último: {formatearFecha(ultimo.fechaHoraGuardado)}
                </p>
              )}
              {ultimo?.personalEncargado?.nombre && (
                <p className="text-xs text-gray-500">Técnico: {ultimo.personalEncargado.nombre}</p>
              )}
            </TarjetaRelacion>

            <TarjetaRelacion tipo="oc" codigo={orden.codigo} numero={orden.numeroOrden} actual />

            <TarjetaRelacion tipo="factura" codigo={factura?.codigo} numero={factura?.numeroFactura} vacio={!factura}
              onClick={factura ? abrirFactura : undefined} cargando={cargandoFactura || cargandoCrearFactura}
              onCrear={!factura && !orden.anulado && puedeCrearFacturaRol ? crearFacturaDesdeOC : undefined} crearLabel="Factura">
              {puedeVerPrecios && (factura?.totalAPagar || factura?.total) > 0 && (
                <p className="text-xs text-gray-500">{money(factura.totalAPagar ?? factura.total, orden.moneda)}</p>
              )}
              {factura?.estadoPago && <Chip className={badgePago(factura.estadoPago)}>{factura.estadoPago}</Chip>}
              {factura && !orden.anulado && puedeCrearFacturaRol && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); crearFacturaDesdeOC(); }}
                  className="text-xs text-blue-600 hover:text-blue-800 underline mt-0.5"
                >
                  + Crear otra factura
                </button>
              )}
            </TarjetaRelacion>

            {puedeVerReporte && (
              <div onClick={() => setReporteOpen(true)} role="button"
                className="border border-gray-100 bg-white rounded-2xl p-5 min-h-[112px] cursor-pointer hover:shadow-md transition">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Costo de fabricación</p>
                <p className={`text-xl font-extrabold ${margen == null ? "text-gray-400" : margen >= 0 ? "text-green-600" : "text-red-600"}`}>
                  {margen != null ? money(margen, monedaVista) : "—"}
                </p>
                <p className="text-xs text-gray-400">
                  {!costos ? "Sin OT vinculada para comparar" : margenPct != null ? `${margenPct.toFixed(1)}% de margen` : "Sin tipo de cambio para comparar"}
                </p>
                {costoVista && (
                  <p className="text-xs text-gray-400 mt-0.5">
                    Consumido {money(costoVista.consumido.total, monedaVista)} · Comprometido {money(costoVista.comprometido.total, monedaVista)}
                  </p>
                )}
              </div>
            )}
          </section>
        </div>

        {(lineas.length > 0 || puedeAnexar) && (
          <div className="max-w-6xl mx-auto px-8 pb-8">
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-5 rounded-full bg-sky-500" />
                  <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide">Cotizaciones de esta OC</h2>
                  <span className="text-xs text-gray-400">({lineasMostradas.length})</span>
                </div>
                {puedeAnexar && (
                  <button type="button" onClick={() => setAnexando(true)} disabled={!bloqueo.editando}
                    className="bg-sky-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-sky-700 disabled:opacity-50 transition font-medium">
                    + Anexar cotizaciones
                  </button>
                )}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                    <tr>
                      <th className="px-3 py-3 text-center w-12">Item</th>
                      <th className="px-3 py-3 text-left w-36">N° cotización</th>
                      <th className="px-3 py-3 text-left w-36">N° OT</th>
                      <th className="px-3 py-3 text-left">Título</th>
                      {puedeVerPrecios && <th className="px-3 py-3 text-right w-40">Total sin IGV</th>}
                      {puedeAnexar && lineas.length > 0 && <th className="px-3 py-3 w-10"><span className="sr-only">Desanexar</span></th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {lineasMostradas.map((l, idx) => {
                      const id = l.cotizacion?._id || l.cotizacion;
                      return (
                        <tr key={id} className="align-top">
                          <td className="px-3 py-3 text-center text-gray-400">{idx + 1}</td>
                          <td className="px-3 py-3 font-mono text-sm text-sky-700 whitespace-nowrap">
                            {l.cotizacion?.numeroCotizacion || l.cotizacion?.codigo || "—"}
                            {id === cotId && lineas.length > 0 && (
                              <span className="ml-2 font-sans text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-sky-50 text-sky-700 uppercase">Origen</span>
                            )}
                          </td>
                          <td className="px-3 py-3 font-mono text-sm text-gray-600">{otsDeCotizacion(id).join(", ") || "—"}</td>
                          <td className="px-3 py-3 font-semibold text-gray-800 text-xs uppercase tracking-wide">{l.titulo}</td>
                          {puedeVerPrecios && (
                            <td className="px-3 py-3 text-right font-semibold text-gray-800 tabular-nums whitespace-nowrap">{money(l.subtotal, orden.moneda)}</td>
                          )}
                          {puedeAnexar && lineas.length > 0 && (
                            <td className="px-3 py-3 text-center">
                              {id !== cotId && (
                                <button type="button" title="Desanexar cotización" onClick={() => setLineaADesanexar(l)} disabled={!bloqueo.editando}
                                  className="text-gray-300 hover:text-red-500 disabled:opacity-40 transition">✕</button>
                              )}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                  {puedeVerPrecios && lineas.length > 0 && (
                    <tfoot className="bg-gray-50 border-t border-gray-200">
                      <tr>
                        <td colSpan={4} className="px-3 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Total sin IGV de la OC</td>
                        <td className="px-3 py-3 text-right font-bold text-gray-900 tabular-nums whitespace-nowrap">{money(ordenActual.subtotal, orden.moneda)}</td>
                        {puedeAnexar && <td />}
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
          </div>
        )}
      </div>

      {anexando && (
        <ModalAnexarCotizaciones orden={ordenActual} bloqueo={bloqueo} moneda={orden.moneda} verPrecios={puedeVerPrecios}
          onClose={() => setAnexando(false)}
          onAnexada={(nueva) => { aplicarOrden(nueva); setAnexando(false); }} />
      )}
      {lineaADesanexar && (
        <ConfirmacionAccion
          mensaje={`¿Desanexar la cotización ${lineaADesanexar.cotizacion?.numeroCotizacion || lineaADesanexar.cotizacion?.codigo || ""}? Vuelve a su cadena original (con su OT) y sale del monto de esta OC.`}
          textoConfirmar="Desanexar" procesando={desanexando}
          onCancelar={() => setLineaADesanexar(null)} onConfirmar={confirmarDesanexo} />
      )}

      {crearOTsOpen && (
        <ModalCrearOTs
          orden={orden}
          onClose={() => setCrearOTsOpen(false)}
          onCreadas={() => { setCrearOTsOpen(false); cargarOTeInformes(); }}
        />
      )}

      {guiaDetalle && (
        <ModalDetalleGuia guia={guiaDetalle} onClose={() => setGuiaDetalle(null)} />
      )}

      {reporteOpen && (
        <ModalReporteCosto
          costos={costos}
          orden={orden}
          vista={vista}
          onCambioVista={setVista}
          onClose={() => setReporteOpen(false)}
        />
      )}
    </div>
  );
}

// Suma el costo de fabricación de varias OTs (mapas planos de montos en soles).
function sumarCostos(lista) {
  if (!lista.length) return null;
  if (lista.length === 1) return lista[0];
  const sumarMapa = (clave) => {
    const out = {};
    lista.forEach(c => Object.entries(c[clave] || {}).forEach(([k, v]) => { out[k] = r2((out[k] || 0) + (Number(v) || 0)); }));
    return out;
  };
  return {
    ...lista[0],
    comprometido: sumarMapa("comprometido"),
    consumido: sumarMapa("consumido"),
    costoTotal: r2(lista.reduce((s, c) => s + (Number(c.costoTotal) || 0), 0)),
  };
}

const itemOTVacio = (titulo = "") => ({ _key: Date.now() + Math.random(), titulo, cantidad: "1", diasEntrega: "" });

// Port de comprabasico 485f50c0 + 2dd5cd1b: una OT por ítem (POST /ordenes-compra/:id/generar-ot).
function ModalCrearOTs({ orden, onClose, onCreadas }) {
  const [items, setItems] = useState(() => [itemOTVacio(orden.titulo && orden.titulo !== "por definir" ? orden.titulo : "")]);
  const [creando, setCreando] = useState(false);
  const [error, setError] = useState("");

  const cambiar = (key, campo, valor) =>
    setItems(prev => prev.map(it => (it._key === key ? { ...it, [campo]: valor } : it)));
  const quitar = (key) => setItems(prev => prev.filter(it => it._key !== key));

  const crear = async () => {
    const malo = items.findIndex(it =>
      !it.titulo.trim() || !(Number(it.cantidad) > 0) || !Number.isInteger(Number(it.diasEntrega)) || !(Number(it.diasEntrega) > 0));
    if (!items.length) { setError("Agrega al menos un ítem."); return; }
    if (malo !== -1) { setError(`Ítem ${malo + 1}: completa el título, una cantidad mayor a 0 y los días (entero mayor a 0).`); return; }
    setCreando(true); setError("");
    try {
      const res = await fetchAuth(`/ordenes-compra/${orden._id}/generar-ot`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: items.map(it => ({ titulo: it.titulo.trim(), cantidad: Number(it.cantidad), diasEntrega: Number(it.diasEntrega) })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.mensaje || "No se pudieron crear las OTs."); return; }
      onCreadas(data);
    } catch {
      setError("Error de conexión con el servidor");
    } finally {
      setCreando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        <div className="px-6 py-4 border-b border-gray-100">
          <h3 className="text-base font-bold text-gray-800">Crear Órdenes de Trabajo</h3>
          <p className="text-xs text-gray-500">
            Se crea una OT por ítem, con los datos de la OC {orden.numeroOrden || orden.codigo}
            {orden.numeroDocumento != null && ` (Doc. N° ${orden.numeroDocumento})`}.
          </p>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-2">
          <div className="grid grid-cols-[1fr_6rem_6rem_2rem] gap-2 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
            <span>Título</span><span>Cantidad</span><span>Días</span><span />
          </div>
          {items.map((it, i) => (
            <div key={it._key} className="grid grid-cols-[1fr_6rem_6rem_2rem] gap-2 items-start">
              <textarea value={it.titulo} rows={2} placeholder={`Título de la OT ${i + 1}`}
                onChange={(e) => cambiar(it._key, "titulo", e.target.value)}
                className={`${INP} resize-y`} />
              <input type="number" min="0" step="any" value={it.cantidad}
                onChange={(e) => cambiar(it._key, "cantidad", e.target.value)} className={INP} />
              <input type="number" min="1" step="1" value={it.diasEntrega} placeholder="0"
                onChange={(e) => cambiar(it._key, "diasEntrega", e.target.value)} className={INP} />
              <button type="button" onClick={() => quitar(it._key)} disabled={items.length === 1}
                title="Quitar ítem"
                className="h-9 text-red-500 hover:text-red-700 disabled:text-gray-300 text-lg leading-none">×</button>
            </div>
          ))}
          <button type="button" onClick={() => setItems(prev => [...prev, itemOTVacio()])}
            className="text-xs text-blue-600 hover:text-blue-800 underline">
            + Agregar ítem
          </button>
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-end gap-3">
          {error && <p className="text-xs text-red-500 mr-auto">{error}</p>}
          <button type="button" onClick={onClose} disabled={creando}
            className="text-sm px-4 py-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50">
            Cancelar
          </button>
          <button type="button" onClick={crear} disabled={creando}
            className="text-sm px-5 py-2 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700 disabled:opacity-60">
            {creando ? "Creando…" : `Crear ${items.length} OT${items.length !== 1 ? "s" : ""}`}
          </button>
        </div>
      </div>
    </div>
  );
}
