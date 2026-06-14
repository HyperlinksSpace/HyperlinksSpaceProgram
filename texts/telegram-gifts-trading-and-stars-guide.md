# Telegram gifts trading & Stars management — integration guide

Practical guide for **Hyperlinks Space Program (HSP)**: how buying and selling gifts works on Telegram, how **off-chain** vs **on-chain** gifts differ, what you need to integrate, and how users can **manage Telegram Stars** inside the app.

**Authoritative API references:**

- [Telegram Gifts](https://core.telegram.org/api/gifts)
- [Telegram Stars](https://core.telegram.org/api/stars)
- [Payment API](https://core.telegram.org/api/payments)

**Related HSP docs:**

- [`telegram-gifts-integration-research.md`](telegram-gifts-integration-research.md) — full API catalog, Trade UI mapping (§13), normalized schema
- [`trade-gift-marketplace-telegram-api.md`](trade-gift-marketplace-telegram-api.md) — product spec, non-custodial marketplace architecture
- [`login-and-telegram-messages-architecture.md`](login-and-telegram-messages-architecture.md) — TDLib session model (shared with gifts)

---

## 1) Executive summary

| Topic | What to know |
|-------|--------------|
| **Where gifts live** | By default **off-chain** in Telegram cloud. **On-chain** only after user **exports** a collectible to Fragment/TON as an NFT. |
| **What Trade sells** | **Collectible gifts** (`starGiftUnique`, identified by `slug`) on Telegram’s **official resale market** — not arbitrary stickers before upgrade. |
| **Who holds custody** | Always the **user’s Telegram account**. HSP never takes possession of gifts for marketplace listing. |
| **API layer** | **MTProto Client API** (`payments.*`) via **TDLib user session** — not Bot API, not Mini App `initData` alone. |
| **Currency** | **Telegram Stars** for most flows; some listings use **TON (nanotons)**. HSP’s TON wallet (Send/Swap) is **separate**. |
| **Stars in HSP** | Show balance + history via TDLib; **top-up and spend** through Telegram’s payment UI (or deep links); do not reimplement App Store billing in a web-only client. |

---

## 2) Off-chain vs on-chain gifts

### 2.1 Off-chain (default — what Trade integrates)

```
User Telegram account
        │
        ▼
Telegram cloud (payments.*)
  • inventory: savedStarGift / starGiftUnique
  • marketplace: getResaleStarGifts, updateStarGiftPrice
  • settlement: Stars or TON via Telegram payment flow
        │
        ▼
HSP Trade UI (read + list + buy via TDLib gateway)
```

**Characteristics:**

- Ownership, listing, purchase, and P2P transfer are recorded in **Telegram’s cloud**.
- Payment for catalog gifts, upgrades, resale, and paid transfers uses **Telegram Stars** (`currency = XTR`) or **TON** where the API exposes `starsTonAmount` / `resale_ton_only`.
- HSP acts as a **Telegram client UI** — cache and presentation only; Telegram is source of truth.

**This is the primary integration path for Trade.**

### 2.2 On-chain (optional — export, not day-to-day trading)

```
Collectible in Telegram (slug)
        │
        ▼
payments.getStarGiftWithdrawalUrl (+ 2FA password)
        │
        ▼
Fragment → TON NFT (gift_address on starGiftUnique)
```

**Characteristics:**

- User **exports** a collectible to **Fragment** as an NFT on TON.
- Requires `can_export_at` time lock and **2FA SRP password**.
- After export, the asset lives **on-chain**; trading on Fragment/TON marketplaces is **outside** Telegram’s gift resale API.
- HSP can show **Fragment stats** via `payments.getUniqueStarGiftValueInfo` (floor, last sale) and link to export — but **do not** treat on-chain NFT trading as the same flow as Telegram marketplace buy/sell.

### 2.3 Comparison table

| | Off-chain (Telegram cloud) | On-chain (Fragment / TON NFT) |
|---|---------------------------|--------------------------------|
| **Asset id** | `slug`, `num`, attributes | `gift_address`, NFT on TON |
| **Buy/sell in Trade** | Yes — resale market API | No — separate TON/Fragment UX |
| **Payment** | Stars or Telegram TON listing | TON wallet, Fragment |
| **HSP integration** | TDLib + Trade panel | Detail links, export URL, value info |
| **Custody** | User’s Telegram account | User’s TON wallet after export |

**Rule:** Trade MVP = **off-chain resale**. On-chain = secondary “Export to Fragment” action on gift detail.

---

## 3) Two gift types (do not mix in UI)

### 3.1 Regular star gift (`StarGift`)

- Bought from Telegram catalog (`payments.getStarGifts`) with **Stars**.
- Recipient can:
  - **Display** on profile (`saveStarGift`)
  - **Convert** to Stars (`convertStarGift`) — destroys gift, credits `convert_stars`
  - **Upgrade** to collectible if `can_upgrade` (`upgradeStarGift` / upgrade invoice)

**Not listed on the official resale market until upgraded.**

### 3.2 Collectible / unique gift (`starGiftUnique`)

- Created by **upgrade** from a regular gift.
- Has global **`slug`**, serial **`num`**, **attributes** (model, pattern, backdrop, rarity).
- Supports **marketplace resale**, P2P transfer, profile display, optional Fragment export.

**Trade feed rows must only show collectibles with a `slug`.** Regular un-upgraded gifts belong in “My inventory → Upgrade,” not in the marketplace feed.

---

## 4) How selling works

Telegram’s model is **non-custodial**: the gift stays in the **seller’s Telegram account** until someone buys it. There is no escrow bot or marketplace service account.

### 4.1 Flow diagram

```
Seller owns collectible (savedStarGift / slug)
        │
        ▼
payments.updateStarGiftPrice(stargift, resell_amount)
        │
        ▼
Listing visible in payments.getResaleStarGifts
        │  (gift still in seller inventory)
        ▼
Buyer pays via inputInvoiceStarGiftResale
        │
        ▼
Telegram moves ownership → messageActionStarGiftUnique
        │
        ▼
Seller receives Stars/TON minus commission
```

### 4.2 Step-by-step (seller)

1. User connects **Telegram identity** (HSP login) **and** **gifts session** (TDLib — see §8).
2. Open **My gifts** → `payments.getSavedStarGifts` (include unique collectibles).
3. Pick a collectible that has passed **`can_resell_at`**.
4. Set price → `payments.updateStarGiftPrice`:
   - **`resell_amount`** in **Stars**, or
   - **`resell_amount`** in **nanotons** when TON resale is allowed (`resale_ton_only` on some types).
5. Listing appears in `getResaleStarGifts` after Telegram indexes it.
6. **Unlist:** same method with **`resell_amount = 0`**.

### 4.3 Validation HSP must enforce (from Telegram config)

| Constraint | Config keys (examples) |
|------------|------------------------|
| Min/max list price (Stars) | `stars_stargift_resale_amount_min`, `stars_stargift_resale_amount_max` |
| Min/max list price (TON) | `ton_stargift_resale_amount_min`, `ton_stargift_resale_amount_max` |
| Resale commission | `stars_stargift_resale_commission_permille`, `ton_stargift_resale_commission_permille` |
| Per-type floor | `resell_min_stars` on catalog type |
| Time lock | `can_resell_at` on saved gift |
| Master kill switch | `stargifts_blocked` |

Show **estimated payout** = `price × (1 − commission)` before confirm.

### 4.4 What the seller receives

- **Stars listing:** Stars credited to seller’s **Telegram Stars balance** (minus commission).
- **TON listing:** TON settlement per Telegram’s TON gift payment rules — still **not** the same as HSP wallet balance unless user withdraws/transfers separately.

---

## 5) How buying works

### 5.1 Flow diagram

```
Buyer browses getResaleStarGifts (filters, sort, pagination)
        │
        ▼
Optional detail: getUniqueStarGift + getUniqueStarGiftValueInfo
        │
        ▼
payments.getPaymentForm + inputInvoiceStarGiftResale { slug, to_id }
        │
        ▼
User confirms payment (Stars debit or TON)
        │
        ▼
sendPaymentForm → ownership transfer + service message
        │
        ▼
Buyer owns collectible in Telegram cloud (off-chain)
```

### 5.2 Step-by-step (buyer)

1. Browse Trade feed → `GET /api/gifts/resale` → gateway calls `getResaleStarGifts`.
2. Tap listing → detail via `getUniqueStarGift` (+ optional floor/Fragment stats from `getUniqueStarGiftValueInfo`).
3. **Buy** requires connected gifts session + sufficient **Stars balance** (or TON path for TON-only listings).
4. Checkout: `getPaymentForm` with **`inputInvoiceStarGiftResale`**:
   - `slug` — listing id
   - `to_id` — buyer (self), another user, or channel with `stargifts_available`
5. Complete **`sendStarsForm`** / standard payment flow.
6. Refresh inventory; optional Feed card from `messageActionStarGiftUnique`.

### 5.3 Buying new catalog gifts (not resale)

Different invoice: **`inputInvoiceStarGift`** (`gift_id`, recipient `peer`). Used when sending a **new** gift from the shop — not the Trade marketplace feed.

Pre-flight: **`payments.checkCanSendGift`** before checkout (recipient blocks, limits, `locked_until_date`).

---

## 6) Related gift actions (not marketplace listing)

| Action | API | Notes |
|--------|-----|-------|
| Convert gift → Stars | `convertStarGift` | Destroys regular gift; window = `stargifts_convert_period_max` |
| Upgrade → collectible | `upgradeStarGift`, upgrade invoice | Required before resale for that gift line |
| P2P transfer | `transferStarGift`, `inputInvoiceStarGiftTransfer` | Direct send; respect `can_transfer_at`, `transfer_stars` fee |
| Export to NFT | `getStarGiftWithdrawalUrl` | On-chain; 2FA; `can_export_at` |
| Profile display | `saveStarGift`, collections, pin | Social/showcase |

Trade **marketplace** = **resale list + resale buy**. Other actions belong on gift detail overflow (phase 5+).

---

## 7) Payment pipeline (shared by gifts and Stars)

All paid gift operations use the **standard Telegram payment pipeline**:

1. Build **`InputInvoice`** variant:
   - `inputInvoiceStarGift` — new catalog gift
   - `inputInvoiceStarGiftResale` — buy listing
   - `inputInvoiceStarGiftUpgrade` — upgrade owned gift
   - `inputInvoiceStarGiftTransfer` — paid P2P transfer
   - `inputInvoiceStars` — buy Stars top-up (see §9)
2. **`payments.getPaymentForm`** → form id, prices, provider data
3. User confirms → **`payments.sendStarsForm`** / `sendPaymentForm`
4. Server pushes **`Updates`** + service messages

**Currency code for Stars:** `XTR`. Amounts are in whole Stars unless documented otherwise.

**TMA implication:** in a Mini App webview, completing payment often requires **handing off to Telegram’s native payment UI** rather than a custom web checkout. Desktop TDLib can drive the full form flow more directly.

---

## 8) What you need to integrate (checklist)

### 8.1 Product and legal

- Position HSP as a **third-party Telegram client** using the official Client API — not a custodial escrow marketplace.
- **Separate consents:**
  - “Sign in with Telegram” (identity: TMA `initData` / OIDC)
  - “Connect Telegram for gifts” (MTProto / TDLib session)
- Disable gift features when **`stargifts_blocked`** or **`stars_purchase_blocked`** (regional).

### 8.2 Technical stack

| Layer | Purpose |
|-------|---------|
| **Telegram identity** | Map HSP `user_id` ↔ `telegram_user_id` (existing auth) |
| **TDLib user session** | Required for inventory, list, buy, Stars balance, payment forms |
| **Gift gateway** | TDLib worker per linked user; encrypted session at rest; `payments.*` |
| **HSP REST API** | Proxy for Trade UI: resale, unique detail, inventory, list, buy, Stars status |
| **Trade UI** | Replace sample data in `TradePanelContent`; detail sheet; connect banner |

**Bot API + `initData` alone is insufficient** for sell/buy or Stars balance.

### 8.3 Suggested API routes

| Route | Telegram method(s) | Session |
|-------|---------------------|---------|
| `GET /api/gifts/resale` | `getResaleStarGifts` | Optional (read) |
| `GET /api/gifts/unique/:slug` | `getUniqueStarGift`, `getUniqueStarGiftValueInfo` | Optional |
| `GET /api/gifts/inventory` | `getSavedStarGifts` | **Required** |
| `POST /api/gifts/list` | `updateStarGiftPrice` | **Required** |
| `POST /api/gifts/buy` | `getPaymentForm` + resale invoice | **Required** |
| `GET /api/stars/status` | `getStarsStatus` | **Required** |
| `GET /api/stars/transactions` | `getStarsTransactions` | **Required** |
| `POST /api/telegram/gifts/connect` | TDLib auth lifecycle | — |

### 8.4 End-user requirements

| Action | User needs |
|--------|------------|
| Browse resale feed | None (or gateway read session) |
| View detail | None |
| List / unlist | Gifts TDLib session + owned collectible + `can_resell_at` |
| Buy | Gifts session + **enough Stars** (or TON for TON listing) |
| Top up Stars | Gifts session + Telegram payment surface (see §9) |
| Export to Fragment | Gifts session + 2FA password + `can_export_at` |

### 8.5 Phased rollout

| Phase | Deliverable |
|-------|-------------|
| **0 — Spike** | TDLib script: auth → `getResaleStarGifts` → `getSavedStarGifts` |
| **1 — Read-only Trade** | Live feed + detail sheet; mock flag for layout dev |
| **2 — Session + Stars read** | Connect banner; balance chip; transaction list |
| **3 — Sell** | List/unlist with config validation |
| **4 — Buy** | Resale checkout + payment completion |
| **5 — Extras** | Upgrade, convert, transfer, export, Feed events |

---

## 9) Managing Telegram Stars in HSP

Stars are the **native currency** for gift purchases, upgrades, resale (Stars-denominated listings), paid transfers, and many other Telegram features. HSP should help users **see, understand, and spend** Stars — while **delegating top-up and settlement** to Telegram where required.

### 9.1 What Stars are (in this context)

- **Virtual items** inside Telegram (`currency = XTR`).
- Used to pay for: **gifts** (catalog, upgrade, resale, transfer fees), bot/mini-app goods, paid media/messages/reactions, subscriptions, etc.
- **Separate from HSP TON wallet** (Send/Swap). Do not merge “Stars balance” and “TON wallet balance” in one number.

### 9.2 What HSP can do with Stars

| Capability | API | HSP UX |
|------------|-----|--------|
| **Show balance** | `payments.getStarsStatus` (`peer=inputPeerSelf`) | Header chip on Trade; profile/settings row |
| **Live balance updates** | `updateStarsBalance` (TDLib push) | Refresh chip without full reload |
| **Transaction history** | `payments.getStarsTransactions` (paginate via `next_offset`) | “Stars activity” screen: purchases, sales, top-ups, gift conversions |
| **Filter history** | `inbound` / `outbound` flags | Tabs: Received / Spent |
| **Fetch specific tx** | `getStarsTransactionsByID` | Receipt/detail from notification deep link |
| **Top-up options list** | `getStarsTopupOptions` | Show packs (Stars amount, local currency price) before checkout |
| **Buy Stars for self** | `getPaymentForm` + `inputInvoiceStars` + `inputStorePaymentStarsTopup` | “Add Stars” → Telegram payment |
| **Gift Stars to friend** | `getStarsGiftOptions` + `inputStorePaymentStarsGift` | Optional social feature; requires `stars_gifts_enabled` |
| **Spend on gifts** | Gift invoice types (§7) | Buy resale, send catalog gift, pay upgrade — all debit Stars |
| **Earn Stars** | Gift **sale** (resale payout), **convert** regular gift | Show in history as inbound (`stargift_resale`, gift-related flags on `starsTransaction`) |
| **Low balance prompt** | Pass `spend_purpose_peer` on top-up invoice | When buy fails for insufficient Stars, open top-up with context |

All of the above require a **TDLib user session** (same gifts connect flow), except read-only marketing pages that deep-link to Telegram.

### 9.3 What HSP should not try to do

| Limitation | Reason |
|------------|--------|
| **Reimplement App Store / Play billing** in pure web | `assignAppStoreTransaction` / `assignPlayMarketTransaction` store flow is **not available to third-party apps** per Stars docs |
| **Custodial Stars wallet** | Stars live on the user’s Telegram account; HSP does not hold Stars |
| **Withdraw user Stars to TON** (consumer balance) | **`getStarsRevenueWithdrawalUrl`** is for **bot/channel owners** monetizing via Stars — not personal gift-buyer balances |
| **Bypass Telegram payment for official listings** | Off-platform “send me Stars separately” breaks marketplace trust and ToS |
| **Use Bot API balance for user gift buys** | Bot Stars balance ≠ user Stars balance; gift resale debits **buyer’s user account** |

### 9.4 Top-up UX (recommended patterns)

**Pattern A — Deep link to Telegram (simplest, lowest risk)**

- Use Telegram **My Stars** deep links to open the official top-up page inside the Telegram client.
- HSP shows read-only balance + “Add Stars in Telegram” button.
- Best when TDLib payment completion in TMA is unreliable.

**Pattern B — In-app top-up via TDLib (fuller UX)**

1. User taps **Add Stars** in Trade or Settings.
2. Gateway: `getStarsTopupOptions` → render packs.
3. User selects pack → `getPaymentForm` with `inputInvoiceStars` / `inputStorePaymentStarsTopup`.
4. Complete payment via **`sendStarsForm`** (or native handoff in TMA).
5. Listen for **`updateStarsBalance`**; refresh UI.

**Pattern C — Contextual top-up on failed buy**

1. User taps **Buy gift** → insufficient Stars.
2. Show shortfall amount; pre-fill top-up with **`spend_purpose_peer`** pointing at the gift/marketplace context.
3. After top-up, retry buy.

**Pattern D — Fragment (large purchases)**

- Stars docs note **Fragment** as an alternative for larger Star purchases.
- HSP can link out; do not assume Fragment API inside Trade v1.

### 9.5 Stars activity screen (suggested UI)

Place under Trade, Settings, or a dedicated **“Telegram Stars”** row (not inside TON Send/Swap):

```
┌─────────────────────────────────────┐
│  ⭐ 1,240 Stars          [Add Stars] │
├─────────────────────────────────────┤
│  Received │ Spent                    │
├─────────────────────────────────────┤
│  +500  Gift resale #1842    Today    │
│  −120  Bought Pepe #991     Yesterday│
│  +50   Converted cake gift  …        │
│  −1000 Stars top-up (App Store) …    │
└─────────────────────────────────────┘
```

Map `starsTransaction` flags to copy:

| Flag | Label idea |
|------|------------|
| `stargift_resale` | Gift sale / purchase |
| `stargift_upgrade` | Upgrade to collectible |
| `gift` | Received/sent gift |
| `refund` | Refund |
| `pending` / `failed` | Status badges |

Use `transaction_url` when present for receipt links.

### 9.6 Stars and gift flows together

| User goal | Stars role |
|-----------|------------|
| Buy resale listing | Debit buyer balance (or TON if TON listing) |
| List for sale | No Stars spent; seller earns on sale |
| Upgrade to collectible | Debit `upgrade_stars` |
| Send new catalog gift | Debit catalog `stars` price |
| Paid P2P transfer | Debit `transfer_stars` if set |
| Convert regular gift | **Credit** `convert_stars` to balance |
| Sell on marketplace | **Credit** `price × (1 − commission)` |

**Pre-buy check:** before enabling Buy on detail sheet, compare `getStarsStatus.balance` to listing `resell_amount.stars`. If insufficient, route to top-up (§9.4).

### 9.7 TON vs Stars on listings

Some collectibles list in **nanotons** (`starsTonAmount`, `resale_ton_only`):

- Payment still goes through Telegram’s payment form — not HSP Send/Swap.
- UI should label clearly: **“500 ⭐”** vs **“2.5 TON”**.
- HSP TON wallet may fund other app features but **does not automatically pay Telegram gift TON invoices** unless Telegram exposes a linked flow in the payment form (follow `getPaymentForm` provider data — do not assume wallet connect alone is enough).

### 9.8 Regional and feature flags

| Flag | Effect on Stars UI |
|------|-------------------|
| `stars_purchase_blocked` | Hide/disable **Add Stars** and **Buy**; show balance/history read-only if legal |
| `stargifts_blocked` | Hide entire gifts + Stars spend paths tied to gifts |
| `stars_gifts_enabled` | Gate “Gift Stars to friend” |

Gateway caches config with TTL; API responses should include `giftsConfig` / `starsConfig` for client validation.

### 9.9 Bot / channel Stars (out of scope for consumer Trade)

Creators with **bots or channels** can have **separate Stars revenue balances**, withdrawal to TON via Fragment, and ads account URLs (`getStarsRevenueStats`, `getStarsRevenueWithdrawalUrl`). That is **monetization admin** UX — not the same as a consumer’s personal Stars balance used to buy gifts. Defer unless HSP adds creator tools.

### 9.10 Star rating (optional profile surface)

Telegram exposes **`starsRating`** on `userFull` (level based on Star transaction volume). HSP may show this on profile or seller cards in Trade for trust signaling. Purchases, paid messages, and gift activity increase rating; refunds and gift-to-Stars conversion decrease it.

---

## 10) Architecture (HSP)

```
┌──────────────────────────────────────────────────────────────┐
│  HSP surfaces                                                 │
│  Trade · Stars balance/history · Gift detail · Connect banner │
└────────────────────────────┬─────────────────────────────────┘
                             │ HSP REST (session cookie)
┌────────────────────────────▼─────────────────────────────────┐
│  Gift + Stars gateway (TDLib)                                 │
│  payments.getResaleStarGifts · updateStarGiftPrice            │
│  getStarsStatus · getStarsTransactions · getPaymentForm       │
└────────────────────────────┬─────────────────────────────────┘
                             │ MTProto
┌────────────────────────────▼─────────────────────────────────┐
│  Telegram cloud — gifts inventory + Stars balance + marketplace│
└──────────────────────────────────────────────────────────────┘
```

**Identity link** (existing): HSP user ↔ `telegram_user_id`.  
**Session link** (new): encrypted TDLib auth per user who trades or views Stars.  
**Cache** (optional): resale feed, Stars history pages — invalidate on `updateStarsBalance` / gift updates.

---

## 11) Trade UI mapping (quick reference)

| Trade region | Data source |
|--------------|-------------|
| Collection row | `getStarGiftCollections` or popular `gift_id` families |
| Feed rows | `getResaleStarGifts` → collectibles with `slug` |
| Floor / stats | `getUniqueStarGiftValueInfo` |
| Buy / Sell | Session-gated; Stars balance check before buy |
| Stars chip | `getStarsStatus.balance` |

Full component-level mapping: [`telegram-gifts-integration-research.md` §13](telegram-gifts-integration-research.md).

---

## 12) Security and UX requirements

1. **Separate consents** for identity vs gifts/Stars session; clear revoke.
2. **Encrypt** TDLib session at rest; never log session + payment ids together in analytics.
3. **Do not merge** Telegram Stars and HSP TON wallet in one balance display.
4. **Surface time locks** (`can_resell_at`, `can_transfer_at`, `can_export_at`) before user commits.
5. **Commission and net payout** visible before list confirm.
6. **Graceful degradation:** gateway down → empty state; no session → read-only + connect banner; `stars_purchase_blocked` → no buy/top-up.

---

## 13) FAQ

**Can users sell without sending gifts to HSP?**  
Yes. Listing uses `updateStarGiftPrice` while the gift stays in their Telegram account.

**Are gifts on-chain by default?**  
No. Off-chain in Telegram until the user exports to Fragment/TON.

**Can we ship Trade without TDLib?**  
Partially: read-only catalog/detail if a gateway provides public read. Sell, buy, and Stars management require user session.

**Where do users add Stars in HSP?**  
Show balance via `getStarsStatus`; top-up via TDLib payment form and/or deep link to Telegram **My Stars**. Do not build a fake Stars store on web-only billing.

**What’s the minimum useful release?**  
Read-only resale feed + collectible detail + Stars balance (read-only) + connect banner explaining how to enable trading.

---

## 14) Next engineering steps

1. TDLib spike (phase 0): auth → balance → one resale browse → one list/unlist on test account.
2. `GET /api/stars/status` + Trade header balance chip.
3. Wire `TradePanelContent` to live resale feed (phase 1).
4. Gifts connect flow + sell/buy (phases 2–4).
5. Stars activity screen + contextual top-up (phase 2–4).

See backlog **TDLIB** and [`telegram-gifts-integration-research.md` §12–§13](telegram-gifts-integration-research.md) for file-level touch lists.
