import { useState, useEffect, useCallback } from "react";
import { fetchAuth } from "../../utils/fetchAuth";
import { periodoDeMes, textoPeriodo } from "../../utils/bancos";
import TablaScroll from "../TablaScroll";
import AvisoAccion from "../AvisoAccion";

// Archivos de importación del PDT PLAME (formulario 0601) del mes: los de la planilla cerrada y los de los recibos por
// honorarios pagados en el mes. Se importan en el PDT; ONP y EsSalud no van en el archivo porque los calcula el PDT.
export default function PanelPlame({ mes, setMes }) {
  const periodo = periodoDeMes(mes);
  const [datos, setDatos] = useState(null);
  const [aviso, setAviso] = useState("");
  const [bajando, setBajando] = useState("");

  const cargar = useCallback(async () => {
    if (!/^\d{6}$/.test(periodo)) return;
    try {
      const r = await fetchAuth(`/planilla/${periodo}/plame`);
      const d = await r.json().catch(() => ({}));
      if (r.ok) setDatos(d); else { setDatos(null); setAviso(d.mensaje || "No se pudieron preparar los archivos."); }
    } catch {
      setAviso("Error de conexión con el servidor.");
    }
  }, [periodo]);
  useEffect(() => { const t = setTimeout(cargar, 200); return () => clearTimeout(t); }, [cargar]);

  const descargar = async (a) => {
    setBajando(a.ext);
    try {
      const r = await fetchAuth(`/planilla/${periodo}/plame/${a.ext}`);
      if (!r.ok) { const d = await r.json().catch(() => ({})); return setAviso(d.mensaje || "No se pudo descargar."); }
      const url = URL.createObjectURL(await r.blob());
      const enlace = document.createElement("a");
      enlace.href = url;
      enlace.download = a.archivo;
      enlace.click();
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
        Archivos de texto para importar en el <b>PDT Planilla Electrónica – PLAME</b> (formulario 0601). Los cuatro primeros salen de la planilla
        cerrada; los de 4.ª categoría, de los recibos por honorarios pagados en el mes. ONP y EsSalud no van en el archivo: los calcula el PDT.
        Antes de declarar, los trabajadores deben estar dados de alta en el T-Registro.
      </p>
      <div>
        <label className="text-xs text-gray-500 block">Mes</label>
        <input type="month" value={mes} onChange={(e) => setMes(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
      </div>
      {datos && (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-gray-700">Archivos de {textoPeriodo(periodo)}</h3>
          <TablaScroll>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 border-b"><th className="py-2 pr-3">Contenido</th><th className="py-2 pr-3">Registros</th><th className="py-2 pr-3">Archivo</th><th className="py-2" /></tr>
              </thead>
              <tbody>
                {datos.archivos.map((a) => (
                  <tr key={a.ext} className="border-b border-gray-100">
                    <td className="py-1.5 pr-3">{a.nombre}</td>
                    {a.error ? (
                      <td colSpan={3} className="py-1.5 text-amber-700 text-xs">{a.error}</td>
                    ) : (
                      <>
                        <td className="py-1.5 pr-3">{a.registros || "Sin registros"}</td>
                        <td className="py-1.5 pr-3 font-mono text-xs">{a.archivo}</td>
                        <td className="py-1.5 text-right">
                          {a.registros > 0 && <button onClick={() => descargar(a)} disabled={!!bajando} className="text-xs text-purple-600 hover:underline disabled:opacity-50">Descargar</button>}
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </TablaScroll>
          {datos.avisos.map((a) => <p key={a} className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">{a}</p>)}
        </section>
      )}
      {aviso && <AvisoAccion mensaje={aviso} onCerrar={() => setAviso("")} />}
    </div>
  );
}
