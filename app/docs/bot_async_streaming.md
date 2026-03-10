## Bot async streaming & Telegram constraints

This document captures the current behavior of the Telegram bot streaming path, the issues we observed, and the gap between the ideal “multi‑segment async streaming” design and the current implementation.

---

## 1. Constraints and goals

### Telegram constraints

- **Per‑message length limit:** Telegram’s `parse_mode: "HTML"` messages must be ≤ **4096 characters** after HTML escaping and tagging.
- **HTML parsing rules:** Only specific tags are allowed (`<b>`, `<i>`, `<u>`, `<s>`, `<tg-spoiler>`, `<a>`, `<code>`, `<pre>`, `<blockquote>`). All `<`, `>`, `&`, `"` must be escaped unless they are part of a valid tag or entity; otherwise Telegram returns `Bad Request: can't parse entities`.
- **Delivery semantics:**
  - A user’s outgoing message shows a **clock** until Telegram’s server accepts it, then switches to ✓/✓✓.
  - Our bot’s webhook `handleRequest` must return HTTP 2xx quickly; otherwise Telegram retries and may delay/hide the user’s message.
  - We now always return 200 immediately and process updates asynchronously in `waitUntil`, with **no per‑chat serialization** at the webhook layer (see `app/bot/webhook.ts`).

### Product goals

- **Bot replies must be well‑formed HTML and ≤4096 characters per message** so Telegram doesn’t reject them.
- **No “multi‑message streaming” needed** for one reply:
  - Each bot reply should be a **single message**, not a chain of “Part 1/2/3…”.
  - No trailing `…` that never gets replaced.
- **Async streaming per thread:**
  - Multiple chats and multiple threads within a chat can stream in parallel.
  - Within a given `(chatId, thread_id)` thread, a new user message should cancel the previous in‑flight stream so replies don’t interleave or arrive out of order.
  - When the user sends Prompt B in the same thread while Reply A is still streaming, A should stop as soon as possible; B’s reply should start streaming without waiting for A’s handler to complete.

---

## 2. Current implementation

### 2.1 AI layer (shared bot + TMA)

File: `app/ai/openai.ts`, `app/ai/transmitter.ts`

- `callOpenAiChat` / `callOpenAiChatStream` wrap the OpenAI Responses API (`client.responses.create` / `client.responses.stream`).
- They are **generic**: they only know about:
  - `mode` (`"chat"` or `"token_info"`),
  - `input` (text with history prepended),
  - `context` (arbitrary metadata),
  - optional `threadContext` (for DB persistence and to decide if this is a bot vs TMA call).
- For **bot** (`threadContext.type === "bot"`), we send an `instructions` field:

  ```ts
  const isBot = params.threadContext?.type === "bot";
  const baseInstructions =
    mode === "token_info"
      ? "You are a blockchain and token analyst. Answer clearly and briefly."
      : "";
  const botLimitInstruction = isBot
    ? " For Telegram bot replies, the entire response must fit within 4096 characters. Prefer concise wording and omit unnecessary elaboration so the final text stays under 4096 characters."
    : "";
  const instructions = `${baseInstructions}${botLimitInstruction}`.trim();

  const response = await client.responses.create({
    model: "gpt-5.2",
    ...(instructions ? { instructions } : {}),
    input: trimmed,
  });
  ```

- For **TMA** (`threadContext.type === "app"`), we omit the bot‑specific instruction, so TMA can receive long answers.
- `transmit` / `transmitStream`:
  - Claim the user message in the DB (`insertMessage` + `telegram_update_id`), or return `skipped` if another instance already handled it.
  - For chat mode, prepend conversation history with `formatHistoryForInput`.
  - Call OpenAI (with or without streaming).
  - On success, persist the assistant `output_text` to the `messages` table.

### 2.2 Bot responder (Telegram side)

File: `app/bot/responder.ts`

#### 2.2.1 Concurrency & cancellation

- We track **per‑thread generations**:

  ```ts
  const chatGenerals = new Map<string, number>();

  const concurrencyKey =
    typeof chatId === "number" ? `${chatId}:${thread_id}` : undefined;
  let generation = 0;
  if (concurrencyKey !== undefined) {
    const prev = chatGenerals.get(concurrencyKey) ?? 0;
    generation = prev + 1;
    chatGenerals.set(concurrencyKey, generation);
  }

  const isCancelled = (): boolean =>
    concurrencyKey !== undefined &&
    chatGenerals.get(concurrencyKey) !== generation;
  ```

- `shouldAbortSend()` checks the DB (`getMaxTelegramUpdateIdForThread`) for the latest user `telegram_update_id`; if the current update isn’t the latest for that thread, it returns `true`.
- `transmitStream` receives:

  ```ts
  {
    isCancelled,
    getAbortSignal: async () => (await shouldAbortSend()) || isCancelled(),
  }
  ```

  and uses this to abort the OpenAI stream if a newer prompt arrives.

- When a stream is cancelled mid‑way, `responder.ts` calls `sendInterruptedReply`:
  - If we already created and edited a message for this reply and have non‑empty `streamedAccumulated`, we do one last `editMessageText` (HTML) to “finish” that message and persist the partial content.
  - If the reply was cancelled before any text was sent but we have some accumulated content, we send a single capped HTML reply with that content and persist it.

Together with the removal of per‑chat `chatQueue` (see below), this gives **async streaming per thread** while still ensuring “latest prompt in a thread wins.”

#### 2.2.2 Streaming & single‑segment behavior

- We define a **single streaming segment** per reply:

  ```ts
  const MAX_MESSAGE_TEXT_LENGTH = 4095; // 4096 incl. terminator
  let streamSentMessageId: number | null = null;
  let streamedAccumulated = "";
  ```

- `sendOrEdit` is called on every `onDelta` from OpenAI and:
  - Updates `streamedAccumulated`.
  - Computes `slice = accumulated.slice(0, MAX_MESSAGE_TEXT_LENGTH)`.
  - Formats `slice` via `mdToTelegramHtml` → `stripUnpairedMarkdownDelimiters` → `closeOpenTelegramHtml` → `truncateTelegramHtmlSafe`.
  - Sends/edits a single Telegram message (`sendMessage` first with `"…"`, then `editMessageText` on `streamSentMessageId`), guarded by `sendOrEditQueue` and `editsDisabled`.
- After `transmitStream` completes:

  ```ts
  const fullSlice = result.output_text.slice(0, MAX_MESSAGE_TEXT_LENGTH);
  const finalFormatted = truncateTelegramHtmlSafe(
    closeOpenTelegramHtml(
      stripUnpairedMarkdownDelimiters(mdToTelegramHtml(fullSlice)),
    ),
    MAX_MESSAGE_TEXT_LENGTH,
  );
  // one last edit on streamSentMessageId
  ```

- If there was no streaming (non‑private chat or `canStream === false`), we call `transmit` and then send a single reply with `result.output_text` truncated to `MAX_MESSAGE_TEXT_LENGTH`.

- **Multi‑message overflow has been removed**:
  - `chunkText` and `sendLongMessage` helpers are gone.
  - We no longer send continuation messages for text beyond 4096 chars.

#### 2.2.3 Webhook concurrency

- In `app/bot/webhook.ts` we removed the old `chatQueue` that serialized updates per chat.
- Now `handleRequest`:

  ```ts
  const update = await request.json();
  const updateId = update.update_id;
  const work = ensureBotInit()
    .then(() => bot!.handleUpdate(update))
    .then(() => console.log('[webhook] handled update', updateId))
    .catch(err => console.error('[bot]', err));
  waitUntil(work);
  return jsonResponse({ ok: true });
  ```

- The legacy `(req, res)` handler similarly just calls `bot.handleUpdate` directly.

**Implication:** multiple updates, even from the same chat, can be processed in parallel. The per‑thread `chatGenerations` + DB check in `responder.ts` is now fully responsible for avoiding mixed/out‑of‑order replies within a thread.

---

## 3. Gaps vs. ideal multi‑segment streaming design

Your conceptual design calls for:

1. **AI always produces full `output_text`** (already true).
2. **Bot maintains multiple segment messages per reply**:
   - Segment 0: chars `[0..4096)`, streamed and finalized.
   - Segment 1: chars `[4096..8192)`, streamed in a second message, etc.
3. **After completion**, each segment is edited once more to match the exact final slice of `output_text`, so no `…` remains and no manual splitting is needed elsewhere.

The **current implementation differs** in that:

- It only ever creates/edits **one** segment per reply (`streamSentMessageId`).
- When `result.output_text` exceeds the 4096‑char cap:
  - We **truncate** to 4096 characters for the bot (per your current requirement that bot replies should fit in a single Telegram message).
  - We no longer stream or send the remainder as additional segments.
- The TMA path still gets the full `output_text` (no truncation).

This is intentional based on the updated product decision: **no multi‑message replies in the bot**, just a single, concise answer that fits Telegram’s limit.

To implement the original multi‑segment streaming design, we would need to:

- Introduce a `segments: { id: number; start: number; end: number }[]` structure in `responder.ts`.
- Change `sendOrEdit` to:
  - Compute which segment(s) each new delta belongs to.
  - Create new Telegram messages when a segment fills up.
  - Route `editMessageText` calls to the correct segment (`message_id`) instead of a single `streamSentMessageId`.
- On completion:
  - Re‑slice `result.output_text` into per‑segment slices.
  - Issue a final `editMessageText` per segment.

That is a non‑trivial refactor and reintroduces more complex state and error‑handling (multiple in‑flight messages per reply, segment‑level cancellation, etc.). Given the current goal (“one concise message per bot reply, no multi‑message streaming”), the simpler **single‑segment + 4096‑cap** implementation is more robust.

---

## 4. Known issues / open questions

1. **“Clock + flash” in threads:**  
   - When a user sends Prompt B while Reply A is still streaming, Telegram may briefly show B (with a clock) below A, then insert the rest of Reply A above it when the bot’s last edit arrives. This is a **Telegram client UI behavior**: B is still pending (clock), so the client temporarily puts it at the bottom, then reflows when a server message (Reply A) arrives that belongs above it in the timeline.
   - We mitigate resends by always returning HTTP 200 quickly from the webhook, but we cannot control how Telegram’s client orders pending vs. newly arrived messages. Removing server‑side per‑chat serialization allows B’s handler to start immediately, but the visual “flash” is ultimately client‑side.

2. **Length vs. HTML edge cases:**  
   - Even with truncation + `truncateTelegramHtmlSafe`, we still depend on OpenAI respecting the 4096‑character instruction. If it slightly overshoots, we truncate by characters, then trim at the last `>` and call `closeOpenTelegramHtml` to avoid cutting tags in half.
   - We’ve seen “Bad Request: can't parse entities” when HTML contained illegal constructs (e.g. unmatched tags, or using unsupported markup). `stripUnpairedMarkdownDelimiters` + `closeOpenTelegramHtml` + `truncateTelegramHtmlSafe` significantly reduce this, but there may still be pathological cases if the model emits malformed tag sequences.

3. **Segment‑level streaming not implemented:**  
   - We only stream into the first segment and never open additional live segments.
   - Given the 4096 limit and bot‑side truncation, this is acceptable for now, but if we later want truly long, multi‑segment live replies **within the bot**, we’ll need the segmented streaming refactor described above.

4. **Behavior when cancellation happens late:**  
   - If `isCancelled()` flips very close to the end of a stream, it’s possible that:
     - The final `onDelta` + `final completion edit` land just before we notice cancellation.
     - The cancelled reply appears “complete” to the user even though a newer prompt has arrived.  
   - We partially mitigate this by:
     - Checking `shouldAbortSend()` in `sendOrEditOnce` and before sending the final completion edit.
     - Only sending an “interrupted reply” when the cancelled reply is *not* the latest by `telegram_update_id`.
   - This is an inherent race between network delivery and our cancellation checks; we prioritize avoiding mixed/interleaved replies over trying to fully hide late but complete replies.

If you want to adjust any of these behaviors (e.g. reintroduce multi‑segment streaming, change how/when we finalize a cancelled reply, or tighten/loosen the AI length constraint), we can extend this design and update `responder.ts` accordingly.  

