import { buildApiUrl } from "../../api/_base";
import type { TelegramProfileAudioTrack } from "./fetchTelegramUserProfile";
import { telegramProfileAudioUrl } from "./fetchTelegramUserProfile";

export async function removeProfilePlaylistTrack(
  fileId: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const response = await fetch(buildApiUrl("/api/telegram-messages-profile-audio-remove"), {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ file_id: Math.trunc(fileId) }),
    });
    const json = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!response.ok || !json.ok) {
      return { ok: false, error: typeof json.error === "string" ? json.error : "remove_failed" };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "remove_failed" };
  }
}

/**
 * Persist drag-drop: move `fileId` so it sits after `afterFileId` (0 = first).
 * Matches TDLib `setProfileAudioPosition` / Telegram `account.saveMusic`.
 */
export async function repositionProfilePlaylistTrack(
  fileId: number,
  afterFileId: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const response = await fetch(buildApiUrl("/api/telegram-messages-profile-audio-reorder"), {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        file_id: Math.trunc(fileId),
        after_file_id: Math.trunc(afterFileId),
      }),
    });
    const json = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!response.ok || !json.ok) {
      return { ok: false, error: typeof json.error === "string" ? json.error : "reorder_failed" };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "reorder_failed" };
  }
}

export async function reorderProfilePlaylistTracks(
  orderedFileIds: number[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const response = await fetch(buildApiUrl("/api/telegram-messages-profile-audio-reorder"), {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ordered_file_ids: orderedFileIds.map((id) => Math.trunc(id)),
      }),
    });
    const json = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!response.ok || !json.ok) {
      return { ok: false, error: typeof json.error === "string" ? json.error : "reorder_failed" };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "reorder_failed" };
  }
}

export async function forwardProfilePlaylistTrack(
  chatId: number,
  track: TelegramProfileAudioTrack,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const response = await fetch(buildApiUrl("/api/telegram-messages-profile-audio-forward"), {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: Math.trunc(chatId),
        file_id: Math.trunc(track.file_id),
        artist: track.artist,
        title: track.title,
        duration_sec: track.duration_sec,
      }),
    });
    const json = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!response.ok || !json.ok) {
      return { ok: false, error: typeof json.error === "string" ? json.error : "forward_failed" };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "forward_failed" };
  }
}

/** Browser "Save As…" — download the profile audio stream. */
export function downloadProfilePlaylistTrack(track: TelegramProfileAudioTrack): void {
  if (typeof document === "undefined") return;
  const url = telegramProfileAudioUrl(track.user_id, track.file_id);
  const nameParts = [track.artist, track.title].filter(Boolean);
  const fileName = `${(nameParts.join(" – ") || "audio").replace(/[\\/:*?"<>|]/g, "_")}.mp3`;
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}
