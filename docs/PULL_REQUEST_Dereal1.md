# Pull request: Sync upstream (3 commits) into Dhereal1/HYPEANDLINKSBOT

## How to open the PR

1. Open this URL in your browser (it pre-fills base and head for the PR):
   **https://github.com/Dhereal1/HYPEANDLINKSBOT/compare/main...HyperlinksSpace:HyperlinksSpaceBot.main**

2. If that URL does not work, go to https://github.com/Dhereal1/HYPEANDLINKSBOT, click **Pull requests** → **New pull request**, set:
   - **base:** `main` (Dhereal1/HYPEANDLINKSBOT)
   - **compare:** `HyperlinksSpace/HyperlinksSpaceBot` → branch `main`

3. Use the **Title** and **Description** below.

---

## Title

```
Sync upstream: Vercel deployable app and bot, local run with getUpdates
```

## Description

```
Brings in 3 commits from HyperlinksSpace/HyperlinksSpaceBot:

- **97602de** indent fix
- **c6be141** Expo updated
- **ff284a3** Vercel deployable app and bot, local run with get updates

---

### Summary of changes

- **Expo app (app/):** Simplified to a single screen + layout; removed tabs and extra components. Ready for Vercel (`npx expo export -p web`).

- **Telegram bot (Grammy):** Minimal bot in `app/bot/` (replies Hello, /start). Webhook handler in `app/bot/webhook.js` (GET sets webhook, POST handles updates); `app/api/bot.js` exposes it as a Vercel serverless route with named GET/POST. Webhook is set automatically on deploy via `scripts/set-webhook.js`. Optional `SELF_URL` for production domain (e.g. https://yourapp.vercel.app); `bot.init()` before `handleUpdate` for webhook mode.

- **Local run:** `scripts/run-bot-local.js` runs the bot with getUpdates (polling); only `BOT_TOKEN` needed. `npm run start` runs Expo + bot; `npm run bot:local` runs bot only.

- **Config:** `vercel.json` (build: expo export + set-webhook), `.env.example`, README updates for env, Vercel deploy, and logging/debugging.
```
