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
npx @www.hyperlinks.space/program-kit ./new-program
```

### GitHub Packages

```bash
npx @hyperlinksspace/program-kit ./new-program
```

If you install from GitHub Packages, configure `.npmrc` with the `@hyperlinksspace`
registry and token.

## After Scaffold

**Recommended, not required:** copy `npmrc.example` to `.npmrc` so installs match this repo (`legacy-peer-deps`; npm does not ship a real `.npmrc` in the tarball for security). Equivalent: skip the copy and run **`npm install --legacy-peer-deps`** (or plain **`npm install`** if it completes without peer errors).

```bash
npm i
npm run start
```

`npm run start` runs **`vercel dev`** alongside Expo and the bot. The Vercel CLI must be **logged in**; otherwise you may see errors such as **“The specified token is not valid”** or prompts that fail in non-interactive runs.

- Run **`vercel login`** once in the project directory (use **`vercel link`** if the CLI asks to connect the folder to a project).
- If the token is invalid or expired, run **`vercel login`** again.
- To work **without** local Vercel, use **`npm run start:expo`** (Expo only) or run **`npm run bot:local`** / **`npm run dev:vercel`** separately as documented in **`README.md`**.

Then open the project **`README.md`** (or **`fullREADME.md`** if your scaffold renames it) for details (env vars, bot setup, build and release commands).

## Release Channels

- `latest` for stable milestone snapshots
- `next` for rolling preview snapshots

## Notes

- Published from the repository root; the pack includes everything except patterns in [`.npmignore`](./.npmignore) (no `files` whitelist in `package.json`).
- `.npmrc` cannot be published on npm; `npmrc.example` is included so you can copy it locally.

## Matching local development

Use the same setup you would after cloning this repo:

1. **Node** — Prefer the version in [`.nvmrc`](./.nvmrc) (aligned with [`package.json`](./package.json) `engines`).
2. **npm install** — Copy [`npmrc.example`](./npmrc.example) to `.npmrc`, then run `npm install` (same `legacy-peer-deps` behavior as a local checkout with a root `.npmrc`).
3. **Env** — Copy [`.env.example`](./.env.example) to `.env` and fill variables (see **`README.md`** in the repo).
4. **Vercel CLI** — For the full stack (`npm run start`), run **`vercel login`** (and **`vercel link`** if needed). See the **Vercel CLI and `npm run start`** subsection above and **`README.md`** → *Local deploy* for the “invalid token” case.

The tarball does not ship `package-lock.json` (by [`.npmignore`](./.npmignore)); the first install generates a lockfile for your machine, like cloning without a committed lock.
