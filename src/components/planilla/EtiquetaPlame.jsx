import { destinoPlame, ETIQUETA_PLAME } from "../../utils/planilla";

const CLASE = { rem: "bg-purple-50 text-purple-700", pdt: "bg-sky-50 text-sky-700", no: "bg-gray-100 text-gray-500" };

// `destino` fuerza «rem | pdt | no» (cuadros informativos); si no, sale del código del concepto.
export default function EtiquetaPlame({ codigo, noImportar, destino, texto }) {
  const d = destino || destinoPlame(codigo, noImportar);
  const e = ETIQUETA_PLAME[d];
  return <span title={e.ayuda} className={`ml-1.5 px-1.5 py-px rounded text-[10px] font-medium whitespace-nowrap align-middle ${CLASE[d]}`}>{texto || e.texto}</span>;
}

export function LeyendaPlame() {
  return (
    <p className="text-[11px] text-gray-400">
      Etiquetas: {Object.entries(ETIQUETA_PLAME).map(([k, e]) => <span key={k} className="mr-3"><b>{e.texto}</b>: {e.ayuda}</span>)}
    </p>
  );
}
