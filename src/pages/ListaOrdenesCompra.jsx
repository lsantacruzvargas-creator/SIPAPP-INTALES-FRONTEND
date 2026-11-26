import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { fetchAuth, uploadAuth, abrirArchivoProtegido, getUsuario } from "../utils/fetchAuth";
import { formatearFecha, anioLima, mesLima } from "../utils/fecha";
import DetalleDocumento from "../components/DetalleDocumento";
import ModalCrearOrdenCompra   from "../components/ModalCrearOrdenCompra";
import ModalImportarExcel, { COLS_OC, COLS_CADENA } from "../components/ModalImportarExcel";
import { Chip, ChipEstadoOT, CeldaFacturaPartida, estadoProgresoOT, ESTADOS_PROGRESO_OT } from "../components/detalleShared";
import TablaScroll from "../components/TablaScroll";
import * as XLSX from "xlsx";
import AvisoAccion from "../components/AvisoAccion";
import { conBloqueo } from "../utils/bloqueoApi";
import { veFacturas } from "../utils/roles";
import { bloqueadoPorPago } from "../utils/bloqueoPago";
import { idDe } from "../utils/cotizacionItems";
import { estadoDePartida, partidasFacturadas, numerosFacturaDe } from "../utils/facturacionOC";

const ESTADOS_OT = ["", ...ESTADOS_PROGRESO_OT];
const MESES = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
const TH = "px-4 py-3 font-semibold text-gray-500 whitespace-nowrap";

// Una tabla por estado de facturación (estadoFacturacion.estado, derivado en el backend).
const TABLAS_ESTADO = [
  { estado: "sin facturar",      label: "Sin facturar",      titulo: "Órdenes de Compra sin facturar",             acento: "bg-amber-500",   vacio: "Sin órdenes de compra sin facturar" },
  { estado: "facturada parcial", label: "Facturada parcial", titulo: "Órdenes de Compra facturadas parcialmente", acento: "bg-sky-500",     vacio: "Sin órdenes de compra facturadas parcialmente" },
  { estado: "facturada",         label: "Facturada",         titulo: "Órdenes de Compra facturadas",              acento: "bg-emerald-500", vacio: "Sin órdenes de compra facturadas" },
  { estado: "pagada",            label: "Pagada",            titulo: "Órdenes de Compra pagadas",                 acento: "bg-gray-500",    vacio: "Sin órdenes de compra pagadas" },
];

// "Todas las Órdenes de Compra" (tabla única, sin categorizar por estado) es
// la vista por defecto al abrir la página — mismo patrón pedido para
// Cotizaciones (ver ListaCotizaciones.jsx).
const VISTAS = [
  { valor: "todasLasOC", label: "Todas las Órdenes de Compra" },
  ...TABLAS_ESTADO.map(({ estado, label }) => ({ valor: estado, label })),
];

const BADGE_FACTURACION = {
  "sin facturar":      "bg-gray-100 text-gray-500",
  "facturada parcial": "bg-sky-100 text-sky-700",
  "facturada":         "bg-blue-100 text-blue-700",
  "pagada":            "bg-green-100 text-green-700",
};

const SELECCION_VACIA = { ocId: null, partidas: [] };

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

// La OC hereda `moneda` de su cotización de origen (ver pre("save") en
// OrdenCompra.js) — antes no tenía moneda propia y se trataba siempre como
// Soles, así que una OC creada en dólares mostraba mal la columna US$ (el
// monto ya en dólares se volvía a dividir por el Tipo de Cambio). El Tipo
// de Cambio compartido solo se usa para completar la columna que NO
// coincide con la moneda real del monto.
const totalesDuales = (monto, moneda, tipoCambio) => {
  const m = Number(monto) || 0;
  const tc = Number(tipoCambio) || 0;
  if (moneda === "USD") {
    return { pen: tc > 0 ? m * tc : null, usd: m };
  }
  return { pen: m, usd: tc > 0 ? m / tc : null };
};

const numeroOTDe = (ot) => ot.numeroOT || ot.codigo;
const numeroCotDe = (cot) => cot?.numeroCotizacion || cot?.codigo;

// OTs padre de cada cotización (mismo criterio que la tabla de partidas de DetalleOrdenCompra.jsx) y
// sub-OTs de cada OT padre: cada partida muestra los estados de sus propias OTs.
const indexarOTs = (ots) => {
  const porCot = {};
  const subs = {};
  ots.forEach((ot) => {
    if (ot.ordenPadre) {
      (subs[idDe(ot.ordenPadre)] ||= []).push(ot);
      return;
    }
    const cotId = idDe(ot.cotizacion);
    if (cotId) (porCot[cotId] ||= []).push(ot);
  });
  return { porCot, subs };
};

// Con varias OTs en una partida, cada estado se lista con su N° OT en vez de agregarse.
const textoPorOT = (ots, valor, vacio) => {
  if (!ots.length) return vacio;
  if (ots.length === 1) return valor(ots[0]) || vacio;
  return ots.map((ot) => `${numeroOTDe(ot)}: ${valor(ot) || vacio}`).join(", ");
};

const celdaMonto = (v) => (v != null ? v.toLocaleString("es-PE", { minimumFractionDigits: 2 }) : "—");

function PillSiNo({ si }) {
  return (
    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full uppercase tracking-wide whitespace-nowrap ${si ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
      {si ? "SI" : "NO"}
    </span>
  );
}

function ChipGRE({ gre }) {
  return gre ? (
    <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 whitespace-nowrap">GRE {gre}</span>
  ) : <span className="text-gray-300 text-xs">Sin GRE</span>;
}

// Un chip por OT de la partida (con su N° OT si hay varias), sin agregar estados.
function EstadosPorOT({ ots, render, vacio }) {
  if (!ots.length) return <span className="text-gray-300 text-xs">{vacio}</span>;
  return (
    <div className="flex flex-col items-center gap-1">
      {ots.map((ot) => (
        <span key={ot._id} title={`OT ${numeroOTDe(ot)}`} className="inline-flex items-center gap-1.5 whitespace-nowrap">
          {ots.length > 1 && <span className="font-mono text-[10px] text-gray-400">{numeroOTDe(ot)}</span>}
          {render(ot)}
        </span>
      ))}
    </div>
  );
}

// Casilla de la OC con varias partidas: marca o desmarca todas sus partidas sin facturar.
function CheckOC({ marcadas, total, disabled, title, onChange, label }) {
  return (
    <input type="checkbox" aria-label={label} title={title}
      ref={(el) => { if (el) el.indeterminate = marcadas > 0 && marcadas < total; }}
      checked={total > 0 && marcadas === total} disabled={disabled} onChange={onChange}
      className="w-4 h-4 disabled:cursor-not-allowed" />
  );
}

function TablaOC({
  titulo, acento, ordenes, otGroupMap, otsCot, subsOT, greMap, tipoCambio, onSelect, subirDocumento,
  mostrarFactura = true, mostrarTitulo = true, mostrarDocumento = true, mostrarHesActa = false,
  puedeVerPrecios = true, puedeSubirDocumento, vacioMsg,
  seleccionablesDe, seleccion, onTogglePartida, onToggleOC, colapsadas, onToggleExpandir,
}) {
  const hayCheck = ordenes.some((o) => seleccionablesDe(o).length > 0);
  // Sin columna Título de la OC (vista Sin facturar), el título de cada partida tiene su propia columna.
  const columnaTitulo = mostrarTitulo || ordenes.some((o) => o.partidas?.length);
  const totalColumnas = 9
    + (hayCheck ? 1 : 0)
    + (puedeVerPrecios ? 2 : 0)
    + (mostrarFactura ? 1 : 0) + (columnaTitulo ? 1 : 0)
    + (mostrarHesActa ? 2 : 0) + (mostrarDocumento ? 1 : 0);
  const colsFinales = (mostrarHesActa ? 2 : 0) + (mostrarDocumento ? 1 : 0);
  const vacias = (n, prefijo) => Array.from({ length: n }, (_, i) => <td key={`${prefijo}${i}`} className="px-4 py-3" />);

  const filaSub = (o, s, key) => (
    <tr key={key}
      className={`hover:bg-gray-50 cursor-pointer transition-colors bg-indigo-50/30 ${s.anulado ? "opacity-50" : ""}`}
      onClick={() => onSelect(o)}>
      <td className="py-3" />
      {hayCheck && <td className="py-3" />}
      <td className="px-4 py-3" />
      <td className="px-4 py-3 font-semibold text-indigo-700 whitespace-nowrap pl-8">↳ {s.numeroOT}</td>
      {vacias(4 + (mostrarFactura ? 1 : 0) + (columnaTitulo ? 1 : 0) + (puedeVerPrecios ? 2 : 0), "a")}
      <td className="px-4 py-3 text-center whitespace-nowrap"><ChipEstadoOT ot={s} /></td>
      <td className="px-4 py-3 text-center"><ChipGRE gre={greMap[s._id]} /></td>
      {vacias(colsFinales, "b")}
    </tr>
  );

  const celdaDocumento = (o) => {
    if (!puedeSubirDocumento(o)) {
      return (
        <td className="px-4 py-3.5 text-center" onClick={(e) => e.stopPropagation()}>
          {o.documento ? (
            <button type="button" onClick={() => abrirArchivoProtegido(o.documento)}
              className="text-blue-600 hover:text-blue-800 text-xs font-medium underline">
              Ver PDF
            </button>
          ) : <span className="text-gray-300 text-xs">—</span>}
        </td>
      );
    }
    return (
      <td className="px-4 py-3.5 text-center" onClick={(e) => e.stopPropagation()}>
        <label className="cursor-pointer inline-flex flex-col items-center gap-1">
          <input
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={(e) => { if (e.target.files[0]) subirDocumento(o._id, e.target.files[0]); e.target.value = ""; }}
          />
          {o.documento ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); abrirArchivoProtegido(o.documento); }}
                className="text-blue-600 hover:text-blue-800 text-xs font-medium underline"
              >
                Ver PDF
              </button>
              <span className="text-gray-300">|</span>
              <span className="text-xs text-gray-400 hover:text-gray-600 underline">Reemplazar</span>
            </div>
          ) : (
            <span className="text-xs text-blue-500 hover:text-blue-700 underline">Subir PDF</span>
          )}
        </label>
      </td>
    );
  };

  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-3">
        <span className={`w-1.5 h-5 rounded-full ${acento}`} />
        <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wide">{titulo}</h3>
        <span className="text-xs text-gray-400">({ordenes.length})</span>
      </div>
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <TablaScroll className="overflow-x-auto">
        <table className="w-full text-sm" style={{ minWidth: `${totalColumnas * 85}px` }}>
          <thead className="bg-gray-50 text-xs uppercase tracking-wide border-b-2 border-gray-200">
            <tr>
              <th className={`${TH} w-8 px-2`}><span className="sr-only">Partidas</span></th>
              {hayCheck && <th className={`${TH} w-8 px-2`}><span className="sr-only">Seleccionar</span></th>}
              {/* w-px encoge la columna a su contenido (que es nowrap) y deja
                  el ancho sobrante al título. */}
              <th className={`${TH} text-left w-px`}>Cotización</th>
              <th className={`${TH} text-left w-px`}>N° OT</th>
              <th className={`${TH} text-left`}>N° Orden de<br />Compra</th>
              <th className={`${TH} text-left w-px`}>Fecha de<br />creación</th>
              {mostrarFactura && <th className={`${TH} text-left w-px`}>N° Factura</th>}
              <th className={`${TH} text-left w-px`}>Facturación</th>
              <th className={`${TH} text-left min-w-[160px]`}>Empresa</th>
              {columnaTitulo && <th className={`${TH} text-left min-w-[260px]`}>{mostrarTitulo ? "Título" : "Título de la partida"}</th>}
              {puedeVerPrecios && <th className={`${TH} text-right w-px`}>Total<br />(S/)</th>}
              {puedeVerPrecios && <th className={`${TH} text-right w-px`}>Total<br />(US$)</th>}
              <th className={`${TH} text-center`}>Estado de<br />servicio</th>
              <th className={`${TH} text-center`}>GRE</th>
              {mostrarHesActa && <th className={`${TH} text-center`}>HES</th>}
              {mostrarHesActa && <th className={`${TH} text-center`}>Acta de Conformidad</th>}
              {mostrarDocumento && <th className={`${TH} text-center`}>Documento</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {ordenes.length === 0 ? (
              <tr><td colSpan={totalColumnas} className="px-4 py-8 text-center text-gray-400">{vacioMsg}</td></tr>
            ) : ordenes.flatMap((o) => {
              const grupoOT = otGroupMap[o.numeroDocumento];
              const otPadre = grupoOT?.parent || null;
              const { pen, usd } = totalesDuales(o.monto, o.moneda, tipoCambio);
              const partidas = o.partidas || [];
              // Una sola partida: una única fila con los datos de la OC y los estados de esa partida.
              const unica = partidas.length === 1 ? partidas[0] : null;
              const conPartidas = partidas.length > 1;
              const estadoFact = o.estadoFacturacion;
              const abierta = conPartidas && !colapsadas.includes(o._id);
              const otsUnica = unica ? otsCot[idDe(unica.cotizacion)] || [] : [];
              const seleccionables = seleccionablesDe(o);
              const deEstaOC = seleccion?.oc._id === o._id;
              const otraOC = !!seleccion && !deEstaOC;
              const avisoOtraOC = otraOC
                ? `Ya hay partidas seleccionadas de ${seleccion.oc.numeroOrden || seleccion.oc.codigo}: se factura una sola OC a la vez.`
                : undefined;
              const ref = o.numeroOrden || o.codigo;

              // Con varias partidas, los estados (facturación, servicio, GRE) son de cada partida
              // (sub-filas); la fila de la OC solo lleva sus datos propios y el avance k/N.
              const filaPrincipal = (
                <tr key={o._id}
                  className={`hover:bg-gray-50 cursor-pointer transition-colors ${o.anulado ? "opacity-50" : ""} ${deEstaOC ? "bg-blue-50/40" : ""}`}
                  onClick={() => onSelect(o)}>
                  <td className="pl-2 py-3.5 text-center" onClick={(e) => e.stopPropagation()}>
                    {conPartidas && (
                      <button type="button" onClick={() => onToggleExpandir(o._id)} aria-expanded={abierta}
                        aria-label={abierta ? "Ocultar partidas" : "Ver partidas"} title={abierta ? "Ocultar partidas" : "Ver partidas"}
                        className="text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded text-base leading-none w-6 h-6">
                        {abierta ? "▾" : "▸"}
                      </button>
                    )}
                  </td>
                  {hayCheck && (
                    <td className="px-2 py-3.5 text-center" onClick={(e) => e.stopPropagation()}>
                      {seleccionables.length > 0 && (unica ? (
                        <input type="checkbox" aria-label={`Seleccionar la partida sin facturar de ${ref}`}
                          title={avisoOtraOC} checked={deEstaOC && seleccion.partidas.includes(idDe(unica._id))} disabled={otraOC}
                          onChange={() => onTogglePartida(o, idDe(unica._id))}
                          className="w-4 h-4 disabled:cursor-not-allowed" />
                      ) : (
                        <CheckOC marcadas={deEstaOC ? seleccion.partidas.length : 0} total={seleccionables.length}
                          disabled={otraOC} title={avisoOtraOC}
                          label={`Seleccionar las partidas sin facturar de ${ref}`}
                          onChange={() => onToggleOC(o, seleccionables)} />
                      ))}
                    </td>
                  )}
                  <td className="px-4 py-3.5 font-semibold text-gray-800 whitespace-nowrap">
                    {conPartidas
                      ? <span className="text-xs font-normal text-gray-500">{partidas.length} partidas</span>
                      : numeroCotDe(unica ? unica.cotizacion : o.cotizacion) || <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-3.5 font-semibold text-gray-800 whitespace-nowrap">
                    {conPartidas ? null : unica
                      ? otsUnica.map(numeroOTDe).join(", ") || <span className="text-gray-300 font-sans">Sin OT</span>
                      : grupoOT?.parents.length ? grupoOT.parents.map(numeroOTDe).join(", ") : <span className="text-gray-300 font-sans">Sin OT</span>}
                  </td>
                  <td className="px-4 py-3.5 font-semibold text-gray-800 max-w-[220px]">
                    <div className="flex items-center gap-1.5 flex-wrap break-words">
                      {o.numeroOrden || <span className="text-gray-300">—</span>}
                      {o.anulado && (
                        <span title={o.motivoAnulacion} className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-red-100 text-red-600 uppercase">
                          Anulada
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3.5 text-gray-600 whitespace-nowrap">
                    {o.createdAt ? formatearFecha(o.createdAt) : <span className="text-gray-300">—</span>}
                  </td>
                  {mostrarFactura && (
                    <td className="px-4 py-3.5 text-gray-600 font-mono text-xs">
                      {numerosFacturaDe(o).length
                        ? numerosFacturaDe(o).map((n) => <div key={n} className="whitespace-nowrap">{n}</div>)
                        : <span className="text-gray-300 font-sans">—</span>}
                    </td>
                  )}
                  <td className="px-4 py-3.5 whitespace-nowrap">
                    {conPartidas ? (
                      <span className="text-xs text-gray-500 tabular-nums" title={`${partidasFacturadas(o)} de ${partidas.length} partidas facturadas`}>
                        {partidasFacturadas(o)}/{partidas.length} facturadas
                      </span>
                    ) : unica ? <CeldaFacturaPartida estado={estadoDePartida(o, unica)} />
                    : estadoFact?.estado ? (
                      <span className="flex items-center gap-1.5">
                        <Chip className={BADGE_FACTURACION[estadoFact.estado] || "bg-gray-100 text-gray-500"}>{estadoFact.estado}</Chip>
                        {estadoFact.reservada && (
                          <span title="Un comprobante en emisión incluye esta OC.">
                            <Chip className="bg-amber-100 text-amber-700">En emisión</Chip>
                          </span>
                        )}
                      </span>
                    ) : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-3.5 text-gray-700">{o.empresa?.razonSocial || "—"}</td>
                  {/* max-width en un <td> se ignora con table-layout auto: el
                      tope va en un div interno, que limita el max-content de
                      la columna y obliga al título a envolver. */}
                  {columnaTitulo && (
                    <td className="px-4 py-3.5 text-gray-600">
                      <div className="max-w-[340px]">{mostrarTitulo ? o.titulo : unica && (unica.titulo || unica.cotizacion?.titulo)}</div>
                    </td>
                  )}
                  {puedeVerPrecios && <td className="px-4 py-3.5 text-right font-bold text-gray-900 tabular-nums whitespace-nowrap">{celdaMonto(pen)}</td>}
                  {puedeVerPrecios && <td className="px-4 py-3.5 text-right font-bold text-gray-900 tabular-nums whitespace-nowrap">{celdaMonto(usd)}</td>}
                  {conPartidas ? vacias(2, "e") : unica ? (
                    <>
                      <td className="px-4 py-3.5 text-center"><EstadosPorOT ots={otsUnica} render={(ot) => <ChipEstadoOT ot={ot} />} vacio="Sin OT" /></td>
                      <td className="px-4 py-3.5 text-center"><EstadosPorOT ots={otsUnica} render={(ot) => <ChipGRE gre={greMap[ot._id]} />} vacio="Sin GRE" /></td>
                    </>
                  ) : (
                    <>
                      <td className="px-4 py-3.5 text-center whitespace-nowrap">
                        {otPadre ? <ChipEstadoOT ot={otPadre} /> : <span className="text-gray-300 text-xs">Sin OT</span>}
                      </td>
                      <td className="px-4 py-3.5 text-center"><ChipGRE gre={otPadre && greMap[otPadre._id]} /></td>
                    </>
                  )}
                  {mostrarHesActa && <td className="px-4 py-3.5 text-center"><PillSiNo si={!!o.hesConfirmado} /></td>}
                  {mostrarHesActa && <td className="px-4 py-3.5 text-center"><PillSiNo si={!!o.actaConformidadConfirmada} /></td>}
                  {mostrarDocumento && celdaDocumento(o)}
                </tr>
              );

              const filasPartida = !abierta ? [] : partidas.flatMap((p, idx) => {
                const id = idDe(p._id);
                const marcada = deEstaOC && seleccion.partidas.includes(id);
                const totales = totalesDuales(p.subtotal, o.moneda, tipoCambio);
                const ots = otsCot[idDe(p.cotizacion)] || [];
                const fila = (
                  <tr key={`${o._id}-${id}`}
                    className={`hover:bg-gray-50 cursor-pointer transition-colors ${marcada ? "bg-blue-50/60" : "bg-sky-50/30"} ${o.anulado ? "opacity-50" : ""}`}
                    onClick={() => onSelect(o)}>
                    <td className="py-3" />
                    {hayCheck && (
                      <td className="px-2 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                        {seleccionables.includes(id) && (
                          <input type="checkbox" aria-label={`Seleccionar partida ${idx + 1} de ${ref}`}
                            title={avisoOtraOC} checked={marcada} disabled={otraOC}
                            onChange={() => onTogglePartida(o, id)}
                            className="w-4 h-4 disabled:cursor-not-allowed" />
                        )}
                      </td>
                    )}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="font-mono text-xs text-gray-400 mr-2">{idx + 1}/{partidas.length}</span>
                      <span className="font-mono text-sm text-sky-700">{numeroCotDe(p.cotizacion) || "—"}</span>
                    </td>
                    <td className="px-4 py-3 font-mono text-sm text-gray-600 whitespace-nowrap">
                      {ots.map(numeroOTDe).join(", ") || <span className="text-gray-300 font-sans">Sin OT</span>}
                    </td>
                    {vacias(2 + (mostrarFactura ? 1 : 0), "c")}
                    <td className="px-4 py-3"><CeldaFacturaPartida estado={estadoDePartida(o, p)} /></td>
                    <td className="px-4 py-3" />
                    {columnaTitulo && (
                      <td className="px-4 py-3">
                        <div className="max-w-[340px] text-xs font-semibold text-gray-700 uppercase tracking-wide">{p.titulo || p.cotizacion?.titulo}</div>
                      </td>
                    )}
                    {puedeVerPrecios && <td className="px-4 py-3 text-right text-gray-700 tabular-nums whitespace-nowrap">{celdaMonto(totales.pen)}</td>}
                    {puedeVerPrecios && <td className="px-4 py-3 text-right text-gray-700 tabular-nums whitespace-nowrap">{celdaMonto(totales.usd)}</td>}
                    <td className="px-4 py-3 text-center"><EstadosPorOT ots={ots} render={(ot) => <ChipEstadoOT ot={ot} />} vacio="Sin OT" /></td>
                    <td className="px-4 py-3 text-center"><EstadosPorOT ots={ots} render={(ot) => <ChipGRE gre={greMap[ot._id]} />} vacio="Sin GRE" /></td>
                    {vacias(colsFinales, "h")}
                  </tr>
                );
                const subs = ots.flatMap((ot) => subsOT[ot._id] || []);
                return [fila, ...subs.map((s) => filaSub(o, s, `${o._id}-${id}-${s._id}`))];
              });

              // Legado (sin partidas): las sub-OTs se agrupan por el numeroDocumento de la OC.
              const filasSub = partidas.length ? [] : (grupoOT?.subs || []).map((s) => filaSub(o, s, s._id));
              const filasSubUnica = otsUnica.flatMap((ot) => subsOT[ot._id] || []).map((s) => filaSub(o, s, `${o._id}-${s._id}`));

              return [filaPrincipal, ...filasPartida, ...filasSub, ...filasSubUnica];
            })}
          </tbody>
        </table>
        </TablaScroll>
      </div>
    </div>
  );
}

export default function ListaOrdenesCompra() {
  const rol = getUsuario()?.rol;
  // Administración ve la vista de OC pero no montos/costos — mismo criterio
  // que Cotizaciones (Fase 16). Tesorero los ve para decidir si marca la OC pagada.
  const puedeVerPrecios = ["admin", "facturacion", "jefatura", "coordinadora", "tesorero"].includes(rol);
  // Mismo gate que `puedeEditar` de Backend/src/routes/ordenesCompra.js (crear, importar y subir el PDF):
  // el tesorero solo lee (P1).
  const puedeEditarOC = ["admin", "asistente", "facturacion", "jefatura", "coordinadora"].includes(rol);
  // Mismo gate que "Facturar seleccionadas" en DetalleOrdenCompra.jsx (POST /facturas puedeCrear).
  const puedeFacturarRol = ["admin", "facturacion", "jefatura", "coordinadora"].includes(rol);
  const navigate = useNavigate();
  const [ordenes, setOrdenes]       = useState([]);
  const [otGroupMap, setOtGroupMap] = useState({});
  const [otsCot, setOtsCot]         = useState({});
  const [subsOT, setSubsOT]         = useState({});
  const [greMap, setGreMap]         = useState({});
  const [tipoCambio, setTipoCambio] = useState(null);
  const [sortBy, setSortBy]         = useState("fecha");
  const [vista, setVista]           = useState("todasLasOC");
  const [detalle, setDetalle]       = useState(null);
  const [abriendo, setAbriendo]     = useState(false);
  const [seleccion, setSeleccion]   = useState(SELECCION_VACIA);
  // Cotizaciones completas (por _id) para "Facturar seleccionadas": se piden al marcar la primera partida.
  const [cots, setCots]             = useState({ estado: "", porId: {} });
  // Las OC con varias partidas se muestran desplegadas (los estados viven en cada partida); aquí van las plegadas.
  const [colapsadas, setColapsadas] = useState([]);
  const [crearOpen, setCrearOpen]   = useState(false);
  const [importarOpen, setImportarOpen] = useState(false);
  const [importarCadenaOpen, setImportarCadenaOpen] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [estadoOT, setEstadoOT] = useState("");
  const [empresa, setEmpresa]   = useState("");
  const [planta, setPlanta]     = useState("");
  // Sin año/mes preseleccionado — el filtro de fecha solo se aplica cuando
  // el usuario elige uno, no por defecto (pedido explícito del usuario,
  // 2026-09-04; mismo criterio que ListaCotizaciones.jsx).
  const [anio, setAnio]         = useState("");
  const [mes, setMes]           = useState("");
  const [aviso, setAviso]       = useState("");

  const cargar = () =>
    Promise.all([
      fetchAuth("/ordenes-compra").then((r) => r.ok ? r.json() : []),
      fetchAuth("/ordenes-trabajo").then((r) => r.ok ? r.json() : []),
      fetchAuth("/tipo-cambio").then((r) => r.ok ? r.json() : null),
    ]).then(([ocs, ots, tc]) => {
      setOrdenes(ocs);
      setSeleccion(SELECCION_VACIA);
      setCots({ estado: "", porId: {} });
      setTipoCambio(tc?.valor ?? null);
      // Agrupa por numeroDocumento (compartido por toda la cadena): la OT
      // padre + sus sub-OTs quedan bajo la misma OC/Cotización/Factura. Una
      // sub-OT hereda el numeroDocumento de su padre al crearse, así que
      // agrupar por este campo agarra padre + hijas sin necesitar `ordenPadre`.
      // Solo lo usan las OC sin partidas (legado); con partidas, cada una lleva las OTs de su cotización.
      const otG = {};
      ots.forEach((ot) => {
        if (ot.numeroDocumento == null) return;
        if (!otG[ot.numeroDocumento]) otG[ot.numeroDocumento] = { parent: null, parents: [], subs: [] };
        if (ot.ordenPadre) otG[ot.numeroDocumento].subs.push(ot);
        else { otG[ot.numeroDocumento].parent = ot; otG[ot.numeroDocumento].parents.unshift(ot); }
      });
      setOtGroupMap(otG);
      const { porCot, subs } = indexarOTs(ots);
      setOtsCot(porCot);
      setSubsOT(subs);

      // GRE generadas por OT/sub-OT (mismo mecanismo que el badge de
      // DetalleOrdenTrabajo.jsx) — solo cuentan las ACEPTADAS por SUNAT.
      const otIds = ots.map((ot) => ot._id);
      if (otIds.length) {
        fetchAuth(`/guias?ordenesTrabajo=${otIds.join(",")}&estado=ACEPTADO&limit=1000`)
          .then((r) => r.ok && r.json())
          .then((data) => {
            if (!data?.ok) return;
            const map = {};
            data.data.forEach((g) => {
              const codigo = `${g.serie}-${String(g.correlativo).padStart(4, "0")}`;
              (g.ordenesTrabajo || []).forEach((id) => {
                const key = id?._id || id;
                map[key] = map[key] ? `${map[key]}, ${codigo}` : codigo;
              });
            });
            setGreMap(map);
          });
      } else {
        setGreMap({});
      }
    });

  useEffect(() => { cargar(); }, []);

  // Una OC sin partidas (legado) no trae el detalle de su factura en estadoFacturacion: el detalle la
  // recibe aparte, buscada entre las facturas cuyo número ya figura en numerosFactura (solo finanzas
  // lee /facturas; el resto ve el número).
  const abrirOrden = async (o) => {
    const numeros = numerosFacturaDe(o);
    if (o.partidas?.length || !numeros.length || !veFacturas(rol)) return setDetalle({ orden: o, extra: null });
    if (abriendo) return;
    setAbriendo(true);
    const facturas = await fetchAuth("/facturas").then((r) => r.ok ? r.json() : []).catch(() => []);
    setAbriendo(false);
    const extra = facturas.find((f) => {
      const ocId = idDe(f.ordenCompra);
      const deLaOC = ocId ? ocId === o._id : f.numeroDocumento != null && f.numeroDocumento === o.numeroDocumento;
      return deLaOC && !f.anulado && (numeros.includes(f.numeroFactura) || numeros.includes(f.codigo));
    }) || null;
    setDetalle({ orden: o, extra });
  };

  const puedeFacturarOC = (o) => puedeFacturarRol && !o.anulado && !bloqueadoPorPago(o, rol) && !o.estadoFacturacion?.bloqueada;
  // Solo las partidas "sin facturar" (las reservadas, facturadas o pagadas no se eligen).
  const seleccionablesDe = (o) => (puedeFacturarOC(o)
    ? (o.partidas || []).filter((p) => estadoDePartida(o, p)?.estado === "sin facturar").map((p) => idDe(p._id))
    : []);

  const asegurarCotizaciones = () => {
    if (cots.estado === "cargando" || cots.estado === "ok") return;
    setCots({ estado: "cargando", porId: {} });
    fetchAuth("/cotizaciones")
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null)
      .then((lista) => setCots(Array.isArray(lista)
        ? { estado: "ok", porId: Object.fromEntries(lista.map((c) => [c._id, c])) }
        : { estado: "error", porId: {} }));
  };

  // Partidas de una sola OC a la vez: las casillas de las demás OC quedan deshabilitadas.
  const togglePartida = (oc, id) => {
    asegurarCotizaciones();
    setSeleccion((prev) => {
      const base = prev.ocId === oc._id ? prev.partidas : [];
      const partidas = base.includes(id) ? base.filter((x) => x !== id) : [...base, id];
      return partidas.length ? { ocId: oc._id, partidas } : SELECCION_VACIA;
    });
  };
  const toggleOC = (oc, ids) => {
    asegurarCotizaciones();
    setColapsadas((prev) => prev.filter((x) => x !== oc._id));
    setSeleccion((prev) => {
      const todas = prev.ocId === oc._id && ids.every((id) => prev.partidas.includes(id));
      return todas ? SELECCION_VACIA : { ocId: oc._id, partidas: ids };
    });
  };
  const toggleExpandir = (id) => setColapsadas((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);

  const anios = [...new Set(ordenes.map((o) => anioLima(o.fecha)))].sort((a, b) => b - a);

  const empresasLista = [
    ...new Map(
      ordenes.filter((o) => o.empresa?._id).map((o) => [o.empresa._id, o.empresa])
    ).values(),
  ].sort((a, b) => a.razonSocial.localeCompare(b.razonSocial));

  const plantasLista = [...new Set(
    (empresa ? ordenes.filter((o) => o.empresa?._id === empresa) : ordenes)
      .map((o) => o.planta)
      .filter(Boolean)
  )].sort();

  const handleEmpresa = (e) => { setEmpresa(e.target.value); setPlanta(""); };

  const filtradas = ordenes.filter((o) => {
    const matchAnio  = !anio || anioLima(o.fecha) === Number(anio);
    const matchMes   = !mes || mesLima(o.fecha) === Number(mes);
    const txt = busqueda.toLowerCase();
    const grupoOT = otGroupMap[o.numeroDocumento];
    const partidas = o.partidas || [];
    const otsPartidas = partidas.flatMap((p) => otsCot[idDe(p.cotizacion)] || []);
    const otsOC = partidas.length
      ? [...otsPartidas, ...otsPartidas.flatMap((ot) => subsOT[ot._id] || [])]
      : grupoOT ? [...grupoOT.parents, ...grupoOT.subs] : [];
    const numerosCot = [o.cotizacion, ...partidas.map((p) => p.cotizacion)].flatMap((c) => [c?.numeroCotizacion, c?.codigo]);
    const coincide = (v) => v?.toLowerCase().includes(txt);
    const matchBusq  = !txt
      || coincide(o.numeroOrden)
      || coincide(o.titulo)
      || numerosFacturaDe(o).some(coincide)
      || otsOC.some((ot) => coincide(ot.numeroOT))
      || numerosCot.some(coincide)
      || coincide(o.empresa?.razonSocial)
      || o.empresa?.ruc?.includes(txt);
    // Con partidas, basta que una de sus OTs esté en el estado de servicio elegido.
    const estadosServicio = partidas.length ? otsPartidas.map(estadoProgresoOT) : [grupoOT?.parent && estadoProgresoOT(grupoOT.parent)];
    const matchEstado = !estadoOT || estadosServicio.includes(estadoOT);
    const matchEmpresa = !empresa || o.empresa?._id === empresa;
    const matchPlanta = !planta || o.planta === planta;
    return matchAnio && matchMes && matchBusq && matchEstado && matchEmpresa && matchPlanta;
  });

  filtradas.sort((a, b) => {
    if (sortBy === "numeroOT") return compararTexto(otGroupMap[a.numeroDocumento]?.parent?.numeroOT, otGroupMap[b.numeroDocumento]?.parent?.numeroOT);
    if (sortBy === "numeroCotizacion") return compararTexto(numeroCotDe(a.cotizacion), numeroCotDe(b.cotizacion));
    return new Date(b.fecha) - new Date(a.fecha);
  });

  const hayFiltro = busqueda || estadoOT || empresa || planta || anio || mes;
  const porEstado = (estado) => filtradas.filter((o) => (o.estadoFacturacion?.estado || "sin facturar") === estado);
  const tablaVista = TABLAS_ESTADO.find((t) => t.estado === vista);
  const ocsEnVista = tablaVista ? porEstado(tablaVista.estado) : filtradas;

  // Una selección cuya OC quedó fuera de la vista (filtro, búsqueda) o dejó de poder facturarse no cuenta.
  const ocSel = seleccion.ocId ? ocsEnVista.find((o) => o._id === seleccion.ocId) : null;
  const idsSel = ocSel ? seleccion.partidas.filter((id) => seleccionablesDe(ocSel).includes(id)) : [];
  const sel = idsSel.length ? { oc: ocSel, partidas: idsSel } : null;
  const elegidas = sel ? (sel.oc.partidas || []).filter((p) => sel.partidas.includes(idDe(p._id))) : [];
  const posicion = (p) => `${sel.oc.partidas.indexOf(p) + 1}/${sel.oc.partidas.length}`;
  const sinCotizacion = cots.estado === "ok" ? elegidas.filter((p) => !cots.porId[idDe(p.cotizacion)]) : [];
  const motivoNoFacturar = cots.estado === "error"
    ? "No se pudieron cargar las cotizaciones de las partidas."
    : sinCotizacion.length ? `No se encontró la cotización de la partida ${sinCotizacion.map(posicion).join(", ")}.` : "";

  // Mismo contrato que "Facturar seleccionadas" de DetalleOrdenCompra.jsx: la OC, las partidas elegidas
  // en el orden de la OC y las cotizaciones completas de esas partidas.
  const facturarSeleccionadas = () => {
    const idsCot = [...new Set(elegidas.map((p) => idDe(p.cotizacion)))];
    navigate("/facturacion-electronica/emitir", {
      state: { prellenarDesdeOC: { oc: sel.oc, partidas: elegidas, cotizaciones: idsCot.map((id) => cots.porId[id]) } },
    });
  };

  // Una fila por partida con las columnas de la OC repetidas y los estados (facturación, servicio, GRE)
  // propios de la partida; una OC sin partidas (legado) va en una sola fila con los de su cadena.
  // Mismas columnas que TablaOC (sin "Documento", no aplica a una hoja de cálculo).
  const filasOC = (o) => {
    const grupoOT = otGroupMap[o.numeroDocumento];
    const { pen, usd } = totalesDuales(o.monto, o.moneda, tipoCambio);
    const partidas = o.partidas || [];
    const fila = (p, idx) => {
      const estado = p && estadoDePartida(o, p);
      const totales = p ? totalesDuales(p.subtotal, o.moneda, tipoCambio) : {};
      const cot = p ? p.cotizacion : o.cotizacion;
      const ots = p ? (otsCot[idDe(p.cotizacion)] || []) : grupoOT?.parents || [];
      const subs = p ? ots.flatMap((ot) => subsOT[ot._id] || []) : grupoOT?.subs || [];
      return {
        "Partida":               p ? `${idx + 1}/${partidas.length}` : "—",
        "Cotización":            numeroCotDe(cot) || "—",
        "N° Orden de Compra":    o.numeroOrden || "—",
        "Fecha de creación":     o.createdAt ? formatearFecha(o.createdAt) : "—",
        "N° OT":                 ots.map(numeroOTDe).join(", ") || "—",
        "Sub-OTs":               subs.map((s) => s.numeroOT).join(", ") || "—",
        "N° Factura OC":         o.estadoFacturacion?.numerosFactura || "—",
        "Estado facturación OC": o.estadoFacturacion?.estado || "—",
        "Partidas facturadas":   partidas.length ? `${partidasFacturadas(o)}/${partidas.length}` : "—",
        "Empresa":               o.empresa?.razonSocial || "—",
        "Título":                o.titulo || "—",
        "Título de la partida":  p ? (p.titulo || cot?.titulo || "—") : "—",
        ...(puedeVerPrecios ? {
          "Total OC (S/)":       pen != null ? pen.toFixed(2) : "—",
          "Total OC (US$)":      usd != null ? usd.toFixed(2) : "—",
          "Total partida (S/)":  p && totales.pen != null ? totales.pen.toFixed(2) : "—",
          "Total partida (US$)": p && totales.usd != null ? totales.usd.toFixed(2) : "—",
        } : {}),
        "Facturación de la partida": estado?.estado || "—",
        "Factura de la partida":     estado?.factura ? (estado.factura.numeroFactura || estado.factura.codigo) : "—",
        "Estado de servicio":    p ? textoPorOT(ots, estadoProgresoOT, "Sin OT") : grupoOT?.parent ? estadoProgresoOT(grupoOT.parent) : "Sin OT",
        "GRE":                   p ? textoPorOT(ots, (ot) => greMap[ot._id], "Sin GRE") : (grupoOT?.parent && greMap[grupoOT.parent._id]) || "Sin GRE",
      };
    };
    return partidas.length ? partidas.map(fila) : [fila(null)];
  };

  const exportarExcel = () => {
    const wb = XLSX.utils.book_new();
    TABLAS_ESTADO.forEach(({ estado, label }) => {
      const ws = XLSX.utils.json_to_sheet(porEstado(estado).flatMap(filasOC));
      XLSX.utils.book_append_sheet(wb, ws, label);
    });
    XLSX.writeFile(wb, "ordenes-de-compra.xlsx");
  };

  const subirDocumento = async (id, file) => {
    const fd = new FormData();
    fd.append("documento", file);
    const res = await conBloqueo("ordenCompra", id, (h) => uploadAuth(`/ordenes-compra/${id}/documento`, fd, h));
    if (!res.ok) { setAviso((await res.json().catch(() => ({}))).mensaje || "No se pudo subir el documento."); return; }
    const actualizada = await res.json();
    setOrdenes((prev) => prev.map((o) => o._id === id ? { ...o, documento: actualizada.documento } : o));
  };

  const propsTabla = {
    otGroupMap, otsCot, subsOT, greMap, tipoCambio, puedeVerPrecios,
    onSelect: abrirOrden, subirDocumento,
    puedeSubirDocumento: (o) => puedeEditarOC && !bloqueadoPorPago(o, rol),
    seleccionablesDe, seleccion: sel, onTogglePartida: togglePartida, onToggleOC: toggleOC,
    colapsadas, onToggleExpandir: toggleExpandir,
  };
  const vacioFiltro = "Sin resultados para los filtros aplicados";

  return (
    <div className="p-6 mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-bold text-gray-800">Órdenes de Compra</h2>
          <p className="text-xs text-gray-400 mt-0.5">{filtradas.length} orden{filtradas.length !== 1 ? "es" : ""}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={exportarExcel}
            className="border border-gray-300 text-gray-600 px-4 py-2 rounded-lg text-sm hover:bg-gray-50 transition">
            Exportar Excel
          </button>
          {puedeEditarOC && (
            <button onClick={() => setImportarOpen(true)}
              className="border border-gray-300 text-gray-600 px-4 py-2 rounded-lg text-sm hover:bg-gray-50 transition">
              Importar Excel
            </button>
          )}
          {puedeEditarOC && (
            <button onClick={() => setCrearOpen(true)}
              className="bg-blue-700 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-800 transition font-medium">
              + Nueva OC
            </button>
          )}
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 mb-5 flex gap-3 flex-wrap items-center">
        <select
          value={anio}
          onChange={(e) => setAnio(e.target.value ? Number(e.target.value) : "")}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
        >
          <option value="">Todo año</option>
          {anios.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <select
          value={mes}
          onChange={(e) => setMes(e.target.value ? Number(e.target.value) : "")}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
        >
          <option value="">Todo mes</option>
          {MESES.map((m, i) => (
            <option key={i} value={i + 1}>{m}</option>
          ))}
        </select>
        <select
          value={empresa}
          onChange={handleEmpresa}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
        >
          <option value="">Toda empresa</option>
          {empresasLista.map((e) => (
            <option key={e._id} value={e._id}>
              {e.alias ? `${e.alias} — ` : ""}{e.razonSocial}
            </option>
          ))}
        </select>
        {plantasLista.length > 0 && (
          <select
            value={planta}
            onChange={(e) => setPlanta(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
          >
            <option value="">Toda planta</option>
            {plantasLista.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        )}
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por N° OT, cotización, OC, factura, título, empresa o RUC…"
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm flex-1 min-w-60 focus:outline-none focus:ring-2 focus:ring-blue-300"
        />
        <select
          value={estadoOT}
          onChange={(e) => setEstadoOT(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
        >
          {ESTADOS_OT.map((e) => (
            <option key={e} value={e}>{e ? e.charAt(0).toUpperCase() + e.slice(1) : "Todo estado de servicio"}</option>
          ))}
        </select>
        <select
          value={vista}
          onChange={(e) => setVista(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
        >
          {VISTAS.map(({ valor, label }) => (
            <option key={valor} value={valor}>{label}</option>
          ))}
        </select>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
        >
          {SORTS.map(({ valor, label }) => (
            <option key={valor} value={valor}>Ordenar: {label}</option>
          ))}
        </select>
        {(hayFiltro || vista !== "todasLasOC") && (
          <button
            onClick={() => { setBusqueda(""); setEstadoOT(""); setEmpresa(""); setPlanta(""); setAnio(""); setMes(""); setVista("todasLasOC"); }}
            className="text-sm text-gray-400 hover:text-gray-700 transition"
          >
            Limpiar
          </button>
        )}
      </div>

      {sel && (
        <div className="sticky top-0 z-10 bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 mb-5 flex items-center gap-3 flex-wrap">
          <p className="text-sm text-blue-900">
            {sel.partidas.length} partida{sel.partidas.length !== 1 ? "s" : ""} de{" "}
            <span className="font-semibold">{sel.oc.numeroOrden || sel.oc.codigo}</span>
            {sel.oc.empresa?.razonSocial && <span className="text-blue-700"> · {sel.oc.empresa.razonSocial}</span>}
          </p>
          {motivoNoFacturar && (
            <p className="text-sm text-red-600">
              {motivoNoFacturar}
              {cots.estado === "error" && (
                <button type="button" onClick={asegurarCotizaciones} className="ml-2 underline hover:text-red-800">Reintentar</button>
              )}
            </p>
          )}
          <div className="ml-auto flex items-center gap-3">
            <button type="button" onClick={() => setSeleccion(SELECCION_VACIA)}
              className="text-sm text-gray-500 hover:text-gray-800 transition">
              Quitar selección
            </button>
            <button type="button" onClick={facturarSeleccionadas} disabled={cots.estado !== "ok" || !!motivoNoFacturar}
              className="bg-blue-600 text-white text-sm px-4 py-1.5 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition font-medium">
              {cots.estado === "cargando" ? "Cargando cotizaciones…" : `Facturar seleccionadas (${sel.partidas.length})`}
            </button>
          </div>
        </div>
      )}

      {abriendo && <p className="text-xs text-gray-400 mb-3">Abriendo la orden de compra…</p>}

      <TablaOC
        {...propsTabla}
        titulo={tablaVista ? tablaVista.titulo : "Todas las Órdenes de Compra"}
        acento={tablaVista ? tablaVista.acento : "bg-blue-500"}
        ordenes={ocsEnVista}
        {...(vista === "sin facturar" ? { mostrarFactura: false, mostrarTitulo: false, mostrarDocumento: false, mostrarHesActa: true } : {})}
        vacioMsg={hayFiltro ? vacioFiltro : tablaVista ? tablaVista.vacio : "Sin órdenes de compra registradas"}
      />

      {detalle && (
        <DetalleDocumento
          tipo="oc"
          data={detalle.orden}
          extra={detalle.extra}
          onClose={() => { setDetalle(null); cargar(); }}
          onGuardadaOC={(actualizada) => {
            setOrdenes((prev) => prev.map((o) => o._id === actualizada._id ? actualizada : o));
          }}
        />
      )}

      {crearOpen && (
        <ModalCrearOrdenCompra
          onClose={() => setCrearOpen(false)}
          onCreada={(nueva) => { setOrdenes(prev => [nueva, ...prev]); setCrearOpen(false); }}
        />
      )}

      {importarOpen && (
        <ModalImportarExcel
          tipo="Ordenes de Compra"
          columnas={COLS_OC}
          endpoint="/ordenes-compra/importar"
          color="blue"
          onClose={() => setImportarOpen(false)}
          onImportado={cargar}
        />
      )}

      {importarCadenaOpen && (
        <ModalImportarExcel
          tipo="Cadena completa (Cotización + OT + OC + Factura)"
          columnas={COLS_CADENA}
          endpoint="/cadena/importar"
          color="blue"
          onClose={() => setImportarCadenaOpen(false)}
          onImportado={cargar}
        />
      )}
      {aviso && <AvisoAccion mensaje={aviso} onCerrar={() => setAviso("")} />}
    </div>
  );
}
