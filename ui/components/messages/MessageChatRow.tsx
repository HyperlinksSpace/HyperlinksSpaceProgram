import { Platform, Text, View } from "react-native";
import { Image } from "expo-image";
import { buildApiUrl } from "../../../api/_base";
import { TELEGRAM_THREAD_NO_AVATAR } from "../../../shared/telegramThreadConstants";
import { FONT_UI_SANS_REGULAR, WEB_UI_SANS_STACK } from "../../fonts";
import type { ThemeColors } from "../../theme";
import {
  MESSAGE_AVATAR_PX,
  MESSAGE_ICON_TEXT_GAP_PX,
  MESSAGE_LINE_HEIGHT_PX,
  MESSAGE_NAME_TIME_GAP_PX,
  MESSAGE_ROW_HEIGHT_PX,
  MESSAGE_ROW_MARGIN_BOTTOM_PX,
  MESSAGE_FONT_SIZE_PX,
} from "./messageListLayout";

export type MessageChatRowData = {
  id: number;
  telegram_chat_id: number;
  title: string;
  subtitle: string;
  avatar_url: string | null;
  last_message_at: string | null;
  unread_count: number;
};

function formatWallClock(raw: unknown): string {
  if (raw == null || raw === "") return "";
  if (typeof raw === "number" && Number.isFinite(raw)) {
    const n = raw < 12_000_000_000 ? raw * 1000 : raw;
    const d = new Date(n);
    if (!Number.isNaN(d.getTime())) {
      const hh = String(d.getHours()).padStart(2, "0");
      const mm = String(d.getMinutes()).padStart(2, "0");
      return `${hh}:${mm}`;
    }
  }
  if (typeof raw === "string" && raw.trim()) {
    const t = raw.trim();
    const d = new Date(t.includes("T") ? t : t.replace(" ", "T"));
    if (!Number.isNaN(d.getTime())) {
      const hh = String(d.getHours()).padStart(2, "0");
      const mm = String(d.getMinutes()).padStart(2, "0");
      return `${hh}:${mm}`;
    }
  }
  return "";
}

function resolveAvatarUrl(item: MessageChatRowData): string | null {
  const avatarUrl = item.avatar_url;
  if (avatarUrl === TELEGRAM_THREAD_NO_AVATAR) return null;
  if (!avatarUrl) {
    return buildApiUrl(`/api/telegram-messages-avatar?chat_id=${item.telegram_chat_id}`);
  }
  if (avatarUrl.startsWith("data:")) return avatarUrl;
  if (avatarUrl.startsWith("http://") || avatarUrl.startsWith("https://")) return avatarUrl;
  return buildApiUrl(avatarUrl.startsWith("/") ? avatarUrl : `/${avatarUrl}`);
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
  colors,
  timePendingLabel,
}: {
  item: MessageChatRowData;
  isLast: boolean;
  colors: ThemeColors;
  timePendingLabel: string;
}) {
  const title = item.title.trim();
  const subtitle = item.subtitle.trim();
  const trailing = formatUnreadBadge(item.unread_count, item.telegram_chat_id);
  const iconUrl = resolveAvatarUrl(item);
  const parsedClock = formatWallClock(item.last_message_at);
  const timeLabel = parsedClock || timePendingLabel;
  const timeIsProvisional = !parsedClock;
  const gapTitleTime = !!(title && timeLabel.trim());
  const gapSubtitleTrailing = !!(subtitle && trailing);

  const textBase = {
    fontFamily: Platform.OS === "web" ? WEB_UI_SANS_STACK : FONT_UI_SANS_REGULAR,
    fontSize: MESSAGE_FONT_SIZE_PX,
    lineHeight: MESSAGE_LINE_HEIGHT_PX,
    includeFontPadding: false,
    paddingVertical: 0,
  } as const;

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        height: MESSAGE_ROW_HEIGHT_PX,
        marginBottom: isLast ? 0 : MESSAGE_ROW_MARGIN_BOTTOM_PX,
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
        {iconUrl ? (
          <Image
            source={{ uri: iconUrl }}
            accessibilityIgnoresInvertColors
            style={{
              width: MESSAGE_AVATAR_PX,
              height: MESSAGE_AVATAR_PX,
              borderRadius: MESSAGE_AVATAR_PX / 2,
            }}
            contentFit="cover"
          />
        ) : (
          <View
            style={{
              width: MESSAGE_AVATAR_PX,
              height: MESSAGE_AVATAR_PX,
              backgroundColor: colors.secondary,
              borderRadius: MESSAGE_AVATAR_PX / 2,
            }}
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
          <Text
            numberOfLines={1}
            ellipsizeMode="tail"
            style={{
              ...textBase,
              flex: 1,
              minWidth: 0,
              color: colors.primary,
            }}
          >
            {title}
          </Text>
          {gapTitleTime ? <View style={{ width: MESSAGE_NAME_TIME_GAP_PX }} /> : null}
          {timeLabel ? (
            <Text
              numberOfLines={1}
              style={{
                ...textBase,
                flexShrink: 0,
                color: timeIsProvisional ? colors.secondary : colors.primary,
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
          <Text
            numberOfLines={1}
            ellipsizeMode="tail"
            style={{
              ...textBase,
              flex: trailing ? 1 : 1,
              minWidth: 0,
              color: colors.secondary,
            }}
          >
            {subtitle}
          </Text>
          {trailing ? (
            <>
              {gapSubtitleTrailing ? <View style={{ width: MESSAGE_NAME_TIME_GAP_PX }} /> : null}
              <Text
                numberOfLines={1}
                ellipsizeMode="tail"
                style={{
                  ...textBase,
                  flexShrink: 0,
                  maxWidth: "45%",
                  color: colors.secondary,
                  textAlign: "right",
                }}
              >
                {trailing}
              </Text>
            </>
          ) : null}
        </View>
      </View>
    </View>
  );
}
