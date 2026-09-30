import { useState, useEffect, useRef, useCallback } from "react";
import { fetchAuth, uploadAuth } from "../utils/fetchAuth";
import { tomarBloqueo, soltarBloqueo, conBloqueo } from "../utils/bloqueoApi";
import { quitarBloqueo } from "../utils/bloqueosActivos";
import { huboActividad, avisoDeRespuesta, cabecerasBloqueo, versionTrasAccion, pasoAutoEditar, tomaVigente, resultadoConsulta, edicionPerdida } from "../utils/bloqueo";

const LATIDO_MS = 60 * 1000;
const CONSULTA_OCUPADO_MS = 30 * 1000;
const EVENTOS_ACTIVIDAD = ["keydown", "mousedown", "input"];

// Bloqueo de edición de un documento (spec 2026-09-28-bloqueo-edicion): quien abre
// el documento con permiso (autoEditar) lo toma; un latido lo mantiene mientras hay
// actividad y se suelta al cerrar la pantalla. Quien llega después lo ve en solo
// lectura. fetch/upload agregan las cabeceras; si no se está editando, toman un
// bloqueo temporal solo para esa acción.
export default function useBloqueoEdicion(entidad, documento, versionMostrada, { autoEditar = false } = {}) {
  const [estado, setEstado] = useState("cargando");
  const [mensaje, setMensaje] = useState("");
  const clave = useRef(null);
  const version = useRef(versionMostrada);
  const ultimaActividad = useRef(0); // se fija al tomar el documento
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

  // sondeo: la revisión cada 30 s mientras otro lo tiene; si falla, se conserva
  // el aviso de quién lo tiene en vez de pasar a error.
  const consultar = useCallback(({ sondeo = false } = {}) => fetchAuth(`/bloqueos/${entidad}/${documento}`)
    .then(async (r) => ({ r, data: await r.json().catch(() => null) }), () => ({ r: null, data: null }))
    .then(({ r, data }) => {
      if (clave.current) return;
      const res = resultadoConsulta({ ok: r?.ok, status: r?.status, data, errorRed: !r, sondeo, puedeEditar: autoEditar });
      if (sondeo && res.estado === "error") return;
      setEstado(res.estado);
      setMensaje(res.mensaje);
    }), [entidad, documento, autoEditar]);

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

  // Mientras otro lo edita se revisa cada 30 s, para avisar cuando lo suelte.
  useEffect(() => {
    if (estado !== "ocupado") return undefined;
    const t = setInterval(() => consultar({ sondeo: true }), CONSULTA_OCUPADO_MS);
    return () => clearInterval(t);
  }, [estado, consultar]);

  useEffect(() => {
    if (estado !== "editando") return undefined;
    const marcar = () => { ultimaActividad.current = Date.now(); };
    EVENTOS_ACTIVIDAD.forEach((e) => window.addEventListener(e, marcar, true));
    const latido = setInterval(async () => {
      if (!clave.current) return;
      const r = await fetchAuth(`/bloqueos/${clave.current}`, {
        method: "PUT", body: JSON.stringify({ activo: huboActividad(ultimaActividad.current, Date.now()) }), sinAvisoGuardado: true,
      }).catch(() => null);
      if (r?.status === 410) {
        quitarBloqueo(clave.current);
        clave.current = null;
        setEstado("liberado");
        setMensaje("Tu edición se liberó tras 5 min sin actividad.");
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
    let toma;
    try {
      toma = await tomarBloqueo(entidad, pedido);
    } catch {
      toma = null;
    } finally {
      if (tomando.current === pedido) tomando.current = null;
    }
    if (!toma) {
      setEstado("error");
      setMensaje("No se pudo abrir el documento para editar (sin conexión con el servidor).");
      return;
    }
    const { r, data } = toma;
    if (!tomaVigente({ documentoPedido: pedido, documentoActual: documentoAbierto.current })) {
      if (r.ok) soltarBloqueo(data.clave);
      return;
    }
    if (r.status === 423) { setEstado("ocupado"); setMensaje(data.mensaje); return; }
    if (!r.ok) { setEstado("error"); setMensaje(data.mensaje || "No se pudo abrir el documento para editar."); return; }
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

  // Si el documento deja de ser editable con la pantalla abierta (se anuló, la
  // notificación se cerró al guardar), se suelta para que otros puedan actuar.
  useEffect(() => {
    if (autoEditar || !clave.current) return;
    const c = clave.current;
    clave.current = null;
    soltarBloqueo(c).then(() => { setEstado("lectura"); setMensaje(""); });
  }, [autoEditar]);

  // Abrir = editar: se toma al abrir, una sola vez por apertura.
  useEffect(() => {
    const paso = pasoAutoEditar({ autoEditar, estado, intentado: autoIntentado.current, documento });
    if (!paso) return;
    autoIntentado.current = documento;
    if (paso === "editar") editar();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- editar cambia en cada render
  }, [autoEditar, estado, documento]);

  const leerVersion = async () => {
    const r = await fetchAuth(`/bloqueos/${entidad}/${documento}`);
    return r.ok ? (await r.json()).version : null;
  };

  const ejecutar = async (llamar) => {
    const editando = !!clave.current;
    const versionPrevia = editando ? await leerVersion().catch(() => null) : null;
    let versionTomada = null;
    const res = editando
      ? await llamar(cabecerasBloqueo(clave.current, version.current))
      : await conBloqueo(entidad, documento, (h, tomado) => {
        versionTomada = tomado.version;
        return llamar(cabecerasBloqueo(h["X-Bloqueo"], version.current));
      });
    const data = await res.clone().json().catch(() => null);
    const perdida = edicionPerdida({ editando, status: res.status, data });
    const aviso = avisoDeRespuesta(res.status, data);
    if (perdida) {
      quitarBloqueo(clave.current);
      clave.current = null;
      setEstado("liberado");
      setMensaje(perdida);
    } else if (aviso) setMensaje(aviso.mensaje);
    else if (res.ok) {
      const versionNueva = await leerVersion();
      if (versionNueva) version.current = versionTrasAccion({ editando, versionFormulario: version.current, versionPrevia, versionTomada, versionNueva });
    }
    return res;
  };

  return {
    estado, mensaje, editando: estado === "editando",
    editar,
    // Reintentar vuelve a consultar y, si está libre, a tomarlo (abrir = editar).
    reintentar: () => { autoIntentado.current = null; return consultar(); },
    // Tras guardar se sigue editando (el bloqueo se suelta al cerrar la pantalla).
    terminar: (nuevaVersion) => { if (nuevaVersion) version.current = nuevaVersion; },
    fetch: (url, opciones = {}) => ejecutar((h) => fetchAuth(url, { ...opciones, headers: { ...opciones.headers, ...h } })),
    upload: (url, formData) => ejecutar((h) => uploadAuth(url, formData, h)),
  };
}
