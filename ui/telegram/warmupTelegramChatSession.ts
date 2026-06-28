import { buildApiUrl } from "../../api/_base";

/** Resume TDLib on the gateway; optionally open a chat for typing / live updates. */
export async function warmupTelegramChatSession(chatId?: number): Promise<void> {
  await fetch(buildApiUrl("/api/telegram-messages-warmup"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(
      chatId != null && Number.isFinite(chatId) ? { chat_id: chatId } : {},
    ),
  }).catch(() => {});
}
