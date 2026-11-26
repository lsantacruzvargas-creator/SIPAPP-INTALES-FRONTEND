import { useEffect, useState } from "react";

// Igual que ConfirmacionAccion pero pide un texto antes de confirmar (motivo
// de anulación/rechazo, etc.) — reemplaza window.prompt() por el mismo
// motivo (ver ConfirmacionAccion.jsx): en Electron, el diálogo nativo puede
// dejar la ventana sin foco de teclado/mouse al cerrarse.
// `error`: si la acción falla, el llamador lo pasa aquí — el mensaje de la
// página quedaría detrás de este overlay y el usuario no lo vería.
export default function PromptAccion({
  titulo, label = "Motivo", placeholder, onCancelar, onConfirmar, procesando,
  textoConfirmar = "Confirmar", textoProcesando = "Procesando…", peligro = false,
  minLength = 1, maxLength, error,
}) {
  const [valor, setValor] = useState("");
  const largo = valor.trim().length;
  const valido = largo >= minLength && (!maxLength || largo <= maxLength);

  useEffect(() => {
    const alPulsar = (e) => { if (e.key === "Escape" && !procesando) onCancelar(); };
    window.addEventListener("keydown", alPulsar);
    return () => window.removeEventListener("keydown", alPulsar);
  }, [onCancelar, procesando]);

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-sm">
        {titulo && <h3 className="font-semibold text-gray-800 mb-3">{titulo}</h3>}
        <label className="text-xs text-gray-500 block mb-1">{label}</label>
        <textarea
          autoFocus
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          rows={3}
          maxLength={maxLength}
          placeholder={placeholder}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400 resize-none"
        />
        <p className="text-[11px] text-gray-400 mt-1 mb-4">
          {minLength > 1 && largo < minLength ? `Mínimo ${minLength} caracteres.` : ""}
          {maxLength ? ` ${largo}/${maxLength}` : ""}
        </p>
        {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-4">{error}</p>}
        <div className="flex justify-end gap-3">
          <button onClick={onCancelar} disabled={procesando}
            className="border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm hover:bg-gray-50 transition disabled:opacity-50">
            Cancelar
          </button>
          <button onClick={() => onConfirmar(valor.trim())} disabled={procesando || !valido}
            className={`${peligro ? "bg-red-600 hover:bg-red-700" : "bg-gray-900 hover:bg-gray-700"} text-white px-4 py-2 rounded-lg text-sm transition disabled:opacity-50`}>
            {procesando ? textoProcesando : textoConfirmar}
          </button>
        </div>
      </div>
    </div>
  );
}
