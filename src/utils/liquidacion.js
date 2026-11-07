// Liquidación de beneficios sociales: la propuesta y los descuentos de ley los calcula el servidor; aquí solo la suma en pantalla.
const round2 = (n) => Math.round(n * 100) / 100;
const suma = (lista) => round2(lista.reduce((s, x) => s + (Number(x.monto) || 0), 0));

// Los descuentos de ley son la vista previa del servidor (con signo); las líneas, lo que el usuario está editando.
export function totalesEnPantalla(lineas, descuentosLey = []) {
  const ingresos = suma(lineas.filter((l) => l.tipo === "ingreso"));
  const descuentos = suma(lineas.filter((l) => l.tipo === "descuento"));
  const leyes = suma(descuentosLey || []);
  return { ingresos, descuentos, leyes, neto: round2(ingresos - descuentos - leyes) };
}

export function validarLinea({ codigo, descripcion, monto }) {
  if (!codigo) return "Elige el concepto de la línea.";
  if ((descripcion || "").trim().length > 80) return "La descripción admite hasta 80 caracteres.";
  const texto = String(monto ?? "").trim();
  if (!/^\d+(\.\d{1,2})?$/.test(texto) || !(Number(texto) > 0)) return "El monto debe ser mayor que 0, con hasta 2 decimales.";
  return "";
}

// Una confirmada de otro cese es de un vínculo anterior; un borrador de otro cese quedó cuando cambió la fecha en la ficha.
export const liquidacionVigente = (lista, fechaCese) =>
  lista.find((l) => l.fechaCese === fechaCese && l.estado !== "anulada") || lista.find((l) => l.estado === "borrador") || null;

// Guardado al salir de una base, meses o días: los montos propuestos cambiados en pantalla van con el valor guardado para que
// no queden «ajustados» sin pulsar Guardar (se reponen después), y las filas manuales a medio llenar se quedan en pantalla.
export function lineasParaEnviar(lineas, guardadas) {
  const incompleta = (l) => l.origen === "manual" && (!l.codigo || String(l.monto ?? "").trim() === "");
  const montoGuardado = new Map(guardadas.filter((g) => g.origen === "propuesta").map((g) => [g.clave, g.monto]));
  const montosLocales = {};
  const envio = lineas.filter((l) => !incompleta(l)).map((l) => {
    const g = montoGuardado.get(l.clave);
    if (l.origen !== "propuesta" || g === undefined || g === l.monto) return l;
    montosLocales[l.clave] = l.monto;
    return { ...l, monto: g };
  });
  return { envio, pendientes: lineas.filter(incompleta), montosLocales };
}

// Respuesta de un PUT con el modal editable: manda el servidor, salvo lo que el usuario cambió mientras viajaba la petición
// (`actual` frente a `enviado`, el formulario de cuando salió) y lo retenido por lineasParaEnviar.
export function fusionarRespuesta({ nuevo, enviado, actual, montosLocales = {}, pendientes = [] }) {
  const campos = (n, e = {}, a = {}) => Object.fromEntries(Object.entries(n).map(([k, v]) => [k, a[k] !== undefined && a[k] !== e[k] ? a[k] : v]));
  const propuestas = (f) => new Map(f.lineas.filter((l) => l.origen === "propuesta").map((l) => [l.clave, l]));
  const manuales = (f) => f.lineas.filter((l) => l.origen !== "propuesta");
  const env = propuestas(enviado), act = propuestas(actual);
  const quitadasEnVuelo = actual.quitadas.filter((c) => !enviado.quitadas.includes(c));
  const lineas = nuevo.lineas.filter((l) => l.origen === "propuesta" && !quitadasEnVuelo.includes(l.clave)).map((l) => {
    const e = env.get(l.clave), a = act.get(l.clave);
    const tocada = (k) => a && e && a[k] !== e[k];
    return { ...l, monto: tocada("monto") ? a.monto : montosLocales[l.clave] ?? l.monto, descripcion: tocada("descripcion") ? a.descripcion : l.descripcion };
  });
  const manualesEnVuelo = JSON.stringify(manuales(actual)) !== JSON.stringify(manuales(enviado));
  return {
    bases: campos(nuevo.bases, enviado.bases, actual.bases),
    bloques: Object.fromEntries(Object.entries(nuevo.bloques).map(([b, v]) => [b, campos(v, enviado.bloques[b], actual.bloques[b])])),
    lineas: [...lineas, ...(manualesEnVuelo ? manuales(actual) : [...manuales(nuevo), ...pendientes])],
    quitadas: actual.quitadas,
    observaciones: actual.observaciones !== enviado.observaciones ? actual.observaciones : nuevo.observaciones,
  };
}
