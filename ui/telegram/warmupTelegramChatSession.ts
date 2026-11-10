import { buildApiUrl } from "../../api/_base";
import { openIosCompetingRead } from "./iosCompetingRead";

/** Resume TDLib on the gateway; optionally open a chat for typing / live updates. */
export async function warmupTelegramChatSession(chatId?: number): Promise<void> {
  const competing = openIosCompetingRead();
  try {
    await fetch(buildApiUrl("/api/telegram-messages-warmup"), {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      signal: competing.signal,
      body: JSON.stringify(
        chatId != null && Number.isFinite(chatId) ? { chat_id: chatId } : {},
      ),
    }).catch(() => {});
  } finally {
    competing.finish();
  }
}
