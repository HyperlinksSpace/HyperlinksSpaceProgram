# Electron Forge (Windows)

Forge config and helpers live under `windows/forge/`.

This packages your existing Electron main process:

- `../build.cjs`

## Configuration

Forge loads config via `package.json` → `config.forge` → `./windows/forge/forge.config.js` (no root `forge.config.js` wrapper).

## Build

From `app/`, run:

```bash
npm run make:win:forge
```

This will:

1. Build the Expo web `dist/`
2. Run Electron Forge `make` (Windows NSIS + zip makers)
3. Run `windows/forge-cleanup.cjs` into `releases/forge/build_<stamp>_forge/`

## Release layout (mirrors builder; tag ends with `_forge`)

Each Forge build folder:

- `releases/forge/build_MMDDYYYY_HHMM_forge/HyperlinksSpaceProgramInstaller_<stamp>.exe` (root only)
- `releases/forge/build_MMDDYYYY_HHMM_forge/dev/latest.yml`
- `releases/forge/build_MMDDYYYY_HHMM_forge/dev/HyperlinksSpaceProgram_<version>.zip`
- `releases/forge/build_MMDDYYYY_HHMM_forge/dev/zip-latest.yml`
- `releases/forge/build_MMDDYYYY_HHMM_forge/dev/` — unpacked app, blockmaps, etc.

CI flattens the four release assets into `releases/electron/build_<timestamp>_forge/` for GitHub upload.

## Notes

The Forge NSIS maker reads `package.json` `build` (app-builder-lib), so behavior can align with electron-builder.

### CI: `node-gyp` / Visual Studio / `tdl`

GitHub `windows-latest` may ship **Visual Studio 2026** before `@electron/node-gyp` recognizes it. Forge also used to copy the full repo and **rebuild native `tdl`** (TDLib) even though the desktop app only loads `dist/` + `windows/build.cjs`.

`forge.config.js` now:

- **`rebuildConfig.ignoreModules`** — skip `tdl`, `prebuilt-tdlib`, `react-native-fast-pbkdf2`
- **`packagerConfig.ignore`** — omit server/TDLib paths from the packaged app (same intent as `build.files` for electron-builder)

If rebuild still fails on a new native dependency, add it to `FORGE_REBUILD_IGNORE_MODULES` or extend `shouldIgnorePackagerPath`.
