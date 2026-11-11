import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter } from "react-router-dom";
import "./index.css";
import App from "./App.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>
);

// La rueda del mouse sobre un input numérico enfocado cambia su valor (montos,
// cantidades) sin que el usuario lo note. Se resuelve una vez para toda la app
// en vez de un onWheel por input: perder el foco anula ese cambio.
document.addEventListener("wheel", (e) => {
  const el = document.activeElement;
  if (el === e.target && el.tagName === "INPUT" && el.type === "number") el.blur();
}, { passive: true, capture: true });

// Requisito de Chrome/Android para considerar el sitio instalable como app
// (ver public/sw.js) — no aplica dentro del wrapper de Electron.
if ("serviceWorker" in navigator && !navigator.userAgent.toLowerCase().includes("electron")) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}
