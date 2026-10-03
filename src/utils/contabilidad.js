// Lógica pura de la pantalla Contabilidad (espejo de las reglas de Backend/src/utils/asientos.js).
export const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
export const sinTildes = (t = "") => String(t).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

export const SUBDIARIOS = {
  compras: "Compras", ventas: "Ventas", "caja-bancos": "Caja y bancos", diario: "Diario",
  apertura: "Apertura", cierre: "Cierre", ajuste: "Ajuste",
};
export const SUBDIARIOS_MANUALES = ["diario", "apertura", "ajuste", "cierre"];
export const ELEMENTOS = {
  1: "Activo disponible y exigible", 2: "Activo realizable", 3: "Activo inmovilizado", 4: "Pasivo", 5: "Patrimonio",
  6: "Gastos por naturaleza", 7: "Ingresos", 8: "Saldos intermediarios y resultado", 9: "Contabilidad analítica",
};

// Destino propuesto para gastos 62–68 (espejo de Backend/src/data/pcge.js).
export const destinoPorDefecto = (codigo) => (/^6[2-8]/.test(codigo || "") ? { debe: "941", haber: "791" } : { debe: "", haber: "" });

const num = (v) => (v === "" || v == null ? 0 : Number(v));

// Las líneas del formulario llevan `debe`/`haber` en la moneda del asiento.
export function totalesAsiento(lineas) {
  const debe = round2(lineas.reduce((s, l) => s + num(l.debe), 0));
  const haber = round2(lineas.reduce((s, l) => s + num(l.haber), 0));
  const diferencia = round2(debe - haber);
  return { debe, haber, diferencia, cuadra: diferencia === 0 && debe > 0 };
}

// Errores por línea con las mismas reglas que el servidor: [{ indice, mensaje }].
export function validarLineas(lineas, cuentasPorCodigo) {
  const errores = [];
  lineas.forEach((l, indice) => {
    const err = (mensaje) => errores.push({ indice, mensaje });
    const c = cuentasPorCodigo.get(String(l.cuenta || "").trim());
    if (!c) return err("Elige una cuenta");
    if (!c.activa) return err(`La cuenta ${c.codigo} está desactivada`);
    if (!c.deMovimiento) return err(`La cuenta ${c.codigo} no es de movimiento`);
    const d = num(l.debe), h = num(l.haber);
    if (!Number.isFinite(d) || !Number.isFinite(h) || d < 0 || h < 0) return err("Importe inválido");
    if ((d > 0) === (h > 0)) return err("Va al debe o al haber, con un importe mayor que 0");
    if (round2(d) !== d || round2(h) !== h) return err("Máximo 2 decimales");
    if (c.exigeCentroCosto && !l.centroCosto) return err(`La cuenta ${c.codigo} exige centro de costo`);
    if (c.exigeTercero && !String(l.tercero?.numDoc || "").trim()) return err(`La cuenta ${c.codigo} exige el documento del tercero`);
  });
  if (lineas.length < 2) errores.push({ indice: -1, mensaje: "El asiento necesita al menos 2 líneas" });
  return errores;
}

// Cuerpo de las líneas para el servidor: en USD los importes van como debeME/haberME.
export const lineasParaEnviar = (lineas, moneda) => lineas.map((l) => {
  const base = {
    cuenta: String(l.cuenta).trim(), glosa: l.glosa || "",
    centroCosto: l.centroCosto || null, tercero: l.tercero || {},
  };
  return moneda === "USD"
    ? { ...base, debeME: num(l.debe), haberME: num(l.haber) }
    : { ...base, debe: num(l.debe), haber: num(l.haber) };
});

// Del asiento guardado a las líneas del formulario (en la moneda del asiento).
export const lineasDeAsiento = (asiento) => asiento.lineas.map((l) => ({
  cuenta: l.cuenta, glosa: l.glosa || "",
  debe: (asiento.moneda === "USD" ? l.debeME : l.debe) || "",
  haber: (asiento.moneda === "USD" ? l.haberME : l.haber) || "",
  centroCosto: l.centroCosto?._id || l.centroCosto || "",
  tercero: { tipoDoc: l.tercero?.tipoDoc || "", numDoc: l.tercero?.numDoc || "", nombre: l.tercero?.nombre || "" },
}));

// Plan como lista con sangría: [{ ...cuenta, profundidad }] ordenada por código.
export function arbolCuentas(cuentas) {
  const porCodigo = new Map(cuentas.map((c) => [c.codigo, c]));
  const profundidad = (c) => {
    let p = 0, actual = c;
    while (actual?.padre && porCodigo.has(actual.padre)) { p++; actual = porCodigo.get(actual.padre); }
    return p;
  };
  return [...cuentas].sort((a, b) => a.codigo.localeCompare(b.codigo)).map((c) => ({ ...c, profundidad: profundidad(c) }));
}

// Filtra el plan por texto (código o nombre, sin tildes) conservando los ancestros para dar contexto.
export function filtrarPlan(cuentas, texto, { soloMovimiento = false, verInactivas = true } = {}) {
  const q = sinTildes(texto);
  return cuentas.filter((c) => (!soloMovimiento || c.deMovimiento) && (verInactivas || c.activa)
    && (!q || c.codigo.startsWith(q) || sinTildes(c.nombre).includes(q)));
}

// Filas leídas del Excel del contador → [{ codigo, nombre }]. Acepta columnas "Código"/"Cuenta" y
// "Nombre"/"Descripción"/"Denominación" (cualquier mayúscula o tilde); ignora filas sin código numérico.
export function cuentasDeFilasExcel(filas) {
  const clave = (fila, opciones) => Object.keys(fila).find((k) => opciones.includes(sinTildes(k)));
  return filas.flatMap((fila) => {
    const kc = clave(fila, ["codigo", "cuenta", "cod", "codigo cuenta", "cuenta contable"]);
    const kn = clave(fila, ["nombre", "descripcion", "denominacion", "nombre de la cuenta", "descripcion de la cuenta"]);
    const codigo = String(fila[kc] ?? "").replace(/\s|\./g, "");
    const nombre = String(fila[kn] ?? "").trim();
    return /^\d{2,10}$/.test(codigo) && nombre ? [{ codigo, nombre }] : [];
  });
}
