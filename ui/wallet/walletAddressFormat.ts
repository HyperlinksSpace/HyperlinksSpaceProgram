import { layout } from "../theme";

const AH = layout.authenticatedHome;

export function trimWalletAddress(address: string): string {
  return address.replace(/\s+/g, "").trim();
}

/** Same snippet as authenticated home header: `..` + last N chars (lowercase). */
export function walletAddressHeaderSnippet(trimmed: string): string {
  if (trimmed.length === 0) return AH.walletAddressSnippetPlaceholder;
  const tail = trimmed.slice(-AH.walletAddressSnippetTailLength).toLowerCase();
  return `${AH.walletAddressSnippetPrefix}${tail}`;
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
