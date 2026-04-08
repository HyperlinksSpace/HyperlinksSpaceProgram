# HyperlinksSpace — Wallet Architecture Doc

> High-level system design, UI flow principles, and implementation thoughts.  
> Target: TON wallet architecture options for HyperlinksSpace app (Flutter/TMA/Web), including non-custodial and custodial modes.

---

## 1. Guiding Principles

- **Non-custodial by default.** The mnemonic (seed phrase) never touches the server. Key generation and signing happen on-device.
- **Telegram-first identity.** Inside Telegram, the user's Telegram account is the identity anchor. Outside Telegram (Windows desktop, Web), Telegram Login is used as the identity bridge.
- **Small, working steps.** Each wallet feature ships as an isolated, backward-compatible unit that can be deployed without touching existing bot or app flows.
- **Stable coin built-in.** The wallet is designed from day one to display and eventually allocate DLLR (or another locked stable) alongside the TON balance.

---

## 2. Wallet Types and Entry Points

The app supports two wallet modes:

| Mode | Description | Who uses it |
|---|---|---|
| **Unhosted (non-custodial)** | Created inside the app, keys live on device | New users with no existing wallet |
| **TON Connect** | Connects an existing external wallet (Tonkeeper, MyTonWallet, etc.) | Power users with existing wallets |

TON Connect is treated as an **additional/advanced feature**, not the default. The primary flow is always the unhosted wallet.

---

## 3. Wallet State Machine

Every wallet instance moves through these states:

```
[ No Wallet ]
     │
     ├──── "Create wallet" ──────► [ Generating ]
     │                                   │
     └──── "Restore wallet" ────────────►│
                                         ▼
                                   [ Created ]
                                   (address shown instantly, QR + copy)
                                         │
                                         ▼
                                   [ Deploying ]
                                   (SMC deploy call in progress)
                                         │
                               ┌─────────┴─────────┐
                               ▼                   ▼
                          [ Ready ]           [ Deploy Failed ]
                     (fully operational)      (retry available)
```

**State storage key:** `awallet_v1` (encrypted blob in SecureStorage)  
**Metadata stored separately (plaintext):**
```
wallet_address
created_at
last_seen_at
deploy_status   ← "pending" | "deployed" | "failed"
```

---

## 4. First Launch — Unhosted Wallet

**Goal:** User has no wallet. They open the app for the first time (any platform).

### UI Flow

1. **Wallet tab / panel opens** → app checks `awallet_v1` in local SecureStorage.
2. Nothing found → show two CTAs:
   - **"Create new wallet"** (primary, prominent)
   - **"Restore wallet"** (secondary, text link — visible only if device has an encrypted blob from a previous session or the user chooses to enter a mnemonic)
3. User taps **"Create new wallet"**:
   - Spinner shown: _"Creating wallet…"_
   - App generates a BIP39 mnemonic + TON keypair **entirely in-memory** (no server call at this step).
   - Address is computed and displayed **instantly**.
   - Encrypted blob is written to SecureStorage.
4. App shows **"Your wallet is ready"** screen:
   - Address (truncated + copy button)
   - QR code
   - DLLR status: `Allocated / Locked / Available` (placeholders until deploy completes)
   - `"Deploying…"` status badge
5. SMC deploy call fires in the background (POST `/wallet/deploy`). When complete, status badge updates to ✅ `"Active"`.
6. A **"Back up your seed phrase"** nudge is shown — non-blocking, dismissible, but persistent until the user acknowledges.

### Key decisions
- Address generation is instant and shown before deploy. This is intentional UX — users can copy the address to receive funds immediately, even before the contract is deployed.
- Mnemonic is shown **once**, at creation time. After acknowledgement it is never shown again (only recoverable via "Export seed phrase" with auth).

---

## 5. Second Launch — Loading Existing Wallet

**Goal:** User returns to the app on the same device. Wallet was created previously.

### UI Flow

1. App reads `awallet_v1` from SecureStorage on startup.
2. Encrypted blob found → decrypt using device key (Secure Enclave / Android Keystore).
3. Wallet panel loads directly to **Ready state** — no mnemonic prompt needed.
4. App polls `/wallet/status?address=...` to refresh balances and deploy status.
5. If `deploy_status === "pending"` (e.g., deploy was interrupted), app auto-retries the deploy silently.

### Key decisions
- The device key (used to decrypt the blob) **never leaves the device**. It is stored in the OS-level secure keystore.
- No mnemonic entry is needed on the same device — the encrypted blob handles re-authentication transparently.

---

## 6. New Device / Re-connect Scenario (Mnemonic Required)

**Goal:** User opens the app on a new phone, new PC, or after clearing app data.

### UI Flow

1. App finds no `awallet_v1` in SecureStorage (it's a fresh install).
2. Wallet panel shows:
   - **"Create new wallet"** (primary)
   - **"Restore wallet"** (secondary, prominent here)
3. User taps **"Restore wallet"** → input field: _"Enter your 24-word seed phrase"_
4. Words entered → app validates mnemonic → re-derives keypair → re-encrypts blob into the new device's SecureStorage.
5. App calls `/wallet/restore` to confirm address matches expectation.
6. Wallet loads at **Ready state** (deploy was already done on the original device).

### Key decisions
- The mnemonic is the **single recovery factor**. There is no server-side recovery.
- Mnemonic input should use a native secure text field (no clipboard suggestions, no autocorrect logging).
- CloudStorage (Telegram's `telegram.cloudStorage` API) can optionally store the **ciphertext** (not the key), so restore can be assisted without the user typing all 24 words. The device key is still required to decrypt it — CloudStorage alone is not sufficient to reconstruct the wallet.

---

## 7. Telegram Wallet — Inside Telegram (TMA)

**Goal:** User accesses the wallet via the Telegram Mini App (TMA).

### How identity and storage work inside TMA

- **Identity:** `initData.user.id` (Telegram user ID) is the identity anchor. No separate login needed.
- **Storage:**
  - `telegram.cloudStorage` is used for the encrypted wallet blob — it is synced across Telegram sessions automatically.
  - The device key (to decrypt the blob) is stored in the browser's IndexedDB / WebCrypto key store scoped to the TMA origin.
- **First launch in TMA:** Same as Section 4, but blob goes to `cloudStorage` instead of native SecureStorage.
- **Re-open in TMA on same device:** Blob in `cloudStorage` + device key in IndexedDB → loads wallet silently.
- **TMA on a new device:** CloudStorage has the ciphertext, but the device key is absent → user is prompted to enter mnemonic once. New device key is generated and stored. From then on, that device works silently.

### Key decisions
- `telegram.cloudStorage` is **not end-to-end encrypted by Telegram** — it is accessible to the bot's server-side in theory. This is why we store only the **ciphertext** there, not the plaintext key or mnemonic.
- The split: _ciphertext in CloudStorage, key in device_ ensures neither half alone can reconstruct the wallet.

---

## 8. Outside Telegram — Web / Windows Setup

**Goal:** User uses the app via browser or Windows desktop (Electron/Tauri wrapper), outside of Telegram context.

### How identity works outside TMA

Since there is no `initData` from Telegram, identity is established via **Telegram Login Widget** (OAuth-style flow):

1. User is shown a "Log in with Telegram" button.
2. Telegram sends a signed hash to the app confirming the user's Telegram ID and username.
3. App uses the Telegram ID as the identity anchor — same as inside TMA.

### Storage outside Telegram

- **Web browser:** Encrypted blob is stored in `localStorage` (or IndexedDB for larger payloads). Device key in WebCrypto non-extractable key store.
- **Windows desktop:** Encrypted blob stored in the OS credential manager or app's local data directory. Device key in Windows DPAPI or Keychain equivalent.

### First launch on Windows

1. App opens → Telegram Login flow → identity confirmed.
2. App checks local storage for `awallet_v1`.
3. **No wallet found:** Same "Create / Restore" UI as Section 4.
4. **Wallet found (transferred or restored):** Loads to Ready state.

### Re-launch on Windows

Same device → blob in local storage + device key still present → silent load, no mnemonic needed.

### Key decisions
- Windows is primarily a **reading/management surface** — send, receive, view balances. Heavy transaction flows remain on mobile/TMA first.
- The GitHub auto-updater (workflow-based releases) is already in place for the Windows build. Wallet state must survive app updates — storage paths must not change across versions, or migration logic must be included.

---

## 9. API Contract (Wallet Endpoints)

```
POST /wallet/create
  Body: { address, encrypted_blob, public_key }
  Response: { ok: true }

POST /wallet/deploy
  Body: { address }
  Response: { status: "pending" | "deployed" | "failed" }

GET  /wallet/status?address=...
  Response: { deployed: bool, dllr_status: {...}, balances: { ton, dllr } }

POST /wallet/restore
  Body: { encrypted_blob }
  Response: { address }
```

The backend is **optional** for the read path — balances can be fetched directly from TON APIs (toncenter/tonapi) on the client side. The backend is primarily needed for:
- SMC deploy coordination
- DLLR allocation logic
- Caching and rate-limit protection for API calls

---

## 10. WalletService Abstraction (Flutter)

The Flutter app uses a `WalletService` interface so the UI never depends directly on whether we're in mock, front-only (direct TON API), or backend-connected mode:

```dart
abstract class WalletService {
  Future<WalletState> loadFromStorage();
  Stream<WalletStatus> watchStatus(String address);
  Future<WalletInfo> createWallet();
  Future<WalletInfo> restoreWallet(String mnemonic);
}
```

Swap between implementations via a flag (`kUseMockWalletState` for dev, env-driven for prod). No UI refactor needed when switching providers.

---

## 11. Security Summary

| Concern | Approach |
|---|---|
| Mnemonic exposure | Shown once at creation, never stored in plaintext |
| Key storage | OS Secure Enclave / Android Keystore / WebCrypto non-extractable |
| Server-side secrets | None — server never sees mnemonic or private key |
| Cross-device restore | Mnemonic re-entry required OR ciphertext from CloudStorage + device key |
| Telegram identity outside TMA | Telegram Login Widget (signed hash verification) |
| Duplicate deploy | State machine prevents re-deploy if `deploy_status === "deployed"` |
| App update survivability | Storage keys versioned (`awallet_v1`), migration path required for `v2` |

---

## 12. Phase Roadmap

| Phase | Scope |
|---|---|
| **Phase 1** | Unhosted wallet: create, display address, deploy SMC, show TON balance |
| **Phase 2** | DLLR integration: allocated/locked/available display, stable coin status |
| **Phase 3** | TON Connect (connect existing wallets as secondary option) |
| **Phase 4** | Send/receive flows, transaction history |
| **Phase 5** | Cross-device CloudStorage assist, backup/export UX hardening |

---

## 13. Custodial Model Extension

This section adds a custodial architecture option alongside the existing non-custodial design.

### 13.1 What "custodial" means in this doc

- Wallet secrets are stored centrally as encrypted data in backend storage.
- Backend trust boundary can participate in decrypt/sign authorization.
- User identity (Google/Telegram/GitHub/email OTP) becomes a stronger operational gate.

This is a product/trust choice, not just an implementation detail.

---

### 13.2 Custodial key architecture (envelope encryption)

Store per-wallet:

- `ciphertext` (wallet secret encrypted by a DEK)
- `wrapped_dek` (DEK encrypted by KEK)
- metadata (`key_version`, `algo`, `created_at`, `status`)

Keep KEK in KMS/HSM, not in DB/app code.

Result:
- DB theft alone is insufficient.
- Attacker also needs KMS/HSM access path and permissions.

---

### 13.3 Identity and auth in custodial mode

Identity providers:
- Google OAuth
- GitHub OAuth
- Telegram login bridge
- Email + OTP (protection code)

Account linking maps all providers to one internal `user_id`.

Auth session is used to authorize protected operations:
- key unwrap requests
- signing requests
- provider linking/unlinking

---

### 13.4 Custodial state machine

```
[ No Wallet Record ]
     │
     ├── Create wallet ─► [ Custodial Encrypted ]
     │                         │
     │                         ├── Unlock request (auth + policy) ─► [ Session Unlocked ]
     │                         │                                         │
     │                         │                                         └── Sign tx ─► [ Ready ]
     │                         │
     └── Restore/import ─────► [ Custodial Encrypted ]
```

`Session Unlocked` should be short-lived and policy-limited (risk checks, cooldowns, limits).

---

### 13.5 Signing variants

## Variant A: Backend signing (fully custodial)
- Backend unwraps DEK and signs transactions server-side.
- Client receives signed transaction/hash.
- Simplest UX, highest custodial responsibility.

## Variant B: Backend-assisted client resolve (hybrid custodial)
- Backend authorizes access and returns short-lived decrypt context.
- Client resolves and signs locally.
- Better client-side control, still centralized key lifecycle.

Choose one variant explicitly in product docs and legal language.

---

### 13.6 API extension for custodial mode

```
POST /wallet/custodial/create
  Body: { user_id, wallet_label, encrypted_payload, wrapped_dek, key_version }
  Response: { ok: true, wallet_id }

POST /wallet/custodial/unlock
  Body: { wallet_id, auth_context }
  Response: { unlock_token, expires_at }   // or server-side unlock only

POST /wallet/custodial/sign
  Body: { wallet_id, unlock_token, tx_payload }
  Response: { signed_tx | tx_hash }

POST /wallet/custodial/rotate-kek
  Body: { wallet_id? | batch_selector, new_key_version }
  Response: { rewrapped_count }
```

All endpoints must be audited and rate-limited.

---

### 13.7 Security controls required in custodial mode

- KMS/HSM-backed KEK, non-exportable where possible
- Strict IAM separation (runtime vs admin)
- Row-level access control by `user_id`
- Risk checks before unlock/sign (IP/device anomaly, velocity limits)
- Immutable security event log
- Emergency freeze and key-rotation runbook
- Signed release pipeline + dependency controls

---

### 13.8 UX implications vs non-custodial

Benefits:
- Easier cross-device recovery
- Less mnemonic friction for mainstream users

Tradeoffs:
- Backend/service compromise has larger blast radius
- Stronger legal/compliance burden
- Must clearly disclose custodial trust model

Recommended product stance:
- Keep non-custodial as default for advanced users.
- Offer custodial mode as explicit opt-in with clear warnings and recovery terms.

---

### 13.9 Updated roadmap including custodial track

| Phase | Non-custodial track | Custodial track |
|---|---|---|
| **Phase 1** | Create/restore local wallet, deploy flow | Auth foundation (Google/GitHub/Telegram/email OTP), user linking |
| **Phase 2** | Device/local storage hardening | Envelope storage (`ciphertext` + `wrapped_dek`) + KMS/HSM integration |
| **Phase 3** | TMA/Desktop fallback tiers | Unlock/sign endpoints + policy/rate limits |
| **Phase 4** | Send/receive/history | Custodial signing UX + anomaly protections |
| **Phase 5** | Backup/export UX hardening | Key rotation, incident runbooks, compliance hardening |

---

*Last updated: April 2026. Maintained in repo at `docs/wallets_hosting_architecture.md`.*
