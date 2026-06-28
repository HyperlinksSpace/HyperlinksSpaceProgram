# Sign in by email: IdP vs own server, and Vercel vs Railway

This document answers how **email sign-in** fits **Hyperlinks Space Program** today: whether you need a managed **IdP** (identity provider), whether you can run your own confirmation server, and where that code should live (**Vercel** vs **Railway**).

Related docs: [`email-confirmation-options.md`](email-confirmation-options.md) (generic patterns and mail vendors), [`wallet-implementation-roadmap-and-login-alignment.md`](wallet-implementation-roadmap-and-login-alignment.md) §3.4 (Welcome screen providers), [`login-and-telegram-messages-architecture.md`](login-and-telegram-messages-architecture.md).

---

## Short answer

| Question | Answer for this repo |
|----------|----------------------|
| Do I need an IdP (Supabase Auth, Clerk, Auth0, …)? | **No, not required.** You already run **custom OAuth** on Vercel for Google, GitHub, Apple, and Telegram. Email can follow the **same pattern**: Vercel API routes + Neon DB + session cookie. |
| Can I make my own server for email confirmation? | **Yes.** That is the natural fit here. You still need a **transactional email API** (Resend, SendGrid, Brevo, SES, …) to deliver mail—you do not run your own SMTP stack unless you want to. |
| Vercel or Railway? | **Vercel.** Email auth is request/response (send OTP, verify code, issue session). Railway is for **long-running** work (TDLib gateway), not for this. |

---

## 1) What “sign in by email” means in the Welcome flow

The Welcome screen already exposes **email + Continue** ([`WelcomeAuthButtons.tsx`](../ui/components/WelcomeAuthButtons.tsx)); the handler is still a stub. Product intent (from login architecture docs):

1. User enters email.
2. Backend sends a **one-time code** (6 digits) or **magic link**.
3. User enters the code (or clicks the link).
4. Backend marks the address verified, upserts **`auth_identities`** with `provider = email` and `provider_subject = normalized email`, issues **`hs_auth_session`** (same cookie model as Google/GitHub/Apple callbacks).

Email sign-in is **passwordless OTP**, not “email + password + confirm link on signup” unless you add passwords later.

---

## 2) IdP vs your own API (what you already do)

### Managed IdP (optional)

Examples: **Supabase Auth**, Clerk, Auth0, Firebase Auth.

**Pros:** Built-in OTP/magic link, templates, rate limits, less code.

**Cons:** Another vendor and mental model; your OAuth flows today are **not** going through Supabase Auth—they use [`api/_handlers/auth-*`](../api/_handlers/) and [`database/telegramAuth.ts`](../database/telegramAuth.ts). Adding Supabase only for email means **two auth stacks** unless you migrate everything.

**When to use an IdP:** You want to outsource all providers quickly and accept vendor coupling. The centralized-keys plan mentions Supabase as one option ([`auth-and-centralized-encrypted-keys-plan.md`](auth-and-centralized-encrypted-keys-plan.md)), but the **implemented** path is custom handlers + Neon.

### Own server (recommended here)

Mirror existing OAuth:

| Piece | Existing OAuth pattern | Email equivalent |
|-------|------------------------|------------------|
| Start | `POST /api/auth/{provider}/start` → `auth_login_attempts` | `POST /api/auth/email/start` → store hashed OTP + expiry |
| Complete | `GET /api/auth/{provider}/callback` → upsert identity → `createSession` | `POST /api/auth/email/verify` → upsert identity → `issueAuthSession` |
| Session | `hs_auth_session` httpOnly cookie | Same |
| DB | `auth_login_attempts`, identity upserts in `telegramAuth.ts` | Extend `AuthProvider` with `"email"`; add OTP columns or a small `auth_email_codes` table |

You **do not** need a separate “email confirmation microservice.” Two Vercel serverless routes and a mail API call are enough.

### What you still buy (not optional)

- **Transactional email provider** (Resend, SendGrid, Brevo, Amazon SES, …)—see [`email-confirmation-options.md`](email-confirmation-options.md) §5.
- **DNS on your sending domain** (SPF, DKIM; DMARC when ready) so OTP mail reaches the inbox.

That is not an IdP; it is only **delivery**.

---

## 3) Vercel vs Railway for email auth

### Use Vercel (same as other login methods)

Email sign-in fits the **serverless** model:

- Handlers run in **milliseconds to a few seconds**.
- State lives in **Neon** (OTP hash, expiry, attempt id)—not in process memory.
- No persistent TCP, no background worker, no local TDLib session.

Deploy like Google/GitHub/Apple:

- `api/auth/email/start.ts` → handler
- `api/auth/email/verify.ts` → handler
- Env on Vercel: `RESEND_API_KEY` (or equivalent), `AUTH_EMAIL_FROM`, rate-limit secrets if any.

**Caveats on Vercel (manageable):**

- **Cold starts:** Acceptable for login; keep handler deps lean.
- **Execution timeout:** Sending one email via HTTP API is well within limits.
- **Rate limiting:** Implement in DB or edge middleware; do not rely on in-memory counters across invocations.
- **Cron for cleanup:** Optional job to expire old OTP rows; Vercel Cron or a small scheduled script is enough.

### Railway is not for email auth

Railway hosts the **TDLib gateway**—a **long-running Node process** with Telegram sessions, volumes, and health checks ([`deploy/railway/README.md`](../deploy/railway/README.md)). Vercel cannot run that.

**Do not put email OTP on Railway** unless you later unify all auth on one long-lived Node server (you would lose the current split for no gain).

```
Browser → Vercel API (email start / verify) → Neon
                ↓
         Resend / SendGrid / SES  (send OTP email)

Browser → Vercel API (other routes) → Railway TDLib gateway  (Telegram messages only)
```

---

## 4) Suggested implementation sketch

### API

1. **`POST /api/auth/email/start`**
   - Body: `{ email }` (normalize: lowercase, trim).
   - Validate format; rate-limit by IP + email.
   - Generate 6-digit code (or magic-link token); store **SHA-256 hash** + `expires_at` (e.g. 10–15 min) linked to attempt id.
   - Call Resend (or chosen provider) with template.
   - Response: `{ ok: true, attemptId }` (no code in response).

2. **`POST /api/auth/email/verify`**
   - Body: `{ attemptId, code }` (or `token` for magic link).
   - Constant-time compare hash; check expiry and single use.
   - Upsert user + `auth_identities` (`email`, normalized address).
   - `issueAuthSession` from [`auth-session-issue.ts`](../api/_lib/auth-session-issue.ts).
   - Set `hs_auth_session` cookie; redirect or JSON for SPA.

### Security (minimum)

- OTP TTL **10–15 minutes**; **one-time** use.
- Rate-limit **start** and **verify** (per IP and per email).
- Generic errors on start (“If an account exists, we sent a code”) if anti-enumeration matters.
- HTTPS only; magic links must use signed tokens with `exp`.

### Env checklist (Vercel)

- [ ] `RESEND_API_KEY` (or `SENDGRID_API_KEY`, etc.)
- [ ] `AUTH_EMAIL_FROM` (e.g. `noreply@yourdomain.com`)
- [ ] Sending domain verified at provider + SPF/DKIM DNS
- [ ] Same **CORS / cookie** rules as other auth routes ([`auth-cors.ts`](../api/_lib/auth-cors.ts))

### DB

- Extend `AuthProvider` in [`telegramAuth.ts`](../database/telegramAuth.ts) with `"email"`.
- Reuse `auth_login_attempts` with `provider = 'email'` and store OTP hash in existing or new columns, **or** add a dedicated `auth_email_otps` table.

---

## 5) When you *would* choose an IdP instead

Consider Supabase Auth (or similar) **only if**:

- You plan to **move all** OAuth + email into one provider soon, or
- You want **zero** OTP plumbing and are fine migrating Google/GitHub/Apple callbacks, or
- You need IdP features you do not want to build (MFA, audit dashboards, enterprise SAML).

For **email only**, while other providers stay on custom Vercel handlers, rolling your own email routes is **simpler and consistent**.

---

## 6) Decision summary

| Approach | Fits this repo? | Host |
|----------|-----------------|------|
| Custom email OTP on Vercel + Resend/SendGrid + Neon | **Yes — recommended** | Vercel |
| Supabase Auth email OTP only | Possible but **dual stack** with current OAuth | Supabase + Vercel client |
| Dedicated email microservice on Railway | **Unnecessary** | — |
| Self-hosted Postfix for delivery | **Not recommended** for production OTP | — |

**Bottom line:** You do **not** need a separate IdP for email. Extend the auth handlers you already ship on **Vercel**; use a transactional mail API for delivery; keep **Railway** for TDLib only.

---

*Last updated: 2026-06-28*
