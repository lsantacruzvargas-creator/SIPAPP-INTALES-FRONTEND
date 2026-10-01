import { useState, useMemo } from "react";
import * as XLSX from "xlsx";
import { fetchAuth } from "../../utils/fetchAuth";
import { conBloqueo } from "../../utils/bloqueoApi";
import { arbolCuentas, filtrarPlan, cuentasDeFilasExcel, ELEMENTOS } from "../../utils/contabilidad";
import { exportarHoja } from "../../utils/exportarTabla";
import TablaScroll from "../TablaScroll";
import AvisoAccion from "../AvisoAccion";
import ModalCuenta from "./ModalCuenta";

const INP = "border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300";

export default function PanelPlanCuentas({ cuentas, onCambio, puedeEscribir }) {
  const [texto, setTexto] = useState("");
  const [soloMovimiento, setSoloMovimiento] = useState(false);
  const [verInactivas, setVerInactivas] = useState(false);
  const [modal, setModal] = useState(null); // { cuenta } editar | { padre } crear
  const [aviso, setAviso] = useState("");
  const [importando, setImportando] = useState(false);

  const filas = useMemo(
    () => arbolCuentas(filtrarPlan(cuentas, texto, { soloMovimiento, verInactivas })),
    [cuentas, texto, soloMovimiento, verInactivas]
  );

  const cambiarActiva = async (c) => {
    try {
      const r = await conBloqueo("cuentaContable", c._id, (h) => fetchAuth(`/contabilidad/cuentas/${c._id}/activa`, {
        method: "PATCH", headers: h, body: JSON.stringify({ activa: !c.activa }),
      }));
      if (!r.ok) return setAviso((await r.json().catch(() => ({}))).mensaje || "No se pudo cambiar la cuenta.");
      onCambio();
    } catch {
      setAviso("Error de conexión con el servidor.");
    }
  };

  // Plan del contador en Excel: una hoja con columnas Código y Nombre/Descripción.
  const importar = async (e) => {
    const archivo = e.target.files?.[0];
    e.target.value = "";
    if (!archivo) return;
    setImportando(true);
    try {
      const libro = XLSX.read(await archivo.arrayBuffer());
      const filasExcel = XLSX.utils.sheet_to_json(libro.Sheets[libro.SheetNames[0]], { defval: "" });
      const nuevas = cuentasDeFilasExcel(filasExcel);
      if (!nuevas.length) return setAviso("No se encontraron cuentas: la hoja debe tener columnas \"Código\" y \"Nombre\" (o \"Descripción\").");
      const r = await fetchAuth("/contabilidad/cuentas/importar", { method: "POST", body: JSON.stringify({ cuentas: nuevas }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) return setAviso(d.mensaje || "No se pudo importar el plan.");
      const errores = d.errores.length
        ? ` No se importaron ${d.errores.length}: ${d.errores.slice(0, 5).map((x) => `${x.codigo} (${x.mensaje})`).join("; ")}${d.errores.length > 5 ? "…" : ""}`
        : "";
      setAviso(`Cuentas creadas: ${d.creadas}. Ya existían: ${d.existentes}.${errores}`);
      onCambio();
    } catch {
      setAviso("No se pudo leer el archivo: usa un Excel (.xlsx o .xls) o CSV.");
    } finally {
      setImportando(false);
    }
  };

  const exportar = () => exportarHoja("plan-de-cuentas.xlsx", "Plan de cuentas", arbolCuentas(cuentas).map((c) => ({
    "Código": c.codigo, "Nombre": c.nombre, "Naturaleza": c.naturaleza, "De movimiento": c.deMovimiento ? "Sí" : "No",
    "Exige C. costo": c.exigeCentroCosto ? "Sí" : "No", "Exige tercero": c.exigeTercero ? "Sí" : "No",
    "Destino debe": c.destino?.debe || "", "Destino haber": c.destino?.haber || "", "Activa": c.activa ? "Sí" : "No",
  })));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Buscar por código o nombre" className={`${INP} w-72`} />
        <label className="text-sm text-gray-600 flex items-center gap-1.5">
          <input type="checkbox" checked={soloMovimiento} onChange={(e) => setSoloMovimiento(e.target.checked)} /> Solo de movimiento
        </label>
        <label className="text-sm text-gray-600 flex items-center gap-1.5">
          <input type="checkbox" checked={verInactivas} onChange={(e) => setVerInactivas(e.target.checked)} /> Ver desactivadas
        </label>
        <div className="flex-1" />
        <button onClick={exportar} className="border border-gray-300 text-gray-700 px-3 py-2 rounded-lg text-sm hover:bg-gray-50">Exportar Excel</button>
        {puedeEscribir && (
          <>
            <label className={`border border-purple-300 text-purple-700 px-3 py-2 rounded-lg text-sm hover:bg-purple-50 cursor-pointer ${importando ? "opacity-50 pointer-events-none" : ""}`}
              title="Excel con columnas Código y Nombre: crea las cuentas que falten sin tocar las existentes">
              {importando ? "Importando…" : "Importar plan (Excel)"}
              <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={importar} />
            </label>
            <button onClick={() => setModal({ padre: null })} className="bg-purple-600 text-white px-3 py-2 rounded-lg text-sm hover:bg-purple-700">+ Nueva cuenta</button>
          </>
        )}
      </div>
      <p className="text-xs text-gray-400">
        {cuentas.length} cuentas. Solo las cuentas de movimiento reciben asientos; crear una subcuenta convierte a su padre en cuenta de agrupación.
      </p>
      <TablaScroll>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-gray-500 border-b">
              <th className="py-2 pr-3">Código</th><th className="py-2 pr-3">Nombre</th><th className="py-2 pr-3">Naturaleza</th>
              <th className="py-2 pr-3">Movimiento</th><th className="py-2 pr-3">Exige</th><th className="py-2 pr-3">Destino</th><th className="py-2" />
            </tr>
          </thead>
          <tbody>
            {filas.map((c, i) => {
              const elemento = c.codigo[0];
              const cabecera = i === 0 || filas[i - 1].codigo[0] !== elemento;
              return [
                cabecera && (
                  <tr key={`el-${elemento}`} className="bg-gray-50">
                    <td colSpan={7} className="py-1.5 px-2 text-xs font-semibold text-gray-500 uppercase">{elemento} · {ELEMENTOS[elemento] || ""}</td>
                  </tr>
                ),
                <tr key={c._id} className={`border-b border-gray-100 ${c.activa ? "" : "text-gray-400"}`}>
                  <td className="py-1.5 pr-3 font-mono" style={{ paddingLeft: c.profundidad * 14 }}>{c.codigo}</td>
                  <td className={`py-1.5 pr-3 ${c.deMovimiento ? "" : "font-semibold text-gray-700"}`}>
                    {c.nombre}{!c.activa && <span className="ml-2 text-xs">(desactivada)</span>}
                  </td>
                  <td className="py-1.5 pr-3 text-xs">{c.naturaleza}</td>
                  <td className="py-1.5 pr-3 text-xs">{c.deMovimiento ? "Sí" : ""}</td>
                  <td className="py-1.5 pr-3 text-xs">{[c.exigeCentroCosto && "C. costo", c.exigeTercero && "Tercero"].filter(Boolean).join(", ")}</td>
                  <td className="py-1.5 pr-3 text-xs font-mono">{c.destino?.debe ? `${c.destino.debe} / ${c.destino.haber}` : ""}</td>
                  <td className="py-1.5 text-right whitespace-nowrap">
                    {puedeEscribir && (
                      <>
                        <button onClick={() => setModal({ padre: c })} className="text-xs text-purple-600 hover:underline mr-3">+ Subcuenta</button>
                        <button onClick={() => setModal({ cuenta: c })} className="text-xs text-gray-600 hover:underline mr-3">Editar</button>
                        <button onClick={() => cambiarActiva(c)} className="text-xs text-gray-500 hover:underline">{c.activa ? "Desactivar" : "Activar"}</button>
                      </>
                    )}
                  </td>
                </tr>,
              ];
            })}
          </tbody>
        </table>
      </TablaScroll>
      {modal && (
        <ModalCuenta cuenta={modal.cuenta} padre={modal.padre} cuentas={cuentas}
          onClose={() => setModal(null)} onGuardada={() => { setModal(null); onCambio(); }} />
      )}
      {aviso && <AvisoAccion mensaje={aviso} onCerrar={() => setAviso("")} />}
    </div>
  );
}
