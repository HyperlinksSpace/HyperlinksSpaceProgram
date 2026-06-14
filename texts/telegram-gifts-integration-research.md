# Telegram Gifts integration — research (Client API / TDLib)

Research note for **Hyperlinks Space Program (HSP)** based on the official Telegram Client API documentation:

- [Telegram Gifts](https://core.telegram.org/api/gifts) (primary)
- [Telegram Stars](https://core.telegram.org/api/stars) (payments, balance, invoices)
- [Payment API](https://core.telegram.org/api/payments) (shared `payments.getPaymentForm` flow)

**Product / marketplace angle:** [`trade-gift-marketplace-telegram-api.md`](trade-gift-marketplace-telegram-api.md) — non-custodial Trade panel, resale listing, HSP architecture. **Trade UI mapping:** §13.

**Adjacent:** [`tdlib-build-your-own-telegram-messages-and-token-analytics.md`](tdlib-build-your-own-telegram-messages-and-token-analytics.md), [`login-and-telegram-messages-architecture.md`](login-and-telegram-messages-architecture.md), [`bring-your-own-data-platform-strategy.md`](bring-your-own-data-platform-strategy.md).

---

## 1) Executive summary

| Question | Answer |
|----------|--------|
| What are Telegram Gifts? | Virtual items bought with **Telegram Stars**; recipients display them on profile, **convert** to Stars, **upgrade** to collectibles, **resell**, **transfer**, or **export to TON/Fragment** as NFTs. |
| Which API? | **MTProto Client API** (`payments.*` under gifts) — **not** Bot API, **not** Mini App `initData` alone. |
| Can HSP build Trade without custody? | **Yes.** Official resale keeps gifts in the seller’s Telegram account until purchase; settlement is atomic on Telegram’s side ([trade doc §3](trade-gift-marketplace-telegram-api.md)). |
| What must HSP add? | **TDLib user session** (or equivalent MTProto gateway) per user who lists, buys, upgrades, or transfers — on top of existing Telegram **identity** (OIDC / TMA). |
| First read-only milestone? | `payments.getResaleStarGifts`, `payments.getUniqueStarGift`, `payments.getSavedStarGifts` (public profile) — no mutations, still needs user session for consistent auth in some deployments. |
| Kill switch? | Client config `stargifts_blocked` — disable all gift UI when true. |

---

## 2) Two asset classes (do not conflate in UI)

### 2.1 Catalog star gifts (`StarGift`)

Sold from Telegram’s catalog (`payments.getStarGifts`). Fields that drive UX:

| Field / flag | Meaning |
|--------------|---------|
| `id` | Catalog gift type id |
| `stars` | Purchase price in Stars |
| `sticker` | `Document` — preview art |
| `limited` + `availability_remains` / `availability_total` | Scarcity |
| `sold_out` | Cannot buy new from catalog |
| `availability_resale` | Some collectibles of this type are on resale market (even if catalog sold out) |
| `convert_stars` | Stars returned if recipient converts (destroy) gift |
| `upgrade_stars` | Cost to upgrade to collectible |
| `require_premium` | Buyer must have Premium |
| `limited_per_user` + `per_user_remains` / `per_user_total` | Per-user purchase cap |
| `locked_until_date` | May be blocked until unix time — call `payments.checkCanSendGift` |
| `resell_min_stars` | Floor for resale (collectible phase) |
| `title`, `released_by` | Display / attribution |

**Recipient actions (regular, not yet unique):**

- **Display on profile:** `payments.saveStarGift`
- **Convert to Stars:** `payments.convertStarGift` (within `stargifts_convert_period_max` seconds)
- **Upgrade to collectible:** if `can_upgrade` — see §5

### 2.2 Collectible / unique gifts (`starGiftUnique`)

Created by **upgrade**. Each instance has:

| Field | Meaning |
|-------|---------|
| `slug` | Global id — resale links, `inputSavedStarGiftSlug`, `getUniqueStarGift` |
| `num` | Serial number within type |
| `attributes` | Model, pattern, backdrop, original details — rarity in `rarity_permille` |
| `owner_id` | Current owner peer |
| `gift_address` | On-chain address when exported |
| `resell_amount` | Current listing price(s) — Stars and/or TON |
| `resale_ton_only` | TON-only resale |
| `can_export_at`, `can_transfer_at`, `can_resell_at` | Time locks |
| `transfer_stars` | Fee for paid P2P transfer |
| `value_amount` / `value_currency` | Estimated value metadata |
| `theme_available` | Can set as chat theme |

**Marketplace-relevant actions:** list/unlist (`updateStarGiftPrice`), buy resale (`inputInvoiceStarGiftResale`), P2P transfer, Fragment export.

---

## 3) API layer map for HSP

```
┌─────────────────────────────────────────────────────────────────┐
│ HSP surfaces: Trade panel, Feed, profile links, AI prompts      │
└───────────────────────────────┬─────────────────────────────────┘
                                │
        ┌───────────────────────┼───────────────────────┐
        │                       │                       │
        ▼                       ▼                       ▼
  Identity only           User MTProto              Bot API
  (TMA initData,          (TDLib session)           (grammy)
   Telegram OIDC)              │                       │
        │                       │                       │
        │              payments.getStarGifts            │
        │              payments.getResaleStarGifts      │
        │              payments.updateStarGiftPrice     │
        │              payments.getPaymentForm …        │
        │                       │                       │
        └───────────────────────┴───────────────────────┘
                                │
                                ▼
                    Telegram cloud (Stars + gift state)
```

| Layer | Gift capabilities |
|-------|-------------------|
| **TMA `initData` + HSP server** | Map `telegram_user_id` ↔ HSP user; **no** inventory mutations |
| **Bot API** | Bot Stars payments for **bot-owned** digital goods; **not** user gift inventory / resale |
| **TDLib / MTProto user session** | Full `payments.*` gift surface documented below |

**Separate consents (required):** “Sign in with Telegram” ≠ “Connect Telegram for gifts & messages”. Same pattern as Messages TDLib plan.

---

## 4) Complete method catalog (by workflow)

### 4.1 Catalog & sending

| Method | Purpose |
|--------|---------|
| `payments.getStarGifts` | List catalog; hash for cache (`starGiftsNotModified`) |
| `payments.checkCanSendGift` | Pre-flight before purchase (`Ok` / `Fail` + reason) |
| `payments.getPaymentForm` + `inputInvoiceStarGift` | Buy new gift for `peer` (`gift_id`, optional `message`, `hide_name`, `include_upgrade`) |
| `payments.getPaymentForm` + `inputInvoiceStarGiftResale` | Buy listing (`slug`, `to_id`, optional `ton` flag) |

After payment: recipient gets `messageService` with `messageActionStarGift` or `messageActionStarGiftUnique`.

**UI entry points (official clients):** gift button in DM when both users have `display_gifts_button`; global “Send a Gift” in settings; chat picker.

### 4.2 Inventory & profile display

| Method | Purpose |
|--------|---------|
| `payments.getSavedStarGifts` | Paginated inventory for user/channel/business peer; rich filter flags |
| `payments.getSavedStarGift` | Batch fetch specific owned gifts |
| `payments.saveStarGift` | Pin/display on profile (`unsave` flag to remove) |
| `payments.convertStarGift` | Destroy gift → credit `convert_stars` |
| `payments.toggleStarGiftsPinnedToTop` | Pin up to `stargifts_pinned_to_top_limit` on profile |
| `payments.toggleChatStarGiftNotifications` | Channel admin: gift received notifications |

**`getSavedStarGifts` filter flags (Trade filters):**

- `exclude_unsaved` / `exclude_saved` — profile vs hidden inventory
- `exclude_unlimited` / `exclude_unique`
- `exclude_upgradable` / `exclude_unupgradable`
- `sort_by_value`
- `collection_id` — gifts in one collection

**Peer types:** `inputPeerUser`, `inputPeerChannel` (including not owned — public profile view), business-controlled user via bot business connection (narrow — see trade doc §4.3).

### 4.3 Gift collections

| Method | Purpose |
|--------|---------|
| `payments.createStarGiftCollection` | New collection from owned gifts |
| `payments.getStarGiftCollections` | List collections; hash = XOR of collection `hash` fields |
| `payments.updateStarGiftCollection` | Rename, add/remove/reorder gifts |
| `payments.reorderStarGiftCollections` | Profile collection order |
| `payments.deleteStarGiftCollection` | Delete collection |

Limits: `stargifts_collections_limit`, `stargifts_collection_gifts_limit`. Deep links share collections.

**HSP Trade mapping:** replace `TRADE_SAMPLE_COLLECTIONS` with live `StarGiftCollection` + `icon` document.

### 4.4 Upgrade → collectible

| Method | Purpose |
|--------|---------|
| `payments.getStarGiftUpgradePreview` | Random attribute preview before pay |
| `payments.getPaymentForm` + `inputInvoiceStarGiftUpgrade` | Pay `upgrade_stars`; optional `keep_original_details` |
| `payments.upgradeStarGift` | Free upgrade when sender prepaid (`prepaid_upgrade`) |
| `payments.getPaymentForm` + `inputInvoiceStarGiftPrepaidUpgrade` | Pay upgrade for someone else’s gift (`prepaid_upgrade_hash`) |

Attribute types: `starGiftAttributeModel`, `Pattern`, `Backdrop`, `OriginalDetails`.

Emits `messageActionStarGiftUnique` on success.

### 4.5 Resale marketplace (Trade core)

| Method | Purpose |
|--------|---------|
| `payments.getResaleStarGifts` | Browse listings by `gift_id`; sort, attribute filters, pagination |
| `payments.updateStarGiftPrice` | List (`resell_amount`) or unlist (`0`) |
| `payments.getUniqueStarGift` | Detail by `slug` |
| `payments.getUniqueStarGiftValueInfo` | Floor, last sale, Fragment stats |

**`getResaleStarGifts` pagination quirks (easy to bug):**

- `attributes` + `attributes_hash` + `counters` describe **all gifts of a type**, not current page.
- Full attribute list: set `attributes_hash=0` (and follow rules when `offset` non-empty).
- `sort_by_price` and `sort_by_num` are **mutually exclusive**; default sort = last resell price change time (desc).
- Filter `attributes` vector: omitting a type = all values of that type allowed.

### 4.6 Transfer & TON export

| Method | Purpose |
|--------|---------|
| `payments.transferStarGift` | Free transfer when `transfer_stars` unset |
| `payments.getPaymentForm` + `inputInvoiceStarGiftTransfer` | Paid transfer |
| `payments.getStarGiftWithdrawalUrl` | Fragment NFT import URL (requires 2FA SRP password) |

Respect `can_transfer_at`, `can_export_at`, `can_resell_at`.

### 4.7 Cosmetics

- Collectible as **emoji status** — separate API flow (linked from gifts page).
- Collectible as **chat theme** when `theme_available` — separate flow.

---

## 5) Payment flow (all paid gift operations)

All purchases share the **standard Telegram payment pipeline**:

1. Build `InputInvoice` variant:
   - `inputInvoiceStarGift` — new catalog gift
   - `inputInvoiceStarGiftResale` — buy listing
   - `inputInvoiceStarGiftUpgrade` — upgrade owned gift
   - `inputInvoiceStarGiftPrepaidUpgrade` — pay upgrade for another user’s gift
   - `inputInvoiceStarGiftTransfer` — paid P2P transfer
2. `payments.getPaymentForm` → form id, prices, provider data
3. User confirms → `payments.sendPaymentForm` / Stars balance debit (see [Stars API](https://core.telegram.org/api/stars))
4. Server pushes `Updates` + service messages

**Stars balance:** `payments.getStarsStatus` (`peer=inputPeerSelf`), `updateStarsBalance`. Top-up via `payments.getStarsTopupOptions` (App Store / Play) — typically **native** or official Telegram UI, not something a web-only Mini App reimplements fully.

**Implication for HSP Trade in TMA:** buying/sending may need to **hand off to Telegram’s payment UI** or run inside a context where Stars payment is supported; TDLib on desktop may expose the full form flow.

---

## 6) Privacy & social rules

| Mechanism | Effect |
|-----------|--------|
| `userFull.display_gifts_button` | Show gift entry in DM composer |
| `globalPrivacySettings.disallowed_gifts` → `userFull.disallowed_gifts` | Block certain gift types per recipient |
| `inputPrivacyKeyStarGiftsAutoSave` | Auto-display received gifts on profile |
| `messageActionStarGift.name_hidden` / `hide_name` on send | Anonymous display on profile |

Trade UI should surface “recipient cannot receive this gift” from `checkCanSendGiftResultFail` before checkout.

---

## 7) Client configuration keys (feature flags & limits)

Fetched via standard Telegram client config (TDLib: `getOption` / config). Documented on gifts page — HSP must read and respect:

| Key (representative) | Use |
|----------------------|-----|
| `stargifts_blocked` | **Master off** — hide all gift features |
| `stargifts_message_length_max` | Attached message max length |
| `stargifts_convert_period_max` | Window to convert gift → Stars |
| `stargifts_pinned_to_top_limit` | Max pinned profile gifts |
| `stargifts_collections_limit` | Max collections per peer |
| `stargifts_collection_gifts_limit` | Max gifts per collection |
| `stars_stargift_resale_amount_min/max` | Stars resale bounds |
| `ton_stargift_resale_amount_min/max` | TON resale bounds |
| `stars_stargift_resale_commission_permille` | Seller commission (Stars) |
| `ton_stargift_resale_commission_permille` | Seller commission (TON) |
| `stars_purchase_blocked` | Regional Stars disable ([Stars doc](https://core.telegram.org/api/stars)) |

Gateway should cache config with TTL and pass limits into Trade validation (price sliders, error copy).

---

## 8) Service messages & realtime

| Constructor | When |
|-------------|------|
| `messageActionStarGift` | Received regular gift |
| `messageActionStarGiftUnique` | Upgraded collectible, transfer, resale purchase, channel gift |

Flags track lifecycle: `saved`, `converted`, `upgraded`, `refunded`, `can_upgrade`, `prepaid_upgrade`, `transferred`, etc.

**HSP Feed integration:** gift events can become Feed cards (same column as wallet/NFT events) once TDLib `updateNewMessage` or gateway webhooks normalize these actions — aligns with [`feed-messages-architecture.md`](feed-messages-architecture.md).

---

## 9) Input identifiers (`InputSavedStarGift`)

| Variant | Use when |
|---------|----------|
| `inputSavedStarGiftUser` | Gift tied to private chat `msg_id` |
| `inputSavedStarGiftChat` | Channel gift `saved_id` |
| `inputSavedStarGiftSlug` | Collectible `slug` (links, resale, owned unique) |

HSP normalized model should store **all three resolution paths** or canonicalize to `slug` after upgrade.

---

## 10) Recommended HSP normalized schema (gateway output)

Cache-only — Telegram remains source of truth:

```typescript
// Illustrative — not generated code
type HspStarGiftCatalogItem = {
  giftId: string;
  title?: string;
  stars: number;
  stickerUrl?: string;
  limited: boolean;
  soldOut: boolean;
  availabilityResale?: number;
  upgradeStars?: number;
};

type HspSavedGift = {
  ref: { kind: "msg" | "chat" | "slug"; msgId?: number; savedId?: string; slug?: string };
  gift: HspStarGiftCatalogItem | HspUniqueGift;
  saved: boolean;
  pinnedToTop: boolean;
  canUpgrade: boolean;
  canResellAt?: number;
  canTransferAt?: number;
  canExportAt?: number;
  resellAmount?: { stars?: number; nanotons?: number };
  fromPeerId?: string;
  date: number;
};

type HspResaleListing = {
  slug: string;
  giftId: string;
  num: number;
  attributes: HspGiftAttribute[];
  resellAmount: { stars?: number; nanotons?: number };
  ownerPeerId?: string;
};

type HspGiftCollection = {
  collectionId: number;
  title: string;
  iconUrl?: string;
  giftsCount: number;
  hash: string;
};
```

Fits BYOD thesis: **Telegram stream → HSP visual processor → Trade UI** ([`bring-your-own-data-platform-strategy.md`](bring-your-own-data-platform-strategy.md)).

---

## 11) Integration options (ranked)

| Option | Pros | Cons | HSP fit |
|--------|------|------|---------|
| **A. TDLib gateway (server)** | One Trade UI everywhere; TMA + web + desktop | User trusts HSP with session; ops + encryption | Matches existing Messages gateway plan |
| **B. TDLib on device (Electron / mobile)** | Session stays local; strongest non-custodial story | Harder for pure web TMA | Windows app path |
| **C. Hybrid** | TMA read-only catalog via gateway; mutations on desktop | Split UX | Pragmatic phase 1–2 |
| **D. Deep link to official Telegram gift UI** | Zero payment integration risk | Not a marketplace; abandons Trade product | Fallback only |
| **E. Bot / custodial escrow** | — | **Do not build** — policy + trust | Rejected in trade doc |

---

## 12) Phased implementation (technical)

Complements [`trade-gift-marketplace-telegram-api.md`](trade-gift-marketplace-telegram-api.md) §9:

| Phase | Engineering deliverable | Key methods |
|-------|-------------------------|-------------|
| **0 — Spike** | TDLib script: auth → list resale → read own inventory | `getResaleStarGifts`, `getSavedStarGifts` |
| **1 — Read-only Trade** | Replace sample data; detail pages; Fragment value | `getUniqueStarGift`, `getUniqueStarGiftValueInfo`, `getStarGiftCollections` |
| **2 — Session link** | “Connect gifts” after OIDC; encrypted session store | Same + consent audit |
| **3 — Sell** | List/unlist with validation against config min/max | `updateStarGiftPrice` |
| **4 — Buy** | Checkout + payment completion + ownership refresh | `getPaymentForm`, `inputInvoiceStarGiftResale` |
| **5 — Lifecycle** | Upgrade, convert, transfer, export URL | `upgradeStarGift`, `convertStarGift`, `transferStarGift`, `getStarGiftWithdrawalUrl` |
| **6 — Feed** | Service message → Feed events | TDLib updates |

**First connector for gifts:** MTProto via TDLib (binary), not REST — unlike Swap’s JSON APIs. Public **read** catalog can be proxied through HSP REST for caching, but **mutations** must stay on TDLib.

---

## 13) Integrating gifts into Trade functionality

This section maps the Telegram Gifts API (§4–§10) onto the **existing Trade panel** in HSP — what to build, where it lives in the repo, and how user flows connect to UI regions.

**Product spec:** [`trade-gift-marketplace-telegram-api.md`](trade-gift-marketplace-telegram-api.md) §5–§7.

**Current code (sample shell only):**

| Piece | Path |
|-------|------|
| Trade panel body | `ui/components/trade/TradePanelContent.tsx` |
| Collection tiles | `ui/components/trade/TradeCollectionColumn.tsx` |
| Feed rows | `ui/components/trade/TradeFeedRow.tsx` |
| Sample data | `ui/trade/tradeSampleData.ts`, `ui/trade/tradeAssets.ts` |
| Responsive column count | `ui/trade/tradeCollectionLayout.ts` |
| Narrow route | `app/(app)/trade.tsx` → `ui/screens/TradeScreen.tsx` → `AuthenticatedAppShell` |
| Wide home column | `ui/screens/HomeAuthenticatedScreen.tsx` (`rightPanel === "trade"`) |
| Footer (1–2 cols) | `GlobalBottomBar` (AI & Search) — same as Swap/Send |

There is **no** gifts backend, TDLib session, or API route yet. Trade renders `TRADE_SAMPLE_COLLECTIONS` and `TRADE_SAMPLE_FEED_ITEMS` only.

### 13.1 Target architecture (Trade-specific)

```
TradePanelContent
  ├─ useTradeGiftsCatalog()     ← HSP GET /api/gifts/resale, /collections
  ├─ useTelegramGiftsSession()  ← consent + session status (shared gateway)
  └─ TradeGiftDetailSheet       ← slug → GET /api/gifts/unique/:slug

AuthenticatedAppShell / HomeAuthenticatedSplitBody
  └─ GlobalBottomBar (unchanged)

HSP API (Vercel)
  ├─ GET  /api/gifts/resale          → gateway: getResaleStarGifts
  ├─ GET  /api/gifts/unique/:slug    → getUniqueStarGift + getUniqueStarGiftValueInfo
  ├─ GET  /api/gifts/collections     → getStarGiftCollections (peer=self)
  ├─ GET  /api/gifts/inventory       → getSavedStarGifts (session required)
  ├─ POST /api/gifts/list            → updateStarGiftPrice (session required)
  ├─ POST /api/gifts/unlist          → updateStarGiftPrice(resell=0)
  ├─ POST /api/gifts/buy             → getPaymentForm + sendPaymentForm (session)
  └─ POST /api/telegram/gifts/connect … /disconnect  → TDLib session lifecycle

Gift gateway (TDLib worker / VM — backlog TDLIB)
  └─ payments.* per linked telegram_user_id
```

Telegram remains **source of truth**; Trade UI never stores ownership, only cache + presentation ([`trade-gift-marketplace-telegram-api.md`](trade-gift-marketplace-telegram-api.md) §5.1).

### 13.2 UI region → API → component mapping

Each visible block in `TradePanelContent` maps to a gifts data source:

| Trade UI region (today) | Live data source | Telegram method(s) | Component change |
|-------------------------|------------------|--------------------|------------------|
| **Top collection row** (`TradeCollectionColumn` × 2–4) | User’s **gift collections** or **catalog types with resale** | `getStarGiftCollections` (logged-in) **or** top `gift_id` families from `getStarGifts` + `availability_resale` | `useTradeCollections()` → replace `TRADE_SAMPLE_COLLECTIONS`; image from `StarGiftCollection.icon` or catalog `sticker` |
| **Pagination dots** | Pages of collections or resale `next_offset` | `getStarGiftCollections` hash paging / `getResaleStarGifts.offset` | Wire `activeIndex` + `onPageChange`; dots = `ceil(count / columnCount)` |
| **Tabs** (“Trending” / “Cap” / “Reach”) | Sort / filter mode for resale feed | `getResaleStarGifts`: default = last price change; `sort_by_price`; `sort_by_num`; value sort via `getSavedStarGifts.sort_by_value` for “my” tab | Tab state → query params on `/api/gifts/resale` |
| **Filter chips** (“24h”, “Any chain”) | Time + currency + attributes | Resale: attribute filters on `getResaleStarGifts`; “Stars vs TON” from `resell_amount` / `resale_ton_only` | Extend `TradeFilterChip` → pressable; chip state in URL or React state |
| **Column headers** (“COLLECTION / FLOOR”, “PLACE / VOL”) | Listing metadata labels | Floor from `getUniqueStarGiftValueInfo.floor_price`; vol = listed count / counters | Locale keys under `trade.gifts.*` |
| **Feed rows** (`TradeFeedRow`) | **Resale listings** | `getResaleStarGifts` → each `starGiftUnique` / listing row | Map to `TradeFeedItem`: primary = title + `#num`, secondary = backdrop/model, right = Stars/TON price, icon = sticker/thumbnail |
| **Row tap** | Collectible detail | `getUniqueStarGift`, `getUniqueStarGiftValueInfo` | Open `TradeGiftDetailSheet` or navigate `/trade/gift/[slug]` |

**Do not** show non-upgraded regular `StarGift` in the resale feed — only collectibles with a **`slug`** (§2.2).

### 13.3 New modules (suggested layout)

```
ui/trade/gifts/
  types.ts                 # HspResaleListing, HspGiftCollection, … (matches §10 schema)
  formatGiftPrice.ts       # Stars / nanoton → display string
  useTradeResaleFeed.ts    # SWR/fetch + pagination
  useTradeCollections.ts
  useTelegramGiftsSession.ts  # { connected, connecting, connect(), disconnect() }

ui/components/trade/
  TradeGiftDetailSheet.tsx # slug, buy/list actions, Fragment link
  TradeGiftListSheet.tsx   # “My gifts” inventory for sell flow
  TradeConnectGiftsBanner.tsx  # when identity ok but no MTProto session

api/gifts/                 # Vercel handlers calling gateway
  resale.ts
  unique/[slug].ts
  inventory.ts
  list.ts
  buy.ts
```

Keep **`tradeSampleData.ts`** behind `EXPO_PUBLIC_TRADE_GIFTS_MOCK=true` (or unset gateway URL) so layout work continues without TDLib.

### 13.4 User flows inside Trade

#### A. Browse marketplace (read-only v1)

1. User opens Trade (narrow `/trade` or wide home column).
2. `useTradeResaleFeed` loads `GET /api/gifts/resale?gift_id=&sort=…&offset=…`.
3. Gateway calls `payments.getResaleStarGifts`.
4. Feed rows render listings; collections row shows popular `gift_id` types or user collections when session exists.

#### B. View collectible detail

1. Tap feed row → `TradeGiftDetailSheet` with `slug`.
2. Load `GET /api/gifts/unique/:slug` → `getUniqueStarGift` + optional `getUniqueStarGiftValueInfo`.
3. Show attributes, owner (if public), price, time locks.
4. **Buy** enabled only when `useTelegramGiftsSession().connected`.

#### C. Connect Telegram for gifts (before sell/buy)

Mirror **Connect Telegram** for Messages (`ui/telegram/TelegramMessagesConnectionContext.tsx`) but **separate consent**:

1. User has HSP identity via TMA `initData` or OIDC.
2. Trade shows `TradeConnectGiftsBanner`: *“Connect Telegram to list and buy gifts — items stay in your Telegram account.”*
3. `POST /api/telegram/gifts/connect` → TDLib auth → encrypted session linked to `user_id`.
4. Session connected → inventory + buy/list unlock.

#### D. Sell / unlist

1. **My gifts** → `GET /api/gifts/inventory` → `getSavedStarGifts`.
2. Pick collectible → price validated against config min/max.
3. `POST /api/gifts/list` → `updateStarGiftPrice` with `inputSavedStarGiftSlug`.
4. Unlist: `resell_amount: 0`.

#### E. Buy

1. Detail sheet → `POST /api/gifts/buy` with `{ slug }`.
2. Gateway: `getPaymentForm` + `inputInvoiceStarGiftResale`.
3. Complete Stars payment (TMA: hand off to Telegram native payment where needed).
4. Refresh feed; optional Feed event card.

#### F. Extras (phase 5+)

Detail overflow: transfer, upgrade, Fragment export — not required for MVP marketplace.

### 13.5 Tabs and filters — concrete mapping

| UI control | `getResaleStarGifts` parameters |
|------------|----------------------------------|
| **Trending** | Default sort (last resell price change, desc) |
| **Cap** | `sort_by_price: true` |
| **Reach** | `sort_by_num: true` |
| **24h chip** | Gateway cache + client filter on listing age |
| **Any chain** | Toggle Stars vs TON (`resale_ton_only`) |
| **Attribute chips** (future) | `attributes` vector + `attributes_hash: 0` bootstrap per `gift_id` |

Pagination: `next_offset` → pagination dots or infinite scroll on `HspScrollColumn`.

### 13.6 Wide vs narrow Trade

| Layout | Mount | Notes |
|--------|-------|-------|
| **1 column** | `/trade` | AI & Search in screen footer |
| **2 columns** | Home middle column | Same `TradePanelContent`; AI in column footer |
| **3 columns** | Middle = Trade | AI column can run gift search prompts |

Detail as **sheet** for v1; optional later `app/(app)/trade/gift/[slug].tsx` for shareable deep links.

### 13.7 Feature flags and degradation

| Condition | Trade behavior |
|-----------|----------------|
| `stargifts_blocked` | Hide gift actions; explain unavailability |
| Gateway down | Sample data or empty state + retry |
| No gifts session | Read-only catalog + connect banner |
| `stars_purchase_blocked` | Show prices; disable buy |

Expose `giftsConfig` (min/max price, commission) on API responses for client-side validation.

### 13.8 Phases — Trade codebase touch list

| Phase | Work |
|-------|------|
| **1 — Read-only** | `useTradeResaleFeed`, wire feed in `TradePanelContent`, `TradeGiftDetailSheet`, `GET resale` + `GET unique` |
| **2 — Session** | `useTelegramGiftsSession`, `TradeConnectGiftsBanner`, collections from `getStarGiftCollections` |
| **3 — Sell** | `TradeGiftListSheet`, `POST list` / unlist |
| **4 — Buy** | Buy on detail sheet, payment completion |
| **5 — Extras** | Transfer/upgrade/export; Feed gift events |
| **6 — AI** | AI prompts → resale query params |

### 13.9 i18n

Add `trade.gifts.*` keys in `locales/appStrings.ts` (en + ru): connect banner, headers, buy/sell/list, commission, time-lock errors.

### 13.10 Relation to other HSP systems

| System | Integration |
|--------|-------------|
| **TON wallet** | Separate from Telegram gift TON listings — do not merge balances in UI |
| **Feed** | Gift events → feed cards (phase 6) |
| **BYOD** | Gift gateway = BYOD connector example (§10 schema → Trade UI) |
| **TDLib Messages** | Same VM possible; separate API namespace and consent |

---

## 14) Risks & compliance

| Risk | Mitigation |
|------|------------|
| `stargifts_blocked` / regional Stars block | Feature flag; graceful Trade degradation |
| Session theft = full account | Encrypt TDLib DB; short-lived tokens; revoke UX |
| Rate limits / flood waits | Cache resale catalog; backoff on `getChatHistory`-style loops |
| Payment UX in web TMA | Plan handoff to Telegram client for Stars spend |
| ToS for third-party clients | Document as Telegram client using official API — not scraping |
| Confusing regular vs unique | Trade marketplace UI only for **collectibles** with `slug` |
| Business connection scope creep | Consumer Trade ≠ Telegram Business bot path |

---

## 15) Open decisions for HSP

1. **Gateway vs on-device TDLib first?** — Messages backlog already assumes gateway; gifts can share the same service with `payments.*` handlers.
2. **Stars top-up in-app?** — Likely defer to Telegram; HSP shows balance via `getStarsStatus` read-only.
3. **TON vs Stars resale default?** — Filter Trade feed by `resale_ton_only` and user wallet linkage (HSP TON wallet is separate from Telegram gift TON listing).
4. **AI column prompts** — “Cheapest Pepe backdrop under 500 Stars” → `getResaleStarGifts` with attribute filters (public read once session exists).
5. **Cache invalidation** — TDLib `update*` vs poll `getResaleStarGifts` for Trade feed freshness.

---

## 16) Summary

Telegram Gifts are a **first-class Client API domain** (`payments.*`), tightly coupled to **Telegram Stars** and, for collectibles, **TON/Fragment**. HSP’s Trade section can integrate **without owning gift custody** by surfacing Telegram’s official resale market through TDLib.

**Trade integration (§13):** replace sample collections/feed with live resale data, add session-gated sell/buy on existing `TradePanelContent`, proxy TDLib through HSP REST + gift gateway, keep AI & Search footer on 1–2 column layouts.

**Minimum bar to ship value:** read-only resale catalog + collectible detail sheet (phase 1). **Full marketplace:** user TDLib session + list/buy on detail sheet (phases 3–4).

**Next engineering artifact:** TDLib spike checklist (phase 0) — see backlog **TDLIB** — or `scripts/tdlib-gifts-spike/` when requested.
