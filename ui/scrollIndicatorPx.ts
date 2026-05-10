import { PixelRatio, Platform } from "react-native";

/**
 * Border width for the vertical scroll thumb: **one device pixel** in CSS px (`1 / dpr`), same idea as
 * menu hairlines elsewhere. Plain `1` is one **CSS** px and reads thicker than other app rules on retina.
 */
export function scrollIndicatorHairlineBorderWidthPx(): number {
  if (Platform.OS === "web") {
    if (typeof window !== "undefined" && window.devicePixelRatio > 0) {
      return 1 / window.devicePixelRatio;
    }
    return 1;
  }
  return PixelRatio.roundToNearestPixel(1 / PixelRatio.get());
}

/**
 * Snap layout coords to the device pixel grid so a 1px-wide overlay doesn’t sit on half-pixels and blur.
 */
export function snapScrollIndicatorCoordPx(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (Platform.OS === "web") {
    if (typeof window !== "undefined" && window.devicePixelRatio > 0) {
      const dpr = window.devicePixelRatio;
      return Math.round(n * dpr) / dpr;
    }
    return Math.round(n);
  }
  return PixelRatio.roundToNearestPixel(n);
}
