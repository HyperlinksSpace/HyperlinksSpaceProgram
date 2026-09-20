/** Founder / operator accounts that must not appear in Pro sales analytics. */
export const FOUNDER_PRO_SALES_USERNAMES = ["anriltine"] as const;

/** Test grants and $0.01 DLLR taps are not paid customers. */
export const MIN_PAID_PRO_SALE_USD = 1;

export function normalizeProSalesUsername(username: string): string {
  return username.trim().replace(/^@+/g, "").toLowerCase();
}

function extraExcludedUsernames(): string[] {
  const raw = process.env.FOUNDER_SALES_EXCLUDE_USERNAMES ?? "";
  return raw
    .split(/[,;\s]+/)
    .map(normalizeProSalesUsername)
    .filter(Boolean);
}

export function isFounderProSalesUsername(username: string): boolean {
  const u = normalizeProSalesUsername(username);
  if (!u) return true;
  if ((FOUNDER_PRO_SALES_USERNAMES as readonly string[]).includes(u)) return true;
  return extraExcludedUsernames().includes(u);
}

export function isCustomerPaidProSale(username: string, priceUsd: number): boolean {
  const price = Number(priceUsd);
  return (
    Number.isFinite(price) &&
    price >= MIN_PAID_PRO_SALE_USD &&
    !isFounderProSalesUsername(username)
  );
}
