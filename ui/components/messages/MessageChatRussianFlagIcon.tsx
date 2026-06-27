import Svg, { Rect } from "react-native-svg";

type Props = {
  size?: number;
};

/** Russian tricolor (white / blue / red) in a 20×20 box. */
export function MessageChatRussianFlagIcon({ size = 20 }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      <Rect x={0} y={0} width={20} height={7} fill="#FFFFFF" />
      <Rect x={0} y={7} width={20} height={7} fill="#0039A6" />
      <Rect x={0} y={14} width={20} height={6} fill="#D52B1E" />
    </Svg>
  );
}
