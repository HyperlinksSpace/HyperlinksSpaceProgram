import {
  normalizeTelegramProfilePhotoMarkup,
  type TelegramProfilePhotoMarkup,
} from "../../shared/telegramProfilePhoto";

const markupByUserId = new Map<number, TelegramProfilePhotoMarkup>();
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

function validUserId(userId: number | null | undefined): number | null {
  if (userId == null || !Number.isFinite(userId) || userId === 0) return null;
  return Math.trunc(userId);
}

export function rememberTelegramProfilePhotoMarkup(
  userId: number | null | undefined,
  markup: TelegramProfilePhotoMarkup | null | undefined,
): void {
  const id = validUserId(userId);
  const next = normalizeTelegramProfilePhotoMarkup(markup);
  if (id == null || !next) return;
  const prev = markupByUserId.get(id);
  if (
    prev &&
    prev.custom_emoji_id === next.custom_emoji_id &&
    prev.has_animation === next.has_animation &&
    JSON.stringify(prev.fill) === JSON.stringify(next.fill)
  ) {
    return;
  }
  markupByUserId.set(id, next);
  notify();
}

export function peekTelegramProfilePhotoMarkup(
  userId: number | null | undefined,
): TelegramProfilePhotoMarkup | null {
  const id = validUserId(userId);
  if (id == null) return null;
  return markupByUserId.get(id) ?? null;
}

export function subscribeTelegramProfilePhotoMarkup(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
