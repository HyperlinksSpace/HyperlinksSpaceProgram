# Login with Telegram outside the Mini App (browser & native shells)

This document describes **how to authenticate users with Telegram when they are not inside the Telegram Mini App (TMA)** — for example on the **Welcome** screen in a normal browser, or inside **iOS/Android** when the app opens a WebView or system browser.

It complements:

- [`login-and-telegram-messages-architecture.md`](login-and-telegram-messages-architecture.md) — TMA uses signed **`initData`**; outside TMA you use a **different** Telegram mechanism.
- [`security_plan_raw.md`](security_plan_raw.md) — phased plan including `api/_lib/telegram_login.ts` and `POST /api/login/telegram`.

---

## 1. Two different “Telegram logins” (do not mix them)

| Context | What Telegram gives you | How you verify |
|--------|-------------------------|----------------|
| **Inside Telegram (Mini App)** | `Telegram.WebApp.initData` (string) | HMAC validation of **init data** (Bot API / [Web Apps docs](https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app)) |
| **Outside Telegram (website / WebView)** | Callback payload from the **Login Widget** (`id`, `username`, `auth_date`, `hash`, …) | HMAC validation of **widget** data ([Login Widget](https://core.telegram.org/widgets/login)) |

Same **Telegram user id** (`id` in the widget payload) can map to the same **`provider = telegram`** identity in your DB as TMA, but the **wire format and verification code** are **not** interchangeable with `initData`.

---

## 2. Official building block: Telegram Login for Websites

**Documentation:** [Telegram Login Widget](https://core.telegram.org/widgets/login)

### 2.1 BotFather setup

1. Create a bot with [@BotFather](https://t.me/BotFather) if you do not have one.
2. Use **/setdomain** (or the BotFather UI for the bot) to set the **domain** allowed to embed the widget — e.g. `app.hyperlinks.space` or your Vercel preview domain for staging.
3. Only the **exact origin** you configure can load the widget in a way Telegram will accept for that bot (same bot can power Mini App + website login).

### 2.2 What the widget does

- Renders a **“Log in with Telegram”** button (or custom embed).
- When the user authorizes, Telegram redirects the client with **user fields + `hash` + `auth_date`** (see official field list).
- You handle the result in the browser via **`data-onauth`** (script embed) or redirect URL parameters (depending on integration style).

### 2.3 Client flow (web)

1. **Embed** the widget on a page you control (e.g. `/welcome` or dedicated `/login/telegram` route on the same registered domain).
2. On success, the callback receives an object with at least: `id`, `first_name`, `hash`, `auth_date`, and optionally `username`, `last_name`, `photo_url`.
3. **Immediately send that payload to your backend** over HTTPS — do **not** treat the client as trusted until the server verifies `hash`.

---

## 3. Server-side verification (required)

**Rule:** Only your **server** may decide “this Telegram user is authenticated.” The browser only forwards the payload.

Per [Login Widget](https://core.telegram.org/widgets/login#checking-authorization):

1. Build the **data-check string** from all received fields **except** `hash`, sorted **alphabetically**, as `key=value` lines joined with `\n`.
2. Compute **secret key** = `SHA256(bot_token)` (binary).
3. Compute `HMAC-SHA256(secret_key, data_check_string)` and compare to `hash` (hex).
4. Enforce **`auth_date` freshness** (e.g. reject if older than 5 minutes or 24 hours — pick a policy and document it).

Implementation options:

- A small shared helper in `api/_lib/telegram_login.ts` (as in `security_plan_raw.md`).
- Community libraries (e.g. Node packages for “telegram login widget”) — still verify against the official algorithm above.

After verification, you trust **`id`** (Telegram user id) as the stable subject for `provider = telegram`.

---

## 4. Mapping to your app session

After the server validates the widget payload:

1. **Upsert user / identity** — link `telegram_user_id` to your internal `user_id` (same as TMA path, different proof).
2. **Issue a session** — HTTP-only cookie, JWT, or Supabase session — same as other OAuth providers on Welcome.
3. Return success to the client so Expo Router can navigate to `/(app)` (e.g. `/home`).

**Linking:** If the user already has an account via Google/email, use **verified linking** flows (see centralized auth plan) before merging identities.

---

## 5. Expo / React Native (outside browser)

Telegram does not ship a native “Sign in with Telegram” SDK comparable to Google/Firebase. Common patterns:

| Approach | Pros | Cons |
|----------|------|------|
| **In-app WebView** loading your **HTTPS** page with the widget | Reuses exact web flow + same backend | WebView settings, cookie/session handling, Apple ATS |
| **System browser** (`Linking.openURL`) to `https://your-domain/login/telegram` with **PKCE/state** or short-lived nonce | Strong separation, familiar OAuth-like UX | Return path via deep link / universal link |
| **Telegram deep link** `https://t.me/yourbot?start=...` | Brings user into Telegram | Does not by itself prove identity in your app — still need TMA or widget on web |

For “Login with Telegram” on native, the **widget on your domain + WebView or browser** is the standard approach referenced in internal docs (`security_plan_raw.md` §2.3).

---

## 6. UX and product notes

- **Labeling:** On web, “Sign in with Telegram” should open the **widget** flow; in TMA, “Continue with Telegram” should use **initData** (already aligned in product docs).
- **No wallet secrets:** Widget proves **identity** only — wallet keys remain governed by [`texts/final-security-model.md`](final-security-model.md) and wallet docs.
- **Rate limits / abuse:** Same as any login endpoint — throttle `POST /api/login/telegram`, log failures, optional CAPTCHA later.

---

## 7. Checklist for this repository

- [ ] BotFather **domain** matches production (and staging) web origins.
- [ ] `POST /api/login/telegram` (or equivalent) validates **`hash` + `auth_date`** per official docs.
- [ ] Welcome screen **“Sign in with Telegram”** (non-TMA) triggers widget embed or navigates to widget page — **no-op** until this exists (current stub behavior outside TMA is intentional).
- [ ] Session issuance aligned with Google/GitHub/email once Supabase or custom auth is wired.
- [ ] Optional: E2E test on a domain-allowed preview deployment (widget refuses wrong domain).

---

## 8. References (external)

- [Telegram Login Widget](https://core.telegram.org/widgets/login) — embed, fields, verification algorithm.
- [Mini Apps / init data](https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app) — **only** for inside-TMA flows.

---

## 9. Summary

**Outside Telegram**, “Login with Telegram” means the **Telegram Login for Websites** widget (or redirect variant) plus **server-side hash verification**, then issuing your normal app session. It is **not** `initData` from `Telegram.WebApp`. Unifying the **user record** on `telegram_user_id` keeps Mini App and web logins consistent while keeping verification code **separate and correct** for each surface.
