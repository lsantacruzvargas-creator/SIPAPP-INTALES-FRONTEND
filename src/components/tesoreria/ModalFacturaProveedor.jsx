import { useState, useEffect } from "react";
import { fetchAuth, uploadAuth } from "../../utils/fetchAuth";
import { fechaHoyLima } from "../../utils/fecha";
import { money, round2, nombreEmpresa } from "../../utils/compras";
import { calcularImpuesto, partes, sugerirImpuesto, diasCredito, sumarDias, diasEntre, CODIGOS_DETRACCION, estadoTcComprobante, tcValido, fechaConsultableTc, TIPOS_COMPROBANTE_COMPRA, creditoFiscalDe, cuentasPara, avisoMoneda, vistaPreviaNota, origenesPosibles, etiquetaComprobante, precargaDesdeSire, admiteRetencionIgv } from "../../utils/tesoreria";
import { conBloqueo } from "../../utils/bloqueoApi";

const INP = "border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300 w-full";
const MEDIOS_PAGO = [["transferencia", "Transferencia"], ["deposito", "Depósito"], ["efectivo", "Efectivo"], ["cheque", "Cheque"]];

function desdeOCP(o, fechaEmision) {
  const dias = diasCredito(o.formaPago);
  return {
    modo: "oc", ordenCompraProveedor: o._id, proveedor: String(o.proveedor), moneda: o.moneda,
    subtotal: String(o.saldoPorFacturar), hayServicios: !!o.hayServicios,
    condicion: dias > 0 ? "credito" : "contado", fechaVencimiento: dias > 0 ? sumarDias(fechaEmision, dias) : "",
    plazoDias: dias > 0 ? dias : null,
  };
}

export default function ModalFacturaProveedor({ ocpId, precarga, catalogos, onClose, onGuardada }) {
  const hoy = fechaHoyLima();
  const [ocps, setOcps] = useState([]);
  const [comprobantes, setComprobantes] = useState([]);
  const [archivo, setArchivo] = useState(null);
  const [form, setForm] = useState(() => ({
    modo: "sinOc", ordenCompraProveedor: "", esFleteDe: "", proveedor: "", tipoComprobante: "01", serie: "", numero: "",
    fechaEmision: hoy, moneda: "PEN", tipoCambio: String(catalogos.tipoCambio || ""), subtotal: "", conIgv: true, flete: "0",
    condicion: "contado", fechaVencimiento: "", centroCosto: "", hayServicios: false,
    impuestoManual: false, impuestoTipo: "ninguno", codigoSunat: "", quienDeposita: "nosotros", noAplicaRetencion: false,
    ticketConRuc: false, retener4ta: false, yaPagado: false, pagoCuenta: "", pagoMedio: "transferencia", pagoOperacion: "",
    documentoOrigen: "",
    ...(precarga ? precargaDesdeSire(precarga, catalogos.proveedores) : {}),
  }));
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  // Factura ya registrada cuyo PDF no se pudo subir: el modal pasa a "reintentar PDF".
  const [registrada, setRegistrada] = useState(null);
  const [cuentas, setCuentas] = useState([]);
  useEffect(() => {
    fetchAuth("/cuentas-tesoreria").then(async (r) => { if (r.ok) setCuentas(await r.json()); }).catch(() => {});
  }, []);
  // TC de un comprobante en USD: el venta SUNAT de la fecha de emisión, pedido al cambiar
  // la fecha o la moneda (solo lectura salvo que la consulta falle).
  const [tcConsulta, setTcConsulta] = useState(null);
  // Las notas (07/08) van al TC de su comprobante: no se consulta SUNAT.
  const notaConTcDeOrigen = form.tipoComprobante === "07" || form.tipoComprobante === "08";
  const claveTc = form.moneda === "USD" && !notaConTcDeOrigen && fechaConsultableTc(form.fechaEmision) ? form.fechaEmision : null;
  const consultandoTc = claveTc != null && tcConsulta?.clave !== claveTc;

  useEffect(() => {
    if (!claveTc) return undefined;
    let vigente = true;
    fetchAuth(`/sunat/tipo-cambio?fecha=${claveTc}`)
      .then(async (r) => {
        const datos = await r.json().catch(() => ({}));
        return r.ok ? { ok: true, datos } : { ok: false, mensaje: datos.mensaje };
      })
      .catch(() => ({ ok: false }))
      .then((consulta) => {
        if (!vigente) return;
        const estado = estadoTcComprobante(consulta);
        setTcConsulta({ clave: claveTc, ...estado });
        setForm((f) => ({ ...f, tipoCambio: estado.tc }));
      });
    return () => { vigente = false; };
  }, [claveTc]);
  const tcSoloLectura = !consultandoTc && tcConsulta?.clave === claveTc && tcConsulta.soloLectura;

  useEffect(() => {
    fetchAuth("/tesoreria/por-pagar").then((r) => (r.ok ? r.json() : { ocps: [] })).then((d) => {
      setOcps(d.ocps);
      setComprobantes(d.facturas || []);
      const o = ocpId && d.ocps.find((x) => x._id === ocpId);
      if (o) setForm((f) => ({ ...f, ...desdeOCP(o, f.fechaEmision) }));
    });
  }, [ocpId]);

  const set = (campo) => (e) => {
    const v = e.target.type === "checkbox" ? e.target.checked : e.target.value;
    setForm((f) => ({ ...f, [campo]: v }));
  };
  const elegirOCP = (e) => {
    const o = ocps.find((x) => x._id === e.target.value);
    setForm((f) => (o ? { ...f, ...desdeOCP(o, f.fechaEmision) } : { ...f, ordenCompraProveedor: "" }));
  };
  // El plazo de crédito se conserva: mover la emisión mueve el vencimiento.
  const cambiarEmision = (e) => {
    const fechaEmision = e.target.value;
    setForm((f) => ({
      ...f, fechaEmision,
      fechaVencimiento: f.condicion === "credito" && f.plazoDias != null && fechaEmision ? sumarDias(fechaEmision, f.plazoDias) : f.fechaVencimiento,
    }));
  };
  const cambiarVencimiento = (e) => {
    const fechaVencimiento = e.target.value;
    setForm((f) => ({ ...f, fechaVencimiento, plazoDias: diasEntre(f.fechaEmision, fechaVencimiento) }));
  };
  const elegirImpuesto = (campo) => (e) => setForm((f) => ({ ...f, impuestoManual: true, [campo]: e.target.value }));

  const subtotal = round2(form.subtotal || 0);
  const igv = form.tipoComprobante === "02" || !form.conIgv ? 0 : round2(subtotal * 0.18);
  const total = round2(subtotal + igv);
  const tipoCambio = form.moneda === "USD" ? Number(form.tipoCambio) : 1;
  // Notas (07/08): se ligan a un comprobante vigente del proveedor, del que toman la moneda.
  const esNota = form.tipoComprobante === "07" || form.tipoComprobante === "08";
  const esNC = form.tipoComprobante === "07";
  // Se listan los de ambas monedas: al elegir el origen, la nota toma su moneda.
  const origenesNota = esNota && form.proveedor
    ? ["PEN", "USD"].flatMap((moneda) => origenesPosibles(comprobantes, { proveedor: form.proveedor, moneda }))
    : [];
  const origen = esNota ? comprobantes.find((c) => c._id === form.documentoOrigen) || null : null;
  const elegirOrigen = (e) => {
    const o = comprobantes.find((c) => c._id === e.target.value);
    setForm((f) => ({ ...f, documentoOrigen: e.target.value, ...(o ? { moneda: o.moneda, tipoCambio: String(o.tipoCambio || f.tipoCambio) } : {}) }));
  };
  const ticketConRuc = form.tipoComprobante === "12" && form.ticketConRuc;
  const conCreditoFiscal = creditoFiscalDe({ tipoComprobante: form.tipoComprobante, igv, ticketConRuc, origen });
  const admiteRetencion = admiteRetencionIgv({ tipoComprobante: form.tipoComprobante, igv, ticketConRuc, origen });
  const sugerido = sugerirImpuesto({ total, moneda: form.moneda, tipoCambio, hayServicios: form.hayServicios, esAgenteRetencion: catalogos.esAgenteRetencion, noAplicaRetencion: form.noAplicaRetencion, conCreditoFiscal: admiteRetencion });
  // Recibo por honorarios: solo la retención de 4ta, y solo si se marca (decisión del usuario: manual).
  const esRH = form.tipoComprobante === "02";
  const imp = esNC ? { tipo: "ninguno", codigoSunat: "" } : esRH
    ? { tipo: form.retener4ta ? "retencion4ta" : "ninguno", codigoSunat: "" }
    : form.impuestoManual ? { tipo: form.impuestoTipo, codigoSunat: form.codigoSunat } : sugerido;
  const puedeYaPagado = form.condicion === "contado" && !esNC;
  const previaNota = esNC && origen ? vistaPreviaNota({ totalNota: total, saldoOrigen: origen.saldoNeto }) : null;
  const cuentasPago = cuentasPara({ cuentas, lado: "compra", concepto: "neto", impuesto: { tipo: imp.tipo } }).origen;
  const avisoCuentaPago = form.yaPagado ? avisoMoneda(cuentas.find((c) => c._id === form.pagoCuenta), form.moneda) : null;
  const { tasa, monto } = calcularImpuesto({ ...imp, total, moneda: form.moneda, tipoCambio });
  const quienDeposita = imp.tipo === "detraccion" ? form.quienDeposita : "nosotros";
  const resumen = partes({ lado: "compra", total, moneda: form.moneda, tipoCambio, impuesto: { tipo: imp.tipo, monto, quienDeposita } });
  const ocpsConSaldo = ocps.filter((o) => o.saldoPorFacturar > 0.1);

  const subirPdf = async (fp) => {
    try {
      const fd = new FormData();
      fd.append("archivo", archivo);
      const ra = await conBloqueo("facturaProveedor", fp._id, (h) => uploadAuth(`/facturas-proveedor/${fp._id}/archivos`, fd, h));
      if (ra.ok) return onGuardada(await ra.json());
      const d = await ra.json().catch(() => ({}));
      setError(d.mensaje || "Formato o tamaño no permitido (PDF o imagen, máx. 20 MB).");
    } catch {
      setError("Error de conexión al subir el PDF.");
    }
    setRegistrada(fp);
  };

  const guardar = async () => {
    setGuardando(true);
    setError("");
    try {
      if (registrada) return await subirPdf(registrada);
      const body = {
        tipoComprobante: form.tipoComprobante, serie: form.serie, numero: form.numero, fechaEmision: form.fechaEmision,
        moneda: form.moneda, tipoCambio, subtotal, igv, flete: Number(form.flete) || 0,
        condicion: form.condicion, fechaVencimiento: form.fechaVencimiento,
        impuesto: { tipo: imp.tipo, codigoSunat: imp.codigoSunat, quienDeposita },
        ticketConRuc,
      };
      if (esNota) body.documentoOrigen = form.documentoOrigen;
      if (puedeYaPagado && form.yaPagado) body.pago = { cuenta: form.pagoCuenta, medio: form.pagoMedio, numeroOperacion: form.pagoOperacion };
      if (form.modo === "oc") body.ordenCompraProveedor = form.ordenCompraProveedor;
      else body.proveedor = form.proveedor;
      if (form.modo === "flete") body.esFleteDe = form.esFleteDe;
      if (form.modo === "sinOc") body.centroCosto = form.centroCosto;
      const r = await fetchAuth("/facturas-proveedor", { method: "POST", body: JSON.stringify(body) });
      const fp = await r.json().catch(() => ({}));
      if (!r.ok) return setError(fp.mensaje || "No se pudo registrar el comprobante.");
      if (archivo) await subirPdf(fp);
      else onGuardada(fp);
    } catch {
      setError("Error de conexión con el servidor: verifica en Por pagar si la factura quedó registrada antes de reintentar.");
    } finally {
      setGuardando(false);
    }
  };


  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4" style={{ zIndex: 50 }}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[92vh] overflow-y-auto p-6 space-y-4">
        <h3 className="text-lg font-bold text-gray-800">Registrar comprobante de compra</h3>
        <fieldset disabled={!!registrada} className="space-y-4 disabled:opacity-60">
        <div className="flex gap-4 text-sm">
          {[["oc", "De una OC"], ["sinOc", "Sin OC"], ["flete", "Flete de transportista"]].map(([valor, label]) => (
            <label key={valor} className="flex items-center gap-1.5">
              <input type="radio" checked={form.modo === valor} onChange={() => setForm((f) => ({ ...f, modo: valor, hayServicios: valor === "oc" && f.hayServicios }))} />{label}
            </label>
          ))}
        </div>
        {precarga && !form.proveedor && (
          <p className="text-xs text-amber-700 bg-amber-50 rounded-lg p-2">El RUC {precarga.rucContraparte} no está registrado en Empresas: regístralo como proveedor primero.</p>
        )}
        <div className="grid grid-cols-3 gap-3">
          {form.modo === "oc" && (
            <label className="text-xs text-gray-500 col-span-3">Orden de compra
              <select value={form.ordenCompraProveedor} onChange={elegirOCP} className={INP}>
                <option value="">Elegir…</option>
                {ocpsConSaldo.map((o) => <option key={o._id} value={o._id}>{o.codigo} — {o.proveedorRazonSocial} — por facturar {money(o.saldoPorFacturar, o.moneda)}</option>)}
              </select>
            </label>
          )}
          {form.modo === "flete" && (
            <label className="text-xs text-gray-500 col-span-3">Flete de la OC
              <select value={form.esFleteDe} onChange={set("esFleteDe")} className={INP}>
                <option value="">Elegir…</option>
                {ocps.map((o) => <option key={o._id} value={o._id}>{o.codigo} — {o.proveedorRazonSocial}</option>)}
              </select>
            </label>
          )}
          {form.modo !== "oc" && (
            <label className="text-xs text-gray-500 col-span-2">{form.modo === "flete" ? "Transportista" : "Proveedor"}
              <select value={form.proveedor} onChange={set("proveedor")} className={INP}>
                <option value="">Elegir…</option>
                {catalogos.proveedores.map((p) => <option key={p._id} value={p._id}>{nombreEmpresa(p)}</option>)}
              </select>
            </label>
          )}
          {form.modo === "sinOc" && (
            <label className="text-xs text-gray-500">Centro de costo
              <select value={form.centroCosto} onChange={set("centroCosto")} className={INP}>
                <option value="">Elegir…</option>
                {catalogos.centrosCosto.map((c) => <option key={c._id} value={c._id}>{c.nombre}</option>)}
              </select>
            </label>
          )}
          <label className="text-xs text-gray-500">Comprobante
            <select value={form.tipoComprobante} onChange={(e) => {
              const v = e.target.value;
              setForm((f) => ({ ...f, tipoComprobante: v, documentoOrigen: "", ...(v === "07" || v === "08" ? { modo: "sinOc" } : {}) }));
            }} className={INP}>
              {TIPOS_COMPROBANTE_COMPRA.map((t) => <option key={t.valor} value={t.valor}>{t.label}</option>)}
            </select>
          </label>
          {esNota && (
            <label className="text-xs text-gray-500 col-span-3">Comprobante que modifica
              <select value={form.documentoOrigen} onChange={elegirOrigen} className={INP} disabled={!form.proveedor}>
                <option value="">{form.proveedor ? "Elegir…" : "Primero elige el proveedor"}</option>
                {origenesNota.map((c) => <option key={c._id} value={c._id}>{etiquetaComprobante(c)} — saldo {money(c.saldoNeto, c.moneda)}</option>)}
              </select>
            </label>
          )}
          {previaNota && (
            <p className="col-span-3 text-xs text-gray-600 bg-green-50 rounded-lg p-2">
              Se aplicará {money(previaNota.aplicar, form.moneda)} al comprobante{previaNota.aFavor > 0.009 ? `; quedará ${money(previaNota.aFavor, form.moneda)} a favor del proveedor` : ""}.
              {origen?.impuesto?.tipo === "detraccion" && <span className="block text-amber-700">Si su detracción aún no se deposita, se recalcula sobre el importe que queda.</span>}
            </p>
          )}
          {form.tipoComprobante === "12" && (
            <label className="text-xs text-gray-500 col-span-3 flex items-center gap-1.5" title="Sin RUC de INTALES e IGV desglosado el ticket no da crédito fiscal">
              <input type="checkbox" checked={form.ticketConRuc} onChange={set("ticketConRuc")} />Trae RUC de INTALES e IGV desglosado
            </label>
          )}
          <label className="text-xs text-gray-500">Serie<input value={form.serie} onChange={set("serie")} className={INP} /></label>
          <label className="text-xs text-gray-500">Número<input value={form.numero} onChange={set("numero")} className={INP} /></label>
          <label className="text-xs text-gray-500">Emisión<input type="date" value={form.fechaEmision} onChange={cambiarEmision} className={INP} /></label>
          <label className="text-xs text-gray-500">Moneda
            <select value={form.moneda} onChange={set("moneda")} disabled={form.modo === "oc"} className={INP}>
              <option value="PEN">PEN</option><option value="USD">USD</option>
            </select>
          </label>
          {form.moneda === "USD" && (
            <label className="text-xs text-gray-500">Tipo de cambio
              <input type="number" step="0.001" min="2" max="6" value={consultandoTc ? "" : form.tipoCambio} onChange={set("tipoCambio")}
                readOnly={tcSoloLectura || consultandoTc || notaConTcDeOrigen} placeholder={consultandoTc ? "Consultando SUNAT…" : ""}
                className={`${INP} ${tcSoloLectura || notaConTcDeOrigen ? "bg-gray-50 text-gray-600" : ""}`} />
              {notaConTcDeOrigen && <span className="block mt-1 text-[11px] text-gray-400">TC del comprobante que modifica</span>}
              {!consultandoTc && tcConsulta?.clave === claveTc && (
                <span className={`block mt-1 text-[11px] ${tcConsulta.alerta ? "text-amber-600" : "text-gray-400"}`}>{tcConsulta.aviso}</span>
              )}
              {!consultandoTc && form.tipoCambio !== "" && !tcValido(form.tipoCambio) && (
                <span className="block mt-1 text-[11px] text-red-600">Debe estar entre 2 y 6</span>
              )}
            </label>
          )}
          <label className="text-xs text-gray-500">Subtotal (sin IGV)<input type="number" step="0.01" min="0" value={form.subtotal} onChange={set("subtotal")} className={INP} /></label>
          {form.modo !== "flete" && (
            <label className="text-xs text-gray-500">Flete incluido (sin IGV)<input type="number" step="0.01" min="0" value={form.flete} onChange={set("flete")} className={INP} /></label>
          )}
          <label className="text-xs text-gray-500 flex items-end gap-1.5 pb-2">
            <input type="checkbox" checked={form.conIgv} disabled={form.tipoComprobante === "02"} onChange={set("conIgv")} />IGV 18 % ({money(igv, form.moneda)})
          </label>
          <label className="text-xs text-gray-500">Condición
            <select value={form.condicion} onChange={set("condicion")} className={INP}>
              <option value="contado">Contado</option><option value="credito">Crédito</option>
            </select>
          </label>
          {form.condicion === "credito" && (
            <label className="text-xs text-gray-500">Vencimiento<input type="date" value={form.fechaVencimiento} onChange={cambiarVencimiento} className={INP} /></label>
          )}
          <p className="text-xs text-gray-500 col-span-3">
            Crédito fiscal de IGV: <span className={conCreditoFiscal ? "font-semibold text-green-700" : "font-semibold text-gray-600"}>{conCreditoFiscal ? "Sí" : "No"}</span>
          </p>
        </div>

        <div className="rounded-xl bg-gray-50 border border-gray-100 p-4 space-y-3">
          {esRH && (
            <label className="text-xs text-gray-600 flex items-center gap-1.5">
              <input type="checkbox" checked={form.retener4ta} onChange={set("retener4ta")} />Retener 4ta categoría (8 %)
            </label>
          )}
          <div className={`grid grid-cols-3 gap-3 ${esRH || esNC ? "hidden" : ""}`}>
            <label className="text-xs text-gray-500">Impuesto
              <select value={imp.tipo} onChange={elegirImpuesto("impuestoTipo")} className={INP}>
                <option value="ninguno">Ninguno</option><option value="detraccion">Detracción</option>
                {catalogos.esAgenteRetencion && admiteRetencion && <option value="retencion">Retención 3 %</option>}
              </select>
            </label>
            {imp.tipo === "detraccion" && (
              <>
                <label className="text-xs text-gray-500">Bien o servicio
                  <select value={imp.codigoSunat} onChange={elegirImpuesto("codigoSunat")} className={INP}>
                    <option value="">Elegir…</option>
                    {CODIGOS_DETRACCION.map((c) => <option key={c.codigo} value={c.codigo}>{c.codigo} — {c.descripcion} ({c.porcentaje}%)</option>)}
                  </select>
                </label>
                <label className="text-xs text-gray-500">Deposita
                  <select value={form.quienDeposita} onChange={set("quienDeposita")} className={INP}>
                    <option value="nosotros">INTALES (se descuenta al proveedor)</option>
                    <option value="proveedor">El proveedor (autodetracción)</option>
                  </select>
                </label>
              </>
            )}
            {catalogos.esAgenteRetencion && imp.tipo !== "detraccion" && (
              <label className="text-xs text-gray-500 col-span-2 flex items-end gap-1.5 pb-2">
                <input type="checkbox" checked={form.noAplicaRetencion} onChange={set("noAplicaRetencion")} />Buen contribuyente / agente de retención → no aplica
              </label>
            )}
          </div>
          {!esRH && !form.impuestoManual && sugerido.tipo !== "ninguno" && <p className="text-[11px] text-gray-400">Sugerido según el total y el tipo de compra.</p>}
          <div className="flex justify-between text-sm pt-2 border-t border-gray-200">
            <span>Total {money(total, form.moneda)}</span>
            <span>Impuesto {money(monto)} ({Math.round(tasa * 100)} %)</span>
            <span className="font-bold text-purple-700">Neto a pagar {money(resumen.neto, form.moneda)}</span>
          </div>
        </div>

        {puedeYaPagado && (
          <div className="rounded-xl border border-gray-100 p-4 space-y-3">
            <label className="text-xs text-gray-600 flex items-center gap-1.5">
              <input type="checkbox" checked={form.yaPagado} onChange={set("yaPagado")} />Ya se pagó (registra también el pago del neto)
            </label>
            {form.yaPagado && (
              <div className="grid grid-cols-3 gap-3">
                <label className="text-xs text-gray-500">Cuenta
                  <select value={form.pagoCuenta} onChange={set("pagoCuenta")} className={INP}>
                    <option value="">Elegir…</option>
                    {cuentasPago.map((c) => <option key={c._id} value={c._id}>{c.nombre} ({c.moneda})</option>)}
                  </select>
                </label>
                <label className="text-xs text-gray-500">Medio
                  <select value={form.pagoMedio} onChange={set("pagoMedio")} className={INP}>
                    {MEDIOS_PAGO.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </label>
                <label className="text-xs text-gray-500">N° de operación<input value={form.pagoOperacion} onChange={set("pagoOperacion")} className={INP} /></label>
                {avisoCuentaPago && <p className="col-span-3 text-[11px] text-amber-700">{avisoCuentaPago}</p>}
                {resumen.impuesto > 0 && <p className="col-span-3 text-[11px] text-gray-500">El impuesto ({money(resumen.impuesto)}) queda pendiente de pago.</p>}
              </div>
            )}
          </div>
        )}

        </fieldset>

        {registrada && (
          <p className="text-xs text-amber-800 bg-amber-50 rounded-lg p-2">
            La factura {registrada.codigo} ({registrada.serie}-{registrada.numero}) quedó registrada, pero el PDF no se subió. Elige de nuevo el archivo y reintenta, o termina sin PDF.
          </p>
        )}
        <label className="text-xs text-gray-500 block">PDF de la factura (opcional)
          <input type="file" accept="application/pdf,image/*" onChange={(e) => setArchivo(e.target.files?.[0] || null)} className="block mt-1 text-sm" />
        </label>
        {error && <p className="text-xs text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          {registrada
            ? <button onClick={() => onGuardada(registrada)} disabled={guardando} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Terminar sin PDF</button>
            : <button onClick={onClose} disabled={guardando} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Cancelar</button>}
          <button onClick={guardar} disabled={guardando || !(subtotal > 0) || (registrada && !archivo) || (!registrada && form.moneda === "USD" && (consultandoTc || !tcValido(form.tipoCambio))) || (!registrada && puedeYaPagado && form.yaPagado && !form.pagoCuenta) || (!registrada && esNota && !form.documentoOrigen)}
            className="bg-purple-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-50">
            {guardando ? "Guardando…" : registrada ? "Reintentar subir PDF" : "Registrar comprobante"}
          </button>
        </div>
      </div>
    </div>
  );
}
