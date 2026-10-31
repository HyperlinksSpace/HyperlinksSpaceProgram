/**
 * Single Vercel serverless entry for **single-segment** `/api/:segment` routes (Hobby plan limit).
 * Concrete handlers live in api/_handlers/*.
 *
 * Handlers are loaded on demand so one broken import cannot fail every catch-all route at cold
 * start (FUNCTION_INVOCATION_FAILED on /api/ping, feed, telegram connect, etc.).
 *
 * Vercel does not send multi-segment paths (e.g. `/api/auth/session`) to this file — only one
 * dynamic segment after `/api/`. Those URLs need real files such as `api/auth/session.ts` or a
 * `vercel.json` rewrite to a single segment (see `/api/kms/ping` → `/api/wallet-envelope-ping`).
 *
 * `vercel dev` on Windows may spawn extra workers for both this catch-all and explicit `api/auth/*`
 * files; if a worker crashes (exit 3221226505), use `npm run web` or WSL.
 *
 * Includes feed create_topup / mark_read actions (wallet notifications + unread badge).
 */

type NodeRes = {
  setHeader(name: string, value: string): void;
  status(code: number): void;
  end(body?: string): void;
};

type ApiHandler = (
  request: Request,
  res?: NodeRes,
) => Promise<Response | void>;

type RouteLoader = () => Promise<ApiHandler>;

type TelegramMessagesHandlers = typeof import("./_handlers/telegram-messages.js");
type TelegramMtprotoHandlers = typeof import("./_handlers/telegram-mtproto.js");

let telegramMessagesHandlersPromise: Promise<TelegramMessagesHandlers> | null = null;
function loadTelegramMessagesHandlers(): Promise<TelegramMessagesHandlers> {
  telegramMessagesHandlersPromise ??= import("./_handlers/telegram-messages.js");
  return telegramMessagesHandlersPromise;
}

let telegramMtprotoHandlersPromise: Promise<TelegramMtprotoHandlers> | null = null;
function loadTelegramMtprotoHandlers(): Promise<TelegramMtprotoHandlers> {
  telegramMtprotoHandlersPromise ??= import("./_handlers/telegram-mtproto.js");
  return telegramMtprotoHandlersPromise;
}

const ROUTE_LOADERS: Record<string, RouteLoader> = {
  ping: async () => (await import("./_handlers/ping.js")).default,
  "voice-debug": async () => (await import("./_handlers/voice-debug.js")).default,
  bot: async () => (await import("./_handlers/bot.js")).default,
  feed: async () => (await import("./_handlers/feed.js")).default,
  ai: async () => (await import("./_handlers/ai.js")).default,
  "ai-chats": async () => (await import("./_handlers/ai-chats.js")).default,
  "pro-catalog": async () => (await import("./_handlers/pro-catalog.js")).default,
  support: async () => (await import("./_handlers/support.js")).default,
  blockchain: async () => (await import("./_handlers/blockchain.js")).default,
  telegram: async () => (await import("./_handlers/telegram.js")).default,
  releases: async () => (await import("./_handlers/releases.js")).default,
  "screen-time": async () => (await import("./_handlers/screen-time.js")).default,
  founder: async () => (await import("./_handlers/founder.js")).default,
  "swap-coffee-tokens": async () => (await import("./_handlers/swap-coffee-tokens.js")).default,
  "ton-account-holdings": async () => (await import("./_handlers/ton-account-holdings.js")).default,
  "wallet-envelope-ping": async () => (await import("./_handlers/wallet-envelope-ping.js")).default,
  "wallet-envelope-probe": async () => (await import("./_handlers/wallet-envelope-probe.js")).default,
  "wallet-envelope-roundtrip": async () =>
    (await import("./_handlers/wallet-envelope-roundtrip.js")).default,
  "wallet-activate": async () => (await import("./_handlers/wallet-activate.js")).default,
  "wallet-send": async () => (await import("./_handlers/wallet-send.js")).default,
  "wallet-mnemonic": async () => (await import("./_handlers/wallet-mnemonic.js")).default,
  "profile-display-name": async () => (await import("./_handlers/profile-display-name.js")).default,
  /** Public short paths from vercel.json rewrites (request URL may still show these segments). */
  kmsping: async () => (await import("./_handlers/wallet-envelope-ping.js")).default,
  kmsprobe: async () => (await import("./_handlers/wallet-envelope-probe.js")).default,
  "kms-roundtrip": async () => (await import("./_handlers/wallet-envelope-roundtrip.js")).default,
  "kms/ping": async () => (await import("./_handlers/wallet-envelope-ping.js")).default,
  "kms-ping": async () => (await import("./_handlers/wallet-envelope-ping.js")).default,
  /** Telegram message sync (single-segment; see vercel.json rewrites from /api/telegram/messages/*). */
  "telegram-messages-status": async () =>
    (await loadTelegramMessagesHandlers()).telegramMessagesStatusHandler,
  "telegram-messages-connect": async () =>
    (await loadTelegramMessagesHandlers()).telegramMessagesConnectHandler,
  "telegram-messages-disconnect": async () =>
    (await loadTelegramMessagesHandlers()).telegramMessagesDisconnectHandler,
  "telegram-messages-chats": async () =>
    (await loadTelegramMessagesHandlers()).telegramMessagesChatsHandler,
  "telegram-messages-chats-load-more": async () =>
    (await loadTelegramMessagesHandlers()).telegramMessagesChatsLoadMoreHandler,
  "telegram-messages-chats-stream": async () =>
    (await loadTelegramMessagesHandlers()).telegramMessagesChatsStreamHandler,
  "telegram-messages-avatar": async () =>
    (await loadTelegramMessagesHandlers()).telegramMessagesAvatarHandler,
  "telegram-messages-profile": async () =>
    (await loadTelegramMessagesHandlers()).telegramMessagesProfileHandler,
  "telegram-messages-profile-extras": async () =>
    (await loadTelegramMessagesHandlers()).telegramMessagesProfileExtrasHandler,
  "telegram-messages-profile-audio": async () =>
    (await loadTelegramMessagesHandlers()).telegramMessagesProfileAudioHandler,
  "telegram-messages-profile-audio-cover": async () =>
    (await loadTelegramMessagesHandlers()).telegramMessagesProfileAudioCoverHandler,
  "telegram-messages-block": async () =>
    (await loadTelegramMessagesHandlers()).telegramMessagesBlockHandler,
  "telegram-messages-unblock": async () =>
    (await loadTelegramMessagesHandlers()).telegramMessagesUnblockHandler,
  "telegram-messages-links": async () =>
    (await loadTelegramMessagesHandlers()).telegramMessagesLinksHandler,
  "telegram-messages-profile-media": async () =>
    (await loadTelegramMessagesHandlers()).telegramMessagesProfileMediaHandler,
  "telegram-messages-call-create": async () =>
    (await loadTelegramMessagesHandlers()).telegramMessagesCallCreateHandler,
  "telegram-messages-call-status": async () =>
    (await loadTelegramMessagesHandlers()).telegramMessagesCallStatusHandler,
  "telegram-messages-call-discard": async () =>
    (await loadTelegramMessagesHandlers()).telegramMessagesCallDiscardHandler,
  "telegram-messages-history": async () =>
    (await loadTelegramMessagesHandlers()).telegramMessagesHistoryHandler,
  "telegram-messages-history-stream": async () =>
    (await loadTelegramMessagesHandlers()).telegramMessagesHistoryStreamHandler,
  "telegram-messages-media": async () =>
    (await loadTelegramMessagesHandlers()).telegramMessagesMediaHandler,
  "telegram-messages-custom-emoji": async () =>
    (await loadTelegramMessagesHandlers()).telegramMessagesCustomEmojiHandler,
  "telegram-messages-send": async () =>
    (await loadTelegramMessagesHandlers()).telegramMessagesSendHandler,
  "telegram-messages-send-photo": async () =>
    (await loadTelegramMessagesHandlers()).telegramMessagesSendPhotoHandler,
  "telegram-messages-callback": async () =>
    (await loadTelegramMessagesHandlers()).telegramMessagesCallbackHandler,
  "telegram-messages-web-app": async () =>
    (await loadTelegramMessagesHandlers()).telegramMessagesWebAppHandler,
  "telegram-messages-edit": async () =>
    (await loadTelegramMessagesHandlers()).telegramMessagesEditHandler,
  "telegram-messages-delete": async () =>
    (await loadTelegramMessagesHandlers()).telegramMessagesDeleteHandler,
  "telegram-messages-save-audio": async () =>
    (await loadTelegramMessagesHandlers()).telegramMessagesSaveAudioHandler,
  "telegram-messages-profile-audio-remove": async () =>
    (await loadTelegramMessagesHandlers()).telegramMessagesProfileAudioRemoveHandler,
  "telegram-messages-profile-audio-reorder": async () =>
    (await loadTelegramMessagesHandlers()).telegramMessagesProfileAudioReorderHandler,
  "telegram-messages-profile-audio-forward": async () =>
    (await loadTelegramMessagesHandlers()).telegramMessagesProfileAudioForwardHandler,
  "telegram-messages-voice-join": async () =>
    (await loadTelegramMessagesHandlers()).telegramMessagesVoiceJoinHandler,
  "telegram-messages-voice-mute": async () =>
    (await loadTelegramMessagesHandlers()).telegramMessagesVoiceMuteHandler,
  "telegram-messages-voice-participant-volume": async () =>
    (await loadTelegramMessagesHandlers()).telegramMessagesVoiceParticipantVolumeHandler,
  "telegram-messages-voice-speaking": async () =>
    (await loadTelegramMessagesHandlers()).telegramMessagesVoiceSpeakingHandler,
  "telegram-messages-voice-start": async () =>
    (await loadTelegramMessagesHandlers()).telegramMessagesVoiceStartHandler,
  "telegram-messages-voice-leave": async () =>
    (await loadTelegramMessagesHandlers()).telegramMessagesVoiceLeaveHandler,
  "telegram-messages-voice-screen-share-start": async () =>
    (await loadTelegramMessagesHandlers()).telegramMessagesVoiceScreenShareStartHandler,
  "telegram-messages-voice-screen-share-end": async () =>
    (await loadTelegramMessagesHandlers()).telegramMessagesVoiceScreenShareEndHandler,
  "telegram-messages-voice-call-message-send": async () =>
    (await loadTelegramMessagesHandlers()).telegramMessagesVoiceCallMessageSendHandler,
  "telegram-messages-voice-call-messages-stream": async () =>
    (await loadTelegramMessagesHandlers()).telegramMessagesVoiceCallMessagesStreamHandler,
  "telegram-messages-voice-participants": async () =>
    (await loadTelegramMessagesHandlers()).telegramMessagesVoiceParticipantsHandler,
  "telegram-messages-voice-participants-stream": async () =>
    (await loadTelegramMessagesHandlers()).telegramMessagesVoiceParticipantsStreamHandler,
  "telegram-messages-resolve-chat": async () =>
    (await loadTelegramMessagesHandlers()).telegramMessagesResolveChatHandler,
  "telegram-messages-search": async () =>
    (await loadTelegramMessagesHandlers()).telegramMessagesSearchHandler,
  "telegram-messages-contacts": async () =>
    (await loadTelegramMessagesHandlers()).telegramMessagesContactsHandler,
  "telegram-messages-create-group": async () =>
    (await loadTelegramMessagesHandlers()).telegramMessagesCreateGroupHandler,
  "telegram-messages-create-channel": async () =>
    (await loadTelegramMessagesHandlers()).telegramMessagesCreateChannelHandler,
  "telegram-messages-calls": async () =>
    (await loadTelegramMessagesHandlers()).telegramMessagesCallsHandler,
  "telegram-messages-stream-ticket": async () =>
    (await loadTelegramMessagesHandlers()).telegramMessagesStreamTicketHandler,
  "telegram-messages-resync": async () =>
    (await loadTelegramMessagesHandlers()).telegramMessagesResyncHandler,
  "telegram-messages-warmup": async () =>
    (await loadTelegramMessagesHandlers()).telegramMessagesWarmupHandler,
  "telegram-messages-view-inbox": async () =>
    (await loadTelegramMessagesHandlers()).telegramMessagesViewInboxHandler,
  "telegram-messages-pin-chat": async () =>
    (await loadTelegramMessagesHandlers()).telegramMessagesPinChatHandler,
  "telegram-messages-pinned-chats-order": async () =>
    (await loadTelegramMessagesHandlers()).telegramMessagesPinnedChatsOrderHandler,
  /** TDLib QR connect (proxies to local/remote gateway). */
  "telegram-mtproto-connect-start": async () =>
    (await loadTelegramMtprotoHandlers()).telegramMtprotoConnectStartHandler,
  "telegram-mtproto-connect-status": async () =>
    (await loadTelegramMtprotoHandlers()).telegramMtprotoConnectStatusHandler,
  "telegram-mtproto-connect-password": async () =>
    (await loadTelegramMtprotoHandlers()).telegramMtprotoConnectPasswordHandler,
  "telegram-mtproto-connect-phone": async () =>
    (await loadTelegramMtprotoHandlers()).telegramMtprotoConnectPhoneHandler,
  "telegram-mtproto-connect-code": async () =>
    (await loadTelegramMtprotoHandlers()).telegramMtprotoConnectCodeHandler,
  "telegram-mtproto-connect-resend-code": async () =>
    (await loadTelegramMtprotoHandlers()).telegramMtprotoConnectResendCodeHandler,
  "telegram-mtproto-connect-abort": async () =>
    (await loadTelegramMtprotoHandlers()).telegramMtprotoConnectAbortHandler,
};

const handlerCache = new Map<string, ApiHandler>();

async function resolveHandler(routeKey: string): Promise<ApiHandler | undefined> {
  const cached = handlerCache.get(routeKey);
  if (cached) return cached;

  const loader = ROUTE_LOADERS[routeKey];
  if (!loader) return undefined;

  const handler = await loader();
  handlerCache.set(routeKey, handler);
  return handler;
}

function routeKeyFromUrl(request: Request): string {
  const raw = request.url;
  if (!raw) return "";
  let pathname: string;
  try {
    pathname = new URL(raw).pathname;
  } catch {
    pathname = raw.split("?")[0] ?? "";
  }
  const segments = pathname
    .replace(/^\/api\/?/i, "")
    .split("/")
    .filter(Boolean);
  return segments.join("/");
}

function handlerLoadFailedResponse(
  routeKey: string,
  err: unknown,
  request: Request,
  res?: NodeRes,
): Response | void {
  const message = err instanceof Error ? err.message : "handler_load_failed";
  const body = JSON.stringify({
    ok: false,
    error: "handler_load_failed",
    route: routeKey,
    message,
  });
  if (res) {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.status(500);
    res.end(body);
    return;
  }
  return new Response(body, {
    status: 500,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

async function router(
  request: Request,
  res?: NodeRes,
): Promise<Response | void> {
  const key = routeKeyFromUrl(request);
  if (!ROUTE_LOADERS[key]) {
    const body = JSON.stringify({
      ok: false,
      error: "not_found",
      path: key || "(empty)",
      hint: "See api/[...path].ts (single-segment routes) and api/**/*.ts for multi-segment paths; handlers in api/_handlers/",
    });
    if (res) {
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.status(404);
      res.end(body);
      return;
    }
    return new Response(body, {
      status: 404,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  }

  let handler: ApiHandler | undefined;
  try {
    handler = await resolveHandler(key);
  } catch (err) {
    return handlerLoadFailedResponse(key, err, request, res);
  }

  if (!handler) {
    return handlerLoadFailedResponse(key, new Error("handler_missing"), request, res);
  }

  return handler(request, res);
}

export default router;
export const GET = router;
export const POST = router;
export const OPTIONS = router;
export const PUT = router;
export const PATCH = router;
export const DELETE = router;
