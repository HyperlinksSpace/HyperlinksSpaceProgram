import type { Client } from "tdl";
import type { TelegramProfileAudioTrack } from "./profileMusic.js";

/** Remove a track from the current user's profile playlist. */
export async function removeProfileAudioTrack(
  client: Client,
  fileId: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!Number.isFinite(fileId) || fileId <= 0) {
    return { ok: false, error: "file_id_required" };
  }
  try {
    await client.invoke({
      _: "removeProfileAudio",
      file_id: Math.trunc(fileId),
    });
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "remove_failed",
    };
  }
}

/**
 * Persist playlist order after a drag. `orderedFileIds` is the full new order;
 * we apply setProfileAudioPosition for each file relative to the previous one.
 */
export async function reorderProfileAudioTracks(
  client: Client,
  orderedFileIds: number[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  const ids = orderedFileIds
    .map((id) => Math.trunc(Number(id)))
    .filter((id) => Number.isFinite(id) && id > 0);
  if (ids.length === 0) return { ok: true };
  try {
    for (let i = 0; i < ids.length; i += 1) {
      const fileId = ids[i]!;
      const afterFileId = i === 0 ? 0 : ids[i - 1]!;
      await client.invoke({
        _: "setProfileAudioPosition",
        file_id: fileId,
        after_file_id: afterFileId,
      });
    }
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "reorder_failed",
    };
  }
}

/** Forward a profile audio file into another chat (Telegram "Forward" for playlist tracks). */
export async function forwardProfileAudioToChat(
  client: Client,
  chatId: number,
  track: Pick<
    TelegramProfileAudioTrack,
    "file_id" | "artist" | "title" | "duration_sec"
  >,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!Number.isFinite(chatId) || chatId === 0) {
    return { ok: false, error: "chat_id_required" };
  }
  if (!Number.isFinite(track.file_id) || track.file_id <= 0) {
    return { ok: false, error: "file_id_required" };
  }
  try {
    try {
      await client.invoke({ _: "openChat", chat_id: Math.trunc(chatId) });
    } catch {
      /* already open */
    }
    await client.invoke({
      _: "sendMessage",
      chat_id: Math.trunc(chatId),
      input_message_content: {
        _: "inputMessageAudio",
        audio: {
          _: "inputAudio",
          audio: { _: "inputFileId", id: Math.trunc(track.file_id) },
          album_cover_thumbnail: null,
          duration: Math.max(0, Math.trunc(track.duration_sec || 0)),
          title: (track.title || track.artist || "Audio").slice(0, 64),
          performer: (track.artist || "").slice(0, 64),
        },
        caption: null,
      },
    });
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "forward_failed",
    };
  }
}
