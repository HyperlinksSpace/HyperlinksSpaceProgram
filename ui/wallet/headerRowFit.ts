/** Header identity: prefer the full name, then first token, then hide. */
export function pickHeaderDisplayName(options: {
  fullName: string | null;
  firstName: string | null;
  availablePx: number;
  fullNameWidthPx: number;
  firstNameWidthPx: number;
}): string | null {
  const full = options.fullName?.trim() || null;
  const first = options.firstName?.trim() || full;
  if (!full) return null;
  const availablePx = options.availablePx;
  const fullW = options.fullNameWidthPx;
  const firstW = options.firstNameWidthPx;
  if (!(availablePx > 0)) return first;
  if (fullW > 0 && fullW <= availablePx) return full;
  if (firstW > 0 && firstW <= availablePx) return first;
  if (fullW <= 0 && firstW <= 0) return first;
  return null;
}

export const HEADER_AMOUNT_FONT_MAX_PX = 30;
export const HEADER_AMOUNT_FONT_MIN_PX = 12;

/** Shrink amount digits to fit the slot; never clip/abbreviate the numeric string. */
export function fitHeaderAmountFontSize(
  naturalWidthPx: number,
  availableWidthPx: number,
  maxPx = HEADER_AMOUNT_FONT_MAX_PX,
  minPx = HEADER_AMOUNT_FONT_MIN_PX,
): number {
  if (!(naturalWidthPx > 0) || !(availableWidthPx > 0) || naturalWidthPx <= availableWidthPx) {
    return maxPx;
  }
  return Math.max(minPx, Math.floor((availableWidthPx / naturalWidthPx) * maxPx));
}
