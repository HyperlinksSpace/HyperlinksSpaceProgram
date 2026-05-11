# Windows in-app updater: debugging failed “quick update”

The packaged Windows app uses a **custom zip sidecar** path in `windows/build.cjs`. The in-app **“Update with reload”** flow stages a **portable ZIP** from GitHub, unpacks it under user data, then applies it with a helper script. It does **not** use the NSIS `.exe` download from `electron-updater`’s `update-downloaded` event on Windows (that event is ignored when the zip path is active).

If the UI still behaves like an old build after you used the updater dialog, use the sections below.

### Stale UI after a successful “Update with reload”

The main process now (see `windows/build.cjs`):

1. **Clears Chromium session cache** when `app.getVersion()` changes (marker file `hsp-client-cache-version.txt` in user data), so the next launch does not reuse HTTP-style caches from the previous build.
2. Serves **`app://` assets with `Cache-Control: no-store`** via streaming file reads instead of `net.fetch(file:…)`, so the embedded Expo web bundle is less likely to stick on old JS/CSS after an in-place update.

If the UI is still old, verify the **GitHub “Latest” release** actually contains the new portable zip and matching **`latest.yml` / `zip-latest.yml`** versions — the client always downloads from **`/releases/latest/download/…`**, not from “newest semver among all releases”.

## 1. Log and data locations (on your PC)

All paths are under Electron **`app.getPath("userData")`**. On Windows this is usually:

`%APPDATA%\<app-specific folder>\`

For this product, the folder name typically matches the install branding (e.g. **Hyperlinks Space Program**). Exact path: use **Updates → Open update data folder…** in the app menu (opens the folder in Explorer).

| File / folder | Purpose |
|---------------|---------|
| **`main.log`** | General main-process log; lines tagged **`[updater:…]`** mirror structured updater diagnostics. |
| **`hsp-update-apply.log`** | Append-only log when you click **Update with reload** and the staged zip apply runs (spawn, plan, errors). |
| **`pending-update-versions\`** | Staged unpacked builds per version (`<version>\extract\…`). If a version folder exists with a valid main `.exe`, the dialog can offer install. |
| **`%TEMP%\hsp-update-plan-*.json`** | Short-lived apply plan (timestamped). |
| **`%TEMP%\hsp-apply-versions-*.ps1`** | Short-lived PowerShell helper for apply. |
| **`%TEMP%\hsp-apply-trace.log`** | Launcher trace written before the inner apply script runs. |

The **Updater** window also shows a rolling activity log (last lines only); for deep investigation, prefer **`main.log`** and **`hsp-update-apply.log`**.

### What to search for in `main.log`

- `[updater:prepare] FAILED` — zip download, verify, or unpack failed.
- `update-downloaded: ignored on Windows` — expected: NSIS installer finished downloading but Windows uses the zip pipeline instead.
- `requestInstallNow blocked: no staged build` — UI offered reload before staging completed, or staging was cleared; check `pending-update-versions` and zip assets on GitHub.
- `[updater:state]` — compact state snapshots captured on check/start, update-available, prepare enter/complete/fail, install request, and updater errors.

## 2. GitHub release assets (maintainers)

The sidecar resolver (`resolveWindowsZipSidecarMeta` in `windows/build.cjs`) expects:

1. **`latest.yml`** — on the release (electron-updater feed; gives the target version).
2. **Portable zip** whose name matches the convention: **`<productSlug>_<version>.zip`** (e.g. `HyperlinksSpaceProgram_1.2.3.zip`). The slug comes from `package.json` `build.productName` (spaces removed); see `windows/product-brand.cjs` (`portableZipPrefix`).
3. **`zip-latest.yml`** (optional but recommended) — produced by the Windows cleanup script; includes **`sha512`** for the zip so the client can verify before unpack.

Repository used for the feed: **`HyperlinksSpace/HyperlinksSpaceProgram`** (see `UPDATE_GITHUB_OWNER` / `UPDATE_GITHUB_REPO` in `windows/build.cjs`).

If **`zip-latest.yml`** is missing or incomplete, the client falls back to **`latest.yml` + inferred zip name** (`<portableZipPrefix><version>.zip`). If that zip is missing or 404, prepare fails and the old build keeps running.

## 3. When a full `.exe` installer fixes it

Installing from a **new NSIS `.exe`** replaces the whole install tree. That bypasses any broken zip staging or apply step, which is why “download new installer” can succeed when the inner dialog did not fully apply an update.

## 4. Related code

- `windows/build.cjs` — `setupAutoUpdater`, `tryBeginVersionsPrepare`, `requestInstallNow`, `applyVersionsStagedUpdate`.
- `windows/cleanup.cjs` — generating **`zip-latest.yml`** for releases.
