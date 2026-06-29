import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { getUsuario, logout } from "../utils/fetchAuth.js";

const ROL_LABEL = { admin: "Admin", ejecutivo: "Ejecutivo", encargado: "Encargado", tecnico: "Técnico" };

export default function Navbar() {
  const navigate  = useNavigate();
  const location  = useLocation();
  const usuario   = getUsuario();
  const [menuOpen, setMenuOpen] = useState(false);

  const handleLogout = () => { logout(); navigate("/login"); };
  const active = (path) =>
    location.pathname.startsWith(path)
      ? "text-blue-600 border-b-2 border-blue-600"
      : "text-gray-500 hover:text-gray-800";

  const esTecnico = usuario?.rol === "tecnico";
  const esAdmin   = usuario?.rol === "admin";

  const ir = (path) => { navigate(path); setMenuOpen(false); };

  return (
    <nav className="bg-white border-b border-gray-100 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 flex items-center justify-between h-14">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => ir(esTecnico ? "/ots" : "/dashboard")}>
            <div className="w-7 h-7 bg-blue-700 rounded-lg flex items-center justify-center">
              <span className="text-white text-xs font-bold">I</span>
            </div>
            <span className="font-bold text-gray-800 text-sm hidden sm:block">INTALES</span>
          </div>

          <div className="hidden md:flex items-center gap-0">
            {!esTecnico && (
              <button onClick={() => ir("/dashboard")} className={`px-3 py-4 text-sm font-medium transition-colors ${active("/dashboard")}`}>
                Dashboard
              </button>
            )}
            <button onClick={() => ir("/ots")} className={`px-3 py-4 text-sm font-medium transition-colors ${active("/ots")}`}>
              OTs
            </button>
            {!esTecnico && (<>
              <button onClick={() => ir("/clientes")} className={`px-3 py-4 text-sm font-medium transition-colors ${active("/clientes")}`}>
                Clientes
              </button>
              <button onClick={() => ir("/cotizaciones")} className={`px-3 py-4 text-sm font-medium transition-colors ${active("/cotizaciones")}`}>
                Cotizaciones
              </button>
              <button onClick={() => ir("/ordenes-compra")} className={`px-3 py-4 text-sm font-medium transition-colors ${active("/ordenes-compra")}`}>
                OC
              </button>
              <button onClick={() => ir("/facturas")} className={`px-3 py-4 text-sm font-medium transition-colors ${active("/facturas")}`}>
                Facturas
              </button>
            </>)}
            {esAdmin && (
              <button onClick={() => ir("/usuarios")} className={`px-3 py-4 text-sm font-medium transition-colors ${active("/usuarios")}`}>
                Usuarios
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right hidden sm:block">
            <p className="text-xs font-semibold text-gray-700">{usuario?.nombre}</p>
            <p className="text-xs text-gray-400">{ROL_LABEL[usuario?.rol]}</p>
          </div>
          <button onClick={handleLogout} className="hidden md:block text-xs text-gray-400 hover:text-red-500 transition-colors px-2 py-1">
            Salir
          </button>
          <button onClick={() => setMenuOpen(!menuOpen)} className="md:hidden p-2 text-gray-500 hover:text-gray-800">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {menuOpen
                ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />}
            </svg>
          </button>
        </div>
      </div>

      {menuOpen && (
        <div className="md:hidden border-t border-gray-100 bg-white py-2 px-4 space-y-1">
          {!esTecnico && (
            <button onClick={() => ir("/dashboard")} className="block w-full text-left py-2 text-sm text-gray-600 hover:text-blue-600">Dashboard</button>
          )}
          <button onClick={() => ir("/ots")} className="block w-full text-left py-2 text-sm text-gray-600 hover:text-blue-600">OTs</button>
          {!esTecnico && (<>
            <button onClick={() => ir("/clientes")} className="block w-full text-left py-2 text-sm text-gray-600 hover:text-blue-600">Clientes</button>
            <button onClick={() => ir("/cotizaciones")} className="block w-full text-left py-2 text-sm text-gray-600 hover:text-blue-600">Cotizaciones</button>
            <button onClick={() => ir("/ordenes-compra")} className="block w-full text-left py-2 text-sm text-gray-600 hover:text-blue-600">Órdenes de compra</button>
            <button onClick={() => ir("/facturas")} className="block w-full text-left py-2 text-sm text-gray-600 hover:text-blue-600">Facturas</button>
          </>)}
          {esAdmin && (
            <button onClick={() => ir("/usuarios")} className="block w-full text-left py-2 text-sm text-gray-600 hover:text-blue-600">Usuarios</button>
          )}
          <button onClick={handleLogout} className="block w-full text-left py-2 text-sm text-red-400 hover:text-red-600">Cerrar sesión</button>
        </div>
      )}
    </nav>
  );
}
