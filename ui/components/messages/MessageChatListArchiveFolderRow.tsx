import { Platform, Text, View } from "react-native";
import { useAppStrings } from "../../../locales/AppStringsContext";
import type { ThemeColors } from "../../theme";
import { HomeListRowShell } from "../HomeListRowShell";
import { ChatMenuArchiveIcon } from "./MessageChatListContextMenuIcons";
import { MessageUnreadCountBadge } from "./MessageUnreadCountBadge";
import {
  MESSAGE_AVATAR_PX,
  MESSAGE_FONT_SIZE_PX,
  MESSAGE_ICON_TEXT_GAP_PX,
  MESSAGE_LINE_HEIGHT_PX,
  MESSAGE_NAME_TIME_GAP_PX,
  formatMessageUnreadCountLabel,
} from "./messageListLayout";
import { FONT_UI_SANS_REGULAR, WEB_UI_SANS_STACK } from "../../fonts";

type Props = {
  previewTitle: string | null;
  unreadCount: number;
  colors: ThemeColors;
  isLast: boolean;
  onPress: () => void;
};

/** Telegram-style archive folder row at the top of the main chat list. */
export function MessageChatListArchiveFolderRow({
  previewTitle,
  unreadCount,
  colors,
  isLast,
  onPress,
}: Props) {
  const { t } = useAppStrings();
  const title = t("messages.archive.title");
  const subtitle = previewTitle?.trim() || t("messages.archive.emptyPreview");
  const unreadLabel =
    unreadCount > 0 ? formatMessageUnreadCountLabel(unreadCount) : null;

  return (
    <HomeListRowShell isLast={isLast} colors={colors} onPress={onPress}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: MESSAGE_ICON_TEXT_GAP_PX,
          minHeight: MESSAGE_AVATAR_PX,
        }}
      >
        <View
          style={{
            width: MESSAGE_AVATAR_PX,
            height: MESSAGE_AVATAR_PX,
            borderRadius: MESSAGE_AVATAR_PX / 2,
            backgroundColor: colors.highlight,
            alignItems: "center",
            justifyContent: "center",
          }}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <ChatMenuArchiveIcon color={colors.primary} size={Math.round(MESSAGE_AVATAR_PX * 0.42)} />
        </View>
        <View style={{ flex: 1, minWidth: 0, justifyContent: "center" }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: MESSAGE_NAME_TIME_GAP_PX,
            }}
          >
            <Text
              numberOfLines={1}
              style={{
                flex: 1,
                color: colors.primary,
                fontSize: MESSAGE_FONT_SIZE_PX,
                lineHeight: MESSAGE_LINE_HEIGHT_PX,
                fontFamily: FONT_UI_SANS_REGULAR,
                ...(Platform.OS === "web" ? { fontFamily: WEB_UI_SANS_STACK } : null),
                fontWeight: "600",
              }}
            >
              {title}
            </Text>
            {unreadLabel ? (
              <MessageUnreadCountBadge label={unreadLabel} colors={colors} />
            ) : null}
          </View>
          <Text
            numberOfLines={1}
            style={{
              color: colors.secondary,
              fontSize: MESSAGE_FONT_SIZE_PX,
              lineHeight: MESSAGE_LINE_HEIGHT_PX,
              fontFamily: FONT_UI_SANS_REGULAR,
              ...(Platform.OS === "web" ? { fontFamily: WEB_UI_SANS_STACK } : null),
            }}
          >
            {subtitle}
          </Text>
        </View>
      </View>
    </HomeListRowShell>
  );
}
