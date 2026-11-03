import { test } from "node:test";
import assert from "node:assert/strict";
import {
  TREGISTRO_VACIO, estadoTexto, camposBloqueados, puedeDesbloquear, requiereEstudios, requiereCuenta, puedeGenerar, idsElegibles, esPendiente, nombreZip,
  puedeMarcar, idsMarcables, excluidosDeMarcar, seleccionablesEnMasa, resumenProblemas, bajasDeAltaSinControl, puedeAnularAlta, puedeNuevoVinculo,
  paisEmisorBloqueado, lineaEdicion, tramitesPendientesEnMes, mensajeCorreo,
} from "./tregistro.js";
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
  assert.deepEqual(camposBloqueados(ficha("registrada")), { documento: true, ingreso: true, cese: false });
  assert.deepEqual(camposBloqueados(ficha("pendiente", "registrada")), { documento: false, ingreso: false, cese: true });
  assert.deepEqual(camposBloqueados(ficha("registrada", "registrada")), { documento: true, ingreso: true, cese: true });
  assert.deepEqual(camposBloqueados({}), { documento: false, ingreso: false, cese: false });
  assert.deepEqual(camposBloqueados({ tregistro: {} }), { documento: false, ingreso: false, cese: false });
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
      fechaNacimiento: "1990-05-17", sexo: "2", telefono: "987654321", discapacidad: true, situacionEducativa: "14", direccion: { tipoVia: "01", nombreVia: "Los Olivos", ubigeo: "150101" },
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

test("situación especial nace en 0 y las fichas antiguas sin ella la cargan en 0", () => {
  assert.equal(TREGISTRO_VACIO().situacionEspecial, "0");
  assert.equal(TREGISTRO_VACIO(CONFIG).situacionEspecial, "0");
  assert.equal(TRABAJADOR_VACIO.tregistro.situacionEspecial, "0");
  const antigua = { _id: "x", tipoDoc: "01", numDoc: "12345678", apellidoPaterno: "Quispe", nombres: "Ana", fechaIngreso: "2026-01-05", remuneracionBasica: 2500 };
  assert.equal(formularioDeTrabajador(antigua).tregistro.situacionEspecial, "0");
  assert.equal(formularioDeTrabajador({ ...antigua, tregistro: { sexo: "1" } }).tregistro.situacionEspecial, "0");
  assert.equal(formularioDeTrabajador({ ...antigua, tregistro: { situacionEspecial: "3" } }).tregistro.situacionEspecial, "3");
  assert.equal(cuerpoDeTrabajador(formularioDeTrabajador(antigua)).tregistro.situacionEspecial, "0");
});

test("los estudios solo se validan y se envían cuando la situación educativa los exige", () => {
  const f = { ...TRABAJADOR_VACIO, numDoc: "12345678", apellidoPaterno: "Quispe", nombres: "Ana", fechaIngreso: "2026-01-05", remuneracionBasica: "2500" };
  const con = (situacionEducativa) => ({ ...f, tregistro: { ...f.tregistro, situacionEducativa, estudios: { completaEnPeru: true, institucion: "140337915", carrera: "812015", anioEgreso: "20" } } });
  assert.equal(validarTrabajador(con("10")), "");
  assert.equal(validarTrabajador(con("")), "");
  assert.match(validarTrabajador(con("11")), /año de egreso/i);
  assert.match(validarTrabajador(con("21")), /año de egreso/i);
  assert.equal("estudios" in cuerpoDeTrabajador(con("10")).tregistro, false);
  assert.deepEqual(cuerpoDeTrabajador(con("14")).tregistro.estudios, { completaEnPeru: true, institucion: "140337915", carrera: "812015", anioEgreso: "20" });
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
  assert.match(validarTrabajador(con({ situacionEducativa: "14", estudios: { ...f.tregistro.estudios, anioEgreso: "20" } })), /año de egreso/i);
  assert.equal(validarTrabajador(con({ correo: "ana@correo.pe", telefono: "987654321", establecimiento: "0001" })), "");
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

test("los ids elegibles se calculan sobre las filas dadas: lo seleccionado y oculto no cuenta", () => {
  const lista = [{ ...fila("pendiente", "ninguna"), _id: "a" }, { ...fila("sin control", "ninguna"), _id: "d" }];
  const visibles = lista.filter(esPendiente);
  assert.deepEqual(idsElegibles(visibles, new Set(["a", "d"]), "alta"), ["a"]);
});

test("ficha nueva nace con nacionalidad peruana; la ficha guardada sin nacionalidad no se rellena", () => {
  assert.equal(TREGISTRO_VACIO().nacionalidad, "9589");
  assert.equal(TREGISTRO_VACIO(CONFIG).nacionalidad, "9589");
  assert.equal(TRABAJADOR_VACIO.tregistro.nacionalidad, "9589");
  assert.equal(TREGISTRO_VACIO().paisEmisor, "");
  const guardada = { _id: "x", tipoDoc: "04", numDoc: "001234567", apellidoPaterno: "Silva", nombres: "Ana", fechaIngreso: "2026-01-05", remuneracionBasica: 2500 };
  assert.equal(formularioDeTrabajador(guardada).tregistro.nacionalidad, "");
  assert.equal(formularioDeTrabajador({ ...guardada, tregistro: { sexo: "1" } }).tregistro.nacionalidad, "");
  assert.equal(formularioDeTrabajador({ ...guardada, tregistro: { nacionalidad: "9850" } }).tregistro.nacionalidad, "9850");
});

test("estadoTexto: alta anulada", () => {
  assert.deepEqual(estadoTexto({ alta: "anulada", baja: "ninguna" }), { alta: "anulada", baja: "ninguna" });
});

test("el alta anulada no se genera, no se marca ni cuenta como pendiente", () => {
  const t = fila("anulada", "ninguna", "2026-03-31");
  assert.equal(puedeGenerar(t, "alta"), false);
  assert.equal(puedeGenerar(t, "baja"), false);
  assert.equal(esPendiente(t), false);
  assert.equal(puedeMarcar(t, "alta"), false);
  assert.equal(puedeMarcar(t, "baja"), false);
});

test("marcar solo lo que el servidor acepta: la baja incompleta o con el alta pendiente queda fuera", () => {
  for (const a of ["pendiente", "sin control"]) assert.equal(puedeMarcar(fila(a, "ninguna"), "alta"), true, a);
  assert.equal(puedeMarcar(fila("registrada", "ninguna"), "alta"), false);
  for (const b of ["pendiente", "sin control"]) assert.equal(puedeMarcar(fila("registrada", b, "2026-03-31"), "baja"), true, b);
  assert.equal(puedeMarcar(fila("sin control", "pendiente", "2026-03-31"), "baja"), true);
  assert.equal(puedeMarcar(fila("registrada", "incompleta", "2026-03-31"), "baja"), false);
  assert.equal(puedeMarcar(fila("pendiente", "pendiente", "2026-03-31"), "baja"), false);
  assert.equal(puedeMarcar(fila("registrada", "registrada", "2026-03-31"), "baja"), false);
  assert.equal(puedeMarcar(fila("registrada", "pendiente"), "baja"), false);
  assert.equal(puedeMarcar({}, "alta"), false);

  const lista = [
    { ...fila("registrada", "incompleta", "2026-03-31"), _id: "a", nombre: "Ana" },
    { ...fila("pendiente", "pendiente", "2026-03-31"), _id: "b", nombre: "Beto" },
    { ...fila("registrada", "pendiente", "2026-03-31"), _id: "c", nombre: "Carla" },
    { ...fila("anulada", "ninguna"), _id: "d", nombre: "Dora" },
    { ...fila("registrada", "registrada", "2026-03-31"), _id: "e", nombre: "Eva" },
  ];
  const todos = new Set(["a", "b", "c", "d", "e"]);
  assert.deepEqual(idsMarcables(lista, todos, "baja"), ["c"]);
  assert.deepEqual(idsMarcables(lista, todos, "alta"), ["b"]);
  assert.deepEqual(excluidosDeMarcar(lista, todos, "baja").map((x) => [x.nombre, x.motivo]), [
    ["Ana", "falta el motivo de la baja"], ["Beto", "su alta sigue pendiente: regístrala primero"], ["Dora", "su alta fue anulada"], ["Eva", "la baja ya está registrada"],
  ]);
  assert.deepEqual(excluidosDeMarcar(lista, todos, "alta").map((x) => [x.nombre, x.motivo]), [
    ["Ana", "su alta ya está registrada"], ["Carla", "su alta ya está registrada"], ["Dora", "su alta fue anulada"], ["Eva", "su alta ya está registrada"],
  ]);
  assert.deepEqual(excluidosDeMarcar(lista, new Set(["c"]), "baja"), []);
});

test("seleccionar todo toma solo lo pendiente, nunca las filas sin control", () => {
  const lista = [
    { ...fila("pendiente", "ninguna"), _id: "a" },
    { ...fila("sin control", "ninguna"), _id: "b" },
    { ...fila("registrada", "pendiente", "2026-03-31"), _id: "c" },
    { ...fila("registrada", "incompleta", "2026-03-31"), _id: "d" },
    { ...fila("registrada", "sin control", "2026-03-31"), _id: "e" },
    { ...fila("registrada", "ninguna"), _id: "f" },
    { ...fila("anulada", "ninguna"), _id: "g" },
  ];
  assert.deepEqual(seleccionablesEnMasa(lista).map((t) => t._id), ["a", "c", "d"]);
});

test("problemas de una fila sin control en el alta salen atenuados", () => {
  const p = (n) => Array.from({ length: n }, () => ({ codigo: "X" }));
  assert.deepEqual(resumenProblemas({ estado: { alta: "pendiente" }, problemasAlta: p(2), problemasBaja: p(1) }), { activos: 3, atenuados: 0 });
  assert.deepEqual(resumenProblemas({ estado: { alta: "sin control" }, problemasAlta: p(2), problemasBaja: p(1) }), { activos: 1, atenuados: 2 });
  assert.deepEqual(resumenProblemas({ estado: { alta: "registrada" }, problemasAlta: [], problemasBaja: [] }), { activos: 0, atenuados: 0 });
});

test("aviso de baja sobre un alta sin control: quiénes", () => {
  const lista = [
    { ...fila("sin control", "sin control", "2026-03-31"), _id: "a", nombre: "Ana" },
    { ...fila("registrada", "pendiente", "2026-03-31"), _id: "b", nombre: "Beto" },
    { ...fila("sin control", "pendiente", "2026-03-31"), _id: "c", nombre: "Carla" },
  ];
  assert.deepEqual(bajasDeAltaSinControl(lista, ["a", "b", "c"]), ["Ana", "Carla"]);
  assert.deepEqual(bajasDeAltaSinControl(lista, ["b"]), []);
  assert.deepEqual(bajasDeAltaSinControl(lista, []), []);
});

test("anular un alta y abrir un nuevo vínculo son del contador", () => {
  assert.equal(puedeAnularAlta("contador", fila("pendiente", "ninguna")), true);
  assert.equal(puedeAnularAlta("contador", fila("registrada", "ninguna")), false);
  assert.equal(puedeAnularAlta("contador", fila("sin control", "ninguna")), false);
  for (const r of ["admin", "jefatura", undefined]) assert.equal(puedeAnularAlta(r, fila("pendiente", "ninguna")), false, String(r));

  const ficha = (alta, baja) => ({ tregistro: { alta: { estado: alta }, baja: { estado: baja } } });
  assert.equal(puedeNuevoVinculo("contador", ficha("registrada", "registrada")), true);
  assert.equal(puedeNuevoVinculo("contador", ficha("anulada")), true);
  assert.equal(puedeNuevoVinculo("contador", ficha("registrada", "pendiente")), false);
  assert.equal(puedeNuevoVinculo("contador", ficha("pendiente")), false);
  assert.equal(puedeNuevoVinculo("contador", {}), false);
  assert.equal(puedeNuevoVinculo("contador", undefined), false);
  for (const r of ["admin", "jefatura", undefined]) assert.equal(puedeNuevoVinculo(r, ficha("registrada", "registrada")), false, String(r));
});

test("el país emisor se bloquea con el documento solo en pasaporte o documento extranjero", () => {
  const registrada = camposBloqueados({ tregistro: { alta: { estado: "registrada" } } });
  const libre = camposBloqueados({});
  for (const tipoDoc of ["07", "24"]) {
    assert.equal(paisEmisorBloqueado({ tipoDoc }, registrada, false), true, tipoDoc);
    assert.equal(paisEmisorBloqueado({ tipoDoc }, registrada, true), false, tipoDoc);
    assert.equal(paisEmisorBloqueado({ tipoDoc }, libre, false), false, tipoDoc);
  }
  for (const tipoDoc of ["01", "04", "09"]) assert.equal(paisEmisorBloqueado({ tipoDoc }, registrada, false), false, tipoDoc);
});

test("línea del historial de desbloqueos: fecha de Lima, quién y qué campos", () => {
  const l = lineaEdicion({ fecha: "2026-11-03T15:30:00.000Z", por: "Ana", campos: ["fechaIngreso", "paisEmisor", "nuevo vínculo"] });
  assert.match(l, /^03\/11\/2026/);
  assert.match(l, /10:30/);
  assert.ok(l.endsWith(" · Ana · fecha de ingreso, país emisor, nuevo vínculo"), l);
  assert.ok(lineaEdicion({ por: "Ana", campos: [] }).includes("Ana"));
});

test("trámites pendientes de un mes: altas y bajas pendientes o incompletas de quien tiene vínculo en el mes", () => {
  const lista = [
    { ...fila("pendiente", "ninguna"), fechaIngreso: "2026-03-10" },
    { ...fila("registrada", "incompleta", "2026-03-31"), fechaIngreso: "2025-01-01" },
    { ...fila("pendiente", "pendiente", "2026-03-31"), fechaIngreso: "2026-01-01" },
    { ...fila("sin control", "sin control", "2026-03-31"), fechaIngreso: "2025-01-01" },
    { ...fila("pendiente", "ninguna"), fechaIngreso: "2026-04-01" },
    { ...fila("registrada", "pendiente", "2026-02-28"), fechaIngreso: "2025-01-01" },
    { ...fila("anulada", "ninguna"), fechaIngreso: "2026-03-01" },
    { ...fila("pendiente", "ninguna"), fechaIngreso: "2026-06-15", vinculos: [{ ingreso: "2026-01-01", cese: "2026-03-31" }, { ingreso: "2026-06-15", cese: "" }] },
  ];
  assert.equal(tramitesPendientesEnMes(lista, "202603"), 1 + 1 + 2 + 1);
  assert.equal(tramitesPendientesEnMes(lista, "202602"), 1 + 2 + 1 + 1);
  assert.equal(tramitesPendientesEnMes(lista, "202604"), 2);
  assert.equal(tramitesPendientesEnMes(lista, "202605"), 2);
  assert.equal(tramitesPendientesEnMes(lista, "202607"), 3);
  assert.equal(tramitesPendientesEnMes([], "202603"), 0);
});

test("correo según el manual del PVS: mismo criterio que el servidor", () => {
  for (const ok of ["juan.perez@gmail.com", "ana@correo.pe", "JUAN@GMAIL.COM", "a_b-c.d@mail-x.com.pe"]) assert.equal(mensajeCorreo(ok), "", ok);
  for (const mal of ["jp@gmail.com", "juan@g.com", "juan@gmail", "juan@gmail.c0m", "sin-arroba", "juan@@gmail.com", "juan@gmail.com.pe.pe"]) assert.match(mensajeCorreo(mal), /correo/i, mal);
  assert.match(mensajeCorreo("no.tengo.correo@gmail.com"), /no tengo correo/i);
  assert.match(mensajeCorreo("juan@gob.pe"), /servidor/i);
  assert.equal(mensajeCorreo(""), "");
  const f = { ...TRABAJADOR_VACIO, numDoc: "12345678", apellidoPaterno: "Quispe", nombres: "Ana", fechaIngreso: "2026-01-05", remuneracionBasica: "2500" };
  assert.match(validarTrabajador({ ...f, tregistro: { ...f.tregistro, correo: "jp@gmail.com" } }), /correo/i);
  assert.equal(validarTrabajador({ ...f, tregistro: { ...f.tregistro, correo: "juan.perez@gmail.com" } }), "");
});
