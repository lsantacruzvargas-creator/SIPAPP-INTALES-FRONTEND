export const IGV = 0.18;
export const round2 = (n) => Math.round(Number(n) * 100) / 100;

export const money = (valor, moneda = "PEN") =>
  `${moneda === "USD" ? "US$" : "S/"} ${Number(valor || 0).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const nombreEmpresa = (e) => (!e ? "" : e.alias ? `${e.alias} — ${e.razonSocial}` : e.razonSocial);

// Los refs llegan como id suelto o como documento poblado según la ruta.
export const idDe = (x) => String(x?._id ?? x ?? "");

export function lineasDeSCs(scs, estado = "por_procesar") {
  return scs.flatMap((sc) => sc.items.filter((l) => l.estadoCompra === estado).map((l) => ({ ...l, sc })));
}

export function ordenarProveedores(proveedores, tipoArticuloIds) {
  const buscados = new Set(tipoArticuloIds.filter(Boolean).map(idDe));
  const conCoincidencias = proveedores.map((proveedor) => ({
    proveedor,
    coincidencias: (proveedor.tipoArticulos || []).filter((t) => buscados.has(idDe(t))).length,
  }));
  const porNombre = (a, b) => a.proveedor.razonSocial.localeCompare(b.proveedor.razonSocial, "es");
  return {
    sugeridos: conCoincidencias.filter((x) => x.coincidencias > 0).sort((a, b) => b.coincidencias - a.coincidencias || porNombre(a, b)),
    otros: conCoincidencias.filter((x) => x.coincidencias === 0).sort(porNombre),
    totalTipos: buscados.size,
  };
}

export function totalesOCP(items, afectoIgv = true) {
  const subtotal = round2(items.reduce((s, it) => s + Number(it.cantidad || 0) * Number(it.precioUnitario || 0), 0));
  const igv = afectoIgv ? round2(subtotal * IGV) : 0;
  return { subtotal, igv, total: round2(subtotal + igv) };
}

// USD se convierte a soles SOLO para decidir cuál es más barato.
export function proveedorMasBarato(proveedores, itemId, tipoCambio) {
  let mejor = null;
  for (const p of proveedores) {
    const precio = p.precios?.find((x) => idDe(x.itemId) === idDe(itemId))?.precioUnitario;
    if (precio === undefined || precio === null || precio === "") continue;
    const enSoles = p.moneda === "USD" ? Number(precio) * tipoCambio : Number(precio);
    if (!mejor || enSoles < mejor.enSoles) mejor = { id: idDe(p._id), enSoles };
  }
  return mejor?.id ?? null;
}

export const FILTROS_VACIOS = { codigo: "", proveedor: "", texto: "", tipoArticulo: "", centroCosto: "", desde: "", hasta: "", estado: "" };

const fechaLima = (d) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" }).format(new Date(d));
const contiene = (valor, q) => String(valor || "").toLowerCase().includes(q.trim().toLowerCase());

function itemCumple(it, f) {
  if (f.texto && !contiene(it.descripcion, f.texto)) return false;
  if (f.tipoArticulo && idDe(it.tipoArticulo) !== f.tipoArticulo) return false;
  if (f.centroCosto && idDe(it.centroCosto) !== f.centroCosto) return false;
  return true;
}

export function filtrarOCPs(ocps, f) {
  const filtraItems = f.texto || f.tipoArticulo || f.centroCosto;
  return ocps.filter((o) => {
    if (f.codigo && !contiene(o.codigo, f.codigo)) return false;
    if (f.proveedor && idDe(o.proveedor) !== f.proveedor) return false;
    if (f.estado === "vigente" && o.anulada) return false;
    if (f.estado === "anulada" && !o.anulada) return false;
    if (f.desde && fechaLima(o.fecha) < f.desde) return false;
    if (f.hasta && fechaLima(o.fecha) > f.hasta) return false;
    if (filtraItems && !o.items.some((it) => itemCumple(it, f))) return false;
    return true;
  });
}

export function aplanarItemsOCP(ocps, f) {
  return filtrarOCPs(ocps, f).flatMap((ocp) => ocp.items.filter((it) => itemCumple(it, f)).map((it) => ({ ...it, ocp })));
}

// Fila de tareas por clave: los cambios seguidos a líneas de una misma SC esperan
// al anterior (cada uno toma y suelta el bloqueo de la SC; en paralelo chocarían
// consigo mismos). Una tarea que falla no detiene a las siguientes.
export function crearFila() {
  const colas = new Map();
  return (clave, tarea) => {
    const siguiente = (colas.get(clave) || Promise.resolve()).then(tarea);
    colas.set(clave, siguiente.catch(() => {}));
    return siguiente;
  };
}
