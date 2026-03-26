const { app, BrowserWindow, Menu, protocol, net, dialog, Notification } = require("electron");
const path = require("path");
const fs = require("fs");
const { pathToFileURL } = require("url");

const isDev = process.env.NODE_ENV === "development";

function resolveNotificationIcon() {
  const candidates = [
    path.join(process.resourcesPath || "", "assets", "icon.ico"),
    path.join(app.getAppPath(), "assets", "icon.ico"),
    app.getPath("exe"),
  ].filter(Boolean);
  return candidates.find((p) => {
    try {
      return fs.existsSync(p);
    } catch (_) {
      return false;
    }
  });
}

// One running instance on Windows: avoids two Electron processes during NSIS upgrade.
if (!isDev && process.platform === "win32") {
  const gotLock = app.requestSingleInstanceLock();
  if (!gotLock) {
    app.quit();
    process.exit(0);
  }
  app.on("second-instance", () => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
}

function setupAutoUpdater() {
  if (isDev || !app.isPackaged) return;
  try {
    const { autoUpdater } = require("electron-updater");
    autoUpdater.logger = {
      info: (m) => log(`[updater] ${typeof m === "string" ? m : JSON.stringify(m)}`),
      warn: (m) => log(`[updater] ${typeof m === "string" ? m : JSON.stringify(m)}`),
      error: (m) => log(`[updater] ${typeof m === "string" ? m : JSON.stringify(m)}`),
      debug: (m) => log(`[updater] ${typeof m === "string" ? m : JSON.stringify(m)}`),
    };
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    // Explicit for Windows silent installs: relaunch app after installer completes.
    autoUpdater.autoRunAppAfterInstall = true;

    let installRequested = false;

    const requestInstallNow = () => {
      installRequested = true;
      log("[updater] user accepted update install");

      // Ensure renderers release file locks before NSIS starts uninstall/install.
      for (const win of BrowserWindow.getAllWindows()) {
        try {
          win.removeAllListeners("close");
          win.destroy();
        } catch (_) {}
      }

      try {
        // Use interactive install so Windows can show update progress UI.
        // isForceRunAfter is only relevant for silent mode, but we keep it
        // for compatibility if mode toggles again in the future.
        autoUpdater.quitAndInstall(false, true);
      } catch (e) {
        log(`quitAndInstall failed: ${e?.message || e}`);
        // Fallback path: app quit still applies update because autoInstallOnAppQuit=true.
        app.quit();
      }
    };

    autoUpdater.on("update-downloaded", () => {
      log("[updater] update-downloaded");
      if (Notification.isSupported()) {
        const icon = resolveNotificationIcon();
        const note = new Notification({
          title: "Update ready",
          body: "A new version was downloaded. Click to restart and install.",
          icon,
          silent: false,
        });
        note.on("click", requestInstallNow);
        note.show();
        return;
      }

      dialog
        .showMessageBox({
          type: "info",
          title: "Update ready",
          message: "A new version was downloaded. Restart now to install? The app will close first.",
          buttons: ["Restart and install", "Later"],
          defaultId: 0,
          cancelId: 1,
        })
        .then(({ response }) => {
          if (response === 0) requestInstallNow();
        });
    });

    app.on("before-quit", () => {
      if (installRequested) {
        log("[updater] before-quit for update install");
      }
    });

    let lastCheckAt = 0;
    const markAndCheck = () => {
      lastCheckAt = Date.now();
      void autoUpdater.checkForUpdates();
    };

    // 1) On startup (each app launch)
    markAndCheck();

    // 2) While running: every 6 hours
    const periodicMs = 1 * 60 * 60 * 1000;
    setInterval(markAndCheck, periodicMs);

    // 3) When user brings the app back to foreground (throttled: at most once per 30 min)
    const minFocusGapMs = 30 * 60 * 1000;
    app.on("browser-window-focus", () => {
      if (Date.now() - lastCheckAt < minFocusGapMs) return;
      log("[updater] check (window focus)");
      markAndCheck();
    });
  } catch (e) {
    log(`autoUpdater failed: ${e?.message || e}`);
  }
}

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

  // NSIS close-app uses PRODUCT_NAME (package.json → build.productName). The window title must
  // match that string, not a URL — otherwise the installer cannot find/close the running app.
  // Keep in sync with app/package.json "build.productName".
  const windowTitle = isDev ? "http://www.hyperlinks.space/" : "Hyperlinks Space App";

  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    title: windowTitle,
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
    mainWindow.setTitle(windowTitle);
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
  if (process.platform === "win32") {
    app.setAppUserModelId("com.sraibaby.app");
  }
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
  setupAutoUpdater();
});

app.on("window-all-closed", () => {
  app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
