export default function SelectorTipoOT({ onSelect, onClose }) {
  const tipos = [
    {
      id: "cotizado",
      label: "Cotizado",
      desc: "Visita o planos → cotización → OC del cliente",
      icon: "📋",
      color: "border-blue-400 bg-blue-50 hover:bg-blue-100",
      badge: "text-blue-700",
    },
    {
      id: "emergencia",
      label: "Emergencia",
      desc: "Sin cotización previa · entrega en horas/días",
      icon: "⚠️",
      color: "border-orange-400 bg-orange-50 hover:bg-orange-100",
      badge: "text-orange-700",
    },
    {
      id: "trato_directo",
      label: "Trato directo",
      desc: "Acuerdo verbal · precio fijado a palabra, sin OC",
      icon: "🤝",
      color: "border-green-400 bg-green-50 hover:bg-green-100",
      badge: "text-green-700",
    },
  ];

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
        <div className="flex justify-between items-center mb-5">
          <div>
            <h2 className="text-lg font-bold text-gray-800">Nueva OT</h2>
            <p className="text-sm text-gray-500">¿Cómo llegó este trabajo?</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
        </div>

        <div className="space-y-3">
          {tipos.map((t) => (
            <button
              key={t.id}
              onClick={() => onSelect(t.id)}
              className={`w-full text-left border-2 rounded-xl p-4 transition-all ${t.color}`}
            >
              <div className="flex items-start gap-3">
                <span className="text-2xl">{t.icon}</span>
                <div>
                  <p className={`font-bold text-base ${t.badge}`}>{t.label}</p>
                  <p className="text-gray-600 text-sm mt-0.5">{t.desc}</p>
                </div>
              </div>
            </button>
          ))}
        </div>

        <p className="text-xs text-center text-gray-400 mt-4">
          El formulario siguiente se ajusta según tu elección
        </p>
      </div>
    </div>
  );
}
