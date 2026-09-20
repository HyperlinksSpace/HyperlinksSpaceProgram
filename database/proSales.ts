/**
 * Pro Access sales ledger for founder analytics.
 */
import { sql } from "./start.js";
import {
  isCustomerPaidProSale,
  MIN_PAID_PRO_SALE_USD,
} from "./proSalesExclude.js";

function asNum(raw: unknown): number {
  if (typeof raw === "bigint") return Number(raw);
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string" && raw.trim()) {
    const n = Number(raw);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function asIso(raw: unknown): string | null {
  if (raw == null) return null;
  if (raw instanceof Date) {
    const t = raw.getTime();
    return Number.isNaN(t) ? null : raw.toISOString();
  }
  const s = String(raw).trim();
  if (!s) return null;
  const d = new Date(s.includes("T") ? s : s.replace(" ", "T"));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function dayKeyUtc(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export type ProSalePlanId = "month" | "quarter" | "year";

export type ProSaleRow = {
  id: number;
  username: string;
  planId: ProSalePlanId;
  priceUsd: number;
  months: number;
  expiresAt: string | null;
  createdAt: string;
  paymentMemo: string | null;
};

export type ProSalesSnapshot = {
  tablesExist: boolean;
  totalSales: number;
  totalRevenueUsd: number;
  activeSubscribers: number;
  last7d: { sales: number; revenueUsd: number };
  last30d: { sales: number; revenueUsd: number };
  byPlan: Array<{ planId: ProSalePlanId; sales: number; revenueUsd: number }>;
  dailyLast30d: Array<{ day: string; sales: number; revenueUsd: number }>;
  recent: ProSaleRow[];
};

let tableReady: Promise<void> | null = null;

/**
 * Drop near-duplicate sale rows (same user/plan/price/months/expiry within 2 minutes),
 * keeping the earliest id. Cleans recover+client double-records.
 */
async function dedupeDuplicateProSales(): Promise<void> {
  await sql`
    DELETE FROM pro_sales a
    USING pro_sales b
    WHERE a.id > b.id
      AND lower(regexp_replace(trim(a.username), '^@+', ''))
        = lower(regexp_replace(trim(b.username), '^@+', ''))
      AND a.plan_id = b.plan_id
      AND a.months = b.months
      AND ABS(a.price_usd - b.price_usd) < 0.01
      AND COALESCE(a.expires_at, 'epoch'::timestamptz)
        = COALESCE(b.expires_at, 'epoch'::timestamptz)
      AND ABS(EXTRACT(EPOCH FROM (a.created_at - b.created_at))) < 86400
  `;
}

/** Drop founder test grants and unpaid $0.00/$0.01 rows from the paid ledger. */
async function scrubNonCustomerProSales(): Promise<void> {
  await sql`
    DELETE FROM pro_sales
    WHERE lower(regexp_replace(trim(username), '^@+', '')) = 'anriltine'
  `;
  await sql`
    DELETE FROM pro_sales
    WHERE price_usd < ${MIN_PAID_PRO_SALE_USD}
  `;
}

export async function ensureProSalesTable(): Promise<void> {
  if (!tableReady) {
    tableReady = (async () => {
      await sql`
        CREATE TABLE IF NOT EXISTS pro_sales (
          id BIGSERIAL PRIMARY KEY,
          username TEXT NOT NULL,
          plan_id TEXT NOT NULL,
          price_usd DOUBLE PRECISION NOT NULL,
          months INT NOT NULL,
          expires_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `;
      await sql`
        ALTER TABLE pro_sales
        ADD COLUMN IF NOT EXISTS payment_memo TEXT
      `;
      await sql`
        CREATE INDEX IF NOT EXISTS pro_sales_created_at_idx
        ON pro_sales (created_at DESC)
      `;
      await sql`
        CREATE INDEX IF NOT EXISTS pro_sales_username_idx
        ON pro_sales (username)
      `;
      await sql`
        CREATE UNIQUE INDEX IF NOT EXISTS pro_sales_payment_memo_uidx
        ON pro_sales (payment_memo)
        WHERE payment_memo IS NOT NULL AND length(trim(payment_memo)) > 0
      `;
      await dedupeDuplicateProSales();
      await scrubNonCustomerProSales();
      await dedupeDuplicateProSales();
    })().catch((err) => {
      tableReady = null;
      throw err;
    });
  }
  await tableReady;
}

function normalizePlanId(raw: unknown): ProSalePlanId {
  const s = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (s === "quarter" || s === "year" || s === "month") return s;
  return "month";
}

function mapSaleRow(
  row: Record<string, unknown>,
  fallback?: { username: string; planId: ProSalePlanId; priceUsd: number; months: number },
): ProSaleRow {
  return {
    id: asNum(row.id),
    username: String(row.username ?? fallback?.username ?? ""),
    planId: normalizePlanId(row.plan_id ?? fallback?.planId),
    priceUsd: asNum(row.price_usd) || fallback?.priceUsd || 0,
    months: asNum(row.months) || fallback?.months || 1,
    expiresAt: asIso(row.expires_at),
    createdAt: asIso(row.created_at) ?? new Date().toISOString(),
    paymentMemo:
      typeof row.payment_memo === "string" && row.payment_memo.trim()
        ? row.payment_memo.trim()
        : null,
  };
}

export async function recordProSale(opts: {
  username: string;
  planId: string;
  priceUsd: number;
  months: number;
  expiresAt: string | null;
  /** When set, at most one sale row per memo (idempotent activate/recover). */
  paymentMemo?: string | null;
}): Promise<ProSaleRow | null> {
  const username = opts.username.trim();
  if (!username) return null;
  const priceUsd = Number(opts.priceUsd);
  if (!Number.isFinite(priceUsd) || priceUsd < 0) return null;
  if (!isCustomerPaidProSale(username, priceUsd)) return null;
  const months = Math.max(1, Math.trunc(Number(opts.months) || 1));
  const planId = normalizePlanId(opts.planId);
  const expiresAt =
    opts.expiresAt && Date.parse(opts.expiresAt) > Date.now() ? opts.expiresAt : null;
  const paymentMemo =
    typeof opts.paymentMemo === "string" && opts.paymentMemo.trim()
      ? opts.paymentMemo.trim()
      : null;

  await ensureProSalesTable();

  if (paymentMemo) {
    const existing = await sql`
      SELECT id, username, plan_id, price_usd, months, expires_at, created_at, payment_memo
      FROM pro_sales
      WHERE payment_memo = ${paymentMemo}
      LIMIT 1
    `;
    const hit = existing[0] as Record<string, unknown> | undefined;
    if (hit) {
      return mapSaleRow(hit, { username, planId, priceUsd, months });
    }
  } else {
    // DLLR / founder grants without memo: collapse rapid double-inserts.
    const recent = await sql`
      SELECT id, username, plan_id, price_usd, months, expires_at, created_at, payment_memo
      FROM pro_sales
      WHERE username = ${username}
        AND plan_id = ${planId}
        AND months = ${months}
        AND ABS(price_usd - ${priceUsd}) < 0.0001
        AND created_at >= NOW() - INTERVAL '2 minutes'
      ORDER BY id ASC
      LIMIT 1
    `;
    const hit = recent[0] as Record<string, unknown> | undefined;
    if (hit) {
      return mapSaleRow(hit, { username, planId, priceUsd, months });
    }
  }

  try {
    const rows = await sql`
      INSERT INTO pro_sales (username, plan_id, price_usd, months, expires_at, created_at, payment_memo)
      VALUES (
        ${username},
        ${planId},
        ${priceUsd},
        ${months},
        ${expiresAt},
        NOW(),
        ${paymentMemo}
      )
      RETURNING id, username, plan_id, price_usd, months, expires_at, created_at, payment_memo
    `;
    const row = rows[0] as Record<string, unknown> | undefined;
    if (!row) return null;
    return mapSaleRow(row, { username, planId, priceUsd, months });
  } catch (err) {
    // Unique memo race: return the winner row.
    if (paymentMemo) {
      const existing = await sql`
        SELECT id, username, plan_id, price_usd, months, expires_at, created_at, payment_memo
        FROM pro_sales
        WHERE payment_memo = ${paymentMemo}
        LIMIT 1
      `;
      const hit = existing[0] as Record<string, unknown> | undefined;
      if (hit) return mapSaleRow(hit, { username, planId, priceUsd, months });
    }
    throw err;
  }
}

/** One-shot cleanup for founder tools / migrations. */
export async function clearDuplicateProSales(): Promise<{ deleted: number }> {
  await ensureProSalesTable();
  const before = await sql`SELECT COUNT(*)::int AS n FROM pro_sales`;
  await dedupeDuplicateProSales();
  const after = await sql`SELECT COUNT(*)::int AS n FROM pro_sales`;
  const b = asNum((before[0] as Record<string, unknown> | undefined)?.n);
  const a = asNum((after[0] as Record<string, unknown> | undefined)?.n);
  return { deleted: Math.max(0, b - a) };
}

export async function getProSalesSnapshot(): Promise<ProSalesSnapshot> {
  const empty: ProSalesSnapshot = {
    tablesExist: false,
    totalSales: 0,
    totalRevenueUsd: 0,
    activeSubscribers: 0,
    last7d: { sales: 0, revenueUsd: 0 },
    last30d: { sales: 0, revenueUsd: 0 },
    byPlan: [
      { planId: "month", sales: 0, revenueUsd: 0 },
      { planId: "quarter", sales: 0, revenueUsd: 0 },
      { planId: "year", sales: 0, revenueUsd: 0 },
    ],
    dailyLast30d: [],
    recent: [],
  };

  try {
    await ensureProSalesTable();
  } catch {
    return empty;
  }

  await scrubNonCustomerProSales();
  await dedupeDuplicateProSales();

  const [totals, week, month, byPlanRows, dailyRows, recentRows, activeRows] =
    await Promise.all([
      sql`
        SELECT COUNT(*)::int AS sales, COALESCE(SUM(price_usd), 0)::float AS revenue
        FROM pro_sales
        WHERE price_usd >= ${MIN_PAID_PRO_SALE_USD}
          AND lower(regexp_replace(trim(username), '^@+', '')) <> 'anriltine'
      `,
      sql`
        SELECT COUNT(*)::int AS sales, COALESCE(SUM(price_usd), 0)::float AS revenue
        FROM pro_sales
        WHERE created_at >= NOW() - INTERVAL '7 days'
          AND price_usd >= ${MIN_PAID_PRO_SALE_USD}
          AND lower(regexp_replace(trim(username), '^@+', '')) <> 'anriltine'
      `,
      sql`
        SELECT COUNT(*)::int AS sales, COALESCE(SUM(price_usd), 0)::float AS revenue
        FROM pro_sales
        WHERE created_at >= NOW() - INTERVAL '30 days'
          AND price_usd >= ${MIN_PAID_PRO_SALE_USD}
          AND lower(regexp_replace(trim(username), '^@+', '')) <> 'anriltine'
      `,
      sql`
        SELECT plan_id, COUNT(*)::int AS sales, COALESCE(SUM(price_usd), 0)::float AS revenue
        FROM pro_sales
        WHERE price_usd >= ${MIN_PAID_PRO_SALE_USD}
          AND lower(regexp_replace(trim(username), '^@+', '')) <> 'anriltine'
        GROUP BY plan_id
      `,
      sql`
        SELECT
          to_char(date_trunc('day', created_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS day,
          COUNT(*)::int AS sales,
          COALESCE(SUM(price_usd), 0)::float AS revenue
        FROM pro_sales
        WHERE created_at >= NOW() - INTERVAL '30 days'
          AND price_usd >= ${MIN_PAID_PRO_SALE_USD}
          AND lower(regexp_replace(trim(username), '^@+', '')) <> 'anriltine'
        GROUP BY 1
        ORDER BY 1 ASC
      `,
      sql`
        SELECT id, username, plan_id, price_usd, months, expires_at, created_at, payment_memo
        FROM pro_sales
        WHERE price_usd >= ${MIN_PAID_PRO_SALE_USD}
          AND lower(regexp_replace(trim(username), '^@+', '')) <> 'anriltine'
        ORDER BY created_at DESC
        LIMIT 50
      `,
      sql`
        SELECT COUNT(DISTINCT lower(regexp_replace(trim(username), '^@+', '')))::int AS n
        FROM pro_sales
        WHERE price_usd >= ${MIN_PAID_PRO_SALE_USD}
          AND lower(regexp_replace(trim(username), '^@+', '')) <> 'anriltine'
          AND (expires_at IS NULL OR expires_at > NOW())
      `,
    ]);

  const byPlanMap: Record<ProSalePlanId, { sales: number; revenueUsd: number }> = {
    month: { sales: 0, revenueUsd: 0 },
    quarter: { sales: 0, revenueUsd: 0 },
    year: { sales: 0, revenueUsd: 0 },
  };
  for (const row of byPlanRows as Array<Record<string, unknown>>) {
    const id = normalizePlanId(row.plan_id);
    byPlanMap[id] = { sales: asNum(row.sales), revenueUsd: asNum(row.revenue) };
  }

  const dailyMap = new Map<string, { sales: number; revenueUsd: number }>();
  for (const row of dailyRows as Array<Record<string, unknown>>) {
    const day = String(row.day ?? "").slice(0, 10);
    if (!day) continue;
    dailyMap.set(day, { sales: asNum(row.sales), revenueUsd: asNum(row.revenue) });
  }
  const dailyLast30d: ProSalesSnapshot["dailyLast30d"] = [];
  const today = new Date();
  for (let i = 29; i >= 0; i -= 1) {
    const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
    d.setUTCDate(d.getUTCDate() - i);
    const key = dayKeyUtc(d);
    const hit = dailyMap.get(key);
    dailyLast30d.push({
      day: key,
      sales: hit?.sales ?? 0,
      revenueUsd: hit?.revenueUsd ?? 0,
    });
  }

  const recent: ProSaleRow[] = (recentRows as Array<Record<string, unknown>>)
    .map((row) => mapSaleRow(row))
    .filter((row) => isCustomerPaidProSale(row.username, row.priceUsd));

  return {
    tablesExist: true,
    totalSales: asNum((totals[0] as Record<string, unknown> | undefined)?.sales),
    totalRevenueUsd: asNum((totals[0] as Record<string, unknown> | undefined)?.revenue),
    activeSubscribers: asNum((activeRows[0] as Record<string, unknown> | undefined)?.n),
    last7d: {
      sales: asNum((week[0] as Record<string, unknown> | undefined)?.sales),
      revenueUsd: asNum((week[0] as Record<string, unknown> | undefined)?.revenue),
    },
    last30d: {
      sales: asNum((month[0] as Record<string, unknown> | undefined)?.sales),
      revenueUsd: asNum((month[0] as Record<string, unknown> | undefined)?.revenue),
    },
    byPlan: (["month", "quarter", "year"] as const).map((planId) => ({
      planId,
      sales: byPlanMap[planId].sales,
      revenueUsd: byPlanMap[planId].revenueUsd,
    })),
    dailyLast30d,
    recent,
  };
}
