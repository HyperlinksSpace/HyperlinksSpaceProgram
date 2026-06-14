# Bring Your Own Data (BYOD): platform strategy without a proprietary data lake

This document develops a strategic insight for **Hyperlinks Space Program (HSP)**: starting without terabytes of owned data is not a weakness — it is the normal entry point for an **infrastructure platform**, and it deliberately avoids the “closed box” product path.

**Related HSP docs:** [`scalability.md`](scalability.md), [`tdlib-build-your-own-telegram-messages-and-token-analytics.md`](tdlib-build-your-own-telegram-messages-and-token-analytics.md), [`feed-messages-architecture.md`](feed-messages-architecture.md), [`responsive-main-right-ai-layout.md`](responsive-main-right-ai-layout.md), [`wallet-implementation-roadmap-and-login-alignment.md`](wallet-implementation-roadmap-and-login-alignment.md).

---

## 1) The pivot: absence of data is freedom, not a dead end

Early-stage teams often treat “we have no dataset” as a blocker: investors ask for moats built from proprietary telemetry, and engineers assume they must crawl, store, and train before shipping anything useful.

For HSP the opposite holds:

| Assumption | BYOD reframing |
|------------|----------------|
| “We need our own data to be credible” | Clients already sit on terabytes; most of it is **unused** because the UI layer is expensive and slow to build |
| “We must build analytics models first” | The first product is a **visual processor** — structure and interaction inferred from whatever stream the customer attaches |
| “Platform = we host everything” | Platform = **strict protocol + adaptive shell** that runs **on top of** customer-owned storage |

**Business-model shift:** from *“we sell a service backed by our database”* to *“we sell a smart shell for your data”* (**Bring Your Own Data — BYOD**).

You do not need to fund data centers, run crawlers at scale, or train bespoke collection models before launch. You build a **universal lens**: take raw flows that already exist (JSON over REST, CSV exports, SQL tables, gRPC streams, chain RPC, TDLib updates) and **render a live, adaptive workspace** around them — panels, actions, footers, and AI prompts that fit the semantics of the stream, not a fixed screen designed months ahead by integrators.

---

## 2) Why this is not the Terry Davis path

[Terry Davis’s TempleOS](https://en.wikipedia.org/wiki/Terry_A._Davis) is a cautionary pattern: one person trying to own **the entire stack including content and worldview** inside a closed universe. Everything — language, OS, holy texts, games — had to be invented internally because external reality was treated as contamination.

HSP’s BYOD stance is the inverse:

| Closed box (TempleOS-like) | BYOD platform (HSP-like) |
|----------------------------|---------------------------|
| Own all content and semantics | **Import** semantics from customer systems |
| UI is hand-authored for one vision | UI is **generated / adapted** from attached data |
| Growth requires building more inside the box | Growth requires **more connectors** and a stronger protocol |
| Customer data is irrelevant | Customer data **is** the product surface |

The program is not “Hyperlinks Space Program replaces your ERP.” It is: **“Point HSP at what you already have; the workspace assembles itself.”**

That keeps the team focused on **protocol, layout engine, auth, and AI orchestration** — not on becoming a data broker.

---

## 3) Product thesis: universal visual processor

Working name for the engine behavior: **liquid structure** — screens that reconfigure when the underlying stream changes (new columns in a feed, volatility on a market, delay on a shipment, new chat in TDLib).

Concrete HSP already hints at this pattern:

- **Swap panel** — live quotes and routes from external APIs (Dyor, Swap.Coffee); UI is not a static mock — it **tracks** the stream (chart, amounts, action row).
- **Smart panel** — deploy flow around **user-supplied** purpose and founder data, not HSP-owned legal templates stored as the source of truth.
- **Feed / Messages column** — designed to show **Telegram-origin** and server-backed events the user already generates ([`feed-messages-architecture.md`](feed-messages-architecture.md)).
- **AI & Search column** — prompts over **connected** context, not a proprietary corpus ([`tdlib-build-your-own-telegram-messages-and-token-analytics.md`](tdlib-build-your-own-telegram-messages-and-token-analytics.md)).

The long-term contract:

1. **Ingress** — normalize any supported stream into HSP’s internal event/schema representation (HSP protocol).
2. **Inference** — TinyModel / AI layer proposes panels, fields, actions, and copy (with human-visible fallbacks).
3. **Render** — split-pane chrome (1 / 2 / 3 columns), scroll rules, footers, and localized strings — same shell regardless of vertical.
4. **Egress** — signed actions back to customer systems (REST, chain tx, TDLib send, webhooks).

HSP does not need to **own** the bytes in step 1 forever; it needs to **understand** them long enough to render and act.

---

## 4) Three launch steps with zero proprietary bytes

### 4.1 Public “data oceans” (for demo and narrative)

To show investors and design partners **liquid structure** without a private warehouse, attach **free, high-velocity public streams**:

| Domain | Source examples | Demo story |
|--------|-----------------|------------|
| **Crypto markets** | Binance / Coinbase public tickers; Solana or TON RPC + indexer APIs | Trading and treasury panels that **assemble on the fly** — swap chart, rate row, “Buy 1 ton for X dllr” action row — without hand-coded screens per asset |
| **Weather / logistics** | AIS vessel tracks; OpenSky / aviation delay feeds | Dispatcher-style UI that **rearranges** when a storm or delay event arrives (highlight column, shift footer actions) |

**Goal:** prove that HSP is a **renderer of live structure**, not a dashboard template shop. Demos should emphasize **resize, column count, and stream updates** changing layout — the same behaviors already exercised in authenticated home responsive layout ([`responsive-main-right-ai-layout.md`](responsive-main-right-ai-layout.md)).

**Legal note:** public APIs still have ToS and rate limits; demos are not a substitute for production licensing. Document attribution and throttle policy per connector.

### 4.2 Data-agnostic positioning (integration “out of the box”)

Market HSP as **source-neutral**:

- Value is the **HSP protocol**: typed events, layout hints, action intents, locale keys — not any one database schema.
- Ingress adapters are pluggable: **JSON (REST)**, **CSV upload**, **SQL read replica**, **gRPC stream**, **WebSocket**, **TDLib updates**, **chain subscriptions**.
- Customer workflow: grant read (and optionally write) access → engine **infers** which panels, buttons, and AI prompts fit the schema → employees get a workspace without a six-month integrator project.

**Messaging:** “We don’t ask you to ship your data to our cloud permanently. We ask you to let the engine **see** your data where it already lives.”

On-prem / VPC deployment is a sales feature, not an afterthought: **run the shell locally over your tables**.

### 4.3 Sell integrator savings, not “another BI tool”

Enterprise buyers already pay integrators to build static BI and ops consoles. HSP’s pitch:

> You don’t need to hire a team to **design** interfaces against your data. Deploy our engine beside your DB — it produces the working environment your staff actually click through.

Differentiators vs classic BI:

| Classic BI / integrator | HSP BYOD |
|---------------------------|----------|
| Months of dashboard specification | **Minutes to first panel** from schema + sample rows |
| Fixed chart library | **Adaptive** columns, footers, and action rows per layout breakpoint |
| Separate AI bolt-on | AI column **native** to the shell ([`ai_and_search_bar_input.md`](ai_and_search_bar_input.md)) |
| Vendor hosts your metrics | Customer **owns** data; HSP owns **interpretation + chrome** |

---

## 5) Economics: what you deliberately do not build

Skipping a proprietary data lake removes entire cost centers:

- Crawl farms, deduplication at web scale, cold storage tiers
- Compliance surface for **other people’s** PII you never needed to hold
- Model training pipelines whose only purpose is to **collect** what customers already have

Capital goes to:

- **Connector quality** (reliable ingress, schema detection, backpressure)
- **Layout engine** (scroll vs flex-fill, split panes, footer docking — lessons from Swap panel resize behavior)
- **Trust** (auth, wallet, Telegram session boundaries — [`final-security-model.md`](final-security-model.md))

You are building a **clean lens**, not a second copy of the customer’s warehouse.

---

## 6) First connector: decision frame (REST/JSON vs binary)

The first earthly pilot depends on **which connector you ship first**. Two viable paths:

### Option A — REST / JSON (recommended first pilot)

**Pros**

- Fastest path to Swap-style live UI (already consuming HTTP JSON today).
- Easy for fintech, SaaS, and internal tools teams to test (“here is an API key and OpenAPI doc”).
- Debuggable in browser and Vercel serverless; fits current HSP stack ([`scalability.md`](scalability.md)).
- Schema introspection (`GET /schema`, sample `GET /rows`, or OpenAPI) maps cleanly to **panel inference**.

**Cons**

- Higher latency vs binary streams; polling unless customer offers SSE/WebSocket.
- Less impressive for sub-millisecond tick demos unless paired with a WebSocket adapter.

**Pilot packaging examples**

1. **Crypto treasury desk** — extend existing Swap/Coffee + Dyor connectors into a “connect your exchange API keys read-only” story.
2. **Ops feed** — JSON webhook → Feed column events (wallet created, alert fired) without new storage ([`feed-messages-architecture.md`](feed-messages-architecture.md)).
3. **Factory / ERP read replica** — SQL → JSON bridge (even a thin `postgres→REST` sidecar) for one table (orders, incidents).

### Option B — Low-level binary / streaming (second wave)

**Pros**

- Matches HSP ambition for **high-frequency** market and chain data.
- Single codec (Protobuf, Cap’n Proto, flat buffers) for ingress + action egress.
- Better story for “visual processor at wire speed.”

**Cons**

- Slower sales cycle: customers must run your agent beside the stream.
- More engineering before first demo (codegen, versioning, reconnect semantics).
- Harder to debug in early Telegram Mini App / web-only deployments.

**When to choose B first:** pilot customer is already on gRPC/Fix/Kafka and **cannot** expose REST; or demo requires **co-located** tick processing (HFT-style), not typical HSP v1 users.

### Recommendation

| Phase | Connector | Pilot vertical |
|-------|-----------|----------------|
| **Now → first paid pilot** | REST/JSON (+ optional WebSocket) | Crypto read-only API or internal JSON event bus → Swap/Feed/Smart shells |
| **Next** | SQL read + TDLib user stream | Messages + token sentiment ([`tdlib-build-your-own-telegram-messages-and-token-analytics.md`](tdlib-build-your-own-telegram-messages-and-token-analytics.md)) |
| **Later** | gRPC / binary market feeds | Co-located desk or chain indexer partnership |

Document each connector as: **auth model**, **schema discovery**, **rate limits**, **PII class**, **render mapping** (which HSP panels consume which event types).

---

## 7) Protocol sketch (HSP as BYOD contract)

Minimal internal contract (names illustrative):

```text
StreamDescriptor   — source id, auth ref, refresh mode (poll | push | replicate)
SchemaSnapshot     — fields, types, relationships, sample cardinality
LayoutIntent       — suggested panels (swap | smart | feed | custom), column priority
ActionBinding      — button → outbound call (REST POST, tx, TDLib method)
LocaleBundle       — keys for inferred labels (en / ru)
```

BYOD rule: **`SchemaSnapshot` always originates from customer attachment**, never from HSP-owned tables, except for **demo streams** clearly labeled public.

Version the protocol so integrators can target **HSP 0.x** without forking the renderer.

---

## 8) Risks and mitigations

| Risk | Mitigation |
|------|------------|
| “Empty shell” demos without customer data | Public ocean connectors + seeded **open** streams (§4.1) |
| Customer fear of exfiltration | Local / VPC deploy; read-only creds; no persistent copy by default |
| AI hallucinates UI for wrong schema | Human-approved **LayoutIntent** for v1; diff view before publish |
| Connector sprawl | Tier-1: JSON REST; Tier-2: SQL/TDLib; Tier-3: binary — say no to bespoke one-offs |
| Confusion with TempleOS-style isolation | Explicit BYOD marketing: **your data, our lens** |

---

## 9) Summary

- **No owned data at start** → standard for infrastructure, not a gap.
- **BYOD** → sell a smart shell, not a hosted dataset.
- **Three go-to-market motions:** public demos, data-agnostic integrations, integrator-cost replacement.
- **First connector:** REST/JSON for speed and current codebase alignment; binary streams as phase two unless the pilot demands otherwise.
- **HSP codebase already prototypes the thesis** — live Swap APIs, Telegram-connected columns, AI footer — the work is to **generalize ingress** under one protocol instead of one-off panels.

**Open product question (for next planning session):** which single **earthly** pilot do we package first — crypto read-only treasury, webhook-driven ops feed, or SQL-backed internal tool — and do we ship it as a documented **REST connector** in repo before pitching enterprise SQL?
