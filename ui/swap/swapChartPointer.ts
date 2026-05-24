/** Hybrid pointer selection (matches prev-main {@link _handleChartPointer}). */

export function pickChartPointIndex(
  localX: number,
  localY: number,
  chartWidth: number,
  chartHeight: number,
  normalizedPoints: number[],
): number | null {
  const pointCount = normalizedPoints.length;
  if (pointCount === 0 || chartWidth <= 0 || chartHeight <= 0) return null;

  const stepSize = pointCount > 1 ? chartWidth / (pointCount - 1) : 0;

  let closestByX = 0;
  let minXDistance = Infinity;
  for (let i = 0; i < pointCount; i++) {
    const pointX = i * stepSize;
    const xDistance = Math.abs(localX - pointX);
    if (xDistance < minXDistance) {
      minXDistance = xDistance;
      closestByX = i;
    }
  }

  const normalizedValue = normalizedPoints[closestByX]!;
  const closestPointY = chartHeight - normalizedValue * chartHeight;
  const verticalDistance = Math.abs(localY - closestPointY);

  const fixedThreshold = 40;
  const percentageThreshold = chartHeight * 0.15;
  const proximityThreshold = Math.max(fixedThreshold, percentageThreshold);
  const isCloseToChart = verticalDistance < proximityThreshold;

  if (isCloseToChart) {
    let minDistance = Infinity;
    let closestIndex = 0;
    for (let i = 0; i < pointCount; i++) {
      const pointX = i * stepSize;
      const pointY = chartHeight - normalizedPoints[i]! * chartHeight;
      const dx = localX - pointX;
      const dy = localY - pointY;
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (distance < minDistance) {
        minDistance = distance;
        closestIndex = i;
      }
    }
    return closestIndex;
  }

  return closestByX;
}
