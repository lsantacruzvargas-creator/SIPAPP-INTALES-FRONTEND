import { useState, useEffect } from "react";
import { fetchAuth } from "../utils/fetchAuth";
import { formatearFecha } from "../utils/fecha";
import { money } from "../components/detalleShared";
import TablaScroll from "../components/TablaScroll";
import * as XLSX from "xlsx";

const TH = "px-4 py-3 font-semibold text-gray-500 whitespace-nowrap";
const VACIO = { facturacion: [], valorizado: { total: 0, materiales: [] }, costosFabricacion: [], ocSinHesActa: [], ranking: [], mora: [] };

const nombreEmpresa = (e) => e?.razonSocial || "Sin empresa";
const fecha = (f) => f ? formatearFecha(f) : "—";

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

function Seccion({ titulo, acento, count, children }) {
  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-3">
        <span className={`w-1.5 h-5 rounded-full ${acento}`} />
        <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wide">{titulo}</h3>
        <span className="text-xs text-gray-400">({count})</span>
      </div>
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <TablaScroll className="overflow-x-auto">
          <table className="w-full text-sm">{children}</table>
        </TablaScroll>
      </div>
    </div>
  );
}

export default function Reportes() {
  const [data, setData]         = useState(VACIO);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    Promise.all([
      fetchAuth("/reportes/facturacion-por-empresa").then((r) => r.ok ? r.json() : []),
      fetchAuth("/reportes/valorizado-almacen").then((r) => r.ok ? r.json() : { total: 0, materiales: [] }),
      fetchAuth("/reportes/costos-fabricacion").then((r) => r.ok ? r.json() : []),
      fetchAuth("/reportes/oc-sin-hes-acta").then((r) => r.ok ? r.json() : []),
      fetchAuth("/reportes/ranking-ot-cliente").then((r) => r.ok ? r.json() : []),
      fetchAuth("/reportes/mora-pago").then((r) => r.ok ? r.json() : []),
    ]).then(([facturacion, valorizado, costosFabricacion, ocSinHesActa, ranking, mora]) => {
      setData({ facturacion, valorizado, costosFabricacion, ocSinHesActa, ranking, mora });
      setCargando(false);
    });
  }, []);

  const exportarExcel = async () => {
    // El detalle de compras solo va en el Excel: se pide recién al exportar.
    const detalleCompras = await fetchAuth("/reportes/detalle-compras").then((r) => (r.ok ? r.json() : []));
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
    // Los datos de la OC van solo en la primera OT de cada cadena, para que
    // sumar las columnas de OC/margen no cuente la misma OC dos veces.
    // Montos vacíos como celda vacía (no "—"), para que sigan siendo numéricos.
    const filaCostoFabricacion = (c) => ({
      "N° OT":              c.numeroOT,
      "N° Orden de Compra": c.numeroOrdenCompra || "",
      "Titulo":             c.titulo,
      "Empresa":            nombreEmpresa(c.empresa),
      "HH (S/)":            c.costoHH,
      "HM (S/)":            c.costoHM,
      "Materiales (S/)":    c.costoMateriales,
      "Servicios (S/)":     c.costoServicios,
      "Gasto OT (S/)":      c.costoFabricacion,
      "Moneda OC":          c.primeraDeCadena ? c.ocMoneda || "" : "",
      "OC sin IGV":         c.primeraDeCadena ? c.ocSubtotal : null,
      "Gasto total OC":     c.primeraDeCadena ? c.gastoCadena : null,
      "T.C.":               c.primeraDeCadena ? c.tipoCambio : null,
      "Margen OC":          c.primeraDeCadena ? c.margen : null,
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
      "Estado de pago":       c.estadoPago === "pagado" ? "Pagado" : "Pendiente de pago",
      "Fecha de pago":        c.fechaPago ? fecha(c.fechaPago) : "",
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
      "Monto":             m.monto,
      "Fecha Vencimiento": fecha(m.fechaVencimiento),
      "Estado":            m.estado,
      "Dias Atraso":       m.diasAtraso,
    });

    [
      ["Facturacion x Empresa", data.facturacion.map(filaFacturacion)],
      ["Valorizado Almacen",    data.valorizado.materiales.map(filaMaterial)],
      ["Costos de Fabricacion", data.costosFabricacion.map(filaCostoFabricacion)],
      ["Detalle de compras",    detalleCompras.map(filaCompra)],
      ["OC sin HES-Acta",       data.ocSinHesActa.map(filaOCsinHesActa)],
      ["Ranking OT Cliente",    data.ranking.map(filaRanking)],
      ["Mora de Pago",          data.mora.map(filaMora)],
    ].forEach(([nombre, filas]) => {
      const ws = filas.length ? XLSX.utils.json_to_sheet(filas) : XLSX.utils.aoa_to_sheet([["Sin datos"]]);
      XLSX.utils.book_append_sheet(wb, ws, nombre);
    });

    XLSX.writeFile(wb, "reportes.xlsx");
  };

  if (cargando) {
    return <div className="p-8 text-sm text-gray-400">Cargando reportes…</div>;
  }

  return (
    <div className="p-6 mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-bold text-gray-800">Reportes</h2>
          <p className="text-xs text-gray-400 mt-0.5">Indicadores generales del negocio</p>
        </div>
        <button onClick={exportarExcel}
          className="border border-gray-300 text-gray-600 px-4 py-2 rounded-lg text-sm hover:bg-gray-50 transition">
          Exportar Excel
        </button>
      </div>

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
              </tbody>
            </table>
          </TablaScroll>
        </div>
      </div>

      {/* 3. Costos de Fabricación por OT */}
      <Seccion titulo="Costos de Fabricación" acento="bg-indigo-500" count={data.costosFabricacion.length}>
        <thead className="bg-gray-50 text-xs uppercase tracking-wide border-b-2 border-gray-200">
          <tr>
            <th className={`${TH} text-left`}>N° OT</th>
            <th className={`${TH} text-left`}>N° OC</th>
            <th className={`${TH} text-left`}>Título</th>
            <th className={`${TH} text-left`}>Empresa</th>
            <th className={`${TH} text-right`}>HH</th>
            <th className={`${TH} text-right`}>HM</th>
            <th className={`${TH} text-right`}>Materiales</th>
            <th className={`${TH} text-right`}>Servicios</th>
            <th className={`${TH} text-right`}>Gasto OT (S/)</th>
            <th className={`${TH} text-right border-l border-gray-200`}>OC sin IGV</th>
            <th className={`${TH} text-right`}>Gasto total OC</th>
            <th className={`${TH} text-right`}>Margen OC</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {data.costosFabricacion.length === 0 ? (
            <tr><td colSpan={12} className="px-4 py-8 text-center text-gray-400">Sin datos</td></tr>
          ) : data.costosFabricacion.map((c) => (
            <tr key={c.otId} className="hover:bg-gray-50 transition-colors">
              <td className="px-4 py-3.5 font-semibold text-gray-800 whitespace-nowrap">{c.numeroOT}</td>
              <td className="px-4 py-3.5 text-gray-600 whitespace-nowrap">{c.numeroOrdenCompra || "—"}</td>
              <td className="px-4 py-3.5 text-gray-600">{c.titulo}</td>
              <td className="px-4 py-3.5 text-gray-700">{nombreEmpresa(c.empresa)}</td>
              <td className="px-4 py-3.5 text-right font-semibold text-gray-800 tabular-nums whitespace-nowrap">{money(c.costoHH)}</td>
              <td className="px-4 py-3.5 text-right font-semibold text-gray-800 tabular-nums whitespace-nowrap">{money(c.costoHM)}</td>
              <td className="px-4 py-3.5 text-right font-semibold text-gray-800 tabular-nums whitespace-nowrap">{money(c.costoMateriales)}</td>
              <td className="px-4 py-3.5 text-right font-semibold text-gray-800 tabular-nums whitespace-nowrap">{money(c.costoServicios)}</td>
              <td className="px-4 py-3.5 text-right font-bold text-gray-900 tabular-nums whitespace-nowrap">{money(c.costoFabricacion)}</td>
              {c.primeraDeCadena && (
                <>
                  <td rowSpan={c.otsEnCadena} className="px-4 py-3.5 text-right font-semibold text-gray-800 tabular-nums whitespace-nowrap align-top border-l border-gray-200">
                    {c.ocSubtotal != null ? money(c.ocSubtotal, c.ocMoneda) : "—"}
                  </td>
                  <td rowSpan={c.otsEnCadena} className="px-4 py-3.5 text-right font-semibold text-gray-800 tabular-nums whitespace-nowrap align-top">
                    {c.gastoCadena != null ? money(c.gastoCadena, c.ocMoneda || "PEN") : "—"}
                    {c.otsEnCadena > 1 && <p className="text-[11px] font-normal text-gray-400">{c.otsEnCadena} OTs</p>}
                    {c.tipoCambio && <p className="text-[11px] font-normal text-gray-400">T.C. {c.tipoCambio}</p>}
                  </td>
                  <td rowSpan={c.otsEnCadena} className={`px-4 py-3.5 text-right font-bold tabular-nums whitespace-nowrap align-top ${c.margen == null ? "text-gray-400" : c.margen >= 0 ? "text-green-600" : "text-red-600"}`}>
                    {c.margen != null ? money(c.margen, c.ocMoneda) : c.ocMoneda === "USD" ? "Sin T.C." : "—"}
                  </td>
                </>
              )}
            </tr>
          ))}
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
              <td className="px-4 py-3.5 text-right font-semibold text-gray-800 tabular-nums whitespace-nowrap">{money(m.monto)}</td>
              <td className="px-4 py-3.5 text-gray-600 whitespace-nowrap">{fecha(m.fechaVencimiento)}</td>
              <td className="px-4 py-3.5 text-center">
                <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full uppercase tracking-wide whitespace-nowrap ${estadoMoraClase(m.estado)}`}>
                  {m.estado}
                </span>
              </td>
              <td className="px-4 py-3.5 text-right font-bold text-gray-900 tabular-nums">{m.diasAtraso}</td>
            </tr>
          ))}
        </tbody>
      </Seccion>
    </div>
  );
}
