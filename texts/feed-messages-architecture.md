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
2. **Welcome / default product messages** → insert from **`feed_default_messages`** (see §4) at signup / on version bump (with **`sent_at`** on each **`feed_items`** row), or render **virtual** rows from catalogue without storing duplicates (lighter, no per-user timeline).
3. **AI digest** → batch job reads Messages (and other sections), writes **one digest card** per user per window; links back to `thread_id` / entity ids in payload.

**Read path:** `GET /feed?cursor=` orders by **`sent_at`** or `created_at` (product choice), applies `read` / `dismissed` client state.

---

## 4) Database: defaults, deliveries, interactions

Three layers:

1. **`feed_default_messages`** — catalogue of reusable definitions (welcome, broadcast, empty-state …), including structured **welcome** payloads.
2. **`feed_items`** — **one row per recipient per delivered card** (“actually sent”), with timestamps and snapshot `payload`; optional summary of interactions.
3. **`feed_item_interactions`** — **append-only** events when the user touches a delivered item (view duration, taps, completions). Prefer this over cramming history into JSON on `feed_items` when you care about auditing and analytics.

### 4.1 `feed_default_messages` (default / catalogue)

Authoring rows that define *what may be sent*, not yet bound to a user.

| Column | Purpose |
|--------|---------|
| `id` | PK |
| `key` | Stable id, e.g. `welcome_2026_05`, `feed_empty_state` |
| `locale` | `en`, `ru`, … |
| `kind` | `welcome` \| `broadcast` \| `empty_state` \| `system` \| … |
| `message_variant` | Distinguishes payload shape—e.g. `welcome_multifield`; non-welcome kinds can reuse `generic` |
| **`body`** | JSON (**typed by `kind` / `message_variant`**). For **welcome** see **§4.1a**. For generic broadcast, can mirror older `title`+`body` text inside JSON. |
| `active_from` / `active_to` | Scheduling |
| `segment_rules` | Nullable JSON (feature flags, cohorts)—evaluated **before** fan-out |
| **`version`** | Increment when copy or structure changes; stored on **`feed_items`** at send time |

**Naming:** Same role as legacy `feed_default_templates`; use **`feed_default_messages`** end-to-end in new code—the important part is **`body` JSON** keyed by **`kind`** + **`message_variant`**.

**Seeding:** migrations or admin tools insert/update rows; workers resolve active template by `key` + `locale` + calendar window.

#### 4.1a Welcome type: four optional slots (`body.welcome`)

Welcome cards use **`icon`** plus **three optional text fields** (`name`, `description`, **`footnote`**). The UI picks a **layout profile** from *which slots are non-empty* (never require all of them).

| Field | Role |
|--------|------|
| **`icon`** | Visual lead. Supports **preset key**, **SVG URL**, or **inline SVG** (see **§4.1b**). Omit if welcome is text-only block. |
| **`name`** | Primary title (“What’s new”, product name …). Often always set. |
| **`description`** | Main explanatory copy (short paragraph or bullets as plain/Markdown in one string—render policy is client-defined). |
| **`footnote`** | Optional fine print: version string, dismiss hint (“You can revisit this in Settings”), legal line, or `null` / omitted. |

Example `body` for `kind = 'welcome'`, `message_variant = 'welcome_multifield'`:

```json
{
  "welcome": {
    "icon": {
      "type": "preset",
      "key": "orbit_logo"
    },
    "name": "Welcome to Hyperlinks",
    "description": "Your feed gathers updates across the app.",
    "footnote": "v2026.05"
  }
}
```

**Layout rule (conceptual):** define a **small matrix** client-side—for example empty `description` ⇒ compact hero; presence of `footnote` ⇒ add muted bottom row; `icon` omitted ⇒ stack only text. Same rules apply whether the welcome is rendered **from catalogue** during dev or **from `feed_items.payload`** after send (**snapshot keeps history**).

#### 4.1b SVG in `welcome.icon`

Store one of:

| `icon.type` | Meaning |
|-------------|---------|
| `preset` | `key` resolves to bundled asset client-side |
| `svg_url` | `url` fetched at render—**sanitize** and prefer CSP / allowlisted hosts |
| `svg_inline` | `svg` string—**sanitize on server before save** (strip scripts, foreignObject); caps on size |

Do **not** store raw binaries in Postgres for icons; URLs or sanitized inline markup only.

---

### 4.2 `feed_items` (per-user timeline — what was actually sent)

One row **per user per concrete delivery**. This is where **`sent_at`** is authoritative (distinct from **`created_at`** if the row was queued then dispatched later).

| Column | Purpose |
|--------|---------|
| `id` | PK |
| `user_id` | Recipient |
| `created_at` | Row inserted (enqueue / bookkeeping) |
| **`sent_at`** | When delivery is considered emitted to that user (**nullable until sent**—use same as `created_at` if you insert only at send) |
| `source_type` | High-level pipeline: `notification` \| `message_preview` \| `broadcast` \| `ai_digest` \| … |
| **`card_type`** | UI row kind (see **§5**): `welcome`, `system_action`, `user_status`, … |
| **`layout_variant`** | Row template (see **§6**); nullable if derived from `card_type` |
| **`default_message_id`** | Nullable FK → `feed_default_messages.id` when this delivery was instantiated from catalogue |
| `source_id` | Nullable FK or opaque ref (telegram message id, notification id, etc.) |
| `payload` | **Immutable snapshot** at send: copied/normalized template `body`, resolved locale, interpolated strings. Must include **`welcome`** object when `card_type = 'welcome'` (same schema as §4.1a). |
| `read_at` | Nullable—the user opened / marked read |
| `dismissed_at` | Nullable |
| **`feed_item_interactions`** | Optional **JSON** (**denormalized**), same *name* as **§4.3** table for one-to-one mental model in API payloads. Shape: **`{ "event_ids": [ … ] }`**—each id is a **`feed_item_interactions.id`** for this `feed_items` row. Maintain on insert (append id) or rebuild from the table; omit the column if clients always load interactions by **`feed_item_id`**. In SQL, qualify: `feed_items.feed_item_interactions` vs table `feed_item_interactions`. |

**Sending flow:** Resolve `feed_default_messages` → build `payload` snapshot → insert `feed_items` with **`sent_at = now()`** (or transactional outbox worker). Fan-out broadcasts as **one `feed_items` row per recipient** for simple queries (**§9** rollout unchanged).

**Link to chat `messages`:** `source_type = 'message_preview'`, refs in `payload` (`thread_id`, `message_id`); chat content stays in `messages`.

---

### 4.3 `feed_item_interactions` (did the user interact?)

Normalized **interaction history** tied to **`feed_items.id`**.

| Column | Purpose |
|--------|---------|
| `id` | PK |
| `feed_item_id` | FK → `feed_items.id` |
| `user_id` | Redundant with `feed_items.user_id` — useful for partitioned queries / RLS |
| **`event_type`** | Closed enum: `impression`, `expand`, `dismiss`, `cta_primary`, `cta_secondary`, `deep_link_follow`, `welcome_step_advanced`, … (extend per product) |
| **`event_payload`** | JSON—**different `card_type`s attach different shapes** (`{ "cta_id": "save_wallet" }`, `{ "scroll_depth": 0.75 }`). Validate loosely or with per-`card_type` Zod/schema on ingest |
| `created_at` | When the client or server recorded the interaction |

Indexes: **`(feed_item_id, created_at)`**, **`(user_id, created_at)`** for “my engagement over time.”

For **analytics**, query this table (truth). Optionally **mirror** interaction **`id`** values into **`feed_items.feed_item_interactions`** → **`event_ids`** (§4.2) when you want a single document for the row. For **privacy / retention**, apply the same TTL policy as notifications.

Optional convenience flags on **`feed_items`** (`interacted_at`, `has_deep_link_open`) remain possible but **prefer events** here as source of truth.

### 4.4 AI digests

Optional table **`feed_ai_jobs`** (queue) or embed in worker logs; **`feed_items`** with `source_type = 'ai_digest'` is enough for the client. Source refs in `payload`: `{ "sources": [{ "section": "messages", "thread_id": 123 }] }`.

---

## 5) Feed card types (reference UI)

The in-app feed list uses **one list container**; each row picks a **layout variant** from **`card_type`** (and optional **`layout_variant`** override). Most rows share: **left icon**, **title** (primary line), **subtitle** (secondary line), **time** top-right; **`welcome`** uses the **multifield block** in §4.1a / §6 instead of a single title line.

| `card_type` | Purpose (example) | Subtitle typical use | Trailing / footer (optional) |
|-------------|-------------------|----------------------|-------------------------------|
| **`welcome`** | Onboarding / “what’s new” from **`feed_default_messages`** | `description` body copy | Optional `footnote` (muted footer when set) |
| `system_action` | Wallet created, security, onboarding CTAs | Short instruction (“Press to save…”) | — |
| `user_status` | Persona / flags (“You are likely a creator”) | Elaboration (truncate with …) | — |
| `transaction_asset` | NFT received, transfer in | Fiat/crypto display amount (“$24”) | Repeat label or chain (“NFT received”) |
| `reward_token` | Grant, airdrop, bonus | Primary amount (“$1”) | Token detail (“+1 DLLR”) |
| `task_gig` | Incoming work, gigs | Stake or reward preview (“$24”) | — (or future: deadline) |

**Note:** Copy in mocks may have typos (e.g. “recieved”); store **canonical strings** in DB and fix in templates.

**Iconography:** `payload.icon` (non-welcome) should remain a **stable key** resolved client-side. **`welcome`** uses **`payload.welcome.icon`** (preset / svg_url / svg_inline)—see §4.1b.

---

## 6) Layout variants (different row templates)

Use a small **closed set** of templates so RN/Web stay maintainable.

| `layout_variant` | Slots | When to use |
|------------------|-------|-------------|
| **`welcome_block`** | `welcome.icon`, `welcome.name`, `welcome.description`, `welcome.footnote`; **omit empty slots** in layout | Dedicated template for **`card_type = 'welcome'`**; choose sub-layout from which slots are filled |
| `compact` | icon · title · subtitle · time | Default: wallet, creator status, many notifications |
| `value_trailing` | icon · title · subtitle (often `$`) · time · **trailing_line** (bottom-right) | NFT row (subtitle `$24` + footer “NFT received”), token grant (`$1` + “+1 DLLR”) |
| `action_hint` | same as `compact` but subtitle styled as CTA | System prompts (“Press to…”) — *presentation only* |

**Rendering rule:** map `card_type` → **default** `layout_variant` on the server (or client fallback table). **`welcome`** → **`welcome_block`**. Allow **payload override** only when needed (e.g. A/B test).

---

## 7) Storing & delivering: `feed_items` + typed `payload`

### 7.1 Recommended columns (`feed_items`; see §4.2)

| Column | Purpose |
|--------|---------|
| `sent_at`, `default_message_id`, **reads / dismiss**, **`feed_item_interactions`** | As in §4.2—the JSON column on **`feed_items`** stores **`{ "event_ids": [ … ] }`**; each value is **`feed_item_interactions.id`** (optional denormalization). |
| `card_type` | One of the §5 enums (`welcome`, `system_action`, `user_status`, …). |
| `layout_variant` | **`welcome_block`** \| `compact` \| `value_trailing` \| `action_hint` — if null, derive from `card_type`. |
| `payload` | JSON: type-specific (see §7.2), **snapshot** at send time. |
| `cta` | Optional JSON `{ "label": "…", "deep_link": "…" }` when the whole row has a generic tap target *in addition to* **`welcome`** field-level actions. |

**Why snapshot:** feed is historical; do not re-fetch wallet/NFT labels at render if the event was “Token granted at 15:22”.

### 7.2 Payload shape (by `card_type`)

All payloads may include: `title`, `subtitle`, `icon`, `locale` (optional). Amounts stored as **string for display** plus optional **structured** fields for analytics.

**`welcome`** (same structural object as **`feed_default_messages.body.welcome`**; duplicated into snapshot at send):

```json
{
  "welcome": {
    "icon": {
      "type": "preset",
      "key": "orbit_logo"
    },
    "name": "Welcome",
    "description": "Intro copy…",
    "footnote": null
  },
  "default_message_version": 3
}
```

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
| Templates | Welcome / broadcast catalogue | **`feed_default_messages`** → **`feed_items`** fan-out per user with **`sent_at`**, `default_message_id`, snapshot **`payload`**. Append **`feed_item_interactions`** rows for taps/impressions; optionally push each new row’s **`id`** into **`feed_items.feed_item_interactions.event_ids`**. |

Use an **outbox** or queue if multiple services publish (ordering, retries).

---

## 8) Messages (chat) vs Feed cards

- **Chat `messages` table** (see [`database_messages.md`](database_messages.md)) holds **conversation** messages (`role`, thread, `content`).
- **Feed `feed_items`** holds **timeline cards**; they are **not** the same rows. A feed row may **reference** a thread (`source_type = 'message_preview'`, refs in `payload`) but the **card types in §5** are mostly **product/events**, not free-form chat lines.

**Cross-link:** optionally set `payload.origin = "messages"` and `thread_id` when a feed card is generated from an AI digest of chat—still use **`card_type = 'ai_digest'`** or a dedicated **`message_highlight`** type with its own layout.

---

## 9) Practical rollout order

1. **`feed_items`** + `card_type` + `layout_variant` + **`payload`**, **`sent_at`**, FK **`default_message_id`**, JSON Schema validation.
2. **`feed_default_messages`** for welcome / broadcast definitions (`body`, **`message_variant`**).
3. **`feed_item_interactions`** table + optional **`feed_items.feed_item_interactions`** JSON (**`event_ids`**) for “which interaction rows exist” without a second query.
4. **RN (or web):** **`FeedRow`** switches on **`layout_variant`** (add **`welcome_block`**); preset / SVG resolver for **`payload.welcome.icon`**.
5. Seed **wallet / NFT / token / task** from mock data, then wire real producers.
6. **AI digest worker** (optional) producing cards with a digest-specific `card_type` or reusing `compact`.

---

## 10) Related docs

- [`database_messages.md`](database_messages.md) — `messages` table and threads.
- [`login-and-telegram-messages-architecture.md`](login-and-telegram-messages-architecture.md) — identity and Telegram layers.
- [`ai_and_search_bar_input.md`](ai_and_search_bar_input.md) — AI entry points if digest uses same stack.

---

*Core idea: **catalogue (`feed_default_messages`)**, **timeline (`feed_items` with `sent_at` + snapshot `payload`)**, **interactions (`feed_item_interactions` table; optional `feed_items.feed_item_interactions.event_ids`)**—still **typed cards** (`card_type`), **layout variants**, **welcome multifield + SVG-aware icon**, not one DB table per mock row. Adjust enum names to match your backend.*
