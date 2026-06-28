import { View } from "react-native";
import Svg, { Path } from "react-native-svg";
import type { ThemeColors } from "../../theme";
import type { MessageOutgoingStatus } from "./messageChatHistoryTypes";
import { MESSAGE_CHAT_CHECKMARK_GAP_PX, MESSAGE_CHAT_CHECKMARK_SIZE_PX } from "./messageChatLayout";

type Props = {
  status: MessageOutgoingStatus;
  colors: ThemeColors;
  size?: number;
  /** Time sits on dark media — use light ticks. */
  onMedia?: boolean;
};

/** Telegram-style delivery ticks beside bubble time (outgoing only). */
export function MessageChatOutgoingChecks({
  status,
  colors,
  size = MESSAGE_CHAT_CHECKMARK_SIZE_PX,
  onMedia = false,
}: Props) {
  if (status !== "delivered" && status !== "read") return null;

  const color =
    status === "read"
      ? onMedia
        ? "#7ecbff"
        : colors.accent
      : onMedia
        ? "rgba(255,255,255,0.92)"
        : colors.secondary;
  const stroke = {
    stroke: color,
    strokeWidth: 1.75,
    fill: "none" as const,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  if (status === "delivered") {
    return (
      <View style={{ marginLeft: MESSAGE_CHAT_CHECKMARK_GAP_PX }}>
        <Svg width={size * 0.62} height={size} viewBox="0 0 11 14">
          <Path d="M1 7.5 L4.5 11 L10 2" {...stroke} />
        </Svg>
      </View>
    );
  }

  return (
    <View style={{ marginLeft: MESSAGE_CHAT_CHECKMARK_GAP_PX }}>
      <Svg width={size} height={size} viewBox="0 0 18 14">
        <Path d="M1 7.5 L4.5 11 L10 2" {...stroke} />
        <Path d="M5 7.5 L8.5 11 L17 2" {...stroke} />
      </Svg>
    </View>
  );
}

export function messageChatOutgoingChecksWidthPx(
  status: MessageOutgoingStatus | null | undefined,
): number {
  if (status !== "delivered" && status !== "read") return 0;
  const markWidth = status === "read" ? MESSAGE_CHAT_CHECKMARK_SIZE_PX : MESSAGE_CHAT_CHECKMARK_SIZE_PX * 0.62;
  return markWidth + MESSAGE_CHAT_CHECKMARK_GAP_PX;
}
