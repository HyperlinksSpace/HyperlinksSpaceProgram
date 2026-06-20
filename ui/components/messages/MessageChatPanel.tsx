import { View } from "react-native";
import type { ThemeColors } from "../../theme";
import { MessageChatHeader } from "./MessageChatHeader";
import { MessageChatMessageList } from "./MessageChatMessageList";
import type { MessageChatRowData } from "./MessageChatRow";

type Props = {
  chat: MessageChatRowData;
  colors: ThemeColors;
};

/** Wide-layout chat pane (middle column). */
export function MessageChatPanel({ chat, colors }: Props) {
  return (
    <View
      style={{
        flex: 1,
        width: "100%",
        alignSelf: "stretch",
        minHeight: 0,
        overflow: "visible",
      }}
    >
      <MessageChatHeader chat={chat} colors={colors} />
      <MessageChatMessageList chat={chat} colors={colors} />
    </View>
  );
}
