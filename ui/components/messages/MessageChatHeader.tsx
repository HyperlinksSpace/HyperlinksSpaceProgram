import { useMemo } from "react";
import { Platform, PixelRatio, Text, View, type ViewStyle } from "react-native";
import { useAppStrings } from "../../../locales/AppStringsContext";
import { FONT_UI_SANS_REGULAR, WEB_UI_SANS_STACK } from "../../fonts";
import { layout, type ThemeColors } from "../../theme";
import { useTelegram } from "../Telegram";
import { formatMessageChatSubheaderLabel, isMessageChatActionLive } from "./formatMessageChatSubheader";
import type { MessageChatRowData } from "./MessageChatRow";
import {
  MESSAGE_CHAT_HEADER_STRIP_HEIGHT_PX,
  MESSAGE_FONT_SIZE_PX,
  MESSAGE_LINE_HEIGHT_PX,
  MESSAGE_LIST_INLINE_EMOJI_SIZE_PX,
} from "./messageListLayout";
import { SpecialTelegramUserName } from "./SpecialTelegramUserName";
import { resolveTelegramUserAccentColor } from "./resolveTelegramUserAccentColor";

type Props = {
  chat: MessageChatRowData;
  colors: ThemeColors;
};

function menuStripRuleThickness(): number {
  if (Platform.OS === "web") {
    if (typeof window !== "undefined" && window.devicePixelRatio > 0) {
      return 1 / window.devicePixelRatio;
    }
    return 1;
  }
  return PixelRatio.roundToNearestPixel(1 / PixelRatio.get());
}

/** Centered title (name + status badge) and multifunction subheader for the open chat. */
export function MessageChatHeader({ chat, colors }: Props) {
  const { locale } = useAppStrings();
  const { colorScheme } = useTelegram();
  const lineT = menuStripRuleThickness();
  const stripPaddingX = layout.contentSideInsetPx;
  const title = chat.title.trim();
  const titleColor =
    resolveTelegramUserAccentColor(
      chat.peer_accent_color_light,
      chat.peer_accent_color_dark,
      colorScheme,
    ) ?? colors.primary;
  const subheaderLabel = formatMessageChatSubheaderLabel(chat, locale);
  const subheaderIsLiveAction = isMessageChatActionLive(chat);

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
        overflow: "visible",
      }}
    >
      <View
        style={{
          ...Platform.select<ViewStyle>({
            default: {},
            web: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0 },
          }),
          justifyContent: "center",
          alignItems: "center",
          paddingHorizontal: stripPaddingX,
        }}
      >
        <View style={{ maxWidth: "100%", alignItems: "center" }}>
          <SpecialTelegramUserName
            name={title}
            telegramUserId={chat.peer_user_id ?? null}
            telegramChatId={chat.telegram_chat_id}
            emojiStatusCustomEmojiId={chat.peer_emoji_status_custom_emoji_id ?? null}
            emojiStatusPriority
            inlineEmojiFetchEnabled
            inlineEmojiFetchPriority
            inlineEmojiSizePx={MESSAGE_LIST_INLINE_EMOJI_SIZE_PX}
            textAlign="center"
            numberOfLines={1}
            textStyle={{
              ...textBase,
              color: titleColor,
            }}
          />
          {subheaderLabel ? (
            <Text
              numberOfLines={1}
              ellipsizeMode="tail"
              style={{
                ...textBase,
                color: subheaderIsLiveAction ? colors.accent : colors.secondary,
                textAlign: "center",
                maxWidth: "100%",
                marginTop: 0,
              }}
            >
              {subheaderLabel}
            </Text>
          ) : null}
        </View>
      </View>
      <View pointerEvents="none" collapsable={false} style={borderLineStyle} />
    </View>
  );
}
