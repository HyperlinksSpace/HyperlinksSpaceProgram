const {
  app,
  BrowserWindow,
  Menu,
  protocol,
  net,
  dialog,
  Notification,
  ipcMain,
  nativeTheme,
} = require("electron");
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
    const currentVersion = app.getVersion();
    const currentVersionHtml = String(currentVersion)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/"/g, "&quot;");

    /** Prefer transferred/total when known; Windows often keeps percent at 0 until late. */
    const progressPercent = (progress) => {
      if (!progress || typeof progress !== "object") return 0;
      const total = progress.total;
      const transferred = progress.transferred ?? 0;
      if (typeof total === "number" && total > 0) {
        return Math.max(0, Math.min(100, (100 * transferred) / total));
      }
      const p = progress.percent;
      if (typeof p === "number" && !Number.isNaN(p)) {
        if (p > 0 && p <= 1) {
          return Math.max(0, Math.min(100, p * 100));
        }
        return Math.max(0, Math.min(100, p));
      }
      return 0;
    };

    // Tight chrome: content + padding only (title bar is extra OS chrome).
    const UPDATER_COMPACT_H = 128;
    const UPDATER_EXPANDED_H = 198;

    const openOrFocusUpdateDialog = () => {
      if (updateDialogState.window && !updateDialogState.window.isDestroyed()) {
        updateDialogState.window.show();
        updateDialogState.window.focus();
        return;
      }
      updateDialogState.window = new BrowserWindow({
        width: 420,
        height: UPDATER_COMPACT_H,
        useContentSize: true,
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
      const html = `<!doctype html><html><body style="font-family:Segoe UI,Arial,sans-serif;box-sizing:border-box;padding:12px 14px 10px;background:#111;color:#eee;margin:0;">
<div id="cv" style="font-size:12px;color:#aaa;margin-bottom:6px;">Current version: ${currentVersionHtml}</div>
<div id="t" style="font-size:14px;margin-bottom:8px;line-height:1.35;">Checking for updates...</div>
<div id="progressWrap" style="display:none;margin-bottom:8px;">
  <div style="height:14px;background:#333;border-radius:7px;overflow:hidden;">
    <div id="b" style="height:100%;width:0%;background:#2ea043;"></div>
  </div>
</div>
<div id="actionsWrap" style="display:none;flex-direction:row;justify-content:flex-end;">
  <button id="install" disabled style="padding:5px 10px;">Install update</button>
</div>
<script>
  const { ipcRenderer } = require('electron');
  function applyUpdaterUi(data) {
    const t = document.getElementById('t');
    const progressWrap = document.getElementById('progressWrap');
    const actionsWrap = document.getElementById('actionsWrap');
    const b = document.getElementById('b');
    const i = document.getElementById('install');
    if (t) t.textContent = data.text;
    if (progressWrap) progressWrap.style.display = data.showProgress ? 'block' : 'none';
    if (actionsWrap) actionsWrap.style.display = data.showActions ? 'flex' : 'none';
    if (b) b.style.width = Math.max(0, Math.min(100, Math.round(Number(data.percent) || 0))) + '%';
    if (i) i.disabled = !data.installEnabled;
  }
  ipcRenderer.on('updater-ui', (_e, data) => applyUpdaterUi(data));
  document.getElementById('install').addEventListener('click', () => ipcRenderer.send('updater-install-click'));
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
    /**
     * @param {object} opts
     * @param {string} opts.text
     * @param {number} [opts.percent]
     * @param {boolean} [opts.showProgress]
     * @param {boolean} [opts.showActions] Install button row (when false: version + text only; dismiss via title bar X)
     * @param {boolean} [opts.installEnabled]
     */
    const updateDialogUi = ({ text, percent = 0, showProgress = false, showActions = false, installEnabled = false }) => {
      if (!updateDialogState.window || updateDialogState.window.isDestroyed()) return;
      const safe = Math.max(0, Math.min(100, Math.round(Number(percent) || 0)));
      updateDialogState.installEnabled = Boolean(installEnabled);
      const expanded = showProgress || showActions;
      try {
        updateDialogState.window.setSize(420, expanded ? UPDATER_EXPANDED_H : UPDATER_COMPACT_H);
      } catch (_) {}
      const payload = {
        text,
        percent: safe,
        showProgress,
        showActions,
        installEnabled: Boolean(installEnabled),
      };
      const wc = updateDialogState.window.webContents;
      const send = () => {
        try {
          wc.send("updater-ui", payload);
        } catch (e) {
          log(`[updater] updateDialogUi send: ${e?.message || e}`);
        }
      };
      // IPC survives rapid download-progress; executeJavaScript could drop or race with load state.
      if (wc.isLoading()) {
        wc.once("did-finish-load", send);
      } else {
        send();
      }
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
        showProgress: true,
        showActions: true,
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
        // Custom window only (no native "Update found" dialog). Progress uses transferred/total when percent stays 0.
        openOrFocusUpdateDialog();
        updateDialogUi({
          text: `Downloading version ${info?.version || "new"}...`,
          percent: 0,
          showProgress: true,
          showActions: true,
          installEnabled: false,
        });
      }
    });

    autoUpdater.on("update-not-available", () => {
      log("[updater] update-not-available");
      if (manualCheckInProgress) {
        manualCheckInProgress = false;
        manualDownloadInProgress = false;
        openOrFocusUpdateDialog();
        updateDialogUi({
          text: "You are already on the latest version.",
          percent: 0,
          showProgress: false,
          showActions: false,
          installEnabled: false,
        });
      }
    });
    let downloadProgressLoggedSample = false;
    autoUpdater.on("download-progress", (progress) => {
      if (!updateDialogState.window || updateDialogState.window.isDestroyed()) return;
      if (!downloadProgressLoggedSample) {
        downloadProgressLoggedSample = true;
        try {
          log(`[updater] download-progress sample: ${JSON.stringify(progress)}`);
        } catch (_) {}
      }
      const pct = progressPercent(progress);
      updateDialogUi({
        text: `Downloading update... ${Math.round(pct)}%`,
        percent: pct,
        showProgress: true,
        showActions: true,
        installEnabled: false,
      });
    });

    autoUpdater.on("error", (err) => {
      log(`[updater] error: ${err?.message || String(err)}`);
      if (manualCheckInProgress || manualDownloadInProgress) {
        manualCheckInProgress = false;
        manualDownloadInProgress = false;
        openOrFocusUpdateDialog();
        updateDialogUi({
          text: `Update check failed: ${err?.message || String(err)}`,
          percent: 0,
          showProgress: false,
          showActions: false,
          installEnabled: false,
        });
      }
    });

    updaterMenuApi.checkNow = async () => {
      try {
        log("[updater] manual check requested from menu");
        downloadProgressLoggedSample = false;
        manualCheckInProgress = true;
        manualDownloadInProgress = false;
        openOrFocusUpdateDialog();
        updateDialogUi({
          text: "Checking for updates...",
          percent: 0,
          showProgress: false,
          showActions: false,
          installEnabled: false,
        });
        await autoUpdater.checkForUpdates();
      } catch (e) {
        manualCheckInProgress = false;
        manualDownloadInProgress = false;
        openOrFocusUpdateDialog();
        updateDialogUi({
          text: `Update check failed: ${e?.message || String(e)}`,
          percent: 0,
          showProgress: false,
          showActions: false,
          installEnabled: false,
        });
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
    // Match app dark background (theme.ts); reduces flash and helps menu/client seam blend on Windows.
    backgroundColor: "#111111",
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
    // Dark native chrome (title bar / menu area) so the OS-drawn separator under the menu reads closer to #111111.
    nativeTheme.themeSource = "dark";
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
