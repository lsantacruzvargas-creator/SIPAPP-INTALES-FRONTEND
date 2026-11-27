import { useEffect } from "react";

// Confirmación propia (NO window.confirm) — en la app de Electron, el
// diálogo nativo de window.confirm() puede dejar la ventana sin foco de
// teclado/mouse al cerrarse (bug conocido de Electron con BrowserWindow: la
// devolución de foco a los webContents tras un diálogo nativo no siempre
// ocurre), congelando el formulario hasta que algún otro evento del SO le
// devuelve el foco — reportado en Ingreso/Egreso de Almacén, solo dentro de
// la app de escritorio, nunca en el navegador normal. Este panel vive dentro
// de la misma página, sin esa capa nativa. z-[200]: por encima de cualquier
// modal/selector conocido de la app (el más alto hoy es z-[100]).
// `exito`: mismo rectángulo verde que ya usa ModalCrearOrdenCompra tras
// crear una OC — reemplaza la pregunta/botones una vez confirmada la
// acción, y el llamador se encarga de cerrar el panel tras un breve delay.
// `mensaje` puede ser JSX (p. ej. el resumen de lo que se va a emitir a SUNAT).
// `peligro`: acciones destructivas — botón rojo y el foco inicial en Cancelar,
// para que un Enter apresurado no las ejecute.
export default function ConfirmacionAccion({
  mensaje, onCancelar, onConfirmar, procesando, textoConfirmar = "Confirmar",
  textoProcesando = "Guardando…", peligro = false, exito,
}) {
  useEffect(() => {
    const alPulsar = (e) => { if (e.key === "Escape" && !procesando && !exito) onCancelar?.(); };
    window.addEventListener("keydown", alPulsar);
    return () => window.removeEventListener("keydown", alPulsar);
  }, [onCancelar, procesando, exito]);

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4">
      <div className={`bg-white rounded-xl shadow-xl p-6 w-full ${typeof mensaje === "string" ? "max-w-sm" : "max-w-md"}`}>
        {exito ? (
          <div className="bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg px-4 py-3">
            {exito}
          </div>
        ) : (
          <>
            <div className="text-sm text-gray-700 mb-6">{mensaje}</div>
            <div className="flex justify-end gap-3">
              <button onClick={onCancelar} disabled={procesando} autoFocus={peligro}
                className="border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm hover:bg-gray-50 transition disabled:opacity-50">
                Cancelar
              </button>
              <button onClick={onConfirmar} disabled={procesando} autoFocus={!peligro}
                className={`${peligro ? "bg-red-600 hover:bg-red-700" : "bg-gray-900 hover:bg-gray-700"} text-white px-4 py-2 rounded-lg text-sm transition disabled:opacity-50`}>
                {procesando ? textoProcesando : textoConfirmar}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
