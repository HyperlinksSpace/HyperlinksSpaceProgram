import { useMemo } from "react";
import { Platform, Text, View, type StyleProp, type TextStyle } from "react-native";
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
import { isDisplayableMediaMessage, isGroupLikeChatKind, resolveMessageOutgoingStatus } from "./messageChatHistoryTypes";
import {
  MESSAGE_BUBBLE_BORDER_RADIUS_PX,
  MESSAGE_BUBBLE_FONT_SIZE_PX,
  MESSAGE_BUBBLE_LINE_HEIGHT_PX,
  MESSAGE_BUBBLE_META_GAP_PX,
  MESSAGE_BUBBLE_PADDING_HORIZONTAL_PX,
  MESSAGE_BUBBLE_PADDING_VERTICAL_PX,
  MESSAGE_BUBBLE_TIME_FONT_SIZE_PX,
  MESSAGE_BUBBLE_TIME_LINE_HEIGHT_PX,
  messageBubbleMediaMetaBottomPx,
} from "./messageChatLayout";
import type { BubbleMetaPlacement } from "./messageChatBubbleMeasure";
import {
  MessageChatMediaContent,
  messageMediaShowsProgressBar,
  resolveMessageMediaDimensions,
} from "./MessageChatMediaContent";
import {
  MessageChatOutgoingChecks,
} from "./MessageChatOutgoingChecks";
import {
  MessageChatCallArrow,
  messageChatCallArrowWidthPx,
} from "./MessageChatCallArrow";
import { formatMessageCallLabel } from "./formatMessageCallLabel";
import { MessageChatLinkifiedText } from "./MessageChatLinkifiedText";
import { SpecialTelegramUserName } from "./SpecialTelegramUserName";

type Props = {
  chatId: number;
  item: MessageChatHistoryItem;
  chatKind: MessageChatKind | null;
  colors: ThemeColors;
  maxWidthPx: number;
  metaPlacement?: BubbleMetaPlacement;
};

function resolveMediaUrl(chatId: number, messageId: number): string {
  return buildApiUrl(
    `/api/telegram-messages-media?chat_id=${chatId}&message_id=${messageId}`,
  );
}

function MessageChatBubbleTextContent({
  bodyText,
  timeLabel,
  outgoingStatus,
  colors,
  maxWidthPx,
  textStyle,
  marginTop = 0,
  metaPlacement = "stacked",
  callIndicator = null,
}: {
  bodyText: string;
  timeLabel: string;
  outgoingStatus: ReturnType<typeof resolveMessageOutgoingStatus>;
  colors: ThemeColors;
  maxWidthPx: number;
  textStyle: StyleProp<TextStyle>;
  marginTop?: number;
  metaPlacement?: BubbleMetaPlacement;
  callIndicator?: { outgoing: boolean; successful: boolean } | null;
}) {
  if (!bodyText && !timeLabel) return null;

  const timeRow = timeLabel ? (
    <MessageChatBubbleTimeRow
      timeLabel={timeLabel}
      colors={colors}
      outgoingStatus={outgoingStatus}
      alignSelf={metaPlacement === "stacked" ? "flex-end" : undefined}
      alignWithBodyBaseline={metaPlacement === "inline" || metaPlacement === "lastLine"}
      callIndicator={callIndicator}
    />
  ) : null;

  if (metaPlacement === "inline" && bodyText && timeLabel) {
    return (
      <View
        style={{
          marginTop,
          flexDirection: "row",
          alignItems: "baseline",
          alignSelf: "flex-start",
          maxWidth: maxWidthPx,
          minHeight: MESSAGE_BUBBLE_LINE_HEIGHT_PX,
        }}
      >
        <MessageChatLinkifiedText
          text={bodyText}
          style={[textStyle, { textAlign: "left", flexShrink: 0 }]}
        />
        <View
          style={{
            marginLeft: MESSAGE_BUBBLE_META_GAP_PX,
            flexShrink: 0,
          }}
        >
          {timeRow}
        </View>
      </View>
    );
  }

  if (metaPlacement === "lastLine" && bodyText && timeLabel) {
    return (
      <View
        style={{
          marginTop,
          alignSelf: "flex-start",
          width: maxWidthPx,
          maxWidth: maxWidthPx,
        }}
      >
        <MessageChatLinkifiedText text={bodyText} style={[textStyle, { textAlign: "left" }]} />
        <View
          style={{
            flexDirection: "row",
            justifyContent: "flex-end",
            alignItems: "baseline",
            marginTop: -MESSAGE_BUBBLE_LINE_HEIGHT_PX,
            height: MESSAGE_BUBBLE_LINE_HEIGHT_PX,
          }}
        >
          {timeRow}
        </View>
      </View>
    );
  }

  return (
    <View
      style={{
        marginTop,
        alignSelf: "flex-start",
        width: maxWidthPx,
        maxWidth: maxWidthPx,
      }}
    >
      {bodyText ? (
        <MessageChatLinkifiedText text={bodyText} style={[textStyle, { textAlign: "left" }]} />
      ) : null}
      {timeRow}
    </View>
  );
}

function MessageChatBubbleTimeRow({
  timeLabel,
  colors,
  outgoingStatus,
  alignSelf = "flex-end",
  alignWithBodyBaseline = false,
  lightOnMedia = false,
  callIndicator = null,
}: {
  timeLabel: string;
  colors: ThemeColors;
  outgoingStatus: ReturnType<typeof resolveMessageOutgoingStatus>;
  alignSelf?: "flex-end" | "flex-start";
  alignWithBodyBaseline?: boolean;
  lightOnMedia?: boolean;
  callIndicator?: { outgoing: boolean; successful: boolean } | null;
}) {
  const showChecks =
    outgoingStatus === "delivered" || outgoingStatus === "read";
  const metaStyle = {
    fontSize: MESSAGE_BUBBLE_TIME_FONT_SIZE_PX,
    lineHeight: MESSAGE_BUBBLE_TIME_LINE_HEIGHT_PX,
    color: lightOnMedia ? "rgba(255,255,255,0.92)" : colors.secondary,
    fontFamily: Platform.OS === "web" ? WEB_UI_SANS_STACK : FONT_UI_SANS_REGULAR,
    ...(alignWithBodyBaseline && Platform.OS === "web"
      ? ({ display: "inline" } as object)
      : null),
  } as const;

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: alignWithBodyBaseline ? "baseline" : "center",
        alignSelf,
        ...(lightOnMedia && Platform.OS === "web"
          ? ({ textShadow: "0 1px 2px rgba(0,0,0,0.65)" } as object)
          : null),
        ...(alignWithBodyBaseline && Platform.OS === "web"
          ? ({ display: "inline-flex", verticalAlign: "baseline" } as object)
          : null),
      }}
    >
      {callIndicator ? (
        <View
          style={
            alignWithBodyBaseline
              ? { marginBottom: Platform.OS === "web" ? 0 : 1 }
              : undefined
          }
        >
          <MessageChatCallArrow
            outgoing={callIndicator.outgoing}
            successful={callIndicator.successful}
          />
        </View>
      ) : null}
      <Text style={metaStyle}>{timeLabel}</Text>
      {showChecks ? (
        <View
          style={
            alignWithBodyBaseline
              ? { marginBottom: Platform.OS === "web" ? 0 : 1 }
              : undefined
          }
        >
          <MessageChatOutgoingChecks
            status={outgoingStatus!}
            colors={colors}
            onMedia={lightOnMedia}
          />
        </View>
      ) : null}
    </View>
  );
}

function messageChatOnMediaMetaTextStyle(colors: ThemeColors) {
  return {
    fontSize: MESSAGE_BUBBLE_TIME_FONT_SIZE_PX,
    lineHeight: MESSAGE_BUBBLE_TIME_LINE_HEIGHT_PX,
    color: "rgba(255,255,255,0.92)",
    fontFamily: Platform.OS === "web" ? WEB_UI_SANS_STACK : FONT_UI_SANS_REGULAR,
    ...(Platform.OS === "web" ? ({ textShadow: "0 1px 2px rgba(0,0,0,0.65)" } as object) : null),
  } as const;
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
        <MessageChatLinkifiedText
          text={reply.text}
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
        />
      </View>
    </View>
  );
}

export function MessageChatBubbleBody({
  chatId,
  item,
  chatKind,
  colors,
  maxWidthPx,
  metaPlacement = "stacked",
}: Props) {
  const { t } = useAppStrings();
  const { colorScheme } = useTelegram();
  const timeLabel = formatMessageChatBubbleTime(item.sent_at);
  const outgoingStatusRaw = resolveMessageOutgoingStatus(item);
  const outgoingStatus =
    outgoingStatusRaw === "read" && chatKind !== "private" ? "delivered" : outgoingStatusRaw;
  const showSenderHeader =
    isGroupLikeChatKind(chatKind) && !item.is_outgoing && item.sender_name.trim().length > 0;
  const showChannelBadge = Boolean(item.sender_is_channel);
  const contentKind: MessageChatContentKind = item.content_kind ?? "other";
  const isCall = contentKind === "call";
  const bodyText = isCall
    ? formatMessageCallLabel(item.is_outgoing, t)
    : item.text.trim();
  const showMedia = isDisplayableMediaMessage(item);
  const mediaHasProgress = messageMediaShowsProgressBar(contentKind);
  const overlayMediaMeta =
    showMedia &&
    !bodyText &&
    (contentKind === "video" ||
      contentKind === "animation" ||
      contentKind === "photo" ||
      contentKind === "sticker");
  const mediaUrl = showMedia ? resolveMediaUrl(chatId, item.telegram_message_id) : null;
  const callIndicator = isCall
    ? { outgoing: item.is_outgoing, successful: Boolean(item.call_success) }
    : null;
  const replyTo = item.reply_to ?? null;
  const { widthPx: mediaWidthPx, heightPx: mediaHeightPx } = resolveMessageMediaDimensions(
    maxWidthPx,
    item.media_width,
    item.media_height,
    contentKind,
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
        ...(Platform.OS === "web" ? ({ fontFamily: WEB_UI_SANS_STACK } as object) : null),
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
          {contentKind === "animation" && overlayMediaMeta ? (
            <View
              pointerEvents="none"
              style={{
                position: "absolute",
                left: 8,
                top: 6,
              }}
            >
              <Text style={messageChatOnMediaMetaTextStyle(colors)}>gif</Text>
            </View>
          ) : null}
          {overlayMediaMeta && timeLabel ? (
            <View
              pointerEvents="none"
              style={{
                position: "absolute",
                right: MESSAGE_BUBBLE_PADDING_HORIZONTAL_PX,
                bottom: messageBubbleMediaMetaBottomPx(mediaHasProgress),
              }}
            >
              <MessageChatBubbleTimeRow
                timeLabel={timeLabel}
                colors={colors}
                outgoingStatus={outgoingStatus}
                alignSelf="flex-end"
                lightOnMedia
                callIndicator={callIndicator}
              />
            </View>
          ) : null}
        </View>
      ) : null}

      {bodyText || (timeLabel && !showMedia) ? (
        <View
          style={
            showMedia && bodyText
              ? {
                  alignSelf: "flex-start",
                  maxWidth: maxWidthPx,
                  marginTop: 4,
                  borderRadius: MESSAGE_BUBBLE_BORDER_RADIUS_PX,
                  paddingHorizontal: MESSAGE_BUBBLE_PADDING_HORIZONTAL_PX,
                  paddingVertical: MESSAGE_BUBBLE_PADDING_VERTICAL_PX,
                  backgroundColor: colors.undercover,
                }
              : undefined
          }
        >
          <MessageChatBubbleTextContent
            bodyText={bodyText}
            timeLabel={showMedia && bodyText ? timeLabel : showMedia ? "" : timeLabel}
            outgoingStatus={outgoingStatus}
            colors={colors}
            maxWidthPx={maxWidthPx}
            textStyle={textStyle}
            marginTop={
              showMedia && bodyText
                ? 0
                : showSenderHeader || showChannelBadge || showMedia
                  ? 4
                  : 0
            }
            metaPlacement={metaPlacement}
            callIndicator={callIndicator}
          />
        </View>
      ) : null}
    </View>
  );
}
