const ESTILO = {
  editando: "bg-blue-50 text-blue-800 border-blue-200",
  ocupado: "bg-amber-50 text-amber-800 border-amber-200",
  liberado: "bg-amber-50 text-amber-800 border-amber-200",
  desactualizado: "bg-amber-50 text-amber-800 border-amber-200",
  lectura: "bg-white/90 text-gray-600 border-gray-200",
};

// Cabecera de edición de un documento: "Editar", el aviso "En edición por …" o
// "Estás editando" con "Cancelar edición" (que descarta: onCancelar cierra el detalle).
export default function BarraEdicion({ bloqueo, puedeEditar = true, onCancelar, className = "" }) {
  const { estado, mensaje } = bloqueo;
  if (estado === "cargando") return null;
  return (
    <div className={`flex flex-wrap items-center gap-2 rounded-lg border px-3 py-1.5 text-xs ${ESTILO[estado] || ESTILO.lectura} ${className}`}>
      {estado === "editando" && <span className="font-semibold">Estás editando</span>}
      {estado === "lectura" && !mensaje && <span>Solo lectura</span>}
      {mensaje && <span>{mensaje}</span>}
      {puedeEditar && (estado === "lectura" || estado === "liberado") && (
        <button type="button" onClick={bloqueo.editar}
          className="ml-1 bg-blue-600 text-white px-3 py-1 rounded-md font-semibold hover:bg-blue-700">Editar</button>
      )}
      {estado === "editando" && (
        <button type="button" onClick={async () => { await bloqueo.cancelar(); onCancelar?.(); }}
          className="ml-1 border border-gray-300 bg-white text-gray-700 px-3 py-1 rounded-md hover:bg-gray-50">Cancelar edición</button>
      )}
    </div>
  );
}
