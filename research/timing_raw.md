# Raw timing estimate

**Purpose:** Rough “time till app finish” and **MVP launch** based on commit history, plans, and the front app.

**Important:** The app will not be sent to platforms (store/listing) before it is fully finished. So **MVP launch = full product launch**, and the realistic estimate is **3 months**.

## Transfer layout to repository root (TypeScript) — build on new architecture

The goal is **not** to finish the Flutter app in `front/`. The **Flutter** app in `front/` is the **reference layout** (web pages, flows, structure). The work is to **transfer that layout and flows into the repository root app in TypeScript** and make everything work there, with **security plan compliance** (see `docs/security_plan.md`). The production Mini App is the TS app at repository root (Expo/React), backed by the same repo’s API and DB.

### Pages to implement in repository root (TS) — from `front/` reference

- **Bootstrap** – initData auth, config from API, wallet warm-up.
- **Main** – home / hub after bootstrap.
- **Send** – send flow (security plan: pending tx, confirmations).
- **Swap** – swap flow (rate state, rotation, etc. from root plan).
- **Wallets** – list/create/manage; wallet creation and nickname (security plan: mnemonic flow, device auth, wallet registration).
- **Apps** – apps design, brand book alignment.
- **AI** – AI & search bar; response formatting; scrolling fix; wired to `app` AI routes.
- **Get** – get flow.
- **Trade** – trade page.
- **Creators** – creators content.
- **Mnemonics** – mnemonic display/backup (security plan).
- **Wallet panel** – wallet panel page.

### Services / wiring in repository root (TS)

| Concern | Role | Backend / compliance |
|--------|------|-----------------------|
| **Auth** | Telegram initData auth (e.g. app’s telegram/init endpoint). | initData validation and user upsert (Phase 0–1). |
| **AI** | Chat with AI via same-origin `/api/ai` (or app’s AI route). | Already in `app`; ensure config, keys, and error handling in prod. |
| **Wallet** | Mnemonic generation, storage, key derivation (client-side). | Security plan: SecureStorage/CloudStorage, wallet registration (`POST /api/wallet/register`), device auth flow; optional TonConnect later. |

### API surface (in repository root)

- **`/api/telegram`** (or init) – initData validation, user upsert.
- **`/api/ai`** – AI proxy; used by the TS app.

All of the above must work end-to-end in the TS app and stay within the security model (initData-only auth, no raw secrets to server, wallet registration and pending tx where applicable).

---

## Short and Medium term backlogs

- **`app/short_term_backlog.md`** (3 items): Response formatting, app theme, AI & search bar.
- **Root `medium_term_backlog.md`** (backlog): Header indent bug, rotation on swap, edit-interval healthcheck, ticker link, scrolling in AI widget, bot parts isolation, ld timeout, “AI bd”, hovers, languages, favicon, wallet creation & nickname, jetton lockup, theme in Chrome, “Bd”, wallet creation, apps design, plan users BD for search, brand book, fixes, starting rewards, feed item types, PAY BY QR, swap long rate state, swaps, tokens.

**Security:** All features above are delivered **with security plan compliance** (Phase 0–2: initData validation, wallet creation and registration, device auth, pending transactions, TonConnect if in scope, etc.). No “MVP without security”; the launch build is compliant.

---

## Time estimate

Completion order and stages:

| Stage | Scope | Estimate | Notes |
|-------|--------|----------|--------|
| **1** | **Security plan implementation** | **~3 weeks** | Phase 0 (validation, DB), Phase 1 (wallet creation, device auth, register), Phase 2 (pending tx, confirmations). |
| **2** | **App (TS) – pages & UX** | **~3 weeks** | Transfer layout from `front/` and implement all pages in repository root app (send, swap, wallets, apps, AI, get, trade, creators, mnemonics, wallet panel); layout and navigation solid. |
| **3** | **App (TS) – services & wiring** | **~3 weeks** | Auth, AI, and wallet flows in repository root app; backend alignment; errors and edge cases. |
| **4** | **Integration, testing, finishing** | **~3 weeks** | E2E, platform checks, store/listing readiness, app/plan and root plan items (formatting, theme, bugs, features). |

**MVP launch (full finish, platform-ready):** **~3 months** (12 weeks).
