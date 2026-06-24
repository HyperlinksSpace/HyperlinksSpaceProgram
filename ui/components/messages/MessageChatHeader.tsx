import { useMemo } from "react";
import { Platform, Text, View, type ViewStyle } from "react-native";
import { useAppStrings } from "../../../locales/AppStringsContext";
import { FONT_UI_SANS_REGULAR, WEB_UI_SANS_STACK } from "../../fonts";
import { hairlineBorderWidthPx } from "../../scrollIndicatorPx";
import { layout, type ThemeColors } from "../../theme";
import { formatMessageChatPresenceLabel } from "./formatMessageChatPresence";
import type { MessageChatRowData } from "./MessageChatRow";
import {
  MESSAGE_CHAT_HEADER_STRIP_HEIGHT_PX,
  MESSAGE_FONT_SIZE_PX,
  MESSAGE_LINE_HEIGHT_PX,
} from "./messageListLayout";

type Props = {
  chat: MessageChatRowData;
  colors: ThemeColors;
};

export function MessageChatHeader({ chat, colors }: Props) {
  const { locale } = useAppStrings();
  const lineT = hairlineBorderWidthPx();
  const columnBleedPx = layout.contentSideInsetPx;
  const title = chat.title.trim();
  const presenceLabel = formatMessageChatPresenceLabel(chat, locale);

  const textBase = {
    fontFamily: Platform.OS === "web" ? WEB_UI_SANS_STACK : FONT_UI_SANS_REGULAR,
    fontSize: MESSAGE_FONT_SIZE_PX,
    lineHeight: MESSAGE_LINE_HEIGHT_PX,
    includeFontPadding: false,
    paddingVertical: 0,
  } as const;

  const borderLineStyle = useMemo((): ViewStyle => {
    return {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 0,
      height: lineT,
      backgroundColor: colors.highlight,
      zIndex: 1,
    };
  }, [colors.highlight, lineT]);

  return (
    <View
      style={{
        alignSelf: "stretch",
        height: MESSAGE_CHAT_HEADER_STRIP_HEIGHT_PX,
        position: "relative",
        justifyContent: "center",
        overflow: "visible",
      }}
    >
      <View
        style={{
          width: "100%",
          justifyContent: "center",
          alignItems: "center",
          paddingHorizontal: columnBleedPx,
        }}
      >
        <Text
          numberOfLines={1}
          ellipsizeMode="tail"
          style={{
            ...textBase,
            color: colors.primary,
            textAlign: "center",
            width: "100%",
          }}
        >
          {title}
        </Text>
        {presenceLabel ? (
          <Text
            numberOfLines={1}
            ellipsizeMode="tail"
            style={{
              ...textBase,
              color: colors.secondary,
              textAlign: "center",
              width: "100%",
            }}
          >
            {presenceLabel}
          </Text>
        ) : null}
      </View>
      <View pointerEvents="none" collapsable={false} style={borderLineStyle} />
    </View>
  );
}
