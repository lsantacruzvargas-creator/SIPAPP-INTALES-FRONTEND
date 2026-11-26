import { useState, useEffect } from "react";
import { fetchAuth, getUsuario } from "../utils/fetchAuth";
import { formatearFecha, fechaHoyLima } from "../utils/fecha";
import DetalleDocumento from "../components/DetalleDocumento";
import ModalNuevaOT from "../components/ModalNuevaOT";
import ModalImportarExcel, { COLS_OT } from "../components/ModalImportarExcel";
import TablaScroll from "../components/TablaScroll";
import { ChipEstadoOT, estadoProgresoOT } from "../components/detalleShared";
import * as XLSX from "xlsx";
import { veFacturas, rolDeSesion } from "../utils/roles";
import { numerosFacturaPorCadena } from "../utils/facturacionOC";

const FILTROS_VACIO = { empresa: "", planta: "", busqueda: "", fechaDesde: "", fechaHasta: "" };

const SORTS = [
  { valor: "fecha",             label: "Más reciente" },
  { valor: "numeroOT",          label: "N° OT" },
  { valor: "numeroOC",          label: "N° OC" },
  { valor: "plazo",             label: "Plazo" },
  { valor: "fechaOC",           label: "Fecha recibida OC" },
  { valor: "diasRecibido",      label: "Días desde recibido" },
];

// Los valores null (sin OC, sin días de fabricación) van al final en ambas
// direcciones.
const compararNum = (va, vb, dir) => {
  if (va == null && vb == null) return 0;
  if (va == null) return 1;
  if (vb == null) return -1;
  return dir === "asc" ? va - vb : vb - va;
};

// Comparador descendente: numérico si ambos parsean como número, si no
// localeCompare; los valores vacíos van al final.
const compararTexto = (na, nb) => {
  if (!na && !nb) return 0;
  if (!na) return 1;
  if (!nb) return -1;
  const numA = Number(na), numB = Number(nb);
  if (!isNaN(numA) && !isNaN(numB)) return numB - numA;
  return String(nb).localeCompare(String(na));
};

const SELECT =
  "border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400";

const TH = "px-4 py-3 font-semibold text-gray-500 whitespace-nowrap";

// "Estado de servicio": estadoProgresoOT/ChipEstadoOT de detalleShared, el
// mismo que usan Cotizaciones, OC e Ingreso de equipos. Hasta 2026-09-11
// existían dos tracks (Prueba/Intervención) — se simplificaron a uno solo
// (decisión del usuario, ver DetalleOrdenTrabajo.jsx).
const progresoLabel = estadoProgresoOT;

// `valor` de los estados = lo que devuelve estadoProgresoOT (ESTADOS_PROGRESO_OT).
const FILTROS_ESTADO = [
  { valor: "todos",       label: "Todas las Órdenes de Trabajo", titulo: "Todas las Órdenes de Trabajo", hoja: "Todas",       acento: "bg-indigo-500", vacio: "Sin órdenes de trabajo" },
  { valor: "No asignado", label: "No asignado",                  titulo: "Órdenes no asignadas",          hoja: "Sin asignar", acento: "bg-red-500",    vacio: "Sin órdenes por asignar" },
  { valor: "pendiente",   label: "Pendiente",                    titulo: "Órdenes pendientes",            hoja: "Pendientes",  acento: "bg-amber-500",  vacio: "Sin órdenes pendientes" },
  { valor: "en progreso", label: "En progreso",                  titulo: "Órdenes en progreso",           hoja: "En progreso", acento: "bg-blue-500",   vacio: "Sin órdenes en progreso" },
  { valor: "completado",  label: "Completado",                   titulo: "Órdenes completadas",           hoja: "Completadas", acento: "bg-green-500",  vacio: "Sin órdenes completadas" },
  { valor: "entregado",   label: "Entregado",                    titulo: "Órdenes entregadas",            hoja: "Entregadas",  acento: "bg-teal-500",   vacio: "Sin órdenes entregadas" },
  { valor: "pagada",      label: "Pagada",                       titulo: "Órdenes pagadas",               hoja: "Pagadas",     acento: "bg-gray-500",   vacio: "Sin órdenes pagadas" },
  { valor: "anulada",     label: "Anulada",                      titulo: "Órdenes anuladas",              hoja: "Anuladas",    acento: "bg-red-300",    vacio: "Sin órdenes anuladas" },
];

const diaLima = (fecha) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" }).format(new Date(fecha));

// Días hábiles (lun–vie, sin feriados) desde que se recibió la OC hasta hoy en
// Lima: los días de fabricación de la OT también son hábiles, y contar días
// calendario adelantaría el "Atrasado".
const diasDesdeRecibido = (fecha) => {
  if (!fecha) return null;
  const [y, m, d] = diaLima(fecha).split("-").map(Number);
  const [hy, hm, hd] = fechaHoyLima().split("-").map(Number);
  const fin = Date.UTC(hy, hm - 1, hd);
  let t = Date.UTC(y, m - 1, d);
  let n = 0;
  while (t < fin) {
    t += 86400000;
    const dia = new Date(t).getUTCDay();
    if (dia !== 0 && dia !== 6) n++;
  }
  return n;
};

const PLAZO = {
  enFecha:   { label: "En fecha",      clase: "bg-green-100 text-green-700" },
  cerca:     { label: "Cerca a plazo", clase: "bg-yellow-100 text-yellow-800" },
  atrasado:  { label: "Atrasado",      clase: "bg-red-100 text-red-700" },
  terminada: { label: "Terminada",     clase: "bg-gray-100 text-gray-500" },
};

// Margen restante = (días de fabricación − días desde recibida la OC) / días de
// fabricación. ≤ 0 % atrasado, < 30 % cerca a plazo, desde 30 % en fecha. Una
// OT ya completada, entregada o pagada no se evalúa.
const estadoPlazo = (ot, diasRecibido) => {
  const df = Number(ot.tiempoFabricacion);
  if (diasRecibido == null || !(df > 0)) return null;
  if (["completada", "entregada"].includes(ot.estadoGeneral) || ot.bloqueadoPorPago) return "terminada";
  const margen = ((df - diasRecibido) / df) * 100;
  if (margen <= 0) return "atrasado";
  if (margen < 30) return "cerca";
  return "enFecha";
};

function ChipPlazo({ ot, diasRecibido }) {
  const clave = estadoPlazo(ot, diasRecibido);
  if (!clave) return <span className="text-gray-300">—</span>;
  const { label, clase } = PLAZO[clave];
  return <span className={`px-2 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap ${clase}`}>{label}</span>;
}

// Rango de fechas (fecha recibida OC) del filtro — "desde"/"hasta" son fechas
// sin hora (input type=date) ancladas al día calendario de Lima (UTC-5 fijo),
// mismo criterio que el filtro de Movimientos de Almacén.
const dentroDeRangoFecha = (fecha, desde, hasta) => {
  if (!desde && !hasta) return true;
  if (!fecha) return false;
  const t = new Date(fecha).getTime();
  if (desde && t < new Date(`${desde}T00:00:00-05:00`).getTime()) return false;
  if (hasta && t > new Date(`${hasta}T23:59:59.999-05:00`).getTime()) return false;
  return true;
};

const VACIO = <span className="text-gray-300">—</span>;

function ThOrden({ clave, orden, className, title, children }) {
  const activo = orden.sortBy === clave;
  return (
    <th className={className} title={title}>
      <button
        type="button"
        onClick={() => orden.onOrdenar(clave)}
        className={`inline-flex items-center gap-1 uppercase tracking-wide font-semibold hover:text-gray-800 transition ${activo ? "text-gray-800" : ""}`}
      >
        <span>{children}</span>
        <span className={activo ? "" : "text-gray-300"}>{activo ? (orden.sortDir === "asc" ? "↑" : "↓") : "↕"}</span>
      </button>
    </th>
  );
}

// `ocPorNumDoc`: numeroDocumento → { numeroOrden, fecha } de la OC del cliente.
function TablaOTs({ titulo, acento, ordenes, onSelect, vacioMsg, ocPorNumDoc, orden }) {
  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-3">
        <span className={`w-1.5 h-5 rounded-full ${acento}`} />
        <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wide">{titulo}</h3>
        <span className="text-xs text-gray-400">({ordenes.length})</span>
      </div>
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <TablaScroll className="overflow-x-auto">
          <table className="w-full text-sm" style={{ minWidth: "1100px" }}>
            <thead className="bg-gray-50 text-xs uppercase tracking-wide border-b-2 border-gray-200">
              <tr>
                {/* w-px encoge la columna a su contenido (que es nowrap) y
                    deja el ancho sobrante a Empresa/Descripción. */}
                <th className={`${TH} text-left w-px`}>N° OT</th>
                <th className={`${TH} text-left w-px`}>N° OC</th>
                <th className={`${TH} text-center w-px`}>Estado de<br />servicio</th>
                <th className={`${TH} text-left min-w-[180px]`}>Empresa</th>
                <th className={`${TH} text-left`}>Cotizado por</th>
                <th className={`${TH} text-left min-w-[320px]`}>Descripción</th>
                <th className={`${TH} text-center w-px`}>Días de<br />fabricación</th>
                <th className={`${TH} text-left`}>Encargado de<br />Progreso</th>
                <ThOrden clave="diasRecibido" orden={orden} className={`${TH} text-center w-px`} title="Días hábiles desde la fecha recibida de la OC">Días desde<br />recibido</ThOrden>
                <ThOrden clave="fechaOC" orden={orden} className={`${TH} text-center w-px`}>Fecha<br />recibida OC</ThOrden>
                <ThOrden clave="plazo" orden={orden} className={`${TH} text-center w-px`}>Plazo</ThOrden>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {ordenes.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-4 py-8 text-center text-gray-400">{vacioMsg}</td>
                </tr>
              ) : (
                ordenes.flatMap((o) => {
                  const oc = ocPorNumDoc.get(o.numeroDocumento);
                  const dr = diasDesdeRecibido(oc?.fecha);
                  return [
                  <tr
                    key={o._id}
                    className={`hover:bg-gray-50 cursor-pointer transition-colors ${o.anulado ? "opacity-50" : ""}`}
                    onClick={() => onSelect(o)}
                  >
                    <td className="px-4 py-3.5 font-semibold text-gray-800 whitespace-nowrap">
                      {o.numeroOT || <span className="text-gray-300 font-sans">—</span>}
                    </td>
                    <td className="px-4 py-3.5 font-semibold text-gray-800 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        {oc?.numeroOrden || <span className="text-gray-300 font-sans">—</span>}
                        {o.anulado && (
                          <span title={o.motivoAnulacion} className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-red-100 text-red-600 uppercase">
                            Anulada
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-center whitespace-nowrap">
                      <ChipEstadoOT ot={o} />
                    </td>
                    <td className="px-4 py-3.5 text-gray-700">
                      {o.empresa?.razonSocial || VACIO}
                    </td>
                    <td className="px-4 py-3.5 text-gray-600">
                      {o.cotizacion?.creadoPor?.nombre || VACIO}
                    </td>
                    <td className="px-4 py-3.5 text-gray-700">{o.titulo || VACIO}</td>
                    <td className="px-4 py-3.5 text-center text-gray-600 whitespace-nowrap">
                      {o.tiempoFabricacion ?? VACIO}
                    </td>
                    <td className="px-4 py-3.5 text-gray-600">{o.encargado || VACIO}</td>
                    <td className="px-4 py-3.5 text-center text-gray-600 whitespace-nowrap">
                      {dr ?? VACIO}
                    </td>
                    <td className="px-4 py-3.5 text-center text-gray-600 whitespace-nowrap">
                      {oc?.fecha ? formatearFecha(oc.fecha) : VACIO}
                    </td>
                    <td className="px-4 py-3.5 text-center">
                      <ChipPlazo ot={o} diasRecibido={dr} />
                    </td>
                  </tr>,
                  ...(o.subOTs || []).map((s) => {
                    const ocSub = ocPorNumDoc.get(s.numeroDocumento ?? o.numeroDocumento);
                    const drSub = diasDesdeRecibido(ocSub?.fecha);
                    return (
                    <tr
                      key={s._id}
                      className={`hover:bg-gray-50 cursor-pointer transition-colors bg-indigo-50/30 ${s.anulado ? "opacity-50" : ""}`}
                      onClick={() => onSelect(s)}
                    >
                      <td className="px-4 py-3 font-semibold text-indigo-700 whitespace-nowrap pl-8">
                        ↳ {s.numeroOT}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-gray-400">
                        {ocSub?.numeroOrden || "—"}
                      </td>
                      <td className="px-4 py-3 text-center whitespace-nowrap">
                        <ChipEstadoOT ot={s} />
                      </td>
                      <td className="px-4 py-3 text-gray-700">
                        {s.empresa?.razonSocial || o.empresa?.razonSocial || VACIO}
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {s.cotizacion?.creadoPor?.nombre || o.cotizacion?.creadoPor?.nombre || VACIO}
                      </td>
                      <td className="px-4 py-3 text-gray-700">{s.titulo || VACIO}</td>
                      <td className="px-4 py-3 text-center text-gray-600 whitespace-nowrap">
                        {s.tiempoFabricacion ?? VACIO}
                      </td>
                      <td className="px-4 py-3 text-gray-600">{s.encargado || VACIO}</td>
                      <td className="px-4 py-3 text-center text-gray-600 whitespace-nowrap">
                        {drSub ?? VACIO}
                      </td>
                      <td className="px-4 py-3 text-center text-gray-600 whitespace-nowrap">
                        {ocSub?.fecha ? formatearFecha(ocSub.fecha) : VACIO}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <ChipPlazo ot={s} diasRecibido={drSub} />
                      </td>
                    </tr>
                    );
                  }),
                  ];
                })
              )}
            </tbody>
          </table>
        </TablaScroll>
      </div>
    </div>
  );
}

export default function ListaOrdenesTrabajo() {
  const [ordenes, setOrdenes] = useState([]);
  const [facturaPorNumDoc, setFacturaPorNumDoc] = useState(new Map());
  const [ocPorNumDoc, setOcPorNumDoc] = useState(new Map());
  const [filtros, setFiltros] = useState(FILTROS_VACIO);
  const [sortBy, setSortBy] = useState("numeroOT");
  // Solo aplica a las columnas con orden en el encabezado (plazo, fechaOC,
  // diasRecibido); los del select siguen siendo descendentes.
  const [sortDir, setSortDir] = useState("desc");
  const [seleccionada, setSeleccionada] = useState(null);
  const [crearOTOpen, setCrearOTOpen] = useState(false);
  const [importarOpen, setImportarOpen] = useState(false);
  // Qué tabla de las 5 categorías se muestra (No asignada/En progreso/
  // Completada/Entregada/Pagada) — un solo filtro para todos los roles,
  // desde que se simplificó a un único track "Estado de servicio"
  // (decisión del usuario, 2026-09-11 — antes técnico tenía su propio
  // filtro separado, con las tablas divididas en Prueba/Intervención).
  const [filtroEstadoPlanner, setFiltroEstadoPlanner] = useState("todos");

  const cargar = () =>
    Promise.all([
      fetchAuth("/ordenes-trabajo").then((r) => r.ok ? r.json() : []),
      (veFacturas(rolDeSesion()) ? fetchAuth("/facturas").then((r) => r.ok ? r.json() : []) : Promise.resolve([])),
      fetchAuth("/ordenes-compra").then((r) => r.ok ? r.json() : []),
    ]).then(([ots, facts, ocs]) => {
      setOrdenes(ots);
      setFacturaPorNumDoc(numerosFacturaPorCadena(facts));
      setOcPorNumDoc(new Map(
        ocs.filter((oc) => oc.numeroDocumento != null && !oc.anulado)
           .map((oc) => [oc.numeroDocumento, { numeroOrden: oc.numeroOrden, fecha: oc.fecha || oc.createdAt }])
      ));
    });

  useEffect(() => { cargar(); }, []);

  // Las sub-OTs (ordenPadre != null) no aparecen como filas propias en
  // `ordenes` — se agrupan bajo `subOTs` de su padre y TablaOTs las renderiza
  // como filas propias justo debajo de la fila padre (ver flatMap ahí).
  const padres = ordenes.filter((o) => !o.ordenPadre);
  const conSubOTsCompleto = padres.map((p) => ({
    ...p,
    subOTs: ordenes.filter((o) => (o.ordenPadre?._id || o.ordenPadre) === p._id),
  }));

  const rolActual = getUsuario()?.rol;
  const nombreActual = getUsuario()?.nombre;
  const coincideNombre = (a, b) => !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();
  // "tecnico" (legado) + los 2 roles especializados comparten la misma
  // vista de tablas (un solo track "Estado de servicio", ver TablaOTs) — lo
  // que cambia es el ALCANCE: estrictamente el rol "tecnico" ve TODAS las
  // OTs (mismo criterio que planner, a pedido explícito del usuario);
  // tecnico_prueba/tecnico_intervencion siguen viendo solo las suyas
  // (`encargado` coincidiendo con su nombre) — ver esTecnicoRestringido
  // más abajo.
  const esTecnicoRol = ["tecnico", "tecnico_prueba", "tecnico_intervencion"].includes(rolActual);
  const esTecnicoRestringido = ["tecnico_prueba", "tecnico_intervencion"].includes(rolActual);
  const esAsignado = (o) => coincideNombre(o.encargado, nombreActual);
  const conSubOTs = !esTecnicoRestringido
    ? conSubOTsCompleto
    : conSubOTsCompleto
        .map((p) => ({ ...p, subOTs: p.subOTs.filter(esAsignado) }))
        .filter((p) => esAsignado(p) || p.subOTs.length > 0);

  const empresasLista = [
    ...new Map(
      conSubOTs
        .filter((o) => o.empresa?._id)
        .map((o) => [o.empresa._id, o.empresa])
    ).values(),
  ].sort((a, b) => a.razonSocial.localeCompare(b.razonSocial));

  const plantasLista = [
    ...new Set(
      (filtros.empresa ? conSubOTs.filter((o) => o.empresa?._id === filtros.empresa) : conSubOTs)
        .map((o) => o.planta)
        .filter(Boolean)
    ),
  ].sort();

  const handleFiltro = (e) => setFiltros({ ...filtros, [e.target.name]: e.target.value });
  const handleEmpresa = (e) => setFiltros({ ...filtros, empresa: e.target.value, planta: "" });

  const filtradas = conSubOTs.filter((o) => {
    const q = filtros.busqueda.toLowerCase();
    return (
      (!filtros.empresa || o.empresa?._id === filtros.empresa) &&
      (!filtros.planta || o.planta === filtros.planta) &&
      dentroDeRangoFecha(ocPorNumDoc.get(o.numeroDocumento)?.fecha, filtros.fechaDesde, filtros.fechaHasta) &&
      (!q ||
        o.titulo?.toLowerCase().includes(q) ||
        o.numeroOT?.toLowerCase().includes(q) ||
        o.cotizacion?.numeroCotizacion?.toLowerCase().includes(q) ||
        o.cotizacion?.codigo?.toLowerCase().includes(q) ||
        ocPorNumDoc.get(o.numeroDocumento)?.numeroOrden?.toLowerCase().includes(q) ||
        facturaPorNumDoc.get(o.numeroDocumento)?.toLowerCase().includes(q) ||
        o.empresa?.razonSocial?.toLowerCase().includes(q) ||
        o.empresa?.ruc?.includes(q) ||
        o.subOTs.some((s) => s.numeroOT?.toLowerCase().includes(q) || s.titulo?.toLowerCase().includes(q)))
    );
  });

  const diasOC = (o) => diasDesdeRecibido(ocPorNumDoc.get(o.numeroDocumento)?.fecha);
  const fechaOCms = (o) => {
    const f = ocPorNumDoc.get(o.numeroDocumento)?.fecha;
    return f ? new Date(f).getTime() : null;
  };
  // Urgencia del plazo: (días desde recibido − días de fabricación) / días de
  // fabricación, mismo margen que estadoPlazo pero con signo invertido — más
  // alto = más atrasado. Las terminadas van debajo de cualquier OT en curso.
  const urgenciaPlazo = (o) => {
    const dr = diasOC(o);
    const clave = estadoPlazo(o, dr);
    if (!clave) return null;
    if (clave === "terminada") return -1e9;
    const df = Number(o.tiempoFabricacion);
    return (dr - df) / df;
  };

  const ordenarPorColumna = (clave) => {
    if (sortBy === clave) {
      setSortDir(sortDir === "desc" ? "asc" : "desc");
    } else {
      setSortBy(clave);
      setSortDir("desc");
    }
  };
  const orden = { sortBy, sortDir, onOrdenar: ordenarPorColumna };

  filtradas.sort((a, b) => {
    if (sortBy === "numeroOT") return compararTexto(a.numeroOT, b.numeroOT);
    if (sortBy === "numeroOC") return compararTexto(ocPorNumDoc.get(a.numeroDocumento)?.numeroOrden, ocPorNumDoc.get(b.numeroDocumento)?.numeroOrden);
    if (sortBy === "diasRecibido") return compararNum(diasOC(a), diasOC(b), sortDir);
    if (sortBy === "fechaOC") return compararNum(fechaOCms(a), fechaOCms(b), sortDir);
    if (sortBy === "plazo") return compararNum(urgenciaPlazo(a), urgenciaPlazo(b), sortDir);
    return new Date(b.createdAt) - new Date(a.createdAt);
  });

  // "Pagada" manda por encima del `estado` propio de la OT — es la bandeja de
  // archivado final, sin importar en qué estado de trabajo se haya quedado.
  // `bloqueadoPorPago` lo calcula el backend: cotización de la OT (o de su
  // padre) pagada, o cadena cerrada en lo histórico sin OC por partidas
  // (FP-19). Mientras no lo esté, la OT vive en la tabla que corresponde a su
  // `estado` actual (el mismo valor que arma el filtro "Todo estado" de
  // arriba).
  const esPagada = (o) => !!o.bloqueadoPorPago;
  const abiertas = filtradas.filter((o) => !esPagada(o));

  // Filtra por el mismo valor que pinta la columna "Estado de servicio"
  // (estadoProgresoOT), no por `estadoGeneral`: así lo que se elige en el
  // select es exactamente lo que se ve en el chip. Una OT padre entra si ella
  // o alguna de sus sub-OTs tiene ese estado, mostrando solo las sub-OTs que
  // coinciden. Las anuladas solo salen en "Todas" y "Anuladas".
  const vigentes = abiertas.filter((o) => !o.anulado);
  const porEstado = (estado) => vigentes.flatMap((o) => {
    const subs = (o.subOTs || []).filter((s) => !s.anulado && progresoLabel(s) === estado);
    return progresoLabel(o) === estado || subs.length ? [{ ...o, subOTs: subs }] : [];
  });
  const pagadas = filtradas.filter((o) => esPagada(o) && !o.anulado);
  const anuladas = filtradas.filter((o) => o.anulado);

  const ordenesFiltroEstado = (valor) =>
    valor === "todos" ? filtradas
      : valor === "pagada" ? pagadas
      : valor === "anulada" ? anuladas
      : porEstado(valor);
  const filtroActual = FILTROS_ESTADO.find((f) => f.valor === filtroEstadoPlanner) || FILTROS_ESTADO[0];

  const hayFiltro = Object.values(filtros).some(Boolean);
  // Mismas columnas que TablaOTs (ver el nuevo orden ahí) — una hoja por
  // cada tabla visible.
  const filaOT = (o) => ({
    "N° OT":          o.numeroOT || "—",
    "Sub-OTs":        o.subOTs?.map((s) => s.numeroOT).join(", ") || "—",
    "N° OC":          ocPorNumDoc.get(o.numeroDocumento)?.numeroOrden || "—",
    "Estado de servicio": progresoLabel(o) || "—",
    "Empresa":        o.empresa?.razonSocial || "—",
    "Cotizado por":   o.cotizacion?.creadoPor?.nombre || "—",
    "Descripción":    o.titulo || "—",
    "Días de fabricación":   o.tiempoFabricacion ?? "—",
    "Encargado de Progreso": o.encargado || "—",
    "Días desde recibido":   diasOC(o) ?? "—",
    "Fecha recibida OC":     ocPorNumDoc.get(o.numeroDocumento)?.fecha ? formatearFecha(ocPorNumDoc.get(o.numeroDocumento).fecha) : "—",
    "Plazo":                 PLAZO[estadoPlazo(o, diasOC(o))]?.label || "—",
  });

  const exportarExcel = () => {
    const wb = XLSX.utils.book_new();
    FILTROS_ESTADO.filter((f) => f.valor !== "todos").forEach((f) => {
      const ws = XLSX.utils.json_to_sheet(ordenesFiltroEstado(f.valor).map(filaOT));
      XLSX.utils.book_append_sheet(wb, ws, f.hoja);
    });
    XLSX.writeFile(wb, "ordenes-de-trabajo.xlsx");
  };

  return (
    <>
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-xl font-semibold text-gray-800">Órdenes de Trabajo</h2>
          <span className="text-sm text-gray-400">{filtradas.length} orden{filtradas.length !== 1 ? "es" : ""}</span>
        </div>
        <div className="flex gap-2">
          <button
            onClick={exportarExcel}
            className="border border-gray-300 text-gray-600 px-4 py-2 rounded-lg text-sm hover:bg-gray-50 transition"
          >
            Exportar Excel
          </button>
          {rolActual === "admin" && (
            <button
              onClick={() => setImportarOpen(true)}
              className="border border-gray-300 text-gray-600 px-4 py-2 rounded-lg text-sm hover:bg-gray-50 transition"
            >
              Importar OTs
            </button>
          )}
          {!esTecnicoRol && (
            <button
              onClick={() => setCrearOTOpen(true)}
              className="bg-gray-900 text-white px-4 py-2 rounded-lg text-sm hover:bg-gray-700 transition"
            >
              + Crear Orden de Trabajo
            </button>
          )}
        </div>
      </div>

      {/* Filtros — orden: Ordenar, Estado, Empresa (+ Planta), búsqueda */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 mb-5 flex flex-wrap gap-3 items-center">

        <select value={sortBy} onChange={(e) => { setSortBy(e.target.value); setSortDir("desc"); }} className={SELECT}>
          {SORTS.map(({ valor, label }) => (
            <option key={valor} value={valor}>Ordenar: {label}</option>
          ))}
        </select>

        <select value={filtroEstadoPlanner} onChange={(e) => setFiltroEstadoPlanner(e.target.value)} className={SELECT}>
          {FILTROS_ESTADO.map((f) => (
            <option key={f.valor} value={f.valor}>{f.label}</option>
          ))}
        </select>

        <select name="empresa" value={filtros.empresa} onChange={handleEmpresa} className={SELECT}>
          <option value="">Toda empresa</option>
          {empresasLista.map((e) => (
            <option key={e._id} value={e._id}>
              {e.alias ? `${e.alias} — ` : ""}{e.razonSocial}
            </option>
          ))}
        </select>

        {plantasLista.length > 0 && (
          <select name="planta" value={filtros.planta} onChange={handleFiltro} className={SELECT}>
            <option value="">Toda planta</option>
            {plantasLista.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        )}

        <input
          name="busqueda"
          value={filtros.busqueda}
          onChange={handleFiltro}
          placeholder="Buscar por N° OT, cotización, OC, factura, título, empresa o RUC…"
          className={`${SELECT} flex-1 min-w-52`}
        />

        <div className="flex items-center gap-1.5">
          <input type="date" name="fechaDesde" value={filtros.fechaDesde} onChange={handleFiltro}
            className={SELECT} title="Fecha recibida OC desde" />
          <span className="text-gray-400 text-xs">a</span>
          <input type="date" name="fechaHasta" value={filtros.fechaHasta} onChange={handleFiltro}
            className={SELECT} title="Fecha recibida OC hasta" />
        </div>

        {/* Botón dedicado (a pedido del usuario) — planner/coordinadora/
            asistente comparten esta misma vista de OTs, y las 3 lo usan para
            priorizar por antigüedad en todas las tablas de un solo click. */}
        <button
          type="button"
          onClick={() => {
            const activo = sortBy === "diasRecibido" && sortDir === "desc";
            setSortBy(activo ? "fecha" : "diasRecibido");
            setSortDir("desc");
          }}
          className={`px-3 py-2 rounded-lg text-sm font-medium transition whitespace-nowrap ${
            sortBy === "diasRecibido" && sortDir === "desc"
              ? "bg-gray-900 text-white"
              : "border border-gray-300 text-gray-600 hover:bg-gray-50"
          }`}
        >
          Días desde recibido ↓
        </button>

        {Object.values(filtros).some(Boolean) && (
          <button
            onClick={() => setFiltros(FILTROS_VACIO)}
            className="text-sm text-gray-400 hover:text-gray-700 transition"
          >
            Limpiar
          </button>
        )}
      </div>

      <TablaOTs ocPorNumDoc={ocPorNumDoc} orden={orden}
        titulo={filtroActual.titulo}
        acento={filtroActual.acento}
        ordenes={ordenesFiltroEstado(filtroActual.valor)}
        onSelect={setSeleccionada}
        vacioMsg={hayFiltro ? "Sin resultados para los filtros aplicados" : filtroActual.vacio}
      />
    </div>

    {seleccionada && (
      <DetalleDocumento
        tipo="ot"
        data={seleccionada}
        onClose={() => { setSeleccionada(null); cargar(); }}
        onGuardadaOT={(actualizada) => {
          setOrdenes((prev) =>
            prev.map((o) => (o._id === actualizada._id ? actualizada : o))
          );
        }}
      />
    )}

    {crearOTOpen && (
      <ModalNuevaOT
        onClose={() => setCrearOTOpen(false)}
        onCreada={() => { setCrearOTOpen(false); cargar(); }}
      />
    )}

    {importarOpen && (
      <ModalImportarExcel
        tipo="Órdenes de Trabajo"
        columnas={COLS_OT}
        endpoint="/ordenes-trabajo/importar"
        color="blue"
        nombreColeccion="todas las Órdenes de Trabajo"
        instrucciones={
          <>1. Descarga la plantilla, rellena tus datos y súbela. La <strong>Empresa</strong> se busca por
          <strong>RUC</strong> (11 dígitos); si no existe, se crea sola con la razón social en blanco (edítala
          después desde Empresas para completarla vía SUNAT). <strong>Estado de la orden</strong>: No asignado, En proceso,
          Terminado o Entregado — sin un técnico asignado, la OT se sigue viendo como "No asignado" en las tablas
          hasta que alguien lo asigne a mano.</>
        }
        onClose={() => setImportarOpen(false)}
        onImportado={cargar}
      />
    )}
    </>
  );
}
