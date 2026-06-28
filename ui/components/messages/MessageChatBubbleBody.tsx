import { createElement, useMemo } from "react";
import { Platform, Text, View } from "react-native";
import { buildApiUrl } from "../../../api/_base";
import { useAppStrings } from "../../../locales/AppStringsContext";
import { FONT_UI_SANS_REGULAR, WEB_UI_SANS_STACK } from "../../fonts";
import { typographyRect15, type ThemeColors } from "../../theme";
import { useTelegram } from "../Telegram";
import { formatMessageChatBubbleTime } from "./formatMessageChatBubbleTime";
import { groupSenderDisplayColor } from "./groupSenderColor";
import type {
  MessageChatContentKind,
  MessageChatHistoryItem,
  MessageChatKind,
  MessageChatReplyPreview,
} from "./messageChatHistoryTypes";
import { isGroupLikeChatKind } from "./messageChatHistoryTypes";
import {
  MESSAGE_BUBBLE_FONT_SIZE_PX,
  MESSAGE_BUBBLE_LINE_HEIGHT_PX,
  MESSAGE_BUBBLE_TIME_FONT_SIZE_PX,
  MESSAGE_BUBBLE_TIME_LINE_HEIGHT_PX,
} from "./messageChatLayout";
import {
  MessageChatMediaContent,
  resolveMessageMediaDimensions,
} from "./MessageChatMediaContent";
import {
  MessageChatOutgoingChecks,
} from "./MessageChatOutgoingChecks";
import { SpecialTelegramUserName } from "./SpecialTelegramUserName";

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

function webTimeTail(
  timeLabel: string,
  colors: ThemeColors,
  outgoingStatus: Props["item"]["outgoing_status"],
) {
  const showChecks =
    outgoingStatus === "delivered" || outgoingStatus === "read";
  return createElement(
    "span",
    {
      className: "hsp-message-bubble-time-tail",
      style: {
        display: "inline-flex",
        alignItems: "center",
        verticalAlign: "bottom",
        height: 0,
        float: "right",
        clear: "right",
      },
    },
    createElement(
      "span",
      {
        className: "hsp-message-bubble-time",
        style: {
          display: "inline-flex",
          alignItems: "center",
          marginLeft: 6,
          fontSize: MESSAGE_BUBBLE_TIME_FONT_SIZE_PX,
          lineHeight: `${MESSAGE_BUBBLE_TIME_LINE_HEIGHT_PX}px`,
          color: colors.secondary,
          userSelect: "none",
          whiteSpace: "nowrap",
        },
      },
      timeLabel,
      showChecks
        ? createElement(MessageChatOutgoingChecks, {
            status: outgoingStatus!,
            colors,
          })
        : null,
    ),
  );
}

function webBubbleTextBlock(
  bodyText: string,
  timeLabel: string,
  maxWidthPx: number,
  colors: ThemeColors,
  outgoingStatus: Props["item"]["outgoing_status"],
) {
  return createElement(
    "div",
    {
      className: "hsp-message-bubble-text-block",
      style: {
        display: "flow-root",
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
    bodyText || null,
    timeLabel ? webTimeTail(timeLabel, colors, outgoingStatus) : null,
  );
}

function MessageChatBubbleTimeRow({
  timeLabel,
  colors,
  outgoingStatus,
  alignSelf = "flex-end",
  marginTop = 0,
  lightOnMedia = false,
}: {
  timeLabel: string;
  colors: ThemeColors;
  outgoingStatus: Props["item"]["outgoing_status"];
  alignSelf?: "flex-end" | "flex-start";
  marginTop?: number;
  lightOnMedia?: boolean;
}) {
  const showChecks =
    outgoingStatus === "delivered" || outgoingStatus === "read";
  const metaStyle = {
    fontSize: MESSAGE_BUBBLE_TIME_FONT_SIZE_PX,
    lineHeight: MESSAGE_BUBBLE_TIME_LINE_HEIGHT_PX,
    color: lightOnMedia ? "rgba(255,255,255,0.92)" : colors.secondary,
    fontFamily: Platform.OS === "web" ? WEB_UI_SANS_STACK : FONT_UI_SANS_REGULAR,
  } as const;

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        alignSelf,
        marginTop,
      }}
    >
      <Text style={metaStyle}>{timeLabel}</Text>
      {showChecks ? (
        <MessageChatOutgoingChecks status={outgoingStatus!} colors={colors} />
      ) : null}
    </View>
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
        <SpecialTelegramUserName
          name={reply.sender_name}
          telegramUserId={reply.sender_user_id}
          textStyle={{
            ...typographyRect15,
            fontSize: MESSAGE_BUBBLE_FONT_SIZE_PX,
            lineHeight: MESSAGE_BUBBLE_LINE_HEIGHT_PX,
            fontWeight: "500",
            color: barColor,
            textAlign: "left",
            ...(Platform.OS === "web" ? ({ fontFamily: WEB_UI_SANS_STACK } as object) : null),
          }}
        />
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
  const outgoingStatus = item.is_outgoing ? (item.outgoing_status ?? null) : null;
  const showSenderHeader =
    isGroupLikeChatKind(chatKind) && !item.is_outgoing && item.sender_name.trim().length > 0;
  const showChannelBadge = Boolean(item.sender_is_channel);
  const contentKind: MessageChatContentKind = item.content_kind ?? "other";
  const showMedia =
    Boolean(item.has_media) &&
    (contentKind === "photo" || contentKind === "video" || contentKind === "animation");
  const mediaUrl = showMedia ? resolveMediaUrl(chatId, item.telegram_message_id) : null;
  const bodyText = item.text.trim();
  const replyTo = item.reply_to ?? null;
  const { widthPx: mediaWidthPx, heightPx: mediaHeightPx } = resolveMessageMediaDimensions(
    maxWidthPx,
    item.media_width,
    item.media_height,
  );

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

  return (
    <View style={{ maxWidth: maxWidthPx, alignSelf: "flex-start", width: showMedia ? mediaWidthPx : undefined }}>
      {replyTo ? (
        <MessageChatReplyBlock reply={replyTo} colors={colors} maxWidthPx={maxWidthPx} />
      ) : null}

      {showSenderHeader ? (
        <SpecialTelegramUserName
          name={item.sender_name}
          telegramUserId={item.sender_user_id}
          textStyle={{
            ...typographyRect15,
            fontSize: MESSAGE_BUBBLE_FONT_SIZE_PX,
            lineHeight: MESSAGE_BUBBLE_LINE_HEIGHT_PX,
            fontWeight: "500",
            color: senderColor,
            textAlign: "left",
            ...(Platform.OS === "web" ? ({ fontFamily: WEB_UI_SANS_STACK } as object) : null),
          }}
        />
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
            marginBottom: bodyText ? 6 : 0,
            position: "relative",
            alignSelf: "flex-start",
          }}
        >
          <MessageChatMediaContent
            uri={mediaUrl}
            contentKind={contentKind}
            widthPx={mediaWidthPx}
            heightPx={mediaHeightPx}
            colors={colors}
          />
          {Platform.OS === "web" && timeLabel && !bodyText ? (
            createElement(
              "div",
              {
                style: {
                  position: "absolute",
                  right: 8,
                  bottom: 6,
                  display: "flex",
                  flexDirection: "row",
                  alignItems: "center",
                  fontSize: MESSAGE_BUBBLE_TIME_FONT_SIZE_PX,
                  lineHeight: `${MESSAGE_BUBBLE_TIME_LINE_HEIGHT_PX}px`,
                  color: "rgba(255,255,255,0.92)",
                  fontFamily: WEB_UI_SANS_STACK,
                  userSelect: "none",
                  textShadow: "0 1px 2px rgba(0,0,0,0.65)",
                  pointerEvents: "none",
                },
              },
              timeLabel,
              outgoingStatus === "delivered" || outgoingStatus === "read"
                ? createElement(MessageChatOutgoingChecks, {
                    status: outgoingStatus,
                    colors,
                    onMedia: true,
                  })
                : null,
            )
          ) : null}
        </View>
      ) : null}

      {Platform.OS !== "web" && showMedia && timeLabel && !bodyText ? (
        <MessageChatBubbleTimeRow
          timeLabel={timeLabel}
          colors={colors}
          outgoingStatus={outgoingStatus}
          alignSelf="flex-end"
          marginTop={4}
        />
      ) : null}

      {Platform.OS === "web" && (bodyText || (timeLabel && !showMedia))
        ? webBubbleTextBlock(bodyText, timeLabel, maxWidthPx, colors, outgoingStatus)
        : null}

      {Platform.OS !== "web" && (bodyText || (timeLabel && !showMedia)) ? (
        <View style={{ marginTop: showSenderHeader || showChannelBadge || showMedia ? 4 : 0 }}>
          {bodyText ? (
            <Text style={[...textStyle, { textAlign: "left" }]}>{bodyText}</Text>
          ) : null}
          {timeLabel ? (
            <MessageChatBubbleTimeRow
              timeLabel={timeLabel}
              colors={colors}
              outgoingStatus={outgoingStatus}
              alignSelf="flex-end"
              marginTop={bodyText ? 2 : 0}
            />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
