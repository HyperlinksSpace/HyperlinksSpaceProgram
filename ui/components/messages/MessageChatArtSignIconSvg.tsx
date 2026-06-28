import Svg, { Circle, Defs, LinearGradient, Path, Stop } from "react-native-svg";

type Props = {
  size?: number;
  idSuffix?: string;
};

/** Static artist palette SVG (shared by web + native wrappers). */
export function MessageChatArtSignIconSvg({ size = 20, idSuffix = "" }: Props) {
  const bg = `hspArtBg${idSuffix}`;
  const palette = `hspArtPalette${idSuffix}`;
  const brush = `hspArtBrush${idSuffix}`;

  return (
    <Svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      <Defs>
        <LinearGradient id={bg} x1="3" y1="2" x2="17" y2="18">
          <Stop offset="0" stopColor="#FFF8EE" />
          <Stop offset="1" stopColor="#F0DCC0" />
        </LinearGradient>
        <LinearGradient id={palette} x1="5" y1="4" x2="16" y2="16">
          <Stop offset="0" stopColor="#A1887F" />
          <Stop offset="0.5" stopColor="#8D6E63" />
          <Stop offset="1" stopColor="#6D4C41" />
        </LinearGradient>
        <LinearGradient id={brush} x1="14" y1="2" x2="18" y2="8">
          <Stop offset="0" stopColor="#FFD180" />
          <Stop offset="1" stopColor="#FF8F00" />
        </LinearGradient>
      </Defs>

      <Circle cx={10} cy={10} r={9.5} fill={`url(#${bg})`} />
      <Circle cx={10} cy={10} r={9.5} stroke="#C9A66B" strokeWidth={0.35} />

      <Path
        d="M12.2 4.6C15.4 4.8 16.8 7.2 16.2 10.1C15.6 13.4 12.4 15.8 8.6 15.4C5.4 15.1 3.8 12.6 4.4 9.8C5 7.1 7.4 4.9 10.1 4.5C10.8 4.4 11.5 4.5 12.2 4.6Z"
        fill={`url(#${palette})`}
        stroke="#5D4037"
        strokeWidth={0.35}
      />

      <Circle cx={7.1} cy={11.8} r={1.35} fill="#F5E6C8" stroke="#5D4037" strokeWidth={0.3} />

      <Circle cx={11.2} cy={6.8} r={1.05} fill="#E53935" />
      <Circle cx={14.1} cy={8.6} r={0.95} fill="#1E88E5" />
      <Circle cx={13.2} cy={11.4} r={1} fill="#FDD835" />
      <Circle cx={9.8} cy={9.2} r={0.9} fill="#43A047" />
      <Circle cx={10.8} cy={12.8} r={0.85} fill="#AB47BC" />

      <Path
        d="M15.2 3.2L17.6 6.4"
        stroke={`url(#${brush})`}
        strokeWidth={1.15}
        strokeLinecap="round"
      />
      <Path
        d="M17.1 6.7L18.2 5.1"
        stroke="#5D4037"
        strokeWidth={0.55}
        strokeLinecap="round"
      />
      <Path
        d="M17.4 7.1C17.8 7.5 17.9 7.9 17.6 8.2"
        stroke="#E53935"
        strokeWidth={0.7}
        strokeLinecap="round"
      />
    </Svg>
  );
}
