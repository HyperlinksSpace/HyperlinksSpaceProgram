/** Smart page lead illustrations (`assets/Smart/`). */
export const smartLeadEnImage = require("../../assets/Smart/LeadEn.svg");
export const smartLeadRuImage = require("../../assets/Smart/LeadRu.svg");

/** Fixed render height; width follows the column and stretches the vector asymmetrically. */
export const SMART_LEAD_HEIGHT_PX = 301;
export const SMART_LEAD_HEIGHT_COMPACT_PX = 201;
export const SMART_LEAD_WIDTH_BREAKPOINT_PX = 400;

export function smartLeadHeightPxForWidth(widthPx: number): number {
  return widthPx > 0 && widthPx < SMART_LEAD_WIDTH_BREAKPOINT_PX
    ? SMART_LEAD_HEIGHT_COMPACT_PX
    : SMART_LEAD_HEIGHT_PX;
}
