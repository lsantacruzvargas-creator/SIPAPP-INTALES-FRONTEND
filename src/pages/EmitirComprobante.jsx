import { useState, useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { fetchAuth } from "../utils/fetchAuth";
import { fechaHoyLima } from "../utils/fecha";
import { precioConDescuento } from "../utils/cotizacionItems";
import { r2, r0 } from "../utils/redondeo";
import TablaScroll from "../components/TablaScroll";
import {
  AFECTACION_IGV,
  TIPO_ITEM,
  unidadesPorTipoItem,
  TIPO_DOC_RECEPTOR,
  MOTIVO_NC,
  MOTIVO_ND,
  TIPO_MONEDA,
  DETRACCION_VENTA_CPE,
  normalizarCuentaDetraccion,
  cuentaDetraccionValida,
  itemVacioComprobante,
  precioUnitarioDesdeValor,
  calcularLineaComprobante,
  totalesComprobante,
  documentoValido,
  serieValida,
  parsearGuiaRemision,
  formatearGuiaRemision,
  MSG_OC_SIN_IGV,
} from "../utils/catalogosSunat";

const RECEPTOR_VACIO = { schemeID: "6", numDoc: "", nombre: "" };
const REFERENCIA_VACIA = { id: "", serie: "", tipoDoc: "" };

// Empresa emisora fija — este ERP factura únicamente a nombre de Huaquian.
// Las credenciales SUNAT las resuelve el hub central por RUC (no hay registro
// de credenciales en el ERP). Deben coincidir con RUC_EMISOR/RAZON_SOCIAL_EMISOR
// de Backend/.env.
const RUC_EMISOR = "20607650811";
const NOMBRE_EMISOR = "INTALES";

// Serie fija por tipo de comprobante — todas terminan en "2" para evitar
// futuros conflictos de correlativo con series de prueba/históricas.
const SERIE_POR_TIPO = { "01": "F002", "03": "B002", "07": "FC02", "08": "FD02" };
const NOMBRE_TIPO_DOC = { "01": "la factura", "03": "la boleta", "07": "la nota de crédito", "08": "la nota de débito" };

// Marca visual de campo obligatorio, junto al texto del label.
function Oblig() {
  return <span className="text-red-500 ml-0.5">*</span>;
}

export default function EmitirComprobante() {
  const location = useLocation();
  const navigate = useNavigate();
  const [rucEmisor] = useState(RUC_EMISOR);
  const [tipoDoc, setTipoDoc] = useState("01");
  const [serie, setSerie] = useState(SERIE_POR_TIPO["01"]);
  const [formaPago, setFormaPago] = useState("Contado");
  const [cuotas, setCuotas] = useState([]);
  const [receptor, setReceptor] = useState(RECEPTOR_VACIO);
  const [tipoBienServicio, setTipoBienServicio] = useState("bien");
  const [items, setItems] = useState([itemVacioComprobante()]);
  const [comprobantesRef, setComprobantesRef] = useState([]);
  const [filtroRef, setFiltroRef] = useState("");
  const [referencia, setReferencia] = useState(REFERENCIA_VACIA);
  const [motivoCodigo, setMotivoCodigo] = useState("");
  const [motivoDescripcion, setMotivoDescripcion] = useState("");
  const [moneda, setMoneda] = useState("PEN");
  const [otrosCargos, setOtrosCargos] = useState("");
  const [montoRedondeo, setMontoRedondeo] = useState("");
  const [observaciones, setObservaciones] = useState("");
  const [informacionRelacionada, setInformacionRelacionada] = useState("");
  const [detraccionAplica, setDetraccionAplica] = useState(false);
  const [detraccionCodigoBien, setDetraccionCodigoBien] = useState("");
  const [detraccionPorcentaje, setDetraccionPorcentaje] = useState("");
  const [detraccionCuentaBancaria, setDetraccionCuentaBancaria] = useState("");
  const [retencionAplica, setRetencionAplica] = useState(false);
  const [retencionPorcentaje, setRetencionPorcentaje] = useState("3");
  const [numeroOrdenCompra, setNumeroOrdenCompra] = useState("");
  // GRE relacionada (cac:DespatchDocumentReference en el XML), texto libre "SERIE-CORRELATIVO".
  const [guiaRelacionada, setGuiaRelacionada] = useState("");
  const [mostrarBuscadorGuia, setMostrarBuscadorGuia] = useState(false);
  const [guiasDisponibles, setGuiasDisponibles] = useState([]);
  const [buscandoGuia, setBuscandoGuia] = useState(false);
  const [filtroGuia, setFiltroGuia] = useState("");
  const [ordenCompraId, setOrdenCompraId] = useState("");
  const [mostrarBuscadorOC, setMostrarBuscadorOC] = useState(false);
  const [ordenesCompra, setOrdenesCompra] = useState([]);
  const [buscandoOC, setBuscandoOC] = useState(false);
  const [filtroOC, setFiltroOC] = useState("");
  const [buscandoDoc, setBuscandoDoc] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");
  const errorRef = useRef(null);
  const [resultado, setResultado] = useState(null);
  // Presente solo cuando se llega desde "Crear Factura" de la tarjeta de
  // relación de una Orden de Compra (ver DetalleOrdenCompra.jsx) — al emitir
  // con éxito, además crea el registro interno Factura vinculado a esta OC
  // (mismo paso 2 que hacía ModalCrearFactura.jsx).
  const [ocOrigen, setOcOrigen] = useState(null);
  const [facturaInterna, setFacturaInterna] = useState(null);

  const esNota = tipoDoc === "07" || tipoDoc === "08";

  // El banner está arriba y «Emitir» al pie de un formulario largo: sin esto el error queda fuera de la vista.
  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [error]);

  const aplicarComprobanteReferencia = (c) => {
    setReferencia({ id: c._id, serie: `${c.serie}-${c.correlativo}`, tipoDoc: c.tipoDoc });
    setReceptor({ schemeID: c.receptor.schemeID, numDoc: c.receptor.numDoc, nombre: c.receptor.nombre });
    if (c.totales?.moneda) setMoneda(c.totales.moneda);
    setTipoBienServicio(c.items?.[0]?.unidad === "ZZ" ? "servicio" : "bien");
    setItems(c.items.map((i) => ({
      _key: Date.now() + Math.random(),
      descripcion: i.descripcion,
      cantidad: i.cantidad,
      unidad: i.unidad,
      valorUnitario: i.valorUnitario,
      precioUnitario: i.precioUnitario ?? i.valorUnitario,
      afectacion: i.afectacion,
      descuentoPorcentaje: Math.round((i.descuentoPorcentaje || 0) * 100),
    })));
  };

  // Precarga emisor (fijo), receptor, ítems y precios, y N° de OC a partir
  // de la Cotización vinculada a la orden de compra — la OC en sí no tiene
  // ítems propios, solo un monto global (ver OrdenCompra.js).
  const aplicarPrellenadoOC = (oc, cotizacion) => {
    setOcOrigen(oc);
    setTipoDoc("01");
    setSerie(SERIE_POR_TIPO["01"]);
    const emp = oc.empresa;
    if (emp) {
      setReceptor({ schemeID: "6", numDoc: emp.ruc || "", nombre: emp.razonSocial || "" });
    }
    const esServicio = cotizacion?.tipo === "servicio";
    const unidad = esServicio ? "ZZ" : "NIU";
    setTipoBienServicio(esServicio ? "servicio" : "bien");
    if (cotizacion?.moneda) setMoneda(cotizacion.moneda);
    // OC consolidada: una línea por cotización anexada, por el monto de esa cotización en la OC.
    if (oc.lineas?.length) {
      setItems(oc.lineas.map((l) => {
        const valor = r2(Number(l.subtotal) || 0);
        return {
          ...itemVacioComprobante(),
          descripcion: l.titulo || l.cotizacion?.titulo || "",
          cantidad: 1,
          unidad,
          valorUnitario: valor,
          precioUnitario: precioUnitarioDesdeValor(valor, "10"),
          afectacion: "10",
          descuentoPorcentaje: 0,
        };
      }));
      setNumeroOrdenCompra(oc.numeroOrden || oc.codigo || "");
      setOrdenCompraId(oc._id || "");
      return;
    }
    // El monto a facturar es el de la OC (puede diferir del de la cotización);
    // las líneas de la cotización solo se usan si su suma cuadra con ese monto.
    const montoOC = r2(Number(oc.subtotal) || 0);
    // OC parcial (generada desde ítems puntuales): solo se facturan sus ítems.
    const itemsDeOC = (cotizacion?.items || []).filter((i) => (i.ocGenerada?._id || i.ocGenerada) === oc._id);
    const lineas = (itemsDeOC.length ? itemsDeOC : cotizacion?.items || []).map((i) => {
      // Precio c/dscto = precio unitario neto del descuento global de la
      // Cotización (mismo criterio que su tabla, ver cotizacionItems.js) —
      // el valor unitario de la factura sale ya neto, no del bruto.
      const valorUnitario = precioConDescuento(i, cotizacion?.descuentoGlobal);
      return {
        _key: Date.now() + Math.random(),
        descripcion: i.descripcion,
        cantidad: i.cantidad || 1,
        unidad,
        valorUnitario,
        precioUnitario: precioUnitarioDesdeValor(valorUnitario, "10"),
        afectacion: "10",
        descuentoPorcentaje: 0,
      };
    });
    const baseLineas = lineas.reduce((s, l) => s + calcularLineaComprobante(l).base, 0);
    // Tolerancia: redondeo por línea (medio céntimo por ítem).
    const cuadraConOC = !(montoOC > 0) || Math.abs(baseLineas - montoOC) <= 0.01 * lineas.length;
    if (lineas.length && cuadraConOC) {
      setItems(lineas);
    } else if (montoOC > 0) {
      setItems([{
        ...itemVacioComprobante(),
        descripcion: oc.descripcion || oc.titulo || lineas[0]?.descripcion || "",
        cantidad: 1,
        unidad,
        valorUnitario: montoOC,
        precioUnitario: precioUnitarioDesdeValor(montoOC, "10"),
        afectacion: "10",
        descuentoPorcentaje: 0,
      }]);
    } else {
      setItems([{ ...itemVacioComprobante(), descripcion: oc.descripcion || oc.titulo || "", unidad }]);
    }
    setNumeroOrdenCompra(oc.numeroOrden || oc.codigo || "");
    setOrdenCompraId(oc._id || "");
  };

  useEffect(() => {
    const c = location.state?.comprobante;
    // Desde el detalle de una Factura interna solo se tiene el id del comprobante: se trae completo.
    const comprobanteId = location.state?.comprobanteId;
    if (c || comprobanteId) {
      const tipoDestino = location.state.tipoDocDestino || "07";
      setTipoDoc(tipoDestino);
      setSerie(SERIE_POR_TIPO[tipoDestino]);
    }
    if (c) aplicarComprobanteReferencia(c);
    else if (comprobanteId) {
      fetchAuth(`/cpe/${comprobanteId}`).then(async (r) => {
        const data = await r.json().catch(() => ({}));
        if (data.ok) aplicarComprobanteReferencia(data.data);
        else setError(data.mensaje || data.error || "No se pudo cargar el comprobante a modificar; selecciónalo en la lista.");
      });
    }
    const pre = location.state?.prellenarDesdeOC;
    if (pre?.oc) {
      aplicarPrellenadoOC(pre.oc, pre.cotizacion);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!esNota || !rucEmisor) { setComprobantesRef([]); return; }
    fetchAuth(`/cpe?rucEmisor=${rucEmisor}&estado=ACEPTADO&limit=100`).then(async (r) => {
      const data = await r.json().catch(() => ({}));
      if (data.ok) setComprobantesRef(data.data.filter((c) => c.tipoDoc === "01" || c.tipoDoc === "03"));
    });
  }, [esNota, rucEmisor]);

  const textoFiltroRef = filtroRef.trim().toLowerCase();
  const comprobantesRefFiltrados = textoFiltroRef
    ? comprobantesRef.filter((c) => `${c.serie}-${c.correlativo} ${c.receptor?.nombre || ""} ${c.receptor?.numDoc || ""}`.toLowerCase().includes(textoFiltroRef))
    : comprobantesRef;

  const ligarComprobanteRef = async (id) => {
    if (!id) { setReferencia(REFERENCIA_VACIA); return; }
    const res  = await fetchAuth(`/cpe/${id}`);
    const data = await res.json().catch(() => ({}));
    if (!data.ok) { setError(data.mensaje || data.error || "No se pudo cargar el comprobante seleccionado."); return; }
    aplicarComprobanteReferencia(data.data);
  };

  const cambiarTipoDoc = (t) => {
    setTipoDoc(t);
    setSerie(SERIE_POR_TIPO[t]);
    if (t === "01") setReceptor((r) => ({ ...r, schemeID: "6" }));
    else setRetencionAplica(false);
    if (t !== "07" && t !== "08") {
      setReferencia(REFERENCIA_VACIA);
      setMotivoCodigo("");
      setMotivoDescripcion("");
    }
  };

  const handleReceptor = (e) => {
    const { name, value } = e.target;
    if (name === "schemeID" && value === "-") return setReceptor({ schemeID: "-", numDoc: "-", nombre: "CLIENTES VARIOS" });
    if (name === "schemeID" && receptor.schemeID === "-") return setReceptor({ schemeID: value, numDoc: "", nombre: "" });
    setReceptor({ ...receptor, [name]: value });
  };

  const buscarReceptorRuc = async (numDoc) => {
    if (receptor.schemeID !== "6" || numDoc.length !== 11) return;
    setBuscandoDoc(true);
    try {
      const res = await fetchAuth(`/sunat/ruc/${numDoc}`);
      if (!res.ok) { setError("RUC no encontrado en SUNAT"); return; }
      const data = await res.json();
      setReceptor((r) => ({ ...r, nombre: data.razonSocial || r.nombre }));
      setError("");
    } catch {
      setError("Error al consultar SUNAT");
    } finally {
      setBuscandoDoc(false);
    }
  };

  const handleItem = (key, campo, valor) =>
    setItems(items.map((i) => {
      if (i._key !== key) return i;
      const actualizado = { ...i, [campo]: valor };
      if (campo === "valorUnitario" || campo === "afectacion") {
        actualizado.precioUnitario = precioUnitarioDesdeValor(actualizado.valorUnitario, actualizado.afectacion);
      }
      return actualizado;
    }));

  const cambiarTipoBienServicio = (valor) => {
    setTipoBienServicio(valor);
    setItems(items.map((i) => ({
      ...i,
      unidad: valor === "servicio" ? "ZZ" : (i.unidad === "ZZ" ? "NIU" : i.unidad),
    })));
  };

  const agregarItem = () => setItems([
    ...items,
    { ...itemVacioComprobante(), unidad: tipoBienServicio === "servicio" ? "ZZ" : "NIU" },
  ]);
  const eliminarItem = (key) => setItems(items.filter((i) => i._key !== key));

  const cambiarFormaPago = (v) => {
    setFormaPago(v);
    if (v === "Credito" && cuotas.length === 0) {
      setCuotas([{ _key: Date.now(), monto: "", fechaVencimiento: "" }]);
    }
  };
  const agregarCuota = () => setCuotas([...cuotas, { _key: Date.now() + Math.random(), monto: "", fechaVencimiento: "" }]);
  const eliminarCuota = (key) => setCuotas(cuotas.filter((c) => c._key !== key));
  const handleCuota = (key, campo, valor) =>
    setCuotas(cuotas.map((c) => (c._key === key ? { ...c, [campo]: valor } : c)));

  // El input de descuento está en % (0-100); calcularLineaComprobante trabaja
  // en fracción (0-1), igual que el backend y el modelo Comprobante.
  const itemsCalc = items.map((i) => ({
    ...i,
    ...calcularLineaComprobante({ ...i, descuentoPorcentaje: (Number(i.descuentoPorcentaje) || 0) / 100 }),
  }));
  const otrosCargosNum   = Number(otrosCargos) || 0;
  const montoRedondeoNum = Number(montoRedondeo) || 0;
  const totales = totalesComprobante(itemsCalc, otrosCargosNum, montoRedondeoNum);
  const totalGeneral = totales.totalPagar;
  const sumaCuotas = r2(cuotas.reduce((s, c) => s + (Number(c.monto) || 0), 0));

  // Monto neto a depositar = detraccionPorcentaje% del total a pagar — ya no es un input libre,
  // se deriva siempre del total y el porcentaje vigente (evita que quede desincronizado si el
  // usuario cambia ítems/porcentaje después de haberlo tipeado a mano). El depósito en el Banco
  // de la Nación va en soles enteros, no en céntimos (.5 sube al entero superior).
  // En dólares el servidor calcula el depósito en soles; aquí queda el neto en dólares con decimales.
  const detraccionMontoNeto = !detraccionAplica ? ""
    : moneda === "USD" ? r2(totalGeneral * (Number(detraccionPorcentaje) || 0) / 100).toFixed(2)
    : r0(totalGeneral * (Number(detraccionPorcentaje) || 0) / 100).toFixed(2);

  // Solo para mostrar lo que irá al XML: el servidor (detraccionDelCpe) recalcula el depósito en soles
  // con el TC venta del día de emisión y este mismo redondeo — /sunat/tipo-cambio usa su misma caché.
  const [tcDetraccion, setTcDetraccion] = useState(null);
  useEffect(() => {
    if (!detraccionAplica || moneda === "PEN") return;
    let vigente = true;
    setTcDetraccion(null);
    fetchAuth(`/sunat/tipo-cambio?fecha=${fechaHoyLima()}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (vigente) setTcDetraccion(d?.venta > 0 ? d : { error: true }); })
      .catch(() => { if (vigente) setTcDetraccion({ error: true }); });
    return () => { vigente = false; };
  }, [detraccionAplica, moneda]);
  const detraccionSoles = tcDetraccion?.venta
    ? r0(r2(totalGeneral * tcDetraccion.venta * (Number(detraccionPorcentaje) || 0) / 100))
    : null;
  const fechaTcDetraccion = (tcDetraccion?.fecha || tcDetraccion?.fechaTc || "").split("-").reverse().join("/");

  // Retención del IGV: la retiene el cliente (agente de retención) al pagar, sobre el total.
  // El backend la recalcula igual; acá es para mostrarla y para el neto de las cuotas.
  const retencionMonto = retencionAplica
    ? r2(totalGeneral * (Number(retencionPorcentaje) || 0) / 100)
    : 0;
  // Equivalente en soles solo referencial, al TC vigente de la app: el XML lleva la retención en
  // la moneda del comprobante (SUNAT 2071) y el cliente la convierte con el TC de la fecha de pago.
  const [tcRetencion, setTcRetencion] = useState(null);
  useEffect(() => {
    if (!retencionAplica || moneda === "PEN") return;
    let vigente = true;
    fetchAuth("/tipo-cambio")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (vigente) setTcRetencion(d?.valor > 0 ? d : null); })
      .catch(() => { if (vigente) setTcRetencion(null); });
    return () => { vigente = false; };
  }, [retencionAplica, moneda]);
  const retencionSoles = tcRetencion ? r2(retencionMonto * tcRetencion.valor) : 0;

  // Lo que deben sumar las cuotas: el XML informa como monto neto pendiente el total menos la
  // detracción (va al Banco de la Nación) y menos la retención; el total del comprobante no cambia.
  const montoNetoPendiente = r2(totalGeneral - (detraccionAplica ? Number(detraccionMontoNeto) || 0 : 0) - retencionMonto);
  // SUNAT exige igualdad exacta al céntimo (3319) — sin tolerancia de ±0.01.
  const cuotasCuadran = Math.abs(sumaCuotas - montoNetoPendiente) < 0.005;

  const ro = !!resultado?.ok;

  const ordenesCompraFiltradas = ordenesCompra.filter((o) => {
    if (!filtroOC.trim()) return true;
    const q = filtroOC.trim().toLowerCase();
    return (
      (o.numeroOrden || "").toLowerCase().includes(q) ||
      (o.codigo || "").toLowerCase().includes(q) ||
      (o.titulo || "").toLowerCase().includes(q) ||
      (o.empresa?.razonSocial || "").toLowerCase().includes(q)
    );
  });

  const abrirBuscadorOC = async () => {
    setMostrarBuscadorOC(true);
    if (ordenesCompra.length) return;
    setBuscandoOC(true);
    try {
      const res  = await fetchAuth("/ordenes-compra");
      const data = await res.json();
      setOrdenesCompra(Array.isArray(data) ? data : []);
    } finally {
      setBuscandoOC(false);
    }
  };

  const elegirOC = (o) => {
    setNumeroOrdenCompra(o.numeroOrden || o.codigo);
    setOrdenCompraId(o._id);
    setMostrarBuscadorOC(false);
  };

  const otsDeGuia = (g) => (g.ordenesTrabajo || []).filter((o) => o && typeof o === "object").map((o) => o.numeroOT || o.codigo).filter(Boolean);
  const guiasFiltradas = guiasDisponibles.filter((g) => {
    if (!filtroGuia.trim()) return true;
    const q = filtroGuia.trim().toLowerCase();
    return (
      formatearGuiaRemision(g).toLowerCase().includes(q) ||
      (g.destinatario?.nombre || "").toLowerCase().includes(q) ||
      otsDeGuia(g).some((ot) => ot.toLowerCase().includes(q))
    );
  });

  const abrirBuscadorGuia = async () => {
    setMostrarBuscadorGuia(true);
    if (guiasDisponibles.length) return;
    setBuscandoGuia(true);
    try {
      const res  = await fetchAuth("/guias?estado=ACEPTADO&limit=200");
      const data = await res.json();
      setGuiasDisponibles(data?.data || []);
    } finally {
      setBuscandoGuia(false);
    }
  };

  const elegirGuia = (g) => {
    setGuiaRelacionada(formatearGuiaRemision(g));
    setMostrarBuscadorGuia(false);
  };

  const validar = () => {
    if (!rucEmisor) return "Selecciona la empresa emisora.";
    if (!serie.trim()) return "La serie es requerida.";
    if (!serieValida(serie)) return "La serie debe tener exactamente 4 caracteres (ej. F001, B001, FC01).";
    if (!esNota && guiaRelacionada.trim() && !parsearGuiaRemision(guiaRelacionada)) {
      return "La guía de remisión relacionada debe tener el formato SERIE-NÚMERO (ej. T001-00001234).";
    }
    if (!receptor.numDoc.trim() || !receptor.nombre.trim()) return "Los datos del receptor son requeridos.";
    if (tipoDoc === "01" && receptor.schemeID !== "6") return "La factura requiere un receptor con RUC.";
    if (!documentoValido(receptor.schemeID, receptor.numDoc)) {
      return receptor.schemeID === "6"
        ? "El RUC del receptor debe tener 11 dígitos."
        : receptor.schemeID === "1"
        ? "El DNI del receptor debe tener 8 dígitos."
        : "El documento del receptor no es válido.";
    }
    if (!esNota && formaPago === "Credito") {
      if (cuotas.length === 0) return "Agrega al menos una cuota de pago para el crédito.";
      for (const c of cuotas) {
        if (!c.monto || Number(c.monto) <= 0) return "Cada cuota debe tener un monto mayor a 0.";
        if (!c.fechaVencimiento) return "Cada cuota debe tener una fecha de vencimiento.";
      }
      // Exacto: SUNAT rechaza (3319) un crédito cuyas cuotas no suman el monto neto pendiente.
      if (!cuotasCuadran) {
        return `La suma de las cuotas (${moneda} ${sumaCuotas.toFixed(2)}) debe ser igual al monto neto pendiente (${moneda} ${montoNetoPendiente.toFixed(2)}).`;
      }
    }
    if (tipoDoc === "03" && receptor.schemeID === "-" && (totalGeneral > 700 || moneda !== "PEN")) {
      return "Una boleta mayor a S/ 700 (o en dólares) requiere un cliente identificado (RUC, DNI, Carné o Pasaporte), no 'Clientes varios'.";
    }
    if (!esNota && detraccionAplica) {
      if (!detraccionCodigoBien) return "Selecciona el bien o servicio sujeto a detracción.";
      if (!detraccionPorcentaje || Number(detraccionPorcentaje) <= 0) return "El porcentaje de detracción debe ser mayor a 0.";
      if (!detraccionMontoNeto || Number(detraccionMontoNeto) <= 0) return "El monto neto a depositar debe ser mayor a 0.";
      if (!detraccionCuentaBancaria.trim()) return "La cuenta del Banco de la Nación es requerida.";
      if (!cuentaDetraccionValida(detraccionCuentaBancaria)) return "La cuenta del Banco de la Nación debe tener 11 dígitos.";
    }
    if (retencionAplica && !(Number(retencionPorcentaje) > 0 && Number(retencionPorcentaje) < 100)) {
      return "El porcentaje de retención debe ser mayor a 0 y menor a 100.";
    }
    if (esNota) {
      if (!referencia.id) return "Selecciona el comprobante a modificar.";
      if (!motivoCodigo) return "Selecciona el motivo.";
      if (!motivoDescripcion.trim()) return "La descripción del motivo es requerida.";
      if (serie.trim().charAt(0).toUpperCase() !== referencia.serie.charAt(0).toUpperCase()) {
        return `La serie debe comenzar con la misma letra que el comprobante referenciado (${referencia.serie}).`;
      }
      if (tipoDoc === "07" && referencia.tipoDoc === "03" && ["04", "05", "08"].includes(motivoCodigo)) {
        return "Este motivo (descuento/bonificación por ítem o global) no aplica sobre una Boleta referenciada.";
      }
      if (tipoDoc === "07" && motivoCodigo === "03" && totales.total !== 0) {
        return "El motivo 'Corrección por error en la descripción' es una corrección de texto: ajusta los importes de los ítems a 0 antes de emitir.";
      }
    }
    for (const item of items) {
      if (!item.descripcion.trim()) return "Todos los ítems deben tener descripción.";
      if (!item.cantidad || Number(item.cantidad) <= 0) return "La cantidad de cada ítem debe ser mayor a 0.";
      if (item.valorUnitario === "" || Number(item.valorUnitario) < 0) return "El valor unitario de cada ítem debe ser válido.";
    }
    return null;
  };

  const emitir = async () => {
    // Una OC de una cotización no afecta a IGV (trabajo en el extranjero) necesita una factura de exportación
    // (tipo de operación 0200, afectación 40), que todavía no se emite desde acá: con afectación 10 saldría un
    // comprobante gravado incorrecto, y con 40 sobre la operación 0101 SUNAT lo rechazaría quemando el correlativo.
    if (ocOrigen?.afectoIgv === false) return setError(MSG_OC_SIN_IGV);
    setCargando(true);
    setError("");
    try {
      const receptorBody = {
        numDoc:   receptor.numDoc.trim(),
        nombre:   receptor.nombre.trim(),
        schemeID: receptor.schemeID,
      };
      const itemsBody = items.map((i) => ({
        descripcion:   i.descripcion,
        cantidad:      Number(i.cantidad),
        unidad:        i.unidad,
        valorUnitario: Number(i.valorUnitario),
        precioUnitario: precioUnitarioDesdeValor(i.valorUnitario, i.afectacion),
        afectacion:    i.afectacion,
        descuentoPorcentaje: (Number(i.descuentoPorcentaje) || 0) / 100,
      }));

      let endpoint, body;
      if (esNota) {
        endpoint = tipoDoc === "07" ? "/cpe/nota-credito" : "/cpe/nota-debito";
        body = {
          rucEmisor,
          serie: serie.trim().toUpperCase(),
          receptor: receptorBody,
          items: itemsBody,
          docReferencia: referencia.serie,
          tipoDocRef: referencia.tipoDoc,
          motivoCodigo,
          motivoDescripcion: motivoDescripcion.trim(),
          moneda,
          otrosCargos: otrosCargosNum,
          montoRedondeo: montoRedondeoNum,
          observaciones: observaciones.trim(),
          informacionRelacionada: informacionRelacionada.trim(),
        };
      } else {
        endpoint = tipoDoc === "01" ? "/cpe/factura" : "/cpe/boleta";
        body = {
          tipoDoc,
          serie: serie.trim().toUpperCase(),
          rucEmisor,
          receptor: receptorBody,
          items: itemsBody,
          formaPago,
          ...(formaPago === "Credito" && cuotas.length ? {
            cuotas: cuotas.map((c, idx) => ({
              numero: idx + 1,
              monto: Number(c.monto),
              fechaVencimiento: c.fechaVencimiento,
            })),
          } : {}),
          moneda,
          otrosCargos: otrosCargosNum,
          montoRedondeo: montoRedondeoNum,
          observaciones: observaciones.trim(),
          informacionRelacionada: informacionRelacionada.trim(),
          numeroOrdenCompra: numeroOrdenCompra.trim(),
          ...(parsearGuiaRemision(guiaRelacionada) ? { guiaRelacionada: parsearGuiaRemision(guiaRelacionada) } : {}),
          ...(ordenCompraId ? { ordenCompra: ordenCompraId } : {}),
          // Con respuesta ok el navegador crea la Factura interna (crearFacturaInterna, abajo); si no, el backend.
          facturaInternaDesdeCliente: !!ocOrigen || tipoDoc === "01",
          ...(detraccionAplica ? {
            detraccion: {
              aplica: true,
              codigoBien: detraccionCodigoBien,
              porcentaje: Number(detraccionPorcentaje),
              montoNeto: Number(detraccionMontoNeto),
              cuentaBancaria: detraccionCuentaBancaria.trim(),
            },
          } : {}),
          ...(retencionAplica ? {
            retencion: {
              aplica: true,
              porcentaje: Number(retencionPorcentaje),
              ...(moneda !== "PEN" && tcRetencion ? { tipoCambio: tcRetencion.valor } : {}),
            },
          } : {}),
        };
      }
      const res  = await fetchAuth(endpoint, { method: "POST", body: JSON.stringify(body) });
      const data = await res.json();
      setResultado(data);
      if (!data.ok) {
        setError(data.mensaje || data.error || "El comprobante fue rechazado por SUNAT.");
      } else if (ocOrigen || tipoDoc === "01") {
        await crearFacturaInterna(data);
      }
    } catch {
      setError("Error de conexión");
    } finally {
      setCargando(false);
    }
  };

  // Paso 2: crea el registro interno Factura con el número ya emitido en SUNAT, que es lo que Tesorería muestra en
  // «Por cobrar». Desde "Crear Factura" de una OC queda vinculado a ella; una factura emitida suelta se crea sin OC y
  // el servidor toma el cliente del comprobante. Las boletas no pasan: se cobran al contado.
  const crearFacturaInterna = async (dataCpe) => {
    const factPayload = {
      numeroFactura:      dataCpe.serie,
      fechaEmision:       fechaHoyLima(),
      moneda,
      // El servidor liga la factura con este comprobante (mismo número, cliente, moneda y total).
      comprobante:        dataCpe.id,
      subtotal:           totales.base,
      ...(ocOrigen ? {
        descripcion:        ocOrigen.descripcion || ocOrigen.titulo || "",
        encargado:          ocOrigen.encargado || "",
        planta:             ocOrigen.planta || "",
        numeroGuiaEmision:  ocOrigen.numeroGuiaEmision || "",
        numeroGuiaRemision: ocOrigen.numeroGuiaRemision || "",
        ordenCompra:        ocOrigen._id,
        empresa:            ocOrigen.empresa?._id || ocOrigen.empresa,
        codigoSap:          ocOrigen.codigoSap,
        fechaSalida:        ocOrigen.fechaSalida,
      } : {
        descripcion:        items.map((i) => i.descripcion.trim()).filter(Boolean).join("; ").slice(0, 300),
      }),
    };
    if (formaPago === "Credito" && cuotas.length) {
      factPayload.cuotas = cuotas.map((c) => ({ monto: Number(c.monto), fechaVencimiento: c.fechaVencimiento }));
    }
    const resF = await fetchAuth("/facturas", { method: "POST", body: JSON.stringify(factPayload) });
    if (!resF.ok) {
      const det = (await resF.json().catch(() => ({}))).mensaje;
      setError(`El comprobante ${dataCpe.serie} se emitió correctamente, pero no se pudo crear el registro interno de Factura${det ? `: ${det}` : ""}. Verifica manualmente.`);
      return;
    }
    setFacturaInterna(await resF.json());
  };

  const nuevo = () => {
    setSerie(SERIE_POR_TIPO[tipoDoc]);
    setFormaPago("Contado");
    setCuotas([]);
    setReceptor(RECEPTOR_VACIO);
    setTipoBienServicio("bien");
    setItems([itemVacioComprobante()]);
    setReferencia(REFERENCIA_VACIA);
    setMotivoCodigo("");
    setMotivoDescripcion("");
    setFiltroRef("");
    setMoneda("PEN");
    setOtrosCargos("");
    setMontoRedondeo("");
    setObservaciones("");
    setInformacionRelacionada("");
    setDetraccionAplica(false);
    setDetraccionCodigoBien("");
    setDetraccionPorcentaje("");
    setDetraccionCuentaBancaria("");
    setRetencionAplica(false);
    setRetencionPorcentaje("3");
    setNumeroOrdenCompra("");
    setGuiaRelacionada("");
    setOrdenCompraId("");
    setOcOrigen(null);
    setFacturaInterna(null);
    setResultado(null);
    setError("");
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-semibold text-gray-800">Emitir Comprobante</h2>
        {resultado?.ok && <span className="font-mono text-sm text-gray-400">{resultado.serie}</span>}
      </div>

      {resultado?.estado === "ACEPTADO" && (
        <div className="bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg px-4 py-3 mb-5">
          Comprobante <strong>{resultado.serie}</strong> ACEPTADO por SUNAT.
        </div>
      )}
      {resultado?.estado === "EN_PROCESO" && (
        <div className="bg-amber-50 border border-amber-200 text-amber-700 text-sm rounded-lg px-4 py-3 mb-5">
          Comprobante <strong>{resultado.serie}</strong> EN PROCESO — SUNAT aún no confirma el resultado.
          Verifica el estado más tarde en la lista de comprobantes.
        </div>
      )}
      {resultado?.aviso && (
        <div className="bg-amber-50 border border-amber-200 text-amber-700 text-sm rounded-lg px-4 py-3 mb-5">
          {resultado.aviso}
        </div>
      )}
      {facturaInterna && (
        <div className="bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg px-4 py-3 mb-5 flex items-center justify-between gap-4">
          <span>Factura <strong>{facturaInterna.codigo}</strong> creada{facturaInterna.ordenCompra ? " y vinculada a la orden de compra" : ": ya está en Tesorería → Por cobrar"}.</span>
          {facturaInterna.ordenCompra && (
            <button type="button" onClick={() => navigate("/ordenes-compra")}
              className="shrink-0 text-green-700 underline hover:text-green-900 transition">
              Volver a Órdenes de Compra
            </button>
          )}
        </div>
      )}
      {ocOrigen?.afectoIgv === false && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-lg px-4 py-3 mb-5">
          {MSG_OC_SIN_IGV}
        </div>
      )}
      {error && (
        <div ref={errorRef} role="alert" className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 mb-5 whitespace-pre-wrap scroll-mt-4">
          {error}
        </div>
      )}

      <form onSubmit={(e) => e.preventDefault()}>
        {/* Selector tipo doc */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-5 py-4 mb-5 flex items-center gap-4">
          <span className="text-sm font-medium text-gray-500">Tipo de comprobante:</span>
          {[["01", "Factura"], ["03", "Boleta"], ["07", "Nota de Crédito"], ["08", "Nota de Débito"]].map(([v, label]) => (
            <button
              key={v} type="button" disabled={ro}
              onClick={() => cambiarTipoDoc(v)}
              className={`px-5 py-1.5 rounded-full text-sm font-medium transition ${
                tipoDoc === v
                  ? "bg-gray-900 text-white"
                  : "border border-gray-300 text-gray-500 hover:border-gray-300 hover:text-gray-800"
              } disabled:cursor-not-allowed`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Cabecera */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 mb-5">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Empresa emisora</label>
              <input value={`${NOMBRE_EMISOR} — RUC ${RUC_EMISOR}`} disabled
                className="w-full input-field w-auto disabled:bg-gray-50 disabled:text-gray-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Serie</label>
              <input value={serie} disabled
                className="w-full input-field w-auto disabled:bg-gray-50 disabled:text-gray-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Moneda</label>
              <div className="flex gap-3">
                {TIPO_MONEDA.map((m) => (
                  <button
                    key={m.valor} type="button" disabled={ro}
                    onClick={() => setMoneda(m.valor)}
                    className={`px-4 py-1.5 rounded-full text-sm font-medium transition ${
                      moneda === m.valor
                        ? "bg-gray-900 text-white"
                        : "border border-gray-300 text-gray-500 hover:border-gray-300 hover:text-gray-800"
                    } disabled:cursor-not-allowed`}
                  >
                    {m.valor}
                  </button>
                ))}
              </div>
            </div>

            {!esNota ? (
              <>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Forma de pago</label>
                  <div className="flex gap-3">
                    {["Contado", "Credito"].map((v) => (
                      <button
                        key={v} type="button" disabled={ro}
                        onClick={() => cambiarFormaPago(v)}
                        className={`px-4 py-1.5 rounded-full text-sm font-medium transition ${
                          formaPago === v
                            ? "bg-gray-900 text-white"
                            : "border border-gray-300 text-gray-500 hover:border-gray-300 hover:text-gray-800"
                        } disabled:cursor-not-allowed`}
                      >
                        {v === "Contado" ? "Contado" : "Crédito"}
                      </button>
                    ))}
                  </div>
                </div>
                {formaPago === "Credito" && (
                  <div className="col-span-2 mt-2">
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-xs font-medium text-gray-500">Cuotas de pago<Oblig /></label>
                      <span className="text-xs text-gray-400">
                        Monto neto pendiente: {moneda} {montoNetoPendiente.toFixed(2)}
                      </span>
                    </div>
                    <div className="border border-gray-100 rounded-lg overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 text-xs uppercase tracking-wide border-b border-gray-100">
                          <tr>
                            <th className="px-3 py-2 text-left w-20">Cuota</th>
                            <th className="px-3 py-2 text-left">Monto<Oblig /></th>
                            <th className="px-3 py-2 text-left">Fecha de vencimiento<Oblig /></th>
                            {!ro && <th className="px-3 py-2 w-8"></th>}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {cuotas.map((c, idx) => (
                            <tr key={c._key}>
                              <td className="px-3 py-2 text-gray-400">Cuota{String(idx + 1).padStart(3, "0")}</td>
                              <td className="px-3 py-2">
                                <input type="number" min="0" step="0.01" value={c.monto}
                                  onChange={(e) => handleCuota(c._key, "monto", e.target.value)} onWheel={(e) => e.target.blur()}
                                  disabled={ro} required
                                  className="w-full input-field w-auto" />
                              </td>
                              <td className="px-3 py-2">
                                <input type="date" value={c.fechaVencimiento}
                                  onChange={(e) => handleCuota(c._key, "fechaVencimiento", e.target.value)}
                                  disabled={ro} required
                                  className="w-full input-field w-auto" />
                              </td>
                              {!ro && (
                                <td className="px-3 py-2 text-center">
                                  <button type="button" onClick={() => eliminarCuota(c._key)} className="text-red-400 hover:text-red-600">✕</button>
                                </td>
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {!ro && (
                        <div className="px-3 py-2 border-t border-gray-100 bg-gray-50/50 flex items-center justify-between">
                          <button type="button" onClick={agregarCuota}
                            className="text-sm text-gray-500 hover:text-gray-800 transition">
                            + Agregar cuota
                          </button>
                          <span className={`text-xs font-medium ${cuotasCuadran ? "text-green-600" : "text-red-500"}`}>
                            Suma de cuotas: {moneda} {sumaCuotas.toFixed(2)}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-500 mb-1">Comprobante a modificar<Oblig /></label>
                  {!ro && (
                    <input value={filtroRef} onChange={(e) => setFiltroRef(e.target.value)}
                      placeholder="Filtrar por serie-número, cliente o RUC/DNI..."
                      className="w-full input-field mb-2" />
                  )}
                  <select value={referencia.id} onChange={(e) => ligarComprobanteRef(e.target.value)}
                    disabled={ro || !rucEmisor} required
                    className="w-full input-field w-auto disabled:bg-gray-50 disabled:text-gray-500">
                    <option value="">— Seleccionar —</option>
                    {/* La lista trae solo los 100 más recientes: una referencia más antigua (llegada desde su detalle) se muestra igual. */}
                    {referencia.id && !comprobantesRefFiltrados.some((c) => c._id === referencia.id) && (
                      <option value={referencia.id}>{referencia.serie} — {receptor.nombre}</option>
                    )}
                    {comprobantesRefFiltrados.map((c) => (
                      <option key={c._id} value={c._id}>
                        {c.serie}-{c.correlativo} — {c.receptor?.nombre} ({c.tipoDoc === "01" ? "Factura" : "Boleta"})
                      </option>
                    ))}
                  </select>
                  {!ro && (
                    <p className="text-xs text-gray-400 mt-1">
                      Se listan los 100 comprobantes aceptados más recientes; para uno anterior, búscalo en Comprobantes SUNAT y usa «Emitir Nota de Crédito/Débito» en su detalle.
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Motivo<Oblig /></label>
                  <select value={motivoCodigo} onChange={(e) => setMotivoCodigo(e.target.value)} disabled={ro} required
                    className="w-full input-field w-auto disabled:bg-gray-50 disabled:text-gray-500">
                    <option value="">— Seleccionar —</option>
                    {(tipoDoc === "07" ? MOTIVO_NC : MOTIVO_ND).map((m) => (
                      <option key={m.valor} value={m.valor}>{m.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Descripción del motivo<Oblig /></label>
                  <input value={motivoDescripcion} onChange={(e) => setMotivoDescripcion(e.target.value)} disabled={ro} required
                    className="w-full input-field w-auto disabled:bg-gray-50 disabled:text-gray-500" />
                </div>
              </>
            )}
          </div>
        </div>

        {/* Receptor */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 mb-5">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Receptor</p>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Tipo de documento</label>
              <select name="schemeID" value={receptor.schemeID} onChange={handleReceptor}
                disabled={ro || tipoDoc === "01"}
                className="w-full input-field w-auto disabled:bg-gray-50 disabled:text-gray-500">
                {TIPO_DOC_RECEPTOR.map((t) => (
                  <option key={t.valor} value={t.valor}>{t.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Número de documento<Oblig />
                {buscandoDoc && <span className="ml-2 text-gray-400 font-normal">Consultando SUNAT…</span>}
              </label>
              <input name="numDoc" value={receptor.numDoc} onChange={handleReceptor}
                onBlur={(e) => buscarReceptorRuc(e.target.value)} disabled={ro || receptor.schemeID === "-"} required
                className="w-full input-field w-auto disabled:bg-gray-50 disabled:text-gray-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Nombre / Razón social<Oblig /></label>
              <input name="nombre" value={receptor.nombre} onChange={handleReceptor} disabled={ro || receptor.schemeID === "-"} required
                className="w-full input-field w-auto disabled:bg-gray-50 disabled:text-gray-500" />
            </div>
          </div>
        </div>

        {/* Tipo de operación (bien o servicio) — decide la unidad válida para TODOS los ítems */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-5 py-4 mb-5 flex items-center gap-4">
          <span className="text-sm font-medium text-gray-500">Este comprobante es por:</span>
          {TIPO_ITEM.map((t) => (
            <button
              key={t.valor} type="button" disabled={ro}
              onClick={() => cambiarTipoBienServicio(t.valor)}
              className={`px-5 py-1.5 rounded-full text-sm font-medium transition ${
                tipoBienServicio === t.valor
                  ? "bg-gray-900 text-white"
                  : "border border-gray-300 text-gray-500 hover:border-gray-300 hover:text-gray-800"
              } disabled:cursor-not-allowed`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Tabla de items */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden mb-5">
          <TablaScroll className="overflow-x-auto">
            <table className="erp-table w-full text-sm min-w-[900px]">
              <thead className="bg-gray-50 text-xs uppercase tracking-wide border-b-2 border-gray-100">
                <tr>
                  <th className="px-3 py-3 text-center w-8">#</th>
                  <th className="px-3 py-3 text-left">Descripción<Oblig /></th>
                  <th className="px-3 py-3 text-left w-20">Cant.<Oblig /></th>
                  <th className="px-3 py-3 text-left w-28">Unidad</th>
                  <th className="px-3 py-3 text-left w-28">Valor Unit.<Oblig /></th>
                  <th className="px-3 py-3 text-left w-40">Afectación IGV</th>
                  <th className="px-3 py-3 text-left w-20">Desc. %</th>
                  <th className="px-3 py-3 text-right w-24">Total</th>
                  {!ro && <th className="px-3 py-3 w-8"></th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {itemsCalc.map((item, idx) => (
                  <tr key={item._key} className="hover:bg-gray-50/50">
                    <td className="px-3 py-2 text-center text-gray-400">{idx + 1}</td>
                    <td className="px-3 py-2">
                      <input value={item.descripcion}
                        onChange={(e) => handleItem(item._key, "descripcion", e.target.value)}
                        required disabled={ro}
                        className="w-full input-field w-auto" />
                    </td>
                    <td className="px-3 py-2">
                      <input type="number" min="0" step="0.01" value={item.cantidad}
                        onChange={(e) => handleItem(item._key, "cantidad", e.target.value)} onWheel={(e) => e.target.blur()}
                        required disabled={ro}
                        className="w-full input-field w-auto" />
                    </td>
                    <td className="px-3 py-2">
                      <select value={item.unidad} onChange={(e) => handleItem(item._key, "unidad", e.target.value)}
                        disabled={ro || tipoBienServicio === "servicio"} className="w-full input-field w-auto">
                        {unidadesPorTipoItem(tipoBienServicio).map((u) => (
                          <option key={u.valor} value={u.valor}>{u.label}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <input type="number" min="0" step="0.01" value={item.valorUnitario}
                        onChange={(e) => handleItem(item._key, "valorUnitario", e.target.value)} onWheel={(e) => e.target.blur()}
                        required disabled={ro}
                        className="w-full input-field w-auto" />
                    </td>
                    <td className="px-3 py-2">
                      <select value={item.afectacion} onChange={(e) => handleItem(item._key, "afectacion", e.target.value)}
                        disabled={ro} className="w-full input-field w-auto">
                        {AFECTACION_IGV.map((a) => (
                          <option key={a.valor} value={a.valor}>{a.label}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <input type="number" min="0" max="100" step="1" value={item.descuentoPorcentaje}
                        onChange={(e) => handleItem(item._key, "descuentoPorcentaje", e.target.value)} onWheel={(e) => e.target.blur()}
                        disabled={ro}
                        className="w-full input-field w-auto" />
                    </td>
                    <td className="px-3 py-2 text-right font-medium text-gray-800">
                      {item.total.toFixed(2)}
                    </td>
                    {!ro && (
                      <td className="px-3 py-2 text-center">
                        <button type="button" onClick={() => eliminarItem(item._key)} className="text-red-400 hover:text-red-600">✕</button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-gray-100 bg-gray-50">
                <tr>
                  <td colSpan={7} className="px-4 py-2 text-right text-xs text-gray-500">Descuentos</td>
                  <td className="px-3 py-2 text-right font-medium">{totales.descuento.toFixed(2)}</td>
                  {!ro && <td />}
                </tr>
                <tr>
                  <td colSpan={7} className="px-4 py-2 text-right text-xs text-gray-500">Base imponible</td>
                  <td className="px-3 py-2 text-right font-medium">{totales.base.toFixed(2)}</td>
                  {!ro && <td />}
                </tr>
                <tr>
                  <td colSpan={7} className="px-4 py-2 text-right text-xs text-gray-500">IGV</td>
                  <td className="px-3 py-2 text-right font-medium">{totales.igv.toFixed(2)}</td>
                  {!ro && <td />}
                </tr>
                <tr>
                  <td colSpan={7} className="px-4 py-2 text-right text-xs text-gray-500">Otros cargos (no afectos a IGV)</td>
                  <td className="px-3 py-2 text-right">
                    {ro ? otrosCargosNum.toFixed(2) : (
                      <input type="number" min="0" step="0.01" value={otrosCargos}
                        onChange={(e) => setOtrosCargos(e.target.value)} onWheel={(e) => e.target.blur()}
                        placeholder="0.00"
                        className="w-full input-field w-auto text-right" />
                    )}
                  </td>
                  {!ro && <td />}
                </tr>
                <tr>
                  <td colSpan={7} className="px-4 py-2 text-right text-xs text-gray-500">Monto de redondeo</td>
                  <td className="px-3 py-2 text-right">
                    {ro ? montoRedondeoNum.toFixed(2) : (
                      <input type="number" step="0.01" value={montoRedondeo}
                        onChange={(e) => setMontoRedondeo(e.target.value)} onWheel={(e) => e.target.blur()}
                        placeholder="0.00"
                        className="w-full input-field w-auto text-right" />
                    )}
                  </td>
                  {!ro && <td />}
                </tr>
                <tr>
                  <td colSpan={7} className="px-4 py-2 text-right text-sm font-semibold text-gray-800">Total a pagar</td>
                  <td className="px-3 py-2 text-right font-bold text-gray-800 text-base">{moneda} {totalGeneral.toFixed(2)}</td>
                  {!ro && <td />}
                </tr>
              </tfoot>
            </table>
          </TablaScroll>
          {!ro && (
            <div className="px-4 py-3 border-t border-gray-100">
              <button type="button" onClick={agregarItem}
                className="text-sm text-gray-500 hover:text-gray-800 transition">
                + Agregar ítem
              </button>
            </div>
          )}
        </div>

        {/* Información adicional */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 mb-5">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Información adicional</p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Observaciones</label>
              <textarea value={observaciones} onChange={(e) => setObservaciones(e.target.value)}
                disabled={ro} rows={2}
                className="w-full input-field w-auto disabled:bg-gray-50 disabled:text-gray-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Información relacionada</label>
              <textarea value={informacionRelacionada} onChange={(e) => setInformacionRelacionada(e.target.value)}
                disabled={ro} rows={2}
                className="w-full input-field w-auto disabled:bg-gray-50 disabled:text-gray-500" />
            </div>
          </div>

          {!esNota && (
            <>
              <div className="mt-4 pt-4 border-t border-gray-100">
                <label className="flex items-center gap-2 text-sm font-medium text-gray-500 mb-3">
                  <input type="checkbox" checked={detraccionAplica} disabled={ro}
                    onChange={(e) => {
                      const marcado = e.target.checked;
                      setDetraccionAplica(marcado);
                      // Detracción y retención del IGV no van juntas — marcar una desmarca la otra.
                      if (marcado) setRetencionAplica(false);
                      // 037 (Demás servicios gravados con IGV, 12%) es por lejos el más común en
                      // este ERP — se precarga como default para no obligar a buscarlo cada vez,
                      // el usuario puede cambiarlo si el caso es otro. El monto neto se deriva solo
                      // (ver `detraccionMontoNeto` más arriba), no hace falta setearlo acá.
                      if (marcado && !detraccionCodigoBien) {
                        setDetraccionCodigoBien("037");
                        setDetraccionPorcentaje("12");
                      }
                    }} />
                  Operación sujeta a detracción
                </label>
                {detraccionAplica && (
                  <div className="grid grid-cols-4 gap-4">
                    <div className="col-span-2">
                      <label className="block text-xs font-medium text-gray-500 mb-1">Bien / servicio<Oblig /></label>
                      <select value={detraccionCodigoBien} disabled={ro} required
                        onChange={(e) => {
                          const cod = e.target.value;
                          setDetraccionCodigoBien(cod);
                          const b = DETRACCION_VENTA_CPE.find((x) => x.codigo === cod);
                          if (b?.porcentaje != null) setDetraccionPorcentaje(String(b.porcentaje));
                        }}
                        className="w-full input-field w-auto disabled:bg-gray-50 disabled:text-gray-500">
                        <option value="">— Seleccionar —</option>
                        {DETRACCION_VENTA_CPE.map((b) => (
                          <option key={b.codigo} value={b.codigo}>{b.codigo} — {b.descripcion}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Porcentaje (%)<Oblig /></label>
                      <input type="number" min="0" max="100" step="0.1" value={detraccionPorcentaje}
                        onChange={(e) => setDetraccionPorcentaje(e.target.value)} onWheel={(e) => e.target.blur()} disabled={ro} required
                        className="w-full input-field w-auto disabled:bg-gray-50 disabled:text-gray-500" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Monto neto a depositar<Oblig /></label>
                      <input type="number" value={detraccionMontoNeto} placeholder="0.00" disabled required
                        className="w-full input-field w-auto disabled:bg-gray-50 disabled:text-gray-500" />
                      {moneda !== "PEN" && (
                        !tcDetraccion ? <p className="text-xs mt-1 text-gray-500">Consultando TC del día…</p>
                        : tcDetraccion.error ? <p className="text-xs mt-1 text-red-500">Sin tipo de cambio del día: no se puede calcular en soles.</p>
                        : (
                          <div className="mt-1 inline-flex flex-col gap-0.5 rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-xs text-amber-800">
                            <span className="font-semibold">Va al XML: S/ {detraccionSoles.toFixed(2)}</span>
                            <span>{moneda === "USD" ? "US$" : moneda} {detraccionMontoNeto} × TC {tcDetraccion.venta}</span>
                            <span className="text-amber-600">
                              TC {tcDetraccion.fuente === "vigente" ? "de la app" : tcDetraccion.fuente === "respaldo" ? "último guardado" : "venta SUNAT"}{fechaTcDetraccion && ` del ${fechaTcDetraccion}`}
                            </span>
                          </div>
                        )
                      )}
                    </div>
                    <div className="col-span-4">
                      <label className="block text-xs font-medium text-gray-500 mb-1">Cuenta Banco de la Nación<Oblig /></label>
                      <input value={detraccionCuentaBancaria} placeholder="00000000000" maxLength={11}
                        onChange={(e) => setDetraccionCuentaBancaria(normalizarCuentaDetraccion(e.target.value))} disabled={ro} required
                        className={`w-full input-field w-auto disabled:bg-gray-50 disabled:text-gray-500 ${detraccionCuentaBancaria && !cuentaDetraccionValida(detraccionCuentaBancaria) ? "border-red-300" : ""}`} />
                    </div>
                  </div>
                )}
              </div>

              {/* Solo en factura: la retención del IGV no aplica a boletas. */}
              {tipoDoc === "01" && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <label className="flex items-center gap-2 text-sm font-medium text-gray-500 mb-3">
                  <input type="checkbox" checked={retencionAplica} disabled={ro}
                    onChange={(e) => {
                      setRetencionAplica(e.target.checked);
                      if (e.target.checked) setDetraccionAplica(false);
                    }} />
                  Operación sujeta a retención del IGV
                </label>
                {retencionAplica && (
                  <div className="grid grid-cols-4 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Porcentaje (%)<Oblig /></label>
                      <input type="number" min="0" max="100" step="0.1" value={retencionPorcentaje}
                        onChange={(e) => setRetencionPorcentaje(e.target.value)} onWheel={(e) => e.target.blur()} disabled={ro} required
                        className="w-full input-field w-auto disabled:bg-gray-50 disabled:text-gray-500" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Monto de retención</label>
                      <input value={retencionMonto.toFixed(2)} disabled
                        className="w-full input-field w-auto disabled:bg-gray-50 disabled:text-gray-500" />
                      {moneda !== "PEN" && (
                        tcRetencion ? (
                          <div className="mt-1 inline-flex flex-col gap-0.5 rounded-md border border-sky-300 bg-sky-50 px-2 py-1 text-xs text-sky-800">
                            <span className="font-semibold">Referencial: S/ {retencionSoles.toFixed(2)}</span>
                            <span>US$ {retencionMonto.toFixed(2)} × TC vigente {tcRetencion.valor}</span>
                          </div>
                        )
                        : <p className="text-xs mt-1 text-gray-500">Sin tipo de cambio vigente para mostrarla en soles.</p>
                      )}
                    </div>
                    <div className="col-span-2">
                      <label className="block text-xs font-medium text-gray-500 mb-1">Neto a cobrar (total − retención)</label>
                      <input value={`${moneda} ${montoNetoPendiente.toFixed(2)}`} disabled
                        className="w-full input-field w-auto disabled:bg-gray-50 disabled:text-gray-500" />
                    </div>
                  </div>
                )}
              </div>
              )}

              <div className="mt-4 pt-4 border-t border-gray-100">
                <label className="block text-xs font-medium text-gray-500 mb-1">N° Orden de Compra (opcional)</label>
                <div className="flex gap-2">
                  <input value={numeroOrdenCompra}
                    onChange={(e) => { setNumeroOrdenCompra(e.target.value); setOrdenCompraId(""); }}
                    disabled={ro}
                    className="flex-1 input-field w-auto disabled:bg-gray-50 disabled:text-gray-500" />
                  {!ro && (
                    <button type="button" onClick={abrirBuscadorOC}
                      className="px-4 py-2 rounded-lg text-sm border border-gray-300 text-gray-500 hover:text-gray-800 transition">
                      Buscar
                    </button>
                  )}
                </div>
              </div>

              <div className="mt-4 pt-4 border-t border-gray-100">
                <label className="block text-xs font-medium text-gray-500 mb-1">N° Guía de Remisión relacionada (opcional)</label>
                <div className="flex gap-2">
                  <input value={guiaRelacionada} placeholder="Ej. T001-00001234" maxLength={13}
                    onChange={(e) => setGuiaRelacionada(e.target.value.toUpperCase())}
                    disabled={ro}
                    className="flex-1 input-field w-auto disabled:bg-gray-50 disabled:text-gray-500" />
                  {!ro && (
                    <button type="button" onClick={abrirBuscadorGuia}
                      className="px-4 py-2 rounded-lg text-sm border border-gray-300 text-gray-500 hover:text-gray-800 transition">
                      Buscar
                    </button>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Acciones */}
        <div className="flex justify-end gap-3">
          {!ro ? (
            <button type="button" onClick={() => {
                const err = validar();
                if (err) { setError(err); return; }
                setError("");
                setConfirmando(true);
              }}
              disabled={cargando}
              className="bg-gray-900 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-gray-700 transition disabled:opacity-50">
              {cargando ? "Emitiendo..." : "Emitir comprobante"}
            </button>
          ) : (
            <button type="button" onClick={nuevo}
              className="bg-gray-900 text-white px-4 py-2 rounded-lg text-sm hover:bg-gray-700 transition">
              Nuevo comprobante
            </button>
          )}
        </div>
      </form>

      {confirmando && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-sm">
            <h3 className="font-semibold text-gray-800 mb-3">¿Emitir {NOMBRE_TIPO_DOC[tipoDoc]}?</h3>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm mb-3">
              <dt className="text-gray-400">Serie</dt><dd>{serie} (correlativo al emitir)</dd>
              <dt className="text-gray-400">Receptor</dt><dd>{receptor.nombre}</dd>
              <dt className="text-gray-400">Documento</dt><dd className="font-mono">{receptor.numDoc}</dd>
              {(tipoDoc === "07" || tipoDoc === "08") && <><dt className="text-gray-400">Referencia</dt><dd>{referencia.serie}</dd></>}
              <dt className="text-gray-400">Total</dt><dd className="font-semibold">{moneda === "USD" ? "US$" : "S/"} {totalGeneral.toFixed(2)}</dd>
              {tipoDoc === "01" && <><dt className="text-gray-400">Pago</dt><dd>{formaPago === "Credito" ? `Crédito en ${cuotas.length} cuota(s)` : "Contado"}</dd></>}
              {detraccionAplica && <><dt className="text-gray-400">Detracción</dt><dd>{detraccionPorcentaje}% · {moneda === "USD" ? "US$" : "S/"} {detraccionMontoNeto}</dd></>}
              {retencionAplica && <><dt className="text-gray-400">Retención</dt><dd>{retencionPorcentaje}%</dd></>}
            </dl>
            <p className="text-xs text-gray-500 mb-4">
              Se enviará a SUNAT a través del hub. Genera un correlativo nuevo aunque el comprobante sea rechazado.
            </p>
            {tipoDoc === "07" && (
              <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4">
                {["01", "02"].includes(motivoCodigo)
                  ? <>Por el motivo elegido, el comprobante <strong>{referencia.serie}</strong> pasará a estado ANULADO.</>
                  : <>Si con esta nota se cubre el total vigente de <strong>{referencia.serie}</strong>, quedará ANULADO; si no, solo se rebaja su saldo por cobrar.</>}
              </p>
            )}
            <div className="flex justify-end gap-3">
              <button onClick={() => setConfirmando(false)}
                className="border border-gray-300 text-gray-800 px-4 py-2 rounded-lg text-sm hover:bg-gray-50 transition">
                Cancelar
              </button>
              <button onClick={async () => { setConfirmando(false); await emitir(); }}
                disabled={cargando}
                className="bg-gray-900 text-white px-4 py-2 rounded-lg text-sm hover:bg-gray-700 transition disabled:opacity-50">
                {cargando ? "Emitiendo..." : "Confirmar y emitir"}
              </button>
            </div>
          </div>
        </div>
      )}

      {mostrarBuscadorOC && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60]">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-2xl max-h-[80vh] flex flex-col">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-semibold text-gray-800">Buscar Orden de Compra</h3>
              <button type="button" onClick={() => setMostrarBuscadorOC(false)} className="text-gray-400 hover:text-gray-800">✕</button>
            </div>
            <input value={filtroOC} onChange={(e) => setFiltroOC(e.target.value)}
              placeholder="Buscar por N° de orden, título o empresa..."
              className="w-full input-field w-auto mb-3" />
            <div className="overflow-y-auto flex-1 divide-y divide-gray-100">
              {buscandoOC && <p className="text-sm text-gray-400 py-4 text-center">Cargando…</p>}
              {!buscandoOC && ordenesCompraFiltradas.length === 0 && (
                <p className="text-sm text-gray-400 py-4 text-center">Sin resultados.</p>
              )}
              {ordenesCompraFiltradas.map((o) => (
                <button key={o._id} type="button" onClick={() => elegirOC(o)}
                  className="w-full text-left px-3 py-2 hover:bg-gray-50 transition text-sm">
                  <div className="font-medium text-gray-800">{o.numeroOrden || o.codigo} — {o.titulo}</div>
                  <div className="text-xs text-gray-400">{o.empresa?.razonSocial || "—"} · S/ {Number(o.monto).toFixed(2)}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {mostrarBuscadorGuia && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60]">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-2xl max-h-[80vh] flex flex-col">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-semibold text-gray-800">Buscar Guía de Remisión</h3>
              <button type="button" onClick={() => setMostrarBuscadorGuia(false)} className="text-gray-400 hover:text-gray-800">✕</button>
            </div>
            <input value={filtroGuia} onChange={(e) => setFiltroGuia(e.target.value)}
              placeholder="Buscar por serie-correlativo, destinatario o N° de OT..."
              className="w-full input-field w-auto mb-3" />
            <div className="overflow-y-auto flex-1 divide-y divide-gray-100">
              {buscandoGuia && <p className="text-sm text-gray-400 py-4 text-center">Cargando…</p>}
              {!buscandoGuia && guiasFiltradas.length === 0 && (
                <p className="text-sm text-gray-400 py-4 text-center">Sin resultados.</p>
              )}
              {guiasFiltradas.map((g) => (
                <button key={g._id} type="button" onClick={() => elegirGuia(g)}
                  className="w-full text-left px-3 py-2 hover:bg-gray-50 transition text-sm">
                  <div className="font-medium text-gray-800">{formatearGuiaRemision(g)} — {g.destinatario?.nombre || g.tipoGuia}</div>
                  <div className="text-xs text-gray-400">{otsDeGuia(g).length ? `OT: ${otsDeGuia(g).join(", ")}` : g.tipoGuia}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
