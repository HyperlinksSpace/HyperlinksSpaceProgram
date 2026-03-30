# Build and Install: Faster & Better

This doc describes the Windows Electron build and install flow and how to speed them up and improve them.

Exe creating example:

```
cd /d C:\1\1\1\1\1\HyperlinksSpaceProgram\app
npm run build:win:verbose
```

Exe bash run example:

```
powershell -NoProfile -Command "Start-Process -FilePath 'C:/1/1/1/1/1/HyperlinksSpaceBot/app/releases/builder/build_03252026_1449/HyperlinksSpaceAppInstaller_03252026_1449.exe'"
```

---

## 1. Build process

### What runs

`npm run build:win` does three things:

1. **Expo web export** – `npm run build` → `expo export -p web`. Metro bundles the app and writes static files to `dist/`. Usually the slowest step (tens of seconds).
2. **Electron pack** – `electron-builder --win`. Rebuilds native deps (if any), packages the app, builds the NSIS installer. Downloads (Electron, NSIS, winCodeSign) are cached after first run.
3. **Clean** – `node windows/cleanup.cjs`. Moves artifacts into `releases/builder/build_MMDDYYYY_HHMM/` (installer only at root; zip, yml, unpacked, and other artifacts under `dev/`).

**Output:** `releases/builder/build_<date>_<time>/HyperlinksSpaceAppInstaller_<stamp>.exe` at root and `dev/` (portable zip, latest.yml, zip-latest.yml, win-unpacked, blockmap, builder-debug.yml, builder-effective-config.yaml).

### How to make the build faster

| Goal | What to do |
|------|------------|
| **Skip Expo when only Electron changed** | Use `npm run pack:win` when `dist/` is already up to date (no app/Expo changes). Saves the full Expo/Metro run (often 30–60+ s). |
| **Skip native rebuild** | In `package.json` → `build`, add `"npmRebuild": false`. The packaged app only runs the web bundle; native rebuild can often be skipped. Try it; if the app runs, keep it. Saves time every build. |
| **Avoid building the installer when iterating** | Use `npm run build:win:dir` when you only need the unpacked app (e.g. quick runs from `release/win-unpacked/app.exe`). Skips NSIS and clean; faster and no “file locked” risk. |
| **Keep caches** | Don’t clear Metro/Expo cache unless needed. Electron and electron-builder caches (e.g. under `%LOCALAPPDATA%\electron-builder\Cache`) are reused; leave them. |
| **Verbose only when debugging** | Use `npm run build:win:verbose` only to diagnose failures; normal builds are quicker without DEBUG. |
| **Faster installer step (7z/NSIS)** | The slowest step is 7-Zip compressing the packed app (~31k files, hundreds of MB). Use `build:win:dir` when you don’t need the installer. For full builds, set `nsis.compression: "normal"` or `"store"` in `package.json` → `build.nsis` to trade installer size for speed (e.g. 50–70% faster with `"store"`). |

### Rebuilding only what changed

- **Caches:** Expo/Metro and electron-builder already use caches. A full `build:win` reuses cached transforms and packed files where nothing changed, so rebuilds are partly incremental by default.
- **Skip the web build when only Electron changed:** If you only changed `windows/build.cjs` or other files in `windows/`, the icon, or `package.json` build config (not the React/app code), run **`npm run pack:win`** instead of `build:win`. That runs only electron-builder + clean and reuses the existing `dist/`. Ensure `dist/` is up to date (run `npm run build` once, or after any app/Expo changes).

---

## 2. Install process

### What runs

User runs **`HyperlinksSpaceAppInstaller.exe`**. NSIS extracts the app (e.g. to `%LOCALAPPDATA%` or Program Files), creates shortcuts, and optionally adds Start Menu / Desktop entries. After that, launching the app runs the already-extracted exe (no extraction at startup → fast launch).

### How to make install faster and more reliable

| Goal | What to do |
|------|------------|
| **Avoid “file locked” / long waits** | Add the project or `release` folder to Windows Defender (or AV) exclusions so the new exe isn’t scanned/locked during build. For end users, a one-time exclusion for the installer download folder can reduce install time. |
| **Faster first launch after install** | Install to an SSD if possible. First launch may trigger AV scan once; exclusions help. |
| **Fewer prompts** | NSIS can be configured for one-click install (no “Choose directory” step) to shorten the flow; current config can be tuned in `build.nsis` (e.g. `oneClick: true` if desired). |
| **Run installer as admin only if needed** | For per-machine install to Program Files, run the installer as Administrator. For per-user install (default), no admin needed. |

---

## 3. Improvements for both

| Area | Suggestion |
|------|------------|
| **Code signing** | Sign the installer and app exe (e.g. Windows Authenticode) so Windows and AV trust it. Reduces warnings and can speed up install/launch. |
| **Auto-updates** | Add `electron-updater` (or similar) and serve updates over HTTPS so users get patches without reinstalling. |
| **CI/CD** | In CI, cache `node_modules`, `.expo`, Metro cache, and `electron-builder` cache to make repeated builds much faster. |
| **Developer Mode (Windows)** | If you build on Windows and use exe editing (icon, etc.), Developer Mode avoids symlink errors during the winCodeSign step. |
| **Structured releases** | `windows/cleanup.cjs` puts each build in `releases/builder/build_<date>_<time>/` with the installer at root and all other artifacts in `dev/`. |

---

## 4. Quick reference

| Script | Use when |
|--------|----------|
| `npm run build:win` | Full build: Expo export + Electron + NSIS + clean. Use for releases. |
| `npm run pack:win` | Electron + clean only; reuses existing `dist/`. Use when only Electron/wrapper changed (no app code). |
| `npm run build:win:dir` | Same export + pack but no installer; output is `release/win-unpacked/`. Use for quick local runs. |
| `npm run build:win:verbose` | Full build with `DEBUG=electron-builder` for troubleshooting. |

---

## 5. File layout after build

- **After `build:win` or `pack:win`:** `app/releases/builder/build_MMDDYYYY_HHMM/HyperlinksSpaceAppInstaller_<stamp>.exe` and `app/releases/builder/build_MMDDYYYY_HHMM/dev/` (portable zip, yml, win-unpacked, blockmap, builder-debug.yml, builder-effective-config.yaml).
- **After `build:win:dir`:** `app/release/win-unpacked/` (run `app.exe` from there).
- **Build inputs:** `dist/` (Expo export), `windows/` (build.cjs, app-shell.html, preload-log.cjs), `assets/icon.ico`, and files listed under `build.files` in `package.json`.

---

## 6. Conclusions (build verbosity and improvements)

### What the slow step is

When you run a full Windows build with verbose logging (`build:win:verbose`), the long part is **7-Zip compressing the packed app** for the NSIS installer. electron-builder:

1. Builds the unpacked app (Expo export + Electron pack) into `release/win-unpacked/`.
2. Runs 7za to compress that into a single archive (e.g. `expo-template-default-53.0.43-x64.nsis.7z`).
3. Runs NSIS to wrap that archive into `HyperlinksSpaceAppInstaller.exe`.

Step 2 compresses a large number of files (tens of thousands) and hundreds of MB, so it dominates build time. The final installer size is much smaller (e.g. ~141 MB) but the compression work is heavy.

### Why the payload is big

The packed app under `release/win-unpacked/resources/app/` should contain only what’s in `build.files` (e.g. `dist/**/*`, `windows/**`, `assets/icon.ico`). If you see `node_modules` or other unneeded folders there, the payload is larger than necessary. Check with:

- `dir release\win-unpacked\resources\app` (or list that folder) before the installer step.

If `node_modules` is present, tighten `build.files` or add exclusions so only what the packaged app needs is included; that will also speed up the 7z step.

### How to improve the process

| Improvement | Action |
|-------------|--------|
| **Skip the slow step when possible** | Use `npm run build:win:dir` for daily work. You get the unpacked app and can run it from `release/win-unpacked/app.exe`; 7z and NSIS are skipped. |
| **Faster 7z at the cost of installer size** | In `package.json` → `build.nsis`, set `"compression": "normal"` or `"store"`. `"store"` (no compression) can cut installer build time by roughly 50–70%; the resulting `.exe` will be larger. |
| **Keep the table in §1** | Use the “How to make the build faster” table (skip Expo when possible, `npmRebuild: false`, AV exclusions, etc.) together with the compression and dir-build options above. |

### Summary

- **Slow step:** 7-Zip compressing the packed app (many files, large size) before NSIS.
- **Improvements:** Use `build:win:dir` when you don’t need the installer; lower NSIS compression for faster full builds; ensure only needed files are packed (no stray `node_modules`); use the other tips in this doc (pack-only script, caches, AV exclusions).
