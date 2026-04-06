# Unified Wallet Model: Telegram, Standalone, Multi-Chain & DLLR (TON)

This document proposes a single coherent setup for the tensions between:

- A **Telegram-first** experience (Mini App, bot confirmations, CloudStorage-assisted UX).
- **Standalone operation** when Telegram is unavailable, blocked, or the user simply prefers not to use it.
- **Non-custodial** custody: keys and mnemonics never held by our servers.
- **DLLR** and core product flows anchored on **TON**, where issuance and program logic are expected to live.
- **Multiple chains** where users may hold assets or use bridges, without fragmenting identity or safety.

It complements `wallets_hosting_architecture.md`, `security_raw.md`, and `security_plan_raw.md` by resolving “which path wins when” and how they fit together.

---

## 1. Core idea: one logical wallet, three *surfaces*

Think in terms of **one user-owned root of trust** (mnemonic for the primary TON wallet, and optional additional key material for other chains), and **three ways to use it**:

| Surface | What it is | Best for |
|--------|------------|----------|
| **A. Telegram-hosted (TMA)** | Same non-custodial keys; encrypted material split between Telegram `SecureStorage` + `CloudStorage` (ciphertext only), identity via `initData`. | Smoothest UX inside Telegram, bot-driven tx confirmation, push-to-sign. |
| **B. Unhosted / standalone** | Keys only on device OS keystore / WebCrypto; no Telegram APIs required to open the app or sign. | Telegram outage, privacy preference, store-review-friendly “works without Telegram”. |
| **C. Connected** | External wallets via **TON Connect** (TON) and, later, analogous **WalletConnect** / chain-specific SDKs for other networks. | Power users, hardware wallets, assets already elsewhere. |

**Important:** Surfaces are **not** different custodial models. They differ only in **where keys live** and **which transport** is used for identity and sync. The backend stores **public** data (addresses, `telegram_username` ↔ address mapping when the user opts in), never mnemonics.

---

## 2. Why Telegram alone is not enough (and how we fix it)

Telegram can be unreachable (outage, censorship, user choice). A product that *only* creates or signs inside the Mini App forces a hard dependency on Telegram for custody and signing.

**Proposal:**

1. **Default recommended path** remains: create primary **TON** wallet in TMA (best onboarding, aligns with bot + DLLR messaging).
2. **Mandatory parallel capability:** the same app build supports **Create / Restore wallet locally** (standalone) with **no Telegram account** and **no bot call** for key generation.
3. **Linking layer (optional):** if the user *has* Telegram, they can **link** `telegram_username` ↔ `wallet_address` so CloudStorage sync and bot confirmations work. If they never link, they remain fully standalone; DLLR/Ton features still work on-chain by address.
4. **Degraded mode:** if Telegram is down but the user already has keys on device, the app runs **full local signing** for TON (and any chain we have implemented client-side). Features that *require* the bot (e.g. push approval via Telegram) show a clear “Unavailable while Telegram is unreachable” with fallback: open pending items in TMA later, or confirm via standalone signing if the flow allows.

This matches non-custodial rules: the server never becomes the signing authority.

---

## 3. DLLR on TON as the canonical product wallet

**Clarification to remove confusion:**

- **Primary app wallet** = **TON** address derived from the user’s main mnemonic (or from a TON Connect wallet they set as default).
- **DLLR** is treated as a **TON jetton / program** (or locked-state construct per your issuance design). Balances, locks, and allocations are **read and signed on TON**.
- “Multi-chain” does **not** mean DLLR exists on every chain. It means:
  - **User may connect other addresses** for portfolio view, bridges, or future features.
  - **Product-critical flows** (rewards, locks, compliance hooks tied to DLLR) stay **TON-first**.

**UI rule:** always show a clear **“Primary (TON + DLLR)”** section, then **“Other networks”** as secondary, so expectations stay aligned with issuance on TON.

---

## 4. Multi-chain matrix (recommended model)

Use a single **wallet registry** in the client and the `wallets` table (as in `security_plan_raw.md`), with explicit `blockchain`, `net`, and `type`:

| Type | Example | Custody |
|------|---------|--------|
| `internal` | App-generated TON keypair | Non-custodial; keys in device/TMA storage |
| `tonconnect` | Tonkeeper, MyTonWallet | User’s external wallet; we only hold address + session |
| `walletconnect` / `evm` / `solana` (future) | MetaMask, Phantom, … | Same: address + connection state |

**Telegram-hosted vs unhosted** applies only to **`internal`** wallets:

- In TMA, `internal` wallet uses SecureStorage + CloudStorage ciphertext split.
- In standalone app, `internal` wallet uses only OS secure storage (same cryptography, different storage adapters).

**Connected** wallets are **always** “hosted” by the third-party provider, not by Telegram and not by us.

---

## 5. Identity: Telegram as optional glue, not a single gate

Today’s docs lean **Telegram-first** for onboarding. The unified model adds:

| User state | Can use app? | DLLR / TON actions |
|------------|--------------|--------------------|
| Standalone, never linked Telegram | Yes (after local create/restore) | Yes, if keys on device |
| Telegram user, wallet only in TMA | Yes in TMA; on mobile/web after Telegram Login | Signing in TMA; read-only elsewhere unless mnemonic imported locally (optional advanced) |
| Linked Telegram + local keys | Yes everywhere | Full: bot confirmations where implemented + local signing fallback |

**Backend:**

- `users.telegram_username` is **nullable** for standalone-only users, or use a separate **account id** (emailless) keyed by device-chosen identifier only for analytics—not for custody.
- Linking Telegram is a **deliberate** step: “Connect Telegram for notifications and faster sync.”

---

## 6. First run and subsequent runs (program behavior)

This section describes what the **client program** does on **cold start** (first launch or fresh install) versus **later launches** on the same install, for each major surface. It aligns with the state machine in `wallets_hosting_architecture.md` (e.g. `awallet_v1`, deploy status).

### 6.1 Shared startup sequence (all surfaces)

1. **Bootstrap UI shell** — Router loads; global providers start (network, wallet context).
2. **Detect environment** — `TMA` (Telegram WebApp present) vs **standalone** (Expo native / open web) vs **web + Telegram Login** (widget session).
3. **Resolve wallet presence** — Read local secure storage keys (`awallet_v1` or equivalent): encrypted blob for `internal` wallet, plus any **connected** wallet session handles (TON Connect).
4. **Branch:**
   - **No wallet record** → onboarding (Section 6.2).
   - **Wallet record present** → main app (Section 6.3).

Balances and DLLR/TON state are **always** refreshed asynchronously after UI is usable (do not block first paint on RPC unless product requires it).

---

### 6.2 First run (no wallet on this install)

| Entry | What the user sees | What the program does |
|--------|--------------------|------------------------|
| **Telegram Mini App** | Intro → **Create wallet** / **Restore wallet** (optional **Connect Tonkeeper** if offered). | Generates mnemonic locally; stores **wallet master key** in Telegram `SecureStorage`; stores **seed ciphertext** in `CloudStorage`; registers **public** `wallet_address` (+ `telegram_username` from `initData`) with backend. Shows address and QR immediately; may show **Deploying** for SMC/jetton setup; nudges **backup seed**. |
| **Standalone (native / web, no Telegram)** | Same choice: **Create** / **Restore** / **Connect** external wallet. | Generates or imports keys using **only** OS keystore / WebCrypto; **no** `initData`, **no** CloudStorage unless user later links Telegram. Optional backend call with a **non-Telegram** account id or anonymous mode until linked. |
| **Store mobile app (Telegram-centric onboarding)** | Per `security_raw.md`: “Create wallet in Telegram” vs “I already have a wallet” + **Log in with Telegram**. | First path deep-links to TMA; second uses **Telegram Login** to fetch **public** linkage (`username` → `wallet_address`) for **read-only** until user imports mnemonic on device (if you add that flow). |

**First run, new Telegram device (TMA):** `CloudStorage` may already hold **ciphertext** from another device, but **SecureStorage** is empty → program shows **Authorize this device** and asks for **mnemonic once**, then writes local master key and proceeds as normal.

**First run, connected wallet only (TON Connect):** No internal blob; program stores connection session + address; primary balance flows use that address until user adds an `internal` wallet.

---

### 6.3 Subsequent runs (wallet already on this device)

| Condition | Program behavior |
|-----------|------------------|
| **Encrypted blob + device key present** | **Silent load:** decrypt wallet, navigate to **home / wallet** without asking for seed. Poll `/wallet/status` or chain APIs for **deploy status**, **TON balance**, **DLLR** state. If deploy was **pending**, **retry deploy** in background (same as `wallets_hosting_architecture.md`). |
| **TMA + CloudStorage ciphertext + SecureStorage OK** | Same silent path; CloudStorage may sync updates from other Telegram clients. |
| **Standalone + keys in local secure storage** | Same as row 1; **no** Telegram dependency for open or sign. |
| **User opened “Log in with Telegram” on mobile** | After verified login, app loads **cached** `telegram_username` + **addresses** from API; UI is **read-first** until local signing is enabled (mnemonic import), matching your phased plan. |
| **Telegram unavailable (outage / blocked)** | If keys exist locally: **full app** for signing and reads that do not need the bot. If keys exist **only** in TMA on a device that cannot open Telegram: user must use **restore** on standalone build or wait for Telegram. Features that need the bot show **degraded / queue** messaging. |
| **App update** | Same storage keys (`awallet_v1` versioning); run **migration** if blob format bumps. Wallet survives update if paths are stable. |

**Subsequent run UX expectations:** back up seed remains **dismissible** until acknowledged; high-value actions may still route through **pending tx + bot confirmation** when Telegram is linked and the flow requires it.

---

### 6.4 Summary table

| | First run | Subsequent runs |
|---|-----------|-----------------|
| **Typical path** | Onboarding → create / restore / connect | Silent unlock → home → background balance/deploy sync |
| **Telegram required?** | Only for TMA path or Telegram-login shell | No, if standalone keys exist; yes for TMA-specific features |
| **Seed prompt** | At creation (show once) or restore; optional “authorize device” on new TMA device | Only if blob missing, storage wiped, or user hits **Restore** |

---

## 7. “Perfect setup” summary (one paragraph)

**Ship one Expo app** with three entry modes: (1) **Telegram Mini App** for best-in-class onboarding, CloudStorage-backed ciphertext sync, and bot-mediated confirmations; (2) **standalone** create/restore so the app **always launches** and can sign TON (and DLLR) without Telegram; (3) **TON Connect + future multi-chain connectors** for imported liquidity and power users. Treat **TON + DLLR** as the single source of truth for product economics; treat other chains as **attached accounts**. Keep **mnemonic / keys** only on the client, **ciphertext** in CloudStorage when Telegram is used, and **public addresses + optional Telegram link** on the server. When Telegram is down, **degrade gracefully**: local signing and read paths keep working; Telegram-only steps queue or hide with clear messaging.

---

## 8. Implementation phases (aligned with existing roadmap)

1. **Phase A — Standalone parity (minimum viable resilience)**  
   - Unhosted TON create/restore in **Expo web + native** without Telegram.  
   - Same `WalletService` abstraction as in `wallets_hosting_architecture.md`; storage backend switches on environment (TMA vs native).  
   - Optional “Link Telegram” after the fact.

2. **Phase B — Linking & DB**  
   - Nullable Telegram on `users`; `wallets` rows for `internal` + `tonconnect`.  
   - Telegram Login only for users who want cross-surface sync.

3. **Phase C — Bot confirmations + queue**  
   - Pending tx from any client; confirmation in TMA when available; standalone users complete via **local sign** without bot where the protocol allows.

4. **Phase D — Multi-chain read + selective write**  
   - Add connected chains for **display** first; add signing per chain as product requires.

---

## 9. Security notes (unchanged principles)

- No mnemonic on server; CloudStorage holds **ciphertext only**; device-bound keys decrypt.  
- Telegram Login proves **identity**, not possession of keys.  
- Standalone users rely on **seed backup** exactly as in self-custody best practice.  
- DLLR issuance rules remain **on-chain** on TON; our app is a **client**, not an issuer.

---

## 10. Open decisions (to refine with product/legal)

- Whether standalone users get **full** DLLR program participation or **subset** until KYC/Telegram link (if required by issuance policy).  
- Exact **jetton master** and **wallet v4/v5** choices for DLLR display and deploy flows.  
- Whether **one mnemonic** derives only TON or also other chains (prefer **separate mnemonics** per chain unless using a documented multi-chain HD profile).

---

*Proposal doc; iterate with team and adjust table/column names to match the actual migration from `security_plan_raw.md`.*
