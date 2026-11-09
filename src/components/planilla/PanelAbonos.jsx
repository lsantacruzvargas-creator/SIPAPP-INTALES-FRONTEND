import { useState, useEffect, useCallback } from "react";
import { fetchAuth } from "../../utils/fetchAuth";
import { money, idDe } from "../../utils/compras";
import { tiposNuevoLote, TIPOS, ESTADOS } from "../../utils/abonos";
import TablaScroll from "../TablaScroll";
import ModalLoteAbono from "./ModalLoteAbono";

const fechaCorta = (f) => String(f || "").split("-").reverse().join("/");

// Sección «Abonos al banco» de Planilla del mes. `lotes` llega de la carga de la planilla; `onCambio` la vuelve a pedir.
export default function PanelAbonos({ periodo, lotes, error, puedeEscribir, onCambio }) {
  const [abierto, setAbierto] = useState(null); // { loteId } | { nuevo }

  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="text-sm font-semibold text-gray-700">Abonos al banco</h3>
        <div className="flex-1" />
        {puedeEscribir && !error && (
          <button onClick={() => setAbierto({ nuevo: { periodo, tipos: tiposNuevoLote(periodo) } })}
            className="border border-purple-300 text-purple-700 px-3 py-1.5 rounded-lg text-sm hover:bg-purple-50">Nuevo lote</button>
        )}
      </div>
      <TablaScroll>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-gray-500 border-b">
              <th className="py-2 pr-3">Lote</th><th className="py-2 pr-3">Tipo</th><th className="py-2 pr-3">Fecha de pago</th>
              <th className="py-2 pr-3">Banco</th><th className="py-2 pr-3 text-right">Total</th><th className="py-2 pr-3">Estado</th><th className="py-2" />
            </tr>
          </thead>
          <tbody>
            {(lotes || []).map((l) => (
              <tr key={l._id} className={`border-b border-gray-100 ${l.estado === "anulado" ? "text-gray-400" : ""}`}>
                <td className="py-1.5 pr-3">{l.codigo}<span className="block text-xs text-gray-400">{l.filas} {l.filas === 1 ? "trabajador" : "trabajadores"}</span></td>
                <td className="py-1.5 pr-3">{TIPOS[l.tipo]}</td>
                <td className="py-1.5 pr-3 tabular-nums">{fechaCorta(l.fecha)}</td>
                <td className="py-1.5 pr-3">{l.cuentaCargo?.nombre}</td>
                <td className="py-1.5 pr-3 text-right tabular-nums">{money(l.totales?.total)}</td>
                <td className="py-1.5 pr-3"><span className={`text-xs px-2 py-0.5 rounded-full ${ESTADOS[l.estado].clase}`}>{ESTADOS[l.estado].texto}</span></td>
                <td className="py-1.5 text-right"><button onClick={() => setAbierto({ loteId: l._id })} className="text-xs text-purple-600 hover:underline">{puedeEscribir && l.estado === "borrador" ? "Editar" : "Ver"}</button></td>
              </tr>
            ))}
            {lotes && lotes.length === 0 && <tr><td colSpan={7} className="py-4 text-center text-gray-400 text-sm">Aún no hay lotes de abono en este mes</td></tr>}
            {!lotes && !error && <tr><td colSpan={7} className="py-4 text-center text-gray-400 text-sm">Cargando…</td></tr>}
            {error && <tr><td colSpan={7} className="py-4 text-center text-red-600 text-sm">{error}</td></tr>}
          </tbody>
        </table>
      </TablaScroll>
      {abierto && <ModalLoteAbono key={abierto.loteId || "nuevo"} {...abierto} puedeEscribir={puedeEscribir} onClose={() => setAbierto(null)} onCambio={onCambio} />}
    </section>
  );
}

// En un depósito de CTS confirmado: sus lotes de abono y el botón para armar uno.
export function LotesDeDeposito({ deposito, puedeEscribir }) {
  const [lotes, setLotes] = useState(null);
  const [abierto, setAbierto] = useState(null);
  const [error, setError] = useState("");

  const cargar = useCallback(() => fetchAuth(`/planilla/abonos?periodo=${deposito.periodo}`).then(async (r) => {
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { setLotes(null); return setError(d.mensaje || "No se pudieron cargar los lotes de abono."); }
    setError("");
    setLotes((d.lotes || []).filter((l) => l.tipo === "cts" && idDe(l.deposito) === deposito._id));
  }).catch(() => { setLotes(null); setError("Error de conexión con el servidor."); }), [deposito._id, deposito.periodo]);
  useEffect(() => { const t = setTimeout(cargar, 0); return () => clearTimeout(t); }, [cargar]);

  const vivo = (lotes || []).some((l) => l.estado !== "anulado");
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
      {error && <span className="text-red-600">{error}</span>}
      {(lotes || []).length > 0 && <span>Lotes de abono:</span>}
      {(lotes || []).map((l) => (
        <button key={l._id} onClick={() => setAbierto({ loteId: l._id })} className={`underline ${l.estado === "anulado" ? "text-gray-400" : "text-purple-700"}`}>
          {l.codigo} ({ESTADOS[l.estado].texto.toLowerCase()})
        </button>
      ))}
      {puedeEscribir && lotes && !vivo && (
        <button onClick={() => setAbierto({ nuevo: { tipo: "cts", periodo: deposito.periodo, deposito: deposito._id, fecha: deposito.fechaDeposito || "" } })}
          className="border border-purple-300 text-purple-700 px-3 py-1.5 rounded-lg text-sm hover:bg-purple-50">Lote de abono</button>
      )}
      {abierto && <ModalLoteAbono key={abierto.loteId || "nuevo"} {...abierto} puedeEscribir={puedeEscribir} onClose={() => setAbierto(null)} onCambio={cargar} />}
    </div>
  );
}
