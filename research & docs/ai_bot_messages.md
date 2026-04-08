# Plan: Implement messages table in the bot

**Goal:** Persist bot messages in the `messages` table and use the DB for "no message mixing" (serverless). Optionally use thread history for AI context later.

**Existing:** `app/database/messages.ts` has `insertMessage`, `getThreadHistory`, `getMaxTelegramUpdateIdForThread`. Schema in `start.ts`; table created by `db:migrate`. Bot: `responder.ts` handles text/caption, gets `ctx.from`, `message_thread_id`, calls `transmit`/`transmitStream`, replies. No DB persistence today; no thread history for AI.

---

## Best possible implementation (target design)

**Split of responsibility**

- **AI layer** owns all message persistence and context. **Bot** (and later TMA) own only transport and, for the bot, mixing prevention.

**AI side (single place for persistence and context)**

- Receives every request with: `input`, `user_telegram`, `thread_id`, `type` (`'bot'` | `'app'`), and optionally `telegram_update_id` (bot only).
- **Claim / user message:** Inserts the user message (with `telegram_update_id` when provided). If insert returns `null` (unique violation), returns a **skipped** result so the caller does not send anything.
- **Context:** Loads `getThreadHistory(...)` for that thread, converts to the format the model expects (e.g. `messages[]`), and passes current `input` + history to the model.
- **Assistant message:** After a successful model response, inserts the assistant message (no `telegram_update_id`).
- **Result:** One code path for “what gets stored” and “what context the model sees”. Bot and TMA both call this same layer; no duplicate insert logic in each client.

**Bot side (mixing only)**

- Resolves `user_telegram`, `thread_id`, `update_id` from `ctx`, and passes them into the AI call (including `telegram_update_id`).
- If AI returns **skipped** (claim insert failed), returns without calling AI again and without sending any reply or draft.
- Before **each** draft send and before the **final** reply: calls `getMaxTelegramUpdateIdForThread(user_telegram, thread_id, 'bot')`. If `max !== our update_id`, aborts (does not send). No message writes in the bot; only this read for mixing.
- Sends drafts and final reply as today; does not call `insertMessage` itself.

**TMA**

- Calls the same AI layer with `user_telegram`, `thread_id`, `type: 'app'`. No `telegram_update_id`. Same persistence (user + assistant) and same history loading. No mixing logic unless we add a TMA-specific mechanism later (e.g. client request id + uniqueness).

**Data flow (bot)**

1. User sends a message → webhook → bot handler.
2. Bot: resolve `user_telegram`, `thread_id`, `update_id`; call AI with `input`, `user_telegram`, `thread_id`, `type: 'bot'`, `telegram_update_id`.
3. AI: insert user message (with `telegram_update_id`). If `null` → return skipped. Else: load thread history, call model with history + current input, insert assistant message, return response (and for streaming: stream + insert assistant when done).
4. Bot: if skipped → return. Else: for each draft and for final reply, check `getMaxTelegramUpdateIdForThread`; if not ours, abort. Else send draft/reply.

**Why this is best**

- **Single source of truth:** All message rows and model context are created in the AI layer. Bot and TMA stay thin and consistent.
- **No mixing in bot:** Mixing is entirely “check before send” + “skipped when claim fails”; no message writes in the bot.
- **History by default:** AI always loads thread history and uses it for context, so conversations are coherent across turns.
- **TMA-ready:** Same API for TMA (no `telegram_update_id`); mixing can be added later if needed.

---

## 1. Resolve thread identity and update_id in the bot

- **user_telegram:** `normalizeUsername(ctx.from?.username)` (same as grammy upsert). If empty, we can skip persistence or still reply (plan: skip DB only when username missing).
- **thread_id:** `ctx.message?.message_thread_id ?? 0` (already used in responder for `replyOptions`).
- **type:** `'bot'`.
- **update_id:** `ctx.update.update_id` (Grammy context has it). Must be passed into the handler or read from `ctx.update` in responder.

**Where:** `responder.ts` (and optionally grammy if we need to pass update_id explicitly). Ensure we have access to `ctx.update.update_id` in `handleBotAiResponse`.

---

## 2. Insert user message first; skip if duplicate (claim by insert)

- At the start of the AI flow (after we have `text`, `user_telegram`, `thread_id`), call:
  `insertMessage({ user_telegram, thread_id, type: 'bot', role: 'user', content: text, telegram_update_id })`.
- If `insertMessage` returns `null` (unique violation → another instance or duplicate webhook), **return without calling AI or replying** (so only one handler "owns" this update).

**Where:** `responder.ts`, right after we have `text` and before we set up streaming/cancellation. Requires `user_telegram` and `update_id`; user must exist in `users` (grammy already upserts before calling the handler).

---

## 3. Check "max update_id" before each send (no mixing)

- Before each **draft** send and before the **final reply**, call:
  `getMaxTelegramUpdateIdForThread(user_telegram, thread_id, 'bot')`.
- If the returned max is not equal to our `update_id`, another instance has already processed a newer user message → **abort** (do not send draft or reply). Same idea as current in-memory `isCancelled()`, but DB-backed so it works across serverless instances.

**Where:** In `responder.ts`, inside `sendDraftOnce` / before `ctx.reply`: call the DB; if `max !== ourUpdateId`, treat as cancelled (return / skip send).

---

## 4. Persist assistant reply after successful send

- After we send the final reply with `ctx.reply(result.output_text, replyOptions)` (and only when we actually send, not when we aborted or errored), call:
  `insertMessage({ user_telegram, thread_id, type: 'bot', role: 'assistant', content: result.output_text })` (no `telegram_update_id`).

**Where:** `responder.ts`, after the successful `ctx.reply(...)`.

---

## 5. (Optional) Use thread history for AI context

- Load history: `getThreadHistory({ user_telegram, thread_id, type: 'bot', limit })`.
- Convert to the format expected by the AI (e.g. OpenAI `messages`: `{ role, content }[]`).
- Pass this into the AI layer. Today `transmit`/`transmitStream` and `callOpenAiChat`/`callOpenAiChatStream` take a single `input` string; we’d need to extend the API to accept an optional `history` (or `messages`) and send a multi-turn request instead of a single user message.

**Where:** New or changed code in `openai.ts` / `transmitter.ts` and call from `responder.ts` when in `chat` mode. Can be a follow-up step after 1–4.

---

## Implementation order (recommended)

| Step | What | Files |
|------|------|--------|
| 1 | Resolve and pass `user_telegram`, `thread_id`, `update_id` in responder | `responder.ts` |
| 2 | Insert user message at start; if `null`, return (no AI, no reply) | `responder.ts`, `database/messages.ts` (already has API) |
| 3 | Before each draft and before final reply: check `getMaxTelegramUpdateIdForThread`; if max ≠ our `update_id`, abort send | `responder.ts` |
| 4 | After successful `ctx.reply`, insert assistant message | `responder.ts` |
| 5 | (Later) Load thread history and pass to AI | `responder.ts`, `ai/openai.ts`, `ai/transmitter.ts` |

---

## Edge cases

- **No username:** If `user_telegram` is empty (no `ctx.from.username`), we can skip all DB calls and keep current behavior (reply without persisting), or refuse to reply; plan suggests skip persistence only.
- **User not in DB:** `insertMessage` uses FK to `users(telegram_username)`. Grammy already upserts on message, so the user should exist. If we ever process before upsert, we’d get an FK error; keep upsert as first step in grammy (current behavior).
- **Schema not run:** Ensure `ensureSchema()` runs before handlers (e.g. at deploy via `db:migrate`); no change needed if already in place.

---

## Summary

1. **Tell first:** This document is the plan.
2. **Implement 1–4** so the bot persists user and assistant messages and uses the DB for "only latest wins" (no mixing in serverless).
3. **Implement 5** later to add thread history to the AI.
