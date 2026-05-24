/** SVG path for swap chart line (port of prev-main DiagonalLinePainter). */

export function buildSwapChartPath(
  normalizedPoints: number[],
  width: number,
  height: number,
): string {
  if (width <= 0 || height <= 0 || normalizedPoints.length === 0) return "";

  const points = normalizedPoints;
  const pointCount = points.length;
  const stepSize = pointCount > 1 ? width / (pointCount - 1) : 0;

  const startY = height - points[0]! * height;
  let path = `M 0 ${startY}`;

  if (pointCount === 1) {
    return `${path} L ${width} ${startY}`;
  }

  for (let i = 1; i < pointCount; i++) {
    const x = i * stepSize;
    const y = height - points[i]! * height;

    if (i === 1) {
      const controlX = x * 0.5;
      const controlY = height - points[0]! * height * 0.7 - points[i]! * height * 0.3;
      path += ` Q ${controlX} ${controlY} ${x} ${y}`;
    } else {
      const prevX = (i - 1) * stepSize;
      const prevY = height - points[i - 1]! * height;
      const cp1X = prevX + (x - prevX) * 0.3;
      const cp1Y = prevY;
      const cp2X = prevX + (x - prevX) * 0.7;
      const cp2Y = y;
      path += ` C ${cp1X} ${cp1Y} ${cp2X} ${cp2Y} ${x} ${y}`;
    }
  }

  const lastX = (pointCount - 1) * stepSize;
  if (lastX < width) {
    const lastY = height - points[pointCount - 1]! * height;
    path += ` L ${width} ${lastY}`;
  }

  return path;
}

export function chartPointCoordinates(
  index: number,
  normalizedPoints: number[],
  width: number,
  height: number,
): { x: number; y: number } {
  const pointCount = normalizedPoints.length;
  const stepSize = pointCount > 1 ? width / (pointCount - 1) : 0;
  const x = index * stepSize;
  const y = height - normalizedPoints[index]! * height;
  return { x, y };
}
