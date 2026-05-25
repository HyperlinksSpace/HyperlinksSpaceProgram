import { useEffect, useMemo } from "react";
import { Platform } from "react-native";
import Svg, { Path } from "react-native-svg";
import { swapChartLog, swapChartWarn } from "../../swap/swapChartDebug";
import {
  buildSwapChartPath,
  downsampleNormalizedPoints,
  SWAP_CHART_LINE_WIDTH_PX,
  SWAP_CHART_MAX_RENDER_POINTS,
} from "../../swap/swapChartPath";

type Props = {
  width: number;
  height: number;
  normalizedPoints: number[];
  lineColor: string;
};

const STROKE_WIDTH = SWAP_CHART_LINE_WIDTH_PX;

export function SwapChartLineSvg({
  width,
  height,
  normalizedPoints,
  lineColor,
}: Props) {
  const renderPoints = useMemo(
    () => downsampleNormalizedPoints(normalizedPoints, SWAP_CHART_MAX_RENDER_POINTS),
    [normalizedPoints],
  );

  useEffect(() => {
    if (width <= 0 || height <= 0 || normalizedPoints.length === 0) {
      swapChartWarn("svg_skip", { width, height, pointCount: normalizedPoints.length });
      return;
    }
    const pathD = buildSwapChartPath(renderPoints, width, height);
    swapChartLog("svg_render", {
      width,
      height,
      pointCount: normalizedPoints.length,
      renderPointCount: renderPoints.length,
      pathLength: pathD.length,
      renderer: "svg",
    });
  }, [width, height, normalizedPoints, renderPoints]);

  if (width <= 0 || height <= 0 || normalizedPoints.length === 0) {
    return null;
  }

  const pathD = buildSwapChartPath(renderPoints, width, height);

  return (
    <Svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={Platform.OS === "web" ? ({ width, height, display: "block" } as object) : undefined}
    >
      <Path
        d={pathD}
        stroke={lineColor}
        strokeWidth={STROKE_WIDTH}
        fill="none"
        strokeLinecap="butt"
        strokeLinejoin="miter"
      />
    </Svg>
  );
}
