import { Platform, Text, View } from "react-native";
import { FONT_UI_SANS_REGULAR, WEB_UI_SANS_STACK } from "../../fonts";
import type { ThemeColors } from "../../theme";
import {
  MESSAGE_FONT_SIZE_PX,
  MESSAGE_LINE_HEIGHT_PX,
  MESSAGE_UNREAD_BADGE_PADDING_X_PX,
} from "./messageListLayout";

type Props = {
  label: string;
  colors: ThemeColors;
};

/** Pill unread badge — 20px tall, `accent` fill, fully rounded ends (circle when narrow). */
export function MessageUnreadCountBadge({ label, colors }: Props) {
  return (
    <View
      style={{
        height: MESSAGE_LINE_HEIGHT_PX,
        minWidth: MESSAGE_LINE_HEIGHT_PX,
        paddingHorizontal: MESSAGE_UNREAD_BADGE_PADDING_X_PX,
        borderRadius: MESSAGE_LINE_HEIGHT_PX / 2,
        backgroundColor: colors.accent,
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      <Text
        numberOfLines={1}
        style={{
          fontFamily: Platform.OS === "web" ? WEB_UI_SANS_STACK : FONT_UI_SANS_REGULAR,
          fontSize: MESSAGE_FONT_SIZE_PX,
          lineHeight: MESSAGE_LINE_HEIGHT_PX,
          fontWeight: "400",
          includeFontPadding: false,
          paddingVertical: 0,
          color: colors.primary,
          textAlign: "center",
        }}
      >
        {label}
      </Text>
    </View>
  );
}
