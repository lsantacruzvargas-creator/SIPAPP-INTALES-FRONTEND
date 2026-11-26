import { useState } from "react";
import ConfirmacionAccion from "../components/ConfirmacionAccion";

// confirmar(mensaje) → Promise<boolean> con el diálogo propio de la app (nunca window.confirm).
// `mensaje` puede ser JSX (resumen de lo que se va a hacer). El llamador renderiza `dialogo`.
// `peligro`: acciones destructivas (botón rojo, foco inicial en Cancelar).
export default function useConfirmar(textoConfirmar = "Sí, registrar", { peligro = false } = {}) {
  const [pendiente, setPendiente] = useState(null);
  const confirmar = (mensaje) => new Promise((resolver) => setPendiente({ mensaje, resolver }));
  const cerrar = (valor) => {
    pendiente?.resolver(valor);
    setPendiente(null);
  };
  const dialogo = pendiente && (
    <ConfirmacionAccion mensaje={pendiente.mensaje} textoConfirmar={textoConfirmar} peligro={peligro}
      onCancelar={() => cerrar(false)} onConfirmar={() => cerrar(true)} />
  );
  return { confirmar, dialogo };
}
