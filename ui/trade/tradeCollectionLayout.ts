/** First trade row: collection picture width threshold and column bounds. */
export const TRADE_COLLECTION_PICTURE_MAX_WIDTH_PX = 264;
export const TRADE_COLLECTION_MIN_COLUMNS = 2;
export const TRADE_COLLECTION_MAX_COLUMNS = 4;

/** Add a column while each picture would still exceed {@link TRADE_COLLECTION_PICTURE_MAX_WIDTH_PX}. */
export function resolveTradeCollectionColumnCount(rowWidthPx: number, gapPx: number): number {
  if (rowWidthPx <= 0) {
    return TRADE_COLLECTION_MIN_COLUMNS;
  }
  let columns = TRADE_COLLECTION_MIN_COLUMNS;
  while (columns < TRADE_COLLECTION_MAX_COLUMNS) {
    const pictureWidth = (rowWidthPx - (columns - 1) * gapPx) / columns;
    if (pictureWidth <= TRADE_COLLECTION_PICTURE_MAX_WIDTH_PX) {
      break;
    }
    columns += 1;
  }
  return columns;
}
