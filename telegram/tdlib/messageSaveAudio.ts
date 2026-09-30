import type { Client } from "tdl";
import { parseTdAudioMeta } from "./audioMeta.js";

export type MessageSaveAudioTarget = "profile" | "saved_messages" | "downloads";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function fileIdFromNestedAudio(content: Record<string, unknown>): number | null {
  const audio = asRecord(content.audio);
  if (!audio) return null;
  const file = asRecord(audio.audio) ?? asRecord(audio.file);
  const id = Number(file?.id);
  return Number.isFinite(id) && id > 0 ? Math.trunc(id) : null;
}

async function getAudioMessage(
  client: Client,
  chatId: number,
  messageId: number,
): Promise<{
  fileId: number;
  fileName: string;
  artist: string;
  title: string;
  durationSec: number;
  coverFileId: number | null;
} | null> {
  const message = (await client.invoke({
    _: "getMessage",
    chat_id: Math.trunc(chatId),
    message_id: Math.trunc(messageId),
  })) as { content?: unknown };
  const content = asRecord(message.content);
  if (!content || content._ !== "messageAudio") return null;
  const fileId = fileIdFromNestedAudio(content);
  if (fileId == null) return null;
  const meta = parseTdAudioMeta(content);
  const audio = asRecord(content.audio);
  const fileNameRaw =
    (typeof audio?.file_name === "string" && audio.file_name.trim()) ||
    (typeof audio?.fileName === "string" && audio.fileName.trim()) ||
    "";
  const artist = meta?.artist ?? "";
  const title = meta?.title ?? "";
  const fileName =
    fileNameRaw ||
    (artist && title ? `${artist} – ${title}` : artist || title || `audio_${messageId}`);
  return {
    fileId,
    fileName,
    artist,
    title,
    durationSec: meta?.duration_sec ?? 0,
    coverFileId: meta?.cover_file_id ?? null,
  };
}

async function resolveSavedMessagesChatId(client: Client): Promise<number> {
  const me = (await client.invoke({ _: "getMe" })) as { id?: number };
  const myId = Number(me.id);
  if (!Number.isFinite(myId) || myId === 0) {
    throw new Error("my_id_unavailable");
  }
  const chat = (await client.invoke({
    _: "createPrivateChat",
    user_id: Math.trunc(myId),
    force: true,
  })) as { id?: number };
  const chatId = Number(chat.id);
  if (!Number.isFinite(chatId) || chatId === 0) {
    throw new Error("saved_messages_unavailable");
  }
  return Math.trunc(chatId);
}

/**
 * tdesktop "Save to…" for messageAudio:
 * - Profile → addProfileAudio
 * - Saved Messages → forwardMessages to self
 * - Downloads → addFileToDownloads (Telegram download manager)
 */
export async function saveMessageAudio(
  client: Client,
  chatId: number,
  messageId: number,
  target: MessageSaveAudioTarget,
): Promise<{ ok: true; file_name: string } | { ok: false; error: string }> {
  if (!Number.isFinite(chatId) || chatId === 0) {
    return { ok: false, error: "chat_id_required" };
  }
  if (!Number.isFinite(messageId) || messageId <= 0) {
    return { ok: false, error: "message_id_required" };
  }

  try {
    const audio = await getAudioMessage(client, chatId, messageId);
    if (!audio) return { ok: false, error: "not_audio_message" };

    if (target === "profile") {
      // TDLib 1.8.66+: addProfileAudio takes inputAudio (not bare file_id).
      await client.invoke({
        _: "addProfileAudio",
        audio: {
          _: "inputAudio",
          audio: { _: "inputFileId", id: audio.fileId },
          album_cover_thumbnail: null,
          duration: audio.durationSec,
          title: audio.title || audio.fileName,
          performer: audio.artist || "",
        },
      });
      return { ok: true, file_name: audio.fileName };
    }

    if (target === "saved_messages") {
      const savedChatId = await resolveSavedMessagesChatId(client);
      await client.invoke({
        _: "forwardMessages",
        chat_id: savedChatId,
        topic_id: null,
        from_chat_id: Math.trunc(chatId),
        message_ids: [Math.trunc(messageId)],
        options: null,
        send_copy: false,
        remove_caption: false,
      });
      return { ok: true, file_name: audio.fileName };
    }

    if (target === "downloads") {
      await client.invoke({
        _: "addFileToDownloads",
        file_id: audio.fileId,
        chat_id: Math.trunc(chatId),
        message_id: Math.trunc(messageId),
        priority: 32,
      });
      return { ok: true, file_name: audio.fileName };
    }

    return { ok: false, error: "invalid_target" };
  } catch (err) {
    const message = err instanceof Error ? err.message : "save_failed";
    return { ok: false, error: message };
  }
}

export async function getMessageAudioFileName(
  client: Client,
  chatId: number,
  messageId: number,
): Promise<string | null> {
  try {
    const audio = await getAudioMessage(client, chatId, messageId);
    return audio?.fileName ?? null;
  } catch {
    return null;
  }
}
