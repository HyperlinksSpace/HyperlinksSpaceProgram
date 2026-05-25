import { createElement, useEffect, useMemo, useRef } from "react";
import { swapChartLog } from "../../swap/swapChartDebug";
import {
  chartPointCoordinates,
  downsampleNormalizedPoints,
  strokeSwapChartLine,
  SWAP_CHART_LINE_WIDTH_PX,
  SWAP_CHART_MAX_RENDER_POINTS,
} from "../../swap/swapChartPath";

type Props = {
  width: number;
  height: number;
  normalizedPoints: number[];
  selectedPointIndex: number | null;
  lineColor: string;
  dotFillColor: string;
  dotStrokeColor: string;
};

const STROKE_WIDTH = SWAP_CHART_LINE_WIDTH_PX;
const DOT_SIZE = 5;

/**
 * Web chart line via Canvas — avoids huge SVG paths (~160k chars) that fail to paint in Chromium.
 */
export function SwapChartLineSvg({
  width,
  height,
  normalizedPoints,
  selectedPointIndex,
  lineColor,
  dotFillColor,
  dotStrokeColor,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const renderPoints = useMemo(
    () => downsampleNormalizedPoints(normalizedPoints, SWAP_CHART_MAX_RENDER_POINTS),
    [normalizedPoints],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || width <= 0 || height <= 0 || normalizedPoints.length === 0) return;

    const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    strokeSwapChartLine(ctx, renderPoints, width, height, lineColor, STROKE_WIDTH);

    if (
      selectedPointIndex != null &&
      selectedPointIndex >= 0 &&
      selectedPointIndex < normalizedPoints.length
    ) {
      const { x, y } = chartPointCoordinates(
        selectedPointIndex,
        normalizedPoints,
        width,
        height,
      );
      ctx.fillStyle = dotFillColor;
      ctx.strokeStyle = dotStrokeColor;
      ctx.lineWidth = STROKE_WIDTH;
      ctx.fillRect(x - DOT_SIZE / 2, y - DOT_SIZE / 2, DOT_SIZE, DOT_SIZE);
      ctx.strokeRect(x - DOT_SIZE / 2, y - DOT_SIZE / 2, DOT_SIZE, DOT_SIZE);
    }

    swapChartLog("svg_render", {
      width,
      height,
      pointCount: normalizedPoints.length,
      renderPointCount: renderPoints.length,
      renderer: "canvas",
      selectedPointIndex,
    });
  }, [
    width,
    height,
    normalizedPoints,
    renderPoints,
    selectedPointIndex,
    lineColor,
    dotFillColor,
    dotStrokeColor,
  ]);

  if (width <= 0 || height <= 0 || normalizedPoints.length === 0) {
    return null;
  }

  return createElement("canvas", {
    ref: canvasRef,
    style: {
      width,
      height,
      display: "block",
      touchAction: "none",
      pointerEvents: "none",
    },
  });
}
