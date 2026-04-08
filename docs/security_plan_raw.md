# Security Implementation Plan (Telegram-First Wallet)

This file describes a practical implementation plan for the security model defined in `security.md`, focused on the repository-root Expo/Vercel codebase and a serverless backend.

---

## Phase 0 – Prerequisites & Plumbing

- **0.1. Bot & Mini App configuration**
  - Ensure main Mini App is configured in @BotFather with:
    - `https://hsbexpo.vercel.app` (or new URL) as base.
    - `startapp` support enabled.
  - Confirm `telegram-web-app.js` is loaded in the Mini App shell.

- **0.2. Serverless backend basics**
  - Use existing Vercel project (repository root) API routes:
    - Create a shared util for **Telegram initData validation** (WebApp) in `api/_lib/telegram.ts`:
      - `validateInitData(initData: string): { username: string }`.
    - Create a shared util for **Telegram Login widget validation** (web/native) in `api/_lib/telegram_login.ts`:
      - `validateLoginPayload(payload): { username: string }`.

- **0.3. Database**
  - Choose a serverless DB (e.g. Neon, Supabase, PlanetScale, Vercel Postgres).
  - Define tables (supporting **multiple wallets per user**, including app-created and TonConnect-linked):
    - `users`:
      - `telegram_username` (PK or unique, text).
      - `created_at`, `updated_at`.
      - `last_login_at` – last successful Telegram login (any platform).
      - `last_tma_seen_at` – last time user opened the Mini App.
      - `locale` – preferred language (derived from Telegram).
      - `time_zone` (optional, from app settings).
      - `number_of_wallets` – cached count for quick UI/query.
      - `default_wallet` – optional reference/key to the user’s default wallet (e.g. `wallet_address` + `wallet_blockchain` + `wallet_net` tuple or UI identifier).
      - `security_flags` (JSON) – e.g. `{ "high_value_user": true, "require_extra_confirm": false }`.
      - `marketing_opt_in` (bool) – whether user agreed to non-transactional notifications.
    - `wallets`:
      - `telegram_username` (FK to `users`).
      - `address` (text).
      - `blockchain` (text, e.g. `'ton'`).
      - `net` (text, e.g. `'mainnet'`, `'testnet'`).
      - `type` (`'internal' | 'tonconnect' | 'other'`) – app-created vs external/connected.
      - `label` (optional user-friendly name, e.g. “Main wallet”, “Tonkeeper”).
      - `is_default` (bool) – which wallet to show first in UI.
      - Composite PK/unique: (`telegram_username`, `wallet_address`, `wallet_blockchain`, `wallet_net`).
      - `created_at` – when this wallet record was created (first seen / added).
      - `updated_at` – when this wallet record was created (first seen / added).
      - `last_used_at` – last time a transaction was initiated or confirmed with this wallet.
      - `last_seen_balance_at` – last time we refreshed its on-chain balance
      - `source` – 'miniapp', 'tonconnect', 'imported' (how it was added)
      - `notes` – (optional text): free-form user note about this wallet.
      - Timestamps / metadata (last_used_at, etc.).
    - `pending_transactions`:
      - `id` (UUID / text, PK).
      - `telegram_username` (FK to `users`).
      - `wallet_address` (text).
      - `wallet_blockchain` (text).
      - `wallet_net` (text).
      - `payload` (JSONB / text).
      - `status` (`pending | confirmed | rejected | failed`).
      - `created_at`, `updated_at`.
  - Add minimal DB client in `api/_lib/db.ts`.

---

## Phase 1 – Telegram Mini App: Wallet Creation & Device Auth

- **1.1. Mini App bootstrap**
  - Create a dedicated Mini App entry screen in Expo web (`app/app/index.tsx` or a nested route) that:
    - Accesses `window.Telegram.WebApp.initData`.
    - Calls a backend endpoint `POST /api/tg/init` to:
      - Validate `initData`.
      - Upsert a bare `users` row if needed (without wallet).

- **1.2. Wallet creation flow (TMA)**
  - Implement a React flow in the Mini App:
    - Step 1: Intro + explanation (self-custody, seed phrase).
    - Step 2: Generate mnemonic (client-side) with a TON/crypto library.
    - Step 3: Show mnemonic & confirmation quiz.
    - Step 4:
      - Derive wallet master key from mnemonic.
      - Store it via `SecureStorage.setItem('wallet_master_key', …)` when supported; if that fails (e.g. Desktop `UNSUPPORTED`), fall back to `DeviceStorage` and warn the user (see `docs/security_raw.md`).
      - Derive/encode wallet seed or root key, encrypt with master key → `seed_cipher`.
      - Store `seed_cipher` via `Telegram.WebApp.CloudStorage.setItem('wallet_seed_cipher', <cipher>)`.
      - Derive `wallet_address` from mnemonic/root key.
      - Call `POST /api/wallet/register` with `{ telegram_username, wallet_address }` (initData-validated).
    - Step 5: Success screen explaining:
      - “Wallet created in Telegram; keep your mnemonic safe.”
      - “Use Android/iOS/web to view wallet after logging in with Telegram.”

- **1.3. New Telegram device authorization**
  - At Mini App start:
    - Check `SecureStorage.getItem('wallet_master_key')`.
      - If present → user can operate without extra input.
      - If absent but `CloudStorage.getItem('wallet_seed_cipher')` exists:
        - Show “Authorize this device” screen:
          - Prompt for mnemonic once.
          - Derive new master key, store in `SecureStorage`.
          - Optionally re-encrypt `seed_cipher` (or just reuse old one).

---

## Phase 2 – iOS/Android App Flow (Single App)

(All implemented in the repository root app using Expo Router / React Native.)

- **2.1. Local state**
  - Add a simple secure storage wrapper (e.g. `expo-secure-store`):
    - Keys:
      - `telegram_username`
      - `wallet_address`
  - Add a React context or hook `useCurrentUser()` that:
    - On app start, reads these keys.
    - Exposes `state: 'anonymous' | 'linked'`, `telegram_username`, `wallet_address`.

- **2.2. “Log in with Telegram” screen**
  - Create a route (e.g. `app/app/login/telegram.tsx`) used on mobile startup when `state === 'anonymous'`:
    - Copy text from `security.md`:
      - Explain benefits of Telegram-based wallet creation and storage.
    - Buttons:
      - **Open Telegram to create wallet**:
        - Use `Linking.openURL('https://t.me/<bot_username>?startapp=wallet_onboarding')`.
      - **I already created my wallet in Telegram / Log in with Telegram**:
        - Opens a WebView or browser to hosted login page (e.g. `/login/telegram`).

- **2.3. Telegram Login for Websites (web page + API)**
  - Create a web page (static route in repository root or separate) that:
    - Embeds the Telegram Login widget configured for your bot & domain.
    - On success, posts the payload (via `data-onauth` callback) to `POST /api/login/telegram`.
  - `POST /api/login/telegram`:
    - Validates login payload (`hash` + `auth_date`) per [Telegram widget docs](https://core.telegram.org/widgets/login).
    - Extracts `username`.
    - Looks up `users` by `telegram_username`.
    - Responds with:
      - On success: `{ telegram_username, wallet_address }`.
      - On missing wallet: `{ error: 'NO_WALLET' }`.
  - In the mobile WebView:
    - When login completes, post a message back to the React Native layer with the above payload.
    - Native side saves `telegram_username` + `wallet_address` via secure storage and updates `useCurrentUser()` state.

- **2.4. Main wallet UI on mobile**
  - When `useCurrentUser()` reports `state === 'linked'`:
    - Show wallet balances / positions (read-only) via:
      - Direct chain APIs or your own serverless `GET /api/wallet/state?address=...`.
    - For any **sensitive action** (swap, send, etc.) use the serverless + bot confirmation flow (Phase 3).

---

## Phase 3 – Serverless Transaction Flow & Bot Confirmation

- **3.1. Create transaction (serverless route)**
  - Add `POST /api/tx/create`:
    - Auth:
      - From Mini App: validate `initData`, resolve `telegram_username`.
      - From web/mobile: require a session or signed JWT containing `telegram_username` from Telegram login.
    - Validate payload (action, amount, destination).
    - Insert into `pending_transactions` with status `pending`.
    - Use bot token to call `sendMessage` with:
      - Text summary.
      - Inline `web_app` button pointing to `https://t.me/<bot_username>?startapp=tx_<id>`.
    - Return `{ id }` to caller for polling.

- **3.2. Confirmation page in Mini App**
  - Implement a `tx/[id]`-like route in the Mini App (or use `start_param` parsing on the main screen) that:
    - Reads `start_param` → extracts `<id>`.
    - Calls `GET /api/tx/<id>`:
      - Validates `initData`, ensures tx belongs to `telegram_username`.
      - Returns tx summary (read-only).
    - UI:
      - Shows:
        - Asset, amount, from / to addresses, network, estimated fee.
        - A big, unambiguous **“Confirm”** button and a **“Reject”** button.

- **3.3. Local signing & completion**
  - On **Confirm**:
    - Mini App:
      - Reconstructs the on-chain transaction from the payload and `wallet_address`.
      - Signs it with the wallet key derived from mnemonic / master key in `SecureStorage`.
      - Sends `POST /api/tx/<id>/complete` with:
        - `id`
        - `signedTx` (or `txHash` if client broadcasts).
        - `decision: 'confirmed'`.
  - `POST /api/tx/<id>/complete`:
    - Validates `initData` and ownership.
    - Verifies tx is still `pending`.
    - Option A (backend broadcasting):
      - Broadcast `signedTx` to RPC endpoint.
      - On success/failure, update `status` accordingly and store `tx_hash`.
    - Option B (client broadcasting):
      - Trust `txHash` and mark as `confirmed`, or perform lightweight verification.
    - Returns final status to Mini App.

- **3.4. Rejection path**
  - On **Reject**:
    - Mini App calls `POST /api/tx/<id>/complete` with `decision: 'rejected'`.
    - Backend sets status `rejected`.

- **3.5. Client status updating**
  - Any client that initiated the tx (Mini App, web, mobile app):
    - Polls `GET /api/tx/<id>` until `status !== 'pending'`.
    - Or uses lightweight WebSocket/SSE if desired.

---

## Phase 4 – Hardening & Observability

- **4.1. Logging & audit**
  - Add structured logging in all API routes:
    - User identity (`telegram_username`), tx id, IP, user agent.
  - Consider a `tx_history` view for user self-audits.

- **4.2. Rate limiting & abuse protection**
  - Add rate limiting (IP + username) on:
    - `/api/tx/create`
    - `/api/login/telegram`
  - Consider CAPTCHA or additional friction on spammy accounts.

- **4.3. Secrets & config**
  - Store:
    - Bot token, DB URL, RPC URLs, etc. in Vercel environment variables.
  - Never log full mnemonics or keys; ensure any debug logging never prints sensitive values.

- **4.4. UX safety rails**
  - On confirmation pages (Mini App & web):
    - Highlight destination address and allow user to copy it.
    - Show human-readable asset names & verify network.
    - For large amounts, add extra confirmation step or warning.

---

## Phase 5 – Optional Enhancements

- **5.1. Advanced local wallets (non-default)**
  - In the mobile app and/or web app, optionally add:
    - “Import mnemonic to this device” flow (explicit, with big warnings).
  - Keep Telegram-first as the recommended path in docs and UI.

- **5.2. Multi-device / guardian support (future)**
  - Extend smart contract / wallet to support multiple keys or social recovery.
  - Use Telegram as one guardian channel among others.

---

This plan should be implemented iteratively: Phase 1 (Mini App wallet), Phase 2 (mobile login shell), Phase 3 (serverless tx + confirmations), then hardening and enhancements. Each step can be validated independently (unit tests on API routes, manual testing in TMA, Expo mobile, and web). 

