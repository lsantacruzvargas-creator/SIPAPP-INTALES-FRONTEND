import { useState, useEffect } from "react";
import { fetchAuth } from "../../utils/fetchAuth";
import { fechaHoyLima } from "../../utils/fecha";
import { TIPOS, FORMATOS, formatoDeCuenta, avisosFijos, cuerpoNuevoLote } from "../../utils/abonos";

const INP = "border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300 disabled:bg-gray-50 disabled:text-gray-700";

export function AvisosFijos({ formato, tipo }) {
  const fijos = avisosFijos({ formato, tipo });
  if (!fijos.length) return null;
  return (
    <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 space-y-1">
      {fijos.map((a) => <p key={a}>{a}</p>)}
    </div>
  );
}

// `nuevo`: { periodo, tipos } desde Planilla del mes o { tipo: "cts", periodo, deposito, fecha } desde un depósito de CTS.
export default function FormNuevoLoteAbono({ nuevo, onCreado, onCerrar }) {
  const tipos = nuevo.tipo ? [nuevo.tipo] : nuevo.tipos;
  const [cuentas, setCuentas] = useState(null);
  const [form, setForm] = useState({ tipo: tipos[0], fecha: nuevo.fecha || fechaHoyLima(), cuenta: "", cargoTipo: "C", cargoNumero: "", referencia: "" });
  const [error, setError] = useState("");
  const [procesando, setProcesando] = useState(false);

  useEffect(() => {
    fetchAuth("/cuentas-tesoreria").then(async (r) => {
      const d = r.ok ? await r.json().catch(() => []) : [];
      setCuentas(d.filter((c) => c.activo && c.tipo === "banco" && c.moneda === "PEN"));
    }).catch(() => { setCuentas([]); setError("Error de conexión con el servidor."); });
  }, []);

  const handleChange = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
  const elegirCuenta = (e) => {
    const c = (cuentas || []).find((x) => x._id === e.target.value);
    setForm((f) => ({ ...f, cuenta: e.target.value, cargoNumero: String(c?.numero || "").replace(/\D/g, "") }));
  };
  const cuenta = (cuentas || []).find((c) => c._id === form.cuenta);
  const formato = cuenta ? formatoDeCuenta(cuenta.codigoEntidad) : null;

  const crear = async () => {
    const { error: invalido, body } = cuerpoNuevoLote({ ...nuevo, ...form, cuenta });
    if (invalido) return setError(invalido);
    setProcesando(true);
    setError("");
    try {
      const r = await fetchAuth("/planilla/abonos", { method: "POST", body: JSON.stringify(body) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) return setError(d.mensaje || "No se pudo crear el lote.");
      onCreado(d);
    } catch {
      setError("Error de conexión con el servidor.");
    } finally {
      setProcesando(false);
    }
  };

  return (
    <div className="space-y-4">
      <h3 className="font-semibold text-gray-800">{nuevo.tipo === "cts" ? "Nuevo lote de abono de CTS" : "Nuevo lote de abono"}</h3>
      <div className="grid sm:grid-cols-2 gap-3">
        <label className="text-xs text-gray-500">Tipo
          <select name="tipo" value={form.tipo} onChange={handleChange} disabled={tipos.length === 1} className={`${INP} block w-full`}>
            {tipos.map((t) => <option key={t} value={t}>{TIPOS[t]}</option>)}
          </select>
        </label>
        <label className="text-xs text-gray-500">Fecha de pago
          <input type="date" name="fecha" value={form.fecha} onChange={handleChange} className={`${INP} block w-full`} />
        </label>
        <label className="text-xs text-gray-500 sm:col-span-2">Cuenta de cargo (banco en soles)
          <select value={form.cuenta} onChange={elegirCuenta} disabled={!cuentas} className={`${INP} block w-full`}>
            <option value="">{cuentas ? "Elige la cuenta…" : "Cargando…"}</option>
            {(cuentas || []).map((c) => <option key={c._id} value={c._id}>{c.nombre}{c.numero ? ` · ${c.numero}` : ""}</option>)}
          </select>
        </label>
        {cuentas && cuentas.length === 0 && <p className="text-xs text-amber-700 sm:col-span-2">No hay cuentas de banco en soles activas: créala en Tesorería.</p>}
        {formato === "bcp" && (
          <>
            <label className="text-xs text-gray-500">Tipo de la cuenta de cargo (BCP)
              <select name="cargoTipo" value={form.cargoTipo} onChange={handleChange} className={`${INP} block w-full`}>
                <option value="C">Corriente</option>
                <option value="M">Maestra</option>
              </select>
            </label>
            <label className="text-xs text-gray-500">Número de la cuenta de cargo (13 dígitos)
              <input name="cargoNumero" value={form.cargoNumero} inputMode="numeric" maxLength={20} onChange={handleChange} className={`${INP} block w-full`} />
            </label>
          </>
        )}
        <label className="text-xs text-gray-500 sm:col-span-2">Referencia (opcional, hasta 40 caracteres)
          <input name="referencia" value={form.referencia} maxLength={40} onChange={handleChange} className={`${INP} block w-full`} />
        </label>
      </div>
      {formato && <p className="text-xs text-gray-500">Formato del archivo: <b>{FORMATOS[formato]}</b> (según el código de entidad de la cuenta).</p>}
      <AvisosFijos formato={formato} tipo={form.tipo} />
      {error && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
      <div className="flex justify-end gap-3">
        <button type="button" onClick={onCerrar} disabled={procesando} className="border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50">Cancelar</button>
        <button type="button" onClick={crear} disabled={procesando || !cuentas} className="bg-purple-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-purple-700 disabled:opacity-50">
          {procesando ? "Creando…" : "Armar lote"}
        </button>
      </div>
    </div>
  );
}
