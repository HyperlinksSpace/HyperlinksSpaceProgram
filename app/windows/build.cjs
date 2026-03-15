const { app, BrowserWindow, Menu, protocol, net } = require("electron");
const path = require("path");
const fs = require("fs");
const { pathToFileURL } = require("url");

const isDev = process.env.NODE_ENV === "development";

protocol.registerSchemesAsPrivileged([
  { scheme: "app", privileges: { standard: true, supportFetchAPI: true } },
]);

function log(msg) {
  try {
    const logPath = path.join(app.getPath("userData"), "main.log");
    const line = `[${new Date().toISOString()}] ${msg}`;
    fs.appendFileSync(logPath, line + "\n");
    console.error(line);
  } catch (_) {}
}

function createWindow() {
  const appPath = app.getAppPath();
  const distPath = path.join(appPath, "dist");
  const iconPath = path.join(appPath, "assets", "icon.ico");
  const indexHtml = path.join(distPath, "index.html");

  if (!isDev && !fs.existsSync(indexHtml)) {
    log(`ERROR: index.html not found at ${indexHtml}`);
    log(`appPath=${appPath}`);
    return;
  }

  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    title: "http://www.hyperlinks.space/",
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
    show: false,
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });

  mainWindow.webContents.on("page-title-updated", (e) => {
    e.preventDefault();
    mainWindow.setTitle("http://www.hyperlinks.space/");
  });

  mainWindow.webContents.on("did-fail-load", (_event, code, errMsg, url) => {
    log(`did-fail-load: code=${code} ${errMsg} ${url}`);
  });

  mainWindow.webContents.on("did-start-loading", (_, url) => {
    if (!isDev && url && (url.endsWith("/index.html") || url.includes("/index.html"))) {
      const root = url.replace(/\/index\.html.*$/, "/");
      if (root !== url) {
        mainWindow.loadURL(root);
      }
    }
  });

  if (isDev) {
    mainWindow.loadURL("http://localhost:8081");
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadURL("app://./");
  }

  mainWindow.on("closed", () => {
    app.quit();
  });
}

process.on("uncaughtException", (err) => {
  try {
    log(`uncaughtException: ${err.message}\n${err.stack}`);
  } catch (_) {}
});

app.whenReady().then(() => {
  Menu.setApplicationMenu(null); // We can enable standart app menu by deteng this line
  if (!isDev) {
    const appPath = app.getAppPath();
    const distPath = path.join(appPath, "dist");
    protocol.handle("app", (request) => {
      let urlPath = request.url.slice("app://".length).replace(/^\.?\//, "") || "index.html";
      const filePath = path.join(distPath, urlPath);
      const resolved = path.normalize(filePath);
      if (!resolved.startsWith(path.normalize(distPath)) || !fs.existsSync(resolved)) {
        return new Response("Not Found", { status: 404 });
      }
      return net.fetch(pathToFileURL(resolved).toString());
    });
  }
  createWindow();
});

app.on("window-all-closed", () => {
  app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
