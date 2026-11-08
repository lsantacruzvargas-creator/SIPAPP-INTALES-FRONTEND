// CTS semestral: el servidor calcula; aquí solo la tabla editable (textos ↔ cuerpo del PUT) y los totales en pantalla.
import { etiquetaPeriodoCts } from "./planilla.js";

const MESES = { "05": "Mayo", "11": "Noviembre" };
const round2 = (n) => Math.round(n * 100) / 100;
const IMPORTE = /^\d+(\.\d{1,2})?$/;
const ENTERO = /^\d+$/;
const RANGOS = [["meses", 7, "los meses"], ["dias", 30, "los días"], ["noComputables", 200, "los días no computables"]];

export const opcionesDeposito = (anio) => ["11", "05"].map((mes) => ({
  periodo: `${anio}${mes}`, texto: `${MESES[mes]} ${anio} (${etiquetaPeriodoCts(`${anio}${mes}`)})`,
}));

// Igual que el servidor: una fila con monto 0 no se deposita ni lleva hoja.
export const tieneHoja = (f) => !f.excluido && f.monto > 0;

export function totalesCts(filas) {
  const incluidas = filas.filter(tieneHoja);
  const excluidos = filas.filter((f) => f.excluido).length;
  return { incluidos: incluidas.length, excluidos, sinMonto: filas.length - incluidas.length - excluidos, total: round2(incluidas.reduce((s, f) => s + f.monto, 0)) };
}

// Cada guardado reemplaza solo su parte de lo que hay en pantalla: guardar la fecha no descarta filas sin guardar y guardar
// las filas no revierte una fecha escrita. «todo» (carga o documento nuevo) reemplaza ambas.
export function estadoTrasGuardar(estado, deposito, parte) {
  const filas = { editables: deposito.trabajadores.map(filaEditable) };
  const fecha = { fechaDeposito: deposito.fechaDeposito || "" };
  if (parte === "fecha") return { ...estado, ...fecha };
  if (parte === "filas") return { ...estado, ...filas };
  return { ...filas, ...fecha };
}

export function textoAsiento(asiento) {
  if (!asiento) return "Aún sin asiento: sale en Contabilidad → Automáticos al generar los asientos del mes.";
  if (asiento.estado === "contabilizado") return `Asiento contabilizado (${asiento.cuo}).`;
  return `Asiento ${asiento.estado}: se contabiliza en Contabilidad → Automáticos.`;
}

// `montoTocado` y `volverAFormula` deciden qué se manda: el monto solo si el usuario lo escribió, para que el servidor lo
// recalcule con la fórmula cuando se cambian la RC, el sexto o el tiempo sin tocarlo.
export const filaEditable = (f) => ({
  trabajador: f.trabajador, nombre: f.datos?.nombre || "",
  rc: String(f.rc), sexto: String(f.sexto), meses: String(f.meses), dias: String(f.dias), noComputables: String(f.noComputables), monto: String(f.monto),
  montoTocado: false, volverAFormula: false, excluido: !!f.excluido, motivoExclusion: f.motivoExclusion || "",
});

export function validarFilaCts(e) {
  if (!IMPORTE.test(e.rc.trim())) return "escribe la remuneración computable (importe de 0 o más, hasta 2 decimales).";
  if (!IMPORTE.test(e.sexto.trim())) return "escribe el sexto de gratificación (importe de 0 o más, hasta 2 decimales).";
  for (const [campo, max, nombre] of RANGOS) {
    if (!ENTERO.test(e[campo].trim()) || Number(e[campo]) > max) return `${nombre} van de 0 a ${max}, en números enteros.`;
  }
  if (e.montoTocado && !IMPORTE.test(e.monto.trim())) return "escribe el monto (importe de 0 o más, hasta 2 decimales).";
  const motivo = e.motivoExclusion.trim();
  if (e.excluido && (motivo.length < 3 || motivo.length > 200)) return "excluir exige el motivo (de 3 a 200 caracteres).";
  return "";
}

export function cuerpoGuardarCts(editables) {
  const trabajadores = [];
  for (const e of editables) {
    const error = validarFilaCts(e);
    if (error) return { error: `${e.nombre || "Trabajador"}: ${error}` };
    const cuerpo = {
      trabajador: e.trabajador, rc: Number(e.rc), sexto: Number(e.sexto), meses: Number(e.meses), dias: Number(e.dias), noComputables: Number(e.noComputables),
    };
    if (e.montoTocado) cuerpo.monto = Number(e.monto);
    else if (e.volverAFormula) cuerpo.editado = false;
    trabajadores.push({ ...cuerpo, excluido: e.excluido, motivoExclusion: e.excluido ? e.motivoExclusion.trim() : "" });
  }
  return { trabajadores };
}

export const hayCambiosCts = (editables, filas) =>
  editables.length !== filas.length || JSON.stringify(editables) !== JSON.stringify(filas.map(filaEditable));

export const hojasDisponibles = (deposito) => (deposito.estado === "anulado" ? [] : deposito.trabajadores.filter(tieneHoja));

export function avisosDescargaHojasCts(deposito) {
  const hojas = hojasDisponibles(deposito);
  const avisos = [];
  if (deposito.estado === "borrador") avisos.push("Depósito en borrador: las hojas salen con la marca BORRADOR");
  const sinCuenta = hojas.filter((f) => !f.datos?.cuentaCts?.entidad || !f.datos?.cuentaCts?.numero).length;
  if (sinCuenta) avisos.push(`${sinCuenta} ${sinCuenta === 1 ? "trabajador sin cuenta CTS" : "trabajadores sin cuenta CTS"}: su hoja sale sin entidad ni número de cuenta`);
  if (!deposito.fechaDeposito) avisos.push("Aún no anotas la fecha de depósito: las hojas salen con ese dato en blanco");
  return avisos;
}
