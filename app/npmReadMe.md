# Program Kit

Program Kit is a production-ready cross-platform starter published from `app/`.
It is built around React Native + Expo and is designed to be quickly tested, scaled,
and deployed across popular platforms.

## What You Get

- Expo + React Native app foundation
- Telegram bot support (webhook + local bot scripts)
- Telegram Mini App-ready client structure
- Android and iOS workflow scripts
- Windows desktop packaging (`.exe`) with Electron Builder
- CI-oriented release workflow and deployment helpers

## Install

### npmjs (public)

```bash
npx @www.hyperlinks.space/program-kit ./my-new-program
```

### GitHub Packages

```bash
npx @hyperlinksspace/program-kit ./my-new-program
```

If you install from GitHub Packages, configure `.npmrc` with the `@hyperlinksspace`
registry and token.

## After Scaffold

```bash
cd my-new-program
npm install
npm run start
```

Then open the project `README.md` for full setup details (env vars, bot setup, build
and release commands).

## Release Channels

- `latest` for stable milestone snapshots
- `next` for rolling preview snapshots

## Notes

- Published directly from the `app/` folder.
- Package tarball is filtered to include only required project files.
- **`fullREADME.md`** in the package is the full in-repo developer guide (Expo setup, scripts, and the rest of the project readme).
