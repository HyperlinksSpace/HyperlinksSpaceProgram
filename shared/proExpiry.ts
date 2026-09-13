/**
 * Pro subscription period math + display labels (client + server).
 */

const MONTH_ABBR_LOWER = [
  "jan",
  "feb",
  "mar",
  "apr",
  "may",
  "jun",
  "jul",
  "aug",
  "sep",
  "oct",
  "nov",
  "dec",
] as const;

/**
 * Add calendar months without JS month-end overflow (Jan 31 + 1 → Feb 28/29).
 */
export function addCalendarMonths(from: Date, months: number): Date {
  const start = new Date(from.getTime());
  if (!Number.isFinite(start.getTime())) return start;
  const m = Math.trunc(months);
  if (!Number.isFinite(m) || m === 0) return start;

  const day = start.getDate();
  const target = new Date(start.getTime());
  target.setDate(1);
  target.setMonth(target.getMonth() + m);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(day, lastDay));
  target.setHours(
    start.getHours(),
    start.getMinutes(),
    start.getSeconds(),
    start.getMilliseconds(),
  );
  return target;
}

/**
 * Expiry = now + months (calendar months from the purchase/start instant).
 * Call sites that must not shorten an existing entitlement should take
 * `max(existingExpiresAt, this)`.
 */
export function computeProExpiresAtIso(opts: {
  months: number;
  nowMs?: number;
}): string {
  const months = Math.max(1, Math.trunc(Number(opts.months) || 1));
  const nowMs = typeof opts.nowMs === "number" && Number.isFinite(opts.nowMs) ? opts.nowMs : Date.now();
  return addCalendarMonths(new Date(nowMs), months).toISOString();
}

/** Prefer the later of two ISO expiry timestamps (ignore invalid / past). */
export function laterProExpiresAtIso(
  a: string | null | undefined,
  b: string | null | undefined,
): string | null {
  const am = typeof a === "string" && a.trim() ? Date.parse(a) : NaN;
  const bm = typeof b === "string" && b.trim() ? Date.parse(b) : NaN;
  const aOk = Number.isFinite(am) && am > Date.now();
  const bOk = Number.isFinite(bm) && bm > Date.now();
  if (aOk && bOk) return am >= bm ? (a as string).trim() : (b as string).trim();
  if (aOk) return (a as string).trim();
  if (bOk) return (b as string).trim();
  return null;
}

/**
 * Local calendar label: `7 aug 2026` (day + lowercase month abbr + year).
 */
export function formatProExpiryDateLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const month = MONTH_ABBR_LOWER[d.getMonth()] ?? "jan";
  return `${d.getDate()} ${month} ${d.getFullYear()}`;
}
