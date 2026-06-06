import { useCallback, useId, useState } from "react";
import { PixelRatio, Platform, View, type LayoutChangeEvent } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";

import { layout, useColors } from "../../theme";

function ruleThicknessPx(): number {
  if (Platform.OS === "web") {
    if (typeof window !== "undefined" && window.devicePixelRatio > 0) {
      return 1 / window.devicePixelRatio;
    }
    return 1;
  }
  return PixelRatio.roundToNearestPixel(1 / PixelRatio.get());
}

/** Full-bleed horizontal rule: gradient (default) or solid `colors.highlight`. */
export function SmartGradientDivider({
  variant = "gradient",
  /** Inset the visible rule from the full-bleed shell (overflow / scroll mode). */
  horizontalPaddingPx = 0,
}: {
  variant?: "gradient" | "solid";
  horizontalPaddingPx?: number;
}) {
  const colors = useColors();
  const gradientId = useId();
  const lineT = ruleThicknessPx();
  const contentInset = layout.contentSideInsetPx;
  const [lineWidth, setLineWidth] = useState(0);

  const onLayout = useCallback((event: LayoutChangeEvent) => {
    setLineWidth(event.nativeEvent.layout.width);
  }, []);

  const padded = horizontalPaddingPx > 0;

  return (
    <View
      style={{
        alignSelf: "stretch",
        marginHorizontal: -contentInset,
        paddingHorizontal: padded ? horizontalPaddingPx : 0,
        height: lineT,
      }}
    >
      <View
        onLayout={onLayout}
        style={{
          alignSelf: "stretch",
          height: lineT,
          ...(variant === "solid" ? { backgroundColor: colors.highlight } : null),
        }}
      >
        {variant === "gradient" && lineWidth > 0 ? (
          <Svg width={lineWidth} height={lineT} viewBox={`0 0 ${lineWidth} ${lineT}`}>
            <Defs>
              <LinearGradient id={gradientId} x1="0%" y1="0" x2="100%" y2="0">
                <Stop offset="0%" stopColor={colors.highlight} stopOpacity={0} />
                <Stop offset="50%" stopColor={colors.highlight} stopOpacity={1} />
                <Stop offset="100%" stopColor={colors.highlight} stopOpacity={0} />
              </LinearGradient>
            </Defs>
            <Rect x={0} y={0} width={lineWidth} height={lineT} fill={`url(#${gradientId})`} />
          </Svg>
        ) : null}
      </View>
    </View>
  );
}
