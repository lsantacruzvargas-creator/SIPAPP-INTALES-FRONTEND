import { useState, useEffect, useCallback } from "react";
import { fetchAuth } from "../../utils/fetchAuth";
import { formatearFecha } from "../../utils/fecha";
import { lineasDeSCs, idDe } from "../../utils/compras";
import TablaScroll from "../TablaScroll";
import PromptAccion from "../PromptAccion";
import ModalNuevaSC from "./ModalNuevaSC";
import ModalEnviarProveedores from "./ModalEnviarProveedores";

// En la tabla el tipo de artículo es un <select> (un buscador con lista
// desplegable quedaría recortado por el scroll horizontal); "+ Nuevo tipo…"
// abre un modal para darlo de alta.
const NUEVO_TIPO = "__nuevo__";
const SEL = "border border-gray-200 rounded-md px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-purple-300 max-w-[170px]";

export default function TablaPorProcesar({ catalogos, onTipoCreado, onEnviado }) {
  const [scs, setScs] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [seleccion, setSeleccion] = useState(() => new Set());
  const [filtros, setFiltros] = useState({ texto: "", tipoArticulo: "", tipo: "" });
  const [nuevaAbierta, setNuevaAbierta] = useState(false);
  const [enviarAbierto, setEnviarAbierto] = useState(false);
  const [anulando, setAnulando] = useState(null);
  const [creandoTipoPara, setCreandoTipoPara] = useState(null);
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState("");

  const cargar = useCallback(() => fetchAuth("/solicitudes-compra?estado=por_procesar").then(async (r) => {
    if (r.ok) setScs(await r.json());
    setCargando(false);
  }), []);
  useEffect(() => { cargar(); }, [cargar]);

  const reemplazarSC = (sc) => setScs((prev) => prev.map((s) => (s._id === sc._id ? sc : s)));

  const q = filtros.texto.trim().toLowerCase();
  const filas = lineasDeSCs(scs).filter((f) =>
    (!q || [f.descripcion, f.sc.codigo, f.sc.ordenTrabajo?.numeroOT, f.sc.solicitadoPor].some((v) => String(v || "").toLowerCase().includes(q)))
    && (!filtros.tipoArticulo || idDe(f.tipoArticulo) === filtros.tipoArticulo)
    && (!filtros.tipo || f.tipo === filtros.tipo)
  );
  const seleccionadas = filas.filter((f) => seleccion.has(f._id));
  const todasMarcadas = filas.length > 0 && filas.every((f) => seleccion.has(f._id));

  const toggle = (id) => setSeleccion((prev) => {
    const s = new Set(prev);
    if (s.has(id)) s.delete(id); else s.add(id);
    return s;
  });
  const toggleTodas = () => setSeleccion(todasMarcadas ? new Set() : new Set(filas.map((f) => f._id)));

  const leerError = async (r, mensaje) => {
    const d = await r.json().catch(() => ({}));
    setError(d.mensaje || mensaje);
  };

  const editarLinea = async (fila, cambios) => {
    setError("");
    const r = await fetchAuth(`/solicitudes-compra/${fila.sc._id}/lineas/${fila._id}`, { method: "PATCH", body: JSON.stringify(cambios) });
    if (r.ok) reemplazarSC(await r.json());
    else await leerError(r, "No se pudo guardar el cambio.");
  };

  const cambiarTipo = (fila, valor) => {
    if (valor === NUEVO_TIPO) setCreandoTipoPara(fila);
    else editarLinea(fila, { tipoArticulo: valor || null });
  };

  const crearTipo = async (nombre) => {
    setProcesando(true);
    const r = await fetchAuth("/tipos-articulo", { method: "POST", body: JSON.stringify({ nombre }) });
    if (r.ok) {
      const tipo = await r.json();
      if (!catalogos.tiposArticulo.some((t) => t._id === tipo._id)) onTipoCreado(tipo);
      await editarLinea(creandoTipoPara, { tipoArticulo: tipo._id });
    } else {
      await leerError(r, "No se pudo crear el tipo de artículo.");
    }
    setProcesando(false);
    setCreandoTipoPara(null);
  };

  const anular = async (motivo) => {
    setProcesando(true);
    const r = await fetchAuth(`/solicitudes-compra/${anulando.sc._id}/lineas/${anulando._id}/anular`, { method: "PATCH", body: JSON.stringify({ motivo }) });
    if (r.ok) reemplazarSC(await r.json());
    else await leerError(r, "No se pudo anular la línea.");
    setProcesando(false);
    setAnulando(null);
  };

  const origen = (sc) => (sc.ordenTrabajo ? `OT ${sc.ordenTrabajo.numeroOT || sc.ordenTrabajo.codigo}` : "Manual");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <input value={filtros.texto} onChange={(e) => setFiltros({ ...filtros, texto: e.target.value })}
          placeholder="Buscar descripción, SC, OT o solicitante…"
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-72 focus:outline-none focus:ring-2 focus:ring-purple-300" />
        <select value={filtros.tipoArticulo} onChange={(e) => setFiltros({ ...filtros, tipoArticulo: e.target.value })}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
          <option value="">Todos los tipos de artículo</option>
          {catalogos.tiposArticulo.map((t) => <option key={t._id} value={t._id}>{t.nombre}</option>)}
        </select>
        <select value={filtros.tipo} onChange={(e) => setFiltros({ ...filtros, tipo: e.target.value })}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
          <option value="">Materiales y servicios</option>
          <option value="material">Materiales</option>
          <option value="servicio">Servicios</option>
        </select>
        <div className="ml-auto flex gap-2">
          <button onClick={() => setNuevaAbierta(true)}
            className="text-sm border border-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50 transition">+ Nueva SC</button>
          <button onClick={() => setEnviarAbierto(true)} disabled={seleccionadas.length === 0}
            className="text-sm bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 disabled:opacity-40 transition font-medium">
            Enviar a proveedores ({seleccionadas.length})
          </button>
        </div>
      </div>

      {error && <p className="text-sm text-red-500 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <TablaScroll className="overflow-x-auto">
          <table className="w-full text-sm min-w-[1100px]">
            <thead className="bg-gray-500 text-white text-xs uppercase">
              <tr>
                <th className="px-3 py-3"><input type="checkbox" checked={todasMarcadas} onChange={toggleTodas} className="w-4 h-4" /></th>
                <th className="px-3 py-3 text-left">SC</th>
                <th className="px-3 py-3 text-left">Fecha</th>
                <th className="px-3 py-3 text-left">Origen</th>
                <th className="px-3 py-3 text-left">Tipo</th>
                <th className="px-3 py-3 text-left">Tipo de artículo</th>
                <th className="px-3 py-3 text-left">Descripción</th>
                <th className="px-3 py-3 text-right">Cant.</th>
                <th className="px-3 py-3 text-left">Und.</th>
                <th className="px-3 py-3 text-left">Centro de costo</th>
                <th className="px-3 py-3 text-left">Solicitado por</th>
                <th className="px-3 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {cargando ? (
                <tr><td colSpan={12} className="px-4 py-8 text-center text-gray-400">Cargando…</td></tr>
              ) : filas.length === 0 ? (
                <tr><td colSpan={12} className="px-4 py-8 text-center text-gray-400">Sin solicitudes por procesar</td></tr>
              ) : filas.map((f, i) => {
                const nuevaSC = i === 0 || filas[i - 1].sc._id !== f.sc._id;
                return (
                  <tr key={f._id} className={`hover:bg-gray-50 ${nuevaSC && i > 0 ? "border-t-2 border-gray-200" : ""}`}>
                    <td className="px-3 py-2 text-center"><input type="checkbox" checked={seleccion.has(f._id)} onChange={() => toggle(f._id)} className="w-4 h-4" /></td>
                    <td className="px-3 py-2 font-mono text-xs text-gray-500">{nuevaSC ? f.sc.codigo : ""}</td>
                    <td className="px-3 py-2 text-xs text-gray-500">{nuevaSC ? formatearFecha(f.sc.createdAt) : ""}</td>
                    <td className="px-3 py-2 text-xs">{nuevaSC ? origen(f.sc) : ""}</td>
                    <td className="px-3 py-2">
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${f.tipo === "servicio" ? "bg-cyan-50 text-cyan-700" : "bg-amber-50 text-amber-700"}`}>
                        {f.tipo === "servicio" ? "Servicio" : "Material"}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <select value={idDe(f.tipoArticulo) || ""} onChange={(e) => cambiarTipo(f, e.target.value)} className={SEL}>
                        <option value="">Sin tipo</option>
                        {catalogos.tiposArticulo.map((t) => <option key={t._id} value={t._id}>{t.nombre}</option>)}
                        <option value={NUEVO_TIPO}>+ Nuevo tipo…</option>
                      </select>
                    </td>
                    <td className="px-3 py-2 text-gray-800">{f.descripcion}</td>
                    <td className="px-3 py-2 text-right">{f.cantidad}</td>
                    <td className="px-3 py-2 text-xs text-gray-500">{f.unidad}</td>
                    <td className="px-3 py-2">
                      <select value={idDe(f.centroCosto) || ""} onChange={(e) => editarLinea(f, { centroCosto: e.target.value || null })}
                        className={`${SEL} ${f.centroCosto ? "" : "border-red-300 text-red-600"}`}>
                        <option value="">Sin centro</option>
                        {catalogos.centrosCosto.map((c) => <option key={c._id} value={c._id}>{c.nombre}</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-500">{nuevaSC ? f.sc.solicitadoPor : ""}</td>
                    <td className="px-3 py-2 text-right">
                      <button onClick={() => setAnulando(f)} className="text-red-500 hover:underline text-xs">Anular</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TablaScroll>
      </div>

      {nuevaAbierta && (
        <ModalNuevaSC catalogos={catalogos} onTipoCreado={onTipoCreado} onClose={() => setNuevaAbierta(false)}
          onCreada={() => { setNuevaAbierta(false); cargar(); }} />
      )}
      {enviarAbierto && (
        <ModalEnviarProveedores lineas={seleccionadas} proveedores={catalogos.proveedores}
          onClose={() => setEnviarAbierto(false)}
          onEnviado={() => { setEnviarAbierto(false); setSeleccion(new Set()); cargar(); onEnviado(); }} />
      )}
      {anulando && (
        <PromptAccion titulo={`Anular "${anulando.descripcion}" (${anulando.sc.codigo})`} placeholder="¿Por qué ya no se compra?"
          label={anulando.sc.origen === "manual" ? "Motivo" : "Motivo (también rechaza el pedido de origen)"}
          onCancelar={() => setAnulando(null)} onConfirmar={anular} procesando={procesando} textoConfirmar="Anular línea" />
      )}
      {creandoTipoPara && (
        <PromptAccion titulo="Nuevo tipo de artículo" label="Nombre" placeholder="Ej: Neumáticos"
          onCancelar={() => setCreandoTipoPara(null)} onConfirmar={crearTipo} procesando={procesando} textoConfirmar="Agregar" />
      )}
    </div>
  );
}
