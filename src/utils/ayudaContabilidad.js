// Ayuda de la pantalla Contabilidad: qué es cada pestaña y qué significa cada término que aparece en ella.
// Lenguaje para usuarios que no son contadores. Una sección por pestaña (mismas claves que Contabilidad.jsx).
import { sinTildes } from "./contabilidad.js";

export const AYUDA = {
  general: {
    titulo: "Conceptos básicos",
    descripcion: "INTALES arma los asientos contables de lo que se registra en el sistema y los envía al software del contador (CONCAR). Los libros oficiales los lleva el contador.",
    terminos: [
      { termino: "Asiento", definicion: "Registro contable de una operación: una o más líneas al Debe y al Haber que suman lo mismo. Ejemplo: una compra va al Debe (gasto e IGV) y al Haber (lo que se le debe al proveedor)." },
      { termino: "Debe y Haber", definicion: "Las dos columnas de un asiento. Un asiento está bien cuando el total del Debe es igual al del Haber (cuadra)." },
      { termino: "Cuenta contable", definicion: "Código del plan de cuentas donde se anota cada importe (por ejemplo 4212 = facturas por pagar a proveedores, 1041 = cuentas corrientes del banco)." },
      { termino: "PCGE 2019", definicion: "Plan Contable General Empresarial: la lista oficial de cuentas en el Perú. INTALES usa la versión 2019, la misma que el contador." },
      { termino: "Periodo", definicion: "Mes contable, escrito AAAAMM (por ejemplo 202609 = setiembre de 2026). Cada asiento pertenece al mes de su fecha (hora de Lima)." },
      { termino: "Subdiario", definicion: "Grupo de asientos por tipo de operación: Compras, Ventas, Caja y bancos, Diario (manuales), Apertura, Cierre y Ajuste." },
      { termino: "CUO", definicion: "Código Único de Operación: identifica cada asiento contabilizado (periodo, subdiario y correlativo, por ejemplo 202609-COMPRAS-000001)." },
      { termino: "Tercero", definicion: "El proveedor, cliente o persona del asiento, identificado por su RUC o DNI." },
      { termino: "Centro de costo", definicion: "Área o actividad a la que se carga un gasto (por ejemplo Taller). Sirve para saber cuánto cuesta cada área." },
      { termino: "Tipo de cambio (TC)", definicion: "Soles por dólar. Las operaciones en dólares se registran en dólares (ME, moneda extranjera) y en soles con su tipo de cambio." },
      { termino: "Solo lectura", definicion: "Jefatura y tesorero ven Contabilidad; el contador y el administrador la modifican. El tesorero además genera y contabiliza asientos y cierra el mes." },
    ],
  },
  asientos: {
    titulo: "Asientos",
    descripcion: "Todos los asientos: los automáticos (de compras, ventas y Tesorería) y los manuales. Aquí se filtran, se ven en detalle, se crean asientos manuales y se anulan.",
    terminos: [
      { termino: "Asiento manual", definicion: "El que escribe el contador o el administrador (subdiarios Diario, Apertura, Ajuste o Cierre). Sirve, por ejemplo, para corregir un asiento ya exportado." },
      { termino: "Automático", definicion: "Asiento armado por INTALES desde un documento (compra, venta, cobro, pago, movimiento de banco o gasto de caja chica). Es la base: el contador o el administrador lo completan con «Editar» (más cuentas, otra distribución). La fecha, la moneda y el tipo de cambio son los del documento." },
      { termino: "Editado a mano", definicion: "Automático que alguien completó. «Generar asientos del mes» ya no lo reescribe; si su documento cambia después, se marca para revisarlo. Mientras sea borrador se puede descartar lo editado y volver al generado." },
      { termino: "Estado: Borrador", definicion: "Asiento automático todavía en revisión: aún no tiene número ni CUO definitivo. Se regenera si su documento cambia, salvo que se haya editado a mano." },
      { termino: "Estado: Contabilizado", definicion: "Asiento confirmado, con correlativo y CUO. Ya no cambia aunque cambie su documento (se marca para revisarlo)." },
      { termino: "Estado: Anulado", definicion: "Asiento dejado sin efecto, con motivo. No suma en reportes. Un automático anulado se vuelve a generar desde su documento." },
      { termino: "Exportado", definicion: "Asiento ya enviado a CONCAR. No se anula: se corrige con un asiento manual de ajuste." },
      { termino: "Documento cambiado / anulado", definicion: "El documento de un asiento contabilizado cambió o se anuló después. Hay que anular el asiento y volver a generar el mes, o (si ya se exportó) registrar un ajuste y darlo por resuelto." },
      { termino: "Anular", definicion: "Deja sin efecto un asiento contabilizado y no exportado, con motivo. No se puede en un mes cerrado." },
      { termino: "Exportar Excel", definicion: "Descarga la lista filtrada de asientos con todas sus líneas (para revisar; no es el archivo para CONCAR)." },
    ],
  },
  automaticos: {
    titulo: "Automáticos",
    descripcion: "Generar los asientos del mes a partir de compras, ventas y Tesorería, completar lo que falta y contabilizarlos.",
    terminos: [
      { termino: "Generar asientos del mes", definicion: "Crea o actualiza los borradores de todo lo registrado en el mes. Se puede repetir sin duplicar nada: solo cambia lo que cambió." },
      { termino: "Pendientes", definicion: "Documentos que no tienen asiento porque falta un dato (por ejemplo la cuenta de gasto de una compra, la cuenta contable de un banco o la respuesta de SUNAT). INTALES no inventa cuentas." },
      { termino: "Asignar cuenta", definicion: "Elige la cuenta de gasto (compras: clases 2, 3 o 6) o de ingreso (ventas: clase 7) de un comprobante pendiente." },
      { termino: "Borradores", definicion: "Asientos generados que esperan ser contabilizados. Revise sus cuentas antes de contabilizar." },
      { termino: "Contabilizar", definicion: "Confirma los borradores: reciben su correlativo y CUO definitivos. Los que no cuadran o usan una cuenta inválida se informan y no se contabilizan." },
      { termino: "Observados", definicion: "Contabilizados cuyo documento cambió o se anuló después. Si no se exportaron, anúlelos y genere de nuevo; si ya se exportaron, registre un ajuste y use «Dar por resuelto»." },
      { termino: "Creados / actualizados / sin cambios / quitados / marcados", definicion: "Resultado de la generación: borradores nuevos, borradores que cambiaron, los que siguen igual, borradores eliminados porque su documento se anuló, y contabilizados marcados como observados." },
      { termino: "Diferencia de cambio", definicion: "En cobros y pagos en dólares, la diferencia entre el tipo de cambio del documento y el del día del pago. Va a 676 (pérdida) o 776 (ganancia)." },
      { termino: "Diferencia de cambio al cierre", definicion: "Ajuste de fin de mes de lo que sigue en dólares (por cobrar, por pagar y bancos) al tipo de cambio SUNAT del último día: compra para lo que se tiene o se cobra, venta para lo que se debe. Se genera con los asientos del mes ya contabilizados y queda como borrador en el subdiario Ajuste; se puede repetir, solo agrega lo que falte." },
      { termino: "Detracción", definicion: "Parte del pago que se deposita en la cuenta del Banco de la Nación del proveedor. En el asiento de compra se separa lo detraído en su cuenta." },
    ],
  },
  concar: {
    titulo: "Exportar CONCAR",
    descripcion: "Genera el Excel que el contador importa en CONCAR con los asientos contabilizados del mes.",
    terminos: [
      { termino: "CONCAR", definicion: "Software contable del contador. Recibe los asientos de INTALES en su plantilla de importación (Excel de 41 columnas, hoja CONCAR)." },
      { termino: "Solo los no exportados", definicion: "Exporta solo lo que no salió en una exportación anterior. Sin marcar, exporta todo el mes de nuevo con los mismos números." },
      { termino: "Número de comprobante (MMNNNN)", definicion: "Número del asiento en CONCAR: mes (2 dígitos) y correlativo por subdiario (4 dígitos), por ejemplo 090001." },
      { termino: "N.º inicial del subdiario", definicion: "Para continuar la numeración que ya tiene el contador en CONCAR. Vacío: sigue desde el último exportado del mes." },
      { termino: "Subdiario CONCAR", definicion: "Código del subdiario en CONCAR (por ejemplo 11 compras, 05 ventas, 21 caja y bancos). Se configura en Configuración." },
      { termino: "Exportación (EXP-00001)", definicion: "Cada exportación queda registrada con sus asientos y se puede volver a descargar exactamente igual." },
      { termino: "Anexo", definicion: "En CONCAR, el código del proveedor o cliente (INTALES pone su RUC o DNI). Debe existir en el maestro de anexos de CONCAR." },
    ],
  },
  cierre: {
    titulo: "Cierre de mes",
    descripcion: "Cuando todo el mes está generado, contabilizado y exportado, el tesorero lo cierra: desde ahí no se registra nada con fecha de ese mes.",
    terminos: [
      { termino: "Verificación", definicion: "Lista de lo que falta para cerrar: pendientes, documentos sin asiento, borradores, observados, asientos descuadrados o sin exportar." },
      { termino: "Cerrar el mes", definicion: "Solo el tesorero y solo meses ya terminados. Cerrado, no se registran ni anulan compras, pagos, cobros, movimientos de banco, gastos de caja chica, comprobantes electrónicos ni asientos con fecha de ese mes." },
      { termino: "Cerrándose", definicion: "Estado de unos segundos mientras se verifica el cierre: nada entra al mes. Si la verificación falla, vuelve a abierto." },
      { termino: "Reabrir el mes", definicion: "Solo el tesorero, con motivo (por ejemplo, llegó una factura tardía). Queda registrado quién lo había cerrado. Después se genera, exporta y cierra de nuevo." },
      { termino: "Asiento descuadrado", definicion: "Asiento cuyo Debe no es igual a su Haber. Impide el cierre." },
    ],
  },
  reportes: {
    titulo: "Reportes",
    descripcion: "Reportes de control con los asientos contabilizados, para cuadrar con lo que el contador importa. Los libros oficiales los lleva su software.",
    terminos: [
      { termino: "Balance de comprobación", definicion: "Por cuenta: saldo anterior, lo que se movió en el rango (Debe y Haber) y el saldo final (deudor o acreedor). Los totales del Debe y del Haber deben ser iguales." },
      { termino: "Nivel", definicion: "Agrupa las cuentas por sus primeros 2, 3 o 4 dígitos (por ejemplo 42 = todas las cuentas por pagar comerciales)." },
      { termino: "Saldo deudor / acreedor", definicion: "Saldo final de la cuenta: deudor si el Debe es mayor (activos y gastos), acreedor si el Haber es mayor (deudas, patrimonio e ingresos)." },
      { termino: "Libro Mayor", definicion: "Los movimientos de una cuenta (o de las que empiezan con un código) con su saldo después de cada uno. Se puede filtrar por centro de costo o por RUC." },
      { termino: "Saldo anterior", definicion: "Saldo antes del mes inicial. Las cuentas de gastos e ingresos (clases 6 a 9) empiezan cada año en cero." },
      { termino: "Libro Diario", definicion: "Todos los asientos del rango, en orden de fecha, con sus líneas." },
    ],
  },
  plan: {
    titulo: "Plan de cuentas",
    descripcion: "Las cuentas contables (PCGE 2019). Se puede importar el plan del contador desde Excel para que los códigos coincidan con los suyos.",
    terminos: [
      { termino: "Elemento", definicion: "Primer dígito de la cuenta: 1 activo disponible y exigible, 2 realizable, 3 inmovilizado, 4 pasivo, 5 patrimonio, 6 gastos, 7 ingresos, 8 saldos intermediarios, 9 contabilidad analítica." },
      { termino: "Cuenta de movimiento", definicion: "Cuenta del último nivel, la única que recibe asientos. Al crear una subcuenta, su cuenta madre pasa a ser de agrupación." },
      { termino: "Cuenta de agrupación", definicion: "Cuenta que solo suma a sus subcuentas; no recibe asientos directamente." },
      { termino: "Naturaleza", definicion: "Deudora (crece al Debe: activos y gastos) o acreedora (crece al Haber: pasivos, patrimonio e ingresos)." },
      { termino: "Exige tercero / centro de costo", definicion: "La cuenta solo acepta líneas con el RUC o DNI del tercero, o con un centro de costo." },
      { termino: "Destino", definicion: "Para gastos de la clase 6: cuentas 9x (al Debe) y 79 (al Haber) que reparten el gasto por función. Normalmente los genera CONCAR." },
      { termino: "Desactivar", definicion: "La cuenta deja de usarse en asientos nuevos, pero se conserva en los anteriores." },
    ],
  },
  configuracion: {
    titulo: "Configuración",
    descripcion: "Cuentas y códigos que usan los asientos automáticos y la exportación a CONCAR. Los cambia el contador o el administrador.",
    terminos: [
      { termino: "Cuentas de los asientos automáticos", definicion: "La cuenta de cada papel: proveedores, honorarios, clientes (en soles y en dólares), IGV, retención de 4.ª, detracción, diferencia de cambio y ventas." },
      { termino: "Compras por defecto", definicion: "Cuenta de gasto para compras sin cuenta propia. Vacía: cada comprobante necesita la suya (se asigna en Automáticos)." },
      { termino: "Venta por defecto", definicion: "Cuenta de ingreso de las ventas sin cuenta propia: servicios (70321), productos fabricados (70221) o mercaderías (70121)." },
      { termino: "Siglas (T.G. 06)", definicion: "Cómo llama CONCAR a cada tipo de comprobante: FT factura, RH recibo por honorarios, BV boleta, NC nota de crédito, ND nota de débito, TK ticket, RC recibo de servicios." },
      { termino: "Moneda MN / US", definicion: "Códigos de moneda de CONCAR para soles y dólares." },
      { termino: "Doc. de detracción, área y constancia pendiente", definicion: "Datos de la línea de detracción en CONCAR: tipo de documento (DR), código de área y el número que va mientras no exista la constancia de depósito." },
      { termino: "Códigos de detracción (T.G. 28)", definicion: "Equivalencia del código SUNAT del bien o servicio con el de CONCAR. Sin equivalencia, INTALES usa el de SUNAT seguido de 01." },
      { termino: "Cuentas con centro de costo", definicion: "Prefijos de las cuentas que llevan el centro de costo en la exportación (por defecto 62, 63 y 65)." },
      { termino: "Movimientos manuales", definicion: "Cuenta de la contrapartida de cada ingreso o egreso manual de Tesorería según su concepto (aporte, préstamo, retiro, gasto bancario, otros). Solo el gasto bancario viene con cuenta (6391); las demás las define el contador." },
      { termino: "Cuenta contable de cada caja y banco", definicion: "Cuenta de la clase 10 de cada cuenta de Tesorería (por ejemplo BCP Soles → 1041). Sin ella, sus movimientos quedan pendientes." },
      { termino: "Código contable del centro de costo", definicion: "Código del centro de costo en CONCAR (hasta 6 letras o dígitos)." },
    ],
  },
};

// Pestañas con su ayuda, en el orden de la pantalla, y al final los conceptos básicos.
export const ORDEN_AYUDA = ["asientos", "automaticos", "concar", "cierre", "reportes", "plan", "configuracion", "general"];

// Términos de todas las secciones que contienen `texto` (en el término o la definición, sin tildes ni mayúsculas).
export function buscarAyuda(texto) {
  const q = sinTildes(texto);
  if (!q) return [];
  return ORDEN_AYUDA.flatMap((clave) => AYUDA[clave].terminos
    .filter((t) => sinTildes(t.termino).includes(q) || sinTildes(t.definicion).includes(q))
    .map((t) => ({ ...t, seccion: AYUDA[clave].titulo })));
}
