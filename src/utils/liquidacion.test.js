import { test } from "node:test";
import assert from "node:assert/strict";
import { totalesEnPantalla, validarLinea, liquidacionVigente, lineasParaEnviar, fusionarRespuesta, cuerpoParaEnviar } from "./liquidacion.js";

test("totalesEnPantalla: suma las líneas en pantalla y los descuentos de ley del servidor", () => {
  const lineas = [
    { codigo: "0904", tipo: "ingreso", monto: 1129.2 },
    { codigo: "0114", tipo: "ingreso", monto: "1340.15" },
    { codigo: "0701", tipo: "descuento", monto: "100" },
  ];
  assert.deepEqual(totalesEnPantalla(lineas, [{ codigo: "0607", monto: 174.22 }]), { ingresos: 2469.35, descuentos: 100, leyes: 174.22, neto: 2195.13 });
});

test("totalesEnPantalla: montos a medio escribir cuentan 0 y los descuentos de ley negativos restan", () => {
  const lineas = [{ tipo: "ingreso", monto: "1000" }, { tipo: "ingreso", monto: "" }, { tipo: "descuento", monto: "abc" }];
  assert.deepEqual(totalesEnPantalla(lineas, [{ monto: 130 }, { monto: -30.5 }]), { ingresos: 1000, descuentos: 0, leyes: 99.5, neto: 900.5 });
  assert.deepEqual(totalesEnPantalla([], undefined), { ingresos: 0, descuentos: 0, leyes: 0, neto: 0 });
});

test("validarLinea: código obligatorio, descripción hasta 80 y monto mayor que 0 con 2 decimales", () => {
  const ok = { codigo: "0701", descripcion: "Adelanto", monto: "100.50" };
  assert.equal(validarLinea(ok), "");
  assert.equal(validarLinea({ ...ok, monto: 25 }), "");
  assert.equal(validarLinea({ ...ok, descripcion: "x".repeat(80) }), "");
  assert.notEqual(validarLinea({ ...ok, codigo: "" }), "");
  assert.notEqual(validarLinea({ ...ok, descripcion: "x".repeat(81) }), "");
  for (const monto of [0, "0", "1.234", "", "-5", "abc", "1,5"]) assert.notEqual(validarLinea({ ...ok, monto }), "", `monto ${monto}`);
});

test("liquidacionVigente: la no anulada del cese actual; si no hay, el borrador más nuevo de otro cese", () => {
  const conf = { _id: "c", fechaCese: "2025-07-18", estado: "confirmada" };
  const anul = { _id: "a", fechaCese: "2025-07-18", estado: "anulada" };
  const borrViejo = { _id: "b", fechaCese: "2025-06-30", estado: "borrador" };
  assert.equal(liquidacionVigente([anul, conf], "2025-07-18"), conf);
  assert.equal(liquidacionVigente([anul, borrViejo], "2025-07-18"), borrViejo);
  assert.equal(liquidacionVigente([borrViejo], ""), borrViejo);
  assert.equal(liquidacionVigente([{ ...conf, fechaCese: "2024-01-31" }, anul], "2025-07-18"), null);
  assert.equal(liquidacionVigente([], "2025-07-18"), null);
});

test("lineasParaEnviar: al salir de un campo, sin filas manuales incompletas y con los montos propuestos guardados", () => {
  const guardadas = [{ clave: "cts", origen: "propuesta", monto: "1129.2", editada: false }];
  const lineas = [
    { clave: "cts", origen: "propuesta", monto: "1000", editada: false },
    { codigo: "0701", origen: "manual", monto: "100" },
    { codigo: "", origen: "manual", monto: "50" },
    { codigo: "0701", origen: "manual", monto: " " },
  ];
  assert.deepEqual(lineasParaEnviar(lineas, guardadas), {
    envio: [{ clave: "cts", origen: "propuesta", monto: "1129.2", editada: false }, { codigo: "0701", origen: "manual", monto: "100" }],
    pendientes: [lineas[2], lineas[3]],
    montosLocales: { cts: "1000" },
  });
});

test("fusionarRespuesta: el servidor manda salvo lo cambiado mientras viajaba el PUT y lo retenido al salir del campo", () => {
  const cts = (monto, extra = {}) => ({ clave: "cts", codigo: "0904", descripcion: "CTS trunca", tipo: "ingreso", monto, origen: "propuesta", editada: false, ...extra });
  const truncas = (monto) => ({ clave: "truncas", codigo: "0114", descripcion: "Vacaciones truncas", tipo: "ingreso", monto, origen: "propuesta", editada: false });
  const manual = { codigo: "0701", descripcion: "Adelanto", tipo: "descuento", monto: "100", origen: "manual", editada: false };
  const vacia = { codigo: "", descripcion: "", tipo: "ingreso", monto: "", origen: "manual", editada: false };
  const enviado = {
    bases: { rcVacaciones: "5000", sextoGratificacion: "744.53" }, bloques: { cts: { meses: "2", dias: "18" } },
    lineas: [cts("1000"), truncas("1340.15"), manual, vacia], quitadas: [], observaciones: "",
  };
  const nuevo = {
    bases: { rcVacaciones: "5000", sextoGratificacion: "744.53" }, bloques: { cts: { meses: "2", dias: "18" } },
    lineas: [cts("1197.85", { detalle: ["nuevo"] }), truncas("1500.11"), { ...manual, descripcion: "Adelanto" }], quitadas: [], observaciones: "",
  };
  // Sin cambios en vuelo: valores del servidor, el monto local retenido de la CTS y la fila vacía al final.
  assert.deepEqual(fusionarRespuesta({ nuevo, enviado, actual: enviado, montosLocales: { cts: "1000" }, pendientes: [vacia] }), {
    ...nuevo, lineas: [cts("1000", { detalle: ["nuevo"] }), truncas("1500.11"), manual, vacia],
  });
  // En vuelo: otra base, el monto de las truncas, una manual nueva y las observaciones.
  const actual = {
    ...enviado, bases: { ...enviado.bases, sextoGratificacion: "800" },
    lineas: [cts("1000"), truncas("1400"), manual, vacia, { ...vacia, codigo: "0118" }], observaciones: "Revisar",
  };
  assert.deepEqual(fusionarRespuesta({ nuevo, enviado, actual, montosLocales: { cts: "1000" }, pendientes: [vacia] }), {
    bases: { rcVacaciones: "5000", sextoGratificacion: "800" }, bloques: nuevo.bloques,
    lineas: [cts("1000", { detalle: ["nuevo"] }), truncas("1400"), manual, vacia, { ...vacia, codigo: "0118" }], quitadas: [], observaciones: "Revisar",
  });
  // Una línea quitada en vuelo no vuelve.
  assert.deepEqual(fusionarRespuesta({ nuevo, enviado, actual: { ...enviado, quitadas: ["truncas"], lineas: [cts("1000"), manual, vacia] } }).lineas.map((l) => l.clave ?? l.codigo),
    ["cts", "0701"]);
});

test("cuerpoParaEnviar: al salir del campo solo envía si cambiaron bases o bloques, con los montos propuestos guardados", () => {
  const cts = (monto) => ({ clave: "cts", codigo: "0904", descripcion: " CTS trunca ", tipo: "ingreso", monto, origen: "propuesta", editada: false });
  const vacia = { codigo: "", descripcion: "", tipo: "ingreso", monto: "", origen: "manual", editada: false };
  const guardado = { bases: { rcVacaciones: "4467.17" }, bloques: { cts: { meses: "2", dias: "18" } }, lineas: [cts("1129.2")], quitadas: [], observaciones: "" };
  assert.deepEqual(cuerpoParaEnviar({ form: { ...guardado, lineas: [cts("1000"), vacia] }, guardado, alSalir: true }), { nada: true });
  const form = { ...guardado, bloques: { cts: { meses: "1", dias: "18" } }, lineas: [cts("1000"), vacia], observaciones: "Nota" };
  assert.deepEqual(cuerpoParaEnviar({ form, guardado, alSalir: true }), {
    cuerpo: {
      bases: { rcVacaciones: 4467.17 }, bloques: { cts: { meses: 1, dias: 18 } },
      lineas: [{ ...cts(1129.2), descripcion: "CTS trunca" }], quitadas: [], observaciones: "Nota",
    },
    pendientes: [vacia], montosLocales: { cts: "1000" },
  });
  // Con Guardar van los montos en pantalla y se validan todas las filas.
  assert.equal(cuerpoParaEnviar({ form, guardado }).error, "Línea 2: Elige el concepto de la línea.");
  assert.equal(cuerpoParaEnviar({ form: { ...form, lineas: [cts("1000")] }, guardado }).cuerpo.lineas[0].monto, 1000);
  assert.match(cuerpoParaEnviar({ form: { ...form, bases: { rcVacaciones: "-1" } }, guardado, alSalir: true }).error, /Remuneración computable/);
  assert.match(cuerpoParaEnviar({ form: { ...form, bloques: { cts: { meses: "", dias: "18" } } }, guardado, alSalir: true }).error, /enteros/);
});
