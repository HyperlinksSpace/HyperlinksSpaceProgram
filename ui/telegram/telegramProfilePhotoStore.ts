import { useSyncExternalStore } from "react";
import type { TelegramProfilePhotoMarkup } from "../../shared/telegramProfilePhoto";
import { fetchTelegramUserProfile } from "./fetchTelegramUserProfile";
import {
  peekTelegramProfilePhotoMarkup,
  rememberTelegramProfilePhotoMarkup,
  subscribeTelegramProfilePhotoMarkup,
} from "./telegramProfilePhotoCache";

const prefetchStarted = new Set<number>();

function validUserId(userId: number | null | undefined): number | null {
  if (userId == null || !Number.isFinite(userId) || userId === 0) return null;
  return Math.trunc(userId);
}

export {
  peekTelegramProfilePhotoMarkup,
  rememberTelegramProfilePhotoMarkup,
  subscribeTelegramProfilePhotoMarkup,
};

export function prefetchTelegramProfilePhotoMarkup(input: {
  chatId?: number | null;
  userId?: number | null;
  priority?: "high" | "low" | "normal" | "critical";
}): void {
  const userId = validUserId(input.userId);
  const chatId = Number(input.chatId);
  const hasChat = Number.isFinite(chatId) && chatId !== 0;
  if (userId == null && !hasChat) return;
  if (userId != null) {
    if (peekTelegramProfilePhotoMarkup(userId)) return;
    if (prefetchStarted.has(userId)) return;
    prefetchStarted.add(userId);
  }
  void fetchTelegramUserProfile(
    hasChat ? chatId : userId ?? 0,
    userId,
    undefined,
    { priority: input.priority ?? "high" },
  ).then((result) => {
    if (userId != null && !result.ok) prefetchStarted.delete(userId);
  });
}

export function useTelegramProfilePhotoMarkup(
  userId: number | null | undefined,
  fallback?: TelegramProfilePhotoMarkup | null,
): TelegramProfilePhotoMarkup | null {
  const cached = useSyncExternalStore(
    subscribeTelegramProfilePhotoMarkup,
    () => peekTelegramProfilePhotoMarkup(userId),
    () => peekTelegramProfilePhotoMarkup(userId),
  );
  return cached ?? fallback ?? null;
}
