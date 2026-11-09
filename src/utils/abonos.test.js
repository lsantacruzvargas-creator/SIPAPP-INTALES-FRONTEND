import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AVISO_BCP, AVISO_TRATAMIENTO_ADELANTO, tiposNuevoLote, formatoDeCuenta, avisosFijos, avisosDeApi, porAbonar, abonadoTotal, abonadoMayorQueNeto,
  totalesFilas, nombreDeDisposicion, cuerpoNuevoLote, cuerpoGuardarLote, hayCambiosLote, editablesDe, textoSeguro, libroExcelGenerico, libroFueraDeArchivo,
} from "./abonos.js";

const DATOS = {
  nombreArchivo: "abono-saldo-202607-ABO-0001.xlsx",
  cabecera: {
    empresa: "INTALES SAC", ruc: "20123456789", bancoCargo: "SCOTIABANK", tipoCuentaCargo: "Corriente", cuentaCargo: "0001234567890",
    moneda: "PEN", fechaProceso: "31/07/2026", tipoPlanilla: "Saldo del mes", referencia: "=HYPERLINK(\"http://x\")", cantidad: 2, montoTotal: 3550.75,
  },
  detalle: [
    { n: 1, tipoDocumento: "DNI", numDocumento: "07654321", apellidoPaterno: "PEREZ", apellidoMaterno: "RUIZ", nombres: "ANA", nombreCompleto: "PEREZ RUIZ ANA",
      banco: "BCP", codigoBanco: "002", importe: 1200.5, tipoCuenta: "ahorros", cuenta: "00191234567890", cci: "", moneda: "PEN", referencia: "Saldo 07/2026" },
    { n: 2, tipoDocumento: "CE", numDocumento: "-0123", apellidoPaterno: "SOTO", apellidoMaterno: "", nombres: "LUIS", nombreCompleto: "SOTO LUIS",
      banco: "INTERBANK", codigoBanco: "003", importe: 2350.25, tipoCuenta: "ahorros", cuenta: "", cci: "00300000000012345678", moneda: "PEN", referencia: "+cmd" },
  ],
  fueraDelArchivo: [
    { n: 3, tipoDocumento: "DNI", numDocumento: "00112233", nombreCompleto: "DIAZ MARIA", banco: "", importe: 800, motivo: "Pago en efectivo u otro medio" },
    { n: 4, tipoDocumento: "DNI", numDocumento: "00445566", nombreCompleto: "VEGA JOSE", banco: "BBVA", importe: 100.5, motivo: "@Falta el CCI" },
  ],
};

const leer = async (libro) => {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await libro.xlsx.writeBuffer());
  return wb;
};
const fila = (ws, n) => ws.getRow(n).values.slice(1);

test("libroExcelGenerico: hojas Cabecera y Detalle con las columnas de la investigación §8.3", async () => {
  const wb = await leer(await libroExcelGenerico(DATOS));
  assert.deepEqual(wb.worksheets.map((w) => w.name), ["Cabecera", "Detalle"]);
  assert.deepEqual(fila(wb.getWorksheet("Cabecera"), 1), [
    "Empresa", "RUC", "Banco de cargo", "Tipo de cuenta de cargo", "Cuenta de cargo", "Moneda", "Fecha de proceso", "Tipo de planilla", "Referencia", "Cantidad de abonos", "Monto total",
  ]);
  assert.equal(wb.getWorksheet("Cabecera").rowCount, 2);
  assert.deepEqual(fila(wb.getWorksheet("Detalle"), 1), [
    "N.º", "Tipo de documento", "Número de documento", "Apellido paterno", "Apellido materno", "Nombres", "Nombre completo", "Banco del trabajador", "Código del banco",
    "Tipo de cuenta", "Número de cuenta", "CCI", "Moneda", "Importe", "Referencia",
  ]);
  assert.equal(wb.getWorksheet("Detalle").rowCount, 3);
});

test("libroExcelGenerico: documento, cuentas y CCI son texto y conservan el cero; el importe es número", async () => {
  const wb = await leer(await libroExcelGenerico(DATOS));
  const d = wb.getWorksheet("Detalle");
  assert.strictEqual(d.getCell("C2").value, "07654321");
  assert.strictEqual(d.getCell("I2").value, "002");
  assert.strictEqual(d.getCell("K2").value, "00191234567890");
  assert.strictEqual(d.getCell("L3").value, "00300000000012345678");
  assert.equal(d.getColumn(3).numFmt, "@");
  assert.equal(d.getColumn(11).numFmt, "@");
  assert.strictEqual(d.getCell("N2").value, 1200.5);
  assert.strictEqual(wb.getWorksheet("Cabecera").getCell("E2").value, "0001234567890");
  assert.strictEqual(wb.getWorksheet("Cabecera").getCell("K2").value, 3550.75);
});

test("libroExcelGenerico: el texto libre que empezaría una fórmula queda como texto; documento, cuenta y CCI no se tocan", async () => {
  const wb = await leer(await libroExcelGenerico(DATOS));
  assert.strictEqual(wb.getWorksheet("Cabecera").getCell("I2").value, "'=HYPERLINK(\"http://x\")");
  const d = wb.getWorksheet("Detalle");
  assert.strictEqual(d.getCell("C3").value, "-0123");
  assert.strictEqual(d.getCell("O3").value, "'+cmd");
  assert.strictEqual(d.getCell("O2").value, "Saldo 07/2026");
});

test("textoSeguro: =, +, -, @ y tabulación al inicio llevan apóstrofo; el resto no cambia", () => {
  for (const t of ["=1+1", "+1", "-1", "@SUM(A1)", "\t=1"]) assert.equal(textoSeguro(t), `'${t}`);
  assert.equal(textoSeguro("07654321"), "07654321");
  assert.equal(textoSeguro("PEREZ-RUIZ"), "PEREZ-RUIZ");
  assert.equal(textoSeguro(null), "");
});

test("libroExcelGenerico: en CTS agrega últimos sueldos e intangible al detalle", async () => {
  const cts = { ...DATOS, detalle: [{ ...DATOS.detalle[0], ultimosSueldos: 9000, intangible: 6000 }] };
  const wb = await leer(await libroExcelGenerico(cts));
  assert.deepEqual(fila(wb.getWorksheet("Detalle"), 1).slice(-2), ["Últimos sueldos", "Monto intangible"]);
  assert.strictEqual(wb.getWorksheet("Detalle").getCell("Q2").value, 6000);
});

test("las filas manuales van solo al libro «fuera del archivo» y no al Detalle", async () => {
  const principal = await leer(await libroExcelGenerico(DATOS));
  const nombres = principal.getWorksheet("Detalle").getColumn(7).values.slice(2);
  assert.deepEqual(nombres, ["PEREZ RUIZ ANA", "SOTO LUIS"]);

  const fuera = await leer(await libroFueraDeArchivo(DATOS));
  assert.deepEqual(fuera.worksheets.map((w) => w.name), ["Fuera del archivo"]);
  const ws = fuera.getWorksheet("Fuera del archivo");
  assert.deepEqual(fila(ws, 1), ["N.º", "Tipo de documento", "Número de documento", "Nombre completo", "Banco del trabajador", "Importe", "Motivo"]);
  assert.strictEqual(ws.getCell("C2").value, "00112233");
  assert.strictEqual(ws.getCell("G3").value, "'@Falta el CCI");
  assert.equal(ws.getCell("D2").value, "DIAZ MARIA");
  assert.equal(ws.getCell("D4").value, "TOTAL");
  assert.strictEqual(ws.getCell("F4").value, 900.5);
});

test("formatoDeCuenta compara el código de entidad por valor numérico", () => {
  assert.equal(formatoDeCuenta("02"), "bcp");
  assert.equal(formatoDeCuenta("002"), "bcp");
  assert.equal(formatoDeCuenta("03"), "interbank");
  assert.equal(formatoDeCuenta("09"), "excel");
  assert.equal(formatoDeCuenta(""), "excel");
  assert.equal(formatoDeCuenta(undefined), "excel");
});

test("tiposNuevoLote: la gratificación solo en julio y diciembre", () => {
  assert.deepEqual(tiposNuevoLote("202607"), ["adelanto", "gratificacion", "saldo"]);
  assert.deepEqual(tiposNuevoLote("202612"), ["adelanto", "gratificacion", "saldo"]);
  assert.deepEqual(tiposNuevoLote("202609"), ["adelanto", "saldo"]);
});

test("avisos fijos: BCP y tratamiento del adelanto con su texto exacto; los de la API no los repiten", () => {
  assert.equal(AVISO_BCP, "Formato del BCP sin validar con el banco: sube primero un lote pequeño a Telecrédito");
  assert.equal(AVISO_TRATAMIENTO_ADELANTO, "Tratamiento contable del adelanto: al pagarlo se registra D 1412 Adelanto de remuneraciones / H banco. Al cerrar la planilla del mes, la boleta lo descuenta como 0701 y su asiento abona la 1412 por lo adelantado; la 4111 queda solo con lo que falta pagar.");
  assert.deepEqual(avisosFijos({ formato: "bcp", tipo: "adelanto" }), [AVISO_BCP, AVISO_TRATAMIENTO_ADELANTO]);
  assert.deepEqual(avisosFijos({ formato: "interbank", tipo: "saldo" }), []);
  assert.deepEqual(avisosDeApi([AVISO_BCP, "La planilla sigue en borrador: si cambia una boleta, el saldo cambia"]), ["La planilla sigue en borrador: si cambia una boleta, el saldo cambia"]);
});

test("por abonar = neto − lo abonado sin adelantos (el adelanto ya está en el neto como 0701)", () => {
  const boleta = { totales: { neto: 1384 } };
  assert.equal(porAbonar(boleta, { adelantos: 300, otros: 1000 }), 384);
  assert.equal(porAbonar(boleta, { adelantos: 300, otros: 0 }), 1384);
  assert.equal(porAbonar(boleta, undefined), 1384);
  assert.equal(abonadoTotal({ adelantos: 300, otros: 1000 }), 1300);
  assert.equal(abonadoMayorQueNeto(boleta, { adelantos: 0, otros: 1384.01 }), true);
  assert.equal(abonadoMayorQueNeto(boleta, { adelantos: 500, otros: 1384 }), false);
});

test("totalesFilas: las filas manuales y las de monto 0 van fuera del archivo", () => {
  const t = totalesFilas([{ forma: "cuenta", monto: "100.10" }, { forma: "cci", monto: 50 }, { forma: "manual", monto: 30 }, { forma: "cuenta", monto: 0 }]);
  assert.deepEqual(t, { enArchivo: 150.1, fueraDelArchivo: 30, filasEnArchivo: 2, filasFuera: 2, total: 180.1 });
});

test("nombreDeDisposicion toma el nombre del Content-Disposition", () => {
  assert.equal(nombreDeDisposicion('attachment; filename="abono-saldo-202607-ABO-0001.txt"', "x.txt"), "abono-saldo-202607-ABO-0001.txt");
  assert.equal(nombreDeDisposicion(null, "x.txt"), "x.txt");
});

test("cuerpoNuevoLote: BCP exige tipo y 13 dígitos de la cuenta de cargo; CTS manda el depósito", () => {
  const bcp = { _id: "c1", codigoEntidad: "02" };
  const base = { tipo: "saldo", periodo: "202607", fecha: "2026-07-31", cuenta: bcp, cargoTipo: "C", cargoNumero: "1931-2345-6789-0", referencia: " Julio " };
  assert.deepEqual(cuerpoNuevoLote(base).body, { tipo: "saldo", fecha: "2026-07-31", cuentaCargo: "c1", periodo: "202607", cargo: { tipo: "C", numero: "1931234567890" }, referencia: "Julio" });
  assert.match(cuerpoNuevoLote({ ...base, cargoNumero: "123" }).error, /13 dígitos/);
  assert.match(cuerpoNuevoLote({ ...base, cargoTipo: "" }).error, /tipo/);
  assert.match(cuerpoNuevoLote({ ...base, cuenta: null }).error, /cuenta de cargo/);
  const ib = cuerpoNuevoLote({ tipo: "cts", deposito: "d1", periodo: "202605", fecha: "2026-05-15", cuenta: { _id: "c2", codigoEntidad: "03" } }).body;
  assert.deepEqual(ib, { tipo: "cts", fecha: "2026-05-15", cuentaCargo: "c2", deposito: "d1" });
});

test("cuerpoGuardarLote valida los montos y manda cargo solo en BCP", () => {
  const editables = [{ trabajador: "t1", nombre: "ANA", monto: "100.5" }, { trabajador: "t2", nombre: "LUIS", monto: "0" }];
  assert.equal(cuerpoGuardarLote({ fecha: "2026-07-15", referencia: "  ", editables }).body.referencia, "");
  assert.equal(cuerpoGuardarLote({ fecha: "2026-07-15", editables }).body.referencia, "");
  assert.deepEqual(cuerpoGuardarLote({ fecha: "2026-07-15", referencia: "x", editables, esBcp: false }).body,
    { fecha: "2026-07-15", referencia: "x", filas: [{ trabajador: "t1", monto: 100.5 }, { trabajador: "t2", monto: 0 }] });
  assert.match(cuerpoGuardarLote({ fecha: "2026-07-15", editables: [{ trabajador: "t1", nombre: "ANA", monto: "" }] }).error, /ANA/);
  assert.match(cuerpoGuardarLote({ fecha: "2026-07-15", editables, esBcp: true, cargo: { tipo: "M", numero: "12" } }).error, /13 dígitos/);
  assert.deepEqual(cuerpoGuardarLote({ fecha: "2026-07-15", editables: [], esBcp: true, cargo: { tipo: "M", numero: "1234567890123" } }).body.cargo, { tipo: "M", numero: "1234567890123" });
});

test("hayCambiosLote detecta cambios de montos, filas quitadas y cabecera", () => {
  const lote = { fecha: "2026-07-15", referencia: "R", cargo: { tipo: "C", numero: "1234567890123" }, filas: [{ trabajador: "t1", monto: 100, datos: { nombre: "ANA" } }, { trabajador: "t2", monto: 50, datos: { nombre: "LUIS" } }] };
  const estado = { lote, fecha: "2026-07-15", referencia: "R", cargo: lote.cargo, editables: editablesDe(lote.filas) };
  assert.equal(hayCambiosLote(estado), false);
  assert.equal(hayCambiosLote({ ...estado, editables: [{ ...estado.editables[0], monto: "100.00" }, estado.editables[1]] }), false);
  assert.equal(hayCambiosLote({ ...estado, editables: [{ ...estado.editables[0], monto: "90" }, estado.editables[1]] }), true);
  assert.equal(hayCambiosLote({ ...estado, editables: [estado.editables[0]] }), true);
  assert.equal(hayCambiosLote({ ...estado, fecha: "2026-07-16" }), true);
});
