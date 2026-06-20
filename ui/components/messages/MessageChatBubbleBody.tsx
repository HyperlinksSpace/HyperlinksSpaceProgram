import { createElement, useMemo } from "react";
import { Platform, Text, View } from "react-native";
import { Image } from "expo-image";
import { buildApiUrl } from "../../../api/_base";
import { useAppStrings } from "../../../locales/AppStringsContext";
import { FONT_UI_SANS_REGULAR, WEB_UI_SANS_STACK } from "../../fonts";
import { typographyRect15, type ThemeColors } from "../../theme";
import { formatMessageChatBubbleTime } from "./formatMessageChatBubbleTime";
import type { MessageChatHistoryItem, MessageChatKind } from "./messageChatHistoryTypes";
import { isGroupLikeChatKind } from "./messageChatHistoryTypes";
import {
  MESSAGE_BUBBLE_FONT_SIZE_PX,
  MESSAGE_BUBBLE_LINE_HEIGHT_PX,
  MESSAGE_BUBBLE_MEDIA_BORDER_RADIUS_PX,
  MESSAGE_BUBBLE_TIME_FONT_SIZE_PX,
  MESSAGE_BUBBLE_TIME_LINE_HEIGHT_PX,
  MESSAGE_BUBBLE_TIME_MIN_WIDTH_PX,
} from "./messageChatLayout";

type Props = {
  chatId: number;
  item: MessageChatHistoryItem;
  chatKind: MessageChatKind | null;
  colors: ThemeColors;
  maxWidthPx: number;
};

function resolveMediaUrl(chatId: number, messageId: number): string {
  return buildApiUrl(
    `/api/telegram-messages-media?chat_id=${chatId}&message_id=${messageId}`,
  );
}

export function MessageChatBubbleBody({ chatId, item, chatKind, colors, maxWidthPx }: Props) {
  const { t } = useAppStrings();
  const timeLabel = formatMessageChatBubbleTime(item.sent_at);
  const showSenderHeader =
    isGroupLikeChatKind(chatKind) && !item.is_outgoing && item.sender_name.trim().length > 0;
  const showChannelBadge = Boolean(item.sender_is_channel);
  const showMedia =
    Boolean(item.has_media) &&
    (item.content_kind === "photo" ||
      item.content_kind === "video" ||
      item.content_kind === "animation");
  const mediaUrl = showMedia ? resolveMediaUrl(chatId, item.telegram_message_id) : null;
  const bodyText = item.text.trim();

  const textStyle = useMemo(
    () => [
      typographyRect15,
      {
        fontSize: MESSAGE_BUBBLE_FONT_SIZE_PX,
        lineHeight: MESSAGE_BUBBLE_LINE_HEIGHT_PX,
        fontWeight: "400" as const,
        color: colors.primary,
      },
    ],
    [colors.primary],
  );

  const senderStyle = useMemo(
    () => [
      typographyRect15,
      {
        fontSize: MESSAGE_BUBBLE_FONT_SIZE_PX,
        lineHeight: MESSAGE_BUBBLE_LINE_HEIGHT_PX,
        fontWeight: "700" as const,
        color: colors.primary,
      },
    ],
    [colors.primary],
  );

  const metaStyle = {
    fontSize: MESSAGE_BUBBLE_TIME_FONT_SIZE_PX,
    lineHeight: MESSAGE_BUBBLE_TIME_LINE_HEIGHT_PX,
    color: colors.secondary,
    fontFamily: Platform.OS === "web" ? WEB_UI_SANS_STACK : FONT_UI_SANS_REGULAR,
  } as const;

  const webTextBlock =
    Platform.OS === "web" && (bodyText || (timeLabel && !showMedia))
      ? createElement(
          "div",
          {
            className: "hsp-message-bubble-text-block",
            style: {
              maxWidth: maxWidthPx,
              fontFamily: WEB_UI_SANS_STACK,
              fontSize: MESSAGE_BUBBLE_FONT_SIZE_PX,
              lineHeight: `${MESSAGE_BUBBLE_LINE_HEIGHT_PX}px`,
              color: colors.primary,
              textAlign: "left",
              whiteSpace: "pre-wrap",
              overflowWrap: "break-word",
            },
          },
          timeLabel
            ? createElement(
                "span",
                {
                  className: "hsp-message-bubble-time",
                  style: {
                    float: "right",
                    clear: "right",
                    marginLeft: 8,
                    marginTop: Math.max(
                      0,
                      MESSAGE_BUBBLE_LINE_HEIGHT_PX - MESSAGE_BUBBLE_TIME_LINE_HEIGHT_PX,
                    ),
                    fontSize: MESSAGE_BUBBLE_TIME_FONT_SIZE_PX,
                    lineHeight: `${MESSAGE_BUBBLE_TIME_LINE_HEIGHT_PX}px`,
                    color: colors.secondary,
                    userSelect: "none",
                    minWidth: MESSAGE_BUBBLE_TIME_MIN_WIDTH_PX,
                    textAlign: "right",
                  },
                },
                timeLabel,
              )
            : null,
          bodyText,
        )
      : null;

  return (
    <View style={{ maxWidth: maxWidthPx, alignSelf: "flex-start" }}>
      {showSenderHeader ? (
        <Text
          style={[
            ...senderStyle,
            Platform.OS === "web"
              ? ({ fontFamily: WEB_UI_SANS_STACK, textAlign: "left" } as object)
              : { textAlign: "left" },
          ]}
        >
          {item.sender_name.trim()}
        </Text>
      ) : null}

      {showChannelBadge ? (
        <Text
          style={[
            metaStyle,
            {
              marginTop: showSenderHeader ? 2 : 0,
              marginBottom: bodyText || showMedia ? 4 : 0,
            },
          ]}
        >
          {t("messages.channelBadge")}
        </Text>
      ) : null}

      {showMedia && mediaUrl ? (
        <View>
          <Image
            source={{ uri: mediaUrl }}
            accessibilityIgnoresInvertColors
            style={{
              width: Math.min(maxWidthPx, 320),
              height: Math.min(maxWidthPx, 320),
              borderRadius: MESSAGE_BUBBLE_MEDIA_BORDER_RADIUS_PX,
              marginBottom: bodyText ? 8 : 0,
              marginTop: showSenderHeader || showChannelBadge ? 4 : 0,
            }}
            contentFit="cover"
          />
          {Platform.OS === "web" && timeLabel && !bodyText ? (
            createElement(
              "div",
              {
                style: {
                  textAlign: "right",
                  marginTop: 4,
                  fontSize: MESSAGE_BUBBLE_TIME_FONT_SIZE_PX,
                  lineHeight: `${MESSAGE_BUBBLE_TIME_LINE_HEIGHT_PX}px`,
                  color: colors.secondary,
                  fontFamily: WEB_UI_SANS_STACK,
                  userSelect: "none",
                },
              },
              timeLabel,
            )
          ) : null}
        </View>
      ) : null}

      {Platform.OS !== "web" && showMedia && mediaUrl && timeLabel && !bodyText ? (
        <Text style={[metaStyle, { alignSelf: "flex-end", marginTop: 4 }]}>{timeLabel}</Text>
      ) : null}

      {Platform.OS === "web" ? (
        webTextBlock
      ) : bodyText || (timeLabel && !showMedia) ? (
        <View style={{ marginTop: showSenderHeader || showChannelBadge || showMedia ? 4 : 0 }}>
          {bodyText ? (
            <Text style={[...textStyle, { textAlign: "left" }]}>{bodyText}</Text>
          ) : null}
          {timeLabel ? (
            <Text style={[metaStyle, { alignSelf: "flex-end", marginTop: bodyText ? 2 : 0 }]}>
              {timeLabel}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
