import { useState, useEffect } from "react";
import { fetchAuth } from "../../utils/fetchAuth";
import { requiereEstudios, requiereCuenta, paisEmisorBloqueado } from "../../utils/tregistro";

const INP = "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300 disabled:bg-gray-50";
const GRID = "grid grid-cols-2 md:grid-cols-4 gap-3";

const lista = async (ruta) => {
  const r = await fetchAuth(ruta);
  const d = await r.json().catch(() => []);
  return r.ok && Array.isArray(d) ? d : [];
};

function Seccion({ titulo, children }) {
  return (
    <details className="border border-gray-200 rounded-lg">
      <summary className="px-3 py-2 text-xs font-bold text-gray-600 uppercase cursor-pointer select-none">{titulo}</summary>
      <div className="p-3 space-y-3">{children}</div>
    </details>
  );
}

export function Texto({ etiqueta, valor, onChange, max, ayuda, ancho = "", ...resto }) {
  return (
    <label className={`text-xs text-gray-500 ${ancho}`}>{etiqueta}
      <input value={valor} onChange={onChange} maxLength={max} className={INP} {...resto} />
      {ayuda && <span className="block text-[11px] text-gray-400 mt-0.5">{ayuda}</span>}
    </label>
  );
}

export function Lista({ etiqueta, valor, onChange, opciones, vacio = "Elegir…", ancho = "", disabled = false }) {
  return (
    <label className={`text-xs text-gray-500 ${ancho}`}>{etiqueta}
      <select value={valor} onChange={onChange} disabled={disabled} className={INP}>
        <option value="">{vacio}</option>
        {opciones.map((o) => <option key={o.codigo} value={o.codigo}>{o.codigo} · {o.nombre}</option>)}
      </select>
    </label>
  );
}

export function Casilla({ etiqueta, valor, onChange }) {
  return (
    <label className="text-sm text-gray-700 flex items-center gap-2">
      <input type="checkbox" checked={valor} onChange={onChange} />{etiqueta}
    </label>
  );
}

function Buscador({ titulo, ruta, onElegir, onCerrar }) {
  const [q, setQ] = useState("");
  const [resultados, setResultados] = useState([]);
  useEffect(() => {
    if (!q.trim()) return;
    let vigente = true;
    const espera = setTimeout(async () => {
      const r = await lista(`${ruta}${ruta.includes("?") ? "&" : "?"}q=${encodeURIComponent(q.trim())}`).catch(() => []);
      if (vigente) setResultados(r);
    }, 250);
    return () => { vigente = false; clearTimeout(espera); };
  }, [q, ruta]);

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/50 p-4" style={{ zIndex: 110 }}>
      <div className="bg-white rounded-xl shadow-xl p-5 w-full max-w-lg space-y-3">
        <h4 className="font-semibold text-gray-800 text-sm">{titulo}</h4>
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} maxLength={60} placeholder="Escribe parte del nombre o el código…" className={INP} />
        <ul className="max-h-64 overflow-y-auto divide-y divide-gray-100">
          {(q.trim() ? resultados : []).map((x) => (
            <li key={x.codigo}>
              <button type="button" onClick={() => onElegir(x)} className="w-full text-left px-2 py-1.5 text-sm hover:bg-purple-50">
                <span className="text-gray-400 text-xs mr-2">{x.codigo}</span>{x.nombre}
              </button>
            </li>
          ))}
          {q.trim() && resultados.length === 0 && <li className="px-2 py-3 text-sm text-gray-400">Sin resultados</li>}
        </ul>
        <div className="flex justify-end">
          <button type="button" onClick={onCerrar} className="border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm hover:bg-gray-50">Cerrar</button>
        </div>
      </div>
    </div>
  );
}

// `ruta` es el endpoint de búsqueda; null si todavía no se puede buscar (ej. falta la categoría de la ocupación).
export function CampoBuscador({ etiqueta, valor, ruta, onElegir, ancho = "", ayuda }) {
  const [abierto, setAbierto] = useState(false);
  const [conocido, setConocido] = useState({ codigo: "", nombre: "" });
  useEffect(() => {
    if (!valor || !ruta || conocido.codigo === valor) return;
    let vigente = true;
    lista(`${ruta}${ruta.includes("?") ? "&" : "?"}q=${encodeURIComponent(valor)}`)
      .then((r) => { if (vigente) setConocido({ codigo: valor, nombre: r.find((x) => x.codigo === valor)?.nombre ?? "" }); })
      .catch(() => {});
    return () => { vigente = false; };
  }, [valor, ruta, conocido.codigo]);

  const nombre = conocido.codigo === valor ? conocido.nombre : "";
  return (
    <div className={`text-xs text-gray-500 ${ancho}`}>{etiqueta}
      <div className="flex gap-2">
        <input readOnly value={valor ? `${valor}${nombre ? ` · ${nombre}` : ""}` : ""} placeholder="Sin elegir" className={INP} />
        <button type="button" disabled={!ruta} onClick={() => setAbierto(true)} className="text-xs text-purple-600 hover:underline disabled:text-gray-300 disabled:no-underline">Buscar</button>
        {valor && <button type="button" onClick={() => onElegir({ codigo: "", nombre: "" })} className="text-xs text-red-600 hover:underline">Quitar</button>}
      </div>
      {ayuda && <span className="block text-[11px] text-gray-400 mt-0.5">{ayuda}</span>}
      {abierto && (
        <Buscador titulo={`Buscar ${etiqueta.toLowerCase()}`} ruta={ruta}
          onElegir={(x) => { setConocido({ codigo: x.codigo, nombre: x.nombre }); onElegir(x); setAbierto(false); }} onCerrar={() => setAbierto(false)} />
      )}
    </div>
  );
}

export default function FichaTRegistro({ form, setForm, catalogos, bloqueados }) {
  const t = form.tregistro;
  const cat = catalogos.tregistro;
  const [carreras, setCarreras] = useState({ institucion: "", lista: [] });
  const institucion = t.estudios.institucion;

  useEffect(() => {
    if (!institucion) return;
    let vigente = true;
    lista(`/planilla/tregistro/instituciones/${encodeURIComponent(institucion)}/carreras`)
      .then((r) => { if (vigente) setCarreras({ institucion, lista: r }); })
      .catch(() => {});
    return () => { vigente = false; };
  }, [institucion]);

  const valor = (e, digitos) => (e.target.type === "checkbox" ? e.target.checked : digitos ? e.target.value.replace(/\D/g, "") : e.target.value);
  const aplicar = (grupo, parche) => setForm((f) => ({
    ...f, tregistro: grupo ? { ...f.tregistro, [grupo]: { ...f.tregistro[grupo], ...parche } } : { ...f.tregistro, ...parche },
  }));
  const set = (k, digitos) => (e) => aplicar(null, { [k]: valor(e, digitos) });
  const setIn = (grupo, k, digitos) => (e) => aplicar(grupo, { [k]: valor(e, digitos) });
  const d = t.direccion;
  const carrerasDeInstitucion = carreras.institucion === institucion ? carreras.lista : [];
  const rutaOcupacion = t.categoriaOcupacional ? `/planilla/tregistro/ocupaciones?categoria=${t.categoriaOcupacional}` : null;
  const cese = bloqueados.cese && form.desbloqueo !== true;

  return (
    <div className="space-y-2">
      <h4 className="text-xs font-bold text-gray-600 uppercase">Datos para el T-Registro (SUNAT)</h4>

      <Seccion titulo="Personales">
        <div className={GRID}>
          <label className="text-xs text-gray-500">Fecha de nacimiento
            <input type="date" value={t.fechaNacimiento} onChange={set("fechaNacimiento")} className={INP} />
          </label>
          <label className="text-xs text-gray-500">Sexo
            <select value={t.sexo} onChange={set("sexo")} className={INP}>
              <option value="">Elegir…</option><option value="1">Masculino</option><option value="2">Femenino</option>
            </select>
          </label>
          <Lista etiqueta="Nacionalidad" valor={t.nacionalidad} onChange={set("nacionalidad")} opciones={cat.nacionalidades} ancho="col-span-2" />
          <Lista etiqueta="País emisor del documento" valor={t.paisEmisor} onChange={set("paisEmisor")} opciones={cat.paisesEmisores} ancho="col-span-2"
            disabled={paisEmisorBloqueado(form, bloqueados, form.desbloqueo === true)} />
          <p className="col-span-2 md:col-span-4 -mt-2 text-[11px] text-gray-400">
            La nacionalidad es obligatoria con carné de extranjería, pasaporte, carné de refugio, de RR.EE., permiso temporal o documento extranjero.
            El país emisor solo se pide con pasaporte o documento de identidad extranjero; con los demás documentos déjalo vacío.
          </p>
          <Texto etiqueta="Teléfono móvil" valor={t.telefono} onChange={set("telefono", true)} max={9} inputMode="numeric" />
          <Texto etiqueta="Correo electrónico" valor={t.correo} onChange={set("correo")} max={50} type="email" ancho="col-span-2" />
        </div>
        <div className={GRID}>
          <Lista etiqueta="Tipo de vía" valor={d.tipoVia} onChange={setIn("direccion", "tipoVia")} opciones={cat.tiposVia} />
          <Texto etiqueta="Nombre de la vía" valor={d.nombreVia} onChange={setIn("direccion", "nombreVia")} max={20} ancho="col-span-2" />
          <Texto etiqueta="Número" valor={d.numeroVia} onChange={setIn("direccion", "numeroVia")} max={4} />
          <Texto etiqueta="Interior" valor={d.interior} onChange={setIn("direccion", "interior")} max={4} />
          <Texto etiqueta="Manzana" valor={d.manzana} onChange={setIn("direccion", "manzana")} max={4} />
          <Texto etiqueta="Lote" valor={d.lote} onChange={setIn("direccion", "lote")} max={4} />
          <Texto etiqueta="Kilómetro" valor={d.kilometro} onChange={setIn("direccion", "kilometro")} max={4} />
          <Texto etiqueta="Block" valor={d.block} onChange={setIn("direccion", "block")} max={4} />
          <Texto etiqueta="Etapa" valor={d.etapa} onChange={setIn("direccion", "etapa")} max={4} />
          <Lista etiqueta="Tipo de zona" valor={d.tipoZona} onChange={setIn("direccion", "tipoZona")} opciones={cat.tiposZona} />
          <Texto etiqueta="Nombre de la zona" valor={d.nombreZona} onChange={setIn("direccion", "nombreZona")} max={20} ancho="col-span-2" />
          <Texto etiqueta="Referencia" valor={d.referencia} onChange={setIn("direccion", "referencia")} max={40} ancho="col-span-2 md:col-span-4" />
          <CampoBuscador etiqueta="Ubigeo" valor={d.ubigeo} ruta="/planilla/tregistro/ubigeo" ancho="col-span-2 md:col-span-4"
            onElegir={(x) => aplicar("direccion", { ubigeo: x.codigo })} />
        </div>
      </Seccion>

      <Seccion titulo="Laborales">
        <div className={GRID}>
          <Lista etiqueta="Categoría ocupacional" valor={t.categoriaOcupacional} opciones={cat.categoriasOcupacionales} ancho="col-span-2"
            onChange={(e) => aplicar(null, { categoriaOcupacional: e.target.value, ocupacion: "" })} />
          <CampoBuscador etiqueta="Ocupación" valor={t.ocupacion} ruta={rutaOcupacion} ancho="col-span-2"
            ayuda={rutaOcupacion ? "" : "Elige primero la categoría ocupacional."} onElegir={(x) => aplicar(null, { ocupacion: x.codigo })} />
          <Lista etiqueta="Situación educativa" valor={t.situacionEducativa} onChange={set("situacionEducativa")} opciones={cat.situacionesEducativas} ancho="col-span-2" />
          <Lista etiqueta="Tipo de contrato" valor={t.tipoContrato} onChange={set("tipoContrato")} opciones={cat.contratos} ancho="col-span-2" />
          <Lista etiqueta="Periodicidad de la remuneración" valor={t.periodicidad} onChange={set("periodicidad")} opciones={cat.periodicidades} ancho="col-span-2" />
          <Lista etiqueta="Tipo de pago" valor={t.tipoPago} onChange={set("tipoPago")} opciones={cat.tiposPago} ancho="col-span-2" />
          <Lista etiqueta="Situación especial" valor={t.situacionEspecial} onChange={set("situacionEspecial")} opciones={cat.situacionesEspeciales} ancho="col-span-2" />
          {form.salud === "eps" && <Lista etiqueta="EPS" valor={t.eps} onChange={set("eps")} opciones={cat.eps} ancho="col-span-2" />}
          <Texto etiqueta="Establecimiento (opcional)" valor={t.establecimiento} onChange={set("establecimiento", true)} max={4} inputMode="numeric"
            placeholder={catalogos.tregistroConfig?.codigoEstablecimiento ?? ""} />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          <Casilla etiqueta="Discapacidad" valor={t.discapacidad} onChange={set("discapacidad")} />
          <Casilla etiqueta="Sindicalizado" valor={t.sindicalizado} onChange={set("sindicalizado")} />
          <Casilla etiqueta="Jornada máxima" valor={t.jornadaMaxima} onChange={set("jornadaMaxima")} />
          <Casilla etiqueta="Horario nocturno" valor={t.horarioNocturno} onChange={set("horarioNocturno")} />
          <Casilla etiqueta="Régimen alternativo" valor={t.regimenAlternativo} onChange={set("regimenAlternativo")} />
        </div>
      </Seccion>

      {requiereEstudios(t.situacionEducativa) && (
        <Seccion titulo="Estudios">
          <div className={GRID}>
            <label className="text-xs text-gray-500 col-span-2">¿Completó los estudios en una institución del Perú?
              <select value={String(t.estudios.completaEnPeru)} onChange={(e) => aplicar("estudios", { completaEnPeru: e.target.value === "true" })} className={INP}>
                <option value="true">Sí</option><option value="false">No</option>
              </select>
            </label>
            {t.estudios.completaEnPeru && (
              <>
                <CampoBuscador etiqueta="Institución" valor={t.estudios.institucion} ruta="/planilla/tregistro/instituciones" ancho="col-span-2 md:col-span-4"
                  onElegir={(x) => aplicar("estudios", { institucion: x.codigo, carrera: "" })} />
                <Lista etiqueta="Carrera" valor={t.estudios.carrera} onChange={setIn("estudios", "carrera")} opciones={carrerasDeInstitucion} ancho="col-span-2 md:col-span-3" />
                <Texto etiqueta="Año de egreso" valor={t.estudios.anioEgreso} onChange={setIn("estudios", "anioEgreso", true)} max={4} inputMode="numeric" />
              </>
            )}
          </div>
        </Seccion>
      )}

      {requiereCuenta(t.tipoPago) && (
        <Seccion titulo="Cuenta de abono">
          <div className={GRID}>
            <Lista etiqueta="Entidad financiera" valor={t.cuenta.entidad} onChange={setIn("cuenta", "entidad")} opciones={cat.entidadesFinancieras} ancho="col-span-2" />
            <Texto etiqueta="Número de cuenta" valor={t.cuenta.numero} onChange={setIn("cuenta", "numero", true)} max={20} inputMode="numeric" ancho="col-span-2" />
          </div>
        </Seccion>
      )}

      {form.fechaCese && (
        <div className={GRID}>
          <label className="text-xs text-gray-500 col-span-2">Motivo de baja
            <select value={t.baja.motivo} onChange={setIn("baja", "motivo")} disabled={cese} className={INP}>
              <option value="">Elegir…</option>
              {cat.motivosBaja.map((o) => <option key={o.codigo} value={o.codigo}>{o.codigo} · {o.nombre}</option>)}
            </select>
          </label>
        </div>
      )}
    </div>
  );
}
