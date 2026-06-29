import { useCallback, useEffect, useMemo, useState } from "react";
import { Platform, Text, View, type TextLayoutEvent } from "react-native";
import { useAppStrings } from "../../../locales/AppStringsContext";
import { typographyRect15 } from "../../theme";
import type { ThemeColors } from "../../theme";
import { useTelegram } from "../Telegram";
import { ChatAvatarFallback } from "./ChatAvatarFallback";
import { MessageChatAvatarImage } from "./MessageChatAvatarImage";
import { extractChatAvatarInitials } from "./chatAvatarInitials";
import { MessageChatBubbleBody } from "./MessageChatBubbleBody";
import { formatMessageChatBubbleTime } from "./formatMessageChatBubbleTime";
import type { MessageChatHistoryItem, MessageChatKind } from "./messageChatHistoryTypes";
import {
  isDisplayableMediaMessage,
  resolveMessageOutgoingStatus,
} from "./messageChatHistoryTypes";
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
  MESSAGE_BUBBLE_META_GAP_PX,
  MESSAGE_BUBBLE_PADDING_HORIZONTAL_PX,
  MESSAGE_BUBBLE_PADDING_VERTICAL_PX,
} from "./messageChatLayout";
import { resolveMessageMediaDimensions } from "./MessageChatMediaContent";
import { messageChatOutgoingChecksWidthPx } from "./MessageChatOutgoingChecks";
import { messageChatCallArrowWidthPx } from "./MessageChatCallArrow";
import { formatMessageCallLabel } from "./formatMessageCallLabel";
import type { MessageChatRowData } from "./MessageChatRow";
import { resolveTelegramThreadAvatarUrl } from "./resolveTelegramThreadAvatarUrl";
import { specialUserBadgeExtraWidthPx, specialUserDisplayName } from "./specialTelegramUserDisplay";

function fittedBubbleLayoutFromTextLayout(
  event: TextLayoutEvent,
  columnWidth: number,
  innerMaxWidth: number,
  metaWidthPx: number,
  extraInnerWidthPx: number,
  bodyText: string,
): { width: number; innerWidthPx: number; placement: BubbleMetaPlacement } {
  const lines = event.nativeEvent.lines;
  if (lines.length === 0) {
    return { width: 0, innerWidthPx: 0, placement: "stacked" };
  }
  const trimmed = bodyText.trim();
  const lineWidths = lines.map((line, index, all) => {
    const width = line.width;
    if (all.length === 1 && trimmed.length > 0) {
      const glyphWidth = measureTextGlyphWidth(
        trimmed,
        MESSAGE_BUBBLE_FONT_SIZE_PX,
        MESSAGE_BUBBLE_LINE_HEIGHT_PX,
      );
      if (glyphWidth > 0) return Math.min(width, glyphWidth);
    }
    return width;
  });
  const placement = resolveBubbleMetaPlacementFromLineWidths(
    lineWidths,
    innerMaxWidth,
    metaWidthPx,
  );
  let inner = measureBubbleInnerContentWidth(
    lineWidths,
    placement,
    metaWidthPx,
    MESSAGE_BUBBLE_META_GAP_PX,
    trimmed,
  );
  inner = Math.max(inner, extraInnerWidthPx);
  const width = Math.min(
    columnWidth,
    inner + MESSAGE_BUBBLE_PADDING_HORIZONTAL_PX * 2,
  );
  return { width, innerWidthPx: inner, placement };
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
  const iconUrl = resolveTelegramThreadAvatarUrl(chat, item, chatKind);
  const avatarInitials = useMemo(() => {
    const name =
      chatKind === "channel"
        ? chat.title
        : item.is_outgoing
          ? item.sender_name || chat.title
          : item.sender_name || chat.title;
    return extractChatAvatarInitials(name);
  }, [chatKind, chat.title, item.is_outgoing, item.sender_name]);
  const [avatarLoadFailed, setAvatarLoadFailed] = useState(false);
  const [nativeBubbleLayout, setNativeBubbleLayout] = useState<{
    width: number;
    innerWidthPx: number;
    placement: BubbleMetaPlacement;
  } | null>(null);
  const [liveMediaWidthPx, setLiveMediaWidthPx] = useState<number | null>(null);
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
  const outgoingStatusForLayout = (() => {
    const status = resolveMessageOutgoingStatus(item);
    if (status === "read" && chatKind !== "private") return "delivered" as const;
    return status;
  })();
  const checksWidthPx = messageChatOutgoingChecksWidthPx(outgoingStatusForLayout);
  const callArrowWidthPx = messageChatCallArrowWidthPx(isCall);
  const metaWidthPx = measureMessageBubbleMetaWidthPx(
    timeLabel,
    checksWidthPx + callArrowWidthPx,
  );
  const showMedia = isDisplayableMediaMessage(item);
  const hasMediaCaption = showMedia && bodyText.length > 0;
  const isBareMediaMessage = showMedia && !hasMediaCaption && !isCall;
  const { widthPx: mediaWidthPx } = resolveMessageMediaDimensions(
    bubbleInnerMaxWidth,
    item.media_width,
    item.media_height,
    item.content_kind,
  );
  const effectiveMediaWidthPx = liveMediaWidthPx ?? mediaWidthPx;

  const extraInnerWidthPx = useMemo(() => {
    let extra = 0;
    if (showMedia) extra = Math.max(extra, effectiveMediaWidthPx);
    const senderName =
      chatKind === "channel"
        ? ""
        : specialUserDisplayName(item.sender_user_id, item.sender_name.trim());
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
  }, [bubbleInnerMaxWidth, chatKind, effectiveMediaWidthPx, item.reply_to, item.sender_name, showMedia]);

  useEffect(() => {
    setLiveMediaWidthPx(null);
  }, [item.telegram_message_id, item.content_kind, item.media_width, item.media_height]);

  const webBubbleLayout = useMemo(() => {
    if (Platform.OS !== "web" || bubbleMaxWidth <= 0) return null;
    if (isBareMediaMessage) {
      return {
        width: effectiveMediaWidthPx,
        innerWidthPx: effectiveMediaWidthPx,
        placement: "stacked" as BubbleMetaPlacement,
      };
    }
    const { placement, innerWidthPx } = resolveMessageBubbleLayout(
      bodyText,
      bubbleMaxWidth,
      metaWidthPx,
      extraInnerWidthPx,
    );
    return {
      innerWidthPx,
      width: Math.min(
        bubbleMaxWidth,
        showMedia && hasMediaCaption
          ? Math.max(
              effectiveMediaWidthPx,
              innerWidthPx + MESSAGE_BUBBLE_PADDING_HORIZONTAL_PX * 2,
            )
          : showMedia
            ? Math.max(effectiveMediaWidthPx, innerWidthPx)
            : innerWidthPx + MESSAGE_BUBBLE_PADDING_HORIZONTAL_PX * 2,
      ),
      placement,
    };
  }, [
    bodyText,
    bubbleInnerMaxWidth,
    bubbleMaxWidth,
    extraInnerWidthPx,
    effectiveMediaWidthPx,
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
        bodyText,
      );
      if (next.width <= 0) return;
      setNativeBubbleLayout((current) =>
        current?.width === next.width &&
        current.innerWidthPx === next.innerWidthPx &&
        current.placement === next.placement
          ? current
          : next,
      );
    },
    [bodyText, bubbleInnerMaxWidth, bubbleMaxWidth, extraInnerWidthPx, metaWidthPx],
  );

  useEffect(() => {
    setNativeBubbleLayout(null);
  }, [bodyText, bubbleMaxWidth, extraInnerWidthPx, metaWidthPx, timeLabel]);

  const bubbleLayout =
    Platform.OS === "web"
      ? webBubbleLayout
      : isBareMediaMessage
        ? {
            width: effectiveMediaWidthPx,
            innerWidthPx: effectiveMediaWidthPx,
            placement: "stacked" as BubbleMetaPlacement,
          }
        : nativeBubbleLayout;
  const metaPlacement = bubbleLayout?.placement ?? "stacked";
  const bubbleContentWidthPx = bubbleLayout?.innerWidthPx ?? bubbleInnerMaxWidth;
  const useWebFitContent =
    Platform.OS === "web" &&
    !isBareMediaMessage &&
    !(showMedia && hasMediaCaption) &&
    metaPlacement === "inline";
  const bubbleWidth = useWebFitContent ? null : bubbleLayout?.width ?? null;
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
          <MessageChatAvatarImage
            uri={iconUrl}
            sizePx={MESSAGE_BUBBLE_AVATAR_PX}
            onError={() => setAvatarLoadFailed(true)}
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
                    overflow: "visible",
                  }),
            },
            bubbleWidth != null && bubbleWidth > 0 && !useWebFitContent ? { width: bubbleWidth } : null,
            useWebFitContent
              ? ({ width: "fit-content", maxWidth: bubbleMaxWidth } as object)
              : null,
          ]}
        >
          <MessageChatBubbleBody
            chatId={chat.telegram_chat_id}
            item={item}
            chatKind={chatKind}
            colors={colors}
            maxWidthPx={bubbleContentWidthPx}
            mediaColumnMaxWidthPx={bubbleInnerMaxWidth}
            metaPlacement={metaPlacement}
            onMediaDisplaySizeChange={(widthPx) => setLiveMediaWidthPx(widthPx)}
          />
        </View>
      </View>
    </View>
  );
}
