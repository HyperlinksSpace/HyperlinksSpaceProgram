const { app, BrowserWindow, Menu, protocol, net, dialog, Notification, ipcMain } = require("electron");
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const { pathToFileURL } = require("url");

const isDev = process.env.NODE_ENV === "development";
const updaterMenuApi = {
  checkNow: null,
};
const updateDialogState = {
  window: null,
  installEnabled: false,
  ipcBound: false,
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
    let manualDownloadInProgress = false;

    const showUpdateMessage = async (title, message) => {
      try {
        const win = BrowserWindow.getAllWindows()[0];
        await dialog.showMessageBox(win || null, { type: "info", title, message });
      } catch (_) {}
    };
    const openOrFocusUpdateDialog = () => {
      if (updateDialogState.window && !updateDialogState.window.isDestroyed()) {
        updateDialogState.window.show();
        updateDialogState.window.focus();
        return;
      }
      updateDialogState.window = new BrowserWindow({
        width: 420,
        height: 210,
        title: "Updater",
        resizable: false,
        minimizable: false,
        maximizable: false,
        show: false,
        autoHideMenuBar: true,
        parent: BrowserWindow.getAllWindows()[0] || undefined,
        modal: false,
        webPreferences: { nodeIntegration: true, contextIsolation: false },
      });
      const html = `<!doctype html><html><body style="font-family:Segoe UI,Arial,sans-serif;padding:16px;background:#fff;color:#111;">
<div id="t" style="font-size:14px;margin-bottom:10px;">Checking for updates...</div>
<div style="height:14px;background:#eee;border-radius:7px;overflow:hidden;margin-bottom:12px;"><div id="b" style="height:100%;width:0%;background:#2ea043;"></div></div>
<div style="display:flex;gap:8px;justify-content:flex-end;">
  <button id="install" disabled style="padding:6px 12px;">Install update</button>
  <button id="close" style="padding:6px 12px;">Close</button>
</div>
<script>
  const { ipcRenderer } = require('electron');
  document.getElementById('install').addEventListener('click', () => ipcRenderer.send('updater-install-click'));
  document.getElementById('close').addEventListener('click', () => window.close());
</script>
</body></html>`;
      updateDialogState.window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
      updateDialogState.window.once("ready-to-show", () => {
        if (updateDialogState.window && !updateDialogState.window.isDestroyed()) updateDialogState.window.show();
      });
      updateDialogState.window.on("closed", () => {
        updateDialogState.window = null;
      });
    };
    const updateDialogUi = ({ text, percent, installEnabled }) => {
      if (!updateDialogState.window || updateDialogState.window.isDestroyed()) return;
      const safe = Math.max(0, Math.min(100, Math.round(percent)));
      updateDialogState.installEnabled = Boolean(installEnabled);
      const js = `
        const t = document.getElementById('t');
        const b = document.getElementById('b');
        const i = document.getElementById('install');
        if (t) t.textContent = ${JSON.stringify(text)};
        if (b) b.style.width = '${safe}%';
        if (i) i.disabled = ${installEnabled ? "false" : "true"};
      `;
      updateDialogState.window.webContents.executeJavaScript(js).catch(() => {});
    };
    const closeUpdateDialog = () => {
      if (updateDialogState.window && !updateDialogState.window.isDestroyed()) updateDialogState.window.close();
      updateDialogState.window = null;
      updateDialogState.installEnabled = false;
    };
    if (!updateDialogState.ipcBound) {
      updateDialogState.ipcBound = true;
      ipcMain.on("updater-install-click", () => {
        if (updateDialogState.installEnabled) requestInstallNow();
      });
    }
    const scheduleHiddenRelaunchFallback = () => {
      try {
        const exePath = app.getPath("exe").replace(/'/g, "''");
        const relaunchScript = `$exe='${exePath}'; Start-Sleep -Seconds 60; if (Test-Path $exe) { Start-Process -FilePath $exe }`;
        const child = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-WindowStyle", "Hidden", "-Command", relaunchScript], {
          detached: true,
          stdio: "ignore",
          windowsHide: true,
        });
        child.unref();
        log("[updater] hidden relaunch fallback scheduled");
      } catch (e) {
        log(`[updater] relaunch fallback schedule failed: ${e?.message || e}`);
      }
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
    log("[updater] initialized (provider: github, autoDownload=true, interactiveInstall=true)");

    let installRequested = false;

    const requestInstallNow = () => {
      installRequested = true;
      log("[updater] user accepted update install");
      closeUpdateDialog();

      // Ensure renderers release file locks before NSIS starts uninstall/install.
      for (const win of BrowserWindow.getAllWindows()) {
        try {
          win.removeAllListeners("close");
          win.destroy();
        } catch (_) {}
      }

      try {
        // Interactive mode shows NSIS progress/update UI to the user.
        scheduleHiddenRelaunchFallback();
        log("[updater] invoking quitAndInstall(isSilent=false, isForceRunAfter=false)");
        autoUpdater.quitAndInstall(false, false);
      } catch (e) {
        log(`quitAndInstall failed: ${e?.message || e}`);
        // Fallback path: app quit still applies update because autoInstallOnAppQuit=true.
        app.quit();
      }
    };

    autoUpdater.on("update-downloaded", () => {
      log("[updater] update-downloaded");
      manualDownloadInProgress = false;
      openOrFocusUpdateDialog();
      updateDialogUi({
        text: "Update is ready. Click Install update.",
        percent: 100,
        installEnabled: true,
      });
    });

    autoUpdater.on("checking-for-update", () => {
      log("[updater] checking-for-update");
      if (manualCheckInProgress) {
        log("[updater] manual check started");
      }
    });

    autoUpdater.on("update-available", (info) => {
      log(`[updater] update-available version=${info?.version || "unknown"}`);
      if (manualCheckInProgress) {
        manualCheckInProgress = false;
        manualDownloadInProgress = true;
        openOrFocusUpdateDialog();
        updateDialogUi({
          text: `Downloading version ${info?.version || "new"}... 0%`,
          percent: 0,
          installEnabled: false,
        });
        void showUpdateMessage(
          "Update found",
          `Version ${info?.version || "new"} is available. Download progress is shown in a separate window.`
        );
      }
    });

    autoUpdater.on("update-not-available", () => {
      log("[updater] update-not-available");
      if (manualCheckInProgress) {
        manualCheckInProgress = false;
        manualDownloadInProgress = false;
        closeUpdateDialog();
        void showUpdateMessage("No updates", "You are already on the latest version.");
      }
    });
    autoUpdater.on("download-progress", (progress) => {
      if (!manualDownloadInProgress) return;
      const pct = progress?.percent ?? 0;
      updateDialogUi({
        text: `Downloading update... ${Math.max(0, Math.min(100, Math.round(pct)))}%`,
        percent: pct,
        installEnabled: false,
      });
    });

    autoUpdater.on("error", (err) => {
      log(`[updater] error: ${err?.message || String(err)}`);
      if (manualCheckInProgress) {
        manualCheckInProgress = false;
        manualDownloadInProgress = false;
        closeUpdateDialog();
        void showUpdateMessage("Update check failed", err?.message || String(err));
      }
    });

    updaterMenuApi.checkNow = async () => {
      try {
        log("[updater] manual check requested from menu");
        manualCheckInProgress = true;
        manualDownloadInProgress = false;
        closeUpdateDialog();
        await autoUpdater.checkForUpdates();
      } catch (e) {
        manualCheckInProgress = false;
        manualDownloadInProgress = false;
        closeUpdateDialog();
        await showUpdateMessage("Update check failed", e?.message || String(e));
      }
    };

    app.on("before-quit", () => {
      if (installRequested) {
        log("[updater] before-quit for update install");
      }
    });
    autoUpdater.on("before-quit-for-update", () => {
      log("[updater] before-quit-for-update emitted");
    });

    let lastCheckAt = 0;
    const markAndCheck = () => {
      lastCheckAt = Date.now();
      log("[updater] scheduled checkForUpdates()");
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
