# Key storage: current implementation vs desired Google-backed model

This document distinguishes two different “Google” roles in the architecture, summarizes **what the repo does today** (server + front), and contrasts that with the **target model** in [`final-security-model.md`](final-security-model.md) and [`auth-and-centralized-encrypted-keys-plan.md`](auth-and-centralized-encrypted-keys-plan.md).

## 1. Terminology: two “Google” topics

| Topic | Meaning | Where it must live |
|--------|---------|-------------------|
| **Google Cloud KMS + service account** | **KEK** (key encryption key) for envelope encryption; **IAM-bound** unwrap/encrypt RPCs | **Server only** — e.g. `GCP_SERVICE_ACCOUNT_JSON` (Vercel secret), `GOOGLE_APPLICATION_CREDENTIALS` or key file locally — **never** in the Expo/web bundle |
| **Google Sign-In (OAuth)** | Proves **identity** (`google sub`) and can link to a canonical `user_id` | **Client:** public OAuth client id (and redirect config). **Server:** client secret (if using confidential flow), token exchange, session cookies — **not** the KMS material |

The target docs use **“Google”** for both **OAuth login** and **GCP KMS**; this file uses **GCP KMS / SA** vs **Google Sign-In** to avoid confusion.

---

## 2. Current implementation (as of repo inspection)

### 2.1 Backend — GCP KMS (“Google key” for crypto)

**Implemented (partial):**

- **Credential resolution** in [`api/_lib/envelope-env.ts`](../api/_lib/envelope-env.ts): `GCP_SERVICE_ACCOUNT_JSON`, `GOOGLE_APPLICATION_CREDENTIALS`, fallback file `wallet-kms-unwrap-sa-key.json`.
- **KMS client** in [`api/_lib/envelope-client.ts`](../api/_lib/envelope-client.ts) (dynamic `@google-cloud/kms` import).
- **Diagnostic / proof routes:** e.g. `/api/kmsping`, `/api/kms-roundtrip` (see [`api/_handlers/wallet-envelope-*.ts`](../api/_handlers/) and rewrites in `vercel.json`).
- **Operational docs:** [`infra/gcp/backend-authentication.md`](../infra/gcp/backend-authentication.md), [`README.md`](../README.md) § GCP_SERVICE_ACCOUNT_JSON.

**Not wired to product wallet rows:**

- Neon schema in [`database/start.ts`](../database/start.ts): `wallets` holds **public** fields (address, chain, net, labels) — **no** `ciphertext`, `wrapped_dek`, algorithm version, or envelope metadata.
- [`api/_handlers/wallet-register.ts`](../api/_handlers/wallet-register.ts) rejects sensitive fields (`mnemonic`, `wallet_master_key`, …) and only registers **public** wallet metadata after Telegram `initData` auth — it does **not** call KMS or store envelopes.

So: **KMS path exists and can be operated**, but **no user wallet envelope is stored in Postgres or produced through KMS** in the main registration flow.

### 2.2 Frontend — wallet material (Telegram Mini App)

**Implemented (TMA-focused):**

- In [`ui/screens/HomeAuthenticatedScreen.tsx`](../ui/screens/HomeAuthenticatedScreen.tsx): master key to **`SecureStorage`** when available, else **`DeviceStorage`** (`wallet_master_key`); seed ciphertext to **`CloudStorage`** (`wallet_seed_cipher`) — consistent with [`texts/security_raw.md`](security_raw.md).
- This is **client-side** key tiering for the **Telegram WebApp** APIs — **orthogonal** to GCP KMS until a server envelope sync path exists.

**Not implemented on generic web Welcome path:**

- No equivalent **WebCrypto + IndexedDB/localStorage** envelope sync described in [`texts/wallets_hosting_architecture.md`](wallets_hosting_architecture.md) as a full replacement for TMA storage across browsers.

### 2.3 Frontend — Google Sign-In and session

**Implemented:**

- [`auth/AuthContext.tsx`](../auth/AuthContext.tsx): `GET /api/auth/session` with cookies; soft hint in `localStorage` (`hs_auth_hint_v1`); **no long-lived secrets** in storage beyond that hint.
- [`ui/components/WelcomeAuthButtons.tsx`](../ui/components/WelcomeAuthButtons.tsx): Telegram browser OIDC start + TMA path; **Google / GitHub / Apple / email** UI is present but explicitly **`/* wired when auth flows land */`** — **no** Google OAuth client usage, no redirect, no token handling on the client for those providers.

**Backend auth routes present:** Telegram session/start/callback under `api/auth/` — **no** `google` OAuth routes in the same tree.

---

## 3. Desired model (from internal docs) — summary

### 3.1 GCP KMS (“desired Google key storage” for crypto)

From [`final-security-model.md`](final-security-model.md):

- **KEK** lives only in **GCP KMS** (e.g. `wallet-kek`); **not** in DB or source.
- **Service account** (or Workload Identity) is the **only** runtime identity that may wrap/unwrap; stored as **server secrets** (`GCP_SERVICE_ACCOUNT_JSON` on Vercel is the documented pattern).
- **Envelope rows** in Postgres: **`ciphertext` + `wrapped_dek`** (and versioning); bulk data encrypted with **DEK**, DEK wrapped by **KEK** via KMS.
- Optional hardening: **user-plane vs vault-plane** separation (different DB roles, narrow internal proofs before unwrap), audit and rate limits on unwrap.

### 3.2 Google Sign-In (identity)

From [`auth-and-centralized-encrypted-keys-plan.md`](auth-and-centralized-encrypted-keys-plan.md) and [`wallet-implementation-roadmap-and-login-alignment.md`](wallet-implementation-roadmap-and-login-alignment.md):

- **OAuth** (Google/GitHub/Apple/email OTP) converges on one **`user_id`** and **`auth_identities`** (provider + subject).
- **Session gates** vault/KMS usage — the session is **not** the KEK.

---

## 4. Comparison table: done vs not (security-relevant)

| Area | Desired | Current status | Gap / risk if ignored |
|------|---------|----------------|------------------------|
| KEK in KMS only | KEK in GCP, not in DB | **Aligned** for infra design; KMS routes callable when env is set | Ensure prod **never** commits SA JSON; rotate on leak |
| SA / runtime identity | Server secrets or attached SA on GCP | **`envelope-env` + `envelope-client` implemented** | None for **diag**; still need **product** unwrap policy |
| DB envelope columns | `ciphertext`, `wrapped_dek`, … | **Missing** from `wallets` / migrations | Cannot store envelope-encrypted wallets server-side |
| Wallet register + KMS | Session → optional unwrap/register envelope | **Register** = Telegram + **public** fields only | KMS unused for real user data |
| Google OAuth on Welcome | Real sign-in → session | **UI only**; **stub** | No Google-linked `user_id`; cannot gate vault by Google session |
| TMA wallet keys | SecureStorage + Cloud ciphertext | **Implemented** in `HomeAuthenticatedScreen` | Web/non-TMA users not on same model |
| Plaintext secrets in client bundle | None for SA / KEK | **None observed** for GCP SA in app code | Keep verifying no env exposure in client builds |
| Separate DB roles / vault service | Optional strict separation | **Not** reflected in single `DATABASE_URL` app pattern | MVP OK; escalation path in `final-security-model` §5 |

---

## 5. What is left to do to reach the desired security / key-handling level

Ordered roughly by dependency:

1. **Schema + API** — Add envelope columns (or a dedicated `wallet_envelopes` table), migrations, and **vault-oriented** handlers that: authenticate user, load row, call KMS unwrap under policy, return only what the trust model allows (see `final-security-model` §6 custodial vs hybrid).
2. **Link identity** — Implement **Google Sign-In** (and peers) end-to-end: OAuth routes, callback, session issuance, `auth_identities` (or Supabase Auth), same `user_id` as Telegram where linking is required — see roadmap doc.
3. **Frontend wiring** — Replace Welcome stubs with real OAuth redirects / deep links; **never** ship `GCP_SERVICE_ACCOUNT_JSON` or OAuth **client secret** to the client; only public OAuth client ids where applicable.
4. **Unify wallet sync** — Decide trust variant; if **non-custodial / hybrid**, ensure **plaintext seed** paths stay client-side; server only receives **ciphertext + wrapped_dek** after KMS encrypt/wrap flows are defined.
5. **Operations** — KMS audit logs, rate limits, unwrap incident runbook; optional split `DATABASE_URL` roles / microservice for vault.

---

## 6. References (in-repo)

- [`texts/final-security-model.md`](final-security-model.md) — KMS, envelope, service boundaries.
- [`texts/auth-and-centralized-encrypted-keys-plan.md`](auth-and-centralized-encrypted-keys-plan.md) — OAuth + Supabase-oriented plan.
- [`texts/wallet-implementation-roadmap-and-login-alignment.md`](wallet-implementation-roadmap-and-login-alignment.md) — gaps vs Welcome providers.
- [`texts/security_raw.md`](security_raw.md) — TMA SecureStorage / DeviceStorage / CloudStorage.
- [`infra/gcp/backend-authentication.md`](../infra/gcp/backend-authentication.md) — how the **server** obtains GCP credentials.
