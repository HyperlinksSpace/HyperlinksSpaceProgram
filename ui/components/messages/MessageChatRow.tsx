import type { FormattedTextSegment } from "../../../shared/formattedTextSegments";
import { normalizeFormattedTextSegments } from "../../../shared/formattedTextSegments";
import { useEffect, useMemo, useRef, useState } from "react";
import { Platform, Text, View } from "react-native";
import { TELEGRAM_THREAD_NO_AVATAR } from "../../../shared/telegramThreadConstants";
import { useAppStrings } from "../../../locales/AppStringsContext";
import { FONT_UI_SANS_REGULAR, WEB_UI_SANS_STACK } from "../../fonts";
import { logPageDisplay, chatLogFields } from "../../pageDisplayLog";
import type { ThemeColors } from "../../theme";
import { useTelegram } from "../Telegram";
import { HomeListRowShell } from "../HomeListRowShell";
import { ChatAvatarFallback } from "./ChatAvatarFallback";
import { extractChatAvatarInitials } from "./chatAvatarInitials";
import { MessageChatAvatarImage } from "./MessageChatAvatarImage";
import { MessageUnreadCountBadge } from "./MessageUnreadCountBadge";
import { MessageChatPinIcon } from "./MessageChatPinIcon";
import { SpecialTelegramUserName } from "./SpecialTelegramUserName";
import { MessageChatRichText } from "./MessageChatRichText";
import { formatMessageChatListSubtitle } from "./formatMessageChatSubheader";
import { formatMessageChatWallClock } from "./formatMessageChatTime";
import { resolveTelegramThreadAvatarUrl } from "./resolveTelegramThreadAvatarUrl";
import {
  MESSAGE_AVATAR_PX,
  MESSAGE_ICON_TEXT_GAP_PX,
  MESSAGE_LINE_HEIGHT_PX,
  MESSAGE_NAME_TIME_GAP_PX,
  MESSAGE_ROW_HEIGHT_PX,
  MESSAGE_FONT_SIZE_PX,
} from "./messageListLayout";

export type MessageChatActionKind =
  | "typing"
  | "recording_voice"
  | "recording_video"
  | "uploading_photo"
  | "uploading_video"
  | "uploading_file";

export type MessageChatRowData = {
  id: number;
  telegram_chat_id: number;
  title: string;
  subtitle: string;
  subtitle_segments?: FormattedTextSegment[] | null;
  avatar_url: string | null;
  last_message_at: string | null;
  unread_count: number;
  peer_user_id?: number | null;
  peer_emoji_status_custom_emoji_id?: string | null;
  presence_kind?: "online" | "recently" | "last_week" | "last_month" | "offline" | null;
  presence_at?: string | null;
  chat_action?: MessageChatActionKind | null;
  chat_action_user_id?: number | null;
  chat_action_user_name?: string | null;
  chat_action_expires_at?: string | null;
  last_read_outbox_message_id?: number | null;
  is_pinned?: boolean;
};

function resolveAvatarUrl(item: MessageChatRowData): string | null {
  return resolveTelegramThreadAvatarUrl(item);
}

function formatUnreadBadge(count: number, chatId: number): string {
  if (!Number.isFinite(count) || count <= 0) return "";
  if (count === chatId || count > 50_000) return "";
  if (count > 99) return "99+";
  return String(count);
}

export function MessageChatRow({
  item,
  isLast,
  isActive,
  colors,
  timePendingLabel,
  onPress,
}: {
  item: MessageChatRowData;
  isLast: boolean;
  isActive?: boolean;
  colors: ThemeColors;
  timePendingLabel: string;
  onPress?: () => void;
}) {
  const { locale } = useAppStrings();
  const title = item.title.trim();
  const subtitle = formatMessageChatListSubtitle(item, locale);
  const subtitleSegments = useMemo(
    () => normalizeFormattedTextSegments(item.subtitle_segments),
    [item.subtitle_segments],
  );
  const trailing = formatUnreadBadge(item.unread_count, item.telegram_chat_id);
  const isPinned = Boolean(item.is_pinned);
  const showPin = isPinned && !trailing;
  const iconUrl = resolveAvatarUrl(item);
  const parsedClock = formatMessageChatWallClock(item.last_message_at);
  const timeLabel = parsedClock || timePendingLabel;
  const gapTitleTime = !!(title && timeLabel.trim());
  const avatarLogOnceRef = useRef(false);
  const avatarInitials = useMemo(() => extractChatAvatarInitials(title), [title]);
  const [avatarLoadFailed, setAvatarLoadFailed] = useState(false);
  const showAvatarImage = !!iconUrl && !avatarLoadFailed;
  const { colorScheme } = useTelegram();

  useEffect(() => {
    setAvatarLoadFailed(false);
  }, [iconUrl]);

  useEffect(() => {
    if (avatarLogOnceRef.current) return;
    avatarLogOnceRef.current = true;
    logPageDisplay("messages_avatar_source", {
      ...chatLogFields({
        chatId: item.telegram_chat_id,
        peerUserId: item.peer_user_id,
        title: item.title,
      }),
      hasAvatarField: typeof item.avatar_url === "string" && item.avatar_url.length > 0,
      sourceType: item.avatar_url
        ? item.avatar_url === TELEGRAM_THREAD_NO_AVATAR
          ? "no_avatar_marker"
          : item.avatar_url.startsWith("data:")
            ? "data_url"
            : item.avatar_url.startsWith("http://") || item.avatar_url.startsWith("https://")
              ? "absolute_url"
              : "relative_url"
        : "avatar_proxy_endpoint",
      resolvedSource: iconUrl?.startsWith("data:")
        ? "data_url"
        : iconUrl?.includes("/api/telegram-messages-avatar")
          ? "avatar_proxy"
          : iconUrl
            ? "url"
            : "none",
    });
  }, [iconUrl, item.avatar_url, item.peer_user_id, item.telegram_chat_id, item.title]);

  const textBase = {
    fontFamily: Platform.OS === "web" ? WEB_UI_SANS_STACK : FONT_UI_SANS_REGULAR,
    fontSize: MESSAGE_FONT_SIZE_PX,
    lineHeight: MESSAGE_LINE_HEIGHT_PX,
    includeFontPadding: false,
    paddingVertical: 0,
  } as const;

  return (
    <HomeListRowShell
      isLast={isLast}
      isActive={isActive}
      colors={colors}
      onPress={onPress}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          height: MESSAGE_ROW_HEIGHT_PX,
          width: "100%",
          alignSelf: "stretch",
        }}
      >
      <View
        style={{
          width: MESSAGE_AVATAR_PX,
          height: MESSAGE_AVATAR_PX,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {showAvatarImage ? (
          <MessageChatAvatarImage
            uri={iconUrl}
            sizePx={MESSAGE_AVATAR_PX}
            onLoad={() => {
              logPageDisplay("messages_avatar_load_ok", {
                ...chatLogFields({
                  chatId: item.telegram_chat_id,
                  peerUserId: item.peer_user_id,
                  title: item.title,
                }),
              });
            }}
            onError={(error) => {
              setAvatarLoadFailed(true);
              logPageDisplay("messages_avatar_load_error", {
                ...chatLogFields({
                  chatId: item.telegram_chat_id,
                  peerUserId: item.peer_user_id,
                  title: item.title,
                }),
                error: error ?? "unknown_avatar_error",
              });
            }}
          />
        ) : (
          <ChatAvatarFallback
            initials={avatarInitials}
            sizePx={MESSAGE_AVATAR_PX}
            colors={colors}
            scheme={colorScheme}
          />
        )}
      </View>
      <View style={{ width: MESSAGE_ICON_TEXT_GAP_PX }} />
      <View style={{ flex: 1, minWidth: 0, justifyContent: "center" }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            minHeight: MESSAGE_LINE_HEIGHT_PX,
          }}
        >
          <View style={{ flex: 1, minWidth: 0 }}>
            <SpecialTelegramUserName
              name={title}
              telegramUserId={item.peer_user_id ?? null}
              emojiStatusCustomEmojiId={item.peer_emoji_status_custom_emoji_id ?? null}
              textStyle={{
                ...textBase,
                color: colors.primary,
              }}
            />
          </View>
          {gapTitleTime ? <View style={{ width: MESSAGE_NAME_TIME_GAP_PX }} /> : null}
          {timeLabel ? (
            <Text
              numberOfLines={1}
              style={{
                ...textBase,
                flexShrink: 0,
                color: colors.accent,
              }}
            >
              {timeLabel}
            </Text>
          ) : null}
        </View>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            minHeight: MESSAGE_LINE_HEIGHT_PX,
          }}
        >
          <MessageChatRichText
            text={subtitle}
            segments={subtitleSegments}
            numberOfLines={1}
            emojiSizePx={16}
            style={{
              ...textBase,
              flex: 1,
              minWidth: 0,
              color: colors.secondary,
            }}
          />
          {showPin || trailing ? <View style={{ width: MESSAGE_NAME_TIME_GAP_PX }} /> : null}
          {showPin ? <MessageChatPinIcon size={20} color={colors.accent} /> : null}
          {trailing ? <MessageUnreadCountBadge label={trailing} colors={colors} /> : null}
        </View>
      </View>
      </View>
    </HomeListRowShell>
  );
}
