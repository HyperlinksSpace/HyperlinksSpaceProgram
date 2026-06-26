import Svg, { Rect } from "react-native-svg";

type Props = {
  size?: number;
  color: string;
};

const PIN_PIXELS = [
  [5, 14],
  [4, 15],
  [6, 13],
  [7, 12],
  [8, 11],
  [14, 5],
  [15, 6],
  [13, 4],
  [12, 5],
  [11, 6],
  [10, 7],
  [8, 8],
  [9, 9],
  [10, 10],
  [11, 11],
  [12, 12],
  [7, 7],
  [14, 7],
  [13, 8],
  [12, 9],
] as const;

/** Pixel pin icon from `assets/pin.svg` in a 20x20 transparent box. */
export function MessageChatPinIcon({ size = 20, color }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      {PIN_PIXELS.map(([x, y]) => (
        <Rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={color} />
      ))}
    </Svg>
  );
}
