/** Horizontal placement for timestamp label centered on selected chart dot (prev-main). */

export function selectedTimestampOffsetX(
  dotX: number,
  rowWidth: number,
  textWidth: number,
): number | null {
  if (rowWidth <= 0 || textWidth <= 0) return null;

  const textLeft = dotX - textWidth / 2;
  const textRight = dotX + textWidth / 2;

  if (textLeft < 0) return null;
  if (textRight > rowWidth) return null;
  return dotX - rowWidth / 2;
}

export function selectedDotX(
  selectedIndex: number,
  pointCount: number,
  chartWidth: number,
): number {
  if (chartWidth <= 0 || pointCount <= 0) return 0;
  const xRatio = pointCount > 1 ? selectedIndex / (pointCount - 1) : 0;
  return xRatio * chartWidth;
}
