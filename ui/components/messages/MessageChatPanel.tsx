import { useEffect } from "react";
import { View } from "react-native";
import { layout, type ThemeColors } from "../../theme";
import { warmupTelegramChatSession } from "../../telegram/warmupTelegramChatSession";
import { MessageChatHeader } from "./MessageChatHeader";
import { MessageChatMessageList } from "./MessageChatMessageList";
import type { MessageChatRowData } from "./MessageChatRow";

type Props = {
  chat: MessageChatRowData;
  colors: ThemeColors;
};

/** Wide-layout chat pane (middle column). */
export function MessageChatPanel({ chat, colors }: Props) {
  const columnBleedPx = layout.contentSideInsetPx;

  useEffect(() => {
    void warmupTelegramChatSession(chat.telegram_chat_id);
  }, [chat.telegram_chat_id]);

  return (
    <View
      style={{
        flex: 1,
        alignSelf: "stretch",
        minHeight: 0,
        overflow: "visible",
        marginHorizontal: -columnBleedPx,
      }}
    >
      <MessageChatHeader chat={chat} colors={colors} />
      <MessageChatMessageList chat={chat} colors={colors} />
    </View>
  );
}
