import { useState, useEffect } from "react";
import { fetchAuth } from "../../utils/fetchAuth";
import { Texto, Lista, Casilla, CampoBuscador } from "./FichaTRegistro";

const CATEGORIAS_CON_OCUPACIONES = ["01", "02", "03"];

// Valores con los que nace la ficha de un trabajador nuevo; cada ficha puede cambiarlos.
export default function PanelConfigTRegistro({ catalogos, puedeEscribir, onGuardado }) {
  const cat = catalogos.tregistro;
  const [form, setForm] = useState(null);
  const [error, setError] = useState("");
  const [guardado, setGuardado] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const set = (k) => (e) => {
    setGuardado(false);
    setForm((f) => ({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));
  };

  useEffect(() => {
    let vigente = true;
    fetchAuth("/planilla/tregistro/configuracion")
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!vigente) return;
        if (r.ok) setForm(d); else setError(d.mensaje || "No se pudo cargar la configuración.");
      })
      .catch(() => { if (vigente) setError("Error de conexión con el servidor."); });
    return () => { vigente = false; };
  }, []);

  const guardar = async () => {
    if (!/^\d{4}$/.test(form.codigoEstablecimiento)) return setError("El código de establecimiento debe tener 4 dígitos (ej. 0000).");
    setGuardando(true);
    setError("");
    try {
      const r = await fetchAuth("/planilla/tregistro/configuracion", { method: "PUT", body: JSON.stringify(form) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) return setError(d.mensaje || "No se pudo guardar la configuración.");
      setForm(d);
      setGuardado(true);
      onGuardado?.();
    } catch {
      setError("Error de conexión con el servidor.");
    } finally {
      setGuardando(false);
    }
  };

  if (!form) return error ? <p className="text-sm text-red-600">{error}</p> : <p className="text-sm text-gray-400">Cargando…</p>;

  const rutaOcupacion = CATEGORIAS_CON_OCUPACIONES.includes(form.categoriaOcupacional)
    ? `/planilla/tregistro/ocupaciones?categoria=${form.categoriaOcupacional}` : null;

  return (
    <div className="space-y-4 max-w-3xl">
      <p className="text-sm text-gray-500">
        Los valores por defecto (contrato, periodicidad, tipo de pago, situación educativa, categoría, ocupación y jornada máxima) se precargan solo en las fichas nuevas;
        no cambian las fichas ya guardadas. El código de establecimiento se aplica al generar el archivo a todo trabajador cuya ficha no tenga el suyo.
      </p>
      <fieldset disabled={!puedeEscribir || guardando} className="grid grid-cols-2 gap-3 border-0 p-0 m-0 min-w-0">
        <Texto etiqueta="Código de establecimiento anexo" valor={form.codigoEstablecimiento} max={4} inputMode="numeric" ancho="col-span-2 md:col-span-1"
          onChange={(e) => { setGuardado(false); setForm((f) => ({ ...f, codigoEstablecimiento: e.target.value.replace(/\D/g, "") })); }}
          ayuda="4 dígitos; 0000 es el domicilio fiscal." />
        <Lista etiqueta="Tipo de contrato" valor={form.tipoContrato} onChange={set("tipoContrato")} opciones={cat.contratos} ancho="col-span-2 md:col-span-1" />
        <Lista etiqueta="Periodicidad de la remuneración" valor={form.periodicidad} onChange={set("periodicidad")} opciones={cat.periodicidades} ancho="col-span-2 md:col-span-1" />
        <Lista etiqueta="Tipo de pago" valor={form.tipoPago} onChange={set("tipoPago")} opciones={cat.tiposPago} ancho="col-span-2 md:col-span-1" />
        <Lista etiqueta="Situación educativa" valor={form.situacionEducativa} onChange={set("situacionEducativa")} opciones={cat.situacionesEducativas} ancho="col-span-2 md:col-span-1" />
        <Lista etiqueta="Categoría ocupacional" valor={form.categoriaOcupacional} opciones={cat.categoriasOcupacionales} ancho="col-span-2 md:col-span-1"
          onChange={(e) => { setGuardado(false); setForm((f) => ({ ...f, categoriaOcupacional: e.target.value, ocupacion: "" })); }} />
        <CampoBuscador etiqueta="Ocupación (opcional)" valor={form.ocupacion} ruta={rutaOcupacion} ancho="col-span-2"
          ayuda={rutaOcupacion ? "" : "Elige primero la categoría ocupacional."}
          onElegir={(x) => { setGuardado(false); setForm((f) => ({ ...f, ocupacion: x.codigo })); }} />
        <div className="col-span-2"><Casilla etiqueta="Jornada máxima" valor={form.jornadaMaxima} onChange={set("jornadaMaxima")} /></div>
      </fieldset>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {guardado && <p className="text-sm text-green-700">Configuración guardada.</p>}
      {puedeEscribir && (
        <button onClick={guardar} disabled={guardando} className="bg-purple-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-purple-700 disabled:opacity-50">
          {guardando ? "Guardando…" : "Guardar configuración"}
        </button>
      )}
    </div>
  );
}
