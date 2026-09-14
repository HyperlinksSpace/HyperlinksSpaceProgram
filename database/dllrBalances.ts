/**
 * Per-user DLLR (Dollars) ledger — hot (spendable) + frozen.
 * Keyed by users.telegram_username (same id as sessions / wallets).
 */
import { Address } from "@ton/core";
import { sql } from "./start.js";
import { normalizeUsername } from "./users.js";
import { findUsernamesByWalletAddress } from "./wallets.js";

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

/** Find the HSP account that owns a built-in wallet address (EQ/UQ/raw forms). */
export async function findUsernameByBuiltinWalletAddress(
  walletAddress: string,
): Promise<string | null> {
  const trimmed = walletAddress.trim();
  if (!trimmed) return null;

  const direct = await findUsernamesByWalletAddress(trimmed);
  if (direct[0]) return direct[0]!;

  try {
    const addr = Address.parse(trimmed);
    const variants = [
      addr.toString({ urlSafe: true, bounceable: false }),
      addr.toString({ urlSafe: true, bounceable: true }),
      addr.toRawString(),
    ];
    for (const variant of variants) {
      if (variant.toLowerCase() === trimmed.toLowerCase()) continue;
      const found = await findUsernamesByWalletAddress(variant);
      if (found[0]) return found[0]!;
    }
  } catch {
    /* invalid address */
  }
  return null;
}

export type TransferDllrResult =
  | {
      ok: true;
      from: DllrLedgerRow;
      to: DllrLedgerRow;
      amountUsd: number;
    }
  | { ok: false; error: string };

/**
 * Move DLLR between two built-in ledger accounts (hot first, then frozen on debit;
 * credit always lands in recipient hot).
 */
export async function transferDllrBetweenUsernames(input: {
  fromUsername: string;
  toUsername: string;
  amountUsd: number;
}): Promise<TransferDllrResult> {
  const fromUser = normalizeUsername(input.fromUsername);
  const toUser = normalizeUsername(input.toUsername);
  const amountUsd = parseUsd(input.amountUsd);

  if (!fromUser || !toUser) return { ok: false, error: "username_required" };
  if (fromUser === toUser) return { ok: false, error: "cannot_send_to_self" };
  if (!(amountUsd > 0)) return { ok: false, error: "invalid_amount" };

  const fromLedger = (await getDllrLedgerForUsername(fromUser)) ?? {
    username: fromUser,
    hotUsd: 0,
    frozenUsd: 0,
  };
  const total = roundUsd(fromLedger.hotUsd + fromLedger.frozenUsd);
  if (total + 1e-9 < amountUsd) {
    return { ok: false, error: "insufficient_dllr" };
  }

  let left = amountUsd;
  const fromHotDebit = Math.min(fromLedger.hotUsd, left);
  left = roundUsd(left - fromHotDebit);
  const fromFrozenDebit = left > 0 ? Math.min(fromLedger.frozenUsd, left) : 0;

  const nextFrom: DllrLedgerRow = {
    username: fromUser,
    hotUsd: roundUsd(fromLedger.hotUsd - fromHotDebit),
    frozenUsd: roundUsd(fromLedger.frozenUsd - fromFrozenDebit),
  };

  const toLedger = (await getDllrLedgerForUsername(toUser)) ?? {
    username: toUser,
    hotUsd: 0,
    frozenUsd: 0,
  };
  const nextTo: DllrLedgerRow = {
    username: toUser,
    hotUsd: roundUsd(toLedger.hotUsd + amountUsd),
    frozenUsd: toLedger.frozenUsd,
  };

  await setDllrLedgerForUsername(nextFrom);
  await setDllrLedgerForUsername(nextTo);

  return { ok: true, from: nextFrom, to: nextTo, amountUsd };
}
