# Accounts, usernames, and wallets — basic mechanics

Short reference for contributors: how **identity (account)** relates to **sign-in methods**, how **many wallets** on **different networks** attach to **one account**, and **how users manage finances** across those wallets behind a single login.

---

## 1) Account vs wallet (mental model)

| Concept | What it is |
|---------|-------------|
| **Account** | The **logical user** in the product: one place for preferences, entitlement, aggregated activity, links between providers, and pointers to wallets. Persisted server-side as a **canonical user record** (e.g. Supabase `user_id`; see [`auth-and-centralized-encrypted-keys-plan.md`](auth-and-centralized-encrypted-keys-plan.md)). |
| **Wallet** | A **keypair or connection** represented by addresses on one or more **networks**. A single account may have **many** wallet rows—e.g. app-generated **TON**, **TonConnect**, later **EVM** / others. |

**Rule:** “I’m logged in” = **authenticated account**. “I’m using this chain / address” = **which wallet connection** is active or default.

---

## 2) Username and sign-in (“different means of login”)

Users authenticate **sessions** via **OAuth / email OTP / Telegram**, etc.—not via a blockchain address.

### One account, multiple sign-in methods

The product aims for **linked identities**: the first successful sign-up creates **`user_id`**; later logins attach **providers** (`google`, `github`, `apple`, `email`, **`telegram`** keyed by `telegram_user_id`, …) to **the same account** after verified linking. See §2–§4 in [`login-and-telegram-messages-architecture.md`](login-and-telegram-messages-architecture.md).

- **Outside Telegram:** typical “Continue with…” and email OTP; the **username** shown in UI is whatever you store on the profile (**`user_id`**)—display name, email local-part, or provider name.
- **Inside Telegram Mini App:** **instant context** via verified `initData` (telegram user id / optional **`@username`**). That resolves to **the Telegram-linked identity** → the same **`user_id`** once linked—not a permanently separate Telegram-only island.

### What “username” means here

Avoid conflating three things:

1. **`@telegram_username`** — public Telegram handle (may be absent if hidden).
2. **Profile display name** — app-managed field on **`user_id`**.
3. **Wallet addresses** — **not** login usernames; they are chain-specific identifiers.

Use **human-facing account identity** from profile + sensible fallbacks from providers; expose **addresses** under wallets with explicit **network** labels.

### Display name / handle: inherit from login vs platform-owned

Neither extreme is ideal alone; prefer a **hybrid**.

| Approach | Upside | Downside |
|----------|--------|----------|
| **Always inherit** from OAuth / Telegram (display name only) | Fast first paint; no extra form | Names change/disappear upstream; clashes when linking providers; **`@telegram_username`** can be absent; mismatched tone (legal name vs gamer tag); weak **portable identity** inside your product |
| **Platform-only** (user must define before showing) | One consistent product identity | Empty state and friction when user only wants Telegram-instant onboarding |
| **Hybrid (recommended)** | Balance | Slightly more data model |

**Recommended hybrid:**

1. **Canonical stable key** for the person stays **`user_id`** (never the Google “name string” alone).
2. **`platform_display_name`** (or `preferred_name`): stored **on `user_id`**, editable in profile—**single default** shown in Feed, mentions, leaderboard, etc.
3. **Bootstrap rule:** on first account creation only, **pre-fill** `platform_display_name` from the strongest available signal **in deterministic order** (e.g. Telegram first name (+ `@username` in subtitle if desired) → OAuth full name → email local-part). Clearly **editable** afterward.
4. **Optional `@handle`** (unique, product-scoped)—for mentions, URLs, uniqueness—only if product needs discovery; reserve validation and collision handling; distinct from Telegram’s `@`.
5. **Provider fields** (`telegram_username`, OAuth name, avatar URL) stored as **facts** linked to **`auth_identities`** for avatars/debugging, **not** as the lone source after first save unless user chooses **“sync from Telegram”**.
6. After **linking a second login**, **do not** overwrite `platform_display_name` automatically unless the user explicitly chooses **sync from a linked provider**—avoids hostile rename surprises.

**Telegram caveat:** **`@username` is optional on Telegram’s side**; never require it as mandatory handle. Prefer **`telegram_user_id`** internally for linkage.

---

### Rules for engineering

1. Resolve every session early to **`user_id`**; do not persist product state keyed only by Telegram identity without **`user_id`** mapping.
2. Linking UX must prevent unintended **duplicate accounts** when the same person uses Google vs Telegram (`login-and-telegram-messages-architecture.md`).
3. **`wallets`** rows reference **`user_id`**, not the login provider string.

---

## 3) Many wallets per account, many networks

### Registry idea

Each **wallet connection** belongs to **`user_id`**, with metadata such as:

- **Chain family** — e.g. `ton`, `evm`, `solana` as you extend support.
- **Address(es)** for that chain.
- **Custody / connection kind** — e.g. `internal` (keys in app/TMA secure storage vs standalone), **`tonconnect`**, later WalletConnect-class connections. Matrix: [`wallet_telegram_standalone_multichain_proposal.md`](wallet_telegram_standalone_multichain_proposal.md) §4.

### Program emphasis (DLLR / TON)

**DLLR** and critical program flows remain **TON-first**: make **primary TON (+ DLLR)** obvious in UI; other chains are **connected wallets** (portfolio / bridges / growth) under the **same account**.

### UX expectations

1. Adding a wallet **does not** create a **new account** unless you explicitly support multi-account UX.
2. **Default signing wallet** is a preference on **`user_id`**; feed and notifications should prefer **`user_id`**, attaching **`wallet_id`** only where the message is wallet-specific.

---

## 4) Managing finances from many wallets / networks — one account

This is **how the product behaves**, not custody details (see [`wallet_telegram_standalone_multichain_proposal.md`](wallet_telegram_standalone_multichain_proposal.md)).

### 4.1 What “one-account finance” means

- The user signs in **once** (**`user_id`**). Under that account they see **one finance surface**: balances, actions, history—**scoped and labeled by wallet row and network**, not fragmented into separate login silos.
- **Money still lives on-chain**: each wallet/address/network has its **own balances and tx history**. The app **aggregates for display** and **routes sends** through the wallet the user selects (or defaults).

### 4.2 Primary vs other wallets

| Layer | Role |
|-------|------|
| **Primary (TON + program assets e.g. DLLR)** | Default for **in-app earns, locks, rewards, and product-critical sends** tied to issuance on TON. User should always know “this tx uses **primary**.” |
| **Connected / secondary** | Other **TON Connect** wallets or future **non-TON** connections: portfolio, optional actions, bridges—**explicit** network + wallet picker before signing. |

Store **`default_wallet_id`** (or equivalent) per **`user_id`**; optionally **`default_wallet_id_per_chain`** as you scale.

### 4.3 Ways users manage finances (patterns)

1. **Aggregate view (“my money”)**  
   Pull balances per linked address (indexers + RPC/SDK per chain); show grouped by **network** and **wallet nickname**. Tap a row → **detail** for that address only.

2. **Spend / stake / claim (program flows)**  
   Prefer **primary TON (+ DLLR)** automatically; if prerequisites fail (wrong wallet linked, not deployed), show **fix-it** UX (switch primary, connect wallet, restore keys)—still under one account.

3. **Send asset X on chain Y**  
   **Explicit steps:** choose **network → wallet connection that can sign that chain → asset → amount**. Never infer chain from a generic “balance” bubble without confirmation.

4. **Receive**  
   Per-wallet **deposit address with network label + share/QR**. Copy always includes or surfaces **network** to reduce wrong-chain deposits.

5. **Externally custody**  
   **TonConnect / WalletConnect-class:** signing happens in **external app** after our UI builds the payload—account still **`user_id`**, but signer is **`wallet_id`** of type `tonconnect`/….

6. **Internal custody**  
   **`internal` wallets:** signing in-process with locally stored keys (TMA SecureStorage bundle vs standalone keystore)—same account, different **`wallet_id`**.

7. **Cross-network moves (“bridge / swap”)**  
   Implement as **guided flows**: source **`wallet_id` + network`** → compliant route (partner contract, relay, custodial off-ramp if any)—still **chosen and confirmed** under one account; do not silently move funds across chains without user review.

### 4.4 Engineering rules

1. Persist **financial preferences** (**default wallet**, hidden balances, fiat display) against **`user_id`**, never only on device if you sync across Telegram/web/native.
2. Every outbound transaction record: **`user_id`**, **`wallet_id`**, **chain id/network**, optional **intent** (transfer, DLLR_claim, bridge_…)—for feed, reconciliation, support.
3. **Authorization UX:** reconnect or expired TonConnect/WC sessions must degrade to **clear** “Connect again to manage this wallet” while other wallets on the account still work.

### 4.5 What one account does *not* do

- **Unify liquidity automatically** across chains—you still expose **routing** UX (bridge/swap providers).
- **Override custody** — we don’t consolidate keys across networks into one super-keyring; users manage multiple connections under one login.

---

## 5) Minimal diagram

```text
                    ┌─────────────────────┐
                    │   Account (user_id)  │
                    │  profile · settings   │
                    └─────────┬────────────┘
          ┌───────────────────┼───────────────────┐
          ▼                   ▼                   ▼
   Identity: Google      Identity: Telegram    Identity: Email
          │                   │                   │
          └───────────────────┴───────────────────┘
                          (linked)
          ┌───────────────────┼───────────────────┐
          ▼                   ▼                   ▼
   Wallet: TON internal   Wallet: TonConnect   Wallet: other net …
```

---

## 6) Related documents

| Topic | Doc |
|--------|-----|
| Multi-provider login, encrypted keys | [`auth-and-centralized-encrypted-keys-plan.md`](auth-and-centralized-encrypted-keys-plan.md) |
| TMA vs web login, Telegram identity | [`login-and-telegram-messages-architecture.md`](login-and-telegram-messages-architecture.md) |
| TMA vs standalone, TON-first, multi-chain matrix | [`wallet_telegram_standalone_multichain_proposal.md`](wallet_telegram_standalone_multichain_proposal.md) |
| Hosting / storage angles | [`wallets_hosting_architecture.md`](wallets_hosting_architecture.md) (if present in repo) |

---

*This file is explanatory only; migrations and APIs follow the linked implementation plans.*
