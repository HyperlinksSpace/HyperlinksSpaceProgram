import { useEffect, useMemo, useState } from "react";
import { View } from "react-native";
import { Image } from "expo-image";
import { buildApiUrl } from "../../../api/_base";
import { TELEGRAM_THREAD_NO_AVATAR } from "../../../shared/telegramThreadConstants";
import type { ThemeColors } from "../../theme";
import { useTelegram } from "../Telegram";
import { ChatAvatarFallback } from "./ChatAvatarFallback";
import { extractChatAvatarInitials } from "./chatAvatarInitials";
import { MessageChatBubbleBody } from "./MessageChatBubbleBody";
import type { MessageChatHistoryItem, MessageChatKind } from "./messageChatHistoryTypes";
import {
  MESSAGE_BUBBLE_AVATAR_GAP_PX,
  MESSAGE_BUBBLE_AVATAR_PX,
  MESSAGE_BUBBLE_BORDER_RADIUS_PX,
  MESSAGE_BUBBLE_PADDING_HORIZONTAL_PX,
  MESSAGE_BUBBLE_PADDING_VERTICAL_PX,
} from "./messageChatLayout";
import type { MessageChatRowData } from "./MessageChatRow";

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
      <View
        style={{
          maxWidth: bubbleMaxWidth,
          alignSelf: "flex-start",
          borderRadius: MESSAGE_BUBBLE_BORDER_RADIUS_PX,
          paddingHorizontal: MESSAGE_BUBBLE_PADDING_HORIZONTAL_PX,
          paddingVertical: MESSAGE_BUBBLE_PADDING_VERTICAL_PX,
          backgroundColor: colors.undercover,
        }}
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
  );
}
