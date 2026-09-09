/**
 * Recover Pro Access when the user paid on-chain (memo in jetton comment) but
 * client sync_pro never landed (disconnect right after success UI).
 *
 * Runs on program launch (quota refresh): looks up this user's recent *issued*
 * memos, checks the treasury for a matching USDT credit, then activates Pro
 * and marks the memo activated so founder revoke stays sticky afterward.
 */
import {
  getAiFreeQuota,
  syncAiFreeQuotaPro,
  type AiFreeQuotaSnapshot,
} from "../../database/aiFreeQuota.js";
import {
  listIssuedProPaymentMemosForUser,
  markProPaymentMemoActivated,
  type ProPaymentMemoRow,
} from "../../database/proPaymentMemos.js";
import { recordProSale } from "../../database/proSales.js";
import { normalizeUsername } from "../../database/users.js";

const TONAPI_BASE = "https://tonapi.io/v2";
const USDT_MASTER = "0:b113a994b5024a16719f69139328eb759596c38a25f59028b146fecdc3621dfe";
const TREASURY_DEFAULT = "UQBY1YCIlm0cB00xcyaWV0xd_N-Zcgw_-6gWA3XUUNgM-NF8";

/** Per-user cooldown so quota polling does not hammer TonAPI. */
const lastRecoverAttemptMs = new Map<string, number>();
const RECOVER_COOLDOWN_MS = 45_000;

export type ProPaymentRecoverResult = {
  recovered: boolean;
  memo?: string;
  quota: AiFreeQuotaSnapshot;
};

function treasuryAddress(): string {
  return (
    process.env.EXPO_PUBLIC_PRO_PAYMENT_TON_ADDRESS?.trim() ||
    process.env.PRO_PAYMENT_TON_ADDRESS?.trim() ||
    TREASURY_DEFAULT
  );
}

function tonapiHeaders(): HeadersInit {
  const token = (process.env.TONAPI_KEY || process.env.EXPO_PUBLIC_TONAPI_KEY || "").trim();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function jettonMatchesMaster(jettonAddr: string, master: string): boolean {
  if (!master) return true;
  const j = jettonAddr.toLowerCase();
  const m = master.toLowerCase();
  if (!j) return true;
  if (j === m || j.includes(m.slice(0, 48))) return true;
  const raw = m.replace(/^0:/, "");
  return j.includes(raw.slice(0, 40));
}

function extractEventComment(action: Record<string, unknown>): string {
  const jt = action.JettonTransfer as Record<string, unknown> | undefined;
  if (jt) {
    for (const key of ["comment", "forward_payload", "payload"]) {
      const v = jt[key];
      if (typeof v === "string" && v.trim()) return v.trim();
    }
  }
  const simple = action.simple_preview as { description?: string } | undefined;
  if (typeof simple?.description === "string") return simple.description;
  return "";
}

type TreasuryCredit = {
  timestamp: number;
  amountNano: number;
  comment: string;
};

async function fetchTreasuryUsdtCredits(opts: {
  paymentAddress: string;
  sinceUnix: number;
}): Promise<TreasuryCredit[]> {
  const addr = opts.paymentAddress.trim();
  if (!addr) return [];
  try {
    const res = await fetch(
      `${TONAPI_BASE}/accounts/${encodeURIComponent(addr)}/events?limit=80`,
      { headers: tonapiHeaders() },
    );
    if (!res.ok) return [];
    const json = (await res.json()) as {
      events?: Array<{
        timestamp?: number;
        actions?: Array<Record<string, unknown>>;
      }>;
    };
    const out: TreasuryCredit[] = [];
    for (const ev of json.events ?? []) {
      const ts = typeof ev.timestamp === "number" ? ev.timestamp : 0;
      if (ts + 2 < opts.sinceUnix) continue;
      for (const action of ev.actions ?? []) {
        if (action.type !== "JettonTransfer" || !action.JettonTransfer) continue;
        const jt = action.JettonTransfer as {
          amount?: string | number;
          jetton?: { address?: string };
        };
        if (!jettonMatchesMaster(jt.jetton?.address ?? "", USDT_MASTER)) continue;
        const amtRaw = jt.amount;
        const amt =
          typeof amtRaw === "number"
            ? amtRaw
            : typeof amtRaw === "string"
              ? Number(amtRaw)
              : NaN;
        if (!Number.isFinite(amt) || amt <= 0) continue;
        out.push({
          timestamp: ts,
          amountNano: amt,
          comment: extractEventComment(action),
        });
      }
    }
    return out;
  } catch {
    return [];
  }
}

function creditMatchesMemo(credit: TreasuryCredit, memo: ProPaymentMemoRow): boolean {
  if (!credit.comment.includes(memo.memo)) return false;
  const expectedNano = Math.round(memo.priceUsd * 1e6);
  const tol = Math.max(1, Math.round(expectedNano * 0.002));
  return Math.abs(credit.amountNano - expectedNano) <= tol;
}

/**
 * If this user has paid for an issued memo that never activated, grant Pro now.
 * Safe to call on every launch; no-ops when nothing to recover.
 */
export async function recoverProFromPaidMemos(
  usernameRaw: string,
): Promise<ProPaymentRecoverResult> {
  const username = normalizeUsername(usernameRaw);
  const quota = await getAiFreeQuota(username);
  if (!username) return { recovered: false, quota };

  const now = Date.now();
  const last = lastRecoverAttemptMs.get(username) ?? 0;
  if (now - last < RECOVER_COOLDOWN_MS) {
    return { recovered: false, quota };
  }
  lastRecoverAttemptMs.set(username, now);

  const issued = await listIssuedProPaymentMemosForUser({
    username,
    withinDays: 14,
    limit: 10,
  });
  if (issued.length === 0) return { recovered: false, quota };

  const oldestCreated = Math.min(
    ...issued.map((m) => Date.parse(m.createdAt) || now),
  );
  // Small skew so index lag / clock drift still catches the transfer.
  const sinceUnix = Math.floor(oldestCreated / 1000) - 120;

  const credits = await fetchTreasuryUsdtCredits({
    paymentAddress: treasuryAddress(),
    sinceUnix,
  });
  if (credits.length === 0) return { recovered: false, quota };

  // Prefer newest paid memo (user may have retried).
  let matched: ProPaymentMemoRow | null = null;
  for (const memo of issued) {
    if (credits.some((c) => creditMatchesMemo(c, memo))) {
      matched = memo;
      break;
    }
  }
  if (!matched) return { recovered: false, quota };

  const expires = new Date();
  expires.setMonth(expires.getMonth() + matched.months);
  let expiresAt = expires.toISOString();
  if (
    quota.proExpiresAt &&
    Date.parse(quota.proExpiresAt) > Date.parse(expiresAt)
  ) {
    expiresAt = quota.proExpiresAt;
  }

  const nextQuota = await syncAiFreeQuotaPro({ username, expiresAt });
  try {
    await recordProSale({
      username,
      planId: matched.planId,
      priceUsd: matched.priceUsd,
      months: matched.months,
      expiresAt,
    });
  } catch {
    /* sales ledger must not block recovery */
  }
  await markProPaymentMemoActivated(matched.memo);

  return {
    recovered: true,
    memo: matched.memo,
    quota: nextQuota,
  };
}
