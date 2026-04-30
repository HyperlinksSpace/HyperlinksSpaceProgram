/**
 * Delete one Telegram user and dependent rows (same order as
 * scripts/delete-telegram-user-for-retest.sql) so you can re-run onboarding /
 * wallet registration against Neon.
 *
 * From repo root:
 *   npx tsx scripts/delete-telegram-user-for-retest.ts
 *
 * Loads DATABASE_URL from `.env` then `.env.local` (see scripts/load-env.ts).
 * Requires migrated schema (`messages.telegram_username`). Run `npm run db:migrate` first
 * if your branch was created before that rename.
 *
 * Set TELEGRAM_USERNAME_TO_RESET to the Telegram @handle or normalized form;
 * it is passed through database/users.ts normalizeUsername (trim, strip @, lowercase).
 */
import { neon } from '@neondatabase/serverless';
import { loadEnv } from './load-env.js';

/** Telegram username to wipe from DB (e.g. Anriline or anriline — normalized before delete). */
const TELEGRAM_USERNAME_TO_RESET = 'anriltine';

async function main() {
  loadEnv();
  const databaseUrl = process.env.DATABASE_URL_PROD;
  if (!databaseUrl) {
    console.error('[db] DATABASE_URL is not set (.env / .env.local).');
    process.exitCode = 1;
    return;
  }

  const { normalizeUsername } = await import('../database/users.js');
  const un = normalizeUsername(TELEGRAM_USERNAME_TO_RESET);
  if (!un) {
    console.error(
      '[db] TELEGRAM_USERNAME_TO_RESET normalizes to an empty string.',
    );
    process.exitCode = 1;
    return;
  }

  const sql = neon(databaseUrl);
  await sql.transaction([
    sql`DELETE FROM auth_sessions WHERE telegram_username = ${un}`,
    sql`DELETE FROM auth_identities WHERE telegram_username = ${un}`,
    sql`DELETE FROM messages WHERE telegram_username = ${un}`,
    sql`DELETE FROM pending_transactions WHERE telegram_username = ${un}`,
    sql`DELETE FROM wallets WHERE telegram_username = ${un}`,
    sql`DELETE FROM auth_login_events WHERE telegram_username = ${un}`,
    sql`DELETE FROM users WHERE telegram_username = ${un}`,
  ]);

  console.log(`[db] Reset complete for telegram_username=${un}`);
}

void main().catch((err) => {
  console.error('[db] Fatal', err);
  process.exit(1);
});
