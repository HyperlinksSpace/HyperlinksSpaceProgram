import Svg, { Path } from "react-native-svg";

type Props = {
  size?: number;
  color: string;
};

/** Small pushpin for pinned chats in the list (Telegram-style). */
export function MessageChatPinIcon({ size = 14, color }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M16 12V4h1c.55 0 1-.45 1-1s-.45-1-1-1H8c-.55 0-1 .45-1 1s.45 1 1 1h1v8c0 1.1-.9 2-2 2H5v2h5.2c.38 1.12 1.44 1.93 2.8 1.93s2.42-.81 2.8-1.93H19v-2h-2c-1.1 0-2-.9-2-2z"
        fill={color}
      />
    </Svg>
  );
}
