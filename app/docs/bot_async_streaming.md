## Bot async streaming & Telegram constraints

This document captures the current behavior of the Telegram bot streaming path, the issues we observed, and the gap between the ideal "multi-segment async streaming" design and the current implementation.

---

## 1. Constraints and goals

### Telegram constraints

- **Per-message length limit:** Telegram's `parse_mode: "HTML"` messages must be ≤ **4096 characters** after HTML escaping and tagging.
- **HTML parsing rules:** Only specific tags are allowed (`<b>`, `<i>`, `<u>`, `<s>`, `<tg-spoiler>`, `<a>`, `<code>`, `<pre>`, `<blockquote>`). All `<`, `>`, `&`, `"` must be escaped unless they are part of a valid tag or entity; otherwise Telegram returns `Bad Request: can't parse entities`.
- **Delivery semantics:**
  - A user's outgoing message shows a **clock** until Telegram's server accepts it, then switches to ✓/✓✓.
  - Our bot's webhook `handleRequest` must return HTTP 2xx quickly; otherwise Telegram retries and may delay/hide the user's message.
  - We return 200 immediately and process updates in `waitUntil`; updates for the **same chat** are serialized via a per-chat queue so Reply A is sent before we start processing Prompt B (see `app/bot/webhook.ts`).

### Product goals

- **Bot replies must be well-formed HTML and ≤4096 characters per message** so Telegram doesn't reject them.
- **Single message preferred;** when the AI output exceeds 4096 characters, the overflow is sent as **continuation message(s)** (each ≤4096), so the user sees the full reply.
- **Per-chat serialization at webhook:** updates for the same chat are processed one after another so Reply A is sent before we start Prompt B.
- **Cancellation within a chat:** we track a generation counter per chat; when a new message arrives for that chat, the in-flight stream is cancelled so only the latest reply is completed.

---

## 2. Current implementation

### 2.1 AI layer (shared bot + TMA)

File: `app/ai/openai.ts`, `app/ai/transmitter.ts`

- `callOpenAiChat` / `callOpenAiChatStream` wrap the OpenAI Responses API (`client.responses.create` / `client.responses.stream`).
- They accept:
  - `mode` (`"chat"` or `"token_info"`),
  - `input` (text; for token_info a prefix is prepended in openai; for chat, history is prepended in transmitter),
  - `context` (arbitrary metadata),
  - optional `threadContext` (for DB persistence),
  - optional `instructions` (string passed to the model; OpenAI native `instructions` field).
- **Bot** requests are initiated from `app/bot/responder.ts`, which sets `instructions: TELEGRAM_BOT_LENGTH_INSTRUCTION` on every transmit/transmitStream call. That instruction asks the model to keep replies under 4096 chars and to mention that full responses are available in TMA when the user asks for long messages.
- The AI layer does **not** derive instructions from `threadContext.type`; the caller (responder) supplies `instructions` when present. `transmitter` forwards `request.instructions` to the OpenAI layer.
- For **token_info**, openai still prepends a system-style prefix to `input` ("You are a blockchain and token analyst...").
- `transmit` / `transmitStream`:
  - Claim the user message in the DB (`insertMessage` + `telegram_update_id`), or return `skipped` if another instance already handled it.
  - For chat mode, prepend conversation history with `formatHistoryForInput`.
  - Call OpenAI (with or without streaming).
  - On success, persist the assistant `output_text` to the `messages` table.

### 2.2 Bot responder (Telegram side)

File: `app/bot/responder.ts`

#### 2.2.1 Concurrency & cancellation

- We track **per-chat generations** (key is `chatId`, not thread_id):

  ```ts
  const chatGenerations = new Map<number, number>();
  const numericChatId = typeof chatId === "number" ? chatId : undefined;
  let generation = 0;
  if (numericChatId !== undefined) {
    const prev = chatGenerations.get(numericChatId) ?? 0;
    generation = prev + 1;
    chatGenerations.set(numericChatId, generation);
  }
  const isCancelled = (): boolean =>
    numericChatId !== undefined &&
    chatGenerations.get(numericChatId) !== generation;
  ```

- `shouldAbortSend()` checks the DB (`getMaxTelegramUpdateIdForThread`) for the latest user `telegram_update_id`; if the current update isn't the latest for that thread, it returns `true`.
- `transmitStream` receives:

  ```ts
  {
    isCancelled,
    getAbortSignal: async () => (await shouldAbortSend()) || isCancelled(),
  }
  ```

  and uses this to abort the OpenAI stream if a newer prompt arrives.

- When a stream is cancelled mid-way, `responder.ts` calls `sendInterruptedReply`:
  - If we already created and edited a message for this reply and have non-empty `streamedAccumulated`, we do one last `editMessageText` (HTML) to finish that message and persist the partial content.
  - If the reply was cancelled before any text was sent but we have some accumulated content, we send a single capped HTML reply with that content and persist it.
  - If we have no content and `sendToChat` is true, we may send a single "…" reply.

Together with the per-chat queue in the webhook (see 2.2.3), replies for the same chat are serialized so Reply A is sent before we start Prompt B; within that, the generation counter ensures the latest prompt wins and in-flight streams are cancelled.

## Hard Cancellation (Latest Prompt Wins)

Each thread maintains a single active `AbortController`. The key is:
- `bot:${user_telegram}:${thread_id}` when we have thread context
- fallback `chat:${chatId}` when thread context is not available

When a new message arrives:
- The previous controller (if any) is aborted immediately.
- The OpenAI stream is terminated via `stream.abort()` (signal listener in `openai.ts`).
- All edit loops and spinners stop instantly in `responder.ts` (guarded by `signal.aborted`).
- No further Telegram edits are sent for the cancelled response.

This ensures:
- Deterministic behavior within a thread
- No overlapping edits
- Fast user feedback

Why this matters:
- Clarity: cancellation is explicit and easy to reason about.
- System understanding: a single cancellation authority per thread reduces ambiguity.
- Maintainability: code + docs align, so changes stay trusted.

#### 2.2.2 Streaming and overflow (multi-message)

- We use a **single streaming segment** for the first 4096 characters:

  ```ts
  const MAX_MESSAGE_TEXT_LENGTH = 4096;
  let streamSentMessageId: number | null = null;
  let streamedAccumulated = "";
  ```

- `sendOrEdit` is called on every `onDelta` from OpenAI and:
  - Updates `streamedAccumulated`.
  - Computes `slice = accumulated.slice(0, MAX_MESSAGE_TEXT_LENGTH)`.
  - Formats `slice` via `mdToTelegramHtml` → `stripUnpairedMarkdownDelimiters` → `closeOpenTelegramHtml` → `truncateTelegramHtmlSafe`.
  - Sends/edits a single Telegram message (first `sendMessage` with `"…"`, then `editMessageText` on `streamSentMessageId`), guarded by `sendOrEditQueue` and `editsDisabled`.
- After `transmitStream` completes:
  - We flush the edit queue and perform a **final edit** on `streamSentMessageId` with the first 4096 characters from `result.output_text` (formatted as HTML, with plain fallback on error).
  - If `result.output_text.length > MAX_MESSAGE_TEXT_LENGTH`, we call **`sendLongMessage`** with the remainder (`result.output_text.slice(MAX_MESSAGE_TEXT_LENGTH)`). Continuation messages are sent as separate Telegram messages (each chunk ≤4096), formatted with the same HTML pipeline and Markdown/plain fallback; they reply to the previous message so they appear in order.
- **Non-streaming path:** we call `transmit`; then if the result fits in one message we send a single reply; otherwise we call `sendLongMessage` with the full `result.output_text` (it chunks and sends multiple messages, each ≤4096).
- Helpers **`chunkText`** and **`sendLongMessage`** in responder split long text at newlines when possible and send multiple messages, replying to the previous one so the thread reads in order.

#### 2.2.3 Webhook concurrency

- In `app/bot/webhook.ts` we **serialize updates per chat** using a `chatQueue`:

  ```ts
  const chatQueue = new Map<number, Promise<void>>();
  // ...
  const chatId = getChatIdFromUpdate(update);
  const prev = chatId !== undefined ? chatQueue.get(chatId) : undefined;
  const work = (prev ?? Promise.resolve())
    .then(() => ensureBotInit())
    .then(() => bot!.handleUpdate(update))
    .then(() => { console.log('[webhook] handled update', updateId); })
    .catch((err) => { console.error('[bot]', err); });
  const tail = work.then(() => {}, () => {});
  if (chatId !== undefined) chatQueue.set(chatId, tail);
  waitUntil(work);
  return jsonResponse({ ok: true });
  ```

- So for a given chat, the next update waits for the previous handler to finish. Reply A is sent before we start processing Prompt B, which avoids reorder flash. Different chats are still processed in parallel.

---

## 3. Gaps vs. ideal multi-segment streaming design

The ideal design would:

1. **AI always produces full `output_text`** (already true).
2. **Bot maintains multiple segment messages per reply:**
   - Segment 0: chars `[0..4096)`, streamed live and finalized.
   - Segment 1: chars `[4096..8192)`, streamed live in a second message, etc.
3. **After completion**, each segment is edited once more to match the exact final slice of `output_text`.

The **current implementation**:

- **First segment** is streamed live (single message, up to 4096 chars) and gets a final edit from `result.output_text`.
- **Overflow** (beyond 4096 chars) is sent **after** the stream completes via `sendLongMessage` as one or more continuation messages. We do **not** stream into the second (and further) segments live; only the first segment is streamed.
- So the user gets the full reply (first message + continuation messages), but only the first 4096 characters are streamed; the rest is sent in one go after completion. The TMA path still gets the full `output_text` (no truncation).

To implement **live streaming into multiple segments**, we would need to:

- In `sendOrEdit`, detect when the accumulated text crosses 4096 and create a new Telegram message for the next segment, then route subsequent edits to the correct segment.
- Maintain a `segments: { id: number; start: number; end: number }[]` (or similar) and issue a final `editMessageText` per segment on completion.

That refactor adds state and edge cases (segment creation, cancellation across segments). The current approach (stream first segment, then send overflow as continuation messages) is simpler and still delivers the full reply.

---

## 4. Known issues / open questions

1. **"Clock + flash" in threads (historical vs. current):**
   - With per-chat serialization at the webhook, Reply B does not start until Reply A's handler has finished (or at least until A's work is chained after). So we avoid overlapping replies in the same chat; the "clock + flash" reorder is largely avoided because A completes before B starts.
   - Cancellation (generation counter) still matters when A is cancelled by B so that we don't keep editing A after B has been sent.

2. **Length vs. HTML edge cases:**
   - We depend on the model respecting the 4096-character instruction; if it overshoots, we truncate, then trim at the last `>` and call `closeOpenTelegramHtml` to avoid cutting tags in half.
   - "Bad Request: can't parse entities" can still occur on malformed HTML; `stripUnpairedMarkdownDelimiters` + `closeOpenTelegramHtml` + `truncateTelegramHtmlSafe` reduce this.

3. **Segment-level streaming:** Only the first segment is streamed live; overflow is sent after completion. For truly long live multi-segment streaming we'd need the refactor described in §3.

4. **Behavior when cancellation happens late:** If `isCancelled()` flips very close to the end of a stream, the final edit might still land. We check `shouldAbortSend()` in `sendOrEditOnce` and before the final completion edit to reduce this.

If you want to adjust any of these behaviors (e.g. live multi-segment streaming, or how we finalize a cancelled reply), we can extend this design and update `responder.ts` accordingly.
