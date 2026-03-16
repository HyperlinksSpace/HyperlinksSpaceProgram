import type { Context } from "grammy";
import { normalizeSymbol } from "../blockchain/coffee.js";
import { transmit, transmitStream } from "../ai/transmitter.js";
import { normalizeUsername } from "../database/users.js";
import { getMaxTelegramUpdateIdForThread, insertMessage } from "../database/messages.js";
import {
  closeOpenTelegramHtml,
  mdToTelegramHtml,
  stripUnpairedMarkdownDelimiters,
  truncateTelegramHtmlSafe,
} from "./format.js";

/** Telegram text message length limit. */
const MAX_MESSAGE_TEXT_LENGTH = 4096;

/** Instruction passed to AI when the message comes from the bot: keep replies under 4096 chars and mention TMA for long answers. */
const TELEGRAM_BOT_LENGTH_INSTRUCTION =
  "Please give an answer in less than 4096 chars. If user asks for a long message or a message with more than 4096 chars add a sentence that full responses are available only in TMA and your bot you can give just a short answer that follows.";

/** Split text into chunks of at most maxLen, preferring to break at newlines. */
function chunkText(text: string, maxLen: number): string[] {
  if (text.length <= maxLen) return [text];
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + maxLen, text.length);
    if (end < text.length) {
      const lastNewline = text.lastIndexOf("\n", end - 1);
      if (lastNewline >= start) end = lastNewline + 1;
    }
    chunks.push(text.slice(start, end));
    start = end;
  }
  return chunks;
}

/** Send long text as multiple messages (each ≤ MAX_MESSAGE_TEXT_LENGTH). First chunk replies to replyToMessageId or uses replyOptions; rest reply to previous sent message. */
async function sendLongMessage(
  api: Context["api"],
  chatId: number,
  fullText: string,
  replyOptions: { message_thread_id?: number; reply_parameters?: { message_id: number } },
  replyOptionsWithHtml: { message_thread_id?: number; reply_parameters?: { message_id: number }; parse_mode: "HTML" },
  opts: { replyToMessageId?: number },
): Promise<void> {
  const chunks = chunkText(fullText, MAX_MESSAGE_TEXT_LENGTH);
  if (chunks.length === 0) return;
  let lastSentId: number | undefined = opts.replyToMessageId;
  for (let i = 0; i < chunks.length; i++) {
    const formatted = truncateTelegramHtmlSafe(
      closeOpenTelegramHtml(
        stripUnpairedMarkdownDelimiters(mdToTelegramHtml(chunks[i])),
      ),
      MAX_MESSAGE_TEXT_LENGTH,
    );
    const partOptions =
      i === 0 && lastSentId === undefined
        ? replyOptionsWithHtml
        : {
            ...(replyOptions.message_thread_id !== undefined ? { message_thread_id: replyOptions.message_thread_id } : {}),
            ...(lastSentId !== undefined ? { reply_parameters: { message_id: lastSentId } } : {}),
            parse_mode: "HTML" as const,
          };
    try {
      const sent = await api.sendMessage(chatId, formatted, partOptions);
      const id = (sent as { message_id?: number }).message_id;
      if (typeof id === "number") lastSentId = id;
    } catch (e) {
      console.error("[bot][sendLongMessage]", (e as Error)?.message ?? e);
      try {
        const markdown = toTelegramMarkdown(chunks[i]);
        const sent = await api.sendMessage(chatId, markdown, {
          ...partOptions,
          parse_mode: "Markdown",
        });
        const id = (sent as { message_id?: number }).message_id;
        if (typeof id === "number") lastSentId = id;
      } catch {
        const sent = await api.sendMessage(chatId, chunks[i], {
          ...(replyOptions.message_thread_id !== undefined ? { message_thread_id: replyOptions.message_thread_id } : {}),
          ...(lastSentId !== undefined ? { reply_parameters: { message_id: lastSentId } } : {}),
        });
        const id = (sent as { message_id?: number }).message_id;
        if (typeof id === "number") lastSentId = id;
      }
    }
  }
}

/** Convert AI-style markdown to Telegram Markdown (* bold, _ italic, ` code) for parse_mode fallback. */
function toTelegramMarkdown(s: string): string {
  return s.replace(/\*\*/g, "*");
}
/** Throttle editMessageText to avoid Telegram 429 rate limits. */
const EDIT_THROTTLE_MS = 500;
/** If content grew by more than this many chars, edit immediately so long tail doesn't stick. */
const EDIT_MIN_CHARS_TO_SEND_NOW = 20;

/** Track latest generation per chat so newer messages cancel older streams. */
const chatGenerations = new Map<number, number>();

type BotSourceContext = {
  source: "bot";
  username?: string | null;
  locale?: string | null;
};

function buildBotContext(ctx: Context): BotSourceContext {
  const from = ctx.from;
  return {
    source: "bot",
    username: from?.username ?? null,
    locale:
      typeof from?.language_code === "string" ? from.language_code : null,
  };
}

function extractPlainText(ctx: Context): string | null {
  const msg = ctx.message;
  if (!msg) return null;
  if ("text" in msg && typeof msg.text === "string") {
    return msg.text.trim();
  }
  if ("caption" in msg && typeof (msg as any).caption === "string") {
    return (msg as any).caption.trim();
  }
  return null;
}

/** True if message looks like a single token ticker (e.g. DOGS, TON, $USDT). */
function looksLikeTicker(text: string): boolean {
  const parts = text.split(/\s+/);
  const first = parts[0]?.replace(/^\$/g, "") ?? "";
  return parts.length === 1 && normalizeSymbol(first).length > 0;
}

export async function handleBotAiResponse(ctx: Context): Promise<void> {
  const from = ctx.from;
  const userId = from ? String(from.id) : undefined;
  const context = buildBotContext(ctx);

  const text = extractPlainText(ctx);
  /** When the user writes in a topic/thread, we must send drafts and replies to the same thread. */
  const messageThreadId =
    typeof (ctx.message as { message_thread_id?: number } | undefined)?.message_thread_id === "number"
      ? (ctx.message as { message_thread_id: number }).message_thread_id
      : undefined;
  const replyToMessageId =
    ctx.message && typeof (ctx.message as { message_id?: number }).message_id === "number"
      ? (ctx.message as { message_id: number }).message_id
      : undefined;
  const replyOptions: { message_thread_id?: number; reply_parameters?: { message_id: number } } = {
    ...(messageThreadId !== undefined ? { message_thread_id: messageThreadId } : {}),
    ...(replyToMessageId !== undefined ? { reply_parameters: { message_id: replyToMessageId } } : {}),
  };
  const replyOptionsWithHtml = { ...replyOptions, parse_mode: "HTML" as const };

  if (!text) {
    const msg = ctx.message;
    const hasTextOrCaption =
      (msg && "text" in msg) || (msg && "caption" in (msg as any));
    if (hasTextOrCaption) {
      await ctx.reply("Send me a message or token ticker (e.g. USDT).", replyOptions);
    }
    return;
  }

  const user_telegram = normalizeUsername(from?.username);
  const thread_id = messageThreadId ?? 0;
  const update_id = typeof (ctx.update as { update_id?: number }).update_id === "number"
    ? (ctx.update as { update_id: number }).update_id
    : undefined;
  const threadContext =
    user_telegram && update_id !== undefined
      ? { user_telegram, thread_id, type: "bot" as const, telegram_update_id: update_id }
      : undefined;

  const mode = looksLikeTicker(text) ? "token_info" : "chat";
  const chatId = ctx.chat?.id;
  const isPrivate = ctx.chat?.type === "private";
  const canStream = isPrivate && typeof chatId === "number";
  /** When streaming we send one message early then edit it; used to detect streaming path. */
  let streamSentMessageId: number | null = null;

  const numericChatId =
    typeof chatId === "number" ? chatId : undefined;
  let generation = 0;
  if (numericChatId !== undefined) {
    const prev = chatGenerations.get(numericChatId) ?? 0;
    generation = prev + 1;
    chatGenerations.set(numericChatId, generation);
  }
  const isCancelled = (): boolean =>
    numericChatId !== undefined &&
    chatGenerations.get(numericChatId) !== generation;

  const shouldAbortSend = async (): Promise<boolean> => {
    if (!threadContext) return false;
    const max = await getMaxTelegramUpdateIdForThread(
      threadContext.user_telegram,
      threadContext.thread_id,
      "bot",
    );
    return max !== null && max !== threadContext.telegram_update_id;
  };

  let result: Awaited<ReturnType<typeof transmit>>;
  /** Set in streaming path; when cancelled send partial and persist. When aborted by newer message, persist only (no send) to avoid flash. */
  let interruptedReplyCallback: ((opts: { sendToChat: boolean }) => Promise<void>) | null = null;

  if (canStream && chatId !== undefined) {
    let sentMessageId: number | null = null;
    let lastEdited = "";
    let lastSendTime = 0;
    let pending: string | null = null;
    let throttleTimer: ReturnType<typeof setTimeout> | null = null;
    let editsDisabled = false;
    /** Latest accumulated text from stream; used for interrupted reply and persist. */
    let streamedAccumulated = "";

    /** When turn is interrupted: message already exists (we sent early); optionally final edit, always persist. HTML only (format pipeline is strict). */
    const sendInterruptedReply = async (opts: { sendToChat: boolean }): Promise<void> => {
      const content = streamedAccumulated.trim();
      if (sentMessageId !== null && content.length > 0) {
        const toEdit = truncateTelegramHtmlSafe(
          closeOpenTelegramHtml(
            stripUnpairedMarkdownDelimiters(mdToTelegramHtml(content)),
          ),
          MAX_MESSAGE_TEXT_LENGTH,
        );
        try {
          await ctx.api.editMessageText(chatId, sentMessageId, toEdit, { parse_mode: "HTML" });
        } catch (e) {
          console.error("[bot][edit] interrupted reply", (e as Error)?.message ?? e);
        }
      } else if (opts.sendToChat && content.length > 0) {
        const toSend = truncateTelegramHtmlSafe(
          closeOpenTelegramHtml(
            stripUnpairedMarkdownDelimiters(mdToTelegramHtml(content)),
          ),
          MAX_MESSAGE_TEXT_LENGTH,
        );
        try {
          await ctx.reply(toSend, replyOptionsWithHtml);
        } catch (e) {
          console.error("[bot][reply] interrupted", (e as Error)?.message ?? e);
        }
      } else if (opts.sendToChat && sentMessageId === null) {
        try {
          await ctx.reply("…", replyOptions);
        } catch (_) {}
      }
      if (threadContext && content.length > 0) {
        await insertMessage({
          user_telegram: threadContext.user_telegram,
          thread_id: threadContext.thread_id,
          type: "bot",
          role: "assistant",
          content,
        });
      }
    };

    /** One send (first) or edit in flight at a time so we never send multiple messages by race. */
    let sendOrEditQueue = Promise.resolve<void>(undefined);

    /** First call sends a message (claims message_id); later calls edit that message. HTML only; format pipeline is strict so Telegram accepts it. */
    const sendOrEditOnce = (formatted: string, _rawSlice: string): Promise<void> => {
      const run = async (): Promise<void> => {
        if (await shouldAbortSend()) return;
        if (isCancelled() || editsDisabled) return;
        const text = truncateTelegramHtmlSafe(formatted.trim() || "…", MAX_MESSAGE_TEXT_LENGTH);
        try {
          if (sentMessageId === null) {
            const sent = await ctx.api.sendMessage(chatId, text, replyOptionsWithHtml);
            const id = (sent as { message_id?: number }).message_id;
            if (typeof id === "number") {
              sentMessageId = id;
              streamSentMessageId = id;
            }
          } else {
            await ctx.api.editMessageText(chatId, sentMessageId, text, { parse_mode: "HTML" });
          }
        } catch (e: unknown) {
          const err = e as { error_code?: number; description?: string; parameters?: { retry_after?: number } };
          if (err?.description?.includes("not modified")) return;
          if (err?.error_code === 429) {
            await new Promise((r) => setTimeout(r, Math.min((err.parameters?.retry_after ?? 1) * 1000, 2000)));
            try {
              if (sentMessageId === null) {
                const sent = await ctx.api.sendMessage(chatId, text, replyOptionsWithHtml);
                const id = (sent as { message_id?: number }).message_id;
                if (typeof id === "number") {
                  sentMessageId = id;
                  streamSentMessageId = id;
                }
              } else {
                await ctx.api.editMessageText(chatId, sentMessageId, text, { parse_mode: "HTML" });
              }
            } catch (e2) {
              console.error("[bot][edit] 429 retry failed", (e2 as Error)?.message ?? e2);
              editsDisabled = true;
            }
          } else {
            console.error("[bot][edit] HTML rejected", err?.description ?? (e as Error)?.message ?? e);
            editsDisabled = true;
          }
        }
      };
      sendOrEditQueue = sendOrEditQueue.then(() => run());
      return sendOrEditQueue;
    };

    const flushEdit = (awaitSend = false): void | Promise<void> => {
      if (isCancelled()) return;
      if (pending === null) return;
      const slice = pending;
      pending = null;
      throttleTimer = null;
      lastEdited = slice;
      lastSendTime = Date.now();
      const formatted = closeOpenTelegramHtml(
        stripUnpairedMarkdownDelimiters(mdToTelegramHtml(slice)),
      );
      if (!formatted.trim() && !slice.trim()) return;
      const p = sendOrEditOnce(formatted, slice);
      if (awaitSend) return p;
      void p;
    };

    const sendOrEdit = (accumulated: string): void => {
      clearInterval(typingInterval);
      streamedAccumulated = accumulated;
      if (isCancelled()) return;
      const slice = accumulated.length > MAX_MESSAGE_TEXT_LENGTH
        ? accumulated.slice(0, MAX_MESSAGE_TEXT_LENGTH)
        : accumulated;
      if (slice === lastEdited && (sentMessageId !== null || lastEdited !== "")) return;
      const formatted = closeOpenTelegramHtml(
        stripUnpairedMarkdownDelimiters(mdToTelegramHtml(slice)),
      );
      if (!formatted.trim() && slice.trim()) {
        lastEdited = slice;
        return;
      }
      if (!slice.trim() && sentMessageId !== null) return;
      const now = Date.now();
      const throttleElapsed = now - lastSendTime;
      const bigChunk = slice.length - lastEdited.length >= EDIT_MIN_CHARS_TO_SEND_NOW;
      const shouldSendNow =
        sentMessageId === null ||
        throttleElapsed >= EDIT_THROTTLE_MS ||
        (bigChunk && slice.length > lastEdited.length);
      if (shouldSendNow) {
        lastEdited = slice;
        lastSendTime = now;
        pending = null;
        if (throttleTimer) {
          clearTimeout(throttleTimer);
          throttleTimer = null;
        }
        void sendOrEditOnce(formatted, slice);
      } else {
        pending = slice;
        if (!throttleTimer) {
          throttleTimer = setTimeout(
            () => void flushEdit(),
            EDIT_THROTTLE_MS - throttleElapsed,
          );
        }
      }
    };

    interruptedReplyCallback = sendInterruptedReply;

    // Start with rotating typing indicator instead of static "…"
    const typingFrames = ["\\", "/", "-", "|"];
    let typingIndex = 0;

    await sendOrEditOnce(typingFrames[typingIndex], typingFrames[typingIndex]);

    const typingInterval = setInterval(() => {
      if (sentMessageId === null) return;
      typingIndex = (typingIndex + 1) % typingFrames.length;
      ctx.api
        .editMessageText(chatId, sentMessageId, typingFrames[typingIndex])
        .catch(() => {});
    }, 300);
    result = await transmitStream(
      { input: text, userId, context, mode, threadContext, instructions: TELEGRAM_BOT_LENGTH_INSTRUCTION },
      sendOrEdit,
      {
        isCancelled,
        getAbortSignal: async () => (await shouldAbortSend()) || isCancelled(),
      },
    );
    if (result.skipped) return;
    if (isCancelled()) {
      await sendInterruptedReply({ sendToChat: !(await shouldAbortSend()) });
      return;
    }
    if (throttleTimer) {
      clearTimeout(throttleTimer);
      throttleTimer = null;
    }
    const finalFlush = flushEdit(true);
    if (finalFlush) await finalFlush;

    if (
      mode === "token_info" &&
      (!result.ok || !result.output_text) &&
      result.error?.includes("temporarily unavailable")
    ) {
      if (isCancelled()) {
        return;
      }
      lastEdited = "";
      result = await transmitStream(
        {
          input: text,
          userId,
          context,
          mode: "chat",
          threadContext: threadContext ? { ...threadContext, skipClaim: true } : undefined,
          instructions: TELEGRAM_BOT_LENGTH_INSTRUCTION,
        },
        sendOrEdit,
        {
          isCancelled,
          getAbortSignal: async () => (await shouldAbortSend()) || isCancelled(),
        },
      );
      if (result.skipped) return;
      if (isCancelled()) {
        await sendInterruptedReply({ sendToChat: !(await shouldAbortSend()) });
        return;
      }
      if (throttleTimer) {
        clearTimeout(throttleTimer);
        throttleTimer = null;
      }
      const retryFlush = flushEdit(true);
      if (retryFlush) await retryFlush;
    }
    await sendOrEditQueue;
    // Ensure the streamed message shows the full content: last delta may not be the final snapshot (SDK/stream timing), so do one final edit from result.output_text.
    if (
      result.ok &&
      result.output_text &&
      streamSentMessageId !== null &&
      chatId !== undefined
    ) {
      const fullSlice = result.output_text.slice(0, MAX_MESSAGE_TEXT_LENGTH);
      const finalFormatted = truncateTelegramHtmlSafe(
        closeOpenTelegramHtml(
          stripUnpairedMarkdownDelimiters(mdToTelegramHtml(fullSlice)),
        ),
        MAX_MESSAGE_TEXT_LENGTH,
      );
      if (finalFormatted.trim()) {
        sendOrEditQueue = sendOrEditQueue.then(async () => {
          try {
            await ctx.api.editMessageText(chatId, streamSentMessageId!, finalFormatted, { parse_mode: "HTML" });
          } catch (e: unknown) {
            const err = e as { description?: string; message?: string };
            if (err?.description?.includes("not modified")) return;
            console.error("[bot][edit] final completion edit", err?.description ?? err?.message ?? e);
            try {
              await ctx.api.editMessageText(chatId, streamSentMessageId!, fullSlice, {});
            } catch (e2: unknown) {
              const d2 = (e2 as { description?: string })?.description;
              console.error("[bot][edit] final completion plain fallback", d2 ?? (e2 as Error)?.message ?? e2);
            }
          }
        });
        await sendOrEditQueue;
      }
    }
  } else {
    result = await transmit({ input: text, userId, context, mode, threadContext, instructions: TELEGRAM_BOT_LENGTH_INSTRUCTION });
    if (result.skipped) return;
    if (isCancelled()) {
      return;
    }

    if (
      mode === "token_info" &&
      (!result.ok || !result.output_text) &&
      result.error?.includes("temporarily unavailable")
    ) {
      if (isCancelled()) {
        return;
      }
      result = await transmit({
        input: text,
        userId,
        context,
        mode: "chat",
        threadContext: threadContext ? { ...threadContext, skipClaim: true } : undefined,
        instructions: TELEGRAM_BOT_LENGTH_INSTRUCTION,
      });
      if (result.skipped) return;
    }
  }

  if (!result.ok || !result.output_text) {
    if (await shouldAbortSend()) return;
    if (isCancelled()) return;
    const errMsg = result.error ?? "AI returned no output.";
    console.error("[bot][ai]", errMsg);
    const message: string =
      mode === "token_info" && result.error
        ? result.error
        : "AI is temporarily unavailable. Please try again in a moment.";
    if (streamSentMessageId !== null && chatId !== undefined) {
      try {
        await ctx.api.editMessageText(chatId, streamSentMessageId, message, {});
      } catch {
        await ctx.reply(message, replyOptions);
      }
    } else {
      await ctx.reply(message, replyOptions);
    }
    return;
  }

  if (await shouldAbortSend() && interruptedReplyCallback) {
    await interruptedReplyCallback({ sendToChat: false });
    return;
  }
  if (await shouldAbortSend()) return;
  if (isCancelled() && interruptedReplyCallback) {
    await interruptedReplyCallback({ sendToChat: true });
    return;
  }
  if (isCancelled()) return;

  // Streaming path: first message already has up to 4096. Send overflow as continuation if needed; then we're done.
  if (streamSentMessageId !== null && chatId !== undefined) {
    if (result.output_text.length > MAX_MESSAGE_TEXT_LENGTH) {
      await sendLongMessage(
        ctx.api,
        chatId,
        result.output_text.slice(MAX_MESSAGE_TEXT_LENGTH),
        replyOptions,
        replyOptionsWithHtml,
        { replyToMessageId: streamSentMessageId },
      );
    }
    return;
  }

  if (result.output_text.length <= MAX_MESSAGE_TEXT_LENGTH) {
    const textToFormat = result.output_text;
    const formatted = truncateTelegramHtmlSafe(
      closeOpenTelegramHtml(
        stripUnpairedMarkdownDelimiters(mdToTelegramHtml(textToFormat)),
      ),
      MAX_MESSAGE_TEXT_LENGTH,
    );
    try {
      await ctx.reply(formatted, replyOptionsWithHtml);
    } catch (e) {
      console.error("[bot][reply] HTML reply failed", (e as Error)?.message ?? e);
      try {
        await ctx.reply(toTelegramMarkdown(textToFormat), { ...replyOptions, parse_mode: "Markdown" });
      } catch {
        await ctx.reply(textToFormat, replyOptions);
      }
    }
    return;
  }

  if (chatId !== undefined) {
    await sendLongMessage(ctx.api, chatId, result.output_text, replyOptions, replyOptionsWithHtml, {});
  } else {
    const textToFormat = result.output_text.slice(0, MAX_MESSAGE_TEXT_LENGTH);
    await ctx.reply(textToFormat, replyOptions);
  }
}
