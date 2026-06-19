import { Platform, Text, View } from "react-native";
import { FONT_UI_SANS_REGULAR, WEB_UI_SANS_STACK } from "../../fonts";
import type { ThemeColors } from "../../theme";
import { formatMessageChatWallClock } from "./formatMessageChatTime";
import type { MessageChatRowData } from "./MessageChatRow";
import { MESSAGE_LINE_HEIGHT_PX, MESSAGE_FONT_SIZE_PX, MESSAGE_ROW_HEIGHT_PX } from "./messageListLayout";

type Props = {
  chat: MessageChatRowData;
  colors: ThemeColors;
  timePendingLabel: string;
};

export function MessageChatHeader({ chat, colors, timePendingLabel }: Props) {
  const title = chat.title.trim();
  const parsedClock = formatMessageChatWallClock(chat.last_message_at);
  const lastSeenLabel = parsedClock || timePendingLabel;

  const textBase = {
    fontFamily: Platform.OS === "web" ? WEB_UI_SANS_STACK : FONT_UI_SANS_REGULAR,
    fontSize: MESSAGE_FONT_SIZE_PX,
    lineHeight: MESSAGE_LINE_HEIGHT_PX,
    includeFontPadding: false,
    paddingVertical: 0,
    textAlign: "center" as const,
  };

  return (
    <View
      style={{
        width: "100%",
        alignSelf: "stretch",
        minHeight: MESSAGE_ROW_HEIGHT_PX,
        justifyContent: "center",
        alignItems: "center",
        borderBottomWidth: 1,
        borderBottomColor: colors.highlight,
      }}
    >
      <Text
        numberOfLines={1}
        ellipsizeMode="tail"
        style={{
          ...textBase,
          color: colors.primary,
          maxWidth: "100%",
        }}
      >
        {title}
      </Text>
      {lastSeenLabel ? (
        <Text
          numberOfLines={1}
          ellipsizeMode="tail"
          style={{
            ...textBase,
            color: colors.secondary,
            maxWidth: "100%",
          }}
        >
          {lastSeenLabel}
        </Text>
      ) : null}
    </View>
  );
}
