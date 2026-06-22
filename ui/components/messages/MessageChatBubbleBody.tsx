import { createElement, useMemo } from "react";
import { Platform, Text, View } from "react-native";
import { buildApiUrl } from "../../../api/_base";
import { useAppStrings } from "../../../locales/AppStringsContext";
import { FONT_UI_SANS_REGULAR, WEB_UI_SANS_STACK } from "../../fonts";
import { typographyRect15, type ThemeColors } from "../../theme";
import { useTelegram } from "../Telegram";
import { formatMessageChatBubbleTime } from "./formatMessageChatBubbleTime";
import { groupSenderDisplayColor } from "./groupSenderColor";
import type { MessageChatHistoryItem, MessageChatKind, MessageChatReplyPreview } from "./messageChatHistoryTypes";
import { isGroupLikeChatKind } from "./messageChatHistoryTypes";
import {
  MESSAGE_BUBBLE_FONT_SIZE_PX,
  MESSAGE_BUBBLE_LINE_HEIGHT_PX,
  MESSAGE_BUBBLE_TIME_FONT_SIZE_PX,
  MESSAGE_BUBBLE_TIME_LINE_HEIGHT_PX,
  MESSAGE_BUBBLE_TIME_MIN_WIDTH_PX,
} from "./messageChatLayout";
import { MessageChatMediaImage } from "./MessageChatMediaImage";
import { shouldInlineBubbleTime } from "./messageChatBubbleMeasure";

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

function MessageChatReplyBlock({
  reply,
  colors,
  maxWidthPx,
}: {
  reply: MessageChatReplyPreview;
  colors: ThemeColors;
  maxWidthPx: number;
}) {
  const { colorScheme } = useTelegram();
  const barColor = groupSenderDisplayColor(
    reply.sender_user_id,
    null,
    reply.sender_name,
    colorScheme,
  );

  return (
    <View
      style={{
        flexDirection: "row",
        maxWidth: maxWidthPx,
        marginBottom: 6,
        borderRadius: 6,
        overflow: "hidden",
        backgroundColor: colors.highlight,
      }}
    >
      <View style={{ width: 3, backgroundColor: barColor, flexShrink: 0 }} />
      <View style={{ flex: 1, paddingVertical: 5, paddingHorizontal: 8, minWidth: 0 }}>
        <Text
          numberOfLines={1}
          style={[
            typographyRect15,
            {
              fontSize: MESSAGE_BUBBLE_FONT_SIZE_PX,
              lineHeight: MESSAGE_BUBBLE_LINE_HEIGHT_PX,
              fontWeight: "500",
              color: barColor,
              textAlign: "left",
            },
            Platform.OS === "web" ? ({ fontFamily: WEB_UI_SANS_STACK } as object) : null,
          ]}
        >
          {reply.sender_name}
        </Text>
        <Text
          numberOfLines={2}
          style={[
            typographyRect15,
            {
              fontSize: MESSAGE_BUBBLE_FONT_SIZE_PX,
              lineHeight: MESSAGE_BUBBLE_LINE_HEIGHT_PX,
              fontWeight: "400",
              color: colors.secondary,
              textAlign: "left",
            },
            Platform.OS === "web" ? ({ fontFamily: WEB_UI_SANS_STACK } as object) : null,
          ]}
        >
          {reply.text}
        </Text>
      </View>
    </View>
  );
}

export function MessageChatBubbleBody({ chatId, item, chatKind, colors, maxWidthPx }: Props) {
  const { t } = useAppStrings();
  const { colorScheme } = useTelegram();
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
  const replyTo = item.reply_to ?? null;
  const mediaWidthPx = Math.min(maxWidthPx, 320);
  const mediaHeightPx = Math.min(maxWidthPx, 320);

  const senderColor = groupSenderDisplayColor(
    item.sender_user_id,
    item.sender_chat_id ?? null,
    item.sender_name,
    colorScheme,
  );

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

  const metaStyle = {
    fontSize: MESSAGE_BUBBLE_TIME_FONT_SIZE_PX,
    lineHeight: MESSAGE_BUBBLE_TIME_LINE_HEIGHT_PX,
    color: colors.secondary,
    fontFamily: Platform.OS === "web" ? WEB_UI_SANS_STACK : FONT_UI_SANS_REGULAR,
  } as const;

  const inlineTime =
    Platform.OS === "web" &&
    bodyText &&
    timeLabel &&
    shouldInlineBubbleTime(bodyText, timeLabel, maxWidthPx);

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
          inlineTime && timeLabel
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
          bodyText || null,
          !inlineTime && timeLabel && bodyText
            ? createElement(
                "div",
                {
                  style: {
                    clear: "both",
                    textAlign: "right",
                    marginTop: 2,
                    fontSize: MESSAGE_BUBBLE_TIME_FONT_SIZE_PX,
                    lineHeight: `${MESSAGE_BUBBLE_TIME_LINE_HEIGHT_PX}px`,
                    color: colors.secondary,
                    userSelect: "none",
                  },
                },
                timeLabel,
              )
            : null,
          !bodyText && timeLabel && !showMedia
            ? createElement(
                "div",
                {
                  style: {
                    textAlign: "right",
                    fontSize: MESSAGE_BUBBLE_TIME_FONT_SIZE_PX,
                    lineHeight: `${MESSAGE_BUBBLE_TIME_LINE_HEIGHT_PX}px`,
                    color: colors.secondary,
                    userSelect: "none",
                  },
                },
                timeLabel,
              )
            : null,
        )
      : null;

  return (
    <View style={{ maxWidth: maxWidthPx, alignSelf: "flex-start" }}>
      {replyTo ? (
        <MessageChatReplyBlock reply={replyTo} colors={colors} maxWidthPx={maxWidthPx} />
      ) : null}

      {showSenderHeader ? (
        <Text
          style={[
            typographyRect15,
            {
              fontSize: MESSAGE_BUBBLE_FONT_SIZE_PX,
              lineHeight: MESSAGE_BUBBLE_LINE_HEIGHT_PX,
              fontWeight: "500",
              color: senderColor,
              textAlign: "left",
            },
            Platform.OS === "web" ? ({ fontFamily: WEB_UI_SANS_STACK } as object) : null,
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
        <View
          style={{
            marginTop: showSenderHeader || showChannelBadge ? 4 : 0,
            marginBottom: bodyText ? 8 : 0,
          }}
        >
          <MessageChatMediaImage
            uri={mediaUrl}
            widthPx={mediaWidthPx}
            heightPx={mediaHeightPx}
            colors={colors}
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

      {Platform.OS !== "web" && showMedia && timeLabel && !bodyText ? (
        <Text style={[metaStyle, { alignSelf: "flex-end", marginTop: 4 }]}>{timeLabel}</Text>
      ) : null}

      {Platform.OS === "web" ? (
        webTextBlock
      ) : bodyText || (timeLabel && !showMedia) ? (
        <View style={{ marginTop: showSenderHeader || showChannelBadge || showMedia ? 4 : 0 }}>
          {bodyText ? (
            <Text style={[...textStyle, { textAlign: "left" }]}>{bodyText}</Text>
          ) : null}
          {timeLabel && bodyText ? (
            <Text style={[metaStyle, { alignSelf: "flex-end", marginTop: 2 }]}>{timeLabel}</Text>
          ) : null}
          {timeLabel && !bodyText && !showMedia ? (
            <Text style={[metaStyle, { alignSelf: "flex-end" }]}>{timeLabel}</Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
