# TDLib gateway without a credit card

Vercel cannot run TDLib. Every cloud VPS (GCP, Oracle, Fly, Railway) usually wants a card—even for “free tier.”

**No-card options that actually work:**

| Option | Card | Works with hsbexpo.vercel.app | PC must stay on |
|--------|------|-------------------------------|-----------------|
| Local dev only | No | No (use localhost) | While testing |
| **Cloudflare Quick Tunnel** | **No** | **Yes** | **Yes** |
| localtunnel (`npx`) | No | Yes | Yes |

There is no honest “24/7 public gateway, zero card, zero always-on machine” option. Something must run somewhere.

---

## Option A — Local only (simplest, no tunnel)

For development on your machine:

```bash
# .env
EXPO_PUBLIC_API_BASE_URL=http://localhost:3000
TELEGRAM_API_ID=...
TELEGRAM_API_HASH=...
TDLIB_GATEWAY_SECRET=any-long-random-string

npm run tdlib:gateway   # terminal 1
npm run web             # terminal 2
```

Open the app at **localhost**, not hsbexpo.vercel.app.

---

## Option B — Cloudflare Quick Tunnel (no account, no card)

Exposes your local gateway as a public **HTTPS** URL so **production Vercel** can reach it.

1. Install [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/) (one-time).

2. Terminal 1 — gateway:

   ```bash
   npm run tdlib:gateway
   ```

3. Terminal 2 — tunnel (no login required):

   ```bash
   npm run tdlib:tunnel:cloudflare
   ```

   Uses `cloudflared --config nul` so an old `~/.cloudflared/config.yml` or `credentials.json` does not break quick tunnels.

   Copy the **new** `https://….trycloudflare.com` URL from the box in the terminal (it changes every restart).

4. Test in browser (wait ~30s after tunnel starts):

   ```
   https://YOUR-URL.trycloudflare.com/v1/health
   ```

   Expect JSON like `{"ok":true,...}`. If you see a plain Chrome “page can't be found”, the tunnel URL is stale or cloudflared lost connection — stop tunnel (Ctrl+C) and run step 3 again.

5. **Vercel** → project **hsbexpo** → Settings → Environment Variables:

   | Variable | Value |
   |----------|--------|
   | `TDLIB_GATEWAY_URL` | `https://….trycloudflare.com` (no trailing slash) |
   | `TDLIB_GATEWAY_SECRET` | Same as in your `.env` |
   | `TELEGRAM_API_ID` | From https://my.telegram.org/apps |
   | `TELEGRAM_API_HASH` | From https://my.telegram.org/apps |

6. Redeploy Vercel (`vercel --prod` or push to main).

7. Test: `curl https://YOUR.trycloudflare.com/v1/health`

**Caveats:** URL changes every time you restart the tunnel. Your PC must stay on. Fine for personal/small prod; not ideal for a public product long-term.

---

## Option C — localtunnel (no install except npm)

```bash
npm run tdlib:public
```

Uses `npx localtunnel --port 8787`. Copy the printed `https://….loca.lt` URL into Vercel as `TDLIB_GATEWAY_URL`.

Same caveats as Option B (ephemeral URL, PC must stay on).

---

## What still runs where

```
Browser → Vercel (free, no card for hobby) → your tunnel URL → your PC (tdlib:gateway)
                ↓
            Neon Postgres (free tier)
```

---

## When you later get a card or a spare machine

- **Oracle Always Free VM** — always-on, no monthly fee if you stay in free limits (card often required for signup only).
- **GCP** — `npm run gcp:tdlib-gateway` after billing works.

Until then, **Option B** is the usual way to use Connect on the deployed site without paying or adding a card.
