/** Max points used to build the visible line (full series kept for pointer hit-testing). */
export const SWAP_CHART_MAX_RENDER_POINTS = 500;

export const SWAP_CHART_LINE_WIDTH_PX = 1;

/** SVG path: straight segments between points (no curve smoothing). */

export function downsampleNormalizedPoints(points: number[], maxPoints: number): number[] {
  if (points.length <= maxPoints || maxPoints < 2) return points;
  const out: number[] = [];
  const last = points.length - 1;
  for (let i = 0; i < maxPoints; i++) {
    const idx = Math.round((i / (maxPoints - 1)) * last);
    out.push(points[idx]!);
  }
  return out;
}

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
    path += ` L ${x} ${y}`;
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

/** Draw chart line on canvas (straight segments, same geometry as {@link buildSwapChartPath}). */
export function strokeSwapChartLine(
  ctx: CanvasRenderingContext2D,
  normalizedPoints: number[],
  width: number,
  height: number,
  strokeStyle: string,
  lineWidth = SWAP_CHART_LINE_WIDTH_PX,
): void {
  if (width <= 0 || height <= 0 || normalizedPoints.length === 0) return;

  const points = normalizedPoints;
  const pointCount = points.length;
  const stepSize = pointCount > 1 ? width / (pointCount - 1) : 0;

  ctx.beginPath();
  const startY = height - points[0]! * height;
  ctx.moveTo(0, startY);

  if (pointCount === 1) {
    ctx.lineTo(width, startY);
  } else {
    for (let i = 1; i < pointCount; i++) {
      const x = i * stepSize;
      const y = height - points[i]! * height;
      ctx.lineTo(x, y);
    }

    const lastX = (pointCount - 1) * stepSize;
    if (lastX < width) {
      const lastY = height - points[pointCount - 1]! * height;
      ctx.lineTo(width, lastY);
    }
  }

  ctx.strokeStyle = strokeStyle;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = "butt";
  ctx.lineJoin = "miter";
  ctx.stroke();
}
