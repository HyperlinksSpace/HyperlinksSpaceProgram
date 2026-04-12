# Wallet implementation roadmap — align with the final security model and login UI

This document describes **what exists today**, **what to change** to match [`final-security-model.md`](final-security-model.md), and how that fits the **product login model** (Welcome screen: **Google, GitHub, Apple, Telegram, email**), consistent with [`login-and-telegram-messages-architecture.md`](login-and-telegram-messages-architecture.md).

---

## 1. Current implementation (baseline)

| Area | Today |
|------|--------|
| **Database** | Neon Postgres; `users` / `wallets` created in [`database/start.ts`](../database/start.ts). |
| **Wallet rows** | Public metadata: `wallet_address`, `wallet_blockchain`, `wallet_net`, `type`, labels, etc. Keyed primarily by **`telegram_username`** for lookups. |
| **Secrets** | No **`ciphertext`**, **`wrapped_dek`**, or AEAD metadata columns in the shipped schema; no envelope encryption wired to product flows. |
| **API** | [`api/_handlers/wallet-register.ts`](../api/_handlers/wallet-register.ts) / `wallet-status.ts` — **Telegram `initData`** auth only; same DB helpers as the bot. |
| **KMS** | GCP KMS **KEK** and [`api/_lib/envelope-*.ts`](../api/_lib/envelope-crypto.ts) are **probed** from diagnostics routes; not yet the single path for persisting user wallet secrets. |

So: **infrastructure for KMS + envelope exists**; **product wallet storage is still “address + Telegram identity,”** not the full model.

---

## 2. Target: what “fully making the model” means

1. **Envelope encryption in Postgres:** each wallet record (or a sibling row) stores **`ciphertext`**, **`wrapped_dek`**, **algorithm id / version**, **nonce/IV**, **KMS key version**, timestamps — **never** plaintext mnemonic or private key in a column.
2. **KEK only in GCP KMS** — wrap/unwrap DEKs via the vault path already aligned with [`infra/gcp/backend-authentication.md`](../infra/gcp/backend-authentication.md).
3. **Separation of duties:** user-facing API uses a **restricted DB role**; a **vault** service (or module + role) performs KMS operations and reads/writes envelope columns — **no shared superuser** for both planes in production (see `final-security-model.md` §5).
4. **Explicit trust variant:** document whether you ship **passphrase-derived client encryption** (non-custodial hybrid) or **custodial** unwrap/signing — same envelope shape, different who sees plaintext.

---

## 3. Login model compliance (Welcome screen)

The **Welcome** flow offers **Continue with Google, GitHub, Apple, Telegram**, and **email**. The security model requires **one canonical user** for wallets regardless of entry point.

### 3.1 Rules (from architecture docs, applied to wallets)

| Surface | Identity source | Wallet linkage |
|--------|------------------|----------------|
| **Telegram Mini App** | Verified **`initData`** → stable `telegram_user_id` / username | Map to internal **`user_id`**; wallet APIs must not assume Telegram is the only key forever. |
| **Web / native (Welcome screen)** | **OAuth** (Google, GitHub, Apple) or **email OTP** | Same **`user_id`** after you implement `auth_identities` (or equivalent): `(provider, provider_subject)` → one user. |
| **Cross-linking** | User may connect more providers later | Wallets are keyed by **`user_id`**, not by `telegram_username` alone. |

When the Welcome UI is shown **inside Telegram** (Mini App), **Continue with Telegram** still means **verified `initData`** → session — not the web Login Widget; see **§3.5**.

### 3.2 Schema direction

- Introduce a stable **`user_id`** (UUID or bigint) as the **primary owner** of wallet rows.
- Store **linked identities** in a separate table (e.g. `auth_identities`: `user_id`, `provider`, `provider_subject`, verified flags).
- **Migrate** existing `wallets.telegram_username` usage to **`user_id`** (backfill from `users` where Telegram already created the row).
- **APIs:** new routes accept **session / JWT / cookie** from your chosen auth (or Supabase Auth later) for web; TMA keeps **`initData`** verification server-side, then resolves to the same **`user_id`**.

Until **`user_id`** exists everywhere, **Google/GitHub/Apple/email** cannot attach wallets to the same logical account as TMA without ad-hoc merging — implement identity linking **before** or **in parallel with** envelope columns.

### 3.3 Logged-in user session storage

**Session storage** answers: *after* the user proves identity (OAuth, email OTP, or verified TMA `initData`), how does the app **keep them logged in** across requests and restarts, and how does the **server** know which **`user_id`** to apply?

**Terminology:** **Browser `sessionStorage`** (tab-scoped, cleared when the tab closes) is **not** the same thing as an **account login session**. In code and docs, name things so **tab session** vs **auth session** are not confused.

It is **orthogonal** to wallet envelope encryption: the login session is an **authorization signal** to your API and vault policy, **not** the KEK and **not** a substitute for `ciphertext` / `wrapped_dek` (see [`final-security-model.md`](final-security-model.md) §2 and [`auth-and-centralized-encrypted-keys-plan.md`](auth-and-centralized-encrypted-keys-plan.md) §3.3).

| Layer | What to store | Typical mechanisms |
|--------|----------------|-------------------|
| **Server** | Proof that a request belongs to **`user_id`** until expiry or logout | **Stateful:** opaque session id in **httpOnly** cookie → row in **`sessions`** (or equivalent) with `user_id`, expiry, rotation metadata. **Stateless:** short-lived **signed JWT** (`sub` = `user_id`) + optional **refresh token** with rotation and revocation. **Managed auth:** Supabase / Auth0-style session + refresh if you adopt them. |
| **Web (Welcome)** | Prefer **not** keeping long-lived access tokens in **`localStorage`** if XSS is a concern | **httpOnly + Secure + SameSite** cookies for session or refresh; or **memory-only** access token + refresh via cookie. Document **CSRF** protections if using cookies for mutating routes. |
| **Telegram Mini App** | `initData` is **per open**; it is not the same as a multi-day browser cookie | Verify `initData` server-side, then either **re-verify** on sensitive routes or **exchange once** for an **app session** (cookie on the webview origin or bearer issued by your API) scoped to that `user_id`. **Telegram CloudStorage / DeviceStorage / SecureStorage** are for **wallet/app blobs**, not a replacement for your backend session model—see [`storage-lifetime.md`](storage-lifetime.md). |
| **Native (Expo / desktop)** | Refresh or session handle | **Secure enclave–style** stores (e.g. **expo-secure-store**, OS keychain) for refresh tokens; avoid plain **AsyncStorage** for high-value tokens when a secure store exists. |

**Do not** place in “session” storage (browser session, JWT payload, or client prefs): **plaintext mnemonic**, **private keys**, **DEK**, or anything that equals **custodial key material** unless you have explicitly chosen that trust variant and secured the transport and endpoint. **Short-lived internal proofs** between user-plane API and vault (see `final-security-model.md` §5.2) belong in **server-side** issuance flows, not duplicated in client localStorage as long-lived secrets.

**Operational defaults to document:** session **TTL**, **idle timeout**, **logout** (invalidate server session / block refresh), **concurrent sessions** policy, and **token rotation** for refresh tokens.

### 3.4 Implementing all Welcome screen login methods

The reference UI (**Welcome to our program**) exposes five paths: **Google**, **GitHub**, **Apple**, **Telegram**, and **email** + **Continue**. All of them must converge on the same **`user_id`** and **`auth_identities`** model (§3.2), then issue an **auth session** (§3.3). Below is an implementation-oriented map; pick **one** auth stack and configure every provider through it when possible (fewer bespoke token handlers).

#### Shared behavior (every button)

1. **User taps** → start provider-specific sign-in (redirect, popup, or in-app browser).
2. **Provider proves identity** → you receive a **stable subject** (OAuth `sub`, Telegram `id`, or verified email).
3. **Server** upserts **`auth_identities`** (`provider`, `provider_subject`) → resolves or creates **`user_id`**.
4. **Server** issues **your** session (cookie / JWT pair) per §3.3; client stores only what that policy allows.
5. **Optional:** redirect to **return URL** (`/app` or deep link on native).

**Linking:** If `(provider, provider_subject)` already exists, attach session to that **`user_id`**. If the email or Telegram account is already known under another **`user_id`**, run a **verified linking** flow (signed-in user confirms merge) instead of silently merging.

#### Stack options (choose one primary path)

| Approach | Pros | You configure per provider |
|----------|------|------------------------------|
| **Supabase Auth** (or similar managed Auth) | Google / GitHub / Apple / email OTP built-in; less custom OAuth code | Enable each provider in dashboard; **redirect URLs** for web and Expo; Apple **Services ID** + key for Sign in with Apple |
| **Auth.js (Next.js)** / **Lucia** + OAuth | Self-hosted; full control | App registrations in Google Cloud, GitHub OAuth App, Apple Developer, Telegram bot + widget domain |
| **Custom OAuth + your API** | Maximum control | Same registrations; you implement **PKCE** (web), **token exchange**, and **session** issuance |

Expo / React Native: use the same provider apps and **redirect URIs** appropriate to the client (custom scheme or universal links); Apple and Google have **native SDKs** as an alternative to web OAuth in WebView.

#### Per control on the screen

**Continue with Google**

- **Web:** OAuth 2.0 **authorization code** flow with **PKCE** (or Supabase `signInWithOAuth({ provider: 'google' })`). Scopes: at least `openid email profile`; use **`sub`** as `provider_subject` for `google`.
- **Config:** Google Cloud Console → **OAuth client** (Web + iOS/Android if native); **authorized redirect URIs** must match your auth callback exactly.
- **Server:** On callback, exchange code → ID token / userinfo → upsert identity → session.

**Continue with GitHub**

- **Web:** Standard OAuth2; GitHub’s **numeric user `id`** (or documented stable id) as `provider_subject` for `github` (do not rely on mutable username alone as the sole key).
- **Config:** GitHub → **Developer settings** → OAuth App; authorization callback URL = your stack’s callback route.

**Continue with Apple**

- **Web:** **Sign in with Apple** (Apple JS button or redirect). Requires **Apple Developer**: Services ID, return URLs, and a **client secret** (JWT signed with a downloaded **.p8** key) when using Apple’s token endpoint—many teams use their auth provider to host this complexity.
- **iOS / native:** Prefer **Apple’s native** Sign in with Apple flow; still map **`user` / `sub`** to the same `auth_identities` row as web.
- **Note:** Apple may return a **private relay email**; treat email as **display** unless verified through your OTP or linking flow.

**Continue with Telegram**

- This is **not** Mini App **`initData`**. For **web Welcome**, use the **[Telegram Login Widget](https://core.telegram.org/widgets/login)** (or your auth provider’s Telegram integration if available).
- **Flow:** Embed the widget; on `data-onauth`, the client sends the auth payload to **`POST /api/.../telegram-login`** (or equivalent). **Server** validates **`hash`** and **`auth_date`** per Telegram’s widget docs, then trusts **`id`** (Telegram user id) as `provider_subject` for `telegram`.
- **Config:** **Bot** tied to the widget; **domain** allowlisted in BotFather for the widget.
- **Native:** Often implemented as **WebView** to the widget page or **deep link** to Telegram and back; same server validation.

**Email address + Continue**

- **Magic link or OTP:** User enters email → your backend or auth provider sends **one-time link** or **6-digit code**; user completes step → you mark email verified and create/login **`user_id`** with `provider_subject` = normalized email for `email` (or your provider’s convention).
- **Config:** SMTP or provider (SendGrid, etc.); **site URL** and **email templates**; rate-limit sends and attempts.
- **Security:** Short **TTL**, single use (or signed JWT with `exp`), do not leak whether an email exists if you need anti-enumeration.

#### Official documentation and service consoles

Use these when registering apps and implementing each flow.

| Method | Where to read / configure |
|--------|---------------------------|
| **Google** | [OAuth 2.0 overview](https://developers.google.com/identity/protocols/oauth2), [OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect), [Google Cloud Console — Credentials](https://console.cloud.google.com/apis/credentials) (create **OAuth 2.0 Client ID** for Web / iOS / Android). |
| **GitHub** | [Creating an OAuth App](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/creating-an-oauth-app), [Authorizing OAuth Apps](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps), [Developer settings](https://github.com/settings/developers). |
| **Apple** | [Sign in with Apple](https://developer.apple.com/sign-in-with-apple/), [Sign in with Apple JS / web](https://developer.apple.com/documentation/signinwithapplejs), [Certificates, Identifiers & Profiles](https://developer.apple.com/account/resources/identifiers/list) (Services ID, Sign in with Apple capability). |
| **Telegram (web — Login Widget)** | [Login Widget](https://core.telegram.org/widgets/login), [BotFather](https://t.me/BotFather) (set domain for the widget). |
| **Telegram (Mini App — initData)** | [Mini Apps](https://core.telegram.org/bots/webapps), [Validating data received via the Mini App](https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app) (HMAC verification with **bot token**). |
| **Email (magic link / OTP)** | If using **Supabase:** [Passwordless email (OTP / magic link)](https://supabase.com/docs/guides/auth/auth-email-passwordless); otherwise your SMTP provider (e.g. [Resend](https://resend.com/docs), [SendGrid](https://docs.sendgrid.com/)) + your API routes. |

Managed auth (optional): [Supabase Auth — Social login](https://supabase.com/docs/guides/auth/social-login) (Google, GitHub, Apple, etc.), [Auth.js providers](https://authjs.dev/getting-started/providers).

#### How to connect each provider (procedure)

**Google:** In Google Cloud Console → **APIs & Services** → **Credentials** → **Create credentials** → **OAuth client ID**. Add **Authorized JavaScript origins** (your web origin) and **Authorized redirect URIs** (your auth callback, e.g. `https://yourapp.com/api/auth/callback/google` or your provider’s exact path). In code, use authorization code + PKCE (or your stack’s `signInWithOAuth`). On success, read **`sub`** from ID token / userinfo → store as `auth_identities` for `google`.

**GitHub:** In GitHub → **Settings** → **Developer settings** → **OAuth Apps** → **New OAuth App**. Set **Homepage URL** and **Authorization callback URL** to your registered callback. Exchange code for access token server-side; fetch **`id`** from [user API](https://docs.github.com/en/rest/users/users#get-the-authenticated-user) → `provider_subject` for `github`.

**Apple:** In Apple Developer → **Identifiers** → create **App ID** (with Sign in with Apple) and **Services ID** for web; configure **Return URLs**. Create a **Key** for Sign in with Apple. Web: use Apple’s button / redirect flow; server validates `code` with Apple’s token endpoint using **client secret** (JWT signed with `.p8`). Map stable **`sub`** to `auth_identities` for `apple`.

**Telegram (Welcome / web browser):** Create a bot with [@BotFather](https://t.me/BotFather); set the **domain** allowed for the [Login Widget](https://core.telegram.org/widgets/login). Embed the widget; on auth, **POST** the payload to your API and verify **`hash`** / **`auth_date`** per docs. Use Telegram **`id`** as `provider_subject` for `telegram`.

**Telegram (inside Mini App — see §3.5):** No widget. Use **`Telegram.WebApp.initData`** (full string) → **server-side HMAC** validation with bot token → same `telegram` identity row as web when `id` matches.

**Email:** Configure SMTP or transactional email; implement **`POST /auth/email`** → send OTP or magic link with signed token; **`POST /auth/email/verify`** validates code or token → create session and `auth_identities` row with `email` + normalized address.

#### Environment and deployment checklist (all methods)

- [ ] **Redirect / callback URLs** registered for **production** and **preview** (Vercel) hostnames.
- [ ] **HTTPS** everywhere for OAuth callbacks.
- [ ] **Secrets** (OAuth client secrets, Apple `.p8`, Telegram bot token for widget validation) in env / secret manager, not in the repo.
- [ ] **CORS** and **cookie `SameSite`** aligned with whether the API is same-site or cross-origin.
- [ ] **Expo:** `app.json` / `app.config` **scheme** and **associated domains** for OAuth redirects.

For deeper product context (TMA vs Welcome), see [`login-and-telegram-messages-architecture.md`](login-and-telegram-messages-architecture.md) §3–4.

### 3.5 Login screen when logged out; “Continue with Telegram” inside Telegram

**Product rule:** If the user is **not authorized** (no valid **app session**, §3.3), **always show the login screen** — on **web**, **native**, and **inside Telegram** when the app runs as a **Mini App**. Do not skip straight to the main experience based only on “Telegram opened the WebApp”; the user must complete a **login action** so you can attach **`user_id`**, issue a **session**, and align with audit and consent expectations.

**Inside Telegram (Mini App):** The same Welcome UI can render. **Continue with Telegram** is the control that provides **instant access** in this environment:

1. User taps **Continue with Telegram**.
2. Client reads the **`initData`** string from [`Telegram.WebApp.initData`](https://core.telegram.org/bots/webapps#webappinitdata) (or uses the Web App’s init payload your stack exposes).
3. **Backend** verifies the signature using your **bot token** per [Validating data received via the Mini App](https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app).
4. On success, extract **`user.id`** (Telegram user id) → upsert **`auth_identities`** (`telegram`, `provider_subject` = that id) → **`user_id`** → issue **your** session (cookie / bearer) per §3.3.

**Same label, two implementations:** On **web Welcome**, **Continue with Telegram** uses the **[Login Widget](https://core.telegram.org/widgets/login)** (widget callback + `hash` validation). **Inside Telegram as a Mini App**, use **`initData`** verification instead — both resolve to the same **`telegram`** identity when the Telegram user id matches.

**Optional UX:** You may **pre-fill** or **highlight** Continue with Telegram when `Telegram.WebApp` is present, but **authorization** still happens only after verification + session issuance.

---

## 4. Phased roadmap (recommended order)

### Phase A — Identity foundation (blocks clean wallet crypto)

1. Add **`users.id`** as canonical **`user_id`** if not already the sole key; add **`auth_identities`** (or adopt Supabase Auth and map to your `user_id`).
2. Implement **Welcome** providers end-to-end for **at least one OAuth + email** on web, with the same **`user_id`** model as Telegram.
3. Choose and implement **logged-in session storage** per **§3.3** (server session + httpOnly cookie, or JWT access/refresh + rotation, or managed provider session): **TTL, logout, rotation**, cookie vs bearer per surface, CSRF strategy for cookie-based web sessions — and require this **verified session** on wallet APIs (not raw usernames).
4. Refactor wallet DB access from **`telegram_username`**-only to **`user_id`** (keep username as display metadata).

### Phase B — Envelope schema + migrations (Neon)

1. Migration: add nullable **`ciphertext`**, **`wrapped_dek`**, **`envelope_version`**, **`kms_key_name` or version id**, **`nonce`**, **`aead_alg`** to the wallet record (or a dedicated `wallet_secrets` table with `user_id` + `wallet_id` FK).
2. Backfill: existing rows may have **address-only**; mark them **`envelope_status = legacy_plain_address`** or similar until user re-seeds or migrates.
3. **DB roles:** create **`app_rw`** (no envelope columns if split) vs **`vault_rw`** — or use **RLS** / column-level grants on one DB (see `final-security-model.md`).

### Phase C — Vault service boundary

1. Move KMS wrap/unwrap + read/write of **`wrapped_dek` / `ciphertext`** into a **dedicated module or microservice** invoked only after **authorization** (valid session + policy).
2. User service credentials: **cannot** `SELECT` envelope columns if using role split on one Postgres.
3. Logging: structured audit for every unwrap (user id, request id, outcome).

### Phase D — Client and API contracts

1. **Create wallet:** client generates or receives key material per your trust variant → encrypt with DEK → server receives ciphertext + requests KMS wrap of DEK → store **`wrapped_dek` + ciphertext**.
2. **Sign / reveal:** only through defined flows; rate-limit unwrap; optional **user passphrase** step for non-custodial variant.
3. Deprecate any path that sends **mnemonic in clear** over the wire except inside TLS to a documented custodial endpoint (if you ever allow that).

### Phase E — Optional Supabase migration

- If you adopt **Supabase Auth**, migrate **identity** tables or sync `auth.users` mapping to your **`user_id`**; **wallet envelope tables** remain ordinary Postgres tables in the same project or stay on Neon until you consolidate.

---

## 5. Compliance checklist (login model × security model)

- [ ] Every Welcome provider resolves to **`user_id`** used in wallet FKs (implementation map: **§3.4**; links and setup steps in **§3.4** subsections).
- [ ] **Logged-out** users always see the login screen; in **Telegram Mini App**, **Continue with Telegram** performs **initData** verification and session issuance (**§3.5**), not silent auto-login.
- [ ] **Auth session** mechanism (cookie / JWT / provider session) is defined per §3.3: binds to **`user_id`**, expiry/rotation, and does not store wallet secrets or KEK client-side.
- [ ] Telegram TMA and web OAuth users can **link** accounts so one person does not get duplicate wallets.
- [ ] Wallet APIs require **proven identity** (verified `initData` or valid OAuth/email session), not guessable usernames.
- [ ] **No** plaintext wallet secrets in Neon; **KEK** only in **GCP KMS**.
- [ ] **No** shared DB superuser between “profile API” and “vault” in production.
- [ ] Incident + rotation procedures documented (see `final-security-model.md` §7).

---

## 6. Related documents

- [`texts/final-security-model.md`](final-security-model.md) — KEK/DEK, Neon/Supabase, GCP, service split.
- [`texts/login-and-telegram-messages-architecture.md`](login-and-telegram-messages-architecture.md) — TMA vs Welcome screen, linking.
- [`texts/auth-and-centralized-encrypted-keys-plan.md`](auth-and-centralized-encrypted-keys-plan.md) — deeper envelope + multi-provider narrative; session vs KEK (§3.3).
- [`texts/storage-lifetime.md`](storage-lifetime.md) — client storage tiers for wallet-related material (complements §3.3 login session).
- [`infra/gcp/backend-authentication.md`](../infra/gcp/backend-authentication.md) — KMS env and verification.

---

## 7. One-sentence summary

**Evolve wallets from Telegram-keyed address rows to `user_id`-keyed envelope rows (ciphertext + wrapped_dek) under GCP KMS, introduce real multi-provider identity linking to match the Welcome screen, and enforce vault vs user-plane DB roles — that is how the current code path grows into the final security model.**
