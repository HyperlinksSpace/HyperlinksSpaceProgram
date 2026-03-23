/**
 * 32×32 logo matching Dart GlobalLogoBar asset (HyperlinksSpace.svg).
 * Inline SVG paths to avoid asset transformer; fill #1AAA11.
 */
import React from "react";
import Svg, { Path } from "react-native-svg";

const LOGO_SIZE = 32;

export function HyperlinksSpaceLogo({
  width = LOGO_SIZE,
  height = LOGO_SIZE,
}: {
  width?: number;
  height?: number;
}) {
  return (
    <Svg width={width} height={height} viewBox="0 0 24 24" fill="none">
      <Path
        d="M6 24L13.2 19.2L17.28 24H24V0H22.8V22.8H18L6 7.2V24Z"
        fill="#1AAA11"
      />
      <Path
        d="M18 0L10.8 4.8L6.72 0H0V24H1.2V1.2H6L18 16.8V0Z"
        fill="#1AAA11"
      />
    </Svg>
  );
}
