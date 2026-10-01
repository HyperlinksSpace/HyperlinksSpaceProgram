import type { Client } from "tdl";

export type CallbackQueryAnswerPayload = {
  text: string;
  show_alert: boolean;
  url: string;
};

export type WebAppOpenPayload = {
  url: string;
  launch_id: string | null;
};

function themeParametersFromDefaults(): Record<string, unknown> {
  return {
    _: "themeParameters",
    background_color: 0x010101,
    secondary_background_color: 0x323232,
    header_background_color: 0x010101,
    section_background_color: 0x323232,
    text_color: 0xffffff,
    accent_text_color: 0x6ab2f2,
    hint_color: 0xa1a1a1,
    link_color: 0x6ab2f2,
    button_color: 0x2481cc,
    button_text_color: 0xffffff,
  };
}

function webAppOpenParameters(): Record<string, unknown> {
  return {
    _: "webAppOpenParameters",
    theme: themeParametersFromDefaults(),
    application_name: "hyperlinks",
    mode: { _: "webAppOpenModeFullSize" },
  };
}

export async function getCallbackQueryAnswerForChat(
  client: Client,
  chatId: number,
  messageId: number,
  options?: { data?: string; game?: boolean },
): Promise<CallbackQueryAnswerPayload> {
  const game = Boolean(options?.game);
  const data = typeof options?.data === "string" ? options.data : "";
  const payload = game
    ? { _: "callbackQueryPayloadGame", game_short_name: "" }
    : { _: "callbackQueryPayloadData", data };
  const answer = (await client.invoke({
    _: "getCallbackQueryAnswer",
    chat_id: chatId,
    message_id: messageId,
    payload,
  })) as {
    text?: string;
    show_alert?: boolean;
    url?: string;
  };
  return {
    text: typeof answer.text === "string" ? answer.text : "",
    show_alert: Boolean(answer.show_alert),
    url: typeof answer.url === "string" ? answer.url : "",
  };
}

export async function openBotWebAppForChat(
  client: Client,
  params: {
    chatId: number;
    botUserId: number;
    url?: string | null;
    source?: string | null;
    startParameter?: string | null;
  },
): Promise<WebAppOpenPayload> {
  const chatId = params.chatId;
  const botUserId = params.botUserId;
  const url = typeof params.url === "string" ? params.url.trim() : "";
  const source = params.source ?? "inline_button";
  const startParameter =
    typeof params.startParameter === "string" ? params.startParameter.trim() : "";

  try {
    await client.invoke({ _: "openChat", chat_id: chatId });
  } catch {
    /* best effort */
  }

  // Main Mini App (Open App on profile / chat list).
  if (source === "main_web_app" || source === "profile" || source === "chat_list") {
    if (!url) {
      const main = (await client.invoke({
        _: "getMainWebApp",
        chat_id: chatId,
        bot_user_id: botUserId,
        start_parameter: startParameter,
        parameters: webAppOpenParameters(),
      })) as { url?: string | { url?: string } };
      const mainUrl =
        typeof main.url === "string"
          ? main.url
          : typeof main.url === "object" && main.url && typeof main.url.url === "string"
            ? main.url.url
            : "";
      if (!mainUrl) throw new Error("main_web_app_unavailable");
      return { url: mainUrl, launch_id: null };
    }
  }

  // Menu button / keyboardButtonTypeWebApp style URLs.
  if (source === "menu_button" && url) {
    const resolved = (await client.invoke({
      _: "getWebAppUrl",
      bot_user_id: botUserId,
      url,
      parameters: webAppOpenParameters(),
    })) as { url?: string | { url?: string } };
    const resolvedUrl =
      typeof resolved.url === "string"
        ? resolved.url
        : typeof resolved.url === "object" && resolved.url && typeof resolved.url.url === "string"
          ? resolved.url.url
          : "";
    if (!resolvedUrl) throw new Error("web_app_url_unavailable");
    return { url: resolvedUrl, launch_id: null };
  }

  // Inline keyboard web_app / callback URL → openWebApp.
  const info = (await client.invoke({
    _: "openWebApp",
    chat_id: chatId,
    bot_user_id: botUserId,
    url: url || "",
    topic_id: null,
    reply_to: null,
    parameters: webAppOpenParameters(),
  })) as { url?: string | { url?: string }; launch_id?: string | number };
  const openUrl =
    typeof info.url === "string"
      ? info.url
      : typeof info.url === "object" && info.url && typeof info.url.url === "string"
        ? info.url.url
        : url;
  if (!openUrl) throw new Error("web_app_url_unavailable");
  return {
    url: openUrl,
    launch_id: info.launch_id != null ? String(info.launch_id) : null,
  };
}
