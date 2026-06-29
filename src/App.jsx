import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import { getToken, getUsuario } from "./utils/fetchAuth.js";
import Login from "./components/Login.jsx";
import Dashboard from "./components/Dashboard.jsx";
import TablaOTs from "./components/TablaOTs.jsx";
import FormOT from "./components/FormOT.jsx";
import DetalleOT from "./components/DetalleOT.jsx";
import TablaClientes from "./components/TablaClientes.jsx";
import GestionUsuarios from "./components/GestionUsuarios.jsx";
import TablaCotizaciones from "./components/TablaCotizaciones.jsx";
import TablaOrdenesCompra from "./components/TablaOrdenesCompra.jsx";
import TablaFacturas from "./components/TablaFacturas.jsx";
import Navbar from "./components/Navbar.jsx";

function Protegida({ children, rolesPermitidos }) {
  const token = getToken();
  const usuario = getUsuario();
  if (!token) return <Navigate to="/login" replace />;
  if (rolesPermitidos && !rolesPermitidos.includes(usuario?.rol)) return <Navigate to="/ots" replace />;
  return children;
}

function Layout({ children }) {
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1">{children}</main>
    </div>
  );
}

const COMERCIAL = ["admin", "ejecutivo", "encargado"];

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/login" element={<Login />} />

        <Route path="/dashboard" element={
          <Protegida rolesPermitidos={COMERCIAL}>
            <Layout><Dashboard /></Layout>
          </Protegida>
        } />

        <Route path="/ots" element={
          <Protegida>
            <Layout><TablaOTs /></Layout>
          </Protegida>
        } />

        <Route path="/ots/nueva/:tipo" element={
          <Protegida rolesPermitidos={["admin", "ejecutivo"]}>
            <Layout><FormOT /></Layout>
          </Protegida>
        } />

        <Route path="/ots/editar" element={
          <Protegida rolesPermitidos={["admin", "ejecutivo"]}>
            <Layout><FormOT /></Layout>
          </Protegida>
        } />

        <Route path="/ots/:id" element={
          <Protegida>
            <Layout><DetalleOT /></Layout>
          </Protegida>
        } />

        <Route path="/clientes" element={
          <Protegida rolesPermitidos={COMERCIAL}>
            <Layout><TablaClientes /></Layout>
          </Protegida>
        } />

        <Route path="/cotizaciones" element={
          <Protegida rolesPermitidos={COMERCIAL}>
            <Layout><TablaCotizaciones /></Layout>
          </Protegida>
        } />

        <Route path="/ordenes-compra" element={
          <Protegida rolesPermitidos={COMERCIAL}>
            <Layout><TablaOrdenesCompra /></Layout>
          </Protegida>
        } />

        <Route path="/facturas" element={
          <Protegida rolesPermitidos={COMERCIAL}>
            <Layout><TablaFacturas /></Layout>
          </Protegida>
        } />

        <Route path="/usuarios" element={
          <Protegida rolesPermitidos={["admin"]}>
            <Layout><GestionUsuarios /></Layout>
          </Protegida>
        } />

        <Route path="/" element={<Navigate to="/ots" replace />} />
        <Route path="*" element={<Navigate to="/ots" replace />} />
      </Routes>
    </HashRouter>
  );
}
