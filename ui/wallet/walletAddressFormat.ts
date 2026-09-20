/** Wallet address display helpers (pure — no React Native / theme imports). */

export function trimWalletAddress(address: string): string {
  return address.replace(/\s+/g, "").trim();
}

/** Preferred header address tail when the row has room (`..` + last five). */
export const WALLET_ADDRESS_HEADER_TAIL_LENGTH = 5;
/** Never show fewer than this many address characters after the dots. */
export const WALLET_ADDRESS_HEADER_TAIL_MIN_LENGTH = 2;
export const WALLET_ADDRESS_HEADER_DOTS = "..";
const ADDRESS_PLACEHOLDER = "…";

/**
 * Same format as the switch-wallet list: `UQBY1Y...gM-NF8` (head…tail, original casing).
 */
export function walletAddressMiddleEllipsis(
  address: string,
  head = 6,
  tail = 6,
): string {
  const trimmed = trimWalletAddress(address);
  if (!trimmed) return ADDRESS_PLACEHOLDER;
  if (trimmed.length <= head + tail + 3) return trimmed;
  return `${trimmed.slice(0, head)}...${trimmed.slice(-tail)}`;
}

/** Header / dialog address chip — `..` + last N symbols (default 5, never below 2). */
export function walletAddressHeaderSnippet(
  trimmed: string,
  tailLength = WALLET_ADDRESS_HEADER_TAIL_LENGTH,
): string {
  const value = trimWalletAddress(trimmed);
  if (!value) return ADDRESS_PLACEHOLDER;
  const tail = Math.max(
    WALLET_ADDRESS_HEADER_TAIL_MIN_LENGTH,
    Math.min(Math.floor(tailLength) || WALLET_ADDRESS_HEADER_TAIL_MIN_LENGTH, value.length),
  );
  if (value.length <= tail) return value;
  return `${WALLET_ADDRESS_HEADER_DOTS}${value.slice(-tail)}`;
}

/**
 * Pick address tail length for the header: prefer 5 when the identity slot can
 * still keep a one-letter name floor (+ explorer), otherwise step down to 2.
 */
export function fitHeaderAddressTailLength(options: {
  identitySlotPx: number;
  /** Approx mono glyph width (from measured snippet or estimate). */
  monoCharWidthPx: number;
  /** Reserved width for Tonviewer + gaps (0 when no address). */
  explorerChromePx: number;
  /** Reserved width so at least one name letter stays visible (0 when unnamed). */
  nameFloorPx: number;
  preferredTail?: number;
  minTail?: number;
}): number {
  const preferred = options.preferredTail ?? WALLET_ADDRESS_HEADER_TAIL_LENGTH;
  const minTail = options.minTail ?? WALLET_ADDRESS_HEADER_TAIL_MIN_LENGTH;
  const charW = Math.max(1, options.monoCharWidthPx);
  const dotsW = WALLET_ADDRESS_HEADER_DOTS.length * charW;
  const reserve = Math.max(0, options.explorerChromePx) + Math.max(0, options.nameFloorPx);
  const forSnippet = Math.max(0, options.identitySlotPx - reserve);

  for (let tail = preferred; tail >= minTail; tail -= 1) {
    if (dotsW + tail * charW <= forSnippet + 0.5) return tail;
  }
  return minTail;
}

/** Centered copyable address lines (prev-main get page uses ~12 chars per row). */
export function walletAddressDisplayLines(trimmed: string, chunkSize = 12): string[] {
  if (!trimmed) return [ADDRESS_PLACEHOLDER];
  const lines: string[] = [];
  for (let i = 0; i < trimmed.length; i += chunkSize) {
    lines.push(trimmed.slice(i, i + chunkSize));
  }
  return lines;
}
