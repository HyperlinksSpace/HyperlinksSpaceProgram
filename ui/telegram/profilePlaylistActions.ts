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
 * Persist drag-drop so native Telegram apps match this playlist.
 * Sends the moved slot (`after_file_id` 0 = first) plus the full visible order
 * so the gateway can verify / walk `account.saveMusic` if a single move is not enough.
 */
export async function persistProfilePlaylistOrder(
  orderedFileIds: number[],
  moved?: { fileId: number; afterFileId: number },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const ids = orderedFileIds.map((id) => Math.trunc(Number(id))).filter((id) => Number.isFinite(id) && id > 0);
  const fileId = moved != null ? Math.trunc(Number(moved.fileId)) : 0;
  const afterFileId = moved != null ? Math.trunc(Number(moved.afterFileId)) : -1;
  if (ids.length === 0 && !(fileId > 0 && afterFileId >= 0)) {
    return { ok: false, error: "file_id_required" };
  }
  try {
    const response = await fetch(buildApiUrl("/api/telegram-messages-profile-audio-reorder"), {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ordered_file_ids: ids,
        ...(fileId > 0 && afterFileId >= 0
          ? { file_id: fileId, after_file_id: afterFileId }
          : null),
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

/**
 * Persist drag-drop: move `fileId` so it sits after `afterFileId` (0 = first).
 * Matches TDLib `setProfileAudioPosition` / Telegram `account.saveMusic`.
 */
export async function repositionProfilePlaylistTrack(
  fileId: number,
  afterFileId: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  return persistProfilePlaylistOrder([], { fileId, afterFileId });
}

/** When the UI list is shorter than Telegram's, keep the user's order up front. */
export function mergeProfilePlaylistFileIds(fullListed: number[], desired: number[]): number[] {
  const full = fullListed.map((id) => Math.trunc(id)).filter((id) => Number.isFinite(id) && id > 0);
  const want = desired.map((id) => Math.trunc(id)).filter((id) => Number.isFinite(id) && id > 0);
  if (want.length === 0) return full;
  if (want.length >= full.length) return want;
  const wantSet = new Set(want);
  const tail = full.filter((id) => !wantSet.has(id));
  return [...want, ...tail];
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
