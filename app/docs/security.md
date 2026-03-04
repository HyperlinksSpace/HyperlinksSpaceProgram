# Security Model: Telegram-First Wallet

## Goals

- Create wallets inside the Telegram Mini App.
- Let users access the **same wallet** from:
  - Telegram on any device.
  - Other platforms (web / desktop / native) via **Login with Telegram**.
- Keep custody with the **user** (mnemonic as ultimate root of trust), while using Telegram features to improve UX.

This document describes the current high-level design; it is not a formal audit.

---

## Key Concepts & Storage

**Key terms**

- **Mnemonic (seed phrase)**: Ultimate secret that controls the wallet. If lost, funds are lost; if leaked, funds are at risk.
- **Wallet master key**: Device-specific key derived from the mnemonic and stored only on that device.
- **Wallet seed cipher**: Encrypted blob that contains the wallet seed (or a seed-derived secret), usable only together with the wallet master key.
- **Telegram CloudStorage**: Per-user, per-bot key–value store synced via Telegram servers. Suitable for non-secret data or ciphertext.
- **Telegram SecureStorage**: Per-device secure storage, backed by iOS Keychain / Android Keystore, intended for small sensitive values like tokens and keys (see [Mini Apps docs](https://core.telegram.org/bots/webapps#securestorage)).

We **never store raw mnemonics** on our backend or in Telegram CloudStorage.

---

## I. Wallet Creation in Telegram

Flow when a user creates a wallet for the first time in the Telegram Mini App on a device:

1. **Generate mnemonic on the device**
   - The Mini App generates a new mnemonic locally (client-side).
   - The user is shown the mnemonic once and asked to write it down for lifelong backup.

2. **Derive wallet master key (device-local)**
   - From the mnemonic, the app derives a **wallet master key** (e.g. via a BIP-style KDF / HKDF).
   - This master key is stored **only** in Telegram `SecureStorage` on that device.
   - Because `SecureStorage` is backed by **Keychain / Keystore**, the key is:
     - Encrypted at rest.
     - Bound to this device + Telegram app.

3. **Create and store wallet seed cipher (cloud)**
   - The app creates a **wallet seed cipher**:
     - `seed_cipher = Encrypt(wallet_seed_or_root, wallet_master_key)`.
   - `seed_cipher` is stored in Telegram `CloudStorage` under this bot for this user.
   - CloudStorage contains **only ciphertext**, never raw seed or keys.

4. **Persist wallet mapping in our backend**
   - Our backend stores a record like:
     - `telegram_username` (Telegram username, treated as unique in our system),
     - `wallet_address` (public address),
     - metadata (creation time, network, etc.).
   - No mnemonics or master keys are saved server-side.

**Properties**

- The **first Telegram device** has everything needed to use the wallet:
  - Master key in `SecureStorage`.
  - Seed cipher in `CloudStorage`.
- If the app is reinstalled on the **same device**, we can:
  - Recover the master key from `SecureStorage` (if Telegram restores it).
  - Decrypt the seed cipher for a smooth UX without re-entering the mnemonic.
- If `SecureStorage` is wiped, the user must re-enter the mnemonic.

---

## II. New Telegram Device Authorization

When the same user opens the Mini App on **another Telegram client** (new phone/tablet):

1. **Detect existing wallet**
   - Using `initData` / backend lookup, we see that this `telegram_username` already owns at least one `wallet_address`.

2. **Check device SecureStorage**
   - On this **new device**, `SecureStorage` is empty for our bot (no wallet master key yet).
   - We may still see the `seed_cipher` in `CloudStorage` (it is synced across user devices), but without a master key it is useless.

3. **Ask user for mnemonic to authorize this device**
   - The Mini App prompts the user to enter their mnemonic.
   - From the mnemonic we derive a **new device-specific wallet master key** and store it in this device’s `SecureStorage`.
   - Optionally, we re-encrypt and update the `seed_cipher` for this device; but the canonical root of trust remains the mnemonic.

**Result**

- Each Telegram device gains access only after the user proves knowledge of the mnemonic once.
- Loss of a device does **not** affect other devices, as long as the mnemonic is safe.

---

## III. Other Platforms (Outside Telegram)

For platforms outside Telegram (web, desktop app, native mobile app not running inside Telegram), we:

1. **Authenticate via Telegram**
   - Use **Telegram Login for Websites** (see [login widget docs](https://core.telegram.org/widgets/login)) in a browser or embedded WebView.
   - The login widget:
     - Shows a Telegram-branded authorization UI where the user confirms sharing their Telegram identity with our site.
     - After success, returns a signed payload containing `id`, `first_name`, `last_name`, `username`, `photo_url`, `auth_date`, and `hash`.
   - On our backend we verify the `hash` using HMAC-SHA-256 with the SHA-256 of the bot’s token as a key, as described in the official docs.
   - This works on:
     - **Desktop browsers** (Chrome, Firefox, Safari, Edge, …),
     - **Mobile browsers** on **iOS and Android**,
     - In-app WebViews (e.g. inside a native app’s web login screen).

   > For pure native iOS/Android apps, we typically embed a small web login page (with the widget) or open the system browser, then pass the verified Telegram identity back into the app.

2. **Lookup existing wallet**
   - Once Telegram login succeeds, we resolve `telegram_username` in our DB.
   - If there is an associated `wallet_address`, we know this user already owns a wallet.

3. **Authorize the device with the mnemonic**
   - Because we are **outside Telegram**, we do not have Telegram’s `SecureStorage`.
   - We therefore ask the user to **enter the mnemonic** to authorize this new platform.
   - The app derives a **local wallet master key** from the mnemonic and stores it using the platform’s secure storage:
     - iOS: Keychain
     - Android: Keystore
     - Desktop: DPAPI / Keychain / Keyring, depending on OS
     - Web: WebCrypto + IndexedDB (with the usual caveats around user clearing storage).

**Result**

- Telegram login is used purely as an **identity layer** (“who is this user?”).
- The **mnemonic** is still required to authorize a completely new platform.
- Our backend never receives the raw mnemonic; only derived public keys / addresses.

---

## IV. Android / iOS (Single App, Telegram‑Centric Flow)

We ship **one app** (the current `./app` Expo app) to iOS/Android stores. On mobile, the app acts as a shell that:

- Explains why wallet creation happens in Telegram.
- Sends the user into the Telegram Mini App to actually create the wallet.
- Then uses **Telegram Login for Websites** + our backend to recognize the user and their wallet.

### Database: user identification (Telegram username–centric)

In the backend we maintain a `users` table (or equivalent) with at least:

- `telegram_username` – Telegram username, treated as unique in our system.
- `wallet_address` – current wallet address owned by this username.

The mobile app never needs to store the mnemonic or keys; it only needs the `telegram_username` and `wallet_address` retrieved from the backend after Telegram login.

### A. New user on iOS/Android (no wallet yet)

1. **App start → “Log in with Telegram” screen**
   - Shown when there is no linked `telegram_username` in local app storage.
   - Content:
     - Title: “Create your wallet in Telegram”.
     - Short text summarizing benefits:
       - “Wallets are created **inside Telegram**, we never see your seed phrase.”
       - “Your keys are stored using Telegram **SecureStorage + CloudStorage** on your devices.”
       - “You can access the same wallet from Telegram, web, and this app.”
     - UI:
       - Primary button: **“Open Telegram to create wallet”**.
       - Secondary button (dimmed / smaller): **“I already created my wallet in Telegram”** (goes to login widget, see flow B).
   - Action on primary:
     - Deep link to Mini App, e.g. `https://t.me/<bot_username>?startapp=wallet_onboarding`.

2. **Telegram Mini App: wallet creation (same as section I)**
   - Generate mnemonic, show/confirm it.
   - Derive wallet master key → store in `SecureStorage`.
   - Encrypt wallet seed → store cipher in `CloudStorage`.
   - Call backend `register_wallet(telegram_username, wallet_address)` which:
     - Creates a new `users` row.
     - Stores `telegram_username`, `wallet_address`.
   - Show a completion screen:
     - “Your wallet is ready in Telegram.”
     - Instruction: “Return to the app and tap ‘I already created my wallet’ to connect.”

3. **Back in iOS/Android app → “Log in with Telegram” (Telegram login widget)**
   - User returns to the app and taps **“I already created my wallet in Telegram”** (or simply “Log in with Telegram”).
   - App opens an embedded WebView or browser page with **Telegram Login for Websites**:
     - Widget asks the user to confirm sharing their Telegram identity.
     - After success, backend receives a signed payload and validates it as in section III.
     - Backend extracts `username` from the payload and looks up `telegram_username` in `users`:
       - If found, returns `{ telegram_username, wallet_address, ... }` to the app.
       - If not found (edge case: user logged in before creating wallet), the app can:
         - Show “No wallet yet, please create it in Telegram first” and show the **Open Telegram** button again.

4. **App state after linking**
   - The app stores `telegram_username` and `wallet_address` in its local storage.
   - It can now:
     - Display balances / history via backend or blockchain APIs.
     - For signing, either:
       - Redirect back to Telegram Mini App on an action (“Sign in Telegram”), or
       - In a future advanced flow, allow the user to import mnemonic locally (explicit, non‑default).

### B. Existing Telegram wallet user installing iOS/Android app

For a user who already has a Telegram wallet (created earlier in the Mini App):

1. **App start → same “Log in with Telegram” screen**
   - The screen is identical, but the text emphasizes:
     - “If you already created your wallet in Telegram, just log in below.”
   - Action:
     - User taps **“I already created my wallet in Telegram”** / **“Log in with Telegram”**.

2. **Telegram Login for Websites**
   - Same widget flow as in A.3.
   - Backend verifies the payload and looks up `telegram_username` in `users`:
     - If a row exists → return `{ telegram_username, wallet_address }` to the app.
     - If no row exists → the app suggests:
       - “We don’t see a wallet yet. Please open Telegram to create one.” and shows the **Open Telegram to create wallet** button.

3. **After login**
   - The app saves `telegram_username` + `wallet_address` locally and shows the wallet UI.
   - No mnemonic is ever handled by the app in this default flow.

**Key points of this model**

- There is **one app** (`./app`), not a separate companion; mobile just has a Telegram‑centric onboarding path.
- All wallet creation and key material remain in the Telegram Mini App and its SecureStorage/CloudStorage environment.
- The iOS/Android app uses:
  - **Telegram Login for Websites** to learn “who is this user?” (via `username`),
  - The backend’s `users` table (`telegram_username`, `wallet_address`) to link that identity to a wallet.
- Users who don’t want to connect Telegram can only use future “local‑only” features if we add them explicitly; the default path is Telegram‑first. 

---

## V. Serverless Transaction Flow & Bot‑Based Confirmation

We assume a **serverless backend** (e.g. Vercel / Cloudflare / Lambda functions) with:

- Stateless HTTP handlers (API routes).
- A persistent datastore (serverless Postgres / KV / Dynamo, etc.) for:
  - `users` (`telegram_username`, `wallet_address`, …).
  - `pending_transactions` (id, telegram_username, payload, status, timestamps).

All **signing** happens on the client side (Telegram Mini App or other wallet environment); serverless functions never hold private keys.

### 1. Initiating a transaction (any client)

From any frontend (Telegram Mini App, web, iOS/Android app):

1. Client sends a request to a serverless endpoint, e.g. `POST /api/tx/create`:
   - Body includes:
     - `telegram_username` (or derived from Telegram auth),
     - transaction intent (action type, amount, asset, destination, etc.).
2. Serverless handler:
   - Validates the request and user identity.
   - Creates a `pending_transactions` row with:
     - `id` (e.g. UUID or short code),
     - `telegram_username`,
     - serialized transaction payload (what needs to be signed),
     - status = `pending`.
   - Uses the **Telegram Bot API** to send a push message to the user:
     - “New action requires confirmation: <summary>”.
     - Inline button: **“Review & confirm”** linking to:
       - Recommended: Mini App deep link, e.g.\
         `https://t.me/<bot_username>?startapp=tx_<id>`
       - Optionally, a web URL, e.g.\
         `https://app.hyperlinks.space/tx/<id>`.

### 2. Confirmation page (Telegram Mini App)

When the user taps the button in the bot message and opens the Mini App:

1. The Mini App receives `start_param = tx_<id>` via `initData`.
2. It calls a serverless endpoint, e.g. `GET /api/tx/<id>`:
   - Backend verifies the request using `initData`/`hash` and checks that:
     - `pending_transactions.id` exists,
     - `telegram_username` from DB matches the Mini App user,
     - status is `pending`.
   - Backend returns the transaction details (read‑only).
3. Mini App shows a **confirmation UI**:
   - Clear summary: amounts, assets, destination, fees, network.
   - Buttons: **Confirm** / **Reject**.

### 3. Signing & broadcasting (inside Telegram)

On **Confirm** from the Mini App:

1. Mini App reconstructs/derives the transaction to be signed using:
   - The locally available wallet (seed/master key in `SecureStorage`).
   - The payload from `pending_transactions`.
2. Mini App signs the transaction **locally** using the wallet key.
3. Mini App sends a request to a serverless endpoint, e.g. `POST /api/tx/<id>/complete` with:
   - `id`,
   - signed transaction payload (or only the resulting transaction hash if the client broadcasts itself),
   - confirmation that user accepted.
4. Serverless handler:
   - Verifies that the caller is the right `telegram_username` and that tx is still `pending`.
   - Either:
     - Broadcasts the signed transaction to the chain (if backend has RPC access and broadcasting doesn’t leak secrets), **or**
     - Simply records the fact that this transaction was confirmed and uses a separate service / worker to broadcast.
   - Updates `pending_transactions.status` to `confirmed` (or `failed` with reason).

The originating client (web / mobile app) can poll or subscribe for status changes on `pending_transactions` to reflect completion.

### 4. Optional: web‑only confirmation page

For users who click a **web URL** from the bot instead of the Mini App:

- The confirmation page:
  - Uses **Telegram Login for Websites** to authenticate the user (retrieve `username`).
  - Loads the `pending_transactions` row by `id` + `telegram_username`.
  - Shows the same confirmation UI.
- For signing, we recommend **redirecting back to Telegram** for actual key usage:
  - On **Confirm**, the web page can:
    - Either deep‑link into the Mini App with the same `tx_<id>`, or
    - Ask the user to enter the mnemonic or connect an external wallet (advanced, non‑default).
- This keeps the **self‑custodial key** anchored in the Mini App by default, while still allowing purely web‑based flows where the user explicitly opts into entering their mnemonic or linking another wallet.

### Serverless guarantees

- All backend logic is stateless across requests; long‑lived data lives in `users` and `pending_transactions`.
- No private keys or mnemonics are ever stored or derived in serverless functions.
- Bot pushes and confirmation flows are coordinated exclusively via:
  - Telegram Bot API (for notifications),
  - Telegram Mini App (for secure signing with SecureStorage),
  - Telegram Login (for identity on web / mobile).

This model keeps transaction approvals **user‑driven and key‑local** (inside Telegram or another explicit wallet) while still fitting neatly into a serverless architecture. 

---

## Security Properties

- **Self-custody:**
  - The mnemonic is the **only ultimate key**; if the user keeps it offline and safe, they retain full control over funds.
  - Neither our backend nor Telegram can unilaterally move funds without the mnemonic / keys.

- **Device-local keys:**
  - Each device has its own **wallet master key** stored in that device’s secure storage (Telegram SecureStorage or OS keystore).
  - Compromise of one device does **not** automatically compromise others.

- **Cloud data is ciphertext only:**
  - `Wallet Seed Cipher` in CloudStorage is encrypted with a master key that lives only in secure storage on a device.
  - An attacker with only CloudStorage access cannot derive the mnemonic.

- **Cross-platform restore requires mnemonic:**
  - Any **new environment** (new Telegram device with empty SecureStorage or any non-Telegram platform) requires the mnemonic once.

---

## Limitations & Notes

- If the **mnemonic is lost**, there is no recovery (by design) – it is the self-custodial root.
- If a device with a master key is compromised, an attacker can act as the owner from that device until the user moves funds to a new wallet.
- Telegram `SecureStorage` is documented for **iOS and Android**; behavior on other Telegram clients may differ.
- Telegram Login for Websites is an **authentication mechanism only** – it does not give access to keys or the mnemonic itself, and cannot replace the mnemonic for wallet authorization.
