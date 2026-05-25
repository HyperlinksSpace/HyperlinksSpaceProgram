import { Image } from "expo-image";
import { useColors, type ThemeColors } from "../../theme";
import {
  swapRotateIconDark,
  swapRotateIconLight,
  swapSelectChevronDark,
  swapSelectChevronLight,
} from "./swapFormAssets";

function isLightTheme(colors: ThemeColors): boolean {
  return colors.primary === "#000000";
}

export function SwapSelectChevron() {
  const colors = useColors();
  const src = isLightTheme(colors) ? swapSelectChevronLight : swapSelectChevronDark;
  return <Image source={src} style={{ width: 5, height: 10 }} contentFit="contain" />;
}

export function SwapRotateIcon() {
  const colors = useColors();
  const src = isLightTheme(colors) ? swapRotateIconLight : swapRotateIconDark;
  return <Image source={src} style={{ width: 20, height: 20 }} contentFit="contain" />;
}
