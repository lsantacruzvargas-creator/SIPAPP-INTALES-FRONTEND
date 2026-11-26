import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { fetchAuth, getUsuario } from "../utils/fetchAuth";
import { formatearFecha, aInputFecha } from "../utils/fecha";
import { exportarCotizacionPdf } from "../utils/cotizacionPdf";
import {
  calcSubtotal, itemDesdeDb, itemInvalido, idDe, vinculosItem, indicesLibresOC, partidasTomadas, partidaRecibida, infoPartidaItem,
} from "../utils/cotizacionItems";
import { estadoComprobanteClase } from "../utils/catalogosSunat";
import { ocsDeCotizacion, facturasDeCotizacion } from "../utils/facturacionOC";
import ModalNuevaOT from "./ModalNuevaOT";
import ModalGenerarOC from "./ModalOrdenCompra";
import ModalDetalleGuia from "./ModalDetalleGuia";
import BuscadorOrdenTrabajo from "./BuscadorOrdenTrabajo";
import SelectorEmpresas from "./SelectorEmpresas";
import SelectFormaPago from "./SelectFormaPago";
import ConfirmacionAccion from "./ConfirmacionAccion";
import TablaItemsCotizacion from "./TablaItemsCotizacion";
import TarjetaArchivosRelacionados from "./TarjetaArchivosRelacionados";
import {
  FlujoNegocio, TarjetaRelacion, Chip, PartidaOC,
  badgePago, badgeOT, money, BotonAnular, BotonDesanular, BannerAnulado,
} from "./detalleShared";
import { bloqueadoPorPago, fusionarBloqueo } from "../utils/bloqueoPago";
import useBloqueoEdicion from "../hooks/useBloqueoEdicion";
import BarraEdicion from "./BarraEdicion";
import { conBloqueo } from "../utils/bloqueoApi";
import { errorDelFormulario } from "../utils/bloqueo";
import { veFacturas, rolDeSesion } from "../utils/roles";
import { r2 } from "../utils/redondeo";
import { costoCompraSoles } from "../utils/montoCompra";

const totalServicio = (s) => (Number(s.costo) || 0) * (Number(s.cantidad) || 0) + (Number(s.costoTransporte) || 0);
const servicioEnSoles = (s) => costoCompraSoles({
  unitario: s.costo, cantidad: s.cantidad, flete: s.costoTransporte, moneda: s.moneda, tipoCambio: s.tipoCambio,
});

const INP = "border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300 w-full transition";
const codigoDeGuia = (g) => `${g.serie}-${String(g.correlativo).padStart(4, "0")}`;

// Formato Intales: SUBTOTAL -> IGV (18%) -> TOTAL. El descuento global (%)
// se agregó de vuelta a pedido del usuario (2026-09-11), aplicado sobre el
// precio unitario de cada ítem (ver cotizacionItems.js) — cuando hay ítems,
// `sub` ya llega neto (cada línea aplica el % individualmente) y `pct` no se
// vuelve a aplicar acá (se llama con 0) para no descontar dos veces; el
// único caso que sí aplica `pct` acá es el subtotal tipeado a mano (sin
// ítems), donde `sub` es bruto.
function calcular(sub, descuentoPct = 0, afectoIgv = true) {
  const s = r2(Number(sub)) || 0;
  const pct = Math.min(100, Math.max(0, Number(descuentoPct) || 0));
  const descuento = r2(s * (pct / 100));
  const subtotalConDescuento = r2(s - descuento);
  const igv = afectoIgv ? r2(subtotalConDescuento * 0.18) : 0;
  return {
    subtotal: s,
    descuentoPorcentaje: pct,
    descuento,
    subtotalConDescuento,
    afectoIgv,
    igv,
    total: r2(subtotalConDescuento + igv),
  };
}

export default function DetalleCotizacion({ cotizacion: inicial, onClose, onGuardada, onNavegar }) {
  const navigate = useNavigate();
  const [cot, setCot] = useState(inicial);
  const subtotalInicial = inicial.subtotal ?? 0;
  const [form, setForm] = useState({
    subtotal: subtotalInicial > 0 ? String(subtotalInicial) : "",
    descuentoGlobal: inicial.descuentoGlobal ? String(inicial.descuentoGlobal) : "",
    afectoIgv: inicial.afectoIgv !== false,
    numeroCotizacion: inicial.numeroCotizacion || inicial.codigo || "",
    empresa: inicial.empresa?._id || "",
    tipo: inicial.tipo || "venta",
    moneda: inicial.moneda || "PEN",
    condicionPago: inicial.condicionPago || "Factura a 30 días",
    validezOferta: inicial.validezOferta || "7",
    tipoDiasEntrega: inicial.tipoDiasEntrega || "habiles",
    lugarEntrega: inicial.lugarEntrega || "",
    fecha: inicial.fecha ? aInputFecha(inicial.fecha) : "",
    fechaRecibida: inicial.fechaRecibida ? aInputFecha(inicial.fechaRecibida) : "",
    titulo: inicial.titulo || "",
    rq: inicial.rq || "",
    atencion: inicial.atencion || "",
    encargado: inicial.encargado || "",
    planta: inicial.planta || "",
    personaContacto: inicial.personaContacto || "",
    numeroGuiaEmision: inicial.numeroGuiaEmision || "",
    numeroGuiaRemision: inicial.numeroGuiaRemision || "",
    codigoSap: inicial.codigoSap || "",
    fechaSalida: inicial.fechaSalida ? aInputFecha(inicial.fechaSalida) : "",
  });
  const [items, setItems] = useState(() => (inicial.items || []).map(itemDesdeDb));
  const [intentoGuardar, setIntentoGuardar] = useState(false);
  const [empresas, setEmpresas] = useState([]);
  const [empresasOpen, setEmpresasOpen] = useState(false);
  // Texto libre además del selector (ver SelectorEmpresas.jsx) — si el
  // usuario escribe un nombre que no coincide con ninguna empresa ya
  // registrada, se manda como `empresaNombre` y el backend la crea sola
  // (mismo criterio que ModalNuevaOT.jsx).
  const [busquedaEmpresa, setBusquedaEmpresa] = useState(() =>
    inicial.empresa ? (inicial.empresa.alias ? `${inicial.empresa.alias} — ${inicial.empresa.razonSocial}` : inicial.empresa.razonSocial) : ""
  );
  const [listaEmpresaAbierta, setListaEmpresaAbierta] = useState(false);
  const [ots, setOts] = useState([]);
  const [informes, setInformes] = useState([]);
  const [gres, setGres] = useState([]);
  const [guiaDetalle, setGuiaDetalle] = useState(null);
  const [ocs, setOcs] = useState([]);
  const [facturas, setFacturas] = useState([]);
  const oc = ocs[0] || null;
  const factura = facturas[0] || null;
  const [servicios, setServicios] = useState([]);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [crearOTOpen, setCrearOTOpen] = useState(false);
  const [buscadorOTOpen, setBuscadorOTOpen] = useState(false);
  const [confirmandoReasignarOT, setConfirmandoReasignarOT] = useState(null);
  const [reasignandoOT, setReasignandoOT] = useState(false);
  const [seleccionados, setSeleccionados] = useState(() => new Set());
  const [generandoOT, setGenerandoOT] = useState(false);
  const [seleccionadosOC, setSeleccionadosOC] = useState(() => new Set());
  const [indicesNuevaOC, setIndicesNuevaOC] = useState(null);
  const [preparandoOC, setPreparandoOC] = useState(false);
  const rolActual = getUsuario()?.rol;
  const puedeEditar = ["admin", "asistente", "facturacion", "jefatura", "coordinadora", "planner"].includes(rolActual);
  // Anular un documento queda reservado a Admin y Jefatura — Facturación ya
  // no puede. Desanular es exclusivo de admin.
  const puedeAnular = ["admin", "jefatura", "coordinadora"].includes(rolActual);
  const esAdmin = rolActual === "admin";
  // Precios: información sensible, solo Admin/Facturación/Jefatura los ven —
  // ni Asistente ni Planner, aunque puedan editar/ver el resto de la cotización.
  const puedeVerPrecios = ["admin", "facturacion", "jefatura", "coordinadora"].includes(rolActual);
  // Card de Servicios Externos — visible solo para este set de roles, a
  // pedido explícito del usuario.
  const puedeVerServicios = ["admin", "jefatura", "coordinadora", "planner", "asistente"].includes(rolActual);
  // Generar OT desde un ítem es un set más amplio que `puedeEditar`: incluye
  // además a Planner (Coordinadora ya está en `puedeEditar`).
  const puedeGenerarOT = ["admin", "asistente", "facturacion", "jefatura", "planner", "coordinadora"].includes(rolActual);
  // Mismo set de roles que ve el card de GRE en DetalleOrdenTrabajo.jsx.
  const puedeGenerarGRE = ["admin", "asistente", "facturacion", "almacenero", "jefatura", "planner", "coordinadora"].includes(rolActual);
  const bloqueada = bloqueadoPorPago(cot, rolActual);
  const bloqueo = useBloqueoEdicion("cotizacion", cot._id, cot.updatedAt, { autoEditar: puedeEditar && !cot.anulado && !bloqueada });
  // OC por ítems: mismos roles que crean OC (puedeEditar de Backend/src/routes/ordenesCompra.js). Solo
  // con la cotización tomada para edición: generar marca vínculos en sus ítems y el formulario de otro
  // que la tuviera abierta ya no podría guardarse (400 por vínculos).
  const puedeGenerarOC = ["admin", "asistente", "facturacion", "jefatura", "coordinadora"].includes(rolActual)
    && !cot.anulado && !bloqueada && bloqueo.editando;
  // Lo facturado o en emisión no cambia para nadie, Jefatura incluida (backend: errorEdicionFacturada).
  const tomadas = partidasTomadas(cot);
  const esTomado = (item) => !!item.partidaOC && tomadas.has(idDe(item.partidaOC));
  const cabeceraFija = (cot.bloqueo?.indicesFacturados || []).length > 0 || !!cot.bloqueo?.facturada || !!cot.bloqueo?.reservada;
  // Con una partida en una OC vigente la empresa, la moneda y el IGV ya son los de esa OC (FP-22).
  const empresaMonedaFijas = cabeceraFija || !!cot.bloqueo?.enOC;
  // Sin ítems, la partida cubre la cotización entera: agregar uno cambiaría su monto.
  const sinAgregarItems = cabeceraFija && (cot.items || []).length === 0;

  const cargarRelaciones = () => {
    Promise.all([
      fetchAuth("/ordenes-trabajo").then(r => r.ok ? r.json() : []),
      fetchAuth("/ordenes-compra").then(r => r.ok ? r.json() : []),
      (veFacturas(rolDeSesion()) ? fetchAuth("/facturas").then((r) => r.ok ? r.json() : []) : Promise.resolve([])),
    ]).then(([otsData, ocs, facts]) => {
      const otsFound = otsData.filter(o => (o.cotizacion?._id || o.cotizacion) === cot._id);
      setOts(otsFound);
      if (puedeGenerarGRE && otsFound.length > 0) {
        const ids = otsFound.map(o => o._id);
        fetchAuth(`/guias?ordenesTrabajo=${ids.join(",")}&estado=ACEPTADO&limit=1000`)
          .then(r => r.ok && r.json())
          .then(data => setGres(data?.ok ? data.data : []));
      } else {
        setGres([]);
      }
      // En orden de creación; las anuladas se listan con su chip.
      const ocsFound = ocsDeCotizacion(ocs, cot._id).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
      setOcs(ocsFound);
      setFacturas(facturasDeCotizacion(facts, ocsFound, cot));
      if (otsFound.length > 0) {
        Promise.all(
          otsFound.map(o => fetchAuth(`/informes?ordenTrabajo=${o._id}`).then(r => r.ok ? r.json() : []))
        ).then(listas => setInformes(listas.flat()));
      } else {
        setInformes([]);
      }
      // Solo las OT padre (no sub-OTs, que ya heredan `cotizacion` del padre
      // — ver POST /:id/sub-ot) — `?ordenTrabajoPadre=` en el backend ya
      // agrega los servicios de sí misma + todas sus sub-OTs, así que pedirlo
      // también por cada sub-OT duplicaría filas.
      const otsPadre = otsFound.filter(o => !o.ordenPadre);
      if (puedeVerServicios && otsPadre.length > 0) {
        Promise.all(
          otsPadre.map(o => fetchAuth(`/servicios-externos?ordenTrabajoPadre=${o._id}`).then(r => r.ok ? r.json() : []))
        ).then(listas => setServicios(listas.flat()));
      } else {
        setServicios([]);
      }
    });
  };

  const cargarEmpresas = () =>
    fetchAuth("/empresas?tipo=cliente").then(r => r.ok && r.json()).then(emps => setEmpresas(emps || []));

  useEffect(() => {
    cargarEmpresas();
    cargarRelaciones();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cot._id]);

  const empresaSel = empresas.find(e => e._id === form.empresa);
  const plantasEmpresa = empresaSel?.plantas ?? [];
  const plantaSel = plantasEmpresa.find(p => p.nombre === form.planta);
  const contactosPlanta = plantaSel?.contactos ?? [];
  const contactoSel = contactosPlanta.find(c => c.nombre === form.personaContacto);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm(prev => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
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

  // Vincula una OT elegida desde BuscadorOrdenTrabajo a esta cotización — si
  // esa OT ya pertenecía a otra cotización, el llamador confirma antes
  // (ver ConfirmacionAccion más abajo) que quiere reasignarla.
  const vincularOT = async (orden) => {
    setReasignandoOT(true);
    const res = await conBloqueo("ordenTrabajo", orden._id, (h) => fetchAuth(`/ordenes-trabajo/${orden._id}/vincular-cotizacion`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...h },
      body: JSON.stringify({ cotizacion: cot._id }),
    }));
    setReasignandoOT(false);
    if (!res.ok) setError((await res.json().catch(() => ({}))).mensaje || "No se pudo vincular la OT.");
    setConfirmandoReasignarOT(null);
    if (res.ok) {
      setBuscadorOTOpen(false);
      cargarRelaciones();
    }
  };

  // Solo tiene sentido cuando hay una sola OT vinculada a la cotización — con
  // más de una sería ambiguo a cuál atar la GRE desde este nivel (para ese
  // caso, crearla desde el detalle de la OT puntual).
  const crearGREDesdeCot = () => {
    const unicaOT = ots.length === 1 ? ots[0] : null;
    if (!unicaOT) return;
    navigate("/facturacion-electronica/guias/emitir", {
      state: {
        prellenarGRE: {
          items: [{ descripcion: unicaOT.titulo, cantidad: 1, unidad: "NIU" }],
          destinatario: unicaOT.empresa
            ? { schemeID: "6", numDoc: unicaOT.empresa.ruc || "", nombre: unicaOT.empresa.razonSocial || "" }
            : undefined,
          ordenesTrabajo: [unicaOT._id],
        },
      },
    });
  };

  // La factura de cada OC va por su enlace directo (`ordenCompra`); con una
  // sola OC se acepta además la de la cadena (facturas antiguas sin enlace).
  const facturaDeOC = (o) =>
    facturas.find(f => idDe(f.ordenCompra) === o?._id) ||
    (ocs.length === 1 ? facturas.find(f => !f.ordenCompra) : null) ||
    null;

  const abrirOC = (o) => {
    const full = ocs.find(x => x._id === o._id) || o;
    onNavegar?.({ tipo: "oc", data: full, extra: facturaDeOC(full) });
  };

  const toggleSeleccionOC = (idx) => setSeleccionadosOC(prev => {
    const next = new Set(prev);
    if (next.has(idx)) next.delete(idx); else next.add(idx);
    return next;
  });

  // El backend identifica los ítems por índice y fija el monto de la partida con la
  // cotización guardada: se guardan antes los cambios pendientes. `todos`: la OC de la
  // cotización entera (los ítems que aún no están en una OC vigente).
  const abrirGenerarOC = async ({ todos = false } = {}) => {
    setPreparandoOC(true);
    const guardada = await guardarCotizacion();
    setPreparandoOC(false);
    if (guardada) setIndicesNuevaOC(todos ? indicesLibresOC(guardada) : [...seleccionadosOC].sort((a, b) => a - b));
  };

  // La OC marca `ocGenerada` y `partidaOC` en sus ítems y la cotización queda en una OC vigente.
  const marcarItemsConOC = (indices, oc) => {
    const ref = { _id: oc._id, codigo: oc.codigo, numeroOrden: oc.numeroOrden, anulado: false };
    const partidaOC = idDe(partidaRecibida(oc, cot._id)?._id);
    const marcar = (lista) => (lista || []).map((it, i) => (indices.includes(i) ? { ...it, ocGenerada: ref, partidaOC } : it));
    setCot(prev => ({ ...prev, items: marcar(prev.items), bloqueo: { ...prev.bloqueo, enOC: true } }));
    setItems(marcar);
  };

  // Anexar puede mover la cadena (numeroDocumento) y cambia el bloqueo: se releen esos datos. Sin
  // tocar la versión del formulario (generar y anexar no cambian el updatedAt de la cotización).
  const recargarTrasOC = async () => {
    const lista = await fetchAuth("/cotizaciones")
      .then(r => (r.ok ? r.json() : []))
      .catch(() => []);
    const actualizada = lista.find(c => c._id === cot._id);
    if (!actualizada) return;
    setCot(prev => ({
      ...prev,
      items: actualizada.items,
      numeroDocumento: actualizada.numeroDocumento,
      numeroDocumentoOriginal: actualizada.numeroDocumentoOriginal,
      bloqueadoPorPago: actualizada.bloqueadoPorPago,
      bloqueo: actualizada.bloqueo,
    }));
    setItems((actualizada.items || []).map(itemDesdeDb));
  };

  // Quitar un ítem corre las posiciones de los siguientes: las casillas marcadas (OT y OC, por
  // índice) ya no apuntarían al mismo ítem.
  const cambiarItems = (nuevos) => {
    if (nuevos.length < items.length) {
      setSeleccionados(new Set());
      setSeleccionadosOC(new Set());
    }
    setItems(nuevos);
  };

  const toggleSeleccion = (idx) => setSeleccionados(prev => {
    const next = new Set(prev);
    if (next.has(idx)) next.delete(idx); else next.add(idx);
    return next;
  });

  // Genera una OT por cada ítem seleccionado (uno a la vez, en secuencia).
  // Primero persiste los cambios pendientes: el backend identifica el ítem
  // por índice dentro de `cotizacion.items`, así que ese orden debe coincidir
  // exactamente con lo ya guardado antes de generar OT por índice.
  const generarOTSeleccionados = async () => {
    setGenerandoOT(true);
    // Solo hace falta persistir cambios pendientes primero si el rol puede
    // editar ítems (admin/asistente/facturación/jefatura) — Planner y
    // Coordinadora ven los ítems de solo lectura, así que nunca hay nada
    // pendiente que guardar y `cot` ya refleja exactamente lo persistido.
    // Desde solo lectura no hay cambios propios que guardar (y no se deben guardar
    // sin haber pulsado Editar): se genera sobre lo ya persistido.
    const guardada = puedeEditar && bloqueo.editando ? await guardarCotizacion() : cot;
    if (!guardada) { setGenerandoOT(false); return; }
    const indices = [...seleccionados].sort((a, b) => a - b);
    let ultimaCot = guardada;
    for (const idx of indices) {
      const res = await bloqueo.fetch(`/cotizaciones/${ultimaCot._id}/items/${idx}/generar-ot`, { method: "PATCH" });
      if (res.ok) {
        const data = await res.json();
        ultimaCot = data.cotizacion;
      }
    }
    setCot(prev => fusionarBloqueo(prev, ultimaCot));
    setItems((ultimaCot.items || []).map(itemDesdeDb));
    setSeleccionados(new Set());
    setGenerandoOT(false);
    cargarRelaciones();
  };

  // Desvincula la OT ya generada de un ítem — la OT sigue existiendo, solo
  // queda sin cotización asociada (ver Backend/src/routes/cotizaciones.js).
  const quitarOT = async (idx) => {
    const res = await bloqueo.fetch(`/cotizaciones/${cot._id}/items/${idx}/quitar-ot`, { method: "PATCH" });
    if (res.ok) {
      const actualizada = await res.json();
      setCot(prev => fusionarBloqueo(prev, actualizada));
      setItems((actualizada.items || []).map(itemDesdeDb));
      cargarRelaciones();
    }
  };

  // Adjuntos que se ven acá porque están en una OT de la cadena: el backend
  // los quita de esa OT (solo Coordinadora o superior).
  const eliminarAdjuntoDeOT = async (archivo) => {
    const res = await bloqueo.fetch(`/cotizaciones/${cot._id}/archivos/${archivo._id}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    cargarRelaciones();
    if (!res.ok) return data.mensaje || "No se pudo eliminar el archivo.";
    setCot(prev => fusionarBloqueo(prev, data));
    return null;
  };

  const descuentoGlobalNum = Number(form.descuentoGlobal) || 0;
  const subtotalItems = parseFloat(items.reduce((acc, i) => acc + calcSubtotal(i, descuentoGlobalNum), 0).toFixed(2));
  const usarTotalesDeItems = items.length > 0;
  // Con ítems, `subtotalItems` ya sale neto (cada línea descuenta el % —
  // ver TablaItemsCotizacion.jsx), así que acá se llama con 0 para no
  // descontar dos veces; sin ítems, el subtotal tipeado a mano es bruto y
  // sí necesita que `calcular` le aplique el % una sola vez.
  const totalesMostrados = usarTotalesDeItems
    ? calcular(subtotalItems, 0, form.afectoIgv)
    : calcular(form.subtotal, form.descuentoGlobal, form.afectoIgv);

  // Arma el objeto para el PDF con lo que hay en pantalla ahora mismo, sin
  // depender de que se haya guardado antes (Guardar cambios cierra el modal).
  const datosParaPdf = () => ({
    ...cot,
    empresa: empresaSel || cot.empresa,
    creadoPor: cot.creadoPor,
    tipo: form.tipo,
    rq: form.rq,
    atencion: form.atencion,
    fecha: form.fecha,
    condicionPago: form.condicionPago,
    validezOferta: form.validezOferta,
    tipoDiasEntrega: form.tipoDiasEntrega,
    moneda: form.moneda,
    subtotal: totalesMostrados.subtotal,
    descuentoGlobal: descuentoGlobalNum,
    afectoIgv: form.afectoIgv,
    igv: totalesMostrados.igv,
    total: totalesMostrados.total,
    personaContacto: form.personaContacto,
    items: items.map(i => ({
      descripcion: i.descripcion,
      codigo: i.codigo,
      unidad: i.unidad || "und",
      cantidad: i.cantidad,
      diasEntrega: i.diasEntrega,
      precio: i.precio,
      moneda: i.moneda,
      subtotal: calcSubtotal(i, descuentoGlobalNum),
      subItems: (i.subItems || []).map(s => s.texto).filter(Boolean),
      imagenes: i.imagenes || [],
    })),
  });

  // Guarda el estado actual y devuelve la cotización guardada (o null si
  // falló), sin notificar al padre ni cerrar el modal — usado tanto por
  // "Guardar cambios" (a través de `persistir`) como por "Generar OT", ya
  // que esta última necesita que los índices de `items` coincidan
  // exactamente con lo persistido en el backend antes de generar OT por
  // índice, pero debe seguir generando las OT en el mismo modal abierto.
  const guardarCotizacion = async () => {
    setIntentoGuardar(true);
    const itemsInvalidos = items.some(itemInvalido);
    if (itemsInvalidos) {
      setError("Hay ítems con campos obligatorios sin completar (descripción, cantidad o precio). Corrígelos antes de guardar — resaltados en rojo.");
      return null;
    }
    setError("");
    const payload = {
      tipo: form.tipo,
      numeroCotizacion: form.numeroCotizacion.trim(),
      condicionPago: form.condicionPago,
      validezOferta: form.validezOferta,
      tipoDiasEntrega: form.tipoDiasEntrega,
      titulo: form.titulo,
      rq: form.rq,
      atencion: form.atencion,
      encargado: form.encargado,
      planta: form.planta,
      personaContacto: form.personaContacto,
      lugarEntrega: form.lugarEntrega,
      moneda: form.moneda,
      subtotal: totalesMostrados.subtotal,
      descuentoGlobal: descuentoGlobalNum,
      afectoIgv: form.afectoIgv,
      igv: totalesMostrados.igv,
      total: totalesMostrados.total,
      numeroGuiaEmision: form.numeroGuiaEmision,
      numeroGuiaRemision: form.numeroGuiaRemision,
      codigoSap: form.codigoSap,
      fechaSalida: form.fechaSalida || null,
      items: items.map(i => {
        const it = {
          descripcion: i.descripcion,
          codigo: i.codigo || "",
          unidad: i.unidad || "und",
          cantidad: i.cantidad,
          precio: i.precio,
          moneda: i.moneda,
          subtotal: calcSubtotal(i, descuentoGlobalNum),
          ...vinculosItem(i),
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

    const res = await bloqueo.fetch(`/cotizaciones/${cot._id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      const actualizada = fusionarBloqueo(cot, await res.json());
      setCot(actualizada);
      setItems((actualizada.items || []).map(itemDesdeDb));
      setIntentoGuardar(false);
      return actualizada;
    }
    const data = await res.json().catch(() => ({}));
    setError(errorDelFormulario(res.status, data, "Error al guardar los cambios.") || "");
    return null;
  };

  // Guardado explícito del botón "Guardar cambios": además de persistir,
  // notifica al padre y cierra el modal (comportamiento esperado solo aquí).
  const persistir = async () => {
    const actualizada = await guardarCotizacion();
    if (actualizada) onGuardada?.(actualizada);
    return actualizada;
  };

  const guardar = async () => {
    setGuardando(true);
    const actualizada = await persistir();
    if (actualizada) await bloqueo.terminar(actualizada.updatedAt);
    setGuardando(false);
  };

  const anular = async (motivo) => {
    const res = await bloqueo.fetch(`/cotizaciones/${cot._id}/anular`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ motivo }),
    });
    if (res.ok) {
      const actualizada = fusionarBloqueo(cot, await res.json());
      setCot(actualizada);
      onGuardada?.(actualizada);
      return;
    }
    const data = await res.json().catch(() => ({}));
    return errorDelFormulario(res.status, data, "Error al anular el documento.");
  };

  const desanular = async () => {
    const res = await bloqueo.fetch(`/cotizaciones/${cot._id}/desanular`, { method: "PATCH" });
    if (res.ok) {
      const actualizada = fusionarBloqueo(cot, await res.json());
      setCot(actualizada);
      onGuardada?.(actualizada);
    } else {
      setError(errorDelFormulario(res.status, await res.json().catch(() => ({})), "Error al desanular el documento.") || "");
    }
  };

  const ultimo = informes[informes.length - 1];

  const pasos = [
    { tipo: "cotizacion", activo: true, codigo: cot.codigo },
    { tipo: "ot", activo: ots.length > 0, codigo: ots.length > 1 ? `${ots.length} OTs` : ots[0]?.codigo },
    { tipo: "informe", activo: informes.length > 0, codigo: informes.length ? `${informes.length} av.` : "" },
    { tipo: "oc", activo: !!oc, codigo: oc?.codigo },
    ...(veFacturas(rolDeSesion()) ? [{ tipo: "factura", activo: !!factura, codigo: factura?.codigo }] : []),
  ];

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
                {cot.codigo}
              </h1>
              <p className="text-xs font-normal text-white/60 leading-tight">
                {cot.codigo}{cot.numeroDocumento != null && ` · Doc. N° ${cot.numeroDocumento}`}
              </p>
              {cot.empresa && <p className="text-xs text-white/80 leading-tight">{cot.empresa.razonSocial}</p>}
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              {puedeVerPrecios && (
                <>
                  <p className="text-[10px] text-white/60 uppercase tracking-widest leading-none">Total</p>
                  <p className="text-lg font-bold leading-tight">{money(cot.total, cot.moneda)}</p>
                </>
              )}
              <Chip className="mt-0.5 bg-white/20 text-white">{cot.tipo}</Chip>
            </div>
            {!["asistente", "planner"].includes(rolActual) && (
              <button onClick={() => exportarCotizacionPdf(datosParaPdf())}
                className="bg-white/15 text-white text-sm px-4 py-2 rounded-lg hover:bg-white/25 transition font-medium shrink-0">
                Exportar PDF
              </button>
            )}
            {!cot.anulado && !bloqueada && puedeAnular && <BotonAnular onAnular={anular} />}
            {esAdmin && cot.anulado && <BotonDesanular onDesanular={desanular} />}
            {!cot.anulado && !bloqueada && <BarraEdicion bloqueo={bloqueo} />}
            {!cot.anulado && !bloqueada && puedeEditar && (
              <button onClick={guardar} disabled={guardando || !bloqueo.editando}
                className="bg-white text-sky-700 text-sm px-5 py-2 rounded-lg hover:bg-sky-50 disabled:opacity-60 transition font-semibold shadow-sm shrink-0">
                {guardando ? "Guardando…" : "Guardar cambios"}
              </button>
            )}
          </div>
        </div>
        {error && (
          <div className="max-w-6xl mx-auto px-8 pb-2.5">
            <p role="alert" className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">{error}</p>
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
          <div className="lg:col-span-2 space-y-6 self-start">
            {cot.anulado && (
              <BannerAnulado motivo={cot.motivoAnulacion} por={cot.anuladoPor} fecha={cot.fechaAnulacion} />
            )}

            {!cot.anulado && bloqueada && (
              <p className="text-xs text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                Cotización pagada (o de una cadena cerrada) — de solo lectura. Solo Jefatura o Coordinadora pueden editarla.
              </p>
            )}

            {!cot.anulado && !bloqueada && cabeceraFija && (
              <p className="text-xs text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-lg px-3 py-2">
                {(cot.items || []).length > 0
                  ? "Tiene ítems facturados o en emisión: esos ítems (descripción, cantidad, precio y unidad), el descuento, la empresa, la moneda y la afectación al IGV no se pueden cambiar. Los ítems libres sí."
                  : "Cotización facturada o en emisión: sus montos, el descuento, la empresa, la moneda y la afectación al IGV no se pueden cambiar."}
              </p>
            )}

            {!cot.anulado && !bloqueada && !cabeceraFija && empresaMonedaFijas && (
              <p className="text-xs text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-lg px-3 py-2">
                Tiene partidas en una orden de compra vigente: la empresa, la moneda y la afectación al IGV no se pueden cambiar. Para cambiarlas, desvincula la partida o anula la OC.
              </p>
            )}

            {/* `contents` — el fieldset deshabilita todos los inputs de las 4
                cards de abajo sin imponer su propio layout (cada card sigue
                siendo un hijo directo de este space-y-6). */}
            <fieldset disabled={cot.anulado || bloqueada || !puedeEditar || !bloqueo.editando} className="contents">

              {/* Cards agrupadas igual que en SIPAPP-HUAQUIAN (revisión del
                  usuario, 2026-09-14) — mismos campos que ya tenía Intales,
                  solo reorganizados; los campos que aparecen en el formato de
                  Huaquian pero no existen en el form de Intales (Validez de
                  la oferta, Asesor comercial, N° Celular, Área, OM/Aviso,
                  N° de guía, Jefe/Supervisor solicitante, Comprador
                  responsable, N° de solicitud de pedido, N° de petición de
                  oferta, Tiempo de garantía) se ignoran a propósito.
                  N° Cotización se autogenera al crear (correlativo, ver
                  pre("save") en models/Cotizacion.js) pero es editable a
                  mano después, igual que en Huaquian (revisión del usuario,
                  2026-09-14) — puede repetirse entre cotizaciones sin
                  problema: es solo un correlativo de display, la cadena
                  real Cotización/OT/OC/Factura se enlaza por
                  `numeroDocumento`, que nunca se expone en el form. */}

              {/* Card: Detalle de cotización */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-5 mb-3">
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-5 rounded-full bg-blue-500" />
                  <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide">Detalle de cotización</h2>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">N° Cotización</label>
                    <input name="numeroCotizacion" value={form.numeroCotizacion} onChange={handleChange}
                      placeholder="—" className={INP} />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Fecha</label>
                    <input type="date" name="fecha" value={form.fecha} onChange={handleChange} className={INP} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Validez de la oferta (días)</label>
                    <input type="number" min="0" name="validezOferta" value={form.validezOferta} onChange={handleChange} className={INP} />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Tiempo de entrega</label>
                    <select name="tipoDiasEntrega" value={form.tipoDiasEntrega} onChange={handleChange} className={INP}>
                      <option value="habiles">Días hábiles</option>
                      <option value="utiles">Días útiles</option>
                    </select>
                  </div>
                </div>
                <p className="text-xs text-gray-400">Los días de entrega se definen por ítem, en la tabla de abajo.</p>
              </div>

              {/* Card: Datos del cliente */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-5 mb-3">
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
                        disabled={empresaMonedaFijas}
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
                    <button type="button" onClick={() => setEmpresasOpen(true)} disabled={empresaMonedaFijas}
                      className="shrink-0 text-xs border border-gray-300 px-3 rounded-lg hover:bg-gray-50 transition disabled:opacity-50">
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
              </div>

              {/* Card: Otros datos — resto de campos que ya tenía Intales y
                  no forman parte de las cards de arriba (mismo criterio que
                  Huaquian: "Otros datos" es el resto). */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-5 mb-3">
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-5 rounded-full bg-gray-400" />
                  <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide">Otros datos</h2>
                </div>

                {/* Uso interno (listas de cotizaciones); no va en el PDF. */}
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Título cotización</label>
                  <input name="titulo" value={form.titulo} onChange={handleChange}
                    placeholder="Título de la cotización" className={INP} />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Atención</label>
                    <input name="atencion" value={form.atencion} onChange={handleChange}
                      placeholder="Ej. Ing. Jorge Torres" className={INP} />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Tipo</label>
                    <select name="tipo" value={form.tipo} onChange={handleChange} className={INP}>
                      <option value="venta">Venta</option>
                      <option value="servicio">Servicio</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="text-xs text-gray-500 block mb-1">RQ</label>
                  <input name="rq" value={form.rq} onChange={handleChange}
                    placeholder="Ej. Proyección 2026" className={INP} />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Moneda</label>
                    <select name="moneda" value={form.moneda} onChange={handleChange} disabled={empresaMonedaFijas} className={INP}>
                      <option value="PEN">Soles (S/)</option>
                      <option value="USD">Dólares (US$)</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Forma de pago</label>
                    <SelectFormaPago name="condicionPago" value={form.condicionPago} onChange={handleChange} className={INP} />
                  </div>
                </div>

                <div hidden>
                  <label className="text-xs text-gray-500 block mb-1">Lugar de entrega</label>
                  <input name="lugarEntrega" value={form.lugarEntrega} onChange={handleChange}
                    placeholder="Ej. Planta Chilca" className={INP} />
                </div>

                <div hidden>
                  <label className="text-xs text-gray-500 block mb-1">Encargado</label>
                  <input name="encargado" value={form.encargado} onChange={handleChange}
                    placeholder="Nombre del encargado" className={INP} />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div hidden>
                    <label className="text-xs text-gray-500 block mb-1">Fecha recibida</label>
                    <input type="date" name="fechaRecibida" value={form.fechaRecibida} onChange={handleChange} className={INP} />
                  </div>
                  <div hidden>
                    <label className="text-xs text-gray-500 block mb-1">N° guía de llegada</label>
                    <input name="numeroGuiaEmision" value={form.numeroGuiaEmision} onChange={handleChange}
                      placeholder="—" className={INP} />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div hidden>
                    <label className="text-xs text-gray-500 block mb-1">N° guía de salida</label>
                    <input name="numeroGuiaRemision" value={form.numeroGuiaRemision} onChange={handleChange}
                      placeholder="—" className={INP} />
                  </div>
                  <div hidden>
                    <label className="text-xs text-gray-500 block mb-1">Fecha de salida</label>
                    <input type="date" name="fechaSalida" value={form.fechaSalida} onChange={handleChange} className={INP} />
                  </div>
                </div>

                <div hidden>
                  <label className="text-xs text-gray-500 block mb-1">Código SAP</label>
                  <input name="codigoSap" value={form.codigoSap} onChange={handleChange}
                    placeholder="—" className={INP} />
                </div>
              </div>

              {/* Cálculos — precios, información sensible: oculto sin privilegio */}
              {puedeVerPrecios && (
              <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-6">
                <div className="rounded-xl bg-gradient-to-br from-gray-50 to-sky-50/40 border border-gray-100 p-4 space-y-4">
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">
                      Subtotal sin IGV
                      {usarTotalesDeItems && <span className="text-gray-400 font-normal"> (calculado desde Ítems / Servicios)</span>}
                    </label>
                    {usarTotalesDeItems ? (
                      <p className={`${INP} text-lg font-semibold bg-gray-50 text-gray-700 border-transparent`}>
                        {totalesMostrados.subtotal.toFixed(2)}
                      </p>
                    ) : (
                      <input type="number" name="subtotal" value={form.subtotal} onChange={handleChange} disabled={cabeceraFija}
                        step="0.01" min="0" placeholder="0.00" className={`${INP} text-lg font-semibold`} />
                    )}
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Descuento global (%)</label>
                    <input type="number" name="descuentoGlobal" value={form.descuentoGlobal} onChange={handleChange} disabled={cabeceraFija}
                      onWheel={(e) => e.target.blur()}
                      step="0.1" min="0" max="100" placeholder="0" className={INP} />
                    {totalesMostrados.descuento > 0 && (
                      <p className="text-xs text-gray-400 mt-1">
                        −{totalesMostrados.descuento.toFixed(2)} · Subtotal con descuento: {totalesMostrados.subtotalConDescuento.toFixed(2)}
                      </p>
                    )}
                  </div>
                  <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer select-none">
                    <input type="checkbox" name="afectoIgv" checked={form.afectoIgv} onChange={handleChange} disabled={empresaMonedaFijas}
                      className="h-4 w-4 accent-sky-600" />
                    Afecto a IGV (18%)
                    {!form.afectoIgv && <span className="text-xs text-amber-600">— trabajo en el extranjero, sin IGV</span>}
                  </label>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="text-center">
                      <p className="text-xs text-gray-400">{form.afectoIgv ? "IGV 18%" : "IGV (no afecto)"}</p>
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
            </fieldset>

          </div>

          {/* Relaciones */}
          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-5 rounded-full bg-indigo-500" />
              <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide">Relaciones</h2>
            </div>

            <TarjetaRelacion tipo="cotizacion" codigo={cot.codigo} actual>
              <p className="text-sm text-gray-600 line-clamp-2">{cot.titulo}</p>
            </TarjetaRelacion>

            {ots.length === 0 ? (
              <TarjetaRelacion tipo="ot" vacio
                onCrear={!cot.anulado ? () => setCrearOTOpen(true) : undefined} crearLabel="OT" />
            ) : (
              ots.map(o => (
                <TarjetaRelacion key={o._id} tipo="ot" codigo={o.codigo} numero={o.numeroOT}
                  onClick={() => onNavegar?.({ tipo: "ot", data: o })}>
                  {o.estado && <Chip className={badgeOT(o.estado)}>{o.estado}</Chip>}
                </TarjetaRelacion>
              ))
            )}
            {!cot.anulado && (
              <div className="flex items-center gap-3 -mt-2 px-1">
                {ots.length > 0 && (
                  <button type="button" onClick={() => setCrearOTOpen(true)}
                    className="text-xs text-blue-600 hover:text-blue-800 underline">+ Crear otra OT</button>
                )}
                <button type="button" onClick={() => setBuscadorOTOpen(true)}
                  className="text-xs text-blue-600 hover:text-blue-800 underline">+ Vincular OT existente</button>
              </div>
            )}

            {puedeGenerarGRE && ots.length > 0 && (gres.length === 0 ? (
              <TarjetaRelacion tipo="gre" vacio
                onCrear={!cot.anulado && ots.length === 1 ? crearGREDesdeCot : undefined} crearLabel="GRE" />
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
                {!cot.anulado && ots.length === 1 && (
                  <button type="button"
                    onClick={(e) => { e.stopPropagation(); crearGREDesdeCot(); }}
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
            </TarjetaRelacion>

            {(ocs.length === 0 ? (
              <TarjetaRelacion tipo="oc" vacio
                onCrear={puedeGenerarOC && !preparandoOC ? () => abrirGenerarOC({ todos: true }) : undefined} crearLabel="OC" />
            ) : (
              ocs.map(o => (
                <TarjetaRelacion key={o._id} tipo="oc" codigo={o.codigo} numero={o.numeroOrden} onClick={() => abrirOC(o)}>
                  {o.desdeItemsCotizacion && <p className="text-sm text-gray-600 line-clamp-2">{o.titulo}</p>}
                  {puedeVerPrecios && o.monto > 0 && <p className="text-xs text-gray-500">{money(o.monto, cot.moneda)}</p>}
                  {o.anulado && <Chip className="bg-red-100 text-red-600">Anulada</Chip>}
                  <PartidaOC oc={o} cotizacionId={cot._id} moneda={cot.moneda} verPrecios={puedeVerPrecios} />
                </TarjetaRelacion>
              ))
            ))}

            {veFacturas(rolDeSesion()) && (facturas.length === 0 ? (
              <TarjetaRelacion tipo="factura" vacio />
            ) : (
              facturas.map(f => {
                const ocDeFactura = ocs.find(o => o._id === idDe(f.ordenCompra)) || (ocs.length === 1 ? oc : null);
                return (
                  <TarjetaRelacion key={f._id} tipo="factura" codigo={f.codigo} numero={f.numeroFactura}
                    onClick={() => onNavegar?.({ tipo: "factura", data: f })}>
                    {puedeVerPrecios && (f.totalAPagar || f.total) > 0 && (
                      <p className="text-xs text-gray-500">{money(f.totalAPagar ?? f.total, cot.moneda)}</p>
                    )}
                    {f.estadoPago && <Chip className={badgePago(f.estadoPago)}>{f.estadoPago}</Chip>}
                    <PartidaOC oc={ocDeFactura} cotizacionId={cot._id} partidasIds={f.partidasOC} moneda={cot.moneda} verPrecios={puedeVerPrecios} />
                  </TarjetaRelacion>
                );
              })
            ))}

            {puedeVerServicios && (
              <TarjetaRelacion
                tipo="servicio"
                codigo={servicios.length ? `${servicios.length} servicio${servicios.length !== 1 ? "s" : ""}` : null}
                vacio={servicios.length === 0}>
                {servicios.length > 0 && (
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-gray-400">
                        <th className="text-left font-semibold pb-1">Descripción</th>
                        <th className="text-right font-semibold pb-1">Costo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {servicios.map(s => (
                        <tr key={s._id} className={`border-t border-white/60 ${s.anulado ? "opacity-50 line-through" : ""}`}>
                          <td className="py-1 pr-2 text-gray-600">
                            {s.rucProveedor ? `${s.rucProveedor} — ` : ""}{s.nombreProveedor} · {s.tipoTrabajo} ({s.cantidad})
                          </td>
                          <td className="py-1 text-right text-gray-700 tabular-nums whitespace-nowrap">{money(totalServicio(s), s.moneda)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-white/60 font-semibold">
                        <td className="py-1 pr-2 text-gray-700">
                          Total{servicios.some(s => !s.anulado && s.moneda === "USD") ? " en soles (US$ al TC de cada servicio)" : ""}
                        </td>
                        <td className="py-1 text-right text-gray-800 tabular-nums whitespace-nowrap">
                          {money(servicios.filter(s => !s.anulado).reduce((t, s) => t + servicioEnSoles(s), 0))}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                )}
              </TarjetaRelacion>
            )}
          </section>
        </div>

        {/* Ítems — ancho ampliado (90vw, pedido del usuario) para que la
            tabla respire más que el resto del modal, debajo de Datos +
            Relaciones */}
        <div className="w-[90vw] max-w-none mx-auto px-8 pb-8">
          <TablaItemsCotizacion
            items={items}
            onItemsChange={cambiarItems}
            tipo={form.tipo}
            puedeEditar={puedeEditar}
            disabled={cot.anulado || !bloqueo.editando}
            intentoGuardar={intentoGuardar}
            totalesMostrados={totalesMostrados}
            descuentoGlobal={descuentoGlobalNum}
            seleccionables={puedeGenerarOT && !cot.anulado}
            seleccionados={seleccionados}
            onToggleSeleccion={toggleSeleccion}
            onGenerarOT={generarOTSeleccionados}
            generando={generandoOT}
            onVerOT={(o) => onNavegar?.({ tipo: "ot", data: ots.find(x => x._id === o._id) || o })}
            onQuitarOT={quitarOT}
            seleccionablesOC={puedeGenerarOC}
            seleccionadosOC={seleccionadosOC}
            onToggleSeleccionOC={toggleSeleccionOC}
            onGenerarOC={() => abrirGenerarOC()}
            generandoOC={preparandoOC}
            onVerOC={abrirOC}
            puedeVerPrecios={puedeVerPrecios}
            esTomado={esTomado}
            infoPartida={(item) => infoPartidaItem(item, ocs)}
            sinAgregar={sinAgregarItems}
          />
        </div>

        {/* Datos relacionados — visibles también desde la OT generada (y
            viceversa): el vendedor sube los planos acá al cotizar, y deben
            verse igual desde la OT que se genere, ver TarjetaArchivosRelacionados. */}
        <div className="max-w-6xl mx-auto px-8 pb-8">
          <TarjetaArchivosRelacionados
            ordenId={cot._id}
            endpoint="cotizaciones"
            bloqueo={bloqueo}
            archivos={(cot.archivos || []).map(a => {
              const asignadas = ots.filter(o => (a.ordenesTrabajo || []).some(id => String(id) === String(o._id)));
              return asignadas.length
                ? { ...a, _etiqueta: `Asignado a ${asignadas.map(o => `OT ${o.numeroOT || o.codigo}`).join(", ")}` }
                : a;
            })}
            archivosVinculados={ots.flatMap(o => (o.archivos || []).map(a => ({
              ...a,
              _etiqueta: `De OT ${o.numeroOT || o.codigo}`,
            })))}
            vinculadoLabel="la OT"
            onEliminarVinculado={["admin", "jefatura", "coordinadora"].includes(rolActual) ? eliminarAdjuntoDeOT : undefined}
            soloLectura={cot.anulado}
            onCambio={(actualizada) => setCot(prev => fusionarBloqueo(prev, actualizada))}
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

      {crearOTOpen && (
        <ModalNuevaOT
          cotizacion={cot}
          onClose={() => setCrearOTOpen(false)}
          onCreada={() => { setCrearOTOpen(false); cargarRelaciones(); }}
        />
      )}

      {buscadorOTOpen && (
        <BuscadorOrdenTrabajo
          onClose={() => setBuscadorOTOpen(false)}
          onSelect={(orden) => {
            const otraCot = orden.cotizacion && (orden.cotizacion._id || orden.cotizacion) !== cot._id
              ? orden.cotizacion : null;
            if (otraCot) {
              setConfirmandoReasignarOT({ orden, codigoOtra: otraCot.codigo || "otra cotización" });
            } else {
              vincularOT(orden);
            }
          }}
        />
      )}

      {confirmandoReasignarOT && (
        <ConfirmacionAccion
          mensaje={`Esta OT ya está vinculada a ${confirmandoReasignarOT.codigoOtra} — ¿deseas reasignarla a esta cotización?`}
          onCancelar={() => setConfirmandoReasignarOT(null)}
          onConfirmar={() => vincularOT(confirmandoReasignarOT.orden)}
          procesando={reasignandoOT}
          textoConfirmar="Reasignar"
        />
      )}

      {indicesNuevaOC && (
        <ModalGenerarOC
          cotizacion={cot}
          indices={indicesNuevaOC}
          verPrecios={puedeVerPrecios}
          onClose={() => setIndicesNuevaOC(null)}
          onCreada={(oc) => {
            marcarItemsConOC(indicesNuevaOC, oc);
            setIndicesNuevaOC(null);
            setSeleccionadosOC(new Set());
            recargarTrasOC();
            cargarRelaciones();
          }}
        />
      )}

      {guiaDetalle && (
        <ModalDetalleGuia guia={guiaDetalle} onClose={() => setGuiaDetalle(null)} />
      )}

    </div>
  );
}
