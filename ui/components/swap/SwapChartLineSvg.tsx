import Svg, { Path, Rect } from "react-native-svg";
import { buildSwapChartPath, chartPointCoordinates } from "../../swap/swapChartPath";

type Props = {
  width: number;
  height: number;
  normalizedPoints: number[];
  selectedPointIndex: number | null;
  lineColor: string;
  dotFillColor: string;
  dotStrokeColor: string;
};

const STROKE_WIDTH = 1.33;
const DOT_SIZE = 5;

export function SwapChartLineSvg({
  width,
  height,
  normalizedPoints,
  selectedPointIndex,
  lineColor,
  dotFillColor,
  dotStrokeColor,
}: Props) {
  if (width <= 0 || height <= 0 || normalizedPoints.length === 0) {
    return null;
  }

  const pathD = buildSwapChartPath(normalizedPoints, width, height);
  let dot: { x: number; y: number } | null = null;
  if (
    selectedPointIndex != null &&
    selectedPointIndex >= 0 &&
    selectedPointIndex < normalizedPoints.length
  ) {
    dot = chartPointCoordinates(selectedPointIndex, normalizedPoints, width, height);
  }

  return (
    <Svg width={width} height={height}>
      <Path
        d={pathD}
        stroke={lineColor}
        strokeWidth={STROKE_WIDTH}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {dot ? (
        <Rect
          x={dot.x - DOT_SIZE / 2}
          y={dot.y - DOT_SIZE / 2}
          width={DOT_SIZE}
          height={DOT_SIZE}
          fill={dotFillColor}
          stroke={dotStrokeColor}
          strokeWidth={STROKE_WIDTH}
        />
      ) : null}
    </Svg>
  );
}
