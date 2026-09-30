import { buildApiUrl } from "../../api/_base";

export type SaveTelegramChatMessageAudioTarget =
  | "profile"
  | "saved_messages"
  | "downloads";

export type SaveTelegramChatMessageAudioResult =
  | { ok: true; file_name: string }
  | { ok: false; error: string };

export async function saveTelegramChatMessageAudio(
  chatId: number,
  messageId: number,
  target: SaveTelegramChatMessageAudioTarget,
): Promise<SaveTelegramChatMessageAudioResult> {
  if (!Number.isFinite(chatId) || chatId === 0) {
    return { ok: false, error: "chat_id_required" };
  }
  if (!Number.isFinite(messageId) || messageId <= 0) {
    return { ok: false, error: "message_id_required" };
  }

  const response = await fetch(buildApiUrl("/api/telegram-messages-save-audio"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: Math.trunc(chatId),
      message_id: Math.trunc(messageId),
      target,
    }),
  });
  const json = (await response.json().catch(() => ({}))) as {
    ok?: boolean;
    file_name?: unknown;
    error?: string;
  };

  if (!response.ok || !json.ok) {
    return { ok: false, error: json.error ?? "save_failed" };
  }

  return {
    ok: true,
    file_name: typeof json.file_name === "string" ? json.file_name : "",
  };
}
