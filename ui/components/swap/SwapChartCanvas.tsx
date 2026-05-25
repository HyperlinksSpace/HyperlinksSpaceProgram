import { createElement, useEffect, useMemo, useRef } from "react";
import { swapChartLog } from "../../swap/swapChartDebug";
import {
  downsampleNormalizedPoints,
  strokeSwapChartLine,
  SWAP_CHART_LINE_WIDTH_PX,
  SWAP_CHART_MAX_RENDER_POINTS,
} from "../../swap/swapChartPath";

export type SwapChartCanvasProps = {
  width: number;
  height: number;
  normalizedPoints: number[];
  lineColor: string;
};

const STROKE_WIDTH = SWAP_CHART_LINE_WIDTH_PX;

/**
 * Web chart renderer (HTML canvas). Imported explicitly so production web bundles
 * do not depend on `.web.tsx` platform resolution alone.
 */
export function SwapChartCanvas({
  width,
  height,
  normalizedPoints,
  lineColor,
}: SwapChartCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const renderPoints = useMemo(
    () => downsampleNormalizedPoints(normalizedPoints, SWAP_CHART_MAX_RENDER_POINTS),
    [normalizedPoints],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || width <= 0 || height <= 0 || normalizedPoints.length === 0) return;

    const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    const pixelW = Math.max(1, Math.round(width * dpr));
    const pixelH = Math.max(1, Math.round(height * dpr));
    canvas.width = pixelW;
    canvas.height = pixelH;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    strokeSwapChartLine(ctx, renderPoints, width, height, lineColor, STROKE_WIDTH);

    swapChartLog("chart_canvas_draw", {
      width,
      height,
      pointCount: normalizedPoints.length,
      renderPointCount: renderPoints.length,
    });
  }, [width, height, normalizedPoints, renderPoints, lineColor]);

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
