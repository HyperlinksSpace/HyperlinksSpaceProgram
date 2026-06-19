import { View } from "react-native";
import type { ThemeColors } from "../../theme";
import { MessageChatHeader } from "./MessageChatHeader";
import type { MessageChatRowData } from "./MessageChatRow";

type Props = {
  chat: MessageChatRowData;
  colors: ThemeColors;
  timePendingLabel: string;
};

/** Wide-layout chat pane (middle column). Message list body comes later. */
export function MessageChatPanel({ chat, colors, timePendingLabel }: Props) {
  return (
    <View
      style={{
        flex: 1,
        width: "100%",
        alignSelf: "stretch",
        minHeight: 0,
      }}
    >
      <MessageChatHeader chat={chat} colors={colors} timePendingLabel={timePendingLabel} />
      <View style={{ flex: 1, minHeight: 0 }} />
    </View>
  );
}
