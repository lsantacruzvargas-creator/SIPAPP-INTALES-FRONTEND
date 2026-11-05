const { app, BrowserWindow, dialog } = require("electron");
const { autoUpdater } = require("electron-updater");
const path = require("path");

autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;

const LOGIN_URL = "https://intales-sac.com/#/login";
// La app suele quedar abierta toda la jornada: sin re-chequeo solo se
// enteraría de una versión nueva al reiniciar.
const INTERVALO_CHEQUEO_MS = 4 * 60 * 60 * 1000;
const TITULO = `SIPAPP Intales v${app.getVersion()}`;

let mainWindow;

// Los diálogos nativos a veces no devuelven el foco al BrowserWindow y el
// formulario queda "congelado" (bug confirmado en SIPAPP-HUAQUIAN).
function devolverFoco() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.focus();
  mainWindow.webContents.focus();
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    title: TITULO,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  const isDev = !app.isPackaged;
  const startUrl = isDev ? "http://localhost:5173" : LOGIN_URL;

  // offline.html existía en el proyecto pero nunca se cargaba desde acá — si
  // el servidor no respondía (o, en producción, si LOGIN_URL todavía no
  // resuelve — ver el TODO de arriba) Electron mostraba su página de error
  // de red por defecto en vez de esta pantalla. -3 = ERR_ABORTED: se dispara
  // en navegaciones canceladas normales (cerrar la ventana, un redirect
  // intencional), no es un fallo real de conexión — se ignora.
  mainWindow.webContents.on("did-fail-load", (event, errorCode, errorDescription, validatedURL) => {
    if (errorCode === -3) return;
    mainWindow.loadFile(path.join(__dirname, "offline.html"), {
      query: { retry: validatedURL || startUrl },
    });
  });

  // El <title> de la web pisaría el título con la versión instalada.
  mainWindow.on("page-title-updated", (e) => e.preventDefault());

  mainWindow.loadURL(startUrl);

  // Cerrar sesión al cerrar la ventana. El JWT/usuario ya viven en
  // sessionStorage (se borra solo al destruirse el proceso), pero esto queda
  // como respaldo explícito — y limpia cualquier token viejo que haya
  // quedado en localStorage de una versión anterior de la app. Hay que
  // esperar a que el script termine ANTES de destruir la ventana: si no,
  // executeJavaScript queda corriendo en segundo plano y el proceso se
  // destruye antes de que el borrado realmente ocurra.
  let cerrandoConLimpieza = false;
  mainWindow.on("close", (e) => {
    if (cerrandoConLimpieza) return;
    e.preventDefault();
    mainWindow.webContents
      .executeJavaScript("sessionStorage.clear(); localStorage.removeItem('token'); localStorage.removeItem('usuario');")
      .catch(() => {})
      .finally(() => {
        cerrandoConLimpieza = true;
        mainWindow.close();
      });
  });
}

app.whenReady().then(() => {
  createWindow();
  if (app.isPackaged) {
    autoUpdater.checkForUpdates().catch(() => {});
    setInterval(() => autoUpdater.checkForUpdates().catch(() => {}), INTERVALO_CHEQUEO_MS);
  }
});

let avisoMostrado = false;
autoUpdater.on("update-downloaded", (info) => {
  if (avisoMostrado) return;
  avisoMostrado = true;
  dialog.showMessageBox(mainWindow, {
    type: "info",
    title: "Actualización lista",
    message: `La versión ${info.version} ya se descargó (tienes la ${app.getVersion()}).\n¿Reiniciar ahora para instalarla? Si eliges "Al cerrar", se instalará la próxima vez que cierres la aplicación.`,
    buttons: ["Reiniciar ahora", "Al cerrar"],
    defaultId: 0,
    cancelId: 1,
  }).then(({ response }) => {
    if (response === 0) autoUpdater.quitAndInstall();
    else devolverFoco();
  });
});

autoUpdater.on("error", (err) => {
  console.error("Auto-updater:", err.message);
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
