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

- `releases/forge/build_MMDDYYYY_HHMM_forge/HyperlinksSpaceAppInstaller_<stamp>.exe` (root only)
- `releases/forge/build_MMDDYYYY_HHMM_forge/dev/latest.yml`
- `releases/forge/build_MMDDYYYY_HHMM_forge/dev/HyperlinksSpaceApp_<version>.zip`
- `releases/forge/build_MMDDYYYY_HHMM_forge/dev/zip-latest.yml`
- `releases/forge/build_MMDDYYYY_HHMM_forge/dev/` — unpacked app, blockmaps, etc.

CI flattens the four release assets into `releases/electron/build_<timestamp>_forge/` for GitHub upload.

## Notes

The Forge NSIS maker reads `package.json` `build` (app-builder-lib), so behavior can align with electron-builder.
