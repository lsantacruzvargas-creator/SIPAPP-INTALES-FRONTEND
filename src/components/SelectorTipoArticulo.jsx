import { useState, useEffect } from "react";
import { fetchAuth } from "../utils/fetchAuth";

const normalizar = (t = "") => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
const porNombre = (a, b) => a.nombre.localeCompare(b.nombre, "es");
const INP = "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300";

// Buscador del catálogo Tipos de Artículo con alta al vuelo ("+ Agregar").
// Si el padre ya cargó el catálogo lo pasa en `tipos` y recibe los nuevos
// por `onTipoCreado`; si no, el componente lo carga solo.
export default function SelectorTipoArticulo({ value, onChange, multiple = false, tipos: tiposPadre, onTipoCreado, placeholder = "Buscar o agregar tipo…" }) {
  const [tiposPropios, setTiposPropios] = useState([]);
  const tipos = tiposPadre ?? tiposPropios;
  const [texto, setTexto] = useState("");
  const [abierto, setAbierto] = useState(false);
  const [creando, setCreando] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (tiposPadre) return;
    fetchAuth("/tipos-articulo").then((r) => (r.ok ? r.json() : [])).then(setTiposPropios);
  }, [tiposPadre]);

  const seleccionados = multiple ? (value || []).map(String) : value ? [String(value)] : [];
  const q = normalizar(texto);
  const sugerencias = tipos
    .filter((t) => !seleccionados.includes(String(t._id)) && (!q || normalizar(t.nombre).includes(q)))
    .slice(0, 8);
  const existeExacto = tipos.some((t) => normalizar(t.nombre) === q);
  const nombreDe = (id) => tipos.find((t) => String(t._id) === id)?.nombre || "…";

  const elegir = (tipo) => {
    if (multiple) onChange([...seleccionados, String(tipo._id)]);
    else onChange(String(tipo._id), tipo);
    setTexto("");
    setAbierto(false);
  };

  const quitar = (id) => (multiple ? onChange(seleccionados.filter((x) => x !== id)) : onChange("", null));

  const crear = async () => {
    setCreando(true);
    setError("");
    const r = await fetchAuth("/tipos-articulo", { method: "POST", body: JSON.stringify({ nombre: texto }) });
    setCreando(false);
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      setError(d.mensaje || "No se pudo crear el tipo de artículo");
      return;
    }
    const tipo = await r.json();
    if (!tipos.some((t) => t._id === tipo._id)) {
      if (tiposPadre) onTipoCreado?.(tipo);
      else setTiposPropios((prev) => [...prev, tipo].sort(porNombre));
    }
    elegir(tipo);
  };

  const mostrarElegido = !multiple && seleccionados.length > 0 && !abierto;

  return (
    <div className="relative">
      {multiple && seleccionados.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-1.5">
          {seleccionados.map((id) => (
            <span key={id} className="inline-flex items-center gap-1 text-xs bg-indigo-50 text-indigo-700 rounded-full px-2 py-0.5">
              {nombreDe(id)}
              <button type="button" onClick={() => quitar(id)} className="hover:text-red-500">✕</button>
            </span>
          ))}
        </div>
      )}
      {mostrarElegido ? (
        <div className={`${INP} flex items-center justify-between gap-2 cursor-pointer`} onClick={() => setAbierto(true)}>
          <span className="truncate">{nombreDe(seleccionados[0])}</span>
          <button type="button" onClick={(e) => { e.stopPropagation(); quitar(seleccionados[0]); }}
            className="text-gray-300 hover:text-red-500">✕</button>
        </div>
      ) : (
        <input
          value={texto}
          autoFocus={!multiple && abierto}
          onChange={(e) => { setTexto(e.target.value); setAbierto(true); }}
          onFocus={() => setAbierto(true)}
          onBlur={() => setAbierto(false)}
          placeholder={placeholder}
          className={INP}
        />
      )}
      {abierto && (sugerencias.length > 0 || (q && !existeExacto)) && (
        <ul className="absolute z-[90] left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-56 overflow-y-auto text-sm">
          {sugerencias.map((t) => (
            <li key={t._id}>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => elegir(t)}
                className="w-full text-left px-3 py-1.5 hover:bg-gray-50">{t.nombre}</button>
            </li>
          ))}
          {q && !existeExacto && (
            <li>
              <button type="button" disabled={creando} onMouseDown={(e) => e.preventDefault()} onClick={crear}
                className="w-full text-left px-3 py-1.5 text-blue-600 hover:bg-blue-50 disabled:opacity-50">
                {creando ? "Agregando…" : `+ Agregar "${texto.trim()}"`}
              </button>
            </li>
          )}
        </ul>
      )}
      {error && <p className="text-[11px] text-red-500 mt-1">{error}</p>}
    </div>
  );
}
