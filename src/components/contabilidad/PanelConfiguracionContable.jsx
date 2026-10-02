import { useState, useEffect, useCallback } from "react";
import { fetchAuth } from "../../utils/fetchAuth";
import TablaScroll from "../TablaScroll";
import AvisoAccion from "../AvisoAccion";
import BuscadorCuenta from "./BuscadorCuenta";

const INP = "border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300 disabled:bg-gray-50";
const CUENTAS_MONEDA = [["proveedores", "Proveedores (facturas)"], ["honorarios", "Honorarios por pagar"], ["clientes", "Clientes"]];
const CUENTAS = [
  ["igv", "IGV"], ["retencion4ta", "Retención de 4.ª categoría"], ["detraccionCompras", "Detracción de compras (lo detraído)"],
  ["retencionesSufridas", "Retenciones IGV sufridas"], ["difCambioPerdida", "Diferencia de cambio — pérdida"],
  ["difCambioGanancia", "Diferencia de cambio — ganancia"], ["ventasServicios", "Ventas de servicios"],
  ["ventasProductos", "Ventas de productos fabricados"], ["ventasMercaderias", "Ventas de mercaderías"],
  ["comprasDefecto", "Compras por defecto (vacía: cada comprobante con su cuenta)"],
];
const SUBDIARIOS = [["compras", "Compras"], ["comprasDetraccion", "Compras con detracción"], ["boletas", "Boletas de compra"], ["honorarios", "Honorarios"], ["ventas", "Ventas"], ["cajaBancos", "Caja y bancos"], ["diario", "Diario (manuales)"]];
const TIPOS = { "01": "Factura", "02": "Recibo por honorarios", "03": "Boleta", "07": "Nota de crédito", "08": "Nota de débito", "12": "Ticket", "14": "Servicios públicos" };

// Configuración contable (C2): cuentas por rol, subdiarios y datos de CONCAR, cuentas de bancos y centros de costo.
export default function PanelConfiguracionContable({ cuentas, puedeEscribir }) {
  const [datos, setDatos] = useState(null);
  const [form, setForm] = useState(null);
  const [codigosDet, setCodigosDet] = useState("");
  const [procesando, setProcesando] = useState(false);
  const [aviso, setAviso] = useState("");

  // `soloListas`: tras guardar una cuenta de banco o un centro no se pisa lo que se está editando en el formulario.
  const cargar = useCallback(async (soloListas = false) => {
    try {
      const r = await fetchAuth("/contabilidad/configuracion");
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.mensaje || "No se pudo cargar la configuración.");
      if (soloListas === true) return setDatos((x) => ({ ...d, config: x?.config || d.config }));
      setDatos(d);
      setForm(d.config);
      setCodigosDet(Object.entries(d.config.detraccion?.codigos || {}).map(([k, v]) => `${k}=${v}`).join(", "));
    } catch (e) {
      setAviso(e.message || "Error de conexión con el servidor.");
    }
  }, []);
  useEffect(() => { const t = setTimeout(cargar, 0); return () => clearTimeout(t); }, [cargar]);

  if (!form) return <p className="text-sm text-gray-400">Cargando…</p>;
  const set = (ruta, v) => setForm((f) => {
    const n = structuredClone(f);
    const partes = ruta.split(".");
    let o = n;
    for (const p of partes.slice(0, -1)) o = o[p] ??= {};
    o[partes.at(-1)] = v;
    return n;
  });

  const guardar = async () => {
    const codigos = {};
    for (const par of codigosDet.split(",").map((s) => s.trim()).filter(Boolean)) {
      const [k, v] = par.split("=").map((s) => s.trim());
      codigos[k] = v || "";
    }
    setProcesando(true);
    try {
      const r = await fetchAuth("/contabilidad/configuracion", {
        method: "PUT", body: JSON.stringify({ ...form, detraccion: { ...form.detraccion, codigos }, version: datos.config.updatedAt }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) return setAviso(d.mensaje || "No se pudo guardar.");
      setAviso("Configuración guardada.");
      cargar();
    } catch {
      setAviso("Error de conexión con el servidor.");
    } finally {
      setProcesando(false);
    }
  };
  const guardarCodigo = async (ruta, id, cuerpo) => {
    try {
      const r = await fetchAuth(`/contabilidad/configuracion/${ruta}/${id}`, { method: "PUT", body: JSON.stringify(cuerpo) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) return setAviso(d.mensaje || "No se pudo guardar.");
      cargar(true);
    } catch {
      setAviso("Error de conexión con el servidor.");
    }
  };

  const ro = !puedeEscribir;
  const cuenta = (ruta, valor, permitirVacio = false) => (
    <BuscadorCuenta cuentas={cuentas} valor={valor || ""} disabled={ro} permitirVacio={permitirVacio} onChange={(v) => set(ruta, v)} className="w-64" />
  );

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-gray-700">Cuentas de los asientos automáticos</h3>
        <table className="text-sm">
          <tbody>
            {CUENTAS_MONEDA.map(([k, l]) => (
              <tr key={k}><td className="py-1 pr-3 text-gray-600">{l}</td>
                <td className="py-1 pr-2"><span className="text-xs text-gray-400 mr-1">S/</span>{cuenta(`cuentas.${k}.PEN`, form.cuentas[k]?.PEN)}</td>
                <td className="py-1"><span className="text-xs text-gray-400 mr-1">US$</span>{cuenta(`cuentas.${k}.USD`, form.cuentas[k]?.USD)}</td></tr>
            ))}
            {CUENTAS.map(([k, l]) => (
              <tr key={k}><td className="py-1 pr-3 text-gray-600">{l}</td><td className="py-1" colSpan={2}>{cuenta(`cuentas.${k}`, form.cuentas[k], ["retencionesSufridas", "comprasDefecto", "ventasProductos", "ventasMercaderias", "ventasServicios"].includes(k))}</td></tr>
            ))}
            <tr><td className="py-1 pr-3 text-gray-600">Venta por defecto</td><td className="py-1" colSpan={2}>
              <select value={form.ventaPorDefecto} disabled={ro} onChange={(e) => set("ventaPorDefecto", e.target.value)} className={INP}>
                <option value="servicios">Servicios</option><option value="productos">Productos fabricados</option><option value="mercaderias">Mercaderías</option>
              </select>
            </td></tr>
          </tbody>
        </table>
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-gray-700">CONCAR</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
          {SUBDIARIOS.map(([k, l]) => (
            <label key={k} className="flex items-center gap-2"><span className="text-gray-600 w-44">Subdiario {l}</span>
              <input value={form.subdiarios[k] || ""} disabled={ro} onChange={(e) => set(`subdiarios.${k}`, e.target.value.replace(/\D/g, ""))} className={`${INP} w-20 font-mono`} /></label>
          ))}
          {Object.entries(TIPOS).map(([t, l]) => (
            <label key={t} className="flex items-center gap-2"><span className="text-gray-600 w-44">Sigla {l} ({t})</span>
              <input value={form.siglas?.[t] || ""} maxLength={2} disabled={ro} onChange={(e) => set(`siglas.${t}`, e.target.value.toUpperCase())} className={`${INP} w-20 font-mono`} /></label>
          ))}
          <label className="flex items-center gap-2"><span className="text-gray-600 w-44">Moneda soles</span>
            <input value={form.monedas.PEN} maxLength={2} disabled={ro} onChange={(e) => set("monedas.PEN", e.target.value.toUpperCase())} className={`${INP} w-20 font-mono`} /></label>
          <label className="flex items-center gap-2"><span className="text-gray-600 w-44">Moneda dólares</span>
            <input value={form.monedas.USD} maxLength={2} disabled={ro} onChange={(e) => set("monedas.USD", e.target.value.toUpperCase())} className={`${INP} w-20 font-mono`} /></label>
          <label className="flex items-center gap-2"><span className="text-gray-600 w-44">Doc. de detracción</span>
            <input value={form.detraccion.tipoDoc} maxLength={2} disabled={ro} onChange={(e) => set("detraccion.tipoDoc", e.target.value.toUpperCase())} className={`${INP} w-20 font-mono`} /></label>
          <label className="flex items-center gap-2"><span className="text-gray-600 w-44">Área de detracción</span>
            <input value={form.detraccion.area} disabled={ro} onChange={(e) => set("detraccion.area", e.target.value)} className={`${INP} w-20 font-mono`} /></label>
          <label className="flex items-center gap-2"><span className="text-gray-600 w-44">Constancia pendiente</span>
            <input value={form.detraccion.constanciaPendiente} disabled={ro} onChange={(e) => set("detraccion.constanciaPendiente", e.target.value.replace(/\D/g, ""))} className={`${INP} w-32 font-mono`} /></label>
        </div>
        <label className="block text-sm"><span className="text-gray-600">Códigos de detracción SUNAT → T.G. 28 (ej. <span className="font-mono">037=03701, 022=02202</span>; sin mapeo: SUNAT + 01)</span>
          <input value={codigosDet} disabled={ro} onChange={(e) => setCodigosDet(e.target.value)} className={`${INP} w-full font-mono mt-1`} /></label>
        <label className="block text-sm"><span className="text-gray-600">Cuentas con centro de costo (prefijos, separados por coma)</span>
          <input value={(form.prefijosCentroCosto || []).join(", ")} disabled={ro}
            onChange={(e) => set("prefijosCentroCosto", e.target.value.split(",").map((s) => s.trim()).filter(Boolean))} className={`${INP} w-full font-mono mt-1`} /></label>
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={!!form.generarDestinos} disabled={ro} onChange={(e) => set("generarDestinos", e.target.checked)} />
          Generar los destinos 9x/79 en el asiento (normalmente los genera CONCAR)
        </label>
        {puedeEscribir && (
          <button onClick={guardar} disabled={procesando} className="bg-purple-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-purple-700 disabled:opacity-50">Guardar configuración</button>
        )}
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-gray-700">Cuenta contable de cada caja y banco</h3>
        <TablaScroll>
          <table className="text-sm">
            <tbody>
              {datos.cuentasTesoreria.map((c) => (
                <tr key={c._id} className="border-b border-gray-100">
                  <td className="py-1 pr-3 text-gray-700">{c.nombre} <span className="text-xs text-gray-400">{c.tipo} · {c.moneda}{c.activo === false ? " · inactiva" : ""}</span></td>
                  <td className="py-1">
                    <BuscadorCuenta cuentas={cuentas.filter((x) => x.codigo.startsWith("10"))} valor={c.cuentaContable || ""} disabled={ro} permitirVacio className="w-64"
                      onChange={(v) => guardarCodigo("cuentas-tesoreria", c._id, { cuentaContable: v })} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TablaScroll>
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-gray-700">Código contable de cada centro de costo (columna M de CONCAR)</h3>
        <table className="text-sm">
          <tbody>
            {datos.centrosCosto.map((c) => <FilaCentro key={c._id} centro={c} ro={ro} onGuardar={(v) => guardarCodigo("centros-costo", c._id, { codigoContable: v })} />)}
          </tbody>
        </table>
      </section>
      {aviso && <AvisoAccion mensaje={aviso} onCerrar={() => setAviso("")} />}
    </div>
  );
}

function FilaCentro({ centro, ro, onGuardar }) {
  const [valor, setValor] = useState(centro.codigoContable || "");
  const cambiado = valor !== (centro.codigoContable || "");
  return (
    <tr className="border-b border-gray-100">
      <td className="py-1 pr-3 text-gray-700">{centro.nombre}{centro.activo === false && <span className="text-xs text-gray-400"> · inactivo</span>}</td>
      <td className="py-1 pr-2"><input value={valor} maxLength={6} disabled={ro} onChange={(e) => setValor(e.target.value.replace(/[^A-Za-z0-9]/g, ""))} className={`${INP} w-24 font-mono`} /></td>
      <td className="py-1">{!ro && cambiado && <button onClick={() => onGuardar(valor)} className="text-xs text-purple-600 hover:underline">Guardar</button>}</td>
    </tr>
  );
}
