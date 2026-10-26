import type { TelegramProfileAudioTrack } from "./fetchTelegramUserProfile";

export type ProfilePlaylistReorderedEvent = {
  userId: number;
  tracks: TelegramProfileAudioTrack[];
};

const listeners = new Set<(event: ProfilePlaylistReorderedEvent) => void>();

/** Fired after playlist order is saved to Telegram (own profile only). */
export function emitProfilePlaylistReordered(
  userId: number,
  tracks: TelegramProfileAudioTrack[],
): void {
  const id = Math.trunc(userId);
  if (!Number.isFinite(id) || id === 0) return;
  const rows = Array.isArray(tracks) ? tracks : [];
  const event: ProfilePlaylistReorderedEvent = { userId: id, tracks: rows };
  for (const listener of listeners) listener(event);
}

export function subscribeProfilePlaylistReordered(
  listener: (event: ProfilePlaylistReorderedEvent) => void,
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
