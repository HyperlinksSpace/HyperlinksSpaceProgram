const { app, BrowserWindow, Menu, protocol, net, dialog, Notification } = require("electron");
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const { pathToFileURL } = require("url");

const isDev = process.env.NODE_ENV === "development";
const updaterMenuApi = {
  checkNow: null,
};

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
    let manualCheckInProgress = false;

    const showUpdateMessage = async (title, message) => {
      try {
        const win = BrowserWindow.getAllWindows()[0];
        await dialog.showMessageBox(win || null, { type: "info", title, message });
      } catch (_) {}
    };
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

    function scheduleRelaunchFallback() {
      try {
        const exePath = app.getPath("exe");
        // Interactive installer may not relaunch on some machines; schedule a delayed reopen.
        const relaunchCmd = `ping 127.0.0.1 -n 26 > nul && start "" "${exePath}"`;
        const child = spawn(process.env.ComSpec || "cmd.exe", ["/c", relaunchCmd], {
          detached: true,
          stdio: "ignore",
          windowsHide: true,
        });
        child.unref();
        log("[updater] scheduled relaunch fallback");
      } catch (e) {
        log(`[updater] relaunch fallback schedule failed: ${e?.message || e}`);
      }
    }

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
        // Interactive mode shows NSIS progress/update UI to the user.
        scheduleRelaunchFallback();
        autoUpdater.quitAndInstall(false, false);
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

    autoUpdater.on("checking-for-update", () => {
      if (manualCheckInProgress) {
        log("[updater] manual check started");
      }
    });

    autoUpdater.on("update-available", (info) => {
      if (manualCheckInProgress) {
        manualCheckInProgress = false;
        void showUpdateMessage(
          "Update found",
          `Version ${info?.version || "new"} is available and downloading in background.`
        );
      }
    });

    autoUpdater.on("update-not-available", () => {
      if (manualCheckInProgress) {
        manualCheckInProgress = false;
        void showUpdateMessage("No updates", "You are already on the latest version.");
      }
    });

    autoUpdater.on("error", (err) => {
      if (manualCheckInProgress) {
        manualCheckInProgress = false;
        void showUpdateMessage("Update check failed", err?.message || String(err));
      }
    });

    updaterMenuApi.checkNow = async () => {
      try {
        manualCheckInProgress = true;
        await autoUpdater.checkForUpdates();
      } catch (e) {
        manualCheckInProgress = false;
        await showUpdateMessage("Update check failed", e?.message || String(e));
      }
    };

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

    // 2) While running: every 1 minute (temporary aggressive polling)
    const periodicMs = 1 * 60 * 1000;
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

function setupAppMenu() {
  const template = [
    {
      label: "File",
      submenu: [{ role: "quit", label: "Exit" }],
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" },
      ],
    },
    {
      label: "View",
      submenu: [{ role: "reload" }, { role: "togglefullscreen" }],
    },
    {
      label: "Updates",
      submenu: [
        {
          label: "Check for updates now",
          click: () => {
            if (typeof updaterMenuApi.checkNow === "function") {
              void updaterMenuApi.checkNow();
            } else {
              void dialog.showMessageBox({
                type: "info",
                title: "Updates unavailable",
                message: "Updater is not available in development mode.",
              });
            }
          },
        },
      ],
    },
  ];
  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
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
  setupAppMenu();
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
