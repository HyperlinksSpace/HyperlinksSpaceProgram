import { View } from "react-native";
import type { ThemeColors } from "../../theme";
import { MessageChatHeader } from "./MessageChatHeader";
import type { MessageChatRowData } from "./MessageChatRow";

type Props = {
  chat: MessageChatRowData;
  colors: ThemeColors;
};

/** Wide-layout chat pane (middle column). Message list body comes later. */
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
      <View style={{ flex: 1, minHeight: 0 }} />
    </View>
  );
}
