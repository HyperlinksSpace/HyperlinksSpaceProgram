# Trade section: Telegram gift marketplace (direct user custody)

This document describes how Hyperlinks Space Program can implement a **gift marketplace** in the **Trade** panel (`/trade`, `TradePanelContent`) using Telegram’s **native Stars / TON gift resale** model.

**Primary product goal:** users connect their Telegram identity and **buy, sell, list, and manage gifts in their own Telegram account** — **without** routing gifts through a custodial “marketplace bot” or intermediate service account.

**Short answer:** Telegram’s API **does support** non-custodial resale (gift stays on the seller until a buyer pays; Telegram settles ownership atomically). That flow lives on the **MTProto user API** (`payments.*`), **not** on the Bot API or Mini App `initData` alone. HSP must add a **user Telegram session** layer (typically **TDLib**) on top of the identity linking we already have.

Reference: [Telegram Gifts](https://core.telegram.org/api/gifts).

---

## 1) Product fit: Trade section today

The Trade UI is currently a **layout shell** with sample collections and feed rows (`ui/trade/tradeSampleData.ts`, `TradePanelContent.tsx`). There is no live marketplace backend yet.

A gift marketplace maps naturally to Trade:

| Trade UI area | Gift marketplace mapping |
|---------------|---------------------------|
| **Collections row** | User’s owned gifts / curated gift collections (`payments.getStarGiftCollections`, `payments.getSavedStarGifts`) |
| **Tabs / filters** | Gift type, price sort, attributes (model, backdrop, pattern), Stars vs TON |
| **Feed rows** | Resale listings (`payments.getResaleStarGifts`), recent sales, price changes |
| **Actions** | List, unlist, buy, transfer, upgrade, convert (where allowed) |

---

## 2) Telegram gift model (what can be traded)

Telegram distinguishes **regular star gifts** and **collectible (unique) gifts**.

### 2.1 Regular gifts

- Bought from Telegram’s catalog via `payments.getStarGifts` + `inputInvoiceStarGift`.
- Recipient can **display on profile** (`payments.saveStarGift`), **convert to Stars** (`payments.convertStarGift`), or **upgrade** to a collectible if `can_upgrade` is set.
- **Resale marketplace applies to upgraded collectibles**, not to arbitrary “send a cake sticker” flows before upgrade.

### 2.2 Collectible (unique) gifts

- Created by upgrading a received gift (`payments.upgradeStarGift` / `inputInvoiceStarGiftUpgrade`).
- Each collectible has a **`slug`**, **attributes** (model, pattern, backdrop, number), and optional **TON NFT export** via Fragment (`payments.getStarGiftWithdrawalUrl`).
- These are the assets that participate in the **official resale marketplace**:
  - **List:** `payments.updateStarGiftPrice`
  - **Browse:** `payments.getResaleStarGifts`
  - **Buy:** `inputInvoiceStarGiftResale` → standard payment flow (`payments.getPaymentForm`)
  - **P2P transfer:** `payments.transferStarGift` / `inputInvoiceStarGiftTransfer` (separate from marketplace listing)

---

## 3) Native marketplace mechanics (no custodial middle account)

This is the model that matches the product requirement.

### 3.1 How listing works

1. User owns a collectible in **their** Telegram account (`savedStarGift` / `starGiftUnique`).
2. User sets a resale price with `payments.updateStarGiftPrice`:
   - Price in **Telegram Stars** (`resell_amount` in Stars), or
   - Price in **nanotons** for TON-denominated resale (when allowed; some gifts have `resale_ton_only`).
3. Passing **`0`** unlists the gift from the marketplace.
4. The gift **remains in the seller’s inventory** until someone buys it. There is **no** documented step where the seller must transfer the gift to a marketplace escrow account first.

### 3.2 How buying works

1. Buyer browses `payments.getResaleStarGifts` (filter by `gift_id`, attributes, sort by price / number / last price change).
2. Buyer starts checkout with `inputInvoiceStarGiftResale`:
   - `slug` from the listing
   - `to_id`: recipient (buyer themselves, another user, or a channel with `stargifts_available`)
3. Standard Stars / TON payment flow completes; Telegram emits `messageActionStarGiftUnique` and moves ownership.

### 3.3 Fees and limits

- Resale commission is defined in client config (`stars_stargift_resale_commission_permille`, `ton_stargift_resale_commission_permille`): seller receives `price * (1 - commission)`.
- Min/max resale amounts: `stars_stargift_resale_amount_min/max`, `ton_stargift_resale_amount_min/max`.
- Time locks: `can_resell_at`, `can_transfer_at`, `can_export_at` on `savedStarGift` / `messageActionStarGiftUnique`.

### 3.4 What we should **not** build (unless forced)

| Anti-pattern | Why avoid |
|--------------|-----------|
| User sends gift to **our bot / service account**, we re-list | Custodial, trust-heavy, ToS/policy risk, worse UX, not needed for official resale |
| We “mirror” ownership in our DB as source of truth | Telegram cloud owns gift state; our DB is cache/index only |
| Bot API as sole integration | Bots cannot call `payments.updateStarGiftPrice`, `payments.getSavedStarGifts` for the user’s full inventory, or user payment invoices |

---

## 4) Does the API allow “connect profile → manage gifts directly”?

### 4.1 Yes — with the correct API layer

| Capability | API | Auth required |
|------------|-----|---------------|
| Verify **who** the user is (TMA, OAuth) | Bot / Mini App `initData`, Telegram OIDC | Identity only |
| **Read** public gifts on someone’s profile | `payments.getSavedStarGifts` with `peer=inputPeerUser` | User MTProto session (any logged-in client) |
| **Read** own full inventory (saved + unsaved) | `payments.getSavedStarGifts`, `payments.getSavedStarGift` | **Owner’s** user session |
| **List / unlist** on resale market | `payments.updateStarGiftPrice` | **Owner’s** user session |
| **Buy** resale listing | `inputInvoiceStarGiftResale` + payment flow | **Buyer’s** user session + Stars/TON balance |
| **Transfer** collectible P2P | `payments.transferStarGift` | **Owner’s** user session |
| **Upgrade / convert** | `payments.upgradeStarGift`, `payments.convertStarGift` | **Owner’s** user session |

All `payments.*` gift methods are part of the **Telegram Client API** (MTProto), the same stack documented for full-feature clients via **TDLib** — see [`login-and-telegram-messages-architecture.md`](login-and-telegram-messages-architecture.md) §5.

### 4.2 What HSP has today vs what Trade needs

| Today (HSP) | Enough for gift Trade? |
|-------------|-------------------------|
| Telegram **OIDC** / session cookie (`auth-telegram-callback`, TMA `initData`) | **Identity only** — maps HSP `user_id` ↔ `telegram_user_id` |
| Bot API / feed / wallet | **No** gift inventory or resale mutations |
| TDLib (backlog: “TDLIB”) | **Required** for direct manage-and-trade UX |

**Conclusion:** Connecting a Telegram **profile** in HSP is **necessary but not sufficient**. Users must also authorize a **Telegram user session** (phone login or QR / export session on native) so the app can invoke `payments.*` **as that user**.

### 4.3 Business connection (narrow exception)

`payments.getSavedStarGifts` notes execution **as a bot over a business connection** for a **controlled business user**. That path applies to **Telegram Business** accounts, not typical consumer gift trading. Do not plan the consumer Trade section around it unless product scope explicitly includes Business sellers.

---

## 5) Recommended architecture for HSP Trade

### 5.1 Principle: Telegram is source of truth; HSP is the UI

```
┌─────────────────────────────────────────────────────────────┐
│  Trade UI (web / TMA / desktop)                              │
│  collections · filters · listing detail · buy / sell actions │
└───────────────────────────┬─────────────────────────────────┘
                            │ HSP API (session + consent)
┌───────────────────────────▼─────────────────────────────────┐
│  Gift gateway service                                        │
│  - TDLib (or MTProto) per linked telegram_user_id            │
│  - encrypt session at rest; no gift custody                  │
│  - normalize: SavedStarGift, ResaleStarGifts, collections  │
└───────────────────────────┬─────────────────────────────────┘
                            │ MTProto payments.*
┌───────────────────────────▼─────────────────────────────────┐
│  Telegram cloud — official gift + resale marketplace         │
└─────────────────────────────────────────────────────────────┘
```

- **Identity link:** existing `auth_identities` (`provider = telegram`) ties HSP login to `telegram_user_id`.
- **Telegram session link:** new, explicit step — e.g. `telegram_mtproto_sessions` with encrypted TDLib auth key, device metadata, revoke support.
- **Cache (optional):** `gift_listings_cache`, `gift_inventory_cache` for fast Trade feed; invalidate on TDLib updates / webhooks if we add them later. Never treat cache as ownership proof.

### 5.2 Session placement options

| Option | Pros | Cons |
|--------|------|------|
| **A. TDLib on server** (session uploaded after user login) | One implementation for web + TMA; easier unified Trade API | User trusts HSP with Telegram session; strong security bar |
| **B. TDLib on device** (desktop / mobile first) | Keys stay on device; aligns with wallet non-custody story | Harder on pure web; TMA may be constrained |
| **C. Hybrid** | Native apps local TDLib; web uses server gateway with explicit opt-in | Two code paths; clearest security messaging per platform |

Given HSP’s **non-custodial wallet** posture ([`wallet_telegram_standalone_multichain_proposal.md`](wallet_telegram_standalone_multichain_proposal.md)), prefer **B or C** with loud consent copy: *“Connect Telegram session to manage gifts — we never take custody of gifts; listings stay in your Telegram account.”*

### 5.3 Trade flows (direct custody)

**Sell**

1. User opens Trade → “My gifts” (TDLib: `payments.getSavedStarGifts` with owner peer, include unique collectibles).
2. Pick gift → set price → `payments.updateStarGiftPrice` (`InputSavedStarGiftSlug` or msg_id variant).
3. Show listing on `payments.getResaleStarGifts` after Telegram indexes it (poll or TDLib update).

**Unlist**

- `payments.updateStarGiftPrice` with `resell_amount = 0`.

**Buy**

1. Browse `payments.getResaleStarGifts` (global catalog in Trade feed).
2. Detail: `payments.getUniqueStarGift` + optional `payments.getUniqueStarGiftValueInfo` (floor, last sale, Fragment stats).
3. Checkout: `payments.getPaymentForm` + `inputInvoiceStarGiftResale` (`slug`, `to_id` = buyer).
4. Surface payment UI (Stars / TON) — in TMA, prefer Telegram-native payment surfaces where available.

**Transfer (optional, off-market)**

- For negotiated deals: `payments.transferStarGift` or paid transfer via `inputInvoiceStarGiftTransfer`.
- Still **direct** user-to-user; no marketplace bot.

### 5.4 TMA vs outside Telegram

| Surface | Identity | Gift session | Payment UX |
|---------|----------|--------------|--------------|
| **Telegram Mini App** | `initData` (instant) | Still need TDLib session **or** deep-link to official Telegram gift UI for some actions | Best Stars integration |
| **Browser / desktop** | Telegram OIDC (existing) | TDLib login step after OAuth | Stars / TON per Telegram client rules |

**Pragmatic MVP fallback:** deep links to Telegram collectible / collection URLs (`slug`-based links from docs) for actions we cannot yet drive via TDLib — with Trade UI as **read-mostly** catalog until session layer ships.

---

## 6) Data we can show without owning the session

Even before TDLib, a **read-only** Trade experience is partially possible if **any** TDLib service account or the user’s own session (once connected) calls:

- `payments.getResaleStarGifts` — public resale catalog by gift type and attributes
- `payments.getSavedStarGifts` — **public profile** gifts of arbitrary users (pinned/displayed gifts)
- `payments.getUniqueStarGift` / `payments.getUniqueStarGiftValueInfo` — collectible detail and market stats

Mutations (**list, buy, transfer, upgrade, convert**) always require the **acting user’s** session.

---

## 7) Mapping to Trade UI components

| Component (current) | Target behavior |
|---------------------|-----------------|
| `TRADE_SAMPLE_COLLECTIONS` | Replace with `payments.getStarGiftCollections` + cover art from `StarGiftCollection.icon` |
| Collection columns | User collections or themed resale categories (gift_id families) |
| Filter chips | Map to `getResaleStarGifts` flags: sort_by_price, sort_by_num, attribute filters |
| Feed rows | Resale listings, price drops, “gift #1234 listed under X Stars” |
| Pagination dots | Pages of `next_offset` from resale / saved gift queries |

Keep sample data behind a feature flag until TDLib gateway is live.

---

## 8) Security, compliance, and UX requirements

1. **Separate consents:** “Sign in with Telegram” (identity) ≠ “Connect Telegram for gifts” (MTProto session). Different scopes, revoke, and audit.
2. **Session storage:** encrypt TDLib database / auth key at rest; support **disconnect** that wipes server-side session; never log `slug` + session together in plaintext analytics.
3. **Payments:** follow Telegram payment flow; do not bypass Stars / TON settlement with off-platform “trust me” transfers for official marketplace listings.
4. **Rate limits:** cache `getResaleStarGifts` and collection lists; TDLib is per-user — protect gateway from scrape abuse.
5. **Terms:** third-party client using Telegram API — align with Telegram API ToS and Mini App policies; gift features disabled when `stargifts_blocked` client config is true.
6. **Feature scope:** resale commissions and locks are enforced by Telegram; UI must surface `can_resell_at`, min/max price, and commission estimates before confirm.

---

## 9) Phased roadmap

| Phase | Scope | Delivers |
|-------|--------|----------|
| **0** | Spec + API spike | TDLib proof: `getResaleStarGifts`, `getSavedStarGifts`, one `updateStarGiftPrice` on test account |
| **1** | Read-only Trade | Live catalog + collectible detail + links to official Telegram gift URLs |
| **2** | Identity + session link | After Telegram OAuth, optional “Connect gifts” TDLib login; inventory in Trade |
| **3** | Sell / unlist | `updateStarGiftPrice` from Trade |
| **4** | Buy in-app | `inputInvoiceStarGiftResale` + payment completion handling |
| **5** | Extras | P2P transfer, upgrade, convert, Fragment value info, feed cards for gift events |

**Dependency:** Phase 2+ shares infrastructure with backlog item **TDLIB** and the TDLib discussion in [`login-and-telegram-messages-architecture.md`](login-and-telegram-messages-architecture.md).

---

## 10) FAQ (decision summary)

| Question | Answer |
|----------|--------|
| Can users sell gifts **without** transferring them to our account? | **Yes.** Official resale keeps gifts in the user’s Telegram inventory until sale. |
| Does Telegram API support third-party marketplaces? | **Yes**, via documented `payments.getResaleStarGifts` / `updateStarGiftPrice` / `inputInvoiceStarGiftResale` — it **is** Telegram’s marketplace, surfaced through your UI. |
| Is Bot API + `initData` enough? | **No** for manage/trade. Enough for **login** and correlating `user_id`. |
| Do we need TDLib (or equivalent MTProto user client)? | **Yes**, for the intended direct-management UX. |
| Custodial marketplace bot? | **Avoid** — not required by API and conflicts with product goal. |
| TON / Fragment? | Collectibles can list in TON; export to NFT is separate (`getStarGiftWithdrawalUrl`). Trade can show Fragment floor via `getUniqueStarGiftValueInfo`. |

---

## 11) Related documents

- [`login-and-telegram-messages-architecture.md`](login-and-telegram-messages-architecture.md) — Bot vs TDLib layers; session trust model
- [`telegram-login-outside-telegram.md`](telegram-login-outside-telegram.md) — OIDC identity (step before gift session)
- [`wallet_telegram_standalone_multichain_proposal.md`](wallet_telegram_standalone_multichain_proposal.md) — non-custodial posture parallel to gift sessions
- Telegram: [Telegram Gifts](https://core.telegram.org/api/gifts) — authoritative method list
