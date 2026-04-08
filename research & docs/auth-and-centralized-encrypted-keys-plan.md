# Auth + Centralized Encrypted Keys Plan (Supabase)

This document defines a practical implementation plan for:

- Multi-provider login: **Google**, **Telegram**, **GitHub**, and **email + protection code (OTP)**
- Centralized storage in **Supabase**
- Wallet secrets stored as **encrypted blobs only** (no plaintext mnemonic/private keys server-side)

---

## 1) Product Goal

Enable users to sign in from multiple platforms and recover wallet access from Supabase by using account credentials plus a user-held decryption secret model.

## 2) Security Goal

- Supabase/backend stores only ciphertext envelopes and metadata.
- Decryption happens client-side.
- Server does not receive plaintext mnemonic/private keys.

---

## 3) Trust Model Decision

To avoid custodial key handling by backend, choose one of these decryption models:

1. **Password-derived key model (recommended for centralized sync)**
   - User sets a wallet passphrase.
   - Client derives key with Argon2id.
   - Ciphertext stored in Supabase.
2. **Device-key model only**
   - Better local UX, weaker cross-device recovery unless mnemonic re-entry is required.

For this plan, use model (1) as canonical centralized recovery path.

---

## 3.1) What "wrapped decrypt key" means (plain language)

This phrase means we do not store the real decryption key directly in the database.

- **DEK (Data Encryption Key):** key that encrypts wallet secret/mnemonic.
- **KEK (Key Encryption Key):** key that encrypts ("wraps") the DEK.

So database stores:
- wallet ciphertext (encrypted by DEK)
- wrapped DEK (encrypted by KEK)

Database does **not** store:
- plaintext mnemonic
- plaintext DEK
- plaintext KEK

### Why KMS/HSM is mentioned

`KEK` should live in a managed key system (AWS KMS, GCP KMS, Azure Key Vault HSM, etc.), not in app code or DB columns.

When app needs decrypt flow:
1. User authenticates (Google/Telegram/GitHub/email OTP).
2. Backend loads `wrapped_dek` + wallet `ciphertext` from DB.
3. Backend asks KMS/HSM to unwrap DEK (or returns a short-lived tokenized decrypt result, depending on policy).
4. Decrypt happens in the chosen boundary (client-side or controlled backend flow).

### Tiny analogy

- Wallet data = document in locked box (ciphertext).
- DEK = key to that box.
- KEK = key to a safe that contains the DEK.
- KMS/HSM = guarded safe room.

This way, stealing only DB rows is not enough to decrypt user wallets.

---

## 3.2) Newbie note: "But ciphertext and wrapped key are in the same DB"

This is a common concern and the short answer is:

- Yes, they can be stored in the same row.
- No, that does not automatically break security.

### Why this can still be safe

Think of three pieces:

1. `ciphertext` (locked wallet data)
2. `wrapped_dek` (the key to the lock, but itself locked)
3. `kek` in KMS/HSM (the key that unlocks `wrapped_dek`)

If attacker steals DB only, they get (1) and (2), but not (3).
Without (3), they cannot recover plaintext keys.

### What actually protects the system

The real protection is **access control to KMS/HSM**, not hiding DB relations.

- Keep KEK outside DB.
- Restrict KMS permissions to minimum required service path.
- Audit and rate-limit unwrap operations.

### Optional extra hardening

You can split storage across two databases (ciphertext in one, wrapped key in another), but this is additional defense-in-depth. It does not replace KMS/HSM boundary.

Rule of thumb for beginners:
**Do not rely on "they cannot match rows"; rely on "they cannot access KEK".**

---

## 3.3) How user session works with KEK (Google/Telegram/GitHub/email OTP)

Important: user login session is an **authorization signal**, not the KEK itself.

- Google/Telegram/GitHub/email OTP proves "this user is authenticated".
- Backend then decides whether to allow key unwrap path.
- KEK remains in KMS/HSM and is never replaced by OAuth/session token.

Typical flow:

1. User logs in and gets a valid app session.
2. App requests wallet unlock/decrypt operation.
3. Backend verifies session + policy checks (device/risk/rate limits).
4. Backend reads `wrapped_dek + ciphertext` from DB.
5. Backend calls KMS/HSM to unwrap DEK.
6. Decrypt/sign path continues under selected trust boundary.

This is why people say "session gates KEK usage", not "session is KEK".

### Two deployment variants

- **Variant A (more custodial):**
  - Backend unwraps DEK and performs decrypt/sign server-side.
  - User gets signed result/tx hash.
- **Variant B (hybrid):**
  - Backend authorizes and returns short-lived decrypt material/session token.
  - Client resolves/decrypts locally for signing.

Choose Variant A only if you explicitly accept custodial responsibility.

---

## 3.4) Why keep both `wrapped_dek` and `ciphertext` in DB (not one encrypted entity)

You can think "why not one giant blob encrypted by KEK directly?".
Short answer: envelope encryption with separate DEK is safer and more operationally practical.

Reasons:

1. **KMS/HSM usage limits and performance**
   - KMS is best for wrapping small keys, not encrypting large/high-volume payloads repeatedly.
   - DEK handles data encryption efficiently.

2. **Key rotation without re-encrypting all wallet data**
   - Rotate KEK by re-wrapping DEKs.
   - No need to decrypt/re-encrypt every wallet ciphertext each time KEK rotates.

3. **Cryptographic separation of duties**
   - DEK protects wallet payload.
   - KEK protects DEK.
   - Cleaner blast-radius control and auditing.

4. **Metadata and versioning flexibility**
   - You can evolve ciphertext formats (AEAD params/version) independently from KEK lifecycle.

5. **Standard industry pattern**
   - This is standard "envelope encryption" used by major cloud security systems.

So storing both `ciphertext` and `wrapped_dek` is expected architecture, not duplication.

---

## 3.5) KMS/HSM section: what it is and how to operate it

## What is KMS?

**KMS (Key Management Service)** is a managed service that stores and uses cryptographic master keys with strict access controls, logging, and rotation features.

Examples:
- AWS KMS
- Google Cloud KMS
- Azure Key Vault (with HSM-backed options)

## What is HSM?

**HSM (Hardware Security Module)** is specialized hardware designed to keep key material protected and perform crypto operations with strong tamper resistance.

In practice:
- Many cloud KMS offerings can use HSM-backed keys.
- Teams usually start with managed KMS and move to stricter HSM policies if required by risk/compliance.

## Why use KMS/HSM here

- Keep `KEK` out of application DB and source code.
- Centralize key policy and access control.
- Get immutable audit logs for unwrap/encrypt/decrypt operations.
- Support controlled key rotation and key disable/emergency revoke.

## How to deal with it (practical checklist)

1. **Create KEK in KMS/HSM**
   - Mark as non-exportable when available.
   - Separate key per environment (`dev/stage/prod`).

2. **Restrict IAM permissions**
   - App service can only call required operations (typically `Decrypt/Unwrap`, maybe `Encrypt/Wrap`).
   - No broad admin access from runtime services.

3. **Use envelope encryption pattern**
   - Generate DEK for wallet payload encryption.
   - Store `ciphertext + wrapped_dek` in DB.
   - Never store plaintext KEK/DEK at rest.

4. **Add policy checks before unwrap**
   - Require valid session and account state.
   - Apply risk checks (IP/device anomalies, rate limits, cooldowns).
   - Log every sensitive operation.

5. **Implement rotation**
   - Rotate KEK on schedule.
   - Re-wrap DEKs in background jobs.
   - Keep key version metadata in DB.

6. **Prepare incident controls**
   - Ability to disable key version quickly.
   - Emergency freeze for high-risk accounts.
   - Recovery runbook for key compromise scenarios.

## Common mistakes to avoid

- Putting KEK plaintext in `.env` and calling it "KMS-ready".
- Giving app runtime full KMS admin permissions.
- Missing unwrap rate limits and anomaly detection.
- No audit review pipeline for key operations.
- Designing without key-rotation path from day one.

## Newbie rule

If DB is stolen, attacker should still need **separate KMS/HSM access** to decrypt anything.
If DB theft alone can decrypt wallets, architecture is wrong.

---

## 4) Authentication Architecture

Use **Supabase Auth** as identity layer:

- Google OAuth
- GitHub OAuth
- Email + protection code (OTP / magic code)
- Telegram login bridge (custom verifier service; link to Supabase user)

### Identity Linking

A single user can link multiple auth methods to one account.

- Primary identity key: `user_id` (Supabase Auth UUID)
- Linked providers table stores provider identifiers (`google_sub`, `github_id`, `telegram_id`, etc.)

---

## 5) Wallet Encryption Envelope

Store one or more encrypted wallet envelopes per user.

### Envelope format (server-stored)

- `ciphertext` (base64)
- `nonce/iv`
- `kdf` params:
  - `algorithm = argon2id`
  - `salt`
  - `memory_kib`
  - `iterations`
  - `parallelism`
  - `dk_len`
- `aead`:
  - `algorithm = aes-256-gcm` (or xchacha20-poly1305)
  - optional `aad`
- `version`
- `created_at`, `updated_at`

### Crypto rules

- KDF and encryption run **client-side only**.
- Never send passphrase to server.
- Never log secrets/ciphertext in verbose logs.

---

## 6) Supabase Data Model

## `profiles`
- `id` (uuid, fk -> auth.users.id)
- `username` (nullable unique)
- `display_name`
- `created_at`

## `auth_identities`
- `id` (uuid)
- `user_id` (uuid)
- `provider` (`google|github|telegram|email_otp`)
- `provider_subject` (string)
- unique (`provider`, `provider_subject`)

## `wallet_envelopes`
- `id` (uuid)
- `user_id` (uuid)
- `wallet_label`
- `ciphertext`
- `kdf_json`
- `aead_json`
- `envelope_version`
- `is_active`
- timestamps

## `security_events`
- `id`, `user_id`
- `event_type`
- `ip_hash`, `ua_hash`
- timestamps

---

## 7) Authorization and RLS

Enable Row Level Security:

- user can read/write only rows where `user_id = auth.uid()`.
- admin/service role separated for backend-only tasks.
- strict policies for envelope update/delete.

Add rate limits and abuse controls at API edge:

- login attempt throttling
- envelope fetch/update throttling
- device/IP anomaly checks

---

## 8) Provider-Specific Notes

## Google / GitHub
- Use Supabase OAuth providers.
- Standard callback + session issuance.

## Email + Protection Code (OTP)
- Use Supabase OTP flow (`signInWithOtp`) with short code expiry.
- Rate-limit OTP requests and verify attempts.
- Add anti-abuse checks (per-IP/per-email cooldown).
- Optional: require email verification before provider linking actions.

## Telegram
- Verify Telegram login payload (`id_token`/signed data) in backend function.
- On success, link Telegram identity to existing `user_id` or create new profile.
- Telegram auth is identity only, not decryption secret.

---

## 9) Client Flows

## Registration
1. User signs up via any provider.
2. App prompts wallet passphrase setup (if no envelope exists).
3. Client generates/imports mnemonic.
4. Client encrypts mnemonic -> envelope.
5. Upload envelope to Supabase.

## Login on new device
1. User authenticates via provider.
2. App fetches envelope from Supabase.
3. User enters wallet passphrase.
4. Client decrypts locally and unlocks wallet.

## Passphrase change
1. Unlock with current passphrase.
2. Re-encrypt with new Argon2id salt/params.
3. Replace envelope atomically.

## Email protection-code recovery
1. User requests login code by email.
2. Enters code and gets authenticated session.
3. If wallet envelope exists, user enters wallet passphrase to decrypt.
4. If passphrase is forgotten, user must recover with mnemonic and set a new passphrase.

---

## 10) Operational Security Requirements

- CSP hardening and dependency pinning for web/TMA.
- Secrets scanning and signed CI artifacts.
- Audit trail for sensitive actions.
- Incident playbook for account takeover and suspicious activity.
- User alerts (new login, passphrase changed, provider linked/unlinked).
- User alerts (new OTP login, passphrase changed, provider linked/unlinked).

---

## 11) Migration Plan (from current model)

1. Keep existing TMA SecureStorage/DeviceStorage path active.
2. Add optional centralized envelope creation for users.
3. Backfill on next successful unlock/sign event.
4. After adoption, use centralized envelope as cross-device recovery path.
5. Maintain mnemonic-first emergency recovery.

---

## 12) Scope, Non-goals, and Warnings

Non-goals:
- Backend plaintext key custody
- Signing in backend with user mnemonic/private key

Warnings:
- If user forgets both mnemonic and passphrase, recovery is impossible by design.
- Centralized ciphertext still increases account-takeover pressure; defense must focus on OTP hardening, rate limits, and alerts.

---

## 13) Phase Breakdown

## Phase A: Identity foundation
- Configure Supabase Auth providers.
- Add account linking UX.
- Add RLS and identity tables.

## Phase B: Envelope crypto
- Implement client Argon2id + AEAD module.
- Add `wallet_envelopes` APIs and tests.

## Phase C: Recovery UX
- New device unlock flow.
- Passphrase reset/re-encrypt flow.

## Phase D: Hardening
- Abuse controls, telemetry, alerts, and audits.

## Phase E: Rollout
- Feature flags, gradual rollout, and migration metrics.

