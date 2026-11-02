import { buildApiUrl } from "../../../api/_base";
import { safeTelegramUserIdForLog } from "../../../shared/appLog";
import {
  appendTelegramAvatarCacheVersion,
  buildTelegramMessagesAvatarProxyPath,
  telegramProfilePhotoCacheVersion,
} from "../../../shared/telegramAvatarProxyUrl";
import { TELEGRAM_THREAD_NO_AVATAR } from "../../../shared/telegramThreadConstants";
import type { TelegramProfilePhotoMarkup } from "../../../shared/telegramProfilePhoto";
import type { MessageChatHistoryItem, MessageChatKind } from "./messageChatHistoryTypes";
import type { MessageChatRowData } from "./MessageChatRow";

function resolveStoredAvatarUrl(raw: string | null | undefined): string | null {
  if (!raw || raw === TELEGRAM_THREAD_NO_AVATAR) return null;
  if (raw.startsWith("data:")) return raw;
  if (raw.startsWith("http://") || raw.startsWith("https://")) return raw;
  return buildApiUrl(raw.startsWith("/") ? raw : `/${raw}`);
}

function validChatIdForAvatar(id: unknown): number | null {
  const chatId = Number(id);
  if (!Number.isFinite(chatId) || chatId === 0) return null;
  return Math.trunc(chatId);
}

function avatarProxyUrl(params: {
  userId?: number | null;
  chatId?: number | null;
  cacheVersion?: string | null;
}): string | null {
  const path = buildTelegramMessagesAvatarProxyPath({
    userId: safeTelegramUserIdForLog(params.userId),
    chatId: validChatIdForAvatar(params.chatId),
    cacheVersion: params.cacheVersion ?? null,
  });
  return path ? buildApiUrl(path) : null;
}

function preferFreshAvatarProxy(chat: MessageChatRowData): boolean {
  const raw = chat.avatar_url;
  if (!raw || raw === TELEGRAM_THREAD_NO_AVATAR) return true;
  if (raw.startsWith("data:")) return true;
  if (raw.includes("/api/telegram-messages-avatar")) return true;
  return false;
}

function versionedStoredAvatarUrl(
  url: string | null,
  markup: TelegramProfilePhotoMarkup | null | undefined,
): string | null {
  if (!url) return null;
  const version = telegramProfilePhotoCacheVersion(markup);
  if (!version) return url;
  return appendTelegramAvatarCacheVersion(url, version);
}

/** Avatar for a chat list row or an open-thread message bubble. */
export function resolveTelegramThreadAvatarUrl(
  chat: MessageChatRowData,
  item?: Pick<
    MessageChatHistoryItem,
    "sender_user_id" | "sender_chat_id" | "sender_is_channel" | "is_outgoing"
  > | null,
  chatKind?: MessageChatKind | null,
): string | null {
  const inChannelThread = chatKind === "channel";
  const chatPhotoVersion = telegramProfilePhotoCacheVersion(chat.profile_photo);
  // NO_AVATAR only means the static chat JPEG is missing (video-only profile
  // photos often have no chat.photo.small). Keep resolving the user proxy.
  const storedChatAvatar =
    chat.avatar_url === TELEGRAM_THREAD_NO_AVATAR
      ? null
      : resolveStoredAvatarUrl(chat.avatar_url);

  if (inChannelThread || item?.sender_is_channel) {
    if (storedChatAvatar && !preferFreshAvatarProxy(chat)) {
      return versionedStoredAvatarUrl(storedChatAvatar, chat.profile_photo);
    }
    return avatarProxyUrl({ chatId: chat.telegram_chat_id, cacheVersion: chatPhotoVersion });
  }

  if (item) {
    const senderChatId = validChatIdForAvatar(item.sender_chat_id);
    if (senderChatId != null) {
      return avatarProxyUrl({ chatId: senderChatId, cacheVersion: chatPhotoVersion });
    }

    const senderUserId = safeTelegramUserIdForLog(item.sender_user_id);
    if (senderUserId != null) {
      return avatarProxyUrl({
        userId: senderUserId,
        chatId: validChatIdForAvatar(item.sender_chat_id),
        cacheVersion: chatPhotoVersion,
      });
    }

    if (item.is_outgoing) {
      return null;
    }
  }

  if (storedChatAvatar && !preferFreshAvatarProxy(chat)) {
    return versionedStoredAvatarUrl(storedChatAvatar, chat.profile_photo);
  }

  const peerUserId = safeTelegramUserIdForLog(chat.peer_user_id);
  if (peerUserId != null) {
    return avatarProxyUrl({
      chatId: chat.telegram_chat_id,
      userId: peerUserId,
      cacheVersion: chatPhotoVersion,
    });
  }

  return avatarProxyUrl({ chatId: chat.telegram_chat_id, cacheVersion: chatPhotoVersion });
}

/** MPEG4/WebM loop for a user profile photo (`chatPhoto.animation`). */
export function withTelegramAvatarAnimation(url: string | null): string | null {
  if (!url || url.startsWith("data:")) return null;
  if (!url.includes("/api/telegram-messages-avatar")) return null;
  if (/(?:[?&])animated=1(?:&|$)/.test(url)) return url;
  return url.includes("?") ? `${url}&animated=1` : `${url}?animated=1`;
}

export function resolveTelegramThreadAnimatedAvatarUrl(
  chat: MessageChatRowData,
  item?: Pick<
    MessageChatHistoryItem,
    "sender_user_id" | "sender_chat_id" | "sender_is_channel" | "is_outgoing"
  > | null,
  chatKind?: MessageChatKind | null,
): string | null {
  const inChannelThread = chatKind === "channel";
  if (inChannelThread || item?.sender_is_channel) return null;
  const markup = chat.profile_photo;
  const cacheVersion = telegramProfilePhotoCacheVersion(markup);
  // Custom-emoji faces loop via TGS/WebM emoji, not the MPEG4 avatar proxy.
  // Outgoing bubbles still animate the sender (self) — never skip is_outgoing.
  if (!item?.is_outgoing && markup?.custom_emoji_id && !markup.has_animation) return null;

  if (item) {
    const senderUserId = safeTelegramUserIdForLog(item.sender_user_id);
    if (senderUserId != null) {
      const path = buildTelegramMessagesAvatarProxyPath({
        userId: senderUserId,
        animated: true,
        cacheVersion,
      });
      return path ? buildApiUrl(path) : null;
    }
  }

  const peerUserId = safeTelegramUserIdForLog(chat.peer_user_id);
  if (peerUserId != null) {
    const path = buildTelegramMessagesAvatarProxyPath({
      userId: peerUserId,
      chatId: validChatIdForAvatar(chat.telegram_chat_id),
      animated: true,
      cacheVersion,
    });
    return path ? buildApiUrl(path) : null;
  }

  const chatId = validChatIdForAvatar(chat.telegram_chat_id);
  if ((chat.chat_kind === "private" || chatKind === "private") && chatId != null && chatId > 0) {
    const path = buildTelegramMessagesAvatarProxyPath({
      userId: chatId,
      chatId,
      animated: true,
      cacheVersion,
    });
    return path ? buildApiUrl(path) : null;
  }
  return null;
}
