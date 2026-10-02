import { useState } from "react";
import ConfirmacionAccion from "../components/ConfirmacionAccion";

// confirmar(mensaje) → Promise<boolean> con el diálogo propio de la app (nunca window.confirm).
// El llamador renderiza `dialogo`.
export default function useConfirmar(textoConfirmar = "Sí, registrar") {
  const [pendiente, setPendiente] = useState(null);
  const confirmar = (mensaje) => new Promise((resolver) => setPendiente({ mensaje, resolver }));
  const cerrar = (valor) => {
    pendiente?.resolver(valor);
    setPendiente(null);
  };
  const dialogo = pendiente && (
    <ConfirmacionAccion mensaje={pendiente.mensaje} textoConfirmar={textoConfirmar}
      onCancelar={() => cerrar(false)} onConfirmar={() => cerrar(true)} />
  );
  return { confirmar, dialogo };
}
