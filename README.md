![Preview Image](https://raw.githubusercontent.com/HyperlinksSpace/HyperlinksSpaceProgram/refs/heads/main/assets/images/PreviewImage.png)

# Hyperlinks Space Program

<u>**In progress, contribute!**</u>

This program is built upon [React Native](https://reactnative.dev/) by Meta and [Expo](https://expo.dev) multiplatform technologies, Windows build and executable creation achieved with [Electron Builder](https://www.electron.build/) and [Electron Forge](https://www.electronforge.io/), working in Telegram with help of [Telegram Mini Apps React SDK](http://telegram-mini-apps.com/), [Bot API](https://core.telegram.org/bots) and [Grammy](https://grammy.dev/). AI is backed by [OpenAI API](https://openai.com/ru-RU/api/), blockchain info is processed from [Swap.Coffee API](https://docs.swap.coffee/eng/user-guides/welcome). DB for the best user's experience we host on [Neon](https://neon.tech/).

## Program design

Access [Figma](https://www.figma.com/design/53lDKAD6pRv3e0uef1DP18/TECHSYMBAL-Inc.?node-id=754-71&t=v3tmAlywNgXkTWMd-1) in real time for contributing. Contact [Seva](t.me/sevaaignatyev) in Telegram to discuss and implement.

All core materials are available publicly for сгккуте hyperlinks.space team members' instant and easy access worldwide and our project's availability for newcomers' research only.

## Structure

- [`app`](./app) - Expo/React Telegram Mini App client (web/mobile screens, navigation, UI logic).
- [`ui`](./ui) - shared UI layer (components, theme tokens, and font configuration used by the app).
- [`bot`](./bot) - TypeScript Telegram bot service and runtime entrypoints.
- [`database`](./database) - database startup/migration/service scripts.
- [`ai`](./ai) - AI assistant service logic and model integration points.
- [`api`](./api) - backend API handlers and server-side endpoints.
- [`blockchain`](./blockchain) - TON/blockchain interaction logic and related helpers.
- [`telegram`](./telegram) - Telegram-specific integration utilities and adapters.
- [`windows`](./windows) - Electron desktop shell, NSIS installer config, and auto-update flow.
- [`scripts`](./scripts) - developer/ops scripts (local run, migration, release helpers).
- [`docs`](./docs) - project and operational documentation.
- [`backlogs`](./backlogs) - short-term planning notes and prioritized work items.
- [`assets`](./assets) - static assets used by app, installer, and branding.
- [`dist`](./dist) - generated web build output (export artifacts).

## How to fork and contribute?

1. Install GitHub CLI and authorize to GitHub from CLI for instant work

```
winget install --id GitHub.cli
gh auth login
```

2. Fork the repo, clone it and create a new branch and switch to it

```
gh repo fork https://github.com/HyperlinksSpace/HyperlinksSpaceBot.git --clone
git checkout -b new-branch-for-an-update
git switch -c new-branch-for-an-update
```

3. Make a commit (address unassigned issue or think yourself)

```
git add . # Stage changes on this branch
git commit -m "Describe your change" # Commit on this branch
```

3. After making a commit, make a pull request, gh tool will already know the upstream remote

```
gh pr create --title "My new PR" --body "It is my best PR"
```

4. For subsequent commits (sync `main`, create a fresh branch, and commit there)

```
git checkout main # Return to main
git fetch upstream # Fully sync with upstream main
git reset --hard upstream/main # Reset local main to upstream/main
git push origin main # Keep your fork main in sync too
git switch -c new-branch-for-next-update # Create and switch to a new feature branch
```

**Move in loops starting from the step 3.**

## Pull requests and commits requirements

- Give pull requests and commits a proper name and description
- Dedicate each pull request to an understandable area or field, each commit to a focused logical change
- Check file changes in every commit pulled, no arbitrary files modifications should persist such as LF/CRLF line-ending conversion, broken/garbled text diffs, BOM added or removed, accidental "invisible" corruption from text filters
- Add dependecies and packages step by step for security
- An issue creation or following an existing before a pull request would be a good practice

## Local deploy

`npm` package note: `.env.example` is included in the published package so you can use it as a reference for establishing your testing environment with `.env` file.

Before local deploy / cloud deploy, prepare these env-backed services:

1. **Neon PostgreSQL (`DATABASE_URL`)**
   - Create an account/project at [Neon](https://neon.tech/).
   - Create a database and copy the connection string.
   - Put it into `.env` as `DATABASE_URL=...`.
2. **OpenAI API (`OPENAI_API_KEY`)**
   - Create an account at [OpenAI Platform](https://platform.openai.com/).
   - Create an API key in the API Keys page.
   - Put it into `.env` as `OPENAI_API_KEY=...`.
3. **Telegram bot token (`BOT_TOKEN`)**
   - In Telegram, open [@BotFather](https://t.me/BotFather), create a test bot with `/newbot`.
   - Copy the bot token and put it into `.env` as `BOT_TOKEN=...`.
4. **Vercel project envs (for comfortable deploy/testing)**
   - Create a [Vercel](https://vercel.com/) account and import this repository as a project.
   - In Project Settings -> Environment Variables, set at least:
     - `DATABASE_URL`
     - `OPENAI_API_KEY`
     - `BOT_TOKEN` (or `TELEGRAM_BOT_TOKEN`)
   - Pull envs locally when needed with `vercel env pull .env.local`.

Copy env template locally:

```bash
cp .env.example .env
```

To start the full local stack, run:

```bash
npm run start
```

This runs Expo dev server, the Telegram bot (polling mode), and local Vercel API (`vercel dev`).

After `npm run start`, you can test the app on real phones with Expo Go:

- Install **Expo Go** from Google Play (Android) or App Store (iOS).
- Make sure your phone and development machine are on the same network.
- Open Expo Go and scan the QR code shown in the terminal/Expo UI.
- The app will launch on the device and hot-reload on code changes.

Isolated/local run options:

- Expo only (no bot, no Vercel): `npm run start:expo`
- Bot only (polling mode): `npm run bot:local`
- Vercel API only: `npm run dev:vercel`

## Milestone snapshot package (npm)

NPM release and snapshot details were moved to `docs/npm-release.md`.

### Local env setup

1. **Copy the example file** (from the repository root):
   ```bash
   cp .env.example .env
   ```
2. **Edit `.env`** and set at least:
   - **`BOT_TOKEN`** – if you run the Telegram bot locally (`npm run bot:local`).
3. **Expo app** – `npx expo start` reads env from the environment; for app-only env vars you can also put them in `.env` and use an Expo-compatible loader if you add one, or set them in the shell before running:
   ```bash
   export BOT_TOKEN=your_token
   npx expo start
   ```
4. **Bot local** – `npm run bot:local` loads `.env` from the project root (optional; you can also set `BOT_TOKEN` in the shell).

The `.env` file is gitignored; do not commit it.

## GitHub Actions

Current Actions workflows include:

- [`Vercel Deploy Test`](./.github/workflows/vercel-deploy-test-envs.yml) - manual web deploy to Vercel.
- [`NPM Package Release`](./.github/workflows/npm-package-release.yml) - npm/GitHub Packages release workflow.
- [`Electron EXE Release`](./.github/workflows/electron-exe-release.yml) and [`Electron Forge EXE Release`](./.github/workflows/electron-forge-exe-release.yml) - manual Windows release pipelines.
- [`EXPO Publish`](./.github/workflows/expo-publish.yml) - manual OTA publish with EAS CLI.
- [`Lint errors check`](./.github/workflows/lint-errors-check.yml) - manual lint check.

## Expo Workflows

This project uses two automation layers:

- [EAS Workflows](https://docs.expo.dev/eas/workflows/get-started/) for Expo update/build/deploy flows (triggered via npm scripts from [`package.json`](./package.json)).
- GitHub Actions for CI/CD tasks stored in `.github/workflows` (manual release/deploy jobs and checks).

### Previews

Run `npm run draft` to [publish a preview update](https://docs.expo.dev/eas/workflows/examples/publish-preview-update/) of your project, which can be viewed in Expo Go or in a development build.

### Development Builds

Run `npm run development-builds` to [create a development build](https://docs.expo.dev/eas/workflows/examples/create-development-builds/). Note - you'll need to follow the [Prerequisites](https://docs.expo.dev/eas/workflows/examples/create-development-builds/#prerequisites) to ensure you have the correct emulator setup on your machine.

### Deploy web build to Vercel

From the repository root, deploy the static web build to Vercel production:

```bash
vercel --prod
```

Deploying from repository root makes this folder the project root, so `api/bot` is deployed and no Root Directory setting is needed. The project is configured so Vercel runs `npx expo export -p web` and serves the `dist/` output. Link the project first with `vercel` if needed.

## Telegram bot

The bot is extended beyond a basic "Hello" and "Start program" responder and now supports AI streaming and threads.

**Vercel (webhook)**  
- **Runtime path:** Telegram sends updates to `POST /api/bot`. This route proxies to the shared bot webhook handler in `bot/webhook`.
- **Webhook setup:** `scripts/set-webhook.ts` sets `https://<base>/api/bot` using `VERCEL_PROJECT_PRODUCTION_URL` (preferred) or `VERCEL_URL`.
- **Required env:** set `BOT_TOKEN` (or `TELEGRAM_BOT_TOKEN`) in Vercel project envs for production deploys.
- **Deploy flow:** webhook mode is intended for Vercel deploys (CLI `vercel --prod` or the manual GitHub Action `Vercel Deploy (Test Envs)`).

**Bot works locally but not on Vercel**  
1. Confirm Vercel env has `BOT_TOKEN` and redeploy.
2. Ensure the deployed URL is stable and matches the webhook target (`/api/bot`).
3. Check deploy/runtime logs for `[set-webhook]` and `[webhook]` errors.
4. Do not run local polling with the same token while validating webhook mode.

**Local (getUpdates, no webhook)**  
- Only `BOT_TOKEN` is required (env or `.env`).
- Run bot only: `npm run bot:local`
- Run full local stack (Expo + bot + Vercel): `npm run start`
- Keep production and local bot tokens separate when possible to avoid webhook/polling conflicts.

## Program Kit

To make it easier for developers to create multiplatform programs with us, we decided to launch an npm package that provides a ready starter for creating such a program basis in one command.

```bash
npx @www.hyperlinks.space/program-kit ./new-program
```

Link to the package: https://www.npmjs.com/package/@www.hyperlinks.space/program-kit

## Where to discuss the project?

This repository has [GitHub Discussions](https://github.com/HyperlinksSpace/HyperlinksSpaceProgram/discussions) opened, as well you can join our [Telegram Chat](https://t.me/HyperlinksSpaceChat) and [Channel](https://t.me/HyperlinksSpace).