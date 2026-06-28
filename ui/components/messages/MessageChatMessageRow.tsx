import { useCallback, useEffect, useMemo, useState } from "react";
import { Platform, Text, View, type TextLayoutEvent } from "react-native";
import { Image } from "expo-image";
import { buildApiUrl } from "../../../api/_base";
import { useAppStrings } from "../../../locales/AppStringsContext";
import { TELEGRAM_THREAD_NO_AVATAR } from "../../../shared/telegramThreadConstants";
import { typographyRect15 } from "../../theme";
import type { ThemeColors } from "../../theme";
import { useTelegram } from "../Telegram";
import { ChatAvatarFallback } from "./ChatAvatarFallback";
import { extractChatAvatarInitials } from "./chatAvatarInitials";
import { MessageChatBubbleBody } from "./MessageChatBubbleBody";
import { formatMessageChatBubbleTime } from "./formatMessageChatBubbleTime";
import type { MessageChatHistoryItem, MessageChatKind } from "./messageChatHistoryTypes";
import { resolveMessageOutgoingStatus } from "./messageChatHistoryTypes";
import {
  measureBubbleInnerContentWidth,
  measureLongestWrappedBodyLineWidth,
  measureMessageBubbleMetaWidthPx,
  measureTextGlyphWidth,
  resolveBubbleMetaPlacementFromLineWidths,
  resolveMessageBubbleLayout,
  type BubbleMetaPlacement,
} from "./messageChatBubbleMeasure";
import {
  MESSAGE_BUBBLE_AVATAR_GAP_PX,
  MESSAGE_BUBBLE_AVATAR_PX,
  MESSAGE_BUBBLE_BORDER_RADIUS_PX,
  MESSAGE_BUBBLE_FONT_SIZE_PX,
  MESSAGE_BUBBLE_LINE_HEIGHT_PX,
  MESSAGE_BUBBLE_PADDING_HORIZONTAL_PX,
  MESSAGE_BUBBLE_PADDING_VERTICAL_PX,
} from "./messageChatLayout";
import { resolveMessageMediaDimensions } from "./MessageChatMediaContent";
import { messageChatOutgoingChecksWidthPx } from "./MessageChatOutgoingChecks";
import { messageChatCallArrowWidthPx } from "./MessageChatCallArrow";
import { formatMessageCallLabel } from "./formatMessageCallLabel";
import type { MessageChatRowData } from "./MessageChatRow";
import { specialUserBadgeExtraWidthPx, specialUserDisplayName } from "./specialTelegramUserDisplay";

function resolveMessageAvatarUrl(
  chat: MessageChatRowData,
  item: MessageChatHistoryItem,
): string | null {
  if (item.sender_user_id != null) {
    return buildApiUrl(`/api/telegram-messages-avatar?user_id=${item.sender_user_id}`);
  }
  const avatarUrl = chat.avatar_url;
  if (avatarUrl === TELEGRAM_THREAD_NO_AVATAR) return null;
  if (!avatarUrl) {
    return buildApiUrl(`/api/telegram-messages-avatar?chat_id=${chat.telegram_chat_id}`);
  }
  if (avatarUrl.startsWith("data:")) return avatarUrl;
  if (avatarUrl.startsWith("http://") || avatarUrl.startsWith("https://")) return avatarUrl;
  return buildApiUrl(avatarUrl.startsWith("/") ? avatarUrl : `/${avatarUrl}`);
}

function fittedBubbleLayoutFromTextLayout(
  event: TextLayoutEvent,
  columnWidth: number,
  innerMaxWidth: number,
  metaWidthPx: number,
  extraInnerWidthPx: number,
): { width: number; placement: BubbleMetaPlacement } {
  const lines = event.nativeEvent.lines;
  if (lines.length === 0) {
    return { width: 0, placement: "stacked" };
  }
  const lineWidths = lines.map((line) => line.width);
  const placement = resolveBubbleMetaPlacementFromLineWidths(
    lineWidths,
    innerMaxWidth,
    metaWidthPx,
  );
  let inner = measureBubbleInnerContentWidth(lineWidths, placement, metaWidthPx);
  inner = Math.max(inner, extraInnerWidthPx);
  const width = Math.min(
    columnWidth,
    inner + MESSAGE_BUBBLE_PADDING_HORIZONTAL_PX * 2,
  );
  return { width, placement };
}

type Props = {
  chat: MessageChatRowData;
  chatKind: MessageChatKind | null;
  item: MessageChatHistoryItem;
  colors: ThemeColors;
  columnWidthPx: number;
};

export function MessageChatMessageRow({ chat, chatKind, item, colors, columnWidthPx }: Props) {
  const { t } = useAppStrings();
  const iconUrl = resolveMessageAvatarUrl(chat, item);
  const avatarInitials = useMemo(
    () => extractChatAvatarInitials(item.sender_name || chat.title),
    [item.sender_name, chat.title],
  );
  const [avatarLoadFailed, setAvatarLoadFailed] = useState(false);
  const [nativeBubbleLayout, setNativeBubbleLayout] = useState<{
    width: number;
    placement: BubbleMetaPlacement;
  } | null>(null);
  const showAvatarImage = !!iconUrl && !avatarLoadFailed;
  const { colorScheme } = useTelegram();

  useEffect(() => {
    setAvatarLoadFailed(false);
  }, [iconUrl]);

  const bubbleMaxWidth = Math.max(
    0,
    columnWidthPx - MESSAGE_BUBBLE_AVATAR_PX - MESSAGE_BUBBLE_AVATAR_GAP_PX,
  );

  const bubbleInnerMaxWidth = Math.max(
    0,
    bubbleMaxWidth - MESSAGE_BUBBLE_PADDING_HORIZONTAL_PX * 2,
  );

  const isCall = item.content_kind === "call";
  const bodyText = isCall ? formatMessageCallLabel(item.is_outgoing, t) : item.text.trim();
  const timeLabel = formatMessageChatBubbleTime(item.sent_at);
  const checksWidthPx = messageChatOutgoingChecksWidthPx(resolveMessageOutgoingStatus(item));
  const callArrowWidthPx = messageChatCallArrowWidthPx(isCall);
  const metaWidthPx = measureMessageBubbleMetaWidthPx(
    timeLabel,
    checksWidthPx + callArrowWidthPx,
  );
  const showMedia =
    Boolean(item.has_media) &&
    (item.content_kind === "photo" ||
      item.content_kind === "video" ||
      item.content_kind === "animation");
  const hasMediaCaption = showMedia && bodyText.length > 0;
  const isBareMediaMessage = showMedia && !hasMediaCaption && !isCall;
  const { widthPx: mediaWidthPx } = resolveMessageMediaDimensions(
    bubbleInnerMaxWidth,
    item.media_width,
    item.media_height,
  );

  const extraInnerWidthPx = useMemo(() => {
    let extra = 0;
    if (showMedia) extra = Math.max(extra, mediaWidthPx);
    const senderName = specialUserDisplayName(item.sender_user_id, item.sender_name.trim());
    if (senderName) {
      extra = Math.max(
        extra,
        measureTextGlyphWidth(
          senderName,
          MESSAGE_BUBBLE_FONT_SIZE_PX,
          MESSAGE_BUBBLE_LINE_HEIGHT_PX,
        ) + specialUserBadgeExtraWidthPx(item.sender_user_id, senderName),
      );
    }
    const reply = item.reply_to;
    if (reply) {
      const replySenderWidth = measureTextGlyphWidth(
        reply.sender_name,
        MESSAGE_BUBBLE_FONT_SIZE_PX,
        MESSAGE_BUBBLE_LINE_HEIGHT_PX,
      );
      const replyTextWidth = measureLongestWrappedBodyLineWidth(
        reply.text,
        Math.max(0, bubbleInnerMaxWidth - 12),
      );
      extra = Math.max(extra, replySenderWidth + 12, replyTextWidth + 12);
    }
    return extra;
  }, [bubbleInnerMaxWidth, item.reply_to, item.sender_name, mediaWidthPx, showMedia]);

  const webBubbleLayout = useMemo(() => {
    if (Platform.OS !== "web" || bubbleMaxWidth <= 0) return null;
    if (isBareMediaMessage) {
      return { width: mediaWidthPx, placement: "stacked" as BubbleMetaPlacement };
    }
    const { placement, innerWidthPx } = resolveMessageBubbleLayout(
      bodyText,
      bubbleMaxWidth,
      metaWidthPx,
      extraInnerWidthPx,
    );
    return {
      width: Math.min(
        bubbleMaxWidth,
        showMedia && hasMediaCaption
          ? Math.max(
              mediaWidthPx,
              innerWidthPx + MESSAGE_BUBBLE_PADDING_HORIZONTAL_PX * 2,
            )
          : showMedia
            ? Math.max(mediaWidthPx, innerWidthPx)
            : innerWidthPx + MESSAGE_BUBBLE_PADDING_HORIZONTAL_PX * 2,
      ),
      placement,
    };
  }, [
    bodyText,
    bubbleMaxWidth,
    extraInnerWidthPx,
    hasMediaCaption,
    isBareMediaMessage,
    mediaWidthPx,
    metaWidthPx,
    showMedia,
  ]);

  const onMeasureTextLayout = useCallback(
    (event: TextLayoutEvent) => {
      if (Platform.OS === "web" || bubbleMaxWidth <= 0) return;
      const next = fittedBubbleLayoutFromTextLayout(
        event,
        bubbleMaxWidth,
        bubbleInnerMaxWidth,
        metaWidthPx,
        extraInnerWidthPx,
      );
      if (next.width <= 0) return;
      setNativeBubbleLayout((current) =>
        current?.width === next.width && current.placement === next.placement ? current : next,
      );
    },
    [bubbleInnerMaxWidth, bubbleMaxWidth, extraInnerWidthPx, metaWidthPx],
  );

  useEffect(() => {
    setNativeBubbleLayout(null);
  }, [bodyText, bubbleMaxWidth, extraInnerWidthPx, metaWidthPx, timeLabel]);

  const bubbleLayout =
    Platform.OS === "web"
      ? webBubbleLayout
      : isBareMediaMessage
        ? { width: mediaWidthPx, placement: "stacked" as BubbleMetaPlacement }
        : nativeBubbleLayout;
  const bubbleWidth = bubbleLayout?.width ?? null;
  const metaPlacement = bubbleLayout?.placement ?? "stacked";
  const measureText = bodyText || " ";

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "flex-start",
        width: "100%",
        alignSelf: "stretch",
      }}
    >
      <View
        style={{
          width: MESSAGE_BUBBLE_AVATAR_PX,
          height: MESSAGE_BUBBLE_AVATAR_PX,
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        {showAvatarImage ? (
          <Image
            source={{ uri: iconUrl }}
            accessibilityIgnoresInvertColors
            onError={() => setAvatarLoadFailed(true)}
            style={{
              width: MESSAGE_BUBBLE_AVATAR_PX,
              height: MESSAGE_BUBBLE_AVATAR_PX,
              borderRadius: MESSAGE_BUBBLE_AVATAR_PX / 2,
            }}
            contentFit="cover"
          />
        ) : (
          <ChatAvatarFallback
            initials={avatarInitials}
            sizePx={MESSAGE_BUBBLE_AVATAR_PX}
            colors={colors}
            scheme={colorScheme}
          />
        )}
      </View>
      <View style={{ width: MESSAGE_BUBBLE_AVATAR_GAP_PX }} />
      <View style={{ alignSelf: "flex-start", maxWidth: bubbleMaxWidth }}>
        {Platform.OS !== "web" && bubbleMaxWidth > 0 ? (
          <Text
            style={[
              typographyRect15,
              {
                position: "absolute",
                opacity: 0,
                width: bubbleInnerMaxWidth,
                left: 0,
                top: 0,
                zIndex: -1,
                pointerEvents: "none",
                fontSize: MESSAGE_BUBBLE_FONT_SIZE_PX,
                lineHeight: MESSAGE_BUBBLE_LINE_HEIGHT_PX,
              },
            ]}
            onTextLayout={onMeasureTextLayout}
          >
            {measureText}
          </Text>
        ) : null}
        <View
          style={[
            {
              alignSelf: "flex-start",
              ...(showMedia
                ? {
                    backgroundColor: "transparent",
                    paddingHorizontal: 0,
                    paddingVertical: 0,
                    borderRadius: 0,
                  }
                : {
                    borderRadius: MESSAGE_BUBBLE_BORDER_RADIUS_PX,
                    paddingHorizontal: MESSAGE_BUBBLE_PADDING_HORIZONTAL_PX,
                    paddingVertical: MESSAGE_BUBBLE_PADDING_VERTICAL_PX,
                    backgroundColor: colors.undercover,
                  }),
            },
            bubbleWidth != null && bubbleWidth > 0 ? { width: bubbleWidth } : null,
          ]}
        >
          <MessageChatBubbleBody
            chatId={chat.telegram_chat_id}
            item={item}
            chatKind={chatKind}
            colors={colors}
            maxWidthPx={bubbleInnerMaxWidth}
            metaPlacement={metaPlacement}
          />
        </View>
      </View>
    </View>
  );
}
