import Svg, { Circle, Defs, LinearGradient, Path, Stop } from "react-native-svg";

type Props = {
  size?: number;
};

/** Peace sign in a 20×20 box (violet circle, white symbol). */
export function MessageChatPeaceIcon({ size = 20 }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      <Defs>
        <LinearGradient id="hspPeaceBg" x1="2" y1="2" x2="18" y2="18">
          <Stop offset="0" stopColor="#B39DDB" />
          <Stop offset="0.55" stopColor="#7E57C2" />
          <Stop offset="1" stopColor="#512DA8" />
        </LinearGradient>
      </Defs>
      <Circle cx={10} cy={10} r={9.5} fill="url(#hspPeaceBg)" />
      <Circle cx={10} cy={10} r={9.5} stroke="#4527A0" strokeWidth={0.35} />
      <Path d="M10 4.75V15.25" stroke="#FFFFFF" strokeWidth={1.55} strokeLinecap="round" />
      <Path d="M10 12.1L6.15 15.95" stroke="#FFFFFF" strokeWidth={1.55} strokeLinecap="round" />
      <Path d="M10 12.1L13.85 15.95" stroke="#FFFFFF" strokeWidth={1.55} strokeLinecap="round" />
    </Svg>
  );
}
