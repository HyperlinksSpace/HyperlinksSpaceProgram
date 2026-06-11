import { Platform, type ViewStyle } from "react-native";

import { hairlineBorderWidthPx } from "./scrollIndicatorPx";

/**
 * One device-pixel undercover stroke — square shells and rounded pills.
 * Web uses inset box-shadow so hairlines stay even on border-radius; native uses border.
 */
export function undercoverHairlineRingStyle(
  color: string,
  widthPx: number = hairlineBorderWidthPx(),
): ViewStyle {
  if (Platform.OS === "web") {
    return {
      borderWidth: 0,
      borderStyle: "solid",
      boxShadow: `inset 0 0 0 ${widthPx}px ${color}`,
    };
  }
  return {
    borderWidth: widthPx,
    borderColor: color,
    borderStyle: "solid",
  };
}
