import { buildApiUrl } from "../../api/_base";

export type OpenTelegramBotWebAppResult =
  | { ok: true; url: string; launch_id: string | null }
  | { ok: false; error: string };

export async function openTelegramBotWebApp(params: {
  chatId: number;
  botUserId?: number | null;
  url?: string | null;
  messageId?: number | null;
  startParameter?: string | null;
  source?: "inline_button" | "menu_button" | "main_web_app" | "callback_url" | "profile" | "chat_list";
}): Promise<OpenTelegramBotWebAppResult> {
  const response = await fetch(buildApiUrl("/api/telegram-messages-web-app"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: params.chatId,
      bot_user_id: params.botUserId ?? null,
      url: params.url ?? "",
      message_id: params.messageId ?? null,
      start_parameter: params.startParameter ?? "",
      source: params.source ?? "inline_button",
    }),
  });
  const json = (await response.json().catch(() => ({}))) as {
    ok?: boolean;
    url?: string;
    launch_id?: string | number | null;
    error?: string;
  };
  if (!response.ok || !json.ok) {
    return { ok: false, error: json.error ?? "web_app_open_failed" };
  }
  const url = typeof json.url === "string" ? json.url.trim() : "";
  if (!url) return { ok: false, error: "web_app_url_missing" };
  return {
    ok: true,
    url,
    launch_id:
      json.launch_id != null && String(json.launch_id).trim()
        ? String(json.launch_id)
        : null,
  };
}
