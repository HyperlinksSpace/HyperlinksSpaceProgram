# Scalability overview and challenges

**Stack:** Vercel serverless (webhook, API), Neon Postgres, Telegram bot (Grammy), OpenAI, single `messages` table for bot + TMA.

---

## Overview

- **Webhook:** Stateless. Returns 200 immediately; update is processed in `waitUntil`. No in-memory state between requests. Vercel scales out with traffic (more concurrent requests → more instances).
- **Bot:** One bot instance per serverless instance (module-level in webhook). No global singleton; fits serverless.
- **Dedupe / “only latest wins”:** Done in the DB (`telegram_update_id` unique constraint + `getMaxTelegramUpdateIdForThread`). Works across instances; no reliance on in-process state.
- **Messages:** One table, indexed by `(user_telegram, thread_id, type, created_at)` and unique on `(..., telegram_update_id)` for bot. Per-request load is small (insert user, get history, insert assistant, optional max-update-id read).
- **Database:** Neon with **connection pooling** already on (supports up to 10,000 concurrent connections). Use the pooled `DATABASE_URL` in Vercel so serverless invocations go through the pooler.

The design is horizontally scalable: more users → more invocations → more instances; no single bottleneck in the app logic.

---

## Challenges and what to do

| Area | Challenge | What to do |
|------|-----------|------------|
| **DB connections** | Pooling is already on (up to 10,000 concurrent connections). | Ensure `DATABASE_URL` in Vercel is the **pooled** connection string from Neon. |
| **OpenAI** | Limits are per key (RPM/TPM). One key can scale. | Raise **usage tier** (limits increase with spend/account age—e.g. Tier 4: 10k RPM, 2M TPM). Enterprise: **Scale Tier** for dedicated capacity. Optionally multiple keys or queue only if you need beyond tier limits. |
| **Vercel** | Hobby has invocation/duration limits; long AI flows need enough timeout. | Use Pro (or Enterprise) for production at scale; set function timeout to cover longest flow (e.g. streaming + DB). |
| **Messages table** | Grows with users and time; very large tables can slow queries and increase cost. | Retention (delete or archive old threads); optional partitioning by time or user; keep `getThreadHistory` with a small `limit`. |
| **Observability** | At scale, bottlenecks and errors are hard to see without metrics. | Logging, metrics, and alerts (errors, latency, DB pool usage, OpenAI rate limits) in Vercel/Neon or a third-party tool. |

---

## Summary

- **Scalable:** Stateless webhook, 200-first response, DB-backed dedupe and history, Neon connection pooling.
- **To scale to very high traffic:** Neon pooling is already on (10k connections); keep using the pooled `DATABASE_URL`. For OpenAI, extend plan/usage to reach a higher tier (or Scale Tier for enterprise); one key is enough. Plan for Vercel limits/timeouts; add message retention and monitoring.
