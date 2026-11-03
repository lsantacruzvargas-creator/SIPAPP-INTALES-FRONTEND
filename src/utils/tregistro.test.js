import { test } from "node:test";
import assert from "node:assert/strict";
import { TREGISTRO_VACIO, estadoTexto, camposBloqueados, puedeDesbloquear, requiereEstudios, requiereCuenta, puedeGenerar, idsElegibles, esPendiente, nombreZip } from "./tregistro.js";
import { TRABAJADOR_VACIO, formularioDeTrabajador, cuerpoDeTrabajador, validarTrabajador } from "./planilla.js";

const CONFIG = { codigoEstablecimiento: "0001", tipoContrato: "01", periodicidad: "1", tipoPago: "2", jornadaMaxima: true, situacionEducativa: "07", categoriaOcupacional: "03", ocupacion: "123456" };

test("estudios y cuenta bancaria según el catálogo de SUNAT", () => {
  for (const c of ["11", "13", "14", "20", "21"]) assert.equal(requiereEstudios(c), true, c);
  for (const c of ["12", "07", "01", "22", "", undefined]) assert.equal(requiereEstudios(c), false, String(c));
  assert.equal(requiereCuenta("2"), true);
  assert.equal(requiereCuenta("1"), false);
  assert.equal(requiereCuenta(""), false);
});

test("solo el contador puede desbloquear datos ya registrados", () => {
  assert.equal(puedeDesbloquear("contador"), true);
  for (const r of ["admin", "jefatura", "vendedor", undefined]) assert.equal(puedeDesbloquear(r), false, String(r));
});

test("campos bloqueados por alta o baja registrada", () => {
  const ficha = (alta, baja) => ({ tregistro: { alta: { estado: alta }, baja: { estado: baja } } });
  assert.deepEqual(camposBloqueados(ficha("registrada"), "admin"), { documento: true, ingreso: true, cese: false });
  assert.deepEqual(camposBloqueados(ficha("pendiente", "registrada"), "admin"), { documento: false, ingreso: false, cese: true });
  assert.deepEqual(camposBloqueados(ficha("registrada", "registrada"), "contador"), { documento: true, ingreso: true, cese: true });
  assert.deepEqual(camposBloqueados({}, "admin"), { documento: false, ingreso: false, cese: false });
  assert.deepEqual(camposBloqueados({ tregistro: {} }, "admin"), { documento: false, ingreso: false, cese: false });
});

test("textos de estado del trámite", () => {
  assert.deepEqual(estadoTexto({ alta: "sin control", baja: "ninguna" }), { alta: "sin control", baja: "ninguna" });
  assert.deepEqual(estadoTexto({ alta: "pendiente", baja: "incompleta" }), { alta: "pendiente", baja: "incompleta (falta el motivo)" });
  assert.deepEqual(estadoTexto({ alta: "registrada", baja: "registrada" }), { alta: "registrada", baja: "registrada" });
  assert.deepEqual(estadoTexto({ alta: "registrada", baja: "pendiente" }), { alta: "registrada", baja: "pendiente" });
  assert.deepEqual(estadoTexto({ alta: "sin control", baja: "sin control" }), { alta: "sin control", baja: "sin control" });
});

test("ficha nueva: precarga los valores por defecto de la configuración", () => {
  const t = TREGISTRO_VACIO(CONFIG);
  assert.deepEqual(
    [t.tipoContrato, t.periodicidad, t.tipoPago, t.jornadaMaxima, t.situacionEducativa, t.categoriaOcupacional, t.ocupacion, t.establecimiento],
    ["01", "1", "2", true, "07", "03", "123456", ""]
  );
  assert.equal(t.direccion.ubigeo, "");
  assert.equal(t.estudios.completaEnPeru, true);
  assert.equal(TREGISTRO_VACIO().tipoContrato, "");
  assert.equal(TREGISTRO_VACIO().jornadaMaxima, false);
  assert.notEqual(TREGISTRO_VACIO(CONFIG).direccion, TREGISTRO_VACIO(CONFIG).direccion);
});

test("la ficha sin datos de T-Registro sigue siendo válida y produce un cuerpo correcto", () => {
  const sinTr = { _id: "x", tipoDoc: "01", numDoc: "12345678", apellidoPaterno: "Quispe", nombres: "Ana", fechaIngreso: "2026-01-05", remuneracionBasica: 2500 };
  const f = formularioDeTrabajador(sinTr);
  assert.equal(f.tregistro.direccion.ubigeo, "");
  assert.equal(f.desbloqueo, false);
  assert.equal(validarTrabajador(f), "");
  const cuerpo = cuerpoDeTrabajador(f);
  assert.equal(cuerpo.remuneracionBasica, 2500);
  assert.equal(cuerpo.desbloqueo, undefined);
  assert.equal(cuerpo.tregistro.fechaNacimiento, "");
  assert.equal(cuerpo.tregistro.alta, undefined);
  assert.equal(cuerpo.tregistro.ediciones, undefined);
});

test("ficha existente: ida y vuelta de T-Registro sin enviar lo que escribe el servidor", () => {
  const del_servidor = {
    _id: "x", tipoDoc: "01", numDoc: "12345678", apellidoPaterno: "Quispe", nombres: "Ana", fechaIngreso: "2026-01-05", remuneracionBasica: 2500,
    tregistro: {
      fechaNacimiento: "1990-05-17", sexo: "2", telefono: "987654321", discapacidad: true, direccion: { tipoVia: "01", nombreVia: "Los Olivos", ubigeo: "150101" },
      estudios: { institucion: "123", anioEgreso: "2012" }, cuenta: { entidad: "002", numero: "1234" },
      alta: { estado: "registrada", fechaRegistro: "2026-01-06", registradaPor: "Ana", ticket: "T1" },
      baja: { estado: "pendiente", motivo: "", ticket: "T2" }, ediciones: [{ por: "x", campos: ["numDoc"] }],
    },
  };
  const f = formularioDeTrabajador(del_servidor);
  assert.deepEqual([f.tregistro.fechaNacimiento, f.tregistro.sexo, f.tregistro.discapacidad, f.tregistro.direccion.nombreVia, f.tregistro.cuenta.numero], ["1990-05-17", "2", true, "Los Olivos", "1234"]);
  const { tregistro: tr } = cuerpoDeTrabajador(f);
  assert.deepEqual([tr.fechaNacimiento, tr.sexo, tr.discapacidad, tr.direccion.ubigeo, tr.estudios.institucion, tr.cuenta.entidad], ["1990-05-17", "2", true, "150101", "123", "002"]);
  assert.deepEqual([tr.alta, tr.ediciones, tr.baja], [undefined, undefined, { motivo: "" }]);
});

test("el desbloqueo solo viaja cuando el contador eligió editar", () => {
  const f = { ...TRABAJADOR_VACIO, numDoc: "12345678", remuneracionBasica: "1" };
  assert.equal("desbloqueo" in cuerpoDeTrabajador({ ...f, desbloqueo: false }), false);
  assert.equal(cuerpoDeTrabajador({ ...f, desbloqueo: true }).desbloqueo, true);
  assert.equal("desbloqueo" in cuerpoDeTrabajador(f), false);
});

test("validación de T-Registro: formato del correo y de los códigos numéricos", () => {
  const f = { ...TRABAJADOR_VACIO, numDoc: "12345678", apellidoPaterno: "Quispe", nombres: "Ana", fechaIngreso: "2026-01-05", remuneracionBasica: "2500" };
  assert.equal(validarTrabajador(f), "");
  const con = (cambio) => ({ ...f, tregistro: { ...f.tregistro, ...cambio } });
  assert.match(validarTrabajador(con({ correo: "sin-arroba" })), /correo/i);
  assert.match(validarTrabajador(con({ telefono: "12ab" })), /teléfono/i);
  assert.match(validarTrabajador(con({ establecimiento: "12" })), /establecimiento/i);
  assert.match(validarTrabajador(con({ estudios: { ...f.tregistro.estudios, anioEgreso: "20" } })), /año de egreso/i);
  assert.equal(validarTrabajador(con({ correo: "ana@x.pe", telefono: "987654321", establecimiento: "0001" })), "");
});

const fila = (alta, baja, fechaCese = "") => ({ _id: `${alta}-${baja}`, fechaCese, estado: { alta, baja } });

test("quién puede descargarse o marcarse como alta o baja", () => {
  for (const a of ["pendiente", "sin control"]) assert.equal(puedeGenerar(fila(a, "ninguna"), "alta"), true, a);
  assert.equal(puedeGenerar(fila("registrada", "ninguna"), "alta"), false);
  for (const b of ["pendiente", "incompleta", "sin control"]) assert.equal(puedeGenerar(fila("registrada", b, "2026-03-31"), "baja"), true, b);
  assert.equal(puedeGenerar(fila("registrada", "registrada", "2026-03-31"), "baja"), false);
  assert.equal(puedeGenerar(fila("registrada", "ninguna"), "baja"), false);
  assert.equal(puedeGenerar(fila("registrada", "sin control"), "baja"), false);
  assert.equal(puedeGenerar({}, "alta"), false);
});

test("ids elegibles dentro de la selección, en el orden de la lista", () => {
  const lista = [
    { ...fila("pendiente", "ninguna"), _id: "a" },
    { ...fila("registrada", "pendiente", "2026-03-31"), _id: "b" },
    { ...fila("registrada", "ninguna"), _id: "c" },
    { ...fila("sin control", "ninguna"), _id: "d" },
  ];
  assert.deepEqual(idsElegibles(lista, new Set(["d", "a", "b", "c"]), "alta"), ["a", "d"]);
  assert.deepEqual(idsElegibles(lista, new Set(["d", "a", "b", "c"]), "baja"), ["b"]);
  assert.deepEqual(idsElegibles(lista, new Set(), "alta"), []);
  assert.deepEqual(idsElegibles(lista, new Set(["c"]), "alta"), []);
});

test("pendiente es lo que requiere acción del usuario, no el «sin control»", () => {
  assert.equal(esPendiente(fila("pendiente", "ninguna")), true);
  assert.equal(esPendiente(fila("registrada", "pendiente", "2026-03-31")), true);
  assert.equal(esPendiente(fila("registrada", "incompleta", "2026-03-31")), true);
  assert.equal(esPendiente(fila("sin control", "ninguna")), false);
  assert.equal(esPendiente(fila("registrada", "registrada", "2026-03-31")), false);
});

test("nombre del zip: el del servidor o uno por defecto", () => {
  assert.equal(nombreZip('attachment; filename="t-registro-alta-20261102.zip"', "alta"), "t-registro-alta-20261102.zip");
  assert.equal(nombreZip("attachment; filename=otro.zip", "baja"), "otro.zip");
  assert.equal(nombreZip(null, "baja"), "t-registro-baja.zip");
  assert.equal(nombreZip("attachment", "alta"), "t-registro-alta.zip");
});
