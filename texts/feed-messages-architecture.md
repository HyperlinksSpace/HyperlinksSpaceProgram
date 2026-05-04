# Feed: copy, message types, and data shape

This document describes how **Feed** fits next to **Messages**, **notifications**, and **AI-assisted highlights**, and how to store **default / template** wording. The in-app “Feed” tab (Feed / Messages / … in the left nav) is the **unified timeline** for things a user should see first—not a second copy of full chat history.

---

## 1) What the Feed is (product)

- **Feed** = ordered stream of **cards** for one user: actionable items, digests, and highlights.
- **Messages** = persistent **conversations** (threads) with full history—see [`database_messages.md`](database_messages.md) and [`login-and-telegram-messages-architecture.md`](login-and-telegram-messages-architecture.md).
- Feed can **surface** content *from* Messages (e.g. “Unread summary”, “AI picked this thread”) without replacing the Messages UI.

**Kinds of items users expect on Feed:**

| Kind | Who it’s for | Examples |
|------|----------------|-----------|
| **Notifications** | Usually one user | Payment settled, security alert, reply to your post |
| **Personal** | One user | DM preview, mention, wallet/transaction note |
| **Welcome / broadcast** | Everyone (or a segment) | Product updates, seasonal welcome, feature announcement—**same template**, many recipients |
| **AI / system highlights** | One user | “Best of your Messages this week”, “Suggested follow-up from Deals” — built from other sections |

*(If your mockup used different labels—e.g. system vs promotional vs social—map them to **`source_type`** + **`subtype`** in §3 rather than hard-coding five tables.)*

---

## 2) UI copy (baseline strings you can lift)

Use these as **defaults** until CMS or DB templates override them.

**Feed tab / empty state**

- **Title:** “Your feed”
- **Subtitle (empty):** “When you get updates, highlights, and digests, they’ll show up here.”
- **Subtitle (first-time):** “Welcome—your home for notifications, personal updates, and highlights from across the app.”

**Sections (optional filter chips)**

- “All” · “Personal” · “Updates” · “Highlights”

**AI highlight card (example)**

- **Title:** “From your messages”
- **Body line:** “A conversation looks worth revisiting—we summarized it for you.”
- **Action:** “Open in Messages”

**Broadcast / welcome (example)**

- **Title:** “What’s new”
- **Body:** “We’ve improved how Feed surfaces what matters. Tap to learn more.”

Adjust tone to match the rest of the app (“Hyperlinks Space Program” marketing voice).

---

## 3) How to organize it (one timeline model)

Avoid separate silos per channel in the UI; use **one logical stream** with clear **types**.

Suggested fields (conceptual):

- **`source_type`**: `notification` · `message_preview` · `broadcast` · `ai_digest` · `system` · `welcome`
- **`subtype`** (optional, string): fine-grained—e.g. `payment`, `security`, `promo`, `digest_messages`, `digest_deals`
- **`audience`**: `user` (row per recipient) vs `segment` (feature-flag / query) vs `global` (materialize per user when they open Feed—heavier)

**Ingestion:**

1. **Transactional notifications** → insert one **feed row** per recipient (or enqueue worker that writes `feed_item`).
2. **Welcome / default product messages** → either insert from **`feed_default_templates`** (see §4) at signup / on version bump, or render **virtual** rows from templates without storing duplicates.
3. **AI digest** → batch job reads Messages (and other sections), writes **one digest card** per user per window; links back to `thread_id` / entity ids in payload.

**Read path:** `GET /feed?cursor=` orders by `created_at` or `rank`, applies `read` / `dismissed` client state.

---

## 4) Database: templates and feed items

You likely want **two** layers: **templates** (reusable copy + versioning) and **items** (what this user actually saw).

### 4.1 `feed_default_templates` (optional but recommended)

For **welcome**, **changelog**, **empty-state** copy, and **broadcast** text that is **not** tied to a single Telegram update_id.

| Column | Purpose |
|--------|---------|
| `id` | PK |
| `key` | Stable id, e.g. `welcome_2025_05`, `feed_empty_state` |
| `locale` | `en`, `ru`, … |
| `title` | Short headline |
| `body` | Markdown or plain text |
| `kind` | `welcome` \| `broadcast` \| `empty_state` \| `system` |
| `active_from` / `active_to` | Scheduling |
| `metadata` | JSON (deep link, icon, segment rules) |

**Seeding:** migrations or admin seed inserts default rows. App resolves “current welcome” by `key` + `locale` + active window.

### 4.2 `feed_items` (per-user timeline)

| Column | Purpose |
|--------|---------|
| `id` | PK |
| `user_id` | Recipient |
| `created_at` | When the event occurred |
| `source_type` | High-level pipeline: `notification` \| `message_preview` \| `broadcast` \| `ai_digest` \| … |
| **`card_type`** | UI row kind (see **§5**): `system_action`, `user_status`, `transaction_asset`, `reward_token`, `task_gig`, … |
| **`layout_variant`** | Row template (see **§6**): `compact`, `value_trailing`, `action_hint`; nullable if derived from `card_type`. |
| `source_id` | Nullable FK or opaque ref (e.g. message id, notification id, template key) |
| `payload` | JSON snapshot: title/subtitle/icon/deep_link/type-specific fields (**§7.2**) |
| `read_at` | Nullable |
| `dismissed_at` | Nullable |

**Broadcasts:** either N rows (fan-out per user) or **one row** with `audience = segment` and expansion at read time—choose based on scale. Early phase: **fan-out on publish** is simpler to query.

**Link to existing `messages` table:** store `source_type = 'message_preview'` and in `payload` set `thread_id`, `message_id`, preview text—full content stays in `messages`.

**Reference UI:** each **`card_type`** maps to allowed **`layout_variant`** and **payload** fields (icons, amounts, trailing labels)—see **§5–§7**.

### 4.3 AI digests

Optional table **`feed_ai_jobs`** (queue) or embed in worker logs; **`feed_items`** with `source_type = 'ai_digest'` is enough for the client. Source refs in `payload`: `{ "sources": [{ "section": "messages", "thread_id": 123 }] }`.

---

## 5) Feed card types (reference UI)

The in-app feed list uses **one list container**; each row picks a **layout variant** from **`card_type`** (and optional **`layout_variant`** override). All rows share: **left icon**, **title** (primary line), **subtitle** (secondary line), **time** top-right; some types add **footer / trailing** text bottom-right.

| `card_type` | Purpose (example) | Subtitle typical use | Trailing / footer (optional) |
|-------------|-------------------|----------------------|-------------------------------|
| `system_action` | Wallet created, security, onboarding CTAs | Short instruction (“Press to save…”) | — |
| `user_status` | Persona / flags (“You are likely a creator”) | Elaboration (truncate with …) | — |
| `transaction_asset` | NFT received, transfer in | Fiat/crypto display amount (“$24”) | Repeat label or chain (“NFT received”) |
| `reward_token` | Grant, airdrop, bonus | Primary amount (“$1”) | Token detail (“+1 DLLR”) |
| `task_gig` | Incoming work, gigs | Stake or reward preview (“$24”) | — (or future: deadline) |

**Note:** Copy in mocks may have typos (e.g. “recieved”); store **canonical strings** in DB and fix in templates.

**Iconography:** `payload.icon` should be a **stable key** (e.g. `wallet_created`, `nft_incoming`, `token_reward`, `task_incoming`, `avatar_user`) resolved client-side to local assets or signed URLs—not raw binary in `feed_items`.

---

## 6) Layout variants (different row templates)

Use a small **closed set** of templates so RN/Web stay maintainable.

| `layout_variant` | Slots | When to use |
|------------------|-------|-------------|
| `compact` | icon · title · subtitle · time | Default: wallet, creator status, many notifications |
| `value_trailing` | icon · title · subtitle (often `$`) · time · **trailing_line** (bottom-right) | NFT row (subtitle `$24` + footer “NFT received”), token grant (`$1` + “+1 DLLR”) |
| `action_hint` | same as `compact` but subtitle styled as CTA | System prompts (“Press to…”) — *presentation only* |

**Rendering rule:** map `card_type` → **default** `layout_variant` on the server (or client fallback table). Allow **payload override** only when needed (e.g. A/B test).

---

## 7) Storing & delivering: `feed_items` + typed `payload`

### 7.1 Recommended columns (extend §4.2)

| Column | Purpose |
|--------|---------|
| `card_type` | One of the §5 enums (`system_action`, `user_status`, `transaction_asset`, `reward_token`, `task_gig`, …). |
| `layout_variant` | `compact` \| `value_trailing` \| `action_hint` — if null, derive from `card_type`. |
| `payload` | JSON: type-specific (see §7.2), **snapshot** at insert time. |
| `cta` | Optional JSON `{ "label": "…", "deep_link": "…" }` when whole row is tappable beyond default. |

**Why snapshot:** feed is historical; do not re-fetch wallet/NFT labels at render if the event was “Token granted at 15:22”.

### 7.2 Payload shape (by `card_type`)

All payloads may include: `title`, `subtitle`, `icon`, `locale` (optional). Amounts stored as **string for display** plus optional **structured** fields for analytics.

**`system_action`**
```json
{
  "title": "Wallet created",
  "subtitle": "Press to save 24 words",
  "icon": "wallet_created",
  "deep_link": "hyperlinks://wallet/backup"
}
```

**`user_status`**
```json
{
  "title": "You are likely a creator",
  "subtitle": "Press to access creators program",
  "icon": "avatar_user",
  "image_url": "https://…"
}
```

**`transaction_asset`**
```json
{
  "title": "NFT received",
  "subtitle": "$24",
  "trailing_label": "NFT received",
  "icon": "nft_incoming",
  "asset_id": "…",
  "deep_link": "hyperlinks://wallet/asset/…"
}
```

**`reward_token`**
```json
{
  "title": "Token granted",
  "subtitle": "$1",
  "trailing_label": "+1 DLLR",
  "icon": "token_reward",
  "token_symbol": "DLLR",
  "amount_minor": "1000000"
}
```

**`task_gig`**
```json
{
  "title": "Incoming task",
  "subtitle": "$24",
  "icon": "task_incoming",
  "task_id": "…",
  "deep_link": "hyperlinks://tasks/…"
}
```

Validate with JSON Schema (or Zod) per `card_type` in the API.

### 7.3 Producers (who writes `feed_items`)

| Source | Example | How |
|--------|---------|-----|
| Wallet service | Wallet created | After wallet row committed → insert `feed_items` with `system_action`. |
| Profile / ML flags | Creator likelihood | Scoring job or sync → `user_status`. |
| Ledger / indexer | NFT/token transfer | Chain webhook → normalize → `transaction_asset` / `reward_token`. |
| Task marketplace | New gig | Task service → `task_gig`. |
| Templates | Welcome copy | Insert from `feed_default_templates` or duplicate template into `payload` at fan-out. |

Use an **outbox** or queue if multiple services publish (ordering, retries).

---

## 8) Messages (chat) vs Feed cards

- **Chat `messages` table** (see [`database_messages.md`](database_messages.md)) holds **conversation** messages (`role`, thread, `content`).
- **Feed `feed_items`** holds **timeline cards**; they are **not** the same rows. A feed row may **reference** a thread (`source_type = 'message_preview'`, refs in `payload`) but the **card types in §5** are mostly **product/events**, not free-form chat lines.

**Cross-link:** optionally set `payload.origin = "messages"` and `thread_id` when a feed card is generated from an AI digest of chat—still use **`card_type = 'ai_digest'`** or a dedicated **`message_highlight`** type with its own layout.

---

## 9) Practical rollout order

1. **`feed_items`** + `card_type` + `layout_variant` + **`payload` JSON** + JSON Schema validation.
2. **RN (or web):** one `FeedRow` that switches on `layout_variant`; map icons from `payload.icon`.
3. Seed **wallet / NFT / token / task** from mock data, then wire real producers.
4. **`feed_default_templates`** for strings that are not event-driven.
5. **AI digest worker** (optional) producing cards with a digest-specific `card_type` or reusing `compact`.

---

## 10) Related docs

- [`database_messages.md`](database_messages.md) — `messages` table and threads.
- [`login-and-telegram-messages-architecture.md`](login-and-telegram-messages-architecture.md) — identity and Telegram layers.
- [`ai_and_search_bar_input.md`](ai_and_search_bar_input.md) — AI entry points if digest uses same stack.

---

*Core idea: **one timeline table**, **typed cards** (`card_type`), **layout variants**, **snapshot payload**, **icon keys**—not one DB table per mock row. Adjust enum names to match your backend.*
