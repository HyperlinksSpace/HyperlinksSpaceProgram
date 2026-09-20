/** Header identity: prefer the full name, then first token. Never hide below one letter. */
export function pickHeaderDisplayName(options: {
  fullName: string | null;
  firstName: string | null;
  availablePx: number;
  fullNameWidthPx: number;
  firstNameWidthPx: number;
  /** Width of the first glyph of `firstName` (floor when space is tight). */
  firstLetterWidthPx?: number;
  /** Slot has been measured; until then keep the first name so the label does not flash. */
  slotReady?: boolean;
  previous?: string | null;
}): string | null {
  const full = options.fullName?.trim() || null;
  const first = options.firstName?.trim() || full;
  if (!full || !first) return null;
  const firstLetter = first.slice(0, 1);
  const availablePx = options.availablePx;
  const fullW = options.fullNameWidthPx;
  const firstW = options.firstNameWidthPx;
  const letterW = Math.max(0, options.firstLetterWidthPx ?? 0);
  const previous = options.previous ?? null;
  const slotReady = options.slotReady !== false && availablePx > 0;
  if (!slotReady) {
    if (previous === first || previous === full || previous === firstLetter) return previous;
    return first;
  }
  const expandSlackPx = 28;
  const keepSlackPx = 8;
  const fullFits = fullW > 0 && fullW <= availablePx + keepSlackPx;
  const fullFitsExpand = fullW > 0 && fullW <= availablePx - expandSlackPx;
  if (previous === full && (fullFits || fullW <= 0)) return full;
  if (previous === first && firstW > 0 && firstW <= availablePx + keepSlackPx) return first;
  if (previous === first && fullW > 0 && !fullFitsExpand) {
    // First name itself no longer fits — floor to one letter, never blank.
    if (firstW > availablePx + keepSlackPx) return firstLetter;
    return first;
  }
  if (fullFits) return full;
  if (firstW > 0 && firstW <= availablePx + keepSlackPx) return first;
  // Tightest floor: keep one letter of the name visible.
  if (letterW > 0 && letterW > availablePx + keepSlackPx) return firstLetter;
  return firstLetter;
}

export const HEADER_AMOUNT_FONT_MAX_PX = 30;
export const HEADER_AMOUNT_FONT_MIN_PX = 12;

/**
 * Top system inset large enough to be a camera / Dynamic Island / punch-hole band
 * (not Telegram’s built-in close-button row alone).
 */
export const COMPACT_CAMERA_BAND_MIN_PX = 40;

/** Pin the compact wallet row only when a camera-style top inset is reserved. */
export function shouldStickCompactFirstHeaderRow(safeAreaInsetTopPx: number): boolean {
  return Math.max(0, safeAreaInsetTopPx) >= COMPACT_CAMERA_BAND_MIN_PX;
}

/**
 * Scroll distance before Feed/Messages locks. When the first row is not pinned,
 * it must scroll away with the collapsing bands first.
 */
export function compactNavStickAfterPx(options: {
  stickFirstRow: boolean;
  firstRowHeightPx: number;
  collapsibleHeightPx: number;
}): number {
  const collapsible = Math.max(0, options.collapsibleHeightPx);
  if (options.stickFirstRow) return collapsible;
  return Math.max(0, options.firstRowHeightPx) + collapsible;
}

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

export const HEADER_ACTION_ICON_COUNT = 5;
export const HEADER_ACTION_ICON_MAX_PX = 24;
export const HEADER_ACTION_ICON_MIN_PX = 12;
export const HEADER_ACTION_ICON_GAP_MAX_PX = 12;

/** Shrink copy/edit/key/language/exit together so they track width instead of clipping. */
export function fitHeaderActionIconSize(
  availableWidthPx: number,
  iconCount = HEADER_ACTION_ICON_COUNT,
  maxPx = HEADER_ACTION_ICON_MAX_PX,
  minPx = HEADER_ACTION_ICON_MIN_PX,
  gapMaxPx = HEADER_ACTION_ICON_GAP_MAX_PX,
): { sizePx: number; gapPx: number } {
  const count = Math.max(1, Math.floor(iconCount));
  const gaps = Math.max(0, count - 1);
  const sizeMax = Math.max(minPx, maxPx);
  const gapMax = Math.max(0, gapMaxPx);
  const natural = count * sizeMax + gaps * gapMax;
  if (!(availableWidthPx > 0) || natural <= availableWidthPx) {
    return { sizePx: sizeMax, gapPx: gapMax };
  }
  const scale = availableWidthPx / natural;
  const sizePx = Math.max(minPx, Math.floor(sizeMax * scale));
  const used = count * sizePx;
  const gapPx =
    gaps > 0 ? Math.max(0, Math.floor((availableWidthPx - used) / gaps)) : 0;
  return { sizePx, gapPx };
}
