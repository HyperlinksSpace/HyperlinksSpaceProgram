import Svg, { Rect } from "react-native-svg";

type Props = {
  color: string;
};

/** Pixel chevron from `assets/down.svg` at native 15×8. */
const DOWN_PIXELS = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4],
  [4, 5],
  [5, 6],
  [6, 7],
  [7, 7],
  [8, 7],
  [9, 6],
  [10, 5],
  [11, 4],
  [12, 3],
  [13, 2],
  [14, 1],
] as const;

export function MessageChatDownIcon({ color }: Props) {
  return (
    <Svg width={15} height={8} viewBox="0 0 15 8" fill="none">
      {DOWN_PIXELS.map(([x, y]) => (
        <Rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={color} />
      ))}
    </Svg>
  );
}
