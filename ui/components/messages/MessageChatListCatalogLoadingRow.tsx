import { ActivityIndicator, View } from "react-native";
import type { ThemeColors } from "../../theme";
import { HomeListRowShell } from "../HomeListRowShell";
import { MESSAGE_AVATAR_PX, MESSAGE_ROW_HEIGHT_PX } from "./messageListLayout";

type Props = {
  colors: ThemeColors;
  isLast: boolean;
};

/** Placeholder row while the next chat-list catalog page loads (first slot of the incoming batch). */
export function MessageChatListCatalogLoadingRow({ colors, isLast }: Props) {
  return (
    <HomeListRowShell isLast={isLast} colors={colors}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          height: MESSAGE_ROW_HEIGHT_PX,
          width: "100%",
        }}
        accessibilityState={{ busy: true }}
      >
        <View
          style={{
            width: MESSAGE_AVATAR_PX,
            height: MESSAGE_AVATAR_PX,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <ActivityIndicator size="small" color={colors.primary} />
        </View>
      </View>
    </HomeListRowShell>
  );
}
