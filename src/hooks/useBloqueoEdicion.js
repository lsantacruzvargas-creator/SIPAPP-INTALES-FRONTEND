import { useState, useEffect, useRef, useCallback } from "react";
import { fetchAuth, uploadAuth } from "../utils/fetchAuth";
import { tomarBloqueo, soltarBloqueo, conBloqueo } from "../utils/bloqueoApi";
import { mensajeOcupado, huboActividad, avisoDeRespuesta, cabecerasBloqueo, versionTrasAccion, pasoAutoEditar, tomaVigente } from "../utils/bloqueo";

const LATIDO_MS = 60 * 1000;
const CONSULTA_OCUPADO_MS = 30 * 1000;
const EVENTOS_ACTIVIDAD = ["keydown", "mousedown", "input"];

// Bloqueo de edición de un documento (spec 2026-09-28-bloqueo-edicion): "Editar"
// lo toma, un latido lo mantiene mientras hay actividad, y se suelta al guardar,
// cancelar o cerrar. fetch/upload agregan las cabeceras; si no se está editando,
// toman un bloqueo temporal solo para esa acción.
export default function useBloqueoEdicion(entidad, documento, versionMostrada, { autoEditar = false } = {}) {
  const [estado, setEstado] = useState("cargando");
  const [mensaje, setMensaje] = useState("");
  const clave = useRef(null);
  const version = useRef(versionMostrada);
  const ultimaActividad = useRef(0); // se fija al pulsar "Editar"
  const autoIntentado = useRef(null);
  const documentoAbierto = useRef(null); // null al cerrar el detalle
  const tomando = useRef(null); // documento con un "tomar" en vuelo

  // Otro documento en la misma pantalla (Ingresos de equipo): vuelve a empezar.
  const [documentoActual, setDocumentoActual] = useState(documento);
  if (documentoActual !== documento) {
    setDocumentoActual(documento);
    setEstado("cargando");
    setMensaje("");
  }

  const consultar = useCallback(() => fetchAuth(`/bloqueos/${entidad}/${documento}`).then(async (r) => {
    if (!r.ok || clave.current) return;
    const d = await r.json();
    if (d.ocupado) { setEstado("ocupado"); setMensaje(mensajeOcupado(d)); return; }
    setEstado((e) => (e === "ocupado" || e === "cargando" ? "lectura" : e));
    setMensaje((m) => (d.ocupado ? m : ""));
  }), [entidad, documento]);

  useEffect(() => { if (documento) consultar(); }, [documento, consultar]);

  // La versión del formulario se fija al abrir cada documento (no cuando cambia
  // después: eso lo decide versionTrasAccion). Al cambiar de documento o cerrar el
  // detalle se suelta el bloqueo propio.
  useEffect(() => {
    version.current = versionMostrada;
    documentoAbierto.current = documento;
    return () => {
      documentoAbierto.current = null;
      // Reabrir la misma fila (Almacén: editar, guardar y volver a editar) vuelve a tomarla sola.
      autoIntentado.current = null;
      if (clave.current) { soltarBloqueo(clave.current); clave.current = null; }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al cambiar de documento
  }, [documento]);

  // Pantallas que cargan el documento después de montar (cuadro comparativo): se
  // anota la primera versión conocida; las siguientes las decide versionTrasAccion.
  useEffect(() => { if (version.current == null && versionMostrada) version.current = versionMostrada; }, [versionMostrada]);

  // Mientras otro lo edita se revisa cada 30 s, para habilitar "Editar" cuando lo suelte.
  useEffect(() => {
    if (estado !== "ocupado") return undefined;
    const t = setInterval(consultar, CONSULTA_OCUPADO_MS);
    return () => clearInterval(t);
  }, [estado, consultar]);

  useEffect(() => {
    if (estado !== "editando") return undefined;
    const marcar = () => { ultimaActividad.current = Date.now(); };
    EVENTOS_ACTIVIDAD.forEach((e) => window.addEventListener(e, marcar, true));
    const latido = setInterval(async () => {
      if (!clave.current) return;
      const r = await fetchAuth(`/bloqueos/${clave.current}`, {
        method: "PUT", body: JSON.stringify({ activo: huboActividad(ultimaActividad.current, Date.now()) }),
      }).catch(() => null);
      if (r?.status === 410) {
        clave.current = null;
        setEstado("liberado");
        setMensaje("Tu edición se liberó tras 15 min sin actividad.");
      }
    }, LATIDO_MS);
    const alCerrarVentana = () => { if (clave.current) soltarBloqueo(clave.current, { alCerrar: true }); };
    window.addEventListener("beforeunload", alCerrarVentana);
    return () => {
      clearInterval(latido);
      EVENTOS_ACTIVIDAD.forEach((e) => window.removeEventListener(e, marcar, true));
      window.removeEventListener("beforeunload", alCerrarVentana);
    };
  }, [estado]);

  const editar = async () => {
    if (tomando.current === documento || clave.current) return;
    const pedido = documento;
    tomando.current = pedido;
    setMensaje("");
    const { r, data } = await tomarBloqueo(entidad, pedido).finally(() => {
      if (tomando.current === pedido) tomando.current = null;
    });
    if (!tomaVigente({ documentoPedido: pedido, documentoActual: documentoAbierto.current })) {
      if (r.ok) soltarBloqueo(data.clave);
      return;
    }
    if (r.status === 423) { setEstado("ocupado"); setMensaje(data.mensaje); return; }
    if (!r.ok) { setMensaje(data.mensaje || "No se pudo tomar el documento para editar."); return; }
    if (version.current && data.version && data.version !== version.current) {
      await soltarBloqueo(data.clave);
      setEstado("desactualizado");
      setMensaje("Este documento cambió desde que lo abriste — ciérralo y vuelve a abrirlo para editar la versión actual.");
      return;
    }
    version.current = data.version;
    clave.current = data.clave;
    ultimaActividad.current = Date.now();
    setEstado("editando");
  };

  // Formularios que se abren desde el "Editar" de una fila (catálogos): la
  // intención ya está expresada, se toma sin un segundo clic.
  useEffect(() => {
    const paso = pasoAutoEditar({ autoEditar, estado, intentado: autoIntentado.current, documento });
    if (!paso) return;
    autoIntentado.current = documento;
    if (paso === "editar") editar();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- editar cambia en cada render
  }, [autoEditar, estado, documento]);

  const soltar = async (nuevaVersion) => {
    if (nuevaVersion) version.current = nuevaVersion;
    const c = clave.current;
    clave.current = null;
    setEstado("lectura");
    setMensaje("");
    if (c) await soltarBloqueo(c);
  };

  const leerVersion = async () => {
    const r = await fetchAuth(`/bloqueos/${entidad}/${documento}`);
    return r.ok ? (await r.json()).version : null;
  };

  const ejecutar = async (llamar) => {
    const editando = !!clave.current;
    let versionTomada = null;
    const res = editando
      ? await llamar(cabecerasBloqueo(clave.current, version.current))
      : await conBloqueo(entidad, documento, (h, tomado) => {
        versionTomada = tomado.version;
        return llamar(cabecerasBloqueo(h["X-Bloqueo"], version.current));
      });
    const aviso = avisoDeRespuesta(res.status, await res.clone().json().catch(() => null));
    if (aviso) setMensaje(aviso.mensaje);
    else if (res.ok) {
      const versionNueva = await leerVersion();
      if (versionNueva) version.current = versionTrasAccion({ editando, versionFormulario: version.current, versionTomada, versionNueva });
    }
    return res;
  };

  return {
    estado, mensaje, editando: estado === "editando",
    editar,
    cancelar: () => soltar(),
    terminar: soltar,
    fetch: (url, opciones = {}) => ejecutar((h) => fetchAuth(url, { ...opciones, headers: { ...opciones.headers, ...h } })),
    upload: (url, formData) => ejecutar((h) => uploadAuth(url, formData, h)),
  };
}
