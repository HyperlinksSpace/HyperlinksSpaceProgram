import type { DllrLedgerKind } from "./dllrLedgerKind.js";

export type DllrLedgerAmounts = {
  username: string;
  hotUsd: number;
  frozenUsd: number;
};

export type DllrSameKindTransferResult =
  | {
      ok: true;
      from: DllrLedgerAmounts;
      to: DllrLedgerAmounts;
      amountUsd: number;
    }
  | { ok: false; error: string };

function roundUsd(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

function parseUsd(raw: unknown): number {
  const n = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(n) && n >= 0 ? roundUsd(n) : 0;
}

/**
 * Pure ledger math for a same-kind DLLR transfer (hot→hot or frozen→frozen).
 */
export function applyDllrSameKindTransfer(input: {
  from: DllrLedgerAmounts;
  to: DllrLedgerAmounts;
  amountUsd: number;
  ledgerKind: DllrLedgerKind;
}): DllrSameKindTransferResult {
  const amountUsd = parseUsd(input.amountUsd);
  if (!(amountUsd > 0)) return { ok: false, error: "invalid_amount" };

  const fromUser = input.from.username;
  const toUser = input.to.username;
  if (!fromUser || !toUser) return { ok: false, error: "username_required" };
  if (fromUser === toUser) return { ok: false, error: "cannot_send_to_self" };

  const kind = input.ledgerKind;
  const fromAvailable = kind === "hot" ? input.from.hotUsd : input.from.frozenUsd;
  if (fromAvailable + 1e-9 < amountUsd) {
    return { ok: false, error: "insufficient_dllr" };
  }

  const nextFrom: DllrLedgerAmounts =
    kind === "hot"
      ? {
          username: fromUser,
          hotUsd: roundUsd(input.from.hotUsd - amountUsd),
          frozenUsd: input.from.frozenUsd,
        }
      : {
          username: fromUser,
          hotUsd: input.from.hotUsd,
          frozenUsd: roundUsd(input.from.frozenUsd - amountUsd),
        };

  const nextTo: DllrLedgerAmounts =
    kind === "hot"
      ? {
          username: toUser,
          hotUsd: roundUsd(input.to.hotUsd + amountUsd),
          frozenUsd: input.to.frozenUsd,
        }
      : {
          username: toUser,
          hotUsd: input.to.hotUsd,
          frozenUsd: roundUsd(input.to.frozenUsd + amountUsd),
        };

  return { ok: true, from: nextFrom, to: nextTo, amountUsd };
}
