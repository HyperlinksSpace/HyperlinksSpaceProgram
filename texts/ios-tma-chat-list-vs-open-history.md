# iOS mobile: why the chat list works and open-chat history often does not

This note explains the **architectural gap** between:

1. **Chat list** (dialogs on the Messages home surface) — generally **reliable on iOS Telegram Mini App (TMA)** and mobile Safari.
2. **Open-chat history** (message bubbles inside one chat) — **fragile on the same clients**, even when the gateway returns the same JSON the emergency DOM overlay can show.

It is written for debugging and product alignment, not as a prescription for a specific patch. Related: [`login-and-telegram-messages-architecture.md`](login-and-telegram-messages-architecture.md), [`feed-messages-architecture.md`](feed-messages-architecture.md).

---

## 1) Executive summary

| Dimension | Chat list | Open chat (history page) |
|-----------|-----------|---------------------------|
| **What you see** | One row per dialog: title, avatar, **last-message preview**, unread badge | Many **MessageChatMessageRow** bubbles, scroll anchors, date dividers, live tail |
| **Primary data** | TDLib **chat list** sync + SSE **`chats`** stream | HTTP **history page** per `chat_id` + optional SSE **`history`** stream |
| **Typical payload** | Small, incremental **revisions**; rows are **metadata + preview** | Large **JSON page** (e.g. 12–30 messages) read as **one body** |
| **When fetch runs** | Home is already mounted; list sync is **long-lived** | Often starts on **tap** or **route transition** (list → overlay or `/messages/chat`) |
| **UI complexity** | `MessageChatRow` in `AuthenticatedHomeMessagesPanel` | `MessageChatMessageList`: open-scroll settle, cache anchor, paint gating |
| **iOS TMA transport** | Ordinary **GET + SSE** on stable URL | Extra lanes: **`fetch` + `text()`**, **XHR**, **`ios_script` deliver**, gesture **join** |
| **Fallback UI** | Keep **previous rows** while resyncing | Emergency **`#hsp-ios-history-paint`** DOM (raw wire text), not React bubbles |

**The list “works” because it is a slow, incremental, on-home sync with simple rows. Open chat fails when any step breaks: body delivery in WKWebView, handoff into React state, or scroll layout before paint — not because TDLib cannot return messages.**

---

## 2) Chat list — fetch path

### Server / gateway

- Chats come from TDLib **ordered list** sync (`gatewayResyncChats`, live chat stream, pagination).
- API handler serves **live chat snapshots** and revisions; see `api/_handlers/telegram-messages.ts` and `telegram/tdlib/connectAttempts.ts`.

### Client

- **`AuthenticatedHomeMessagesPanel`** holds `chats: MessageChatRowData[]`.
- **Initial + ongoing updates:** gateway resync, cached snapshot merge, **`useTelegramMessagesChatListStream`** (SSE `chats` via `EventSource` on web).
- **Status:** `chatListSyncStatus` (`stableTopReady`, `inProgress`, etc.) — UI can show **stale rows** instead of a blank screen while sync continues.
- **Search / focus:** separate endpoints; not on the hot open path.

### iOS-specific behavior (why it survives)

- List requests are classified as **background / list** traffic in `ui/telegram/iosCompetingRead.ts` (`openIosCompetingRead`). They may be **aborted** when the user opens a chat — that is acceptable; the list is already painted.
- Fetches usually start when **home is visible** — no slide animation, no wait for a second scroll host.
- Each row only needs **preview fields** already present in the chat-list payload; there is no second “normalize full history page” step before first paint.

**Debug anchors:** `messages_chats_*`, `messages_gateway_resync`, `messages_chat_list_virtual_window`.

---

## 3) Chat list — display path

- **Component:** `MessageChatRow` inside a virtualized list (`AuthenticatedHomeMessagesPanel`).
- **Layout:** Single column on compact iOS; row height is predictable (avatar + one or two lines of preview).
- **No open-scroll contract:** Selecting a row does not require `layoutH > 0` on a message scroller before rows appear.
- **State:** `setChats` merges gateway revisions; **does not** clear the whole list on every resync tick unless connection is lost.

---

## 4) Open chat — fetch path

### Server / gateway

- **History page:** `gatewayFetchChatMessages` → JSON `{ ok, messages[], has_more_older, ... }`.
- **iOS script lane:** same JSON can be returned via `?ios_script=1` and `window.__hspHistoryDeliver` (see comment in `api/_handlers/telegram-messages.ts`) when `fetch`/XHR body completion is unreliable in WKWebView.

### Client entry

- **`messageChatHistoryPrefetch.ts`:** deduped `sharedLoads`, optional **`primeOpenChatHistoryFromGesture`** on list tap (iOS), `loadOpenChatHistoryFirstPage` when the chat pane mounts.
- **`fetchTelegramChatHistoryPage.ts`:** foreground TMA uses **`loadHistoryViaText`** — read body, parse JSON, optionally **`paintIosHistoryDomOverlay`**, then **`emitWebHistoryOpenPaint`** / cache.

### iOS-specific behavior (why it breaks)

1. **Timing / surface**
   - Gesture-prime may start a body read **on the list route** before `MessageChatMessageList` and **`[data-hsp-chat-scroll]`** exist.
   - Open effect may **join** the same in-flight promise (`joinPrime` / `gestureFlight`) — if the first read never completes, the chat stays on a spinner with no `text_hit`.

2. **Transport**
   - TMA foreground open is not a single `fetch().json()` like desktop: branches include **`loadHistoryViaText`**, **XHR**, **script tag**, competing-read abort rules, and hard timeouts (`iosForegroundHistoryHttp.ts`).
   - **`onChatPath` / `compactChatOpen`** flags change which lane runs; list-tap often has `onChatPath=false` even though the user is opening a chat.

3. **Gateway contention**
   - Opening a chat sets **`openChatLoadingId`** and pauses background list prefetches so history wins TDLib time; voice, resync, and neighbor prefetches still interact with the same gateway.

4. **Duplicate flights**
   - Two near-simultaneous history dispatches (gesture + mount) can wedge WKWebView; logs show **double `fetch_tma_alt`** or **`tma_body_join`** without **`text_hit`**.

**Debug anchors:** `messages_history_fetch_*`, `messages_history_text_hit`, `messages_history_gesture_prime`, `messages_history_network_begin`, `messages_history_load_start`, `messages_history_open_load_error`.

---

## 5) Open chat — display path

### Intended path (React bubbles)

1. JSON → **`historyPageFromWire`** → **`normalizeHistoryMessage`** → `MessageChatHistoryItem[]`.
2. **`setCachedChatHistory`** + **`setWebHistoryPaint`** listener in **`MessageChatMessageList`** → **`applyCachedHistoryPage`** / `setMessages`.
3. **`MessageChatMessageRow`** renders bubbles (outgoing/incoming, media, receipts).
4. **`chatScrollPaintReady`**, **`applyOpenScrollOnce`**, bottom/unread anchor — list may stay hidden (spinner or `opacity`) until scroll metrics exist.
5. **`HspScrollColumn`** on compact iOS needs real **`layoutH`** (`layoutHostHeightHintPx`, ResizeObserver); **layoutH = 0** blocks open-scroll settle even when `messages.length > 0`.

### Emergency path (DOM overlay — “works” but is not the design)

- **`paintIosHistoryDomOverlay`** appends plain `div`s with **`wireMessageLine(raw)`** — it only needs `text` on wire objects.
- Fixed overlay (`position:fixed; z-index:999999`) sits **above** React; user sees grey strips while bubbles may be painted underneath or not at all.
- This path **does not** use `MessageChatMessageRow`, open-scroll, or cache anchor matching — so **fetch can succeed for the overlay and still fail for bubbles**.

### Why overlay text ≠ bubbles

| Step | DOM overlay | React bubbles |
|------|-------------|---------------|
| Input | Raw `json.messages[]` | Same JSON after **`normalizeHistoryMessage`** |
| ID fields | Not required (text only) | Needs valid **`telegram_message_id`** (and media / content_kind rules) |
| Listener | None | **`setWebHistoryPaint`** must be registered; pending flush on mount |
| Layout | Fixed layer | **`HspScrollColumn`** + open-scroll |
| Removal | Manual / listener | **`removeIosHistoryDomOverlay`** when paint commits |

Logs: **`messages_history_web_open_paint_pending`** (listener missing), **`messages_history_ios_paint`** (listener applied), **`messages_history_cache_hit_skipped`** (anchor mismatch).

---

## 6) Comparison to Telegram Web (“K”)

Telegram Web opens a chat from **in-memory store + workers**; the URL may not change and **no new HTTP history body** is required for the first paint.

HSP on iOS TMA today:

- List ≈ **streaming sync + SSE** (closer to Web K’s chat list).
- Open chat ≈ **cold HTTP page + React open-scroll** (stricter than Web K’s instant store paint).

Aligning behavior is not “use the same fetch as overlay” alone — it requires **one body read**, **one normalized page in cache**, **listener apply on the same turn**, and **reveal scroll without waiting on broken `fetch` promises**, or a **store-first** model like K.

---

## 7) Practical debugging checklist (iOS TMA)

When the list works but open chat does not:

1. **Fetch finished?** Look for **`messages_history_text_hit`** (`count`, `transport`). No `text_hit` → WK/gateway body problem, not React.
2. **React got rows?** **`messages_history_web_open_paint`**, **`messages_history_ios_paint`**, or **`messages_history_cache_hit`** with `applied: true`.
3. **Normalize gap?** Wire `count` in `text_hit` vs `messages_history_fetch_body` `count` — normalization dropped rows.
4. **Stuck join?** **`joinPrime` / `gestureFlight`** + **`tma_body_join`** without `text_hit` → joined a hung list-tap flight.
5. **Paint gate?** Messages in state but spinner — **`messages_compact_overlay_paint_fallback`**, **`layoutH`** in scroll metrics, **`chatScrollPaintReady`**.
6. **Overlay only?** DOM visible, no bubbles — overlay not removed or listener never applied; check **`web_open_paint_pending`**.

---

## 8) Code map (starting points)

| Concern | Location |
|---------|----------|
| Chat list state + resync | `ui/components/AuthenticatedHomeMessagesPanel.tsx` |
| Chat list SSE (web) | `ui/components/messages/useTelegramMessagesChatListStream.web.ts` |
| List row UI | `ui/components/messages/MessageChatRow.tsx` |
| History prefetch / gesture prime | `ui/messageChatHistoryPrefetch.ts` |
| History HTTP + iOS lanes | `ui/telegram/fetchTelegramChatHistoryPage.ts` |
| iOS XHR/script body | `ui/telegram/iosForegroundHistoryHttp.ts` |
| iOS abort lanes | `ui/telegram/iosCompetingRead.ts` |
| Message list UI + paint listener | `ui/components/messages/MessageChatMessageList.tsx` |
| Compact route latch | `ui/compactChatRouteGate.ts` |
| History API + ios_script | `api/_handlers/telegram-messages.ts` |

---

## 9) Product directions (non-prescriptive)

These are **design options**, not current implementation:

1. **Store-first open** — cache last history page per chat from list preview or prefetch; paint bubbles before any open HTTP (Web K–like).
2. **Single flight per chat** — never start a second body read until the first completes or times out; open always **joins** or **waits for chat mount**, never restarts on list tap.
3. **Unify wire → UI** — one `commitHistoryPage(json)` used by overlay (if kept), cache, and listener; drop overlay once `messages.length > 0`.
4. **In-column wire placeholder** — if a fallback is needed, mount inside `[data-hsp-chat-scroll]` so layout and handoff share one scrollport.

---

## 10) Alignment (2026-03): list-parity history fetch

Open-chat foreground loads mirror the **chat list client path** on every platform: `GET` `/api/telegram-messages-history` (gateway `getChatHistory`) with `credentials: "include"`, `response.json()`, and `openIosCompetingRead()` — no iOS-only body lane, no `runQueuedNetworkFetch` on open, no `sharedLoads` join/gesture-prime. One coalesced flight per `chat_id` (`foregroundOpenByChatId`). UI applies cache first (stale-while-revalidate), then runs the gateway fetch immediately like `loadChats` silent refresh (`MessageChatMessageList` open effect).

**TDLib `getChatHistory`** ([official docs](https://core.telegram.org/tdlib/docs/classtd_1_1td__api_1_1get_chat_history.html)): iOS open may request `only_local=1` first (`from_message_id=0`, `offset=0`, `limit` ≤ 100, `only_local=true`) for an offline slice, then a normal request. Gateway rejects `only_local` with paging/anchor params (`only_local_tail_open_only`).

*Last updated from iOS TMA debugging sessions and list-parity history fetch.*