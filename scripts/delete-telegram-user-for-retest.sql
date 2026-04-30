-- Reset one Telegram user in Postgres so you can re-run onboarding / wallet flow from scratch.
--
-- Username normalization matches database/users.ts::normalizeUsername:
--   trim, strip leading "@", lowercase — e.g. Anriline -> anriline
--
-- Schema must include messages.telegram_username (run `npm run db:migrate` from repo root if needed).
--
-- Edit ONLY the line: un text := '...';
--
-- Run against your Neon branch — SQL Editor in Console, or:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/delete-telegram-user-for-retest.sql
-- Node alternative (loads DATABASE_URL from .env): npx tsx scripts/delete-telegram-user-for-retest.ts
--
-- Order respects FKs: sessions, identities, messages, pending tx, wallets, audit rows, then users.

BEGIN;

DO $$
DECLARE
  un text := 'anriline'; -- <<< normalized Telegram username (no @, lowercase)
BEGIN
  DELETE FROM auth_sessions WHERE telegram_username = un;
  DELETE FROM auth_identities WHERE telegram_username = un;
  DELETE FROM messages WHERE telegram_username = un;
  DELETE FROM pending_transactions WHERE telegram_username = un;
  DELETE FROM wallets WHERE telegram_username = un;
  DELETE FROM auth_login_events WHERE telegram_username = un;
  DELETE FROM users WHERE telegram_username = un;
END $$;

COMMIT;
