import { money } from "../../utils/compras";
import { FORMAS, totalesFilas } from "../../utils/abonos";
import TablaScroll from "../TablaScroll";

const NUM = "border border-gray-300 rounded-lg px-2 py-1.5 text-sm w-28 text-right tabular-nums focus:outline-none focus:ring-2 focus:ring-purple-300";

// Filas de un lote: en borrador el monto se corrige y la fila se puede quitar (se guarda con «Guardar»).
export default function TablaFilasLote({ filas, editables, editable, onMonto, onQuitar }) {
  const porId = new Map(filas.map((f) => [f.trabajador, f]));
  const vivas = editables.map((e) => ({ e, f: porId.get(e.trabajador) })).filter((x) => x.f);
  const t = totalesFilas(vivas.map(({ e, f }) => ({ forma: f.forma, monto: editable ? e.monto : f.monto })));

  return (
    <TablaScroll>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-gray-500 border-b">
            <th className="py-2 pr-3">Trabajador</th><th className="py-2 pr-3">Forma</th><th className="py-2 pr-3">Cuenta / CCI</th>
            <th className="py-2 pr-3 text-right">Monto</th>{editable && <th className="py-2" />}
          </tr>
        </thead>
        <tbody>
          {vivas.map(({ e, f }) => {
            const fuera = f.forma === "manual" || !(Number(editable ? e.monto : f.monto) > 0);
            return (
              <tr key={e.trabajador} className={`border-b border-gray-100 align-top ${fuera ? "bg-gray-50" : ""}`}>
                <td className="py-1.5 pr-3">{f.datos.nombre}<span className="block text-xs text-gray-400">{f.datos.tipoDoc} {f.datos.numDoc}</span></td>
                <td className="py-1.5 pr-3 text-xs">
                  {FORMAS[f.forma] || f.forma}
                  {f.error && <span className="block text-red-600">{f.error}</span>}
                  {fuera && !f.error && (f.forma === "manual"
                    ? <span className="block text-gray-500">Se paga por otro medio</span>
                    : <span className="block text-amber-700">Monto 0: no entra en el archivo</span>)}
                </td>
                <td className="py-1.5 pr-3 text-xs tabular-nums break-all">{f.forma === "cci" ? f.cci : f.cuenta || f.cci || "—"}{f.tipoCuenta && f.forma === "cuenta" ? ` · ${f.tipoCuenta}` : ""}</td>
                <td className="py-1.5 pr-3 text-right">
                  {editable
                    ? <input value={e.monto} inputMode="decimal" onChange={(ev) => onMonto(e.trabajador, ev.target.value.replace(/[^\d.]/g, ""))} className={NUM} />
                    : <span className="tabular-nums font-medium">{money(f.monto)}</span>}
                </td>
                {editable && (
                  <td className="py-1.5 text-right"><button type="button" onClick={() => onQuitar(e.trabajador)} className="text-xs text-red-600 hover:underline">Quitar</button></td>
                )}
              </tr>
            );
          })}
          {vivas.length === 0 && <tr><td colSpan={5} className="py-6 text-center text-gray-400 text-sm">El lote no tiene filas</td></tr>}
        </tbody>
        <tfoot>
          <tr className="font-semibold text-gray-700 text-xs">
            <td className="py-2 pr-3" colSpan={3}>
              En archivo: {t.filasEnArchivo} · Fuera del archivo: {t.filasFuera}
            </td>
            <td className="py-2 pr-3 text-right tabular-nums" colSpan={editable ? 2 : 1}>
              <span className="block">En archivo {money(t.enArchivo)}</span>
              <span className="block font-normal text-gray-500">Fuera {money(t.fueraDelArchivo)}</span>
              <span className="block text-sm">Total {money(t.total)}</span>
            </td>
          </tr>
        </tfoot>
      </table>
    </TablaScroll>
  );
}
