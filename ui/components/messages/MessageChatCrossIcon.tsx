import Svg, { Circle, Rect } from "react-native-svg";

type Props = {
  size?: number;
};

/** Cross mark from `assets/cross.svg` in a 20×20 box. */
export function MessageChatCrossIcon({ size = 20 }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      <Circle cx={10} cy={10} r={10} fill="#818181" />
      <Rect x={4.375} y={5.625} width={1.76777} height={14.1421} transform="rotate(-45 4.375 5.625)" fill="#000000" />
      <Rect x={14.375} y={4.375} width={1.76777} height={14.1421} transform="rotate(45 14.375 4.375)" fill="#000000" />
      <Rect x={4.375} y={8.125} width={5.3033} height={1.76777} transform="rotate(-45 4.375 8.125)" fill="#000000" />
      <Rect x={11.873} y={4.375} width={5.3033} height={1.76777} transform="rotate(45 11.873 4.375)" fill="#000000" />
      <Rect x={10.623} y={14.375} width={5.3033} height={1.76777} transform="rotate(-45 10.623 14.375)" fill="#000000" />
      <Rect x={5.62305} y={10.625} width={5.3033} height={1.76777} transform="rotate(45 5.62305 10.625)" fill="#000000" />
    </Svg>
  );
}
