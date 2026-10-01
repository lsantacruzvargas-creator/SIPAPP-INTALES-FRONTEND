import { useEffect, useState } from "react";
import { fetchAuth } from "../utils/fetchAuth";
import { fechaHoyLima, formatearFecha } from "../utils/fecha";

// "S/ | US$" + "Tipo de cambio al: [fecha]". En US$ pide el TC venta SUNAT de esa
// fecha (el backend lo saca de su histórico o lo consulta una sola vez). Si falla,
// avisa y la pantalla sigue en soles.
const FECHA_MINIMA = "2000-01-01";

export default function SelectorMonedaTC({ moneda, fecha, onCambio }) {
  const [info, setInfo] = useState("");
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    let vigente = true;
    fetchAuth(`/sunat/tipo-cambio?fecha=${fecha}`)
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!vigente) return;
        if (!r.ok) { setInfo(d.mensaje || "No se pudo obtener el tipo de cambio"); onCambio({ moneda, fecha, tc: null, error: true }); return; }
        const origen = d.fuente === "vigente" ? "TC vigente del sistema"
          : `${d.fuente === "respaldo" ? "último guardado" : "SUNAT"}, ${formatearFecha(`${d.fecha}T12:00:00-05:00`)}`;
        setInfo(`TC venta ${d.venta} (${origen})`);
        onCambio({ moneda, fecha, tc: d.venta, error: false });
      })
      .catch(() => { if (vigente) { setInfo("Sin conexión con el servidor"); onCambio({ moneda, fecha, tc: null, error: true }); } })
      .finally(() => { if (vigente) setCargando(false); });
    return () => { vigente = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onCambio cambia en cada render del padre
  }, [moneda, fecha]);

  const elegir = (m) => { if (m === moneda) return; setCargando(true); onCambio({ moneda: m, fecha, tc: null, error: false }); };
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <div className="inline-flex rounded-lg border border-gray-200 overflow-hidden">
        {["PEN", "USD"].map((m) => (
          <button key={m} type="button" onClick={() => elegir(m)}
            className={`px-3 py-1 font-semibold ${moneda === m ? "bg-gray-900 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}>
            {m === "PEN" ? "S/" : "US$"}
          </button>
        ))}
      </div>
      <label className="text-gray-500">Tipo de cambio al</label>
      <input type="date" value={fecha} max={fechaHoyLima()}
        onChange={(e) => {
          // Mientras se teclea el año llegan fechas vacías o como 0002-…: no se consultan.
          const f = e.target.value;
          if (!f || f < FECHA_MINIMA) return;
          setCargando(true);
          onCambio({ moneda, fecha: f, tc: null, error: false });
        }}
        className="border border-gray-200 rounded-lg px-2 py-1" />
      <span className={info.startsWith("TC") ? "text-gray-400" : "text-red-500"}>{cargando ? "Consultando…" : info}</span>
    </div>
  );
}
