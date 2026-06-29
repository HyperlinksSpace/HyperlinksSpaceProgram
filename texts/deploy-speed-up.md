Your Vercel deploys are slow because each production build runs several heavy steps in sequence, on a clean or partially cached machine. Here is what your project actually does and what helps.

## What runs on every Vercel deploy

From `vercel.json`:

```3:4:vercel.json
  "buildCommand": "npm run db:migrate && npx expo export -p web --output-dir .vercel/output/static && npx tsx scripts/set-webhook.ts",
  "outputDirectory": ".vercel/output/static",
```

So each deploy is roughly:

| Phase | What it does | Typical cost |
|--------|----------------|--------------|
| **1. Install** | `npm install` — full dependency tree | ~1–3 min (cold), ~30s–1 min (cache hit) |
| **2. DB migrate** | `npm run db:migrate` → Neon DDL over the network | ~5–30 s |
| **3. Expo web export** | Metro bundles the whole app (~1800+ modules) | **~2–4 min** (often the biggest chunk) |
| **4. Set webhook** | HTTP call to Telegram during build | ~1–15 s |
| **5. Serverless bundle** | Vercel compiles all `api/**/*.ts` functions | ~1–2 min |
| **6. Upload + promote** | Static assets + function zips | ~30s–1 min |

**Total:** often **5–10 minutes**, sometimes more on a cold cache. A past failed deploy logged **~156 s for the web bundle alone** — that matches a large Expo/Metro export, not a tiny static site.

---

## Why it got slower / feels heavy

### 1. Expo web export is a full bundling job
`expo export -p web` is not “copy static files.” Metro walks and bundles the entire React Native Web app every time. More messages/TDLib/UI code → longer bundle time.

### 2. `npm install` pulls desktop-only packages
`package.json` includes **Electron**, **electron-builder**, **electron-forge**, etc. Vercel still installs them even though production only needs web + API. That inflates install time and cache size.

Native TDLib (`prebuilt-tdlib`, `tdl`) is also in the tree for local gateway work. API routes talk to Railway via HTTP, but those packages still land in `node_modules` unless you prune them.

### 3. Migrations run inside the build
Schema migrations run **before** the frontend build and block everything else. They must run somewhere, but tying them to every deploy adds latency and a network round-trip to Neon on every push.

### 4. Webhook setup runs in the build
`set-webhook.ts` runs on every deploy. It is quick when it skips, but when `BOT_TOKEN` is set it adds another network step in the critical path.

### 5. Many serverless functions
You have a large `api/` surface (catch-all + auth routes + wallet routes). Vercel bundles each deployment target separately after the static build.

### 6. Cache misses
Vercel caches `node_modules` when `package-lock.json` is unchanged. Any dependency change → cold-ish install. **Metro/Expo cache is not cached by default** unless you configure it, so the web export often rebuilds from scratch.

---

## Practical ways to speed it up

### Quick wins (no architecture change)

1. **Rely on Vercel’s `node_modules` cache**  
   Avoid unnecessary `package-lock.json` churn. Fewer lockfile changes → faster installs.

2. **Skip migrate on preview deploys**  
   Set env `SKIP_DB_MIGRATE=1` for Preview only; keep migrations on Production. Your script already supports this:

```4:8:scripts/migrate-db.ts
  if (process.env.SKIP_DB_MIGRATE === '1') {
    console.log(
      '[db] SKIP_DB_MIGRATE=1 — skipping migrations (e.g. local vercel dev without DB).',
    );
    return;
  }
```

3. **Run webhook only on production**  
   Gate `set-webhook.ts` with `VERCEL_ENV === 'production'` so preview builds skip it.

4. **Expand `.vercelignore`**  
   Exclude things Vercel never needs: `windows/`, `releases/`, `first_counter/`, `.tdlib-data/`, large docs/backlogs. That speeds upload and slightly reduces work; it does not fix Metro time by itself.

5. **Custom `installCommand` to prune desktop deps**  
   Example pattern:
   ```bash
   npm ci && node scripts/prune-vercel-install.mjs
   ```
   Script removes `electron`, `electron-builder`, `@electron-forge/*`, and optionally `prebuilt-tdlib` / `tdl` if the API bundle does not import them. This can shave **1–2 minutes** off install on cold builds.

6. **Cache Metro/Expo** (Vercel project settings)  
   Add cache paths such as `node_modules/.cache`, `.expo`, and Metro’s cache dir so repeated exports reuse work when source changes are small.

### Bigger wins (more setup)

7. **Prebuilt deploy (`vercel deploy --prebuilt`)**  
   Build once in GitHub Actions (with `actions/cache` for npm + Metro), then deploy artifacts without rebuilding on Vercel. Your workflow already runs `npm run build` separately; wiring it to **prebuilt** deploy avoids doing Expo export twice.

8. **Split frontend vs API deploys**  
   Frontend-only changes would not redeploy every serverless function, and vice versa. More moving parts, but best for frequent UI iteration.

9. **Faster build machines**  
   Vercel Pro/Enterprise offers larger builders — linear speedup on Metro + npm.

10. **Frontend-only updates via EAS Update** (Expo)  
    For mobile/TMA clients that support it, OTA updates can avoid a full Vercel rebuild for pure UI changes. Your repo already has EAS workflow scripts; that is a different delivery path from `vercel --prod`.

---

## What I would prioritize for this repo

1. **Prune Electron/TDLib from Vercel install** — biggest easy win.  
2. **Cache Metro/Expo** in Vercel build settings.  
3. **Skip migrate + webhook on Preview** — faster iteration deploys.  
4. **Prebuilt deploy from CI** — if you deploy often and want Vercel to mostly upload, not rebuild.

---

## What will not help much

- Tweaking photo/message UI code alone — bundle size may grow slightly, but the dominant cost is “full Expo export + full npm install,” not a few KB of TS changes.
- Deploying only the frontend without redeploying the **TDLib gateway on Railway** — that is a separate service; Vercel slowness is mostly the steps above.

If you want, I can add a small `scripts/prune-vercel-install.mjs` and adjust `vercel.json` (`installCommand`, conditional migrate/webhook) so the next deploy is noticeably faster without changing app behavior.