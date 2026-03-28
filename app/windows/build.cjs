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
const crypto = require("crypto");
const { spawn } = require("child_process");
const { pathToFileURL } = require("url");

const UPDATE_GITHUB_OWNER = "HyperlinksSpace";
const UPDATE_GITHUB_REPO = "HyperlinksSpaceBot";
const ZIP_LATEST_YML = "zip-latest.yml";
/** Same pattern as package.json build.win.artifactName for the zip target. */
const WIN_PORTABLE_ZIP_PREFIX = "HyperlinksSpaceApp_";
const LATEST_YML = "latest.yml";

/**
 * Prefer zip-latest.yml (has sha512 for the zip). If missing (404), use latest.yml + inferred zip name.
 * @returns {{ version: string, fileName: string, sha512: string | null, source: string }}
 */
async function resolveWindowsZipSidecarMeta(netFetch, currentVersion) {
  const zipLatestUrl = githubLatestAssetUrl(ZIP_LATEST_YML);
  const zlRes = await netFetch(zipLatestUrl);
  if (zlRes.ok) {
    const text = await zlRes.text();
    const meta = parseSimpleUpdateYml(text);
    if (meta.version && meta.fileName && meta.sha512) {
      if (compareSemverLike(meta.version, currentVersion) <= 0) {
        throw new Error("zip-latest.yml version is not newer than current app");
      }
      return { version: meta.version, fileName: meta.fileName, sha512: meta.sha512, source: "zip-latest.yml" };
    }
    log("[updater] zip-latest.yml incomplete; falling back to latest.yml + inferred zip name");
  } else {
    log(`[updater] zip-latest.yml HTTP ${zlRes.status} — using latest.yml and inferred HyperlinksSpaceApp_<version>.zip`);
  }

  const lyUrl = githubLatestAssetUrl(LATEST_YML);
  const lyRes = await netFetch(lyUrl);
  if (!lyRes.ok) {
    throw new Error(`latest.yml HTTP ${lyRes.status} (need a GitHub release with latest.yml)`);
  }
  const lyText = await lyRes.text();
  const ly = parseSimpleUpdateYml(lyText);
  if (!ly.version) {
    throw new Error("latest.yml has no version");
  }
  if (compareSemverLike(ly.version, currentVersion) <= 0) {
    throw new Error("latest.yml version is not newer than current app");
  }
  const fileName = `${WIN_PORTABLE_ZIP_PREFIX}${ly.version}.zip`;
  return {
    version: ly.version,
    fileName,
    sha512: null,
    source: "latest.yml+inferred",
  };
}

function compareSemverLike(a, b) {
  const pa = String(a || "0")
    .split(".")
    .map((x) => parseInt(x, 10) || 0);
  const pb = String(b || "0")
    .split(".")
    .map((x) => parseInt(x, 10) || 0);
  const n = Math.max(pa.length, pb.length);
  for (let i = 0; i < n; i++) {
    const da = pa[i] ?? 0;
    const db = pb[i] ?? 0;
    if (da < db) return -1;
    if (da > db) return 1;
  }
  return 0;
}

function parseSimpleUpdateYml(text) {
  const versionM = text.match(/^version:\s*(.+)$/m);
  const version = versionM ? versionM[1].trim() : null;
  const pathM = text.match(/^path:\s*(.+)$/m);
  let fileName = pathM ? pathM[1].trim() : null;
  if (!fileName) {
    const urlM = text.match(/^\s*url:\s*(.+)$/m);
    fileName = urlM ? urlM[1].trim() : null;
  }
  const shaM = text.match(/^sha512:\s*(.+)$/m);
  const sha512 = shaM ? shaM[1].trim() : null;
  const sizeM = text.match(/^\s*size:\s*(\d+)\s*$/m);
  const size = sizeM ? parseInt(sizeM[1], 10) : null;
  return { version, fileName, sha512, size };
}

function githubLatestAssetUrl(fileName) {
  const enc = encodeURIComponent(fileName).replace(/%20/g, "%20");
  return `https://github.com/${UPDATE_GITHUB_OWNER}/${UPDATE_GITHUB_REPO}/releases/latest/download/${enc}`;
}

const GITHUB_API_HEADERS = {
  Accept: "application/vnd.github+json",
  "User-Agent": "HyperlinksSpaceApp/electron-updater",
};

/**
 * When /releases/latest/download/<name>.zip returns 404, find the portable zip on the latest release
 * via the GitHub API (asset names may differ slightly from artifactName).
 * @returns {Promise<string|null>} browser_download_url or null
 */
async function fetchPortableZipBrowserUrlFromGitHubApi(netFetch, version, preferredFileName) {
  const apiUrl = `https://api.github.com/repos/${UPDATE_GITHUB_OWNER}/${UPDATE_GITHUB_REPO}/releases/latest`;
  const res = await netFetch(apiUrl, { headers: GITHUB_API_HEADERS });
  if (!res.ok) {
    log(`[updater] GitHub API GET releases/latest: HTTP ${res.status}`);
    return null;
  }
  let data;
  try {
    data = await res.json();
  } catch (_) {
    return null;
  }
  const assets = Array.isArray(data.assets) ? data.assets : [];
  const zips = assets.filter((a) => a && typeof a.name === "string" && /\.zip$/i.test(a.name));
  const skipName = (n) =>
    /blockmap|\.7z\.|\.delta/i.test(n) || /-ia32-|arm64|\.msi$/i.test(n);
  const candidates = zips.filter((a) => !skipName(a.name));

  const exact = candidates.find((a) => a.name === preferredFileName);
  if (exact?.browser_download_url) {
    log(`[updater] GitHub API: exact zip match ${exact.name}`);
    return exact.browser_download_url;
  }

  const verLoose = String(version).trim();
  const withVersion = candidates.filter((a) => a.name.includes(verLoose));
  if (withVersion.length === 1 && withVersion[0].browser_download_url) {
    log(`[updater] GitHub API: single zip matching version ${verLoose}: ${withVersion[0].name}`);
    return withVersion[0].browser_download_url;
  }

  const prefixed = candidates.find(
    (a) =>
      a.name.startsWith(WIN_PORTABLE_ZIP_PREFIX) ||
      /^HyperlinksSpaceApp[_-]/i.test(a.name) ||
      /Hyperlinks\s*Space/i.test(a.name),
  );
  if (prefixed?.browser_download_url) {
    log(`[updater] GitHub API: portable-like zip ${prefixed.name}`);
    return prefixed.browser_download_url;
  }

  if (candidates.length === 1 && candidates[0].browser_download_url) {
    log(`[updater] GitHub API: only zip on release: ${candidates[0].name}`);
    return candidates[0].browser_download_url;
  }

  log(
    `[updater] GitHub API: could not pick zip (candidates: ${candidates.map((c) => c.name).join(", ") || "none"})`,
  );
  return null;
}

async function downloadToFile(netFetch, url, destPath, onProgress) {
  const res = await netFetch(url);
  if (!res.ok) {
    throw new Error(`Download failed ${res.status} ${url}`);
  }
  const total = parseInt(res.headers.get("content-length") || "0", 10) || 0;
  const reader = res.body?.getReader?.();
  if (!reader) {
    const buf = Buffer.from(await res.arrayBuffer());
    if (onProgress) onProgress(buf.length, total || buf.length);
    fs.writeFileSync(destPath, buf);
    return;
  }
  const ws = fs.createWriteStream(destPath);
  let received = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value && value.length) {
        received += value.length;
        if (!ws.write(Buffer.from(value))) {
          await new Promise((res) => ws.once("drain", res));
        }
        if (onProgress) onProgress(received, total);
      }
    }
  } finally {
    await new Promise((resolve, reject) => {
      ws.end((err) => (err ? reject(err) : resolve()));
    });
  }
}

function sha512Base64OfFile(filePath) {
  const hash = crypto.createHash("sha512");
  hash.update(fs.readFileSync(filePath));
  return hash.digest("base64");
}

function resolveZipAppContentRoot(extractDir, exeBaseName) {
  const direct = path.join(extractDir, exeBaseName);
  if (fs.existsSync(direct)) return extractDir;
  let entries = [];
  try {
    entries = fs.readdirSync(extractDir, { withFileTypes: true });
  } catch (_) {
    return null;
  }
  for (const ent of entries) {
    if (!ent.isDirectory()) continue;
    const sub = path.join(extractDir, ent.name);
    if (fs.existsSync(path.join(sub, exeBaseName))) return sub;
  }
  return null;
}

/**
 * After a successful version switch, remove staged builds older than the running app
 * (and same-version leftovers if the apply script already removed the folder).
 */
function scheduleVersionsFolderCleanup() {
  if (isDev || !app.isPackaged || process.platform !== "win32") return;
  const current = app.getVersion();
  setTimeout(() => {
    try {
      const sweep = (versionsRoot, label) => {
        if (!fs.existsSync(versionsRoot)) return;
        for (const name of fs.readdirSync(versionsRoot)) {
          const full = path.join(versionsRoot, name);
          let st;
          try {
            st = fs.statSync(full);
          } catch (_) {
            continue;
          }
          if (!st.isDirectory()) continue;
          // Staging for builds older than the running app (previous releases).
          if (compareSemverLike(name, current) < 0) {
            fs.rmSync(full, { recursive: true, force: true });
            log(`[updater] removed old staged folder (${label}): ${name}`);
          }
        }
      };
      sweep(path.join(app.getPath("userData"), "pending-update-versions"), "userData");
      sweep(path.join(path.dirname(process.execPath), "versions"), "legacy installDir");
    } catch (e) {
      log(`[updater] versions cleanup: ${e?.message || e}`);
    }
  }, 5000);
}

const isDev = process.env.NODE_ENV === "development";
const updaterMenuApi = {
  checkNow: null,
};
const updateDialogState = {
  window: null,
  installEnabled: false,
  ipcBound: false,
};
/** When true, skip app.quit() from window closed handlers so quitAndInstall can run first (avoids race + long hang). */
let suppressQuitForUpdateInstall = false;

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
  <button id="install" disabled style="padding:5px 10px;">Update</button>
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
     * @param {boolean} [opts.showActions] Update button row (when false: version + text only; dismiss via title bar X)
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

    const useWinVersionsSidecar = process.platform === "win32";
    let zipPrepareInFlight = false;
    let zipReadyVersion = null;
    let zipStagingContentPath = null;

    autoUpdater.autoDownload = !useWinVersionsSidecar;
    // Windows: never install a downloaded NSIS on quit — in-app Update uses staged zip + robocopy only.
    autoUpdater.autoInstallOnAppQuit = !useWinVersionsSidecar;
    autoUpdater.autoRunAppAfterInstall = true;
    log(
      `[updater] initialized (github, winVersions=${useWinVersionsSidecar}, autoDownload=${autoUpdater.autoDownload})`,
    );

    let installRequested = false;

    const syncZipReadyUi = (v) => {
      if (!updateDialogState.window || updateDialogState.window.isDestroyed()) return;
      updateDialogUi({
        text: `Update ${v} is ready. Click Update to close and open the new version.`,
        percent: 100,
        showProgress: true,
        showActions: true,
        installEnabled: true,
      });
    };

    const stagingHasMainExe = (stagingDir) => {
      const exeBase = path.basename(process.execPath);
      const direct = path.join(stagingDir, exeBase);
      if (fs.existsSync(direct)) return true;
      if (process.platform !== "win32") return false;
      try {
        const want = exeBase.toLowerCase();
        return fs.readdirSync(stagingDir).some((n) => n.toLowerCase() === want);
      } catch (_) {
        return false;
      }
    };

    const getVersionsStagingRoot = () => path.join(app.getPath("userData"), "pending-update-versions");

    const restoreVersionsStagingFromDisk = () => {
      const root = getVersionsStagingRoot();
      if (!fs.existsSync(root)) return;
      const exeBase = path.basename(process.execPath);
      let bestVer = null;
      let bestContent = null;
      for (const name of fs.readdirSync(root)) {
        const full = path.join(root, name);
        let st;
        try {
          st = fs.statSync(full);
        } catch (_) {
          continue;
        }
        if (!st.isDirectory()) continue;
        if (compareSemverLike(name, currentVersion) <= 0) continue;
        const extractDir = path.join(full, "extract");
        if (!fs.existsSync(extractDir)) continue;
        const contentRoot = resolveZipAppContentRoot(extractDir, exeBase);
        if (!contentRoot || !stagingHasMainExe(contentRoot)) continue;
        if (!bestVer || compareSemverLike(name, bestVer) > 0) {
          bestVer = name;
          bestContent = contentRoot;
        }
      }
      if (bestVer && bestContent) {
        zipReadyVersion = bestVer;
        zipStagingContentPath = bestContent;
        log(`[updater] restored staging from disk: ${bestVer} -> ${bestContent}`);
      }
    };

    restoreVersionsStagingFromDisk();

    const tryBeginVersionsPrepare = async (info, opts) => {
      if (!useWinVersionsSidecar) return;
      const remoteV = info?.version;
      if (!remoteV || compareSemverLike(remoteV, currentVersion) <= 0) return;
      if (zipPrepareInFlight) return;
      const exeBase = path.basename(process.execPath);
      if (zipReadyVersion === remoteV && zipStagingContentPath && stagingHasMainExe(zipStagingContentPath)) {
        syncZipReadyUi(remoteV);
        manualDownloadInProgress = false;
        return;
      }
      zipPrepareInFlight = true;
      const uiManual = Boolean(opts?.uiManual);
      const uiActive =
        uiManual || (updateDialogState.window && !updateDialogState.window.isDestroyed());
      const pushUi = (partial) => {
        if (!uiActive) return;
        updateDialogUi({
          showProgress: true,
          showActions: true,
          installEnabled: false,
          percent: 0,
          text: "",
          ...partial,
        });
      };
      try {
        const meta = await resolveWindowsZipSidecarMeta((u) => net.fetch(u), currentVersion);
        if (meta.version !== remoteV) {
          log(`[updater] sidecar version ${meta.version} vs feed ${remoteV} (using sidecar manifest)`);
        }
        log(`[updater] sidecar source: ${meta.source} → ${meta.fileName}`);

        // One bar: download + verify + unpack = "prepare" until Update is enabled.
        const PROGRESS_DOWNLOAD_CAP = 72;
        pushUi({ text: "Downloading and preparing update… 0%", percent: 0 });

        const versionsRoot = getVersionsStagingRoot();
        const versionDir = path.join(versionsRoot, meta.version);
        const extractDir = path.join(versionDir, "extract");
        try {
          fs.rmSync(versionDir, { recursive: true, force: true });
        } catch (_) {}
        fs.mkdirSync(extractDir, { recursive: true });

        const zipPath = path.join(versionDir, meta.fileName);
        const primaryZipUrl = githubLatestAssetUrl(meta.fileName);
        const onZipProgress = (received, total) => {
          const dl = total > 0 ? received / total : 0;
          const dlPct = total > 0 ? Math.round(100 * dl) : 0;
          const overall = Math.min(PROGRESS_DOWNLOAD_CAP, Math.round(PROGRESS_DOWNLOAD_CAP * dl));
          pushUi({
            text: `Downloading and preparing update… ${dlPct}%`,
            percent: overall,
          });
        };
        try {
          await downloadToFile((u) => net.fetch(u), primaryZipUrl, zipPath, onZipProgress);
        } catch (e) {
          const msg = String(e?.message || e);
          if (!/404/.test(msg)) throw e;
          const altUrl = await fetchPortableZipBrowserUrlFromGitHubApi(
            (u, init) => net.fetch(u, init),
            meta.version,
            meta.fileName,
          );
          if (!altUrl) throw e;
          log(`[updater] primary zip 404; downloading from GitHub API URL`);
          await downloadToFile((u) => net.fetch(u), altUrl, zipPath, onZipProgress);
        }

        pushUi({ text: "Verifying update…", percent: PROGRESS_DOWNLOAD_CAP + 2 });

        if (meta.sha512) {
          const hash = sha512Base64OfFile(zipPath);
          if (hash !== meta.sha512) throw new Error("zip sha512 mismatch");
        } else {
          log(
            "[updater] no sha512 manifest for zip (optional: add zip-latest.yml from cleanup for integrity check)",
          );
        }

        pushUi({ text: "Installing update (unpacking files)…", percent: PROGRESS_DOWNLOAD_CAP + 8 });

        // adm-zip calls chmod while extracting; on Windows that can throw ENOENT for app.asar paths.
        // extract-zip (yauzl) matches Electron's tooling and avoids that failure mode.
        const extractZip = require("extract-zip");
        await extractZip(zipPath, { dir: extractDir });

        pushUi({ text: "Finalizing…", percent: 98 });

        const contentRoot = resolveZipAppContentRoot(extractDir, exeBase);
        if (!contentRoot) throw new Error("extracted update has no app executable");

        try {
          fs.unlinkSync(zipPath);
        } catch (_) {}

        zipStagingContentPath = contentRoot;
        zipReadyVersion = meta.version;
        manualDownloadInProgress = false;
        log(`[updater] staged update at ${contentRoot}`);
        syncZipReadyUi(meta.version);
        if (!uiActive && process.platform === "win32" && Notification.isSupported()) {
          try {
            new Notification({
              title: "Hyperlinks Space App",
              body: `Update ${meta.version} is ready. Open Updates → Check for updates.`,
            }).show();
          } catch (_) {}
        }
      } catch (e) {
        log(`[updater] versions sidecar failed: ${e?.message || e}`);
        log(
          `[updater] Ensure latest GitHub release includes latest.yml, ${WIN_PORTABLE_ZIP_PREFIX}<version>.zip (zip build), and optionally zip-latest.yml from cleanup for sha512.`,
        );
        zipStagingContentPath = null;
        zipReadyVersion = null;
        manualDownloadInProgress = false;
        const hint =
          `Update prepare failed: ${e?.message || String(e)}. ` +
          `Publish the Windows zip (${WIN_PORTABLE_ZIP_PREFIX}<version>.zip) on https://github.com/${UPDATE_GITHUB_OWNER}/${UPDATE_GITHUB_REPO}/releases/latest — latest.yml is enough; add zip-latest.yml from cleanup for checksum verification.`;
        if (uiActive) {
          openOrFocusUpdateDialog();
          updateDialogUi({
            text: hint,
            percent: 0,
            showProgress: false,
            showActions: true,
            installEnabled: false,
          });
        }
      } finally {
        zipPrepareInFlight = false;
      }
    };

    const applyVersionsStagedUpdate = () => {
      const installDir = path.dirname(process.execPath);
      const exeName = path.basename(process.execPath);
      const planPath = path.join(app.getPath("temp"), `hsp-update-plan-${Date.now()}.json`);
      const stagingVersionDirToRemove = zipReadyVersion
        ? path.join(getVersionsStagingRoot(), zipReadyVersion)
        : null;
      const plan = {
        stagingContent: zipStagingContentPath,
        installDir,
        exeName,
        waitPid: process.pid,
        appliedVersion: zipReadyVersion,
        stagingVersionDirToRemove,
      };
      fs.writeFileSync(planPath, JSON.stringify(plan), "utf8");

      const ps1Path = path.join(app.getPath("temp"), `hsp-apply-versions-${Date.now()}.ps1`);
      const ps1Body = [
        "param([string]$PlanPath)",
        '$ErrorActionPreference = "Stop"',
        "$plan = Get-Content -LiteralPath $PlanPath -Encoding UTF8 -Raw | ConvertFrom-Json",
        "$deadline = (Get-Date).AddSeconds(120)",
        "while ((Get-Process -Id $plan.waitPid -ErrorAction SilentlyContinue) -and ((Get-Date) -lt $deadline)) {",
        "  Start-Sleep -Milliseconds 200",
        "}",
        "$src = $plan.stagingContent",
        "$dst = $plan.installDir",
        "Get-ChildItem -LiteralPath $src -Force | ForEach-Object {",
        "  if ($_.Name -ne 'versions') {",
        "    $target = Join-Path $dst $_.Name",
        "    if ($_.PSIsContainer) {",
        "      $p = Start-Process -FilePath robocopy.exe -ArgumentList @($_.FullName, $target, '/MIR', '/R:6', '/W:1', '/NFL', '/NDL', '/NJH', '/NJS') -Wait -PassThru -NoNewWindow",
        "      if ($p.ExitCode -gt 7) { exit 1 }",
        "    } else {",
        "      Copy-Item -LiteralPath $_.FullName -Destination $target -Force",
        "    }",
        "  }",
        "}",
        "if ($plan.stagingVersionDirToRemove -and (Test-Path -LiteralPath $plan.stagingVersionDirToRemove)) {",
        "  Remove-Item -LiteralPath $plan.stagingVersionDirToRemove -Recurse -Force",
        "}",
        'Start-Process -FilePath (Join-Path $dst $plan.exeName)',
        "try { Remove-Item -LiteralPath $PlanPath -Force } catch {}",
        "",
      ].join("\r\n");
      fs.writeFileSync(ps1Path, ps1Body, "utf8");

      const child = spawn(
        "powershell.exe",
        ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", ps1Path, "-PlanPath", planPath],
        { detached: true, stdio: "ignore", windowsHide: true },
      );
      child.unref();
      if (!child.pid) {
        throw new Error("failed to spawn update helper");
      }
    };

    /** True when versions/ staging is ready; preferred over NSIS even if installer also downloaded. */
    const canApplyVersionsStaging = () => {
      if (!useWinVersionsSidecar || !zipStagingContentPath || !zipReadyVersion) return false;
      if (compareSemverLike(zipReadyVersion, currentVersion) <= 0) return false;
      return stagingHasMainExe(zipStagingContentPath);
    };

    const requestInstallNow = () => {
      installRequested = true;
      log("[updater] user accepted update install");
      closeUpdateDialog();

      suppressQuitForUpdateInstall = true;

      const useVersionsApply = canApplyVersionsStaging();

      if (useVersionsApply) {
        try {
          applyVersionsStagedUpdate();
        } catch (e) {
          log(`[updater] applyVersionsStagedUpdate failed: ${e?.message || e}`);
          suppressQuitForUpdateInstall = false;
          void dialog.showMessageBox({
            type: "error",
            title: "Hyperlinks Space App",
            message: `Could not apply update: ${e?.message || String(e)}`,
            buttons: ["OK"],
          });
          return;
        }
        for (const win of BrowserWindow.getAllWindows()) {
          try {
            win.removeAllListeners("close");
            win.destroy();
          } catch (_) {}
        }
        app.quit();
        return;
      }

      // Windows packaged: only the staged-zip path — never launch the NSIS wizard from this button.
      if (useWinVersionsSidecar) {
        suppressQuitForUpdateInstall = false;
        log(
          `[updater] Update click ignored: no staged build (ready=${zipReadyVersion} path=${zipStagingContentPath})`,
        );
        void dialog.showMessageBox({
          type: "info",
          title: "Hyperlinks Space App",
          message:
            "The quick update is not ready yet. Keep the app open until download and unpack finish, or ensure the latest GitHub release includes zip-latest.yml and HyperlinksSpaceApp_<version>.zip from your Windows build (cleanup folder).",
          buttons: ["OK"],
        });
        return;
      }

      try {
        if (process.platform === "win32" && Notification.isSupported()) {
          const n = new Notification({
            title: "Hyperlinks Space App",
            body: "Installing update… The app will restart when finished.",
          });
          n.show();
        }
      } catch (_) {}

      for (const win of BrowserWindow.getAllWindows()) {
        try {
          win.removeAllListeners("close");
          win.destroy();
        } catch (_) {}
      }

      try {
        log("[updater] invoking quitAndInstall(isSilent=false, isForceRunAfter=true)");
        autoUpdater.quitAndInstall(false, true);
      } catch (e) {
        log(`quitAndInstall failed: ${e?.message || e}`);
        suppressQuitForUpdateInstall = false;
        app.quit();
      }
    };

    autoUpdater.on("update-downloaded", () => {
      log("[updater] update-downloaded");
      manualDownloadInProgress = false;
      // Windows uses zip sidecar only; ignore NSIS installer download for in-app UX.
      if (useWinVersionsSidecar) {
        log("[updater] update-downloaded: ignored on Windows (NSIS not used for Update button)");
        return;
      }
      openOrFocusUpdateDialog();
      updateDialogUi({
        text: "Update is ready. Click Update.",
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
      const wasManual = manualCheckInProgress;
      if (manualCheckInProgress) {
        manualCheckInProgress = false;
        manualDownloadInProgress = true;
        openOrFocusUpdateDialog();
        updateDialogUi({
          text: useWinVersionsSidecar
            ? `Downloading and preparing version ${info?.version || "new"}…`
            : `Downloading version ${info?.version || "new"}...`,
          percent: 0,
          showProgress: true,
          showActions: true,
          installEnabled: false,
        });
      }
      if (useWinVersionsSidecar) {
        void tryBeginVersionsPrepare(info, { uiManual: wasManual });
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
      if (useWinVersionsSidecar) return;
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
        if (
          useWinVersionsSidecar &&
          zipReadyVersion &&
          zipStagingContentPath &&
          stagingHasMainExe(zipStagingContentPath)
        ) {
          openOrFocusUpdateDialog();
          syncZipReadyUi(zipReadyVersion);
          return;
        }
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

    scheduleVersionsFolderCleanup();
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
    if (suppressQuitForUpdateInstall) return;
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
  if (suppressQuitForUpdateInstall) return;
  app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
