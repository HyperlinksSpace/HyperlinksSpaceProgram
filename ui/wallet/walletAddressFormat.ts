import { layout } from "../theme";

const AH = layout.authenticatedHome;

export function trimWalletAddress(address: string): string {
  return address.replace(/\s+/g, "").trim();
}

/**
 * Same format as the switch-wallet list: `UQBY1Y...gM-NF8` (head…tail, original casing).
 */
export function walletAddressMiddleEllipsis(
  address: string,
  head = AH.walletAddressSnippetHeadLength ?? 6,
  tail = AH.walletAddressSnippetTailLength ?? 6,
): string {
  const trimmed = trimWalletAddress(address);
  if (!trimmed) return AH.walletAddressSnippetPlaceholder;
  if (trimmed.length <= head + tail + 3) return trimmed;
  return `${trimmed.slice(0, head)}...${trimmed.slice(-tail)}`;
}

/** Header / dialog address chip — matches wallets list middle-ellipsis format. */
export function walletAddressHeaderSnippet(trimmed: string): string {
  return walletAddressMiddleEllipsis(trimmed);
}

/** Centered copyable address lines (prev-main get page uses ~12 chars per row). */
export function walletAddressDisplayLines(trimmed: string, chunkSize = 12): string[] {
  if (!trimmed) return [AH.walletAddressSnippetPlaceholder];
  const lines: string[] = [];
  for (let i = 0; i < trimmed.length; i += chunkSize) {
    lines.push(trimmed.slice(i, i + chunkSize));
  }
  return lines;
}
