import { test } from "node:test";
import assert from "node:assert/strict";
import {
  nombreTrabajador, textoPension, montoDe, totalesPlanilla, filasExcelPlanilla, TRABAJADOR_VACIO, formularioDeTrabajador, validarTrabajador,
  cuerpoDeTrabajador, formularioDeParametros, cuerpoDeParametros, faltanTasasAfp, cuerpoDeCuentas, celdasDeColumna, SUBTITULO_LIQUIDACION, AREAS, CLAVES_GASTO_AREA,
} from "./planilla.js";

const AFPS = { integra: "Integra", habitat: "Habitat" };
const boleta = (extra = {}) => ({
  datos: { numDoc: "12345678", nombre: "QUISPE MAMANI ANA", cargo: "Soldadora", pension: { regimen: "afp", afp: "integra", comision: "flujo" } },
  dias: { remunerados: 27 },
  conceptos: [
    { codigo: "0121", tipo: "ingreso", monto: 2000 }, { codigo: "0118", tipo: "ingreso", monto: 700 }, { codigo: "0201", tipo: "ingreso", monto: 101.7 },
    { codigo: "0105", tipo: "ingreso", monto: 50.05 }, { codigo: "0909", tipo: "ingreso", monto: 120 }, { codigo: "0701", tipo: "descuento", monto: 200 },
    { codigo: "0608", tipo: "aporteTrabajador", monto: 285.18 }, { codigo: "0601", tipo: "aporteTrabajador", monto: 44.2 }, { codigo: "0606", tipo: "aporteTrabajador", monto: 39.07 },
    { codigo: "0605", tipo: "aporteTrabajador", monto: 10 }, { codigo: "0804", tipo: "aporteEmpleador", monto: 256.66 },
  ],
  totales: { ingresos: 2971.75, descuentos: 200, aportesTrabajador: 378.45, aportesEmpleador: 256.66, neto: 2393.3 },
  ...extra,
});

test("textos del trabajador y de su régimen pensionario", () => {
  assert.equal(nombreTrabajador({ apellidoPaterno: "QUISPE", apellidoMaterno: "", nombres: "ANA" }), "QUISPE ANA");
  assert.equal(textoPension({ regimen: "afp", afp: "habitat", comision: "mixta" }, AFPS), "AFP Habitat (mixta)");
  assert.equal(textoPension({ regimen: "onp" }), "ONP");
  assert.equal(textoPension({ regimen: "ninguno" }), "Sin régimen");
});

test("totales de la planilla y hoja de Excel por trabajador", () => {
  const b = boleta();
  assert.equal(montoDe(b, "0601", "0606", "0608"), 368.45);
  assert.deepEqual(totalesPlanilla([b, b]), { ingresos: 5943.5, descuentos: 400, aportesTrabajador: 756.9, aportesEmpleador: 513.32, neto: 4786.6 });
  const [fila] = filasExcelPlanilla([b], AFPS);
  assert.deepEqual(
    [fila["Trabajador"], fila["Pensión"], fila["Días pagados"], fila["Básico"], fila["Asig. familiar"], fila["Horas extras"], fila["Otros ingresos"], fila["AFP"], fila["ONP"], fila["Renta 5.ª"], fila["Neto a pagar"]],
    ["QUISPE MAMANI ANA", "AFP Integra", 27, 2700, 101.7, 50.05, 120, 368.45, 0, 10, 2393.3]
  );
});

test("formulario del trabajador: validación y cuerpo para el servidor", () => {
  assert.match(validarTrabajador(TRABAJADOR_VACIO), /DNI/);
  const f = { ...TRABAJADOR_VACIO, numDoc: "12345678", apellidoPaterno: "Quispe", nombres: "Ana", fechaIngreso: "2026-01-05", remuneracionBasica: "2500" };
  assert.equal(validarTrabajador(f), "");
  assert.match(validarTrabajador({ ...f, fechaCese: "2025-12-31" }), /cese/);
  assert.match(validarTrabajador({ ...f, remuneracionBasica: "" }), /remuneración/);
  assert.match(validarTrabajador({ ...f, pension: { ...f.pension, regimen: "afp" } }), /AFP/);
  assert.match(validarTrabajador({ ...f, conceptosFijos: [{ codigo: "0909", monto: "" }] }), /conceptos fijos/);
  assert.match(validarTrabajador({ ...f, quintaAnterior: [{ mes: "", ingresos: "1", retencion: "0" }] }), /mes/);
  assert.equal(validarTrabajador({ ...f, tipoDoc: "04", numDoc: "X12" }), "Falta el número de documento.");

  const cuerpo = cuerpoDeTrabajador({ ...f, conceptosFijos: [{ codigo: "0909", monto: "150.5" }], quintaAnterior: [{ mes: "2026-08", ingresos: "45450", retencion: "" }] });
  assert.deepEqual([cuerpo.remuneracionBasica, cuerpo.centroCosto, cuerpo.conceptosFijos, cuerpo.quintaAnterior], [2500, null, [{ codigo: "0909", monto: 150.5 }], [{ periodo: "202608", ingresos: 45450, retencion: 0 }]]);
  // Ida y vuelta desde lo que devuelve el servidor.
  const vuelta = formularioDeTrabajador({ ...cuerpo, _id: "x", centroCosto: null, pension: { regimen: "onp" } });
  assert.deepEqual([vuelta.remuneracionBasica, vuelta.centroCosto, vuelta.pension.comision, vuelta.conceptosFijos[0].monto, vuelta.quintaAnterior[0].mes], ["2500", "", "flujo", "150.5", "2026-08"]);
});

test("formulario del trabajador: plan EPS", () => {
  const f = { ...TRABAJADOR_VACIO, numDoc: "12345678", apellidoPaterno: "Quispe", nombres: "Ana", fechaIngreso: "2026-01-05", remuneracionBasica: "2500", salud: "eps" };
  // Sin plan, la EPS no descuenta nada: se guarda igual.
  assert.equal(validarTrabajador(f), "");
  assert.equal(cuerpoDeTrabajador(f).planEps, null);
  const plan = { nombre: "Oro", primaTotal: "180", aporteEmpresa: "120", aporteTrabajador: "60" };
  assert.equal(validarTrabajador({ ...f, planEps: plan }), "");
  assert.match(validarTrabajador({ ...f, planEps: { ...plan, aporteTrabajador: "50" } }), /sumar la prima total/);
  assert.match(validarTrabajador({ ...f, planEps: { ...plan, primaTotal: "" } }), /montos del plan EPS/);
  assert.deepEqual(cuerpoDeTrabajador({ ...f, planEps: plan }).planEps, { nombre: "Oro", primaTotal: 180, aporteEmpresa: 120, aporteTrabajador: 60 });
  // Con otro régimen de salud el plan no se valida ni se envía.
  assert.equal(validarTrabajador({ ...f, salud: "essalud", planEps: { ...plan, primaTotal: "x" } }), "");
  assert.equal(cuerpoDeTrabajador({ ...f, salud: "essalud", planEps: plan }).planEps, null);
  assert.deepEqual(formularioDeTrabajador({ ...f, planEps: { nombre: "Oro", primaTotal: 180, aporteEmpresa: 120, aporteTrabajador: 60 } }).planEps, plan);
  assert.deepEqual(formularioDeTrabajador({ ...f, planEps: null }).planEps, TRABAJADOR_VACIO.planEps);
});

test("parámetros del mes: formulario, cuerpo y aviso de tasas de AFP sin llenar", () => {
  const p = { uit: 5500, rmv: 1130, essalud: 9, onp: 13, afp: { aporte: 10, prima: 0, tope: 0, comisiones: { integra: { flujo: 1.55, mixta: 0 } } } };
  const f = formularioDeParametros(p, AFPS);
  assert.deepEqual([f.uit, f.afp.comisiones.integra.flujo, f.afp.comisiones.habitat.flujo], ["5500", "1.55", ""]);
  assert.equal(faltanTasasAfp(f), true);
  const lleno = { ...f, afp: { ...f.afp, prima: "1.37", tope: "12732.70" } };
  assert.equal(faltanTasasAfp(lleno), false);
  assert.deepEqual(cuerpoDeParametros(lleno).afp, { aporte: 10, prima: 1.37, tope: 12732.7, comisiones: { integra: { flujo: 1.55, mixta: 0 }, habitat: { flujo: 0, mixta: 0 } } });
});

test("cuerpo de cuentas: solo una cuenta de área y las generales quedan intactas", () => {
  const cargadas = { remuneraciones: "6211", salud: "6271", porPagar: "4111", cts: "", porArea: { remuneraciones: { administracion: "", produccion: "", ventas: "" } } };
  const cuerpo = cuerpoDeCuentas({ ...cargadas, porArea: { ...cargadas.porArea, remuneraciones: { ...cargadas.porArea.remuneraciones, produccion: "62112" } } });
  assert.deepEqual([cuerpo.remuneraciones, cuerpo.salud, cuerpo.porPagar, cuerpo.cts], ["6211", "6271", "4111", ""]);
  assert.equal(cuerpo.porArea.remuneraciones.produccion, "62112");
  assert.deepEqual(Object.keys(cuerpo.porArea), CLAVES_GASTO_AREA);
  for (const k of CLAVES_GASTO_AREA) assert.deepEqual(Object.keys(cuerpo.porArea[k]), Object.keys(AREAS));
  assert.equal(cuerpo.porArea.salud.ventas, "");
  assert.equal(cuerpoDeCuentas({ remuneraciones: "6211" }).porArea.cts.ventas, "");
});

test("ficha del trabajador: el área viaja siempre, vacía si no tiene", () => {
  assert.equal(TRABAJADOR_VACIO.area, "");
  assert.equal(formularioDeTrabajador({ numDoc: "1" }).area, "");
  assert.equal(formularioDeTrabajador({ numDoc: "1", area: "ventas" }).area, "ventas");
  assert.equal(cuerpoDeTrabajador(formularioDeTrabajador({ numDoc: "1", remuneracionBasica: 1 })).area, "");
});

test("celdas de la boleta: los conceptos de liquidación van bajo su subtítulo; DEV5 es un ingreso más", () => {
  const mes = { codigo: "0121", nombre: "Remuneración", tipo: "ingreso", monto: 2500 };
  const cts = { codigo: "0904", nombre: "CTS trunca", tipo: "ingreso", monto: 900, liquidacion: true };
  const dev5 = { codigo: "DEV5", nombre: "Devolución de retención de 5.ª categoría", tipo: "ingreso", monto: 80 };
  assert.deepEqual(celdasDeColumna([cts, mes, dev5]), [mes, dev5, { subtitulo: SUBTITULO_LIQUIDACION }, cts]);
  assert.deepEqual(celdasDeColumna([mes]), [mes]);
  assert.deepEqual(celdasDeColumna([]), []);
});
