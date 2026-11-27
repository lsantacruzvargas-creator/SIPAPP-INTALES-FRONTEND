import { useState, useEffect } from "react";
import { fetchAuth } from "../utils/fetchAuth";
import { formatearFecha, fechaHoyLima } from "../utils/fecha";
import { money } from "../components/detalleShared";
import TablaScroll from "../components/TablaScroll";
import SelectorMonedaTC from "../components/SelectorMonedaTC";
import { costoEn, filaResumenCosto, filaComprometido, filaConsumido } from "../utils/costos";
import * as XLSX from "xlsx";
import ProyeccionPagos from "../components/reportes/ProyeccionPagos";
import GastosPorOT from "../components/reportes/GastosPorOT";
import { sumaPorMoneda, r2 } from "../utils/reportes";

const TH = "px-4 py-3 font-semibold text-gray-500 whitespace-nowrap";
const VACIO = { facturacion: [], valorizado: { total: 0, materiales: [] }, costosFabricacion: [], ocSinHesActa: [], ranking: [], mora: [] };

const nombreEmpresa = (e) => e?.razonSocial || "Sin empresa";
const fecha = (f) => f ? formatearFecha(f) : "—";
// Un error no se convierte en lista vacía: la pantalla y el Excel lo mostrarían como «Sin datos».
const json = (r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status))));

const estadoMoraClase = (e) => {
  if (e === "No ha pagado") return "bg-red-100 text-red-700";
  if (e === "Pago parcial") return "bg-amber-100 text-amber-700";
  if (e === "Pagó") return "bg-green-100 text-green-700";
  return "bg-gray-100 text-gray-500"; // Pendiente (no vencida)
};

function PillFalta({ falta, label }) {
  return (
    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full uppercase tracking-wide whitespace-nowrap ${falta ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"}`}>
      {falta ? `Falta ${label}` : "OK"}
    </span>
  );
}

function Seccion({ titulo, acento, count, ayuda, extra, children }) {
  return (
    <div className="mb-6">
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <span className={`w-1.5 h-5 rounded-full ${acento}`} />
        <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wide">{titulo}</h3>
        <span className="text-xs text-gray-400">({count})</span>
        {ayuda && <span className="text-xs text-gray-400">— {ayuda}</span>}
        {extra && <div className="ml-auto">{extra}</div>}
      </div>
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <TablaScroll className="overflow-x-auto">
          <table className="w-full text-sm">{children}</table>
        </TablaScroll>
      </div>
    </div>
  );
}

const TF = "px-4 py-3 text-right font-bold text-gray-900 tabular-nums whitespace-nowrap";
const FILA_TOTAL = "bg-gray-100 border-t-2 border-gray-300";
const sumar = (filas, campo) => r2(filas.reduce((s, f) => s + (Number(typeof campo === "function" ? campo(f) : f[campo]) || 0), 0));

// Fila TOTAL al final de una hoja del Excel: suma las columnas numéricas indicadas.
function conTotal(filas, etiqueta, columnas) {
  if (!filas.length) return filas;
  const total = { [etiqueta]: "TOTAL" };
  for (const c of columnas) total[c] = sumar(filas, c);
  return [...filas, total];
}

// Una fila TOTAL por moneda (columna "Moneda" de la hoja).
function totalesPorMoneda(filas, etiqueta, columna) {
  if (!filas.length) return filas;
  const totales = ["PEN", "USD"].map((m) => ({ m, total: sumar(filas.filter((f) => (f.Moneda || "PEN") === m), columna) }))
    .filter((t) => t.total !== 0);
  return [...filas, ...totales.map((t) => ({ [etiqueta]: `TOTAL ${t.m}`, Moneda: t.m, [columna]: t.total }))];
}

const TABS = [
  { id: "general", label: "General" },
  { id: "proyeccion", label: "Proyección de pagos" },
  { id: "gastos-ot", label: "Gastos por OT" },
];

export default function Reportes() {
  const [tab, setTab] = useState("general");
  return (
    <div className="p-6 mx-auto">
      <div className="mb-4">
        <h2 className="text-lg font-bold text-gray-800">Reportes</h2>
        <p className="text-xs text-gray-400 mt-0.5">Indicadores generales del negocio</p>
      </div>
      <div className="flex border-b border-gray-200 gap-1 flex-wrap mb-6">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2.5 text-sm font-medium transition border-b-2 -mb-px ${
              tab === t.id ? "border-purple-600 text-purple-700" : "border-transparent text-gray-500 hover:text-gray-700"
            }`}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === "general" && <ReportesGenerales />}
      {tab === "proyeccion" && <ProyeccionPagos />}
      {tab === "gastos-ot" && <GastosPorOT />}
    </div>
  );
}

function ReportesGenerales() {
  const [data, setData]         = useState(VACIO);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(false);
  const [intento, setIntento] = useState(0);
  const [exportando, setExportando] = useState(false);
  const [errorExportar, setErrorExportar] = useState("");
  // Costos de fabricación en S/ o US$ al TC SUNAT de una fecha (spec 2026-09-30).
  const [vista, setVista] = useState({ moneda: "PEN", fecha: fechaHoyLima(), tc: null, error: false });
  const monedaVista = vista.moneda === "USD" && vista.tc ? "USD" : "PEN";
  const costos = data.costosFabricacion.map((c) => costoEn(c, monedaVista, vista.tc));
  const costosComprometidos = costos.filter((c) => c.comprometido.total > 0);
  const costosConsumidos = costos.filter((c) => c.consumido.total > 0);

  useEffect(() => {
    Promise.all([
      fetchAuth("/reportes/facturacion-por-empresa").then(json),
      fetchAuth("/reportes/valorizado-almacen").then(json),
      fetchAuth("/reportes/costos-fabricacion").then(json),
      fetchAuth("/reportes/oc-sin-hes-acta").then(json),
      fetchAuth("/reportes/ranking-ot-cliente").then(json),
      fetchAuth("/reportes/mora-pago").then(json),
    ]).then(([facturacion, valorizado, costosFabricacion, ocSinHesActa, ranking, mora]) => {
      setData({ facturacion, valorizado, costosFabricacion, ocSinHesActa, ranking, mora });
      setError(false);
    }).catch(() => setError(true))
      .finally(() => setCargando(false));
  }, [intento]);
  const reintentar = () => { setCargando(true); setError(false); setIntento((n) => n + 1); };

  const exportarExcel = async () => {
    setErrorExportar("");
    setExportando(true);
    try {
      // El detalle de compras solo va en el Excel: se pide recién al exportar.
      const detalleCompras = await fetchAuth("/reportes/detalle-compras").then(json).catch(() => null);
      if (!detalleCompras) return setErrorExportar("No se pudo cargar el detalle de compras: el Excel no se generó. Vuelve a intentarlo.");
      armarExcel(detalleCompras);
    } catch (e) {
      console.error(e);
      setErrorExportar("No se pudo generar el Excel. Vuelve a intentarlo.");
    } finally {
      setExportando(false);
    }
  };

  const armarExcel = (detalleCompras) => {
    const wb = XLSX.utils.book_new();

    const filaFacturacion = (r) => ({
      "Empresa":            nombreEmpresa(r.empresa),
      "OTs Facturadas":     r.otsFacturadas,
      "OTs Pendientes":     r.otsPendientes,
      "Facturas Vencidas":  r.facturasVencidas,
      "Dias Atraso Max.":   r.maxDiasAtraso,
    });
    const filaMaterial = (m) => ({
      "Codigo":     m.codigo,
      "Nombre":     m.nombre,
      "Unidad":     m.unidad,
      "Tipo":       m.tipoMaterial,
      "Stock":      m.stock,
      "Valorizado": m.valorizado,
    });
    // Una fila por compra (sin duplicados), precio sin IGV en su moneda; la fecha es la de creación de la OC del cliente.
    const filaCompra = (c) => ({
      "N° OT":                c.numeroOT || "",
      "Sub-OT":               c.subOT || "",
      "N° OC cliente":        c.numeroOC || "",
      "Fecha creación OC":    (c.fechasOC || []).map(fecha).join(", "),
      "Tipo":                 c.tipo,
      "Código":               c.codigo,
      "Proveedor":            c.proveedor,
      "Descripción":          c.descripcion,
      "Cantidad":             c.cantidad,
      "Moneda":               c.moneda,
      "Precio unitario (sin IGV)": c.precioUnitario,
      "Flete":                c.flete,
      "Total (sin IGV)":      c.total,
      "Fecha de compra":      c.fechaCompra ? fecha(c.fechaCompra) : "",
    });
    const filaOCsinHesActa = (o) => ({
      "N° Orden":   o.numeroOrden,
      "Codigo":     o.codigo,
      "Empresa":    nombreEmpresa(o.empresa),
      "Falta HES":  o.faltaHes ? "Si" : "No",
      "Falta Acta": o.faltaActa ? "Si" : "No",
    });
    const filaRanking = (r) => ({
      "Empresa":     nombreEmpresa(r.empresa),
      "Cantidad OT": r.cantidadOT,
    });
    const filaMora = (m) => ({
      "Codigo":            m.codigo,
      "N° Factura":        m.numeroFactura,
      "Empresa":           nombreEmpresa(m.empresa),
      "Cuota":             m.cuota != null ? `Cuota ${m.cuota}` : "Contado",
      "Moneda":            m.moneda || "PEN",
      "Monto":             m.monto,
      "Fecha Vencimiento": fecha(m.fechaVencimiento),
      "Estado":            m.estado,
      "Dias Atraso":       m.diasAtraso,
    });

    [
      ["Facturacion x Empresa", conTotal(data.facturacion.map(filaFacturacion), "Empresa", ["OTs Facturadas", "OTs Pendientes", "Facturas Vencidas"])],
      ["Valorizado Almacen",    conTotal(data.valorizado.materiales.map(filaMaterial), "Codigo", ["Valorizado"])],
      ["Costos de Fabricacion", conTotal(costos.map((c) => filaResumenCosto(c, nombreEmpresa, vista.tc)), "N° OT",
        ["Comprometido", "Consumido", "Costo OT", "OC sin IGV", "Costo total OC", "Margen OC"])],
      ["Costo comprometido",    conTotal(costosComprometidos.map(filaComprometido), "N° OT", ["Materiales", "Servicios", "Flete", "Otros", "Total comprometido"])],
      ["Costo consumido",       conTotal(costosConsumidos.map(filaConsumido), "N° OT", ["HH", "HM", "Materiales", "Servicios", "Flete", "Otros", "Total consumido"])],
      ["Detalle de compras",    totalesPorMoneda(detalleCompras.map(filaCompra), "N° OT", "Total (sin IGV)")],
      ["OC sin HES-Acta",       data.ocSinHesActa.map(filaOCsinHesActa)],
      ["Ranking OT Cliente",    conTotal(data.ranking.map(filaRanking), "Empresa", ["Cantidad OT"])],
      ["Mora de Pago",          totalesPorMoneda(data.mora.map(filaMora), "Codigo", "Monto")],
    ].forEach(([nombre, filas]) => {
      const ws = filas.length ? XLSX.utils.json_to_sheet(filas) : XLSX.utils.aoa_to_sheet([["Sin datos"]]);
      XLSX.utils.book_append_sheet(wb, ws, nombre);
    });

    XLSX.writeFile(wb, "reportes.xlsx");
  };

  if (cargando) {
    return <div className="text-sm text-gray-400">Cargando reportes…</div>;
  }
  if (error) {
    return (
      <div>
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 inline-flex items-center gap-3">
          No se pudieron cargar los reportes.
          <button onClick={reintentar} className="underline hover:text-red-900">Reintentar</button>
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-end mb-4">
        <button onClick={exportarExcel} disabled={exportando}
          className="border border-gray-300 text-gray-600 px-4 py-2 rounded-lg text-sm hover:bg-gray-50 transition disabled:opacity-50">
          {exportando ? "Generando…" : "Exportar Excel"}
        </button>
      </div>
      {errorExportar && (
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-4 flex gap-3">
          <span className="flex-1">{errorExportar}</span>
          <button onClick={() => setErrorExportar("")} className="text-xs underline self-start">Cerrar</button>
        </p>
      )}

      {/* 1. Facturación por Empresa */}
      <Seccion titulo="Facturación por Empresa" acento="bg-blue-500" count={data.facturacion.length}>
        <thead className="bg-gray-50 text-xs uppercase tracking-wide border-b-2 border-gray-200">
          <tr>
            <th className={`${TH} text-left`}>Empresa</th>
            <th className={`${TH} text-right`}>N° OTs Facturadas</th>
            <th className={`${TH} text-right`}>N° OTs Pendientes por Facturar</th>
            <th className={`${TH} text-right`}>Facturas Vencidas</th>
            <th className={`${TH} text-right`}>Días Atraso Máx.</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {data.facturacion.length === 0 ? (
            <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">Sin datos</td></tr>
          ) : data.facturacion.map((r, i) => (
            <tr key={r.empresa?._id || i} className="hover:bg-gray-50 transition-colors">
              <td className="px-4 py-3.5 text-gray-700">{nombreEmpresa(r.empresa)}</td>
              <td className="px-4 py-3.5 text-right font-semibold text-gray-800 tabular-nums">{r.otsFacturadas}</td>
              <td className="px-4 py-3.5 text-right font-semibold text-gray-800 tabular-nums">{r.otsPendientes}</td>
              <td className="px-4 py-3.5 text-right font-semibold text-gray-800 tabular-nums">{r.facturasVencidas}</td>
              <td className="px-4 py-3.5 text-right font-semibold text-gray-800 tabular-nums">{r.maxDiasAtraso}</td>
            </tr>
          ))}
          {data.facturacion.length > 0 && (
            <tr className={FILA_TOTAL}>
              <td className="px-4 py-3 font-bold text-gray-700 uppercase text-xs tracking-wide">Total</td>
              <td className={TF}>{sumar(data.facturacion, "otsFacturadas")}</td>
              <td className={TF}>{sumar(data.facturacion, "otsPendientes")}</td>
              <td className={TF}>{sumar(data.facturacion, "facturasVencidas")}</td>
              <td className={TF}>{Math.max(0, ...data.facturacion.map((r) => r.maxDiasAtraso))}</td>
            </tr>
          )}
        </tbody>
      </Seccion>

      {/* 2. Valorizado de Almacén */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <span className="w-1.5 h-5 rounded-full bg-emerald-500" />
          <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wide">Valorizado de Almacén</h3>
          <span className="text-xs text-gray-400">({data.valorizado.materiales.length})</span>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 mb-4 inline-block">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Valorizado Total</p>
          <p className="text-2xl sm:text-3xl font-bold text-gray-900">{money(data.valorizado.total)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <TablaScroll className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase tracking-wide border-b-2 border-gray-200">
                <tr>
                  <th className={`${TH} text-left`}>Código</th>
                  <th className={`${TH} text-left`}>Nombre</th>
                  <th className={`${TH} text-left`}>Unidad</th>
                  <th className={`${TH} text-center`}>Tipo</th>
                  <th className={`${TH} text-right`}>Stock</th>
                  <th className={`${TH} text-right`}>Valorizado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.valorizado.materiales.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">Sin datos</td></tr>
                ) : data.valorizado.materiales.map((m) => (
                  <tr key={m.materialId} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3.5 font-semibold text-gray-800 whitespace-nowrap">{m.codigo}</td>
                    <td className="px-4 py-3.5 text-gray-700">{m.nombre}</td>
                    <td className="px-4 py-3.5 text-gray-600">{m.unidad}</td>
                    <td className="px-4 py-3.5 text-center">
                      <span className="text-[10px] font-medium px-2 py-0.5 rounded-full uppercase tracking-wide bg-gray-100 text-gray-600">
                        {m.tipoMaterial}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-right font-semibold text-gray-800 tabular-nums">{m.stock}</td>
                    <td className="px-4 py-3.5 text-right font-bold text-gray-900 tabular-nums whitespace-nowrap">{money(m.valorizado)}</td>
                  </tr>
                ))}
                {data.valorizado.materiales.length > 0 && (
                  <tr className={FILA_TOTAL}>
                    <td colSpan={5} className="px-4 py-3 text-right font-bold text-gray-700 uppercase text-xs tracking-wide">Total valorizado</td>
                    <td className={TF}>{money(data.valorizado.total)}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </TablaScroll>
        </div>
      </div>

      {/* 3. Costos de Fabricación por OT: comprometido (comprado, por pagar) y consumido (pagado + HH/HM) */}
      <Seccion titulo="Costos de Fabricación" acento="bg-indigo-500" count={costos.length}
        extra={<SelectorMonedaTC moneda={vista.moneda} fecha={vista.fecha} onCambio={setVista} />}>
        <thead className="bg-gray-50 text-xs uppercase tracking-wide border-b-2 border-gray-200">
          <tr>
            <th className={`${TH} text-left`}>N° OT</th>
            <th className={`${TH} text-left`}>N° OC</th>
            <th className={`${TH} text-left`}>Título</th>
            <th className={`${TH} text-left`}>Empresa</th>
            <th className={`${TH} text-right`}>Comprometido</th>
            <th className={`${TH} text-right`}>Consumido</th>
            <th className={`${TH} text-right`}>Costo OT</th>
            <th className={`${TH} text-right border-l border-gray-200`}>OC sin IGV</th>
            <th className={`${TH} text-right`}>Costo total OC</th>
            <th className={`${TH} text-right`}>Margen OC</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {costos.length === 0 ? (
            <tr><td colSpan={10} className="px-4 py-8 text-center text-gray-400">Sin datos</td></tr>
          ) : costos.map((c) => (
            <tr key={c.otId} className="hover:bg-gray-50 transition-colors">
              <td className="px-4 py-3.5 font-semibold text-gray-800 whitespace-nowrap">{c.numeroOT}</td>
              <td className="px-4 py-3.5 text-gray-600 whitespace-nowrap">{c.numeroOrdenCompra || "—"}</td>
              <td className="px-4 py-3.5 text-gray-600">{c.titulo}</td>
              <td className="px-4 py-3.5 text-gray-700">{nombreEmpresa(c.empresa)}</td>
              <td className="px-4 py-3.5 text-right font-semibold text-amber-700 tabular-nums whitespace-nowrap">{money(c.comprometido.total, monedaVista)}</td>
              <td className="px-4 py-3.5 text-right font-semibold text-emerald-700 tabular-nums whitespace-nowrap">{money(c.consumido.total, monedaVista)}</td>
              <td className="px-4 py-3.5 text-right font-bold text-gray-900 tabular-nums whitespace-nowrap">{money(c.costoTotal, monedaVista)}</td>
              {c.primeraDeCadena !== false && (
                <>
                  <td rowSpan={c.otsEnCadena || 1} className="px-4 py-3.5 text-right font-semibold text-gray-800 tabular-nums whitespace-nowrap align-top border-l border-gray-200">
                    {c.ocSubtotal != null ? money(c.ocSubtotal, monedaVista) : "—"}
                  </td>
                  <td rowSpan={c.otsEnCadena || 1} className="px-4 py-3.5 text-right font-semibold text-gray-800 tabular-nums whitespace-nowrap align-top">
                    {money(c.costoCadena, monedaVista)}
                    {c.otsEnCadena > 1 && <p className="text-[11px] font-normal text-gray-400">{c.otsEnCadena} OTs</p>}
                  </td>
                  <td rowSpan={c.otsEnCadena || 1} className={`px-4 py-3.5 text-right font-bold tabular-nums whitespace-nowrap align-top ${c.margen == null ? "text-gray-400" : c.margen >= 0 ? "text-green-600" : "text-red-600"}`}>
                    {c.margen != null ? money(c.margen, monedaVista) : "—"}
                  </td>
                </>
              )}
            </tr>
          ))}
          {costos.length > 0 && <TotalCostos costos={costos} moneda={monedaVista} />}
        </tbody>
      </Seccion>

      <Seccion titulo="Costo comprometido" acento="bg-amber-500" count={costosComprometidos.length}
        ayuda="Comprado con OC y aún no pagado por Tesorería">
        <thead className="bg-gray-50 text-xs uppercase tracking-wide border-b-2 border-gray-200">
          <tr>
            <th className={`${TH} text-left`}>N° OT</th>
            <th className={`${TH} text-right`}>Materiales</th>
            <th className={`${TH} text-right`}>Servicios</th>
            <th className={`${TH} text-right`}>Flete</th>
            <th className={`${TH} text-right`}>Otros</th>
            <th className={`${TH} text-right`}>Total comprometido</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {costosComprometidos.length === 0 ? (
            <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">Sin costos comprometidos</td></tr>
          ) : costosComprometidos.map((c) => (
            <tr key={c.otId} className="hover:bg-gray-50 transition-colors">
              <td className="px-4 py-3.5 font-semibold text-gray-800 whitespace-nowrap">{c.numeroOT}</td>
              {["materiales", "servicios", "flete", "otros"].map((k) => (
                <td key={k} className="px-4 py-3.5 text-right text-gray-700 tabular-nums whitespace-nowrap">{money(c.comprometido[k], monedaVista)}</td>
              ))}
              <td className="px-4 py-3.5 text-right font-bold text-amber-700 tabular-nums whitespace-nowrap">{money(c.comprometido.total, monedaVista)}</td>
            </tr>
          ))}
          {costosComprometidos.length > 0 && (
            <tr className={FILA_TOTAL}>
              <td className="px-4 py-3 font-bold text-gray-700 uppercase text-xs tracking-wide">Total</td>
              {["materiales", "servicios", "flete", "otros", "total"].map((k) => (
                <td key={k} className={`${TF} ${k === "total" ? "text-amber-700" : ""}`}>{money(sumar(costosComprometidos, (c) => c.comprometido[k]), monedaVista)}</td>
              ))}
            </tr>
          )}
        </tbody>
      </Seccion>

      <Seccion titulo="Costo consumido" acento="bg-emerald-500" count={costosConsumidos.length}
        ayuda="Pagado por Tesorería + horas hombre y máquina">
        <thead className="bg-gray-50 text-xs uppercase tracking-wide border-b-2 border-gray-200">
          <tr>
            <th className={`${TH} text-left`}>N° OT</th>
            <th className={`${TH} text-right`}>HH</th>
            <th className={`${TH} text-right`}>HM</th>
            <th className={`${TH} text-right`}>Materiales</th>
            <th className={`${TH} text-right`}>Servicios</th>
            <th className={`${TH} text-right`}>Flete</th>
            <th className={`${TH} text-right`}>Otros</th>
            <th className={`${TH} text-right`}>Total consumido</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {costosConsumidos.length === 0 ? (
            <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">Sin costos consumidos</td></tr>
          ) : costosConsumidos.map((c) => (
            <tr key={c.otId} className="hover:bg-gray-50 transition-colors">
              <td className="px-4 py-3.5 font-semibold text-gray-800 whitespace-nowrap">{c.numeroOT}</td>
              {["hh", "hm", "materiales", "servicios", "flete", "otros"].map((k) => (
                <td key={k} className="px-4 py-3.5 text-right text-gray-700 tabular-nums whitespace-nowrap">{money(c.consumido[k], monedaVista)}</td>
              ))}
              <td className="px-4 py-3.5 text-right font-bold text-emerald-700 tabular-nums whitespace-nowrap">{money(c.consumido.total, monedaVista)}</td>
            </tr>
          ))}
          {costosConsumidos.length > 0 && (
            <tr className={FILA_TOTAL}>
              <td className="px-4 py-3 font-bold text-gray-700 uppercase text-xs tracking-wide">Total</td>
              {["hh", "hm", "materiales", "servicios", "flete", "otros", "total"].map((k) => (
                <td key={k} className={`${TF} ${k === "total" ? "text-emerald-700" : ""}`}>{money(sumar(costosConsumidos, (c) => c.consumido[k]), monedaVista)}</td>
              ))}
            </tr>
          )}
        </tbody>
      </Seccion>

      {/* 4. Órdenes de Compra sin HES / Acta de Conformidad */}
      <Seccion titulo="Órdenes de Compra sin HES / Acta de Conformidad" acento="bg-amber-500" count={data.ocSinHesActa.length}>
        <thead className="bg-gray-50 text-xs uppercase tracking-wide border-b-2 border-gray-200">
          <tr>
            <th className={`${TH} text-left`}>N° Orden</th>
            <th className={`${TH} text-left`}>Código</th>
            <th className={`${TH} text-left`}>Empresa</th>
            <th className={`${TH} text-center`}>HES</th>
            <th className={`${TH} text-center`}>Acta de Conformidad</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {data.ocSinHesActa.length === 0 ? (
            <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">Sin datos</td></tr>
          ) : data.ocSinHesActa.map((o) => (
            <tr key={o.ocId} className="hover:bg-gray-50 transition-colors">
              <td className="px-4 py-3.5 font-semibold text-gray-800 whitespace-nowrap">{o.numeroOrden}</td>
              <td className="px-4 py-3.5 text-gray-600 whitespace-nowrap">{o.codigo}</td>
              <td className="px-4 py-3.5 text-gray-700">{nombreEmpresa(o.empresa)}</td>
              <td className="px-4 py-3.5 text-center"><PillFalta falta={o.faltaHes} label="HES" /></td>
              <td className="px-4 py-3.5 text-center"><PillFalta falta={o.faltaActa} label="Acta" /></td>
            </tr>
          ))}
        </tbody>
      </Seccion>

      {/* 5. Ranking de OT por Cliente */}
      <Seccion titulo="Ranking de OT por Cliente" acento="bg-purple-500" count={data.ranking.length}>
        <thead className="bg-gray-50 text-xs uppercase tracking-wide border-b-2 border-gray-200">
          <tr>
            <th className={`${TH} text-left`}>Empresa</th>
            <th className={`${TH} text-right`}>Cantidad OT</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {data.ranking.length === 0 ? (
            <tr><td colSpan={2} className="px-4 py-8 text-center text-gray-400">Sin datos</td></tr>
          ) : data.ranking.map((r, i) => (
            <tr key={r.empresa?._id || i} className="hover:bg-gray-50 transition-colors">
              <td className="px-4 py-3.5 text-gray-700">{nombreEmpresa(r.empresa)}</td>
              <td className="px-4 py-3.5 text-right font-bold text-gray-900 tabular-nums">{r.cantidadOT}</td>
            </tr>
          ))}
          {data.ranking.length > 0 && (
            <tr className={FILA_TOTAL}>
              <td className="px-4 py-3 font-bold text-gray-700 uppercase text-xs tracking-wide">Total</td>
              <td className={TF}>{sumar(data.ranking, "cantidadOT")}</td>
            </tr>
          )}
        </tbody>
      </Seccion>

      {/* 6. Mora de Pago por Cliente */}
      <Seccion titulo="Mora de Pago por Cliente" acento="bg-red-500" count={data.mora.length}>
        <thead className="bg-gray-50 text-xs uppercase tracking-wide border-b-2 border-gray-200">
          <tr>
            <th className={`${TH} text-left`}>Código</th>
            <th className={`${TH} text-left`}>N° Factura</th>
            <th className={`${TH} text-left`}>Empresa</th>
            <th className={`${TH} text-center`}>Cuota</th>
            <th className={`${TH} text-right`}>Monto</th>
            <th className={`${TH} text-left`}>Fecha Vencimiento</th>
            <th className={`${TH} text-center`}>Estado</th>
            <th className={`${TH} text-right`}>Días Atraso</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {data.mora.length === 0 ? (
            <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">Sin datos</td></tr>
          ) : data.mora.map((m, i) => (
            <tr key={`${m.facturaId}-${m.cuota ?? "u"}-${i}`} className="hover:bg-gray-50 transition-colors">
              <td className="px-4 py-3.5 text-gray-600 whitespace-nowrap">{m.codigo}</td>
              <td className="px-4 py-3.5 font-semibold text-gray-800 whitespace-nowrap">{m.numeroFactura}</td>
              <td className="px-4 py-3.5 text-gray-700">{nombreEmpresa(m.empresa)}</td>
              <td className="px-4 py-3.5 text-center text-gray-600 whitespace-nowrap">{m.cuota != null ? `Cuota ${m.cuota}` : "—"}</td>
              <td className="px-4 py-3.5 text-right font-semibold text-gray-800 tabular-nums whitespace-nowrap">{money(m.monto, m.moneda)}</td>
              <td className="px-4 py-3.5 text-gray-600 whitespace-nowrap">{fecha(m.fechaVencimiento)}</td>
              <td className="px-4 py-3.5 text-center">
                <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full uppercase tracking-wide whitespace-nowrap ${estadoMoraClase(m.estado)}`}>
                  {m.estado}
                </span>
              </td>
              <td className="px-4 py-3.5 text-right font-bold text-gray-900 tabular-nums">{m.diasAtraso}</td>
            </tr>
          ))}
          {data.mora.length > 0 && (
            <>
              <FilaTotalMora etiqueta="Total facturado" suma={sumaPorMoneda(data.mora)} />
              <FilaTotalMora etiqueta="Total no pagado" suma={sumaPorMoneda(data.mora.filter((m) => m.estado !== "Pagó"))} />
            </>
          )}
        </tbody>
      </Seccion>
    </div>
  );
}

// Las columnas de la OC (sin IGV, costo de la cadena, margen) se suman una vez por cadena.
function TotalCostos({ costos, moneda }) {
  const cadenas = costos.filter((c) => c.primeraDeCadena !== false);
  const margenes = cadenas.filter((c) => c.margen != null);
  const margen = sumar(margenes, "margen");
  return (
    <tr className={FILA_TOTAL}>
      <td colSpan={4} className="px-4 py-3 text-right font-bold text-gray-700 uppercase text-xs tracking-wide">Total</td>
      <td className={`${TF} text-amber-700`}>{money(sumar(costos, (c) => c.comprometido.total), moneda)}</td>
      <td className={`${TF} text-emerald-700`}>{money(sumar(costos, (c) => c.consumido.total), moneda)}</td>
      <td className={TF}>{money(sumar(costos, "costoTotal"), moneda)}</td>
      <td className={`${TF} border-l border-gray-200`}>{money(sumar(cadenas, "ocSubtotal"), moneda)}</td>
      <td className={TF}>{money(sumar(cadenas, "costoCadena"), moneda)}</td>
      <td className={`${TF} ${margen >= 0 ? "text-green-600" : "text-red-600"}`}>{margenes.length ? money(margen, moneda) : "—"}</td>
    </tr>
  );
}

function FilaTotalMora({ etiqueta, suma }) {
  return (
    <tr className={FILA_TOTAL}>
      <td colSpan={4} className="px-4 py-3 text-right font-bold text-gray-700 uppercase text-xs tracking-wide">{etiqueta}</td>
      <td className={TF}>
        {money(suma.PEN)}
        {suma.USD > 0 && <span className="block">{money(suma.USD, "USD")}</span>}
      </td>
      <td colSpan={3} />
    </tr>
  );
}
