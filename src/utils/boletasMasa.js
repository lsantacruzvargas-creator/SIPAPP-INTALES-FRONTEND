// Funciones puras (sin jsPDF ni DOM) de la descarga de boletas en masa.

export function nombreArchivoBoletas(periodo, { borrador = false, zip = false } = {}) {
  return `boletas-${periodo}${borrador ? "-BORRADOR" : ""}.${zip ? "zip" : "pdf"}`;
}

// Sin tildes (Ñ → N) y sin caracteres prohibidos en nombres de archivo de Windows.
export function nombrePdfTrabajador(boleta) {
  const { numDoc, nombre } = boleta.datos;
  const limpio = `${numDoc} ${nombre}`
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[/\\:*?"<>|]/g, " ")
    .replace(/\s+/g, " ").trim();
  return `${limpio}.pdf`;
}

// Un zip no admite dos entradas con el mismo nombre: la repetida lleva " (2)", " (3)"… antes de la extensión.
export function nombresUnicos(nombres) {
  const usados = new Set();
  return nombres.map((nombre) => {
    let candidato = nombre;
    const punto = nombre.lastIndexOf(".");
    const base = punto === -1 ? nombre : nombre.slice(0, punto);
    const ext = punto === -1 ? "" : nombre.slice(punto);
    for (let n = 2; usados.has(candidato); n++) candidato = `${base} (${n})${ext}`;
    usados.add(candidato);
    return candidato;
  });
}

export function avisosDescargaBoletas(boletas, { cerrada }) {
  const avisos = [];
  const negativas = boletas.filter((b) => b.totales.neto < 0).length;
  const sinIngresos = boletas.filter((b) => !(b.totales.ingresos > 0)).length;
  if (negativas) avisos.push(`${negativas} ${negativas === 1 ? "boleta" : "boletas"} con neto negativo: revisa sus descuentos`);
  if (sinIngresos) avisos.push(`${sinIngresos} ${sinIngresos === 1 ? "boleta" : "boletas"} sin ingresos en el mes`);
  if (!cerrada) avisos.push("Planilla en borrador: las boletas salen con la marca BORRADOR");
  return avisos;
}
