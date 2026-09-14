/**
 * Per-user DLLR (Dollars) ledger — hot (spendable) + frozen.
 * Keyed by users.telegram_username (same id as sessions / wallets).
 */
import { sql } from "./start.js";
import { normalizeUsername } from "./users.js";

export type DllrLedgerRow = {
  username: string;
  hotUsd: number;
  frozenUsd: number;
};

function roundUsd(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

function parseUsd(raw: unknown): number {
  const n = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(n) && n >= 0 ? roundUsd(n) : 0;
}

export async function getDllrLedgerForUsername(
  telegramUsername: string,
): Promise<DllrLedgerRow | null> {
  const u = normalizeUsername(telegramUsername);
  if (!u) return null;
  const rows = (await sql`
    SELECT telegram_username, hot_usd, frozen_usd
    FROM user_dllr_balances
    WHERE telegram_username = ${u}
    LIMIT 1
  `) as Array<{ telegram_username?: unknown; hot_usd?: unknown; frozen_usd?: unknown }>;
  const row = rows[0];
  if (!row) return null;
  return {
    username: u,
    hotUsd: parseUsd(row.hot_usd),
    frozenUsd: parseUsd(row.frozen_usd),
  };
}

/** Upsert absolute hot/frozen balances for a user. */
export async function setDllrLedgerForUsername(input: {
  telegramUsername: string;
  hotUsd: number;
  frozenUsd?: number;
}): Promise<DllrLedgerRow> {
  const u = normalizeUsername(input.telegramUsername);
  if (!u) throw new Error("username_required");
  const hotUsd = parseUsd(input.hotUsd);
  const frozenUsd =
    input.frozenUsd === undefined ? 0 : parseUsd(input.frozenUsd);

  await sql`
    INSERT INTO user_dllr_balances (telegram_username, hot_usd, frozen_usd, updated_at)
    VALUES (${u}, ${hotUsd}, ${frozenUsd}, NOW())
    ON CONFLICT (telegram_username) DO UPDATE
    SET
      hot_usd = EXCLUDED.hot_usd,
      frozen_usd = EXCLUDED.frozen_usd,
      updated_at = NOW()
  `;

  return { username: u, hotUsd, frozenUsd };
}

/** Resolve app username(s) for an email (users.email or synthetic email_* login). */
export async function findUsernamesByEmail(email: string): Promise<string[]> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return [];
  const rows = (await sql`
    SELECT DISTINCT telegram_username
    FROM users
    WHERE lower(trim(email)) = ${normalized}
       OR lower(trim(login_subject)) = ${normalized}
    ORDER BY telegram_username ASC
    LIMIT 20
  `) as Array<{ telegram_username?: unknown }>;
  return rows
    .map((r) => normalizeUsername(r.telegram_username))
    .filter(Boolean);
}
