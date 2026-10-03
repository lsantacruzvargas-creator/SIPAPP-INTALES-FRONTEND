import { useState, useEffect, useCallback } from "react";
import { fetchAuth } from "../../utils/fetchAuth";
import { mesAnteriorLima, periodoDeMes, textoPeriodo } from "../../utils/bancos";
import TablaScroll from "../TablaScroll";
import AvisoAccion from "../AvisoAccion";

const INP = "border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300";

// Libros electrónicos del PLE (C5 ligero): los .txt de un mes cerrado para validarlos y enviarlos con el programa PLE
// de SUNAT. Compras y Ventas no van aquí: se presentan por el SIRE.
export default function PanelLibrosPle() {
  const [mes, setMes] = useState(mesAnteriorLima());
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [bajando, setBajando] = useState("");
  const periodo = periodoDeMes(mes);

  const cargar = useCallback(async () => {
    if (!/^\d{6}$/.test(periodo)) return;
    try {
      const r = await fetchAuth(`/contabilidad/ple?periodo=${periodo}`);
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setDatos(null); return setError(d.mensaje || "No se pudo preparar el PLE."); }
      setError("");
      setDatos(d);
    } catch {
      setAviso("Error de conexión con el servidor.");
    }
  }, [periodo]);
  useEffect(() => { const t = setTimeout(cargar, 200); return () => clearTimeout(t); }, [cargar]);

  const descargar = async (l) => {
    setBajando(l.codigo);
    try {
      const r = await fetchAuth(`/contabilidad/ple/${l.codigo}?periodo=${periodo}`);
      if (!r.ok) { const d = await r.json().catch(() => ({})); return setAviso(d.mensaje || "No se pudo descargar."); }
      const url = URL.createObjectURL(await r.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = l.archivo;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch {
      setAviso("Error de conexión con el servidor.");
    } finally {
      setBajando("");
    }
  };

  return (
    <div className="space-y-5">
      <p className="text-sm text-gray-500">
        Archivos .txt de los libros electrónicos de un mes <b>cerrado</b>, con sus asientos contabilizados: Diario (5.1),
        Plan de cuentas (5.3), Mayor (6.1) y Caja y Bancos (1.1 efectivo, 1.2 cuentas corrientes). Se validan y envían
        con el programa PLE de SUNAT. Compras y Ventas se presentan por el SIRE.
      </p>
      <div>
        <label className="text-xs text-gray-500 block">Periodo</label>
        <input type="month" value={mes} onChange={(e) => setMes(e.target.value)} className={INP} />
      </div>
      {error && <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">{error}</p>}
      {datos && (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-gray-700">Libros de {textoPeriodo(periodo)}</h3>
          <TablaScroll>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 border-b">
                  <th className="py-2 pr-3">Libro</th><th className="py-2 pr-3">Registros</th><th className="py-2 pr-3">Archivo</th><th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {datos.libros.map((l) => (
                  <tr key={l.codigo} className="border-b border-gray-100 align-top">
                    <td className="py-1.5 pr-3">{l.nombre}</td>
                    {l.error ? (
                      <td colSpan={3} className="py-1.5 text-amber-700 text-xs">{l.error}</td>
                    ) : (
                      <>
                        <td className="py-1.5 pr-3">{l.registros || "Sin movimientos"}</td>
                        <td className="py-1.5 pr-3 font-mono text-xs">{l.archivo}</td>
                        <td className="py-1.5 text-right">
                          <button onClick={() => descargar(l)} disabled={!!bajando} className="text-xs text-purple-600 hover:underline disabled:opacity-50">Descargar</button>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </TablaScroll>
        </section>
      )}
      {aviso && <AvisoAccion mensaje={aviso} onCerrar={() => setAviso("")} />}
    </div>
  );
}
