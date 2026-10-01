import { buildApiUrl } from "../../api/_base";

export type AnswerTelegramCallbackQueryResult =
  | {
      ok: true;
      text: string;
      show_alert: boolean;
      url: string;
    }
  | { ok: false; error: string };

export async function answerTelegramCallbackQuery(params: {
  chatId: number;
  messageId: number;
  data?: string;
  game?: boolean;
}): Promise<AnswerTelegramCallbackQueryResult> {
  const response = await fetch(buildApiUrl("/api/telegram-messages-callback"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: params.chatId,
      message_id: params.messageId,
      data: params.data ?? "",
      game: Boolean(params.game),
    }),
  });
  const json = (await response.json().catch(() => ({}))) as {
    ok?: boolean;
    text?: string;
    show_alert?: boolean;
    url?: string;
    error?: string;
  };
  if (!response.ok || !json.ok) {
    return { ok: false, error: json.error ?? "callback_failed" };
  }
  return {
    ok: true,
    text: typeof json.text === "string" ? json.text : "",
    show_alert: Boolean(json.show_alert),
    url: typeof json.url === "string" ? json.url : "",
  };
}
