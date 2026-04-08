### Database refactor and extensions (plan)

**Goal**

- DB bootstrap in `app/database`; keep `users`, `wallets`, `pending_transactions` as-is.
- One minimal AI table shared by bot and TMA; one user identity: `user_telegram` (bot: `ctx.from.username`; TMA: initData `user.username`). No Chat table; TMA-only users use `type = 'app'`.

---

**messages** (single table, not implemented yet)

- `id` (PK, BIGSERIAL) — same as other tables (e.g. wallets).
- `created_at` (TIMESTAMPTZ, NOT NULL DEFAULT now()).
- `user_telegram` (TEXT, FK → `users(telegram_username)`).
- `thread_id` (BIGINT) — bot: Telegram `message_thread_id` (0 = default); TMA: app-chosen (e.g. 0).
- `type` (TEXT) — `'bot'` | `'app'`.
- `role` (TEXT) — `'user'` | `'assistant'` | `'system'`.
- `content` (TEXT).
- `telegram_update_id` (BIGINT, nullable) — bot only; NULL for TMA. Source: Telegram webhook payload (`ctx.update.update_id` in bot handler). Used for: (1) unique constraint → one row per update per thread, no double-reply; (2) before send, check max = our update_id → if not, abort (avoids mixed replies in serverless). TMA doesn’t need it: requests come from the app (HTTP), not Telegram’s update stream, so there is no update_id; TMA concurrency is a separate concern (e.g. client or request-scoped).

**Thread key** — `(user_telegram, thread_id, type)` together identify one conversation. Example: user "alice", topic 0, bot = one thread; same user, topic 5, bot = another thread; same user, app = TMA thread.

**Index** — `(user_telegram, thread_id, type, created_at)` so we can quickly get "all messages in this thread, ordered by time" (for building chat history for AI).

**Unique for bot** — `(user_telegram, thread_id, type, telegram_update_id)` where `telegram_update_id IS NOT NULL`. Meaning: in a given thread, each Telegram update_id may appear at most once. So we can’t insert two rows for the same update (e.g. duplicate webhook or two serverless instances); the second insert fails, that handler skips. Only the first insert “owns” the reply.

**Bot: no message mixing (messages-only)**

1. Insert user message with `telegram_update_id`. On unique violation → skip.
2. Before each send: if `MAX(telegram_update_id)` for thread ≠ our update_id → abort.
3. No extra tables.

**Migrations**

