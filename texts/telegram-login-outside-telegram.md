# Telegram Login outside TMA (browser-first plan + DB writes)

This document defines the integration for **Telegram login outside Telegram Mini App** (normal browser first, then native wrappers).  
Goal: on `/welcome` in browser, Telegram button uses Telegram OAuth/OIDC and writes a verified identity to our DB.

It complements:

- `login-and-telegram-messages-architecture.md` — in-TMA auth via `initData`.
- `security_plan_raw.md` — security envelope and auth hardening.

---

## 1) Keep flows separate (critical)

| Context | Proof format | Verification |
|---|---|---|
| Inside Telegram Mini App | `Telegram.WebApp.initData` | HMAC validation for Mini Apps |
| Outside Telegram (browser/webview) | OIDC `code` -> `id_token` (or login JS callback payload) | OIDC token validation (issuer/audience/signature/exp/nonce) |

Both can map to the same app identity (`provider = telegram`, same Telegram user), but **verification code is different** and must not be mixed.

---

## 2) Browser integration choice

Use **Authorization Code Flow + PKCE** (Telegram OIDC endpoints), with optional Telegram login JS button for UX trigger.

- Authorization endpoint: `https://oauth.telegram.org/auth`
- Token endpoint: `https://oauth.telegram.org/token`
- JWKS: `https://oauth.telegram.org/.well-known/jwks.json`
- Discovery: `https://oauth.telegram.org/.well-known/openid-configuration`

Why this path:

- standard server-side code exchange
- cleaner replay protection with `state` + PKCE + `nonce`
- straightforward identity verification and audit trails

---

## 3) BotFather and web prerequisites

1. Configure bot in `@BotFather` Web Login.
2. Register allowed browser origins and callback URLs:
   - `https://<prod-domain>`
   - `https://<prod-domain>/auth/telegram/callback`
   - staging equivalents
3. Store secrets server-side only:
   - `TELEGRAM_CLIENT_ID`
   - `TELEGRAM_CLIENT_SECRET`
4. If using Telegram login JS popup, ensure `Cross-Origin-Opener-Policy` is compatible (`same-origin-allow-popups`).

---

## 4) Browser auth flow (exact)

1. User taps **Sign in with Telegram** on `/welcome`.
2. Frontend requests `POST /api/auth/telegram/start`.
3. Backend creates login attempt:
   - `state` (random, single use)
   - `nonce` (random, single use)
   - PKCE `code_verifier` and `code_challenge` (S256)
   - `redirect_uri` (whitelisted)
   - stores attempt in DB with TTL
4. Backend returns authorization URL.
5. Browser navigates to Telegram auth URL.
6. Telegram redirects to `/auth/telegram/callback?code=...&state=...`.
7. Backend callback handler:
   - validates `state` and attempt status
   - exchanges `code` at token endpoint (server-to-server)
   - validates `id_token` using JWKS (signature + `iss` + `aud` + `exp` + `nonce`)
   - extracts identity claims
   - upserts user + telegram identity
   - issues app session
8. Backend redirects to app route (`/home`) as authenticated user.

---

## 5) Database write model

Use three write targets to make auth debuggable and safe.

### 5.1 `auth_login_attempts` (ephemeral, anti-replay)

Fields:

- `id` (uuid, primary key)
- `provider` (`telegram`)
- `state_hash` (store hash, not raw state)
- `nonce_hash`
- `pkce_verifier_enc` (encrypted at rest) or hashed + retrievable strategy
- `redirect_uri`
- `status` (`created|consumed|expired|failed`)
- `created_at`, `expires_at`, `consumed_at`
- `ip`, `user_agent`
- `error_code` (nullable)

Rules:

- single-use attempt
- strict TTL (e.g. 10 min)
- mark consumed atomically

### 5.2 `auth_identities` (long-lived external identity link)

Fields:

- `id`
- `user_id` (internal FK)
- `provider` (`telegram`)
- `provider_subject` (Telegram `sub` or stable Telegram user id as string)
- `telegram_id` (optional denormalized numeric/string id)
- `username`, `display_name`, `picture_url`, `phone_number` (nullable, last known)
- `claims_version`
- `created_at`, `updated_at`, `last_login_at`
- unique index on (`provider`, `provider_subject`)

Rules:

- upsert by (`provider`, `provider_subject`)
- never trust profile fields without verified token path

### 5.3 `auth_login_events` (audit trail)

Fields:

- `id`
- `attempt_id`
- `provider`
- `event_type` (`start|callback_received|token_exchanged|token_validated|session_issued|failure`)
- `user_id` (nullable)
- `provider_subject` (nullable)
- `request_id`, `ip`, `user_agent`
- `meta_json` (sanitized error details)
- `created_at`

Rules:

- no raw tokens in logs
- store reason codes for failures (invalid_state, token_exchange_failed, invalid_signature, nonce_mismatch, expired_token)

---

## 6) Token validation policy (server)

For every `id_token`:

- verify JWS signature with JWKS key by `kid`
- `iss === https://oauth.telegram.org`
- `aud === TELEGRAM_CLIENT_ID`
- `exp` and `iat` are valid (clock skew tolerance <= 120s)
- `nonce` matches DB attempt
- reject reused `state` or attempt not in `created` state

Optional hardening:

- cache JWKS with short TTL and fallback refresh on unknown `kid`
- bind callback to same-origin CSRF cookie (double submit)

---

## 7) API shape for this repository

- `POST /api/auth/telegram/start`
  - input: optional return path
  - output: `{ authUrl }`
  - writes: `auth_login_attempts(start)` + `auth_login_events(start)`

- `GET /api/auth/telegram/callback`
  - input: `code`, `state`
  - internal: token exchange + id_token validation + upsert identity + create session
  - writes: attempts status, identity upsert, events
  - output: redirect to app page

- `POST /api/auth/telegram/link` (later)
  - link Telegram to an already-authenticated account with re-auth proof

---

## 8) Frontend behavior on browser

- In `WelcomeAuthButtons`, when **not in TMA**, Telegram button should call `/api/auth/telegram/start` and then navigate to returned `authUrl`.
- Keep existing TMA button behavior untouched (still `initData` flow).
- Show compact loading/error states:
  - popup blocked
  - cancelled auth
  - callback validation failed

---

## 9) Native later (iOS/Android)

Reuse the same backend flow. Open auth URL in system browser / custom tab, return via universal link/deep link to callback endpoint.  
No separate identity format is needed once OIDC callback path is live.

---

## 10) Implementation checklist

- [ ] BotFather allowed URLs configured for prod + staging.
- [ ] Add DB tables: `auth_login_attempts`, `auth_identities`, `auth_login_events`.
- [ ] Implement `/api/auth/telegram/start`.
- [ ] Implement `/api/auth/telegram/callback` with full token validation.
- [ ] Add browser branch in welcome Telegram button.
- [ ] Add rate limiting for start/callback routes.
- [ ] Add tests: success, invalid state, nonce mismatch, expired token, bad signature.

---

## 11) References

- [Telegram OpenID configuration](https://oauth.telegram.org/.well-known/openid-configuration)
- [Telegram JWKS](https://oauth.telegram.org/.well-known/jwks.json)
- [Telegram Login docs](https://oauth.telegram.org/js/telegram-login.js?3)
- [Mini Apps initData validation](https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app)
