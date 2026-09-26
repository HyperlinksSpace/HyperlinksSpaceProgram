import { useState } from "react";
import { Platform, Pressable, Text, View } from "react-native";
import { useAppStrings } from "../../../locales/AppStringsContext";
import { FONT_UI_SANS_REGULAR, WEB_UI_SANS_STACK } from "../../fonts";
import {
  layout,
  typographyFixedRow30Label,
  useColors,
  welcomeAuthButtonActiveBackground,
  welcomeAuthButtonHoverBackground,
} from "../../theme";
import { useTelegram } from "../Telegram";
import { setMessagesArchiveOpen } from "../../messages/messagesArchiveOpen";

/** Matches {@link AuthenticatedHomeLeftNavStrip} height. */
export const MESSAGES_ARCHIVE_LIST_HEADER_HEIGHT_PX = 55;
const STRIP_PADDING_PX = layout.contentSideInsetPx;
const BACK_BUTTON_HEIGHT_PX = 30;
const BACK_BUTTON_HORIZONTAL_PADDING_PX = 15;

type Props = {
  /** Optional unread/count badge next to the back control (Telegram Desktop). */
  backBadgeLabel?: string | null;
};

/** Replaces Feed/Messages strip while browsing archived chats. */
export function MessagesArchiveListHeader({ backBadgeLabel = null }: Props) {
  const { t } = useAppStrings();
  const colors = useColors();
  const { colorScheme } = useTelegram();
  const [hoverBack, setHoverBack] = useState(false);
  const title = t("messages.archive.title");

  return (
    <View
      style={{
        height: MESSAGES_ARCHIVE_LIST_HEADER_HEIGHT_PX,
        paddingHorizontal: STRIP_PADDING_PX,
        paddingVertical: STRIP_PADDING_PX,
        justifyContent: "center",
        borderBottomWidth: Platform.OS === "web" ? 1 / (typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1) : 1,
        borderBottomColor: colors.highlight,
        backgroundColor: colors.background,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, minHeight: BACK_BUTTON_HEIGHT_PX }}>
        <View style={{ position: "relative" }}>
          <Pressable
            onPress={() => setMessagesArchiveOpen(false)}
            accessibilityRole="button"
            accessibilityLabel={t("messages.archive.back")}
            onHoverIn={Platform.OS === "web" ? () => setHoverBack(true) : undefined}
            onHoverOut={Platform.OS === "web" ? () => setHoverBack(false) : undefined}
            style={({ pressed }) => {
              const webHover = Platform.OS === "web" && hoverBack;
              let backgroundColor = colors.undercover;
              if (pressed) {
                backgroundColor = welcomeAuthButtonActiveBackground(colors, colorScheme);
              } else if (webHover) {
                backgroundColor = welcomeAuthButtonHoverBackground(colors, colorScheme);
              }
              return {
                height: BACK_BUTTON_HEIGHT_PX,
                paddingHorizontal: BACK_BUTTON_HORIZONTAL_PADDING_PX,
                borderRadius: BACK_BUTTON_HEIGHT_PX / 2,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor,
                opacity: pressed ? 0.92 : 1,
              };
            }}
          >
            <Text style={[typographyFixedRow30Label, { color: colors.primary }]} numberOfLines={1}>
              ←
            </Text>
          </Pressable>
          {backBadgeLabel ? (
            <View
              pointerEvents="none"
              style={{
                position: "absolute",
                top: -6,
                right: -8,
                minWidth: 22,
                height: 18,
                paddingHorizontal: 5,
                borderRadius: 9,
                backgroundColor: colors.highlight,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text
                style={{
                  color: colors.primary,
                  fontSize: 11,
                  lineHeight: 14,
                  fontFamily: FONT_UI_SANS_REGULAR,
                  ...(Platform.OS === "web" ? { fontFamily: WEB_UI_SANS_STACK } : null),
                }}
                numberOfLines={1}
              >
                {backBadgeLabel}
              </Text>
            </View>
          ) : null}
        </View>
        <Text
          numberOfLines={1}
          style={{
            flex: 1,
            color: colors.primary,
            fontSize: 17,
            lineHeight: 22,
            fontFamily: FONT_UI_SANS_REGULAR,
            ...(Platform.OS === "web" ? { fontFamily: WEB_UI_SANS_STACK } : null),
            fontWeight: "600",
          }}
        >
          {title}
        </Text>
      </View>
    </View>
  );
}
