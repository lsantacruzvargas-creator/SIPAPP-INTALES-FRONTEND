// Toda fecha/hora que se muestra en la UI debe leerse en hora de Perú
// (America/Lima, UTC-5, sin horario de verano) — sin esto, toLocaleDateString/
// toLocaleString usan el huso horario del sistema operativo del navegador, que
// puede no coincidir con Lima (ver Backend/src/utils/fechaEmisionLima.js, que
// ya resolvió el mismo problema del lado del servidor para comprobantes/guías).
const TZ = "America/Lima";

// Un campo de solo fecha guardado desde un "YYYY-MM-DD" (cotizaciones, OT, OC, comprobantes electrónicos) queda a
// medianoche UTC exacta: es un día de calendario y se lee en UTC (en Lima caería en el día anterior). Todo lo demás
// es un instante y se lee en hora de Lima.
const zonaDe = (d) => (d.getTime() % 86400000 === 0 ? "UTC" : TZ);

export const formatearFecha = (fecha, opts) => {
  const d = new Date(fecha);
  return d.toLocaleDateString("es-PE", { timeZone: zonaDe(d), ...opts });
};

// "YYYY-MM-DD" del día de `fecha` en Lima ("" si no es una fecha): para precargar un <input type="date"> y para
// comparar o filtrar por día, mes o año. Nunca `toISOString()` ni `getFullYear()`/`getMonth()`: usan UTC o el huso
// del equipo.
export const aInputFecha = (fecha) => {
  const d = new Date(fecha);
  return fecha && !Number.isNaN(d.getTime()) ? new Intl.DateTimeFormat("en-CA", { timeZone: zonaDe(d) }).format(d) : "";
};
export const anioLima = (fecha) => Number(aInputFecha(fecha).slice(0, 4)) || NaN;
export const mesLima = (fecha) => Number(aInputFecha(fecha).slice(5, 7)) || NaN;

export const formatearFechaHora = (fecha, opts) =>
  new Date(fecha).toLocaleString("es-PE", { timeZone: TZ, ...opts });

// "YYYY-MM-DD" del día calendario ACTUAL en Lima — para precargar un
// <input type="date"> con el día correcto (`new Date().toISOString().slice(0,10)`
// usa UTC: entre las 19:00 y 23:59 hora Lima ya muestra el día siguiente, mismo
// bug que ya se documentó y resolvió en Backend/src/utils/fechaEmisionLima.js).
export const fechaHoyLima = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
