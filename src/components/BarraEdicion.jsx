const ESTILO = {
  editando: "bg-blue-50 text-blue-800 border-blue-200",
  ocupado: "bg-amber-50 text-amber-800 border-amber-200",
  liberado: "bg-amber-50 text-amber-800 border-amber-200",
  libre: "bg-amber-50 text-amber-800 border-amber-200",
  desactualizado: "bg-amber-50 text-amber-800 border-amber-200",
  error: "bg-red-50 text-red-700 border-red-200",
  lectura: "bg-white/90 text-gray-600 border-gray-200",
};

// Cabecera de edición de un documento: "Estás editando", el aviso "En edición por …"
// o el motivo de un error. Abrir = editar: no hay botón "Editar"; solo "Retomar
// edición" si el bloqueo propio venció (los cambios siguen en pantalla).
export default function BarraEdicion({ bloqueo, className = "" }) {
  const { estado, mensaje } = bloqueo;
  if (estado === "cargando") return null;
  return (
    <div className={`flex flex-wrap items-center gap-2 rounded-lg border px-3 py-1.5 text-xs ${ESTILO[estado] || ESTILO.lectura} ${className}`}>
      {estado === "editando" && <span className="font-semibold">Estás editando</span>}
      {estado === "lectura" && !mensaje && <span>Solo lectura</span>}
      {mensaje && <span>{mensaje}</span>}
      {estado === "liberado" && (
        <button type="button" onClick={bloqueo.editar}
          className="ml-1 bg-blue-600 text-white px-3 py-1 rounded-md font-semibold hover:bg-blue-700">Retomar edición</button>
      )}
      {estado === "error" && (
        <button type="button" onClick={bloqueo.reintentar}
          className="ml-1 border border-red-300 bg-white text-red-700 px-3 py-1 rounded-md hover:bg-red-50">Reintentar</button>
      )}
    </div>
  );
}
