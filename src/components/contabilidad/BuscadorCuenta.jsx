import { useState, useMemo } from "react";
import { filtrarPlan } from "../../utils/contabilidad";

// Campo de cuenta con sugerencias (código o nombre). Por defecto solo cuentas de movimiento activas.
export default function BuscadorCuenta({ cuentas, valor, onChange, soloMovimiento = true, placeholder = "Cuenta", className = "", disabled, permitirVacio = false }) {
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState(null);
  const actual = cuentas.find((c) => c.codigo === valor);
  const mostrado = texto ?? (actual ? `${actual.codigo} ${actual.nombre}` : valor || "");
  const opciones = useMemo(
    () => (abierto ? filtrarPlan(cuentas, texto ?? "", { soloMovimiento, verInactivas: false }).slice(0, 30) : []),
    [abierto, cuentas, texto, soloMovimiento]
  );
  const elegir = (c) => { onChange(c.codigo); setTexto(null); setAbierto(false); };
  return (
    <div className={`relative ${className}`}>
      <input value={mostrado} disabled={disabled} placeholder={placeholder}
        onFocus={() => { setAbierto(true); setTexto(""); }}
        onBlur={() => setTimeout(() => { setAbierto(false); setTexto(null); }, 150)}
        onChange={(e) => setTexto(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && opciones[0]) { e.preventDefault(); elegir(opciones[0]); } }}
        className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300 disabled:bg-gray-50" />
      {permitirVacio && valor && !disabled && (
        <button type="button" onClick={() => onChange("")} title="Quitar"
          className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-red-600 text-xs">✕</button>
      )}
      {abierto && opciones.length > 0 && (
        <ul className="absolute z-50 mt-1 w-80 max-h-64 overflow-auto bg-white border border-gray-200 rounded-lg shadow-lg text-sm">
          {opciones.map((c) => (
            <li key={c.codigo} onMouseDown={() => elegir(c)} className="px-3 py-1.5 hover:bg-purple-50 cursor-pointer">
              <span className="font-mono text-gray-700">{c.codigo}</span> <span className="text-gray-500">{c.nombre}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
