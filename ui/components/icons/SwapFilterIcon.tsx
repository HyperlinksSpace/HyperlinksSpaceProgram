import Svg, { Rect } from "react-native-svg";

/** Three-bar filter mark from `assets/swap/filter.svg` (20×13). */
export function SwapFilterIcon({ color }: { color: string }) {
  return (
    <Svg width={20} height={13} viewBox="0 0 20 13" fill="none">
      <Rect width={20} height={1} fill={color} />
      <Rect y={6} width={15} height={1} fill={color} />
      <Rect y={12} width={10} height={1} fill={color} />
    </Svg>
  );
}
