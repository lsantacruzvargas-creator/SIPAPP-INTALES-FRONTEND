import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { fetchAuth, getUsuario } from "../utils/fetchAuth";
import { formatearFecha } from "../utils/fecha";
import { estadoComprobanteClase } from "../utils/catalogosSunat";
import ModalOrdenCompra from "./ModalOrdenCompra";
import SelectorEmpresas from "./SelectorEmpresas";
import ModalNuevaSubOT from "./ModalNuevaSubOT";
import ModalRequerimiento from "./ModalRequerimiento";
import TablaServiciosExternos from "./TablaServiciosExternos";
import TarjetaArchivosRelacionados from "./TarjetaArchivosRelacionados";
import TablaScroll from "./TablaScroll";
import ModalGenerarGRE from "./ModalGenerarGRE";
import ModalDetalleGuia from "./ModalDetalleGuia";
import ConfirmacionAccion from "./ConfirmacionAccion";
import {
  FlujoNegocio, TarjetaRelacion, Chip,
  badgePago, badgeOT, badgeGeneral, money, BotonAnular, BotonCerrarCadena, BotonDesanular, BannerAnulado, bloqueadoPorCadenaCerrada,
} from "./detalleShared";

const INP = "border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 w-full transition";
const RO = "bg-gray-50 border border-gray-100 rounded-lg px-3 py-2 text-sm text-gray-600 w-full";

const ESTADOS = ["pendiente", "en progreso", "completado", "entregado"];

const codigoDeGuia = (g) => `${g.serie}-${String(g.correlativo).padStart(4, "0")}`;

const colorEstado = (e, activo) => {
  if (!activo) return "bg-gray-100 text-gray-500 hover:bg-gray-200";
  if (e === "entregado") return "bg-teal-600 text-white";
  if (e === "completado") return "bg-green-600 text-white";
  if (e === "en progreso") return "bg-blue-600 text-white";
  return "bg-amber-500 text-white";
};

export default function DetalleOrdenTrabajo({ orden: inicial, onClose, onGuardada, onNavegar }) {
  const [ot, setOt] = useState(inicial);
  const [form, setForm] = useState({
    numeroOT: inicial.numeroOT || "",
    codigoSap: inicial.codigoSap || "",
    empresa: inicial.empresa?._id || "",
    planta: inicial.planta || "",
    // Compatibilidad con OTs guardadas antes de este campo: si no hay
    // personaContacto propio, se intenta preseleccionar por el nombre que ya
    // tenía copiado en contactoNombre.
    personaContacto: inicial.personaContacto || inicial.contactoNombre || "",
    titulo: inicial.titulo || "",
    cantidad: inicial.cantidad ?? "",
    tiempoFabricacion: inicial.tiempoFabricacion ?? "",
    condicion: inicial.condicion || "",
    encargado: inicial.encargado || "",
    numeroGuiaEmision: inicial.numeroGuiaEmision || "",
    numeroGuiaRemision: inicial.numeroGuiaRemision || "",
    fechaSalida: inicial.fechaSalida
      ? new Date(inicial.fechaSalida).toISOString().split("T")[0] : "",
    protocolo: inicial.protocolo || "",
    observaciones: inicial.observaciones || "",
    estado: inicial.estado || "pendiente",
  });
  const navigate = useNavigate();
  const rolActual = getUsuario()?.rol;
  // Supervisor edita los campos de la OT, pero no puede anularla. Igual que
  // técnico, supervisor no ve el resto de la cadena (Cotización/OC/Factura).
  const puedeEditarCampos = ["admin", "jefatura", "supervisor", "planner", "coordinadora"].includes(rolActual);
  // Anular un documento queda reservado a Admin y Jefatura — Facturación ya
  // no puede. Desanular y cerrar/abrir la cadena a mano son exclusivos de admin.
  const puedeAnular = ["admin", "jefatura"].includes(rolActual);
  const esAdmin = rolActual === "admin";
  const esTecnico = ["tecnico", "tecnico_prueba", "tecnico_intervencion"].includes(rolActual);
  const esVistaLimitada = esTecnico || ["supervisor", "planner"].includes(rolActual);
  // Tabla de Servicios Externos: la ven todos los roles menos técnico.
  const puedeVerServicios = !esTecnico;
  // Mismo criterio que DetalleCotizacion.jsx/ModalNuevaCotizacion.jsx —
  // Planner puede ver el card de Cotización (ver más abajo) pero nunca su monto.
  const puedeVerPrecios = ["admin", "facturacion", "jefatura"].includes(rolActual);
  const cadenaCerrada = bloqueadoPorCadenaCerrada(ot.estadoCadena, rolActual);
  // Progreso (Encargado de Progreso) es una card independiente del fieldset
  // principal — un técnico no edita el resto de la OT, solo esta tarjeta si
  // su nombre de usuario coincide con `encargado` de esta OT.
  const nombreActual = getUsuario()?.nombre;
  const coincideNombre = (a, b) => !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();
  const puedeEditarEstado = puedeEditarCampos || (esTecnico && coincideNombre(ot.encargado, nombreActual));
  // Reasignar QUIÉN es Encargado de Progreso — a diferencia de arriba, no
  // exige ya ser el encargado (reasignar a otra persona es el propósito).
  // Estrictamente el rol "tecnico" (NO tecnico_prueba/tecnico_intervencion,
  // que solo editan su propia tarjeta de progreso más arriba).
  const puedeEditarEncargados = puedeEditarCampos || rolActual === "tecnico";
  // Mismo set de roles que ya tiene acceso a /facturacion-electronica/guias —
  // técnico (y cualquier otro rol sin acceso a esa ruta) no ve este card.
  const puedeGenerarGRE = ["admin", "asistente", "facturacion", "almacenero", "jefatura", "planner", "coordinadora"].includes(rolActual);
  const [usuarios, setUsuarios] = useState([]);
  const [empresas, setEmpresas] = useState([]);
  const [empresasOpen, setEmpresasOpen] = useState(false);
  const [cot, setCot] = useState(ot.cotizacion || null);
  const [oc, setOc] = useState(null);
  const [factura, setFactura] = useState(null);
  const [subOTs, setSubOTs] = useState([]);
  const [informes, setInformes] = useState([]);
  const [greMap, setGreMap] = useState({});
  const [guiaDetalle, setGuiaDetalle] = useState(null);
  const [requerimientos, setRequerimientos] = useState([]);
  const [crearRequerimientoOpen, setCrearRequerimientoOpen] = useState(false);
  const [servicios, setServicios] = useState([]);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [crearOCOpen, setCrearOCOpen] = useState(false);
  const [crearSubOTOpen, setCrearSubOTOpen] = useState(false);
  const [generarGREOpen, setGenerarGREOpen] = useState(false);

  const cargarRelaciones = () => {
    Promise.all([
      fetchAuth("/cotizaciones").then(r => r.ok ? r.json() : []),
      fetchAuth("/ordenes-compra").then(r => r.ok ? r.json() : []),
      fetchAuth("/facturas").then(r => r.ok ? r.json() : []),
    ]).then(([cots, ocs, facts]) => {
      const cotId = ot.cotizacion?._id || ot.cotizacion;
      const cotResuelta =
        (cotId && cots.find(c => c._id === cotId)) ||
        (ot.numeroDocumento != null && cots.find(c => c.numeroDocumento === ot.numeroDocumento)) ||
        null;
      setCot(cotResuelta);

      const ocResuelta =
        (cotResuelta && ocs.find(o => (o.cotizacion?._id || o.cotizacion) === cotResuelta._id)) ||
        (ot.numeroDocumento != null && ocs.find(o => o.numeroDocumento === ot.numeroDocumento)) ||
        null;
      setOc(ocResuelta);

      const factResuelta =
        (ocResuelta && facts.find(f => (f.ordenCompra?._id || f.ordenCompra) === ocResuelta._id)) ||
        (ot.numeroDocumento != null && facts.find(f => f.numeroDocumento === ot.numeroDocumento)) ||
        null;
      setFactura(factResuelta);
    });

    // Este componente ahora solo se monta para la OT padre/normal (una
    // sub-OT usa DetalleSubOT.jsx) — requerimientos siempre se traen
    // agregados (propios + de todas las sub-OTs).
    fetchAuth(`/ordenes-trabajo?ordenPadre=${ot._id}`)
      .then(r => r.ok && r.json())
      .then(subs => {
        setSubOTs(subs || []);
        // Avances agregados (propios + de todas las sub-OTs) — el backend de
        // /informes solo filtra por una OT exacta, así que se junta acá.
        const idsInformes = [ot._id, ...(subs || []).map(s => s._id)];
        Promise.all(
          idsInformes.map(id => fetchAuth(`/informes?ordenTrabajo=${id}`).then(r => r.ok ? r.json() : []))
        ).then(listas => setInformes(listas.flat().sort((a, b) =>
          new Date(a.fechaHoraGuardado || 0) - new Date(b.fechaHoraGuardado || 0)
        )));
        if (!puedeGenerarGRE) return;
        // Qué sub-OTs (o la propia OT, si no tiene hijas) ya salieron en
        // alguna GRE — para el badge en cada card. Solo cuentan las GRE
        // ACEPTADAS por SUNAT: una rechazada/en error/anulada no significa
        // que el equipo realmente salió, así que no debe marcar la sub-OT
        // como "ya enviada". limit alto porque acá interesan todas las
        // coincidencias, no una página.
        const ids = [ot._id, ...(subs || []).map(s => s._id)];
        return fetchAuth(`/guias?ordenesTrabajo=${ids.join(",")}&estado=ACEPTADO&limit=1000`)
          .then(r => r.ok && r.json())
          .then(data => {
            if (!data?.ok) return;
            // Por OT id -> array de guías (antes era un string ya formateado,
            // no permitía abrir el detalle de cada GRE desde la tarjeta de
            // relación — revisión del usuario, 2026-09-11).
            const map = {};
            data.data.forEach(g => {
              (g.ordenesTrabajo || []).forEach(id => {
                const key = id?._id || id;
                map[key] = map[key] ? [...map[key], g] : [g];
              });
            });
            setGreMap(map);
          });
      });

    fetchAuth(`/requerimientos?ordenTrabajoPadre=${ot._id}`)
      .then(r => r.ok && r.json())
      .then(reqs => setRequerimientos(reqs || []));

    if (puedeVerServicios) {
      fetchAuth(`/servicios-externos?ordenTrabajoPadre=${ot._id}`)
        .then(r => r.ok && r.json())
        .then(servs => setServicios(servs || []));
    }
  };

  const cargarEmpresas = () =>
    fetchAuth("/empresas").then((res) => res.ok && res.json().then(setEmpresas));

  useEffect(() => {
    // Encargado de Progreso se elige entre los usuarios con login y alguno
    // de los 3 roles de técnico (ver Fase 13 — antes salían de Personal, sin
    // relación real con quién puede loguearse como técnico).
    fetchAuth("/usuarios/lista").then(r => r.ok && r.json()).then(u => setUsuarios((u || []).filter(x => ["tecnico", "tecnico_prueba", "tecnico_intervencion"].includes(x.rol))));
    cargarEmpresas();
    cargarRelaciones();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ot._id]);

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

  const guardar = async () => {
    if (!form.titulo.trim()) { setError("El título de la OT es obligatorio."); return; }
    setGuardando(true); setError("");
    const body = {
      ...form,
      contactoNombre: contactoSel?.nombre || "",
      contactoTelefono: contactoSel?.telefono || "",
    };
    if (!body.empresa) delete body.empresa;
    if (!body.fechaSalida) delete body.fechaSalida;
    body.cantidad = body.cantidad === "" ? null : Number(body.cantidad);

    const res = await fetchAuth(`/ordenes-trabajo/${ot._id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const actualizada = await res.json();
      setOt(actualizada);
      onGuardada?.(actualizada);
    } else {
      setError("Error al guardar los cambios.");
    }
    setGuardando(false);
  };

  // Cambian de inmediato (sin pasar por "Guardar cambios", que técnico no
  // puede usar) — no llaman `onGuardada` a propósito: ese callback cierra el
  // modal entero (ver DetalleDocumento.jsx `cerrarGuardando`), y marcar un
  // estado no debería sacar al usuario de la vista.
  const cambiarEstado = async (nuevo) => {
    const res = await fetchAuth(`/ordenes-trabajo/${ot._id}/estado`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ estado: nuevo }),
    });
    if (res.ok) {
      const actualizada = await res.json();
      setOt(actualizada);
      setForm((f) => ({ ...f, estado: actualizada.estado }));
    }
  };

  const cambiarEncargado = async (campo, nombre) => {
    const res = await fetchAuth(`/ordenes-trabajo/${ot._id}/encargados`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [campo]: nombre }),
    });
    if (res.ok) {
      const actualizada = await res.json();
      setOt(actualizada);
      setForm((f) => ({ ...f, [campo]: actualizada[campo] }));
    }
  };

  const anular = async (motivo) => {
    const res = await fetchAuth(`/ordenes-trabajo/${ot._id}/anular`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ motivo }),
    });
    if (res.ok) {
      const actualizada = await res.json();
      setOt(actualizada);
      onGuardada?.(actualizada);
    } else {
      setError("Error al anular el documento.");
    }
  };

  const desanular = async () => {
    const res = await fetchAuth(`/ordenes-trabajo/${ot._id}/desanular`, { method: "PATCH" });
    if (res.ok) {
      const actualizada = await res.json();
      setOt(actualizada);
      onGuardada?.(actualizada);
    } else {
      setError("Error al desanular el documento.");
    }
  };

  const toggleCerrarCadena = async (cerrado) => {
    const res = await fetchAuth(`/ordenes-trabajo/${ot._id}/cerrar-cadena`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cerrado }),
    });
    if (res.ok) {
      const actualizada = await res.json();
      setOt(actualizada);
      onGuardada?.(actualizada);
    } else {
      setError("Error al cerrar/abrir la cadena.");
    }
  };

  // Crea la cotización directo con el contexto de la OT (sin el modal
  // intermedio que pedía N°/tipo/moneda/subtotal) y navega de una al editor
  // completo — pedir esos mismos datos dos veces (modal rápido + de nuevo en
  // el detalle de la cotización, vía ítems) era trabajo duplicado.
  const [confirmandoCrearCotizacion, setConfirmandoCrearCotizacion] = useState(false);
  const [creandoCotizacion, setCreandoCotizacion] = useState(false);

  const crearCotizacion = async () => {
    setCreandoCotizacion(true);

    const body = {
      numeroDocumento: ot.numeroDocumento,
      titulo: ot.titulo,
      tipo: "venta",
      moneda: "PEN",
      planta: ot.planta,
      encargado: ot.encargado,
      numeroGuiaEmision: ot.numeroGuiaEmision,
      numeroGuiaRemision: ot.numeroGuiaRemision,
      codigoSap: ot.codigoSap,
      fechaSalida: ot.fechaSalida,
      subtotal: 0, igv: 0, total: 0,
    };
    if (ot.empresa?._id) body.empresa = ot.empresa._id;
    if (ot.fechaRecibida) body.fechaRecibida = ot.fechaRecibida;

    const res = await fetchAuth("/cotizaciones", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) { setError("Error al crear la cotización."); setCreandoCotizacion(false); setConfirmandoCrearCotizacion(false); return; }
    const nueva = await res.json();
    await fetchAuth(`/ordenes-trabajo/${ot._id}/vincular-cotizacion`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cotizacion: nueva._id }),
    });
    setCreandoCotizacion(false);
    setConfirmandoCrearCotizacion(false);
    onNavegar?.({ tipo: "cotizacion", data: nueva });
  };

  // Sin sub-OTs: un solo ítem (la OT misma) — directo al form prellenado, sin
  // paso intermedio. Con sub-OTs: abre el selector para elegir cuáles van en
  // esta GRE (permite envíos parciales, ver ModalGenerarGRE.jsx).
  const abrirGenerarGRE = () => {
    if (subOTs.length > 0) { setGenerarGREOpen(true); return; }
    navigate("/facturacion-electronica/guias/emitir", {
      state: {
        prellenarGRE: {
          items: [{ descripcion: ot.titulo, cantidad: 1, unidad: "NIU" }],
          destinatario: ot.empresa
            ? { schemeID: "6", numDoc: ot.empresa.ruc || "", nombre: ot.empresa.razonSocial || "" }
            : undefined,
          ordenesTrabajo: [ot._id],
        },
      },
    });
  };

  const ie = ot.ingresoEquipo;
  // El estado del padre pasa a ser calculado (backend, recalcularEstadoPadre) apenas tiene al
  // menos una sub-OT "sana" — las marcadas `irreparable` quedan excluidas del cálculo.
  const hayHijasSanas = subOTs.some(s => !s.irreparable);

  // Todas las GRE de la OT padre + sus sub-OTs, sin duplicar (una misma GRE
  // puede cubrir varias sub-OTs a la vez) — para la tarjeta de relación.
  const misGres = Array.from(
    new Map(
      [ot._id, ...subOTs.map(s => s._id)]
        .flatMap(id => greMap[id] || [])
        .map(g => [g._id, g])
    ).values()
  );

  const ultimoInforme = informes[informes.length - 1];

  const pasos = [
    { tipo: "cotizacion", activo: !!cot, codigo: cot?.codigo },
    { tipo: "ot", activo: true, codigo: ot.codigo },
    { tipo: "informe", activo: informes.length > 0, codigo: informes.length ? `${informes.length} av.` : "" },
    { tipo: "oc", activo: !!oc, codigo: oc?.codigo },
    { tipo: "factura", activo: !!factura, codigo: factura?.codigo },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-gray-50 flex flex-col">
      {/* Header degradado */}
      <div className="shrink-0 bg-gradient-to-r from-indigo-600 to-violet-700 text-white">
        <div className="max-w-6xl mx-auto px-8 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={onClose}
              className="text-sm text-white/80 hover:text-white transition flex items-center gap-1.5 group shrink-0">
              <span className="group-hover:-translate-x-0.5 transition">←</span> Órdenes de Trabajo
            </button>
            <span className="w-px h-8 bg-white/20" />
            <div>
              <p className="text-lg font-bold text-white uppercase tracking-widest leading-none">Orden de Trabajo</p>
              <h1 className="text-lg font-bold font-mono leading-tight">
                {form.numeroOT || ot.codigo}
              </h1>
              <p className="text-xs font-normal text-white/60 leading-tight">
                {ot.codigo}{ot.numeroDocumento != null && ` · Doc. N° ${ot.numeroDocumento}`}
              </p>
              {ot.empresa && <p className="text-xs text-white/80 leading-tight">{ot.empresa.razonSocial}</p>}
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-[10px] text-white/60 uppercase tracking-widest leading-none">OT</p>
              <Chip className={`mt-0.5 ${badgeGeneral(ot.estadoGeneral)}`}>{ot.estadoGeneral}</Chip>
              <p className="text-[10px] text-white/60 uppercase tracking-widest leading-none mt-1.5">Estado</p>
              <Chip className="mt-0.5 bg-white/20 text-white">{ot.estado}</Chip>
            </div>
            {!ot.anulado && !cadenaCerrada && puedeAnular && <BotonAnular onAnular={anular} />}
            {esAdmin && ot.anulado && <BotonDesanular onDesanular={desanular} />}
            {esAdmin && <BotonCerrarCadena cerrado={cadenaCerrada} onToggle={toggleCerrarCadena} />}
            {!ot.anulado && !cadenaCerrada && puedeEditarCampos && (
              <button onClick={guardar} disabled={guardando}
                className="bg-white text-indigo-700 text-sm px-5 py-2 rounded-lg hover:bg-indigo-50 disabled:opacity-60 transition font-semibold shadow-sm shrink-0">
                {guardando ? "Guardando…" : "Guardar cambios"}
              </button>
            )}
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
        <div className="max-w-6xl mx-auto px-8 pt-8">
          {/* Progreso (Encargado de Progreso) — card independiente del
              fieldset principal: un técnico solo la edita si su nombre de
              usuario coincide con `encargado` de esta OT. */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-2 md:max-w-sm">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Progreso — Encargado de Progreso</p>
            <select value={ot.encargado || ""} disabled={ot.anulado || cadenaCerrada || !puedeEditarEncargados}
              onChange={(e) => cambiarEncargado("encargado", e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm disabled:bg-gray-50 disabled:text-gray-500">
              <option value="">Sin asignar</option>
              {usuarios.map(u => (
                <option key={u._id} value={u.nombre}>{u.nombre}</option>
              ))}
            </select>
            <div className="flex gap-2">
              {ESTADOS.map(e => (
                <button key={e} type="button" disabled={hayHijasSanas || !puedeEditarEstado}
                  onClick={() => cambiarEstado(e)}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-medium capitalize transition disabled:opacity-60 disabled:cursor-not-allowed ${colorEstado(e, ot.estado === e)}`}>
                  {e}
                </button>
              ))}
            </div>
            {hayHijasSanas && <p className="text-xs text-gray-400">Calculado automáticamente según las sub-órdenes.</p>}
          </div>
        </div>

        <div className="max-w-6xl mx-auto px-8 py-8 grid grid-cols-1 lg:grid-cols-3 gap-8">

          {/* Datos editables — separados en 2 cards (pedido del usuario,
              2026-09-11): "Datos de la empresa" agrupa cliente/planta/
              contacto/guías; "Datos de la orden de trabajo" agrupa el resto. */}
          <fieldset disabled={ot.anulado || cadenaCerrada || !puedeEditarCampos} className="lg:col-span-2 space-y-6 self-start">
            {ot.anulado && (
              <BannerAnulado motivo={ot.motivoAnulacion} por={ot.anuladoPor} fecha={ot.fechaAnulacion} />
            )}

            {!ot.anulado && cadenaCerrada && (
              <p className="text-xs text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                La cadena de este documento está cerrada (factura pagada) — de solo lectura. Solo Jefatura puede editarlo.
              </p>
            )}

            {/* Ingreso de equipo (solo lectura) */}
            {ie && (
              <div className="border border-blue-100 bg-blue-50/40 rounded-xl p-4 space-y-3">
                <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide">
                  Ingreso de equipo · <span className="font-mono">{ie.codigo}</span>
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs text-gray-400 mb-1">Tipo de equipo</p>
                    <input value={ie.tipoEquipo || "—"} disabled className={RO} />
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 mb-1">Marca / Modelo</p>
                    <input value={[ie.marca, ie.modelo].filter(Boolean).join(" / ") || "—"} disabled className={RO} />
                  </div>
                </div>
              </div>
            )}

            {/* Card 1: Datos de la empresa */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-5">
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-5 rounded-full bg-indigo-500" />
                <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide">Datos de la empresa</h2>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Cliente</label>
                  <div className="flex gap-2">
                    <select name="empresa" value={form.empresa} onChange={handleChange} className={INP}>
                      <option value="">Seleccionar empresa…</option>
                      {empresas.map(e => (
                        <option key={e._id} value={e._id}>
                          {e.alias ? `${e.alias} — ` : ""}{e.razonSocial}
                        </option>
                      ))}
                    </select>
                    <button type="button" onClick={() => setEmpresasOpen(true)}
                      className="shrink-0 text-xs border border-gray-300 px-3 rounded-lg hover:bg-gray-50 transition">
                      Empresas
                    </button>
                  </div>
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Planta</label>
                  {plantasEmpresa.length > 0 ? (
                    <select name="planta" value={form.planta} onChange={handleChange} className={INP}>
                      <option value="">Seleccionar planta…</option>
                      {plantasEmpresa.map((p, i) => (
                        <option key={i} value={p.nombre}>{p.nombre}</option>
                      ))}
                    </select>
                  ) : (
                    <input name="planta" value={form.planta} onChange={handleChange} placeholder="Planta" className={INP} />
                  )}
                </div>
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
                  <label className="text-xs text-gray-500 block mb-1">Guía de llegada</label>
                  <input name="numeroGuiaEmision" value={form.numeroGuiaEmision} onChange={handleChange} placeholder="—" className={INP} />
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Guía de salida</label>
                  <input name="numeroGuiaRemision" value={form.numeroGuiaRemision} onChange={handleChange} placeholder="—" className={INP} />
                </div>
              </div>
            </div>

            {/* Card 2: Datos de la orden de trabajo */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-5">
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-5 rounded-full bg-indigo-500" />
                <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide">Datos de la orden de trabajo</h2>
              </div>

              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label className="text-xs text-gray-500 block mb-1">N° OT</label>
                  <input name="numeroOT" value={form.numeroOT} onChange={handleChange} placeholder="—" className={INP} />
                </div>
                <div hidden>
                  <label className="text-xs text-gray-500 block mb-1">Código SAP</label>
                  <input name="codigoSap" value={form.codigoSap} onChange={handleChange} placeholder="—" className={INP} />
                </div>
              </div>

              <div className="grid grid-cols-[1fr_110px_160px] gap-4">
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Título OT</label>
                  <input name="titulo" value={form.titulo} onChange={handleChange} placeholder="Título de la OT" className={INP} />
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Cantidad</label>
                  {/* Se trae de la cotización (ítem que generó esta OT) — no
                      es un dato que se escriba a mano acá (pedido del
                      usuario, 2026-09-11). */}
                  <input value={form.cantidad === "" ? "—" : form.cantidad} disabled className={RO} />
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Tiempo de Fabricación</label>
                  {/* Se trae de la cotización (días de entrega del ítem que
                      generó esta OT) — mismo criterio que Cantidad, no se
                      escribe a mano acá (pedido del usuario, 2026-09-11). */}
                  <input value={form.tiempoFabricacion === "" ? "—" : `${form.tiempoFabricacion} días hábiles`} disabled className={RO} />
                </div>
              </div>

              <div hidden>
                <label className="text-xs text-gray-500 block mb-1">Condición</label>
                <input name="condicion" value={form.condicion} onChange={handleChange} className={INP} />
              </div>

              <div>
                <label className="text-xs text-gray-500 block mb-1">Fecha de salida</label>
                <input type="date" name="fechaSalida" value={form.fechaSalida} onChange={handleChange} className={INP} />
              </div>

              <div hidden>
                <label className="text-xs text-gray-500 block mb-1">Protocolo</label>
                <input name="protocolo" value={form.protocolo} onChange={handleChange} className={INP} />
              </div>

              <div>
                <label className="text-xs text-gray-500 block mb-1">Observaciones</label>
                <textarea name="observaciones" value={form.observaciones} onChange={handleChange}
                  rows={3} className={`${INP} resize-none`} />
              </div>
            </div>

            {error && <p className="text-xs text-red-500">{error}</p>}
          </fieldset>

          {/* Relaciones */}
          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-5 rounded-full bg-violet-500" />
              <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide">Relaciones</h2>
            </div>

            {(!esVistaLimitada || rolActual === "planner") && (
              <TarjetaRelacion tipo="cotizacion" codigo={cot?.codigo} numero={cot?.numeroCotizacion} vacio={!cot}
                onClick={cot ? () => onNavegar?.({ tipo: "cotizacion", data: cot }) : undefined}
                onCrear={!cot && !ot.anulado ? () => setConfirmandoCrearCotizacion(true) : undefined} crearLabel="Cotización">
                <p className="text-sm text-gray-700 line-clamp-2">{cot?.titulo}</p>
                {puedeVerPrecios && cot?.total > 0 && <p className="text-xs text-gray-500">{money(cot.total, cot.moneda)}</p>}
              </TarjetaRelacion>
            )}

            <TarjetaRelacion tipo="ot" codigo={ot.codigo} numero={ot.numeroOT} actual>
              {ot.estado && <Chip className={badgeOT(ot.estado)}>{ot.estado}</Chip>}
              {!!greMap[ot._id]?.length && (
                <Chip className="bg-purple-100 text-purple-700">GRE {greMap[ot._id].map(codigoDeGuia).join(", ")}</Chip>
              )}
            </TarjetaRelacion>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Sub-Órdenes ({subOTs.length})
                </p>
                {!ot.anulado && !cadenaCerrada && !esTecnico && (
                  <button type="button" onClick={() => setCrearSubOTOpen(true)}
                    className="text-xs text-blue-600 hover:text-blue-800 underline">
                    + Crear Sub-OT
                  </button>
                )}
              </div>
              {subOTs.length === 0 ? (
                <p className="text-xs text-gray-400">Sin sub-órdenes</p>
              ) : (
                <div className="space-y-2">
                  {subOTs.map(s => (
                    <TarjetaRelacion key={s._id} tipo="ot" codigo={s.codigo} numero={s.numeroOT}
                      onClick={() => onNavegar?.({ tipo: "ot", data: s })}>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {s.estado && <Chip className={badgeOT(s.estado)}>{s.estado}</Chip>}
                        {s.irreparable && <Chip className="bg-red-100 text-red-700">Irreparable</Chip>}
                        {!!greMap[s._id]?.length && (
                          <Chip className="bg-purple-100 text-purple-700">GRE {greMap[s._id].map(codigoDeGuia).join(", ")}</Chip>
                        )}
                      </div>
                      <p className="text-sm text-gray-700 line-clamp-1">{s.titulo}</p>
                    </TarjetaRelacion>
                  ))}
                </div>
              )}
            </div>

            <TarjetaRelacion
              tipo="informe"
              codigo={informes.length ? `${informes.length} avance${informes.length !== 1 ? "s" : ""}` : null}
              vacio={informes.length === 0}
              crearLabel="informe"
              crearDeshabilitado>
              {ultimoInforme?.fechaHoraGuardado && (
                <p className="text-xs text-gray-500">
                  Último: {formatearFecha(ultimoInforme.fechaHoraGuardado)}
                </p>
              )}
            </TarjetaRelacion>

            {puedeGenerarGRE && (misGres.length === 0 ? (
              <TarjetaRelacion tipo="gre" vacio
                onCrear={!ot.anulado ? abrirGenerarGRE : undefined} crearLabel="GRE" />
            ) : (
              <TarjetaRelacion tipo="gre"
                codigo={misGres.length === 1 ? codigoDeGuia(misGres[0]) : `${misGres.length} guías`}
                onClick={misGres.length === 1 ? () => setGuiaDetalle(misGres[0]) : undefined}>
                {misGres.length === 1 ? (
                  <Chip className={estadoComprobanteClase(misGres[0].estado)}>{misGres[0].estado}</Chip>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {misGres.map(g => (
                      <button key={g._id} type="button"
                        onClick={(e) => { e.stopPropagation(); setGuiaDetalle(g); }}
                        className="font-mono text-xs text-purple-700 bg-white rounded-lg px-2 py-0.5 shadow-sm hover:underline">
                        {codigoDeGuia(g)}
                      </button>
                    ))}
                  </div>
                )}
                {!ot.anulado && (
                  <button type="button"
                    onClick={(e) => { e.stopPropagation(); abrirGenerarGRE(); }}
                    className="text-xs text-blue-600 hover:text-blue-800 underline mt-0.5">
                    + Crear otra GRE
                  </button>
                )}
              </TarjetaRelacion>
            ))}

            {!esVistaLimitada && rolActual !== "coordinadora" && (
              <>
                <TarjetaRelacion tipo="oc" codigo={oc?.codigo} numero={oc?.numeroOrden} vacio={!oc}
                  onClick={oc ? () => onNavegar?.({ tipo: "oc", data: oc, extra: factura }) : undefined}
                  onCrear={!oc && cot && !ot.anulado ? () => setCrearOCOpen(true) : undefined} crearLabel="OC">
                  {puedeVerPrecios && oc?.monto > 0 && <p className="text-xs text-gray-500">{money(oc.monto, cot?.moneda)}</p>}
                </TarjetaRelacion>

                <TarjetaRelacion tipo="factura" codigo={factura?.codigo} numero={factura?.numeroFactura} vacio={!factura}
                  onClick={factura ? () => onNavegar?.({ tipo: "factura", data: factura }) : undefined}>
                  {puedeVerPrecios && (factura?.totalAPagar || factura?.total) > 0 && (
                    <p className="text-xs text-gray-500">{money(factura.totalAPagar ?? factura.total, cot?.moneda)}</p>
                  )}
                  {factura?.estadoPago && <Chip className={badgePago(factura.estadoPago)}>{factura.estadoPago}</Chip>}
                </TarjetaRelacion>
              </>
            )}
          </section>
        </div>

        <div className="max-w-6xl mx-auto px-8 pb-8">
          <TarjetaArchivosRelacionados
            ordenId={ot._id}
            archivos={ot.archivos}
            soloLectura={ot.anulado || cadenaCerrada}
            onCambio={(actualizada) => setOt(actualizada)}
          />
        </div>
        <div className="max-w-6xl mx-auto px-8 pb-8">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-5 rounded-full bg-orange-500" />
                <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide">
                  Requerimientos de Material ({requerimientos.length})
                </h2>
              </div>
              {!ot.anulado && (
                <button type="button" onClick={() => setCrearRequerimientoOpen(true)}
                  className="text-sm bg-orange-600 text-white px-4 py-2 rounded-lg hover:bg-orange-700 transition font-medium">
                  + Nuevo requerimiento
                </button>
              )}
            </div>

            {requerimientos.length === 0 ? (
              <p className="text-sm text-gray-400">Sin requerimientos de material</p>
            ) : (
              <TablaScroll className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs uppercase tracking-wide text-gray-400 border-b border-gray-100">
                    <tr>
                      <th className="text-left py-2 pr-3">Código</th>
                      <th className="text-left py-2 pr-3">Solicitado por</th>
                      <th className="text-left py-2 pr-3">Ítems</th>
                      <th className="text-left py-2 pr-3">Sub-OT</th>
                      <th className="text-left py-2 pr-3">Estado</th>
                      <th className="text-left py-2 pr-3">Fecha</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {requerimientos.map(req => {
                      const pendientes = req.items.filter(it => it.estado === "pendiente").length;
                      const otOrigenId = req.ordenTrabajo?._id || req.ordenTrabajo;
                      const esPrincipal = otOrigenId === ot._id;
                      const subOrigen = subOTs.find(s => s._id === otOrigenId);
                      return (
                        <tr key={req._id}>
                          <td className="py-2 pr-3 font-mono text-xs text-gray-700">{req.codigo}</td>
                          <td className="py-2 pr-3 text-gray-600">{req.solicitadoPor}</td>
                          <td className="py-2 pr-3 text-gray-600">
                            {req.items.map((it, i) => (
                              <span key={i} className="block text-xs">
                                {it.esSolicitudCompra ? `${it.categoriaNombre} (compra)` : it.material?.nombre} — {it.cantidad}
                              </span>
                            ))}
                          </td>
                          <td className="py-2 pr-3 text-gray-600">
                            {esPrincipal ? "Principal" : (subOrigen?.numeroOT || req.ordenTrabajo?.numeroOT || "—")}
                          </td>
                          <td className="py-2 pr-3">
                            <Chip className={pendientes > 0 ? "bg-blue-100 text-blue-700" : "bg-green-100 text-green-700"}>
                              {pendientes > 0 ? `${pendientes} pendiente(s)` : "Completado"}
                            </Chip>
                          </td>
                          <td className="py-2 pr-3 text-gray-500">
                            {req.createdAt ? formatearFecha(req.createdAt) : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </TablaScroll>
            )}
          </div>
        </div>

        {puedeVerServicios && (
          <TablaServiciosExternos ot={ot} subOTs={subOTs} servicios={servicios}
            puedeEditar={puedeEditarCampos} onCambio={cargarRelaciones} />
        )}


      </div>

      {crearRequerimientoOpen && (
        <ModalRequerimiento
          ot={ot}
          onClose={() => setCrearRequerimientoOpen(false)}
          onCreado={() => { setCrearRequerimientoOpen(false); cargarRelaciones(); }}
        />
      )}

      {crearSubOTOpen && (
        <ModalNuevaSubOT
          padre={ot}
          onClose={() => setCrearSubOTOpen(false)}
          onCreada={() => { setCrearSubOTOpen(false); cargarRelaciones(); }}
        />
      )}

      {generarGREOpen && (
        <ModalGenerarGRE
          ot={ot}
          subOTs={subOTs}
          onClose={() => setGenerarGREOpen(false)}
        />
      )}

      {guiaDetalle && (
        <ModalDetalleGuia guia={guiaDetalle} onClose={() => setGuiaDetalle(null)} />
      )}

      {confirmandoCrearCotizacion && (
        <ConfirmacionAccion
          mensaje="¿Crear una cotización para esta OT?"
          onCancelar={() => setConfirmandoCrearCotizacion(false)}
          onConfirmar={crearCotizacion}
          procesando={creandoCotizacion}
          textoConfirmar="Crear cotización"
        />
      )}

      {crearOCOpen && cot && (
        <ModalOrdenCompra
          cotizacion={cot}
          onClose={() => setCrearOCOpen(false)}
          onCreada={() => { setCrearOCOpen(false); cargarRelaciones(); }}
        />
      )}

      {empresasOpen && (
        <SelectorEmpresas
          empresas={empresas}
          onClose={() => setEmpresasOpen(false)}
          onSeleccionar={(e) => {
            setForm(f => ({ ...f, empresa: e._id, planta: "" }));
            setEmpresasOpen(false);
          }}
          onCambio={async (guardada, { esNueva }) => {
            await cargarEmpresas();
            if (esNueva) setForm(f => ({ ...f, empresa: guardada._id, planta: "" }));
          }}
        />
      )}
    </div>
  );
}
