import type { Client } from "tdl";
import { logGateway } from "./gatewayLog.js";
import { listUserProfileAudios, type TelegramProfileAudioTrack } from "./profileMusic.js";

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

function sameIdOrder(left: number[], right: number[]): boolean {
  if (left.length !== right.length) return false;
  for (let i = 0; i < left.length; i += 1) {
    if (left[i] !== right[i]) return false;
  }
  return true;
}

function sameIdSet(left: number[], right: number[]): boolean {
  if (left.length !== right.length) return false;
  const counts = new Map<number, number>();
  for (const id of left) counts.set(id, (counts.get(id) ?? 0) + 1);
  for (const id of right) {
    const n = counts.get(id);
    if (n == null || n <= 0) return false;
    if (n === 1) counts.delete(id);
    else counts.set(id, n - 1);
  }
  return counts.size === 0;
}

async function currentUserId(client: Client): Promise<number | null> {
  try {
    const me = (await client.invoke({ _: "getMe" })) as { id?: number };
    const id = Number(me.id);
    return Number.isFinite(id) && id > 0 ? Math.trunc(id) : null;
  } catch {
    return null;
  }
}

/**
 * Move one profile audio to a new slot (Telegram `account.saveMusic` / TDLib
 * `setProfileAudioPosition`). `afterFileId` 0 = beginning of the list.
 */
export async function setProfileAudioTrackPosition(
  client: Client,
  fileId: number,
  afterFileId: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const id = Math.trunc(Number(fileId));
  const afterId = Math.trunc(Number(afterFileId));
  if (!Number.isFinite(id) || id <= 0) {
    return { ok: false, error: "file_id_required" };
  }
  if (!Number.isFinite(afterId) || afterId < 0) {
    return { ok: false, error: "after_file_id_invalid" };
  }
  if (afterId === id) {
    return { ok: false, error: "after_file_id_invalid" };
  }
  try {
    await client.invoke({
      _: "setProfileAudioPosition",
      file_id: id,
      after_file_id: afterId,
    });
    return { ok: true };
  } catch (firstErr) {
    try {
      // tdl camelCase fallback if the snake_case request was rejected as unknown.
      await client.invoke({
        _: "setProfileAudioPosition",
        fileId: id,
        afterFileId: afterId,
      } as never);
      return { ok: true };
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : firstErr instanceof Error
            ? firstErr.message
            : "reorder_failed";
      logGateway("profile_audio_set_position_failed", { fileId: id, afterFileId: afterId, error: message });
      return { ok: false, error: message };
    }
  }
}

/**
 * Persist a full playlist order after drag. Prefer a single
 * {@link setProfileAudioTrackPosition} when only one track moved; this walks
 * left-to-right so a complete list still converges if the client sends all ids.
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
      const result = await setProfileAudioTrackPosition(client, fileId, afterFileId);
      if (!result.ok) return result;
    }
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "reorder_failed",
    };
  }
}

/**
 * Persist HSP playlist order to Telegram (`setProfileAudioPosition` /
 * `account.saveMusic`). Applies the dragged slot first, then verifies against
 * `getUserProfileAudios` and walks the full list when the sets match but order
 * still differs — so official Telegram apps show the same playlist.
 */
export async function persistProfileAudioOrder(
  client: Client,
  orderedFileIds: number[],
  position?: { fileId: number; afterFileId: number },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const ids = orderedFileIds
    .map((id) => Math.trunc(Number(id)))
    .filter((id) => Number.isFinite(id) && id > 0);
  const fileId = position != null ? Math.trunc(Number(position.fileId)) : 0;
  const afterFileId = position != null ? Math.trunc(Number(position.afterFileId)) : -1;
  if (fileId > 0 && afterFileId >= 0 && afterFileId !== fileId) {
    const moved = await setProfileAudioTrackPosition(client, fileId, afterFileId);
    if (!moved.ok && ids.length === 0) return moved;
  } else if (ids.length === 0) {
    return { ok: false, error: "file_id_required" };
  }

  const uid = await currentUserId(client);
  if (uid != null && ids.length > 0) {
    const listed = await listUserProfileAudios(client, uid);
    const listedIds = listed.map((track) => track.file_id);
    if (sameIdOrder(listedIds, ids)) {
      logGateway("profile_audio_order_synced", { count: ids.length });
      return { ok: true };
    }
    if (sameIdSet(listedIds, ids) && listedIds.length === ids.length) {
      logGateway("profile_audio_order_walk", { count: ids.length });
      return reorderProfileAudioTracks(client, ids);
    }
    if (listedIds.length > ids.length && ids.every((id) => listedIds.includes(id))) {
      logGateway("profile_audio_order_incomplete", {
        listed: listedIds.length,
        desired: ids.length,
      });
      return { ok: false, error: "playlist_incomplete" };
    }
    logGateway("profile_audio_order_mismatch", {
      listed: listedIds.length,
      desired: ids.length,
    });
  }
  if (ids.length > 0) {
    return reorderProfileAudioTracks(client, ids);
  }
  return { ok: true };
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
