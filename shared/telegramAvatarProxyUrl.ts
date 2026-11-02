import type { TelegramProfilePhotoMarkup } from "./telegramProfilePhoto.js";

/** Cache-bust token for `/api/telegram-messages-avatar` (TDLib `chatPhoto.added_date`). */
export function telegramProfilePhotoCacheVersion(
  markup: TelegramProfilePhotoMarkup | null | undefined,
): string | null {
  const added = markup?.added_at?.trim();
  return added ? added : null;
}

export function appendTelegramAvatarCacheVersion(
  url: string,
  version: string | null | undefined,
): string {
  if (!url || url.startsWith("data:")) return url;
  if (!url.includes("/api/telegram-messages-avatar")) return url;
  const v = version?.trim();
  if (!v) return url;
  try {
    const absolute =
      url.startsWith("http://") || url.startsWith("https://")
        ? url
        : `https://placeholder.invalid${url.startsWith("/") ? url : `/${url}`}`;
    const parsed = new URL(absolute);
    parsed.searchParams.set("v", v);
    if (url.startsWith("http://") || url.startsWith("https://")) {
      return parsed.toString();
    }
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    const encoded = encodeURIComponent(v);
    if (/[?&]v=/.test(url)) return url.replace(/([?&])v=[^&]*/, `$1v=${encoded}`);
    return url.includes("?") ? `${url}&v=${encoded}` : `${url}?v=${encoded}`;
  }
}

export function buildTelegramMessagesAvatarProxyPath(input: {
  userId?: number | null;
  chatId?: number | null;
  animated?: boolean;
  cacheVersion?: string | null;
}): string | null {
  const query = new URLSearchParams();
  const chatIdRaw = input.chatId;
  const chatId =
    chatIdRaw != null && Number.isFinite(Number(chatIdRaw)) && Number(chatIdRaw) !== 0
      ? Math.trunc(Number(chatIdRaw))
      : null;
  const userIdRaw = input.userId;
  const userId =
    userIdRaw != null && Number.isFinite(Number(userIdRaw)) && Number(userIdRaw) !== 0
      ? Math.trunc(Number(userIdRaw))
      : null;

  if (userId != null) {
    query.set("user_id", String(userId));
    if (chatId != null && chatId === userId) {
      query.set("chat_id", String(chatId));
    }
  } else if (chatId != null) {
    query.set("chat_id", String(chatId));
  }

  if (!query.toString()) return null;
  if (input.animated) query.set("animated", "1");

  const path = `/api/telegram-messages-avatar?${query.toString()}`;
  return appendTelegramAvatarCacheVersion(path, input.cacheVersion ?? null);
}
