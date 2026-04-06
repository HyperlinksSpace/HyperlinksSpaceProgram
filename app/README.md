# Welcome to your Expo app 👋
This is an [Expo](https://expo.dev) project created with [`create-expo-app`](https://www.npmjs.com/package/create-expo-app).

## Get started

To start the app (and the Telegram bot in polling mode), run:

```bash
npm run start
```

This runs both the Expo dev server and the bot. For Expo only (no bot), use `npm run start:expo`.

## Milestone snapshot package (npm)

This repository includes a publishable snapshot package for fast developer bootstrap:

- package source: `app/` (published directly, no duplicate snapshot folder)
- **npmjs (public):** `@www.hyperlinks.space/program-kit` — manage org and tokens: [www.hyperlinks.space on npm](https://www.npmjs.com/settings/www.hyperlinks.space/packages)
- **GitHub Packages:** `@hyperlinksspace/program-kit` (same version; GitHub requires the package scope to match this repo’s owner)

**npm ownership:** your token must be allowed to publish under scope `@www.hyperlinks.space` (org members or automation token with access to that org).

### Verify publish payload locally

The npm package page uses `README.md` from the published tarball, not `npmReadMe.md`. Match CI by copying the npm readme before `npm pack`, then restore the repo readme:

```bash
cp npmReadMe.md README.md
npm pack --dry-run
git checkout -- README.md
```

### Install snapshot as a developer

```bash
npx @www.hyperlinks.space/program-kit ./my-hsp-app
```

The CLI materializes the bundled package payload into your target folder, then you run:

```bash
cd my-hsp-app
npm install
```

### Release channels

- `latest`: immutable stable snapshots (tag workflow `snapshot-vX.Y.Z`)
- `next`: rolling snapshots from manual workflow dispatch

In the output, you'll find options to open the app in:

- [a development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [an Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [an iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

You can start developing by editing the files inside the **app** directory. This project uses [file-based routing](https://docs.expo.dev/router/introduction).

### Local env setup

1. **Copy the example file** (from the `app/` directory):
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

## Workflows

This project is configured to use [EAS Workflows](https://docs.expo.dev/eas/workflows/get-started/) to automate some development and release processes. These commands are set up in [`package.json`](./package.json) and can be run using NPM scripts in your terminal.

### Previews

Run `npm run draft` to [publish a preview update](https://docs.expo.dev/eas/workflows/examples/publish-preview-update/) of your project, which can be viewed in Expo Go or in a development build.

### Development Builds

Run `npm run development-builds` to [create a development build](https://docs.expo.dev/eas/workflows/examples/create-development-builds/). Note - you'll need to follow the [Prerequisites](https://docs.expo.dev/eas/workflows/examples/create-development-builds/#prerequisites) to ensure you have the correct emulator setup on your machine.

### Production Deployments

Run `npm run deploy` to [deploy to production](https://docs.expo.dev/eas/workflows/examples/deploy-to-production/). Note - you'll need to follow the [Prerequisites](https://docs.expo.dev/eas/workflows/examples/deploy-to-production/#prerequisites) to ensure you're set up to submit to the Apple and Google stores.

## Hosting

Expo offers hosting for websites and API functions via EAS Hosting. See the [Getting Started](https://docs.expo.dev/eas/hosting/get-started/) guide to learn more.

### Deploy web build to Vercel

From this directory (`app/`), deploy the static web build to Vercel production:

```bash
vercel --prod
```

Deploying from `app/` makes this folder the project root, so `api/bot` is deployed and no Root Directory setting is needed. The project is configured so Vercel runs `npx expo export -p web` and serves the `dist/` output. Link the project first with `vercel` if needed.

### Telegram bot (Grammy)

A minimal bot that replies "Hello" is included. It is deployable on Vercel via webhook and runnable locally with getUpdates.

**Vercel (webhook)**  
- **Env for deploy:** In Vercel → **Settings → Environment Variables** add **`BOT_TOKEN`** (or `TELEGRAM_BOT_TOKEN`). Assign to **Production** (and to **Build** if your dashboard has that option) so the deploy-step webhook script can run. The webhook URL is built from Vercel’s `VERCEL_PROJECT_PRODUCTION_URL` or `VERCEL_URL`.
- **Webhook on deploy:** Each build runs `scripts/set-webhook.ts` and calls Telegram `setWebhook` with the base URL + `/api/bot`. If the script fails (e.g. missing URL or Telegram error), the build fails so you see the error in the deploy log.
- Telegram sends updates to **POST** `/api/bot`; the bot replies "Hello".

**Bot works locally but not on Vercel**  
1. Open **GET** `https://<your-app>.vercel.app/api/bot` in a browser. The JSON shows:
   - `bot: true` → BOT_TOKEN is set; `bot: false` → add BOT_TOKEN in Vercel → Settings → Environment Variables (Production), then redeploy.
   - `expected_url` → URL we use for the webhook (from VERCEL_PROJECT_PRODUCTION_URL or VERCEL_URL).
   - `telegram_has` → URL Telegram actually has. It must match your production URL (e.g. `https://hsbexpo.vercel.app/api/bot`). If it’s `(none)` or different, ensure the project’s production domain is set in Vercel and redeploy so set-webhook.ts runs with the correct URL.
   - `webhook_set: true` → last setWebhook call succeeded.
2. **Root directory:** Only needed if you deploy via Git (auto-deploy from the repo). Then set **Root Directory** to **`app`** in Vercel → Project Settings → General. If you always run `vercel --prod` from inside `app/`, the CLI uses this folder as the project root and you don’t need to set it.
3. **Logs:** After sending /start, check **Logs** for `[webhook] POST update` and any `[bot]` errors (e.g. handler_error, timeout).
4. Don’t run the same bot in polling locally while testing the webhook (or Telegram may deliver updates to the wrong place).

**Local (getUpdates, no webhook)**  
- Only `BOT_TOKEN` is required (in env or `.env`).
- Run the bot in polling mode (do not use the same token with webhook set elsewhere):
  ```bash
  npx tsx scripts/run-bot-local.ts
  ```
- `npm run start` runs both Expo and the bot; or run the bot alone with `npm run bot:local`.

## Get a fresh project

When you're ready, run:

```bash
npm run reset-project
```

This command will move the starter code to the **app-example** directory and create a blank **app** directory where you can start developing.

## Learn more

To learn more about developing your project with Expo, look at the following resources:

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.

## Join the community

Join our community of developers creating universal apps.

- [Expo on GitHub](https://github.com/expo/expo): View our open source platform and contribute.
- [Discord community](https://chat.expo.dev): Chat with Expo users and ask questions.
