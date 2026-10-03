import { useState, useEffect } from "react";
import { AYUDA, ORDEN_AYUDA, buscarAyuda } from "../../utils/ayudaContabilidad";

// Panel lateral derecho con la ayuda de Contabilidad: abre en la sección de la pestaña actual; se puede buscar un
// término o ver las demás secciones. Se cierra con ✕, Escape o clic fuera.
export default function PanelAyuda({ seccionInicial, onCerrar }) {
  const [seccion, setSeccion] = useState(seccionInicial in AYUDA ? seccionInicial : "general");
  const [texto, setTexto] = useState("");
  useEffect(() => {
    const alPresionar = (e) => { if (e.key === "Escape") onCerrar(); };
    window.addEventListener("keydown", alPresionar);
    return () => window.removeEventListener("keydown", alPresionar);
  }, [onCerrar]);

  const resultados = buscarAyuda(texto);
  const s = AYUDA[seccion];
  const buscando = texto.trim().length > 0;

  return (
    <div className="fixed inset-0 z-[150] flex justify-end">
      <div className="absolute inset-0 bg-black/20" onClick={onCerrar} />
      <aside role="dialog" aria-label="Ayuda de Contabilidad"
        className="relative h-full w-full sm:w-[28rem] bg-white shadow-2xl flex flex-col">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-200">
          <h2 className="font-semibold text-gray-800 flex-1">Ayuda de Contabilidad</h2>
          <button onClick={onCerrar} aria-label="Cerrar ayuda" className="text-gray-400 hover:text-gray-700 text-lg leading-none">✕</button>
        </div>
        <div className="px-5 py-3 border-b border-gray-100 space-y-2">
          <input autoFocus value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Buscar un término (ej. CUO, detracción)"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300" />
          {!buscando && (
            <div className="flex flex-wrap gap-1">
              {ORDEN_AYUDA.map((k) => (
                <button key={k} onClick={() => setSeccion(k)}
                  className={`px-2 py-1 rounded-md text-xs ${seccion === k ? "bg-purple-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
                  {AYUDA[k].titulo}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {buscando ? (
            resultados.length ? (
              <dl className="space-y-3">
                {resultados.map((t) => (
                  <div key={`${t.seccion}-${t.termino}`}>
                    <dt className="text-sm font-semibold text-gray-800">{t.termino} <span className="text-xs font-normal text-gray-400">· {t.seccion}</span></dt>
                    <dd className="text-sm text-gray-600 mt-0.5">{t.definicion}</dd>
                  </div>
                ))}
              </dl>
            ) : <p className="text-sm text-gray-400">No hay términos con «{texto.trim()}».</p>
          ) : (
            <>
              <p className="text-sm text-gray-500 mb-4">{s.descripcion}</p>
              <dl className="space-y-3">
                {s.terminos.map((t) => (
                  <div key={t.termino}>
                    <dt className="text-sm font-semibold text-gray-800">{t.termino}</dt>
                    <dd className="text-sm text-gray-600 mt-0.5">{t.definicion}</dd>
                  </div>
                ))}
              </dl>
            </>
          )}
        </div>
      </aside>
    </div>
  );
}
