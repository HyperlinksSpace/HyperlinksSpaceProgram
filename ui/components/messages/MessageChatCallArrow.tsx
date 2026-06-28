import { View } from "react-native";
import Svg, { Path } from "react-native-svg";

export const MESSAGE_CHAT_CALL_ARROW_SIZE_PX = 12;
export const MESSAGE_CHAT_CALL_ARROW_GAP_PX = 4;

const CALL_ARROW_SUCCESS_COLOR = "#e53935";
const CALL_ARROW_UNSUCCESSFUL_COLOR = "#43a047";

type Props = {
  outgoing: boolean;
  successful: boolean;
  size?: number;
};

/** Directional call arrow beside bubble time (outgoing ↗, incoming ↙). */
export function MessageChatCallArrow({
  outgoing,
  successful,
  size = MESSAGE_CHAT_CALL_ARROW_SIZE_PX,
}: Props) {
  const color = successful ? CALL_ARROW_SUCCESS_COLOR : CALL_ARROW_UNSUCCESSFUL_COLOR;
  const stroke = {
    stroke: color,
    strokeWidth: 1.75,
    fill: "none" as const,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  return (
    <View style={{ marginRight: MESSAGE_CHAT_CALL_ARROW_GAP_PX }}>
      <Svg width={size} height={size} viewBox="0 0 12 12">
        {outgoing ? (
          <>
            <Path d="M2.5 9.5 L9.5 2.5" {...stroke} />
            <Path d="M5.5 2.5 H9.5 V6.5" {...stroke} />
          </>
        ) : (
          <>
            <Path d="M9.5 2.5 L2.5 9.5" {...stroke} />
            <Path d="M6.5 9.5 H2.5 V5.5" {...stroke} />
          </>
        )}
      </Svg>
    </View>
  );
}

export function messageChatCallArrowWidthPx(isCall: boolean): number {
  if (!isCall) return 0;
  return MESSAGE_CHAT_CALL_ARROW_SIZE_PX + MESSAGE_CHAT_CALL_ARROW_GAP_PX;
}
