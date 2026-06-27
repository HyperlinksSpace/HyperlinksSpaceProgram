import { useCallback, useEffect, useMemo, useState } from "react";
import { Platform, Text, View, type TextLayoutEvent } from "react-native";
import { Image } from "expo-image";
import { buildApiUrl } from "../../../api/_base";
import { TELEGRAM_THREAD_NO_AVATAR } from "../../../shared/telegramThreadConstants";
import { typographyRect15 } from "../../theme";
import type { ThemeColors } from "../../theme";
import { useTelegram } from "../Telegram";
import { ChatAvatarFallback } from "./ChatAvatarFallback";
import { extractChatAvatarInitials } from "./chatAvatarInitials";
import { MessageChatBubbleBody } from "./MessageChatBubbleBody";
import { formatMessageChatBubbleTime } from "./formatMessageChatBubbleTime";
import type { MessageChatHistoryItem, MessageChatKind } from "./messageChatHistoryTypes";
import {
  measureLongestWrappedBodyLineWidth,
  measureMessageBubbleOuterWidth,
  measureTextGlyphWidth,
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

function fittedBubbleWidthFromTextLayout(event: TextLayoutEvent, columnWidth: number): number {
  const lines = event.nativeEvent.lines;
  if (lines.length === 0) return 0;
  const longestLine = Math.max(...lines.map((line) => line.width));
  return Math.min(
    columnWidth,
    Math.ceil(longestLine) + MESSAGE_BUBBLE_PADDING_HORIZONTAL_PX * 2,
  );
}

type Props = {
  chat: MessageChatRowData;
  chatKind: MessageChatKind | null;
  item: MessageChatHistoryItem;
  colors: ThemeColors;
  columnWidthPx: number;
};

export function MessageChatMessageRow({ chat, chatKind, item, colors, columnWidthPx }: Props) {
  const iconUrl = resolveMessageAvatarUrl(chat, item);
  const avatarInitials = useMemo(
    () => extractChatAvatarInitials(item.sender_name || chat.title),
    [item.sender_name, chat.title],
  );
  const [avatarLoadFailed, setAvatarLoadFailed] = useState(false);
  const [nativeBubbleWidth, setNativeBubbleWidth] = useState<number | null>(null);
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

  const bodyText = item.text.trim();
  const timeLabel = formatMessageChatBubbleTime(item.sent_at);
  const showMedia =
    Boolean(item.has_media) &&
    (item.content_kind === "photo" ||
      item.content_kind === "video" ||
      item.content_kind === "animation");
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

  const webBubbleWidth = useMemo(() => {
    if (Platform.OS !== "web" || bubbleMaxWidth <= 0) return null;
    return measureMessageBubbleOuterWidth(
      bodyText,
      bubbleMaxWidth,
      extraInnerWidthPx,
      timeLabel,
    );
  }, [bodyText, bubbleMaxWidth, extraInnerWidthPx, timeLabel]);

  const onMeasureTextLayout = useCallback(
    (event: TextLayoutEvent) => {
      if (Platform.OS === "web" || bubbleMaxWidth <= 0) return;
      const measured = fittedBubbleWidthFromTextLayout(event, bubbleMaxWidth);
      const fromExtra = Math.min(
        bubbleMaxWidth,
        extraInnerWidthPx + MESSAGE_BUBBLE_PADDING_HORIZONTAL_PX * 2,
      );
      const next = Math.max(measured, fromExtra);
      if (next <= 0) return;
      setNativeBubbleWidth((current) => (current === next ? current : next));
    },
    [bubbleMaxWidth, extraInnerWidthPx],
  );

  useEffect(() => {
    setNativeBubbleWidth(null);
  }, [bodyText, bubbleMaxWidth, extraInnerWidthPx, timeLabel]);

  const bubbleWidth = Platform.OS === "web" ? webBubbleWidth : nativeBubbleWidth;
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
              borderRadius: MESSAGE_BUBBLE_BORDER_RADIUS_PX,
              paddingHorizontal: MESSAGE_BUBBLE_PADDING_HORIZONTAL_PX,
              paddingVertical: MESSAGE_BUBBLE_PADDING_VERTICAL_PX,
              backgroundColor: colors.undercover,
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
          />
        </View>
      </View>
    </View>
  );
}
