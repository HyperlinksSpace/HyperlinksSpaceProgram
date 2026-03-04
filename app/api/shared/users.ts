/**
 * User helpers shared by all API routes (and local bot).
 * Lives under api/shared so Vercel bundles it with serverless functions.
 */
import { sql } from '../db.js';

export function normalizeUsername(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  let s = raw.trim();
  if (s.startsWith('@')) s = s.slice(1);
  return s.toLowerCase();
}

export async function upsertUserFromTma(opts: {
  telegramUsername: string;
  locale: string | null;
}): Promise<void> {
  const { telegramUsername, locale } = opts;
  if (!telegramUsername) return;

  await sql`
    INSERT INTO users (telegram_username, locale, created_at, updated_at, last_tma_seen_at)
    VALUES (${telegramUsername}, ${locale}, NOW(), NOW(), NOW())
    ON CONFLICT (telegram_username) DO UPDATE
      SET locale        = EXCLUDED.locale,
          last_tma_seen_at = NOW(),
          updated_at    = NOW();
  `;
}

export async function upsertUserFromBot(opts: {
  telegramUsername: string;
  locale: string | null;
}): Promise<void> {
  const { telegramUsername, locale } = opts;
  if (!telegramUsername) return;

  await sql`
    INSERT INTO users (telegram_username, locale, created_at, updated_at, last_login_at)
    VALUES (${telegramUsername}, ${locale}, NOW(), NOW(), NOW())
    ON CONFLICT (telegram_username) DO UPDATE
      SET locale        = EXCLUDED.locale,
          last_login_at = NOW(),
          updated_at    = NOW();
  `;
}

