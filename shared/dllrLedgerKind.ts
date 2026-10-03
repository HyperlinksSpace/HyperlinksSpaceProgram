/** Built-in DLLR ledger leg: spendable (hot) vs registration/locked (frozen). */
export type DllrLedgerKind = "hot" | "frozen";

export function parseDllrLedgerKind(raw: unknown): DllrLedgerKind | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim().toLowerCase();
  if (value === "hot" || value === "frozen") return value;
  return null;
}
