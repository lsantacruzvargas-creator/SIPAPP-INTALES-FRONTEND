import { useState, useEffect } from "react";
import { fetchAuth, getUsuario } from "../utils/fetchAuth";
import { formatearFecha } from "../utils/fecha";
import DetalleDocumento from "../components/DetalleDocumento";
import ModalNuevaOT from "../components/ModalNuevaOT";
import ModalImportarExcel, { COLS_OT } from "../components/ModalImportarExcel";
import TablaScroll from "../components/TablaScroll";
import { DotChip, badgeOT, dotOT, badgeGeneral, dotGeneral } from "../components/detalleShared";
import * as XLSX from "xlsx";

const FILTROS_VACIO = { empresa: "", planta: "", busqueda: "", fechaDesde: "", fechaHasta: "" };

const SORTS = [
  { valor: "fecha",             label: "Más reciente" },
  { valor: "numeroOT",          label: "N° OT" },
  { valor: "numeroCotizacion",  label: "N° Cotización" },
];

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

// Si nadie está asignado, `estado` se queda en el default "pendiente" del
// modelo — visualmente eso confunde con "ya asignado pero sin empezar", así
// que en la tabla se muestra "No asignado". Hasta 2026-09-11 existían dos
// columnas/tracks independientes (Prueba/Intervención) — se simplificaron a
// una sola "Estado de Progreso" (decisión del usuario, ver DetalleOrdenTrabajo.jsx).
const progresoLabel = (o) => (o.encargado?.trim() ? o.estado : "No asignado");

// Una sub-OT nace con la misma `cotizacion` que su padre, pero /vincular-cotizacion
// (ver DetalleOrdenTrabajo/DetalleCotizacion) permite "jalarla" luego a otra
// cotización distinta — eso la saca de la cadena de su padre. Se detecta
// comparando el _id de cotización de cada una (no el numeroCotizacion, que
// podría repetirse).
const cotizacionReasignada = (sub, padre) => {
  const idSub = sub.cotizacion?._id;
  const idPadre = padre.cotizacion?._id;
  return Boolean(idSub || idPadre) && idSub !== idPadre;
};

// Días transcurridos desde el ingreso del equipo (fechaRecibida) — las
// sub-OTs no tienen su propia fechaRecibida (comparten el ingreso de la OT
// padre), así que reciben la del padre como fallback.
const diasDesdeRecibido = (fecha) => {
  if (!fecha) return null;
  const ms = Date.now() - new Date(fecha).getTime();
  return Math.max(0, Math.floor(ms / 86400000));
};

// Rango de fechas (Fecha de Ingreso) del filtro — "desde"/"hasta" son fechas
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

function TablaOTs({ titulo, acento, ordenes, onSelect, vacioMsg }) {
  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-3">
        <span className={`w-1.5 h-5 rounded-full ${acento}`} />
        <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wide">{titulo}</h3>
        <span className="text-xs text-gray-400">({ordenes.length})</span>
      </div>
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <TablaScroll className="overflow-x-auto">
          <table className="w-full text-sm" style={{ minWidth: "1000px" }}>
            <thead className="bg-gray-50 text-xs uppercase tracking-wide border-b-2 border-gray-200">
              <tr>
                <th className={`${TH} text-left`}>N° OT</th>
                <th className={`${TH} text-left`}>N° Cotización</th>
                <th className={`${TH} text-center`}>Servicio</th>
                <th className={`${TH} text-left`}>Empresa</th>
                <th className={`${TH} text-left`}>Contacto</th>
                <th className={`${TH} text-left`}>Descripción</th>
                <th className={`${TH} text-center`}>Estado de Progreso</th>
                <th className={`${TH} text-left`}>Encargado de Progreso</th>
                <th className={`${TH} text-center`}>Días desde recibido</th>
                <th className={`${TH} text-center`}>Fecha de Ingreso</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {ordenes.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-gray-400">{vacioMsg}</td>
                </tr>
              ) : (
                ordenes.flatMap((o) => [
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
                        {o.cotizacion?.numeroCotizacion || o.cotizacion?.codigo || <span className="text-gray-300 font-sans">—</span>}
                        {o.anulado && (
                          <span title={o.motivoAnulacion} className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-red-100 text-red-600 uppercase">
                            Anulada
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-center">
                      <DotChip chip={badgeGeneral(o.estadoGeneral)} dot={dotGeneral(o.estadoGeneral)}>{o.estadoGeneral}</DotChip>
                    </td>
                    <td className="px-4 py-3.5 text-gray-700">
                      {o.empresa?.razonSocial || <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3.5 text-gray-600">
                      {o.personaContacto || o.contactoNombre || <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3.5 text-gray-700">{o.titulo || <span className="text-gray-300">—</span>}</td>
                    <td className="px-4 py-3.5 text-center">
                      <DotChip chip={badgeOT(progresoLabel(o))} dot={dotOT(progresoLabel(o))}>{progresoLabel(o)}</DotChip>
                    </td>
                    <td className="px-4 py-3.5 text-gray-600">{o.encargado || <span className="text-gray-300">—</span>}</td>
                    <td className="px-4 py-3.5 text-center text-gray-600 whitespace-nowrap">
                      {diasDesdeRecibido(o.fechaRecibida) ?? <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3.5 text-center text-gray-600 whitespace-nowrap">
                      {o.fechaRecibida ? formatearFecha(o.fechaRecibida) : <span className="text-gray-300">—</span>}
                    </td>
                  </tr>,
                  ...(o.subOTs || []).map((s) => (
                    <tr
                      key={s._id}
                      className={`hover:bg-gray-50 cursor-pointer transition-colors bg-indigo-50/30 ${s.anulado ? "opacity-50" : ""}`}
                      onClick={() => onSelect(s)}
                    >
                      <td className="px-4 py-3 font-semibold text-indigo-700 whitespace-nowrap pl-8">
                        ↳ {s.numeroOT}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {cotizacionReasignada(s, o) ? (
                          <span
                            className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 uppercase tracking-wide"
                            title={`Reasignada — la OT padre (${o.numeroOT}) pertenece a la cotización ${o.cotizacion?.numeroCotizacion || o.cotizacion?.codigo || "—"}`}
                          >
                            {s.cotizacion?.numeroCotizacion || s.cotizacion?.codigo || "—"} ⇄
                          </span>
                        ) : (
                          <span className="text-gray-400">{s.cotizacion?.numeroCotizacion || s.cotizacion?.codigo || "—"}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <DotChip chip={badgeGeneral(s.estadoGeneral)} dot={dotGeneral(s.estadoGeneral)}>{s.estadoGeneral}</DotChip>
                      </td>
                      <td className="px-4 py-3 text-gray-700">
                        {s.empresa?.razonSocial || o.empresa?.razonSocial || <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {s.personaContacto || s.contactoNombre || o.personaContacto || o.contactoNombre || <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-gray-700">{s.titulo || <span className="text-gray-300">—</span>}</td>
                      <td className="px-4 py-3 text-center">
                        <DotChip chip={badgeOT(progresoLabel(s))} dot={dotOT(progresoLabel(s))}>{progresoLabel(s)}</DotChip>
                      </td>
                      <td className="px-4 py-3 text-gray-600">{s.encargado || <span className="text-gray-300">—</span>}</td>
                      <td className="px-4 py-3 text-center text-gray-600 whitespace-nowrap">
                        {diasDesdeRecibido(s.fechaRecibida ?? o.fechaRecibida) ?? <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-center text-gray-600 whitespace-nowrap">
                        {(s.fechaRecibida ?? o.fechaRecibida) ? formatearFecha(s.fechaRecibida ?? o.fechaRecibida) : <span className="text-gray-300">—</span>}
                      </td>
                    </tr>
                  )),
                ])
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
  const [seleccionada, setSeleccionada] = useState(null);
  const [crearOTOpen, setCrearOTOpen] = useState(false);
  const [importarOpen, setImportarOpen] = useState(false);
  // Qué tabla de las 5 categorías se muestra (No asignada/En progreso/
  // Completada/Entregada/Cerrada) — un solo filtro para todos los roles,
  // desde que se simplificó a un único track "Estado de Progreso"
  // (decisión del usuario, 2026-09-11 — antes técnico tenía su propio
  // filtro separado, con las tablas divididas en Prueba/Intervención).
  const [filtroEstadoPlanner, setFiltroEstadoPlanner] = useState("todos");

  const cargar = () =>
    Promise.all([
      fetchAuth("/ordenes-trabajo").then((r) => r.ok ? r.json() : []),
      fetchAuth("/facturas").then((r) => r.ok ? r.json() : []),
      fetchAuth("/ordenes-compra").then((r) => r.ok ? r.json() : []),
    ]).then(([ots, facts, ocs]) => {
      setOrdenes(ots);
      // Una OT está "facturada" si su cadena (mismo numeroDocumento) tiene una
      // factura con número de factura.
      setFacturaPorNumDoc(new Map(
        facts.filter((f) => f.numeroFactura && f.numeroDocumento != null)
             .map((f) => [f.numeroDocumento, f.numeroFactura])
      ));
      setOcPorNumDoc(new Map(
        ocs.filter((oc) => oc.numeroDocumento != null)
           .map((oc) => [oc.numeroDocumento, oc.numeroOrden])
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
  // vista de tablas (un solo track "Estado de Progreso", ver TablaOTs) — lo
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
      dentroDeRangoFecha(o.fechaRecibida, filtros.fechaDesde, filtros.fechaHasta) &&
      (!q ||
        o.titulo?.toLowerCase().includes(q) ||
        o.numeroOT?.toLowerCase().includes(q) ||
        o.cotizacion?.numeroCotizacion?.toLowerCase().includes(q) ||
        o.cotizacion?.codigo?.toLowerCase().includes(q) ||
        ocPorNumDoc.get(o.numeroDocumento)?.toLowerCase().includes(q) ||
        facturaPorNumDoc.get(o.numeroDocumento)?.toLowerCase().includes(q) ||
        o.empresa?.razonSocial?.toLowerCase().includes(q) ||
        o.empresa?.ruc?.includes(q) ||
        o.subOTs.some((s) => s.numeroOT?.toLowerCase().includes(q) || s.titulo?.toLowerCase().includes(q)))
    );
  });

  filtradas.sort((a, b) => {
    if (sortBy === "numeroOT") return compararTexto(a.numeroOT, b.numeroOT);
    if (sortBy === "numeroCotizacion") return compararTexto(a.cotizacion?.numeroCotizacion || a.cotizacion?.codigo, b.cotizacion?.numeroCotizacion || b.cotizacion?.codigo);
    // Descendente: más días esperando primero — sin fechaRecibida (null) va
    // al final, igual que un valor "menor" a cualquier día real (>= 0).
    if (sortBy === "diasRecibido") return (diasDesdeRecibido(b.fechaRecibida) ?? -1) - (diasDesdeRecibido(a.fechaRecibida) ?? -1);
    return new Date(b.createdAt) - new Date(a.createdAt);
  });

  // "Cerrada" (cadena cerrada, ver cerrarCadena) manda por encima del `estado`
  // propio de la OT — es la bandeja de archivado final, sin importar en qué
  // estado de trabajo se haya quedado. Mientras la cadena sigue abierta, la
  // OT vive en la tabla que corresponde a su `estado` actual (el mismo valor
  // que arma el filtro "Todo estado" de arriba) — así una OT que pasa a
  // "completado" se mueve sola a la tabla de Completadas sin quedarse
  // mezclada con las pendientes.
  const esCerrada = (o) => o.estadoCadena === "cerrado";
  const abiertas = filtradas.filter((o) => !esCerrada(o));

  // "No asignado" (estadoGeneral, ver Backend/src/utils/estadoGeneralOT.js)
  // — mismo criterio de duplicar por sub-OT: la OT padre puede tener técnico
  // asignado mientras una sub-OT suya sigue sin nadie (o al revés).
  const noAsignadas = [];
  abiertas.forEach((o) => {
    const subsSinAsignar = (o.subOTs || []).filter((s) => s.estadoGeneral === "no asignado");
    if (o.estadoGeneral === "no asignado" || subsSinAsignar.length) {
      noAsignadas.push({ ...o, subOTs: subsSinAsignar });
    }
  });

  const cerradas = filtradas.filter((o) => esCerrada(o));

  // Un solo set de 4 grupos, para todos los roles — agrupa directo por
  // `estadoGeneral` (calculado y persistido en el backend, ver
  // estadoGeneralOT.js). Un solo cálculo, una sola fuente de verdad.
  const asignadasPlanner = abiertas.filter((o) => o.encargado?.trim());
  const plannerEntregadas  = asignadasPlanner.filter((o) => o.estadoGeneral === "entregada");
  const plannerCompletadas = asignadasPlanner.filter((o) => o.estadoGeneral === "completada");
  const plannerEnProgreso  = asignadasPlanner.filter((o) => o.estadoGeneral === "pendiente" || o.estadoGeneral === "en progreso");

  // Tabla "Todas las Órdenes de Trabajo": una sola lista global (sin separar
  // por track ni por asignación) sobre la que responde el filtro de Estado —
  // misma categorización que las 5 tablas de la vista simplificada, para que
  // "Todo estado" muestre exactamente la unión de esas 5.
  const categoriaGlobal = (o) => {
    if (esCerrada(o)) return "cerrada";
    if (o.estadoGeneral === "no asignado") return "noAsignada";
    if (o.estadoGeneral === "completada") return "completada";
    if (o.estadoGeneral === "entregada") return "entregada";
    return "enProgreso";
  };
  const todasOTs = filtradas.filter(
    (o) => filtroEstadoPlanner === "todos" || categoriaGlobal(o) === filtroEstadoPlanner
  );

  const hayFiltro = Object.values(filtros).some(Boolean);
  // Con qué categoría se queda la vista — "todos" no filtra nada (todas las
  // tablas se muestran).
  const mostrarPlanner = (clave) => filtroEstadoPlanner === "todos" || filtroEstadoPlanner === clave;

  // Mismas columnas que TablaOTs (ver el nuevo orden ahí) — una hoja por
  // cada tabla visible.
  const filaOT = (o) => ({
    "N° OT":          o.numeroOT || "—",
    "Sub-OTs":        o.subOTs?.map((s) => s.numeroOT).join(", ") || "—",
    "N° Cotización":  o.cotizacion?.numeroCotizacion || o.cotizacion?.codigo || "—",
    "Servicio":       o.estadoGeneral || "—",
    "Empresa":        o.empresa?.razonSocial || "—",
    "Contacto":       o.personaContacto || o.contactoNombre || "—",
    "Descripción":    o.titulo || "—",
    "Estado de Progreso":    o.estado || "—",
    "Encargado de Progreso": o.encargado || "—",
    "Días desde recibido":   diasDesdeRecibido(o.fechaRecibida) ?? "—",
    "Fecha de Ingreso":      o.fechaRecibida ? formatearFecha(o.fechaRecibida) : "—",
  });

  const exportarExcel = () => {
    const wb = XLSX.utils.book_new();
    [
      ["Sin asignar", noAsignadas],
      ["En progreso", plannerEnProgreso],
      ["Completadas", plannerCompletadas],
      ["Entregadas", plannerEntregadas],
      ["Cerradas", cerradas],
    ].forEach(([nombre, lista]) => {
      const ws = XLSX.utils.json_to_sheet(lista.map(filaOT));
      XLSX.utils.book_append_sheet(wb, ws, nombre);
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

        <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className={SELECT}>
          {SORTS.map(({ valor, label }) => (
            <option key={valor} value={valor}>Ordenar: {label}</option>
          ))}
        </select>

        <select value={filtroEstadoPlanner} onChange={(e) => setFiltroEstadoPlanner(e.target.value)} className={SELECT}>
          <option value="todos">Todo estado</option>
          <option value="noAsignada">No asignada</option>
          <option value="enProgreso">En progreso</option>
          <option value="completada">Completada</option>
          <option value="entregada">Entregada</option>
          <option value="cerrada">Cerrada</option>
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
            className={SELECT} title="Fecha de ingreso desde" />
          <span className="text-gray-400 text-xs">a</span>
          <input type="date" name="fechaHasta" value={filtros.fechaHasta} onChange={handleFiltro}
            className={SELECT} title="Fecha de ingreso hasta" />
        </div>

        {/* Botón dedicado (a pedido del usuario) — planner/coordinadora/
            asistente comparten esta misma vista de OTs, y las 3 lo usan para
            priorizar por antigüedad en todas las tablas de un solo click. */}
        <button
          type="button"
          onClick={() => setSortBy(sortBy === "diasRecibido" ? "fecha" : "diasRecibido")}
          className={`px-3 py-2 rounded-lg text-sm font-medium transition whitespace-nowrap ${
            sortBy === "diasRecibido"
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

      <>
          {/* Vista global: todas las OTs juntas (sin separar por asignación),
              respondiendo al mismo filtro de Estado de arriba — "Todo
              estado" muestra la unión exacta de las 5 tablas de abajo. */}
          <TablaOTs
            titulo="Todas las Órdenes de Trabajo"
            acento="bg-indigo-500"
            ordenes={todasOTs}
            onSelect={setSeleccionada}
            vacioMsg={hayFiltro || filtroEstadoPlanner !== "todos" ? "Sin resultados para los filtros aplicados" : "Sin órdenes de trabajo"}
          />

          {mostrarPlanner("noAsignada") && (
            <TablaOTs
              titulo="Órdenes no asignadas"
              acento="bg-red-500"
              ordenes={noAsignadas}
              onSelect={setSeleccionada}
              vacioMsg={hayFiltro ? "Sin resultados para los filtros aplicados" : "Sin órdenes por asignar"}
            />
          )}

          {mostrarPlanner("enProgreso") && (
            <TablaOTs
              titulo="Órdenes en progreso"
              acento="bg-blue-500"
              ordenes={plannerEnProgreso}
              onSelect={setSeleccionada}
              vacioMsg={hayFiltro ? "Sin resultados para los filtros aplicados" : "Sin órdenes en progreso"}
            />
          )}

          {mostrarPlanner("completada") && (
            <TablaOTs
              titulo="Órdenes completadas"
              acento="bg-green-500"
              ordenes={plannerCompletadas}
              onSelect={setSeleccionada}
              vacioMsg={hayFiltro ? "Sin resultados para los filtros aplicados" : "Sin órdenes completadas"}
            />
          )}

          {mostrarPlanner("entregada") && (
            <TablaOTs
              titulo="Órdenes entregadas"
              acento="bg-teal-500"
              ordenes={plannerEntregadas}
              onSelect={setSeleccionada}
              vacioMsg={hayFiltro ? "Sin resultados para los filtros aplicados" : "Sin órdenes entregadas"}
            />
          )}
        </>

      {mostrarPlanner("cerrada") && (
        <TablaOTs
          titulo="Órdenes cerradas"
          acento="bg-gray-500"
          ordenes={cerradas}
          onSelect={setSeleccionada}
          vacioMsg={hayFiltro ? "Sin resultados para los filtros aplicados" : "Sin órdenes cerradas"}
        />
      )}
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
