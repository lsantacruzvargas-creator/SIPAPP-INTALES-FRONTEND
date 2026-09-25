const OPCIONES = [
  "Factura a 30 días",
  "Factura a 60 días",
  "Factura a 90 días",
  "Factura a 120 días",
  "30% de adelanto",
  "Piezas por consignación",
];
const OTRO = "__otro__";

// Select con las formas de pago habituales; "Otro…" abre un input para
// escribir libremente, así el campo sigue siendo editable (también cuando
// una cotización antigua trae un valor que no está en la lista).
export default function SelectFormaPago({ name, value, onChange, className }) {
  const esOtro = !!value && !OPCIONES.includes(value);
  const emitir = (v) => onChange({ target: { name, value: v } });

  return (
    <div className="space-y-2">
      <select
        value={esOtro ? OTRO : value}
        onChange={(e) => emitir(e.target.value === OTRO ? " " : e.target.value)}
        className={className}
      >
        {OPCIONES.map((o) => <option key={o} value={o}>{o}</option>)}
        <option value={OTRO}>Otro…</option>
      </select>
      {esOtro && (
        <input
          value={value}
          onChange={(e) => emitir(e.target.value)}
          placeholder="Escribe la forma de pago"
          className={className}
          autoFocus
        />
      )}
    </div>
  );
}
