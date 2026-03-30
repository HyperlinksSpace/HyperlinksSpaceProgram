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
/** Must match `build.publish.repo` and the repo where CI uploads releases. */
const UPDATE_GITHUB_REPO = "HyperlinksSpaceProgram";
const ZIP_LATEST_YML = "zip-latest.yml";
/** Same pattern as package.json build.win.artifactName for the zip target. */
const WIN_PORTABLE_ZIP_PREFIX = "HyperlinksSpaceApp_";
const LATEST_YML = "latest.yml";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** GitHub / Electron net layer: transient errors worth retrying (backoff in checkForUpdatesWithRetry). */
function isTransientGithubUpdateError(err) {
  if (!err) return false;
  const code = err.statusCode ?? err.status;
  if (code === 502 || code === 503 || code === 504) return true;
  const msg = String(err.message || err);
  if (
    /\b502\b|\b503\b|\b504\b|Bad Gateway|Service Unavailable|Gateway Timeout|taking too long|ECONNRESET|ETIMEDOUT/i.test(
      msg,
    )
  )
    return true;
  // Electron reports URL loader failures as net::ERR_* (not Node ECONNRESET).
  if (/net::ERR_CONNECTION_RESET|net::ERR_CONNECTION_TIMED_OUT|net::ERR_NETWORK_CHANGED/i.test(msg))
    return true;
  return false;
}

/** Ring buffer for the updater dialog (last lines only). */
const UPDATER_DIALOG_LOG_MAX = 120;
const updaterDialogLogBuffer = [];

/** Set in setupAutoUpdater: sends a fully formatted log line (with ISO time) to the dialog. */
let updaterLogToDialog = null;

function appendUpdaterDialogLogLine(messageBody) {
  const line = `[${new Date().toISOString()}] ${messageBody}`;
  updaterDialogLogBuffer.push(line);
  if (updaterDialogLogBuffer.length > UPDATER_DIALOG_LOG_MAX) {
    updaterDialogLogBuffer.splice(0, updaterDialogLogBuffer.length - UPDATER_DIALOG_LOG_MAX);
  }
  try {
    updaterLogToDialog?.(line);
  } catch (_) {}
}

/** Structured lines in userData/main.log and updater dialog: `[updater:tag] message` */
function logUpdater(tag, msg) {
  const body = `[updater:${tag}] ${msg}`;
  log(body);
  appendUpdaterDialogLogLine(body);
}

function safeJson(obj, maxLen = 800) {
  try {
    const s = JSON.stringify(obj);
    return s.length > maxLen ? `${s.slice(0, maxLen)}…` : s;
  } catch (_) {
    return String(obj);
  }
}

/** Escape for a PowerShell single-quoted literal (only ' is doubled). */
function escapePsSingleQuotedPath(p) {
  return String(p).replace(/'/g, "''");
}

/**
 * Detached `powershell -File script.ps1 -PlanPath ...` often drops or misparses args on Windows.
 * Use a short UTF-16LE -EncodedCommand that writes %TEMP%\\hsp-apply-trace.log then invokes the script.
 */
function buildWindowsApplyLauncherCommand(ps1Path, planPath) {
  const qPs1 = escapePsSingleQuotedPath(ps1Path);
  const qPlan = escapePsSingleQuotedPath(planPath);
  return (
    `$ErrorActionPreference='Stop';` +
    `try{$t=Join-Path $env:TEMP 'hsp-apply-trace.log';` +
    `$ts=(Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ss.fffZ');` +
    `Add-Content -LiteralPath $t -Encoding UTF8 -Value ('['+$ts+'] launcher start pid='+$PID)}catch{};` +
    `& '${qPs1}' -PlanPath '${qPlan}'`
  );
}

/**
 * Prefer zip-latest.yml (has sha512 for the zip). If missing (404), use latest.yml + inferred zip name.
 * @returns {{ version: string, fileName: string, sha512: string | null, source: string }}
 */
async function resolveWindowsZipSidecarMeta(netFetch, currentVersion) {
  logUpdater("meta", `resolve sidecar manifests (current=${currentVersion})`);
  const zipLatestUrl = githubLatestAssetUrl(ZIP_LATEST_YML);
  const zlRes = await netFetch(zipLatestUrl);
  if (zlRes.ok) {
    const text = await zlRes.text();
    const meta = parseSimpleUpdateYml(text);
    if (meta.version && meta.fileName && meta.sha512) {
      if (compareSemverLike(meta.version, currentVersion) <= 0) {
        throw new Error("zip-latest.yml version is not newer than current app");
      }
      logUpdater("meta", `using zip-latest.yml version=${meta.version} file=${meta.fileName}`);
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
  logUpdater("meta", `using latest.yml+inferred version=${ly.version} file=${fileName}`);
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

/**
 * NSIS install: INSTDIR\versions\<semver>\… plus INSTDIR\current → junction (exe is …\current\<name>.exe).
 * Legacy installs: exe lives directly in the install folder (no `current`). Returns the app root (parent of `current`, or the folder that contains the exe for legacy).
 */
function getWindowsAppRootFromExecPath(execPath) {
  const dir = path.dirname(execPath);
  if (path.basename(dir).toLowerCase() === "current") {
    return path.dirname(dir);
  }
  return dir;
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
  logUpdater(
    "github-api",
    `resolve zip URL via API (version=${version} preferred=${preferredFileName})`,
  );
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
    logUpdater("github-api", `picked exact asset url=${exact.browser_download_url.slice(0, 120)}…`);
    return exact.browser_download_url;
  }

  const verLoose = String(version).trim();
  const withVersion = candidates.filter((a) => a.name.includes(verLoose));
  if (withVersion.length === 1 && withVersion[0].browser_download_url) {
    log(`[updater] GitHub API: single zip matching version ${verLoose}: ${withVersion[0].name}`);
    logUpdater("github-api", `picked version-match url=${withVersion[0].browser_download_url.slice(0, 120)}…`);
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
    logUpdater("github-api", `picked portable-like url=${prefixed.browser_download_url.slice(0, 120)}…`);
    return prefixed.browser_download_url;
  }

  if (candidates.length === 1 && candidates[0].browser_download_url) {
    log(`[updater] GitHub API: only zip on release: ${candidates[0].name}`);
    logUpdater("github-api", `picked sole zip url=${candidates[0].browser_download_url.slice(0, 120)}…`);
    return candidates[0].browser_download_url;
  }

  log(
    `[updater] GitHub API: could not pick zip (candidates: ${candidates.map((c) => c.name).join(", ") || "none"})`,
  );
  return null;
}

async function downloadToFile(netFetch, url, destPath, onProgress) {
  logUpdater("download", `start → ${destPath}`);
  logUpdater("download", `GET ${url.length > 200 ? `${url.slice(0, 200)}…` : url}`);
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
    logUpdater("download", `done bytes=${buf.length} (buffer path) → ${destPath}`);
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
  let sizeOnDisk = received;
  try {
    sizeOnDisk = fs.statSync(destPath).size;
  } catch (_) {}
  logUpdater("download", `done bytes=${sizeOnDisk} streamed=${received} totalHdr=${total || "?"} → ${destPath}`);
}

/**
 * Unpack portable app .zip. On Windows, prefer system tar.exe (native I/O; avoids long
 * apparent stalls streaming huge files through Node). Fall back to extract-zip.
 * Pulse callback keeps the updater UI moving during large single-file writes (e.g. app.asar).
 */
/**
 * @param {object} [opts]
 * @param {string} [opts.verifyExeBase] If set, after system tar succeeds we require resolveZipAppContentRoot
 *   to find the app; otherwise we clear and fall back to extract-zip (tar can exit 0 with a bad tree for some zips).
 */
async function extractPortableZipToDir(zipPath, extractDir, logFn, pulse, unpackLo, unpackHi, opts = {}) {
  const verifyExeBase = opts.verifyExeBase;
  const runExtractZip = async () => {
    logUpdater("extract", `extract-zip (yauzl) → ${extractDir}`);
    const extractZip = require("extract-zip");
    let unpackEntryCount = 0;
    let unpackLastName = "";
    const pulseUnpack = () => {
      const span = unpackHi - unpackLo;
      const bump = Math.min(span, 4 + Math.floor(unpackEntryCount / 30));
      pulse({
        text:
          unpackEntryCount > 0
            ? `Unpacking… ${unpackEntryCount} items${unpackLastName ? ` — ${unpackLastName.slice(-56)}` : ""}`
            : "Unpacking… starting",
        percent: Math.min(unpackHi, unpackLo + bump),
      });
    };
    const unpackHeartbeat = setInterval(pulseUnpack, 2800);
    const t0 = Date.now();
    logFn(`[updater] extract-zip begin → ${extractDir}`);
    try {
      await extractZip(zipPath, {
        dir: extractDir,
        onEntry: (entry) => {
          unpackEntryCount += 1;
          unpackLastName = entry.fileName || "";
          if (unpackEntryCount <= 4 || unpackEntryCount % 40 === 0) {
            setImmediate(() => pulseUnpack());
          }
        },
      });
    } finally {
      clearInterval(unpackHeartbeat);
    }
    logFn(`[updater] extract-zip done in ${Date.now() - t0}ms (${unpackEntryCount} entries)`);
  };

  if (process.platform === "win32") {
    const tarExe = path.join(process.env.SystemRoot || "C:\\Windows", "System32", "tar.exe");
    if (fs.existsSync(tarExe)) {
      logUpdater("extract", `try system tar first ${tarExe}`);
      try {
        const t0 = Date.now();
        logFn(`[updater] extracting with ${tarExe}`);
        const hb = setInterval(() => {
          pulse({
            text: "Unpacking… (system archiver, large files can take a minute)",
            percent: Math.min(unpackHi, unpackLo + 8),
          });
        }, 2800);
        try {
          await new Promise((resolve, reject) => {
            const child = spawn(tarExe, ["-xf", zipPath, "-C", extractDir], {
              windowsHide: true,
              stdio: ["ignore", "ignore", "pipe"],
            });
            logUpdater(
              "extract",
              `system tar pid=${child.pid} cmd=tar -xf <zip> -C <extractDir> zip=${path.basename(zipPath)}`,
            );
            let errBuf = "";
            child.stderr?.on("data", (d) => {
              errBuf += d.toString();
            });
            child.on("error", reject);
            child.on("close", (code) => {
              logUpdater("extract", `system tar pid=${child.pid} exit=${code}`);
              if (code === 0) resolve();
              else reject(new Error(`tar.exe exited ${code}${errBuf ? `: ${errBuf.slice(-500)}` : ""}`));
            });
          });
        } finally {
          clearInterval(hb);
        }
        logFn(`[updater] system tar done in ${Date.now() - t0}ms`);
        if (verifyExeBase) {
          const root = resolveZipAppContentRoot(extractDir, verifyExeBase);
          if (!root) {
            logFn(
              `[updater] system tar left no recognizable main exe (wanted basename like ${verifyExeBase}); clearing extract dir and using extract-zip`,
            );
            logUpdater("extract", "tar output verification failed → extract-zip");
            try {
              fs.rmSync(extractDir, { recursive: true, force: true });
            } catch (_) {}
            fs.mkdirSync(extractDir, { recursive: true });
            await runExtractZip();
            return;
          }
        }
        return;
      } catch (e) {
        logFn(`[updater] system tar failed (${e?.message || e}); clearing partial extract, retrying with extract-zip`);
        try {
          fs.rmSync(extractDir, { recursive: true, force: true });
        } catch (_) {}
        fs.mkdirSync(extractDir, { recursive: true });
      }
    } else {
      logUpdater("extract", `tar.exe not present (${tarExe}) → extract-zip`);
    }
  } else {
    logUpdater("extract", "non-Windows → extract-zip only");
  }

  await runExtractZip();
}

function sha512Base64OfFile(filePath) {
  const hash = crypto.createHash("sha512");
  hash.update(fs.readFileSync(filePath));
  return hash.digest("base64");
}

/**
 * Portable zip may ship HyperlinksSpaceApp.exe while the installed NSIS exe is "Hyperlinks Space App.exe".
 * Must match resolveZipAppContentRoot / apply relaunch candidates.
 */
function winStagingDirHasMainExe(stagingDir, exeBaseName) {
  const alt = new Set([
    exeBaseName,
    "Hyperlinks Space App.exe",
    "HyperlinksSpaceApp.exe",
  ]);
  for (const name of alt) {
    const p = path.join(stagingDir, name);
    try {
      if (fs.existsSync(p) && fs.statSync(p).isFile()) return true;
    } catch (_) {}
  }
  return false;
}

function resolveZipAppContentRoot(extractDir, exeBaseName) {
  const direct = path.join(extractDir, exeBaseName);
  if (fs.existsSync(direct)) return extractDir;

  /** Names to treat as the main app exe (portable zip vs running binary name can differ). */
  const altNames = new Set([exeBaseName]);
  if (process.platform === "win32") {
    altNames.add("Hyperlinks Space App.exe");
    altNames.add("HyperlinksSpaceApp.exe");
  }

  const matchesMainExe = (fileName) => {
    const lower = fileName.toLowerCase();
    for (const n of altNames) {
      if (lower === n.toLowerCase()) return true;
    }
    return false;
  };

  /** Prefer shallowest match; skip common subtrees that are not the main exe. */
  const hits = [];
  const MAX_DEPTH = 6;
  const walk = (dir, depth) => {
    if (depth > MAX_DEPTH) return;
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (_) {
      return;
    }
    for (const ent of entries) {
      if (!ent.isFile()) continue;
      if (!/\.exe$/i.test(ent.name)) continue;
      if (matchesMainExe(ent.name)) hits.push({ root: dir, depth });
    }
    for (const ent of entries) {
      if (!ent.isDirectory()) continue;
      const n = ent.name.toLowerCase();
      if (n === "resources" || n === "locales") continue;
      walk(path.join(dir, ent.name), depth + 1);
    }
  };
  walk(extractDir, 0);
  if (hits.length === 0) return null;
  hits.sort((a, b) => a.depth - b.depth || a.root.length - b.root.length);
  return hits[0].root;
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
      logUpdater("cleanup", `versions folder sweep (current=${current})`);
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
      sweep(path.join(getWindowsAppRootFromExecPath(process.execPath), "versions"), "installDir versions");
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
    let updaterCheckRetrying = false;

    const checkForUpdatesWithRetry = async (attempts = 4) => {
      let lastErr;
      for (let i = 0; i < attempts; i++) {
        try {
          logUpdater("check", `checkForUpdates attempt ${i + 1}/${attempts}`);
          const result = await autoUpdater.checkForUpdates();
          const u = result?.updateInfo ?? result;
          logUpdater(
            "check",
            `checkForUpdates ok version=${u?.version ?? "?"} release=${u?.releaseDate ?? "?"} ` +
              `downloadURL=${u?.downloadUrl ?? u?.path ?? "?"}`,
          );
          return result;
        } catch (e) {
          lastErr = e;
          logUpdater("check", `checkForUpdates error attempt ${i + 1}: ${e?.message || e}`);
          if (!isTransientGithubUpdateError(e) || i === attempts - 1) throw e;
          const delayMs = 1500 * 2 ** i;
          log(
            `[updater] transient GitHub/update error (${i + 1}/${attempts}), retry in ${delayMs}ms: ${e?.message || e}`,
          );
          await sleep(delayMs);
        }
      }
      throw lastErr;
    };
    const currentVersion = app.getVersion();
    const applyUserLogPath = path.join(app.getPath("userData"), "hsp-update-apply.log");

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

    // Single content height: always leave room for the activity log so it is not clipped when progress/actions hide.
    const UPDATER_LOG_PANEL = 108;
    const UPDATER_DIALOG_H = 198 + UPDATER_LOG_PANEL;

    const sendUpdaterLogInitToDialog = () => {
      const w = updateDialogState.window;
      if (!w || w.isDestroyed()) return;
      try {
        w.webContents.send("updater-log-init", updaterDialogLogBuffer.slice());
      } catch (_) {}
    };

    updaterLogToDialog = (line) => {
      const w = updateDialogState.window;
      if (!w || w.isDestroyed()) return;
      const wc = w.webContents;
      const send = () => {
        try {
          wc.send("updater-log", line);
        } catch (_) {}
      };
      if (wc.isLoading()) wc.once("did-finish-load", send);
      else send();
    };

    /** Set after syncZipReadyUi / stagingHasMainExe; enables main-process installEnabled when opening the dialog. */
    let refreshUpdaterDialogIfStagedReady = () => {};

    const openOrFocusUpdateDialog = () => {
      if (updateDialogState.window && !updateDialogState.window.isDestroyed()) {
        updateDialogState.window.show();
        updateDialogState.window.focus();
        sendUpdaterLogInitToDialog();
        refreshUpdaterDialogIfStagedReady();
        return;
      }
      updateDialogState.window = new BrowserWindow({
        width: 420,
        height: UPDATER_DIALOG_H,
        useContentSize: true,
        title: "Updater",
        resizable: false,
        minimizable: false,
        maximizable: false,
        show: false,
        autoHideMenuBar: true,
        // No parent: a child window + showMessageBox(modal to child) often leaves alerts behind the main frame.
        modal: false,
        webPreferences: { nodeIntegration: true, contextIsolation: false, sandbox: false },
      });
      const updaterHtmlPath = path.join(__dirname, "updater-dialog.html");
      if (!fs.existsSync(updaterHtmlPath)) {
        log(`[updater] FATAL: updater-dialog.html missing at ${updaterHtmlPath}`);
      }
      updateDialogState.window.loadFile(updaterHtmlPath);
      updateDialogState.window.webContents.once("did-finish-load", () => {
        const w = updateDialogState.window;
        if (!w || w.isDestroyed()) return;
        const wc = w.webContents;
        const cvText = `Current version: ${currentVersion}`;
        wc.executeJavaScript(`document.getElementById('cv').textContent = ${JSON.stringify(cvText)}`).catch(() => {});
        sendUpdaterLogInitToDialog();
        refreshUpdaterDialogIfStagedReady();
      });
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
      try {
        updateDialogState.window.setSize(420, UPDATER_DIALOG_H);
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

    /** Prefer main/browser window so native dialogs are not hidden behind a frame owned as child. */
    const focusMainWindowForDialog = () => {
      const all = BrowserWindow.getAllWindows().filter((w) => !w.isDestroyed());
      const mainLike = all.find((w) => w !== updateDialogState.window) ?? all[0];
      try {
        if (mainLike) {
          if (mainLike.isMinimized()) mainLike.restore();
          mainLike.focus();
        }
      } catch (_) {}
      return mainLike ?? null;
    };

    if (!updateDialogState.ipcBound) {
      updateDialogState.ipcBound = true;
      // invoke/handle is more reliable than send for click→main from file:// updater pages on some Electron builds.
      ipcMain.handle("updater-install-now", () => {
        logUpdater("ipc", "updater-install-now (invoke)");
        try {
          requestInstallNow();
          return { ok: true };
        } catch (e) {
          const m = e?.message || String(e);
          log(`[updater] requestInstallNow threw: ${m}`);
          return { ok: false, err: m };
        }
      });
      ipcMain.on("updater-install-click", () => {
        logUpdater("ipc", "updater-install-click received (legacy send)");
        requestInstallNow();
      });
      ipcMain.on("updater-renderer-error", (_e, msg) => {
        log(`[updater] renderer: ${typeof msg === "string" ? msg : String(msg)}`);
      });
    }
    const logUpdaterChannel = (m) => {
      const body = `[updater] ${typeof m === "string" ? m : JSON.stringify(m)}`;
      log(body);
      appendUpdaterDialogLogLine(body);
    };
    autoUpdater.logger = {
      info: logUpdaterChannel,
      warn: logUpdaterChannel,
      error: logUpdaterChannel,
      debug: logUpdaterChannel,
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
    logUpdater(
      "init",
      `repo=${UPDATE_GITHUB_OWNER}/${UPDATE_GITHUB_REPO} app=${currentVersion} platform=${process.platform} ` +
        `winZipSidecar=${useWinVersionsSidecar} autoDownload=${autoUpdater.autoDownload} autoInstallOnQuit=${autoUpdater.autoInstallOnAppQuit}`,
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
      if (process.platform === "win32") {
        return winStagingDirHasMainExe(stagingDir, exeBase);
      }
      const direct = path.join(stagingDir, exeBase);
      if (fs.existsSync(direct)) return true;
      try {
        const want = exeBase.toLowerCase();
        return fs.readdirSync(stagingDir).some((n) => n.toLowerCase() === want);
      } catch (_) {
        return false;
      }
    };

    refreshUpdaterDialogIfStagedReady = () => {
      if (!useWinVersionsSidecar || !zipReadyVersion || !zipStagingContentPath) return;
      if (!stagingHasMainExe(zipStagingContentPath)) return;
      syncZipReadyUi(zipReadyVersion);
    };

    const getVersionsStagingRoot = () => path.join(app.getPath("userData"), "pending-update-versions");

    const restoreVersionsStagingFromDisk = () => {
      const root = getVersionsStagingRoot();
      logUpdater("staging", `restore scan root=${root}`);
      if (!fs.existsSync(root)) {
        logUpdater("staging", "restore skip (root missing)");
        return;
      }
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
        logUpdater("staging", `restore picked version=${bestVer} contentRoot=${bestContent}`);
      } else {
        logUpdater("staging", "restore no valid staged build found");
      }
    };

    restoreVersionsStagingFromDisk();

    const tryBeginVersionsPrepare = async (info, opts) => {
      const remoteV = info?.version;
      logUpdater(
        "prepare",
        `tryBeginVersionsPrepare enter remote=${remoteV || "?"} feed=${safeJson(info)} opts=${safeJson(opts)}`,
      );
      if (!useWinVersionsSidecar) {
        logUpdater("prepare", "skip (not Windows zip sidecar mode)");
        return;
      }
      if (!remoteV || compareSemverLike(remoteV, currentVersion) <= 0) {
        logUpdater("prepare", `skip (no remote or not newer remote=${remoteV} current=${currentVersion})`);
        return;
      }
      if (zipPrepareInFlight) {
        logUpdater("prepare", "skip (zipPrepareInFlight)");
        return;
      }
      const exeBase = path.basename(process.execPath);
      if (zipReadyVersion === remoteV && zipStagingContentPath && stagingHasMainExe(zipStagingContentPath)) {
        logUpdater("prepare", `skip (already staged ${remoteV})`);
        if (!updateDialogState.window || updateDialogState.window.isDestroyed()) {
          openOrFocusUpdateDialog();
        }
        syncZipReadyUi(remoteV);
        manualDownloadInProgress = false;
        return;
      }
      zipPrepareInFlight = true;
      logUpdater("prepare", `start pipeline → ${remoteV} exeBase=${exeBase}`);
      const uiManual = Boolean(opts?.uiManual);
      const uiActive =
        uiManual || (updateDialogState.window && !updateDialogState.window.isDestroyed());
      /** Tar heartbeat uses unpackLo+8 while extract-zip uses unpackLo+bump — without this the bar can drop (e.g. 88% → 84%). */
      let prepareProgressCeiling = 0;
      const pushUi = (partial) => {
        if (!uiActive) return;
        const raw = partial.percent;
        const next =
          typeof raw === "number" && !Number.isNaN(raw)
            ? Math.max(prepareProgressCeiling, Math.round(raw))
            : prepareProgressCeiling;
        prepareProgressCeiling = next;
        updateDialogUi({
          showProgress: true,
          showActions: true,
          installEnabled: false,
          percent: 0,
          text: "",
          ...partial,
          percent: next,
        });
      };
      let versionsPrepareOk = false;
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
        logUpdater("prepare", `paths versionDir=${versionDir} extractDir=${extractDir}`);
        try {
          fs.rmSync(versionDir, { recursive: true, force: true });
        } catch (_) {}
        fs.mkdirSync(extractDir, { recursive: true });

        const zipPath = path.join(versionDir, meta.fileName);
        const primaryZipUrl = githubLatestAssetUrl(meta.fileName);
        logUpdater("prepare", `download primaryURL asset=${meta.fileName}`);
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
          logUpdater("prepare", `download fallbackURL (API) → ${altUrl.length > 160 ? `${altUrl.slice(0, 160)}…` : altUrl}`);
          await downloadToFile((u) => net.fetch(u), altUrl, zipPath, onZipProgress);
        }

        pushUi({ text: "Verifying update…", percent: PROGRESS_DOWNLOAD_CAP + 2 });

        if (meta.sha512) {
          logUpdater("verify", "sha512 check (zip-latest)");
          const hash = sha512Base64OfFile(zipPath);
          if (hash !== meta.sha512) throw new Error("zip sha512 mismatch");
          logUpdater("verify", "sha512 ok");
        } else {
          log(
            "[updater] no sha512 manifest for zip (optional: add zip-latest.yml from cleanup for integrity check)",
          );
        }

        const UNPACK_PROGRESS_LO = PROGRESS_DOWNLOAD_CAP + 8;
        const UNPACK_PROGRESS_HI = 97;
        pushUi({
          text: "Installing update (unpacking files)…",
          percent: UNPACK_PROGRESS_LO,
        });

        await extractPortableZipToDir(zipPath, extractDir, log, pushUi, UNPACK_PROGRESS_LO, UNPACK_PROGRESS_HI, {
          verifyExeBase: exeBase,
        });

        pushUi({ text: "Finalizing…", percent: 98 });

        const contentRoot = resolveZipAppContentRoot(extractDir, exeBase);
        if (!contentRoot) throw new Error("extracted update has no app executable");
        logUpdater("prepare", `resolveZipAppContentRoot ok contentRoot=${contentRoot}`);

        try {
          fs.unlinkSync(zipPath);
        } catch (_) {}
        logUpdater("prepare", `removed cached zip ${zipPath}`);

        zipStagingContentPath = contentRoot;
        zipReadyVersion = meta.version;
        manualDownloadInProgress = false;
        log(`[updater] staged update at ${contentRoot}`);
        logUpdater("prepare", `COMPLETE readyVersion=${meta.version} staging=${contentRoot}`);
        // syncZipReadyUi needs an open dialog; background checks used uiActive=false and would skip UI.
        if (!uiActive) {
          openOrFocusUpdateDialog();
        }
        syncZipReadyUi(meta.version);
        if (!uiActive && process.platform === "win32" && Notification.isSupported()) {
          try {
            new Notification({
              title: "Hyperlinks Space App",
              body: `Update ${meta.version} is ready. Open Updates → Check for updates.`,
            }).show();
          } catch (_) {}
        }
        versionsPrepareOk = true;
      } catch (e) {
        const errMsg = e?.message || e;
        const errStack = typeof e?.stack === "string" ? e.stack : "";
        logUpdater("prepare", `FAILED ${errMsg}`);
        log(`[updater] versions sidecar failed: ${errMsg}`);
        if (errStack) log(`[updater] versions sidecar stack: ${errStack.split("\n").slice(0, 8).join(" | ")}`);
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
        logUpdater(
          "prepare",
          versionsPrepareOk
            ? "zipPrepareInFlight=false (success)"
            : "zipPrepareInFlight=false (incomplete — look for prepare FAILED above)",
        );
      }
    };

    const applyVersionsStagedUpdate = () => {
      const execPath = process.execPath;
      const installDir = path.dirname(execPath);
      const exeName = path.basename(execPath);
      const appRoot = getWindowsAppRootFromExecPath(execPath);
      const useVersionedLayout =
        process.platform === "win32" && path.basename(installDir).toLowerCase() === "current";
      const applyLogPath = applyUserLogPath;
      logUpdater(
        "apply",
        `applyVersionsStagedUpdate installDir=${installDir} appRoot=${appRoot} versioned=${useVersionedLayout} exe=${exeName} staging=${zipStagingContentPath} version=${zipReadyVersion} pid=${process.pid}`,
      );
      logUpdater("apply", `helper log (next run): ${applyLogPath}`);
      const planPath = path.join(app.getPath("temp"), `hsp-update-plan-${Date.now()}.json`);
      const stagingVersionDirToRemove = zipReadyVersion
        ? path.join(getVersionsStagingRoot(), zipReadyVersion)
        : null;
      const targetVersionDir =
        useVersionedLayout && zipReadyVersion ? path.join(appRoot, "versions", zipReadyVersion) : null;
      const currentLink = useVersionedLayout ? path.join(appRoot, "current") : null;
      const plan = {
        stagingContent: zipStagingContentPath,
        installDir,
        exeName,
        waitPid: process.pid,
        appliedVersion: zipReadyVersion,
        stagingVersionDirToRemove,
        logPath: applyLogPath,
        useVersionedLayout,
        appRoot,
        targetVersionDir,
        currentLink,
      };
      fs.writeFileSync(planPath, JSON.stringify(plan), "utf8");
      logUpdater("apply", `wrote plan ${planPath} ${safeJson(plan)}`);

      const ps1Path = path.join(app.getPath("temp"), `hsp-apply-versions-${Date.now()}.ps1`);
      /**
       * After PID exit: short settle (handles + mutex). Versioned layout: robocopy to
       * versions\<ver>, then replace the `current` junction (fast); flat layout: robocopy in place.
       * Override: HSP_UPDATE_SETTLE_MS (ms, 0–5000). Default 100ms when versioned, 400ms when flat.
       */
      const defaultSettle = useVersionedLayout ? 100 : 400;
      const rawSettle = process.env.HSP_UPDATE_SETTLE_MS;
      let settleMs;
      if (rawSettle !== undefined && rawSettle !== "") {
        const p = parseInt(rawSettle, 10);
        settleMs = Math.min(5000, Math.max(0, Number.isFinite(p) ? p : defaultSettle));
      } else {
        settleMs = Math.min(5000, Math.max(0, defaultSettle));
      }
      const ps1Body = [
        "param([string]$PlanPath)",
        '$ErrorActionPreference = "Stop"',
        "if (-not $PlanPath) { $PlanPath = $env:HSP_UPDATE_PLAN }",
        'if (-not $PlanPath) { throw "Plan path missing (pass -PlanPath to this script or set HSP_UPDATE_PLAN)" }',
        "$plan = Get-Content -LiteralPath $PlanPath -Encoding UTF8 -Raw | ConvertFrom-Json",
        "$LogFile = $plan.logPath",
        `$settleMs = ${settleMs}`,
        "function Write-ApplyLog([string]$m) {",
        "  $ts = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ss.fffZ')",
        '  Add-Content -LiteralPath $LogFile -Value ("[$ts] " + $m) -Encoding UTF8',
        "}",
        "try {",
        '  Write-ApplyLog "apply start waitPid=$($plan.waitPid) exe=$($plan.exeName) settleMs=$settleMs versioned=$($plan.useVersionedLayout)"',
        "  $deadline = (Get-Date).AddSeconds(120)",
        "  while ((Get-Process -Id $plan.waitPid -ErrorAction SilentlyContinue) -and ((Get-Date) -lt $deadline)) {",
        "    Start-Sleep -Milliseconds 50",
        "  }",
        `  Write-ApplyLog "parent process ended (or timeout); settle delay ${settleMs}ms (HSP_UPDATE_SETTLE_MS)"`,
        "  if ($settleMs -gt 0) { Start-Sleep -Milliseconds $settleMs }",
        "  $src = $plan.stagingContent",
        "  if ($plan.useVersionedLayout) {",
        "    $dst = $plan.targetVersionDir",
        "    $null = New-Item -ItemType Directory -Force -LiteralPath $dst",
        '    Write-ApplyLog "robocopy target (versioned): $dst"',
        "  } else {",
        "    $dst = $plan.installDir",
        '    Write-ApplyLog "robocopy target (flat): $dst"',
        "  }",
        '  Write-ApplyLog "robocopy/copy from $src to $dst"',
        "  Get-ChildItem -LiteralPath $src -Force | ForEach-Object {",
        "    if ($_.Name -ne 'versions') {",
        "      $target = Join-Path $dst $_.Name",
        "      if ($_.PSIsContainer) {",
        "        $p = Start-Process -FilePath robocopy.exe -ArgumentList @($_.FullName, $target, '/MIR', '/MT:16', '/R:2', '/W:1', '/NFL', '/NDL', '/NJH', '/NJS') -Wait -PassThru -NoNewWindow",
        '        Write-ApplyLog ("robocopy dir " + $_.Name + " exit=" + $p.ExitCode)',
        "        if ($p.ExitCode -gt 7) { throw \"robocopy failed exit $($p.ExitCode) for $($_.FullName)\" }",
        "      } else {",
        "        Copy-Item -LiteralPath $_.FullName -Destination $target -Force",
        '        Write-ApplyLog ("copied file " + $_.Name)',
        "      }",
        "    }",
        "  }",
        "  if ($plan.useVersionedLayout) {",
        "    if (Test-Path -LiteralPath $plan.currentLink) {",
        "      Remove-Item -LiteralPath $plan.currentLink -Force",
        '      Write-ApplyLog ("removed old current junction/link")',
        "    }",
        "    $null = New-Item -ItemType Junction -Path $plan.currentLink -Target $plan.targetVersionDir",
        '    Write-ApplyLog ("junction: $($plan.currentLink) -> $($plan.targetVersionDir)")',
        "  }",
        "  if ($plan.stagingVersionDirToRemove -and (Test-Path -LiteralPath $plan.stagingVersionDirToRemove)) {",
        "    Remove-Item -LiteralPath $plan.stagingVersionDirToRemove -Recurse -Force",
        '    Write-ApplyLog "removed staging dir"',
        "  }",
        "  $workDir = if ($plan.useVersionedLayout) { $plan.currentLink } else { $dst }",
        '  $candidates = @($plan.exeName, "Hyperlinks Space App.exe", "HyperlinksSpaceApp.exe") | Select-Object -Unique',
        "  $exePath = $null",
        "  foreach ($c in $candidates) {",
        "    $tryExe = Join-Path $workDir $c",
        "    if (Test-Path -LiteralPath $tryExe) { $exePath = $tryExe; Write-ApplyLog (\"picked exe: \" + $c); break }",
        "  }",
        "  if (-not $exePath) { throw (\"main exe missing after apply under \" + $workDir + \" (tried \" + ($candidates -join \", \") + \")\") }",
        '  Write-ApplyLog ("relaunch " + $exePath + " (wd=" + $workDir + ")")',
        "  Start-Process -FilePath $exePath -WorkingDirectory $workDir",
        '  Write-ApplyLog "Start-Process returned (GUI may take a moment)"',
        "  try { Remove-Item -LiteralPath $PlanPath -Force } catch {}",
        '  Write-ApplyLog "apply done"',
        "} catch {",
        '  $err = "FATAL: " + $_.Exception.Message',
        "  if ($LogFile) { try { Write-ApplyLog $err } catch {} }",
        "  elseif ($plan -and $plan.logPath) { try { Add-Content -LiteralPath $plan.logPath -Value (\"[\" + (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ss.fffZ') + \"] \" + $err) -Encoding UTF8 } catch {} }",
        "  try { Remove-Item -LiteralPath $PlanPath -Force } catch {}",
        "  exit 1",
        "}",
        "",
      ].join("\r\n");
      fs.writeFileSync(ps1Path, ps1Body, "utf8");
      logUpdater("apply", `wrote ps1 ${ps1Path} settleMs=${settleMs}`);

      try {
        fs.appendFileSync(
          applyLogPath,
          `[${new Date().toISOString()}] [main] spawning apply encodedLauncher=1 ps1=${ps1Path} plan=${planPath} trace=%TEMP%\\hsp-apply-trace.log\n`,
          "utf8",
        );
      } catch (_) {}

      const systemRoot = process.env.SystemRoot || process.env.SYSTEMROOT || "C:\\Windows";
      const psExe = path.join(systemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
      const launcherPs = buildWindowsApplyLauncherCommand(ps1Path, planPath);
      const encodedLauncher = Buffer.from(launcherPs, "utf16le").toString("base64");

      const child = spawn(
        psExe,
        ["-NoProfile", "-ExecutionPolicy", "Bypass", "-EncodedCommand", encodedLauncher],
        {
          env: { ...process.env, HSP_UPDATE_PLAN: planPath },
          detached: true,
          stdio: "ignore",
          windowsHide: true,
        },
      );
      logUpdater(
        "apply",
        `spawn ${psExe} pid=${child.pid} detached=true -EncodedCommand launcher→-File ps1 (trace %TEMP%\\hsp-apply-trace.log)`,
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
      try {
        fs.appendFileSync(
          applyUserLogPath,
          `[${new Date().toISOString()}] [main] requestInstallNow (Update button clicked)\n`,
          "utf8",
        );
      } catch (_) {}

      installRequested = true;
      log("[updater] user accepted update install");
      logUpdater("ipc", "requestInstallNow (Update button)");

      suppressQuitForUpdateInstall = true;

      const useVersionsApply = canApplyVersionsStaging();
      const semverNewer =
        zipReadyVersion && compareSemverLike(zipReadyVersion, currentVersion) > 0;
      const exeOk =
        Boolean(zipStagingContentPath) &&
        stagingHasMainExe(zipStagingContentPath);
      logUpdater(
        "ipc",
        `requestInstallNow useVersionsApply=${useVersionsApply} zipReady=${zipReadyVersion} path=${zipStagingContentPath}`,
      );

      if (useVersionsApply) {
        closeUpdateDialog();
        try {
          applyVersionsStagedUpdate();
        } catch (e) {
          log(`[updater] applyVersionsStagedUpdate failed: ${e?.message || e}`);
          suppressQuitForUpdateInstall = false;
          const mw = focusMainWindowForDialog();
          const errOpts = {
            type: "error",
            title: "Hyperlinks Space App",
            message: `Could not apply update: ${e?.message || String(e)}`,
            buttons: ["OK"],
          };
          void (mw ? dialog.showMessageBox(mw, errOpts) : dialog.showMessageBox(errOpts));
          return;
        }
        for (const win of BrowserWindow.getAllWindows()) {
          try {
            win.removeAllListeners("close");
            win.destroy();
          } catch (_) {}
        }
        logUpdater("ipc", "requestInstallNow app.quit after staging apply spawn");
        app.quit();
        return;
      }

      // Windows packaged: only the staged-zip path — never launch the NSIS wizard from this button.
      if (useWinVersionsSidecar) {
        suppressQuitForUpdateInstall = false;
        logUpdater("ipc", "requestInstallNow blocked: no staged zip build ready");
        log(
          `[updater] Update click ignored: no staged build (ready=${zipReadyVersion} path=${zipStagingContentPath})`,
        );
        try {
          fs.appendFileSync(
            applyUserLogPath,
            `[${new Date().toISOString()}] [main] blocked: cannot apply zip staging ` +
              `(readyVer=${zipReadyVersion} stagingPath=${zipStagingContentPath} ` +
              `semverNewer=${Boolean(semverNewer)} exeOk=${Boolean(exeOk)} current=${currentVersion})\n`,
            "utf8",
          );
        } catch (_) {}
        const boxOpts = {
          type: "info",
          title: "Hyperlinks Space App",
          message:
            "The quick update is not ready yet. Keep the app open until download and unpack finish, or ensure the latest GitHub release includes zip-latest.yml and HyperlinksSpaceApp_<version>.zip from your Windows build (cleanup folder).",
          buttons: ["OK"],
        };
        try {
          if (updateDialogState.window && !updateDialogState.window.isDestroyed()) {
            updateDialogState.window.hide();
          }
        } catch (_) {}
        const mw = focusMainWindowForDialog();
        void (mw ? dialog.showMessageBox(mw, boxOpts) : dialog.showMessageBox(boxOpts));
        return;
      }

      closeUpdateDialog();

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
      logUpdater("event", "update-downloaded (NSIS installer file ready on disk)");
      manualDownloadInProgress = false;
      // Windows uses zip sidecar only; ignore NSIS installer download for in-app UX.
      if (useWinVersionsSidecar) {
        log("[updater] update-downloaded: ignored on Windows (NSIS not used for Update button)");
        logUpdater("event", "update-downloaded ignored (Windows uses zip sidecar only)");
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
      logUpdater("event", `checking-for-update manual=${manualCheckInProgress}`);
      if (manualCheckInProgress) {
        log("[updater] manual check started");
      }
    });

    autoUpdater.on("update-available", (info) => {
      log(`[updater] update-available version=${info?.version || "unknown"}`);
      logUpdater("event", `update-available ${safeJson({ version: info?.version, path: info?.path })}`);
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
      logUpdater("event", `update-not-available current=${currentVersion}`);
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
      if (updaterCheckRetrying && isTransientGithubUpdateError(err)) {
        logUpdater("event", `error suppressed (retry) ${err?.message || err}`);
        return;
      }
      logUpdater("event", `error manualCheck=${manualCheckInProgress} download=${manualDownloadInProgress} ${err?.message || err}`);
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
        logUpdater("ipc", "checkNow from menu");
        downloadProgressLoggedSample = false;
        if (
          useWinVersionsSidecar &&
          zipReadyVersion &&
          zipStagingContentPath &&
          stagingHasMainExe(zipStagingContentPath)
        ) {
          logUpdater("ipc", `checkNow short-circuit already staged ${zipReadyVersion}`);
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
        updaterCheckRetrying = true;
        try {
          await checkForUpdatesWithRetry();
        } finally {
          updaterCheckRetrying = false;
        }
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
      logUpdater("schedule", "periodic/startup checkForUpdates");
      void (async () => {
        updaterCheckRetrying = true;
        try {
          await checkForUpdatesWithRetry();
        } catch (e) {
          log(`[updater] checkForUpdates failed after retries: ${e?.message || e}`);
          logUpdater("schedule", `check failed after retries: ${e?.message || e}`);
        } finally {
          updaterCheckRetrying = false;
        }
      })();
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
      logUpdater("schedule", "window focus → checkForUpdates");
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
