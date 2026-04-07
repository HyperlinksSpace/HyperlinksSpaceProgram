# Program Kit

Program Kit is a production-ready cross-platform starter published from repository root.
It is built around React Native + Expo and is designed to be quickly tested, scaled,
and deployed across popular platforms.

## What You Get

- Expo + React Native app foundation
- Telegram bot support (webhook + local bot scripts) with AI functionality
- Telegram Mini App-ready client structure
- Android and iOS clients
- Windows desktop packaging (`.exe`) with Electron Builder
- CI-oriented release workflow and deployment helpers
- OpenAI functionality and Swap.Coffee for blockchain data retrievement

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

Then open the project **`fullREADME.md`** for details (env vars, bot setup, build
and release commands).

## Release Channels

- `latest` for stable milestone snapshots
- `next` for rolling preview snapshots

## Notes

- Published directly from the `app/` folder.
- Package tarball is filtered to include only required project files.
