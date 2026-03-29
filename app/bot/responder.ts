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
/** Hard cap on continuation chunks to avoid Telegram flood limits in topics/groups. */
const MAX_LONG_MESSAGE_PARTS = 2;
const TELEGRAM_TRUNCATION_NOTICE =
  "\n\n[Truncated in Telegram. Open the Mini App for the full response.]";

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

function getRetryAfterSeconds(error: unknown): number {
  const retryAfter = (error as { parameters?: { retry_after?: number } })?.parameters?.retry_after;
  return typeof retryAfter === "number" && Number.isFinite(retryAfter) ? retryAfter : 0;
}

function isTelegramRateLimit(error: unknown): boolean {
  const code = (error as { error_code?: number })?.error_code;
  const description = (error as { description?: string })?.description ?? "";
  return code === 429 || description.includes("Too Many Requests");
}

/** Send long text as multiple messages (each ≤ MAX_MESSAGE_TEXT_LENGTH). First chunk replies to replyToMessageId or uses replyOptions; rest reply to previous sent message. */
async function sendLongMessage(
  api: Context["api"],
  chatId: number,
  fullText: string,
  replyOptions: { message_thread_id?: number; reply_parameters?: { message_id: number } },
  replyOptionsWithHtml: { message_thread_id?: number; reply_parameters?: { message_id: number }; parse_mode: "HTML" },
  opts: { replyToMessageId?: number; shouldSkipIo?: () => boolean },
): Promise<void> {
  const chunks = chunkText(fullText, MAX_MESSAGE_TEXT_LENGTH);
  if (chunks.length === 0) return;
  const limited = chunks.slice(0, MAX_LONG_MESSAGE_PARTS);
  let lastSentId: number | undefined = opts.replyToMessageId;
  for (let i = 0; i < limited.length; i++) {
    if (opts.shouldSkipIo?.()) return;
    const isLastAllowed = i === limited.length - 1;
    const withNotice =
      isLastAllowed && chunks.length > MAX_LONG_MESSAGE_PARTS
        ? `${limited[i].trimEnd()}${TELEGRAM_TRUNCATION_NOTICE}`
        : limited[i];
    const formatted = truncateTelegramHtmlSafe(
      closeOpenTelegramHtml(
        stripUnpairedMarkdownDelimiters(mdToTelegramHtml(withNotice)),
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
      if (opts.shouldSkipIo?.()) return;
      const sent = await api.sendMessage(chatId, formatted, partOptions);
      const id = (sent as { message_id?: number }).message_id;
      if (typeof id === "number") lastSentId = id;
    } catch (e) {
      console.error("[bot][sendLongMessage]", (e as Error)?.message ?? e);
      if (isTelegramRateLimit(e) && getRetryAfterSeconds(e) > 15) return;
      try {
        const markdown = toTelegramMarkdown(withNotice);
        if (opts.shouldSkipIo?.()) return;
        const sent = await api.sendMessage(chatId, markdown, {
          ...partOptions,
          parse_mode: "Markdown",
        });
        const id = (sent as { message_id?: number }).message_id;
        if (typeof id === "number") lastSentId = id;
      } catch (e2) {
        if (isTelegramRateLimit(e2) && getRetryAfterSeconds(e2) > 15) return;
        try {
          if (opts.shouldSkipIo?.()) return;
          const sent = await api.sendMessage(chatId, withNotice, {
            ...(replyOptions.message_thread_id !== undefined ? { message_thread_id: replyOptions.message_thread_id } : {}),
            ...(lastSentId !== undefined ? { reply_parameters: { message_id: lastSentId } } : {}),
          });
          const id = (sent as { message_id?: number }).message_id;
          if (typeof id === "number") lastSentId = id;
        } catch (e3) {
          console.error("[bot][sendLongMessage] plain fallback failed", (e3 as Error)?.message ?? e3);
          return;
        }
      }
    }
  }
}

/** Convert AI-style markdown to Telegram Markdown (* bold, _ italic, ` code) for parse_mode fallback. */
function toTelegramMarkdown(s: string): string {
  return s.replace(/\*\*/g, "*");
}
/** Throttle editMessageText to avoid Telegram 429 rate limits. */
const EDIT_THROTTLE_MS = 1200;
/** If content grew by more than this many chars, edit immediately so long tail doesn't stick. */
const EDIT_MIN_CHARS_TO_SEND_NOW = 80;

/** Track latest generation per thread so newer messages cancel older streams immediately. */
const activeGeneration = new Map<string, number>();
/** Single source of truth for hard-cancel per thread ("latest prompt wins"). */
const threadControllers = new Map<string, AbortController>();

function startNewGeneration(threadKey: string): AbortController {
  const existing = threadControllers.get(threadKey);
  if (existing) {
    existing.abort();
    console.log("[bot][cancel] aborted previous generation", threadKey);
  }
  const controller = new AbortController();
  threadControllers.set(threadKey, controller);
  return controller;
}

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
  const threadKey = `bot:${typeof chatId === "number" ? chatId : from?.id ?? "unknown"}:${thread_id}`;
  const generationController = startNewGeneration(threadKey);
  const generationSignal = generationController.signal;
  const gen = (activeGeneration.get(threadKey) ?? 0) + 1;
  activeGeneration.set(threadKey, gen);
  console.log("[START] new generation", threadKey, gen, "update:", update_id ?? "n/a");
  const isStopMessage = text.toLowerCase().includes("stop");
  /** When streaming we send one message early then edit it; used to detect streaming path. */
  let streamSentMessageId: number | null = null;
  try {
  const isStaleGeneration = (): boolean =>
    activeGeneration.get(threadKey) !== gen;
  const shouldSkipTelegramIo = (label: string): boolean => {
    if (activeGeneration.get(threadKey) !== gen) {
      console.log("[CANCEL] skip edit/send", threadKey, label);
      return true;
    }
    return false;
  };
  const isCancelled = (): boolean =>
    generationSignal.aborted ||
    isStaleGeneration();

  const shouldAbortSend = async (): Promise<boolean> => {
    if (!threadContext) return false;
    const max = await getMaxTelegramUpdateIdForThread(
      threadContext.user_telegram,
      threadContext.thread_id,
      "bot",
    );
    // Abort only when a newer Telegram update already exists for this thread.
    // Using "!=" can kill the current generation before its own claim row is inserted.
    return (
      max !== null &&
      typeof threadContext.telegram_update_id === "number" &&
      max > threadContext.telegram_update_id
    );
  };
  if (isStopMessage) {
    if (chatId !== undefined) {
      await ctx.api.sendMessage(chatId, "✅ Stopped. Send a new question.", replyOptions);
    } else {
      await ctx.reply("✅ Stopped. Send a new question.", replyOptions);
    }
    return;
  }
  let staleLogged = false;
  const markStaleAndAbort = (): boolean => {
    if (!isStaleGeneration()) return false;
    if (!staleLogged) {
      staleLogged = true;
      console.log("[CANCEL] stale generation", threadKey);
    }
    if (!generationSignal.aborted) {
      generationController.abort();
    }
    return true;
  };
  let cancelLogged = false;
  const shouldAbortGeneration = async (): Promise<boolean> => {
    const abort = markStaleAndAbort() || (await shouldAbortSend()) || isCancelled();
    if (abort && !cancelLogged) {
      cancelLogged = true;
      console.log("[CANCEL] aborting stream for thread:", threadKey);
    }
    if (abort && !generationSignal.aborted) {
      generationController.abort();
    }
    return abort;
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
      if (markStaleAndAbort()) return;
      const content = streamedAccumulated.trim();
      const allowChatSend = opts.sendToChat && !generationSignal.aborted;
      if (allowChatSend && sentMessageId !== null && content.length > 0) {
        const toEdit = truncateTelegramHtmlSafe(
          closeOpenTelegramHtml(
            stripUnpairedMarkdownDelimiters(mdToTelegramHtml(content)),
          ),
          MAX_MESSAGE_TEXT_LENGTH,
        );
        try {
          if (shouldSkipTelegramIo("interrupted:edit")) return;
          await ctx.api.editMessageText(chatId, sentMessageId, toEdit, { parse_mode: "HTML" });
        } catch (e) {
          console.error("[bot][edit] interrupted reply", (e as Error)?.message ?? e);
        }
      } else if (allowChatSend && content.length > 0) {
        const toSend = truncateTelegramHtmlSafe(
          closeOpenTelegramHtml(
            stripUnpairedMarkdownDelimiters(mdToTelegramHtml(content)),
          ),
          MAX_MESSAGE_TEXT_LENGTH,
        );
        try {
          if (shouldSkipTelegramIo("interrupted:reply")) return;
          await ctx.reply(toSend, replyOptionsWithHtml);
        } catch (e) {
          console.error("[bot][reply] interrupted", (e as Error)?.message ?? e);
        }
      } else if (allowChatSend && sentMessageId === null) {
        try {
          if (shouldSkipTelegramIo("interrupted:ellipsis")) return;
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
    const typingFrames = ["%", "#", "@", "+", "@", "#"];
    let typingIndex = 0;
    let typingInterval: ReturnType<typeof setInterval> | null = null;

    const stopTypingSpinner = (): void => {
      if (!typingInterval) return;
      clearInterval(typingInterval);
      typingInterval = null;
    };

    /** First call sends a message (claims message_id); later calls edit that message. HTML only; format pipeline is strict so Telegram accepts it. */
    const sendOrEditOnce = (formatted: string, _rawSlice: string): Promise<void> => {
      const run = async (): Promise<void> => {
        if (markStaleAndAbort()) return;
        if (generationSignal.aborted) return;
        if (await shouldAbortGeneration()) return;
        if (isCancelled() || editsDisabled) return;
        const text = truncateTelegramHtmlSafe(formatted.trim() || "…", MAX_MESSAGE_TEXT_LENGTH);
        try {
          if (sentMessageId === null) {
            if (shouldSkipTelegramIo("stream:send")) return;
            const sent = await ctx.api.sendMessage(chatId, text, replyOptionsWithHtml);
            const id = (sent as { message_id?: number }).message_id;
            if (typeof id === "number") {
              sentMessageId = id;
              streamSentMessageId = id;
            }
          } else {
            if (shouldSkipTelegramIo("stream:edit")) return;
            await ctx.api.editMessageText(chatId, sentMessageId, text, { parse_mode: "HTML" });
          }
        } catch (e: unknown) {
          const err = e as { error_code?: number; description?: string; parameters?: { retry_after?: number } };
          if (err?.description?.includes("not modified")) return;
          if (err?.error_code === 429) {
            const retryAfterSec = err.parameters?.retry_after ?? 1;
            if (retryAfterSec > 15) {
              console.warn("[bot][edit] disabling edits due to long rate limit window", retryAfterSec);
              editsDisabled = true;
              return;
            }
            await new Promise((r) => setTimeout(r, Math.min(retryAfterSec * 1000, 5000)));
            try {
              if (markStaleAndAbort()) return;
              if (sentMessageId === null) {
                if (shouldSkipTelegramIo("stream:send:retry")) return;
                const sent = await ctx.api.sendMessage(chatId, text, replyOptionsWithHtml);
                const id = (sent as { message_id?: number }).message_id;
                if (typeof id === "number") {
                  sentMessageId = id;
                  streamSentMessageId = id;
                }
              } else {
                if (shouldSkipTelegramIo("stream:edit:retry")) return;
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
      if (markStaleAndAbort()) return;
      if (generationSignal.aborted) return;
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
      stopTypingSpinner();
      streamedAccumulated = accumulated;
      if (markStaleAndAbort()) return;
      if (generationSignal.aborted) return;
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

    typingInterval = setInterval(() => {
      if (markStaleAndAbort()) {
        stopTypingSpinner();
        return;
      }
      if (generationSignal.aborted) {
        stopTypingSpinner();
        return;
      }
      if (sentMessageId === null) return;
      typingIndex = (typingIndex + 1) % typingFrames.length;
      if (shouldSkipTelegramIo("typing:edit")) return;
      ctx.api
        .editMessageText(chatId, sentMessageId, typingFrames[typingIndex])
        .catch(() => {});
    }, 300);
    try {
      result = await transmitStream(
        { input: text, userId, context, mode, threadContext, instructions: TELEGRAM_BOT_LENGTH_INSTRUCTION },
        sendOrEdit,
        {
          isCancelled,
          getAbortSignal: shouldAbortGeneration,
          abortSignal: generationSignal,
        },
      );
    } catch (e) {
      const errMsg = (e as Error)?.message ?? "AI streaming failed unexpectedly.";
      console.error("[bot][stream]", errMsg);
      result = {
        ok: false,
        provider: "openai",
        mode,
        error: errMsg,
      };
    } finally {
      stopTypingSpinner();
    }
    if (result.skipped) {
      stopTypingSpinner();
      return;
    }
    if (generationSignal.aborted) {
      stopTypingSpinner();
      await sendInterruptedReply({ sendToChat: false });
      return;
    }
    if (isCancelled()) {
      stopTypingSpinner();
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
        stopTypingSpinner();
        return;
      }
      lastEdited = "";
      try {
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
            getAbortSignal: shouldAbortGeneration,
            abortSignal: generationSignal,
          },
        );
      } catch (e) {
        const errMsg = (e as Error)?.message ?? "AI fallback streaming failed unexpectedly.";
        console.error("[bot][stream][fallback]", errMsg);
        result = {
          ok: false,
          provider: "openai",
          mode: "chat",
          error: errMsg,
        };
      } finally {
        stopTypingSpinner();
      }
      if (result.skipped) {
        stopTypingSpinner();
        return;
      }
      if (generationSignal.aborted) {
        stopTypingSpinner();
        await sendInterruptedReply({ sendToChat: false });
        return;
      }
      if (isCancelled()) {
        stopTypingSpinner();
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
          if (markStaleAndAbort()) return;
          if (generationSignal.aborted) return;
          try {
            if (shouldSkipTelegramIo("final:edit")) return;
            await ctx.api.editMessageText(chatId, streamSentMessageId!, finalFormatted, { parse_mode: "HTML" });
          } catch (e: unknown) {
            const err = e as { description?: string; message?: string };
            if (err?.description?.includes("not modified")) return;
            console.error("[bot][edit] final completion edit", err?.description ?? err?.message ?? e);
            try {
              if (shouldSkipTelegramIo("final:edit:fallback")) return;
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
    if (markStaleAndAbort()) return;
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
        if (shouldSkipTelegramIo("error:edit")) return;
        await ctx.api.editMessageText(chatId, streamSentMessageId, message, {});
      } catch {
        if (shouldSkipTelegramIo("error:reply:fallback")) return;
        await ctx.reply(message, replyOptions);
      }
    } else {
      if (shouldSkipTelegramIo("error:reply")) return;
      await ctx.reply(message, replyOptions);
    }
    return;
  }

  if (await shouldAbortSend() && interruptedReplyCallback) {
    await interruptedReplyCallback({ sendToChat: false });
    return;
  }
  if (markStaleAndAbort()) return;
  if (await shouldAbortSend()) return;
  if (generationSignal.aborted && interruptedReplyCallback) {
    await interruptedReplyCallback({ sendToChat: false });
    return;
  }
  if (generationSignal.aborted) return;
  if (isCancelled() && interruptedReplyCallback) {
    await interruptedReplyCallback({ sendToChat: true });
    return;
  }
  if (isCancelled()) return;

  // Streaming path: first message already has up to 4096. Send overflow as continuation if needed; then we're done.
  if (streamSentMessageId !== null && chatId !== undefined) {
    if (markStaleAndAbort()) return;
    if (generationSignal.aborted) return;
    if (result.output_text.length > MAX_MESSAGE_TEXT_LENGTH) {
      try {
        await sendLongMessage(
          ctx.api,
          chatId,
          result.output_text.slice(MAX_MESSAGE_TEXT_LENGTH),
          replyOptions,
          replyOptionsWithHtml,
          { replyToMessageId: streamSentMessageId, shouldSkipIo: () => shouldSkipTelegramIo("overflow:sendLongMessage") },
        );
      } catch (e) {
        console.error("[bot][overflow] continuation failed", (e as Error)?.message ?? e);
      }
    }
    return;
  }

  if (result.output_text.length <= MAX_MESSAGE_TEXT_LENGTH) {
    if (markStaleAndAbort()) return;
    const textToFormat = result.output_text;
    const formatted = truncateTelegramHtmlSafe(
      closeOpenTelegramHtml(
        stripUnpairedMarkdownDelimiters(mdToTelegramHtml(textToFormat)),
      ),
      MAX_MESSAGE_TEXT_LENGTH,
    );
    try {
      if (shouldSkipTelegramIo("reply:html")) return;
      await ctx.reply(formatted, replyOptionsWithHtml);
    } catch (e) {
      console.error("[bot][reply] HTML reply failed", (e as Error)?.message ?? e);
      try {
        if (shouldSkipTelegramIo("reply:markdown")) return;
        await ctx.reply(toTelegramMarkdown(textToFormat), { ...replyOptions, parse_mode: "Markdown" });
      } catch {
        if (shouldSkipTelegramIo("reply:plain")) return;
        await ctx.reply(textToFormat, replyOptions);
      }
    }
    return;
  }

  if (chatId !== undefined) {
    if (markStaleAndAbort()) return;
    try {
      await sendLongMessage(ctx.api, chatId, result.output_text, replyOptions, replyOptionsWithHtml, {
        shouldSkipIo: () => shouldSkipTelegramIo("sendLongMessage"),
      });
    } catch (e) {
      console.error("[bot][sendLongMessage] failed", (e as Error)?.message ?? e);
      try {
        if (shouldSkipTelegramIo("sendLongMessage:errorReply")) return;
        await ctx.reply("Response was rate-limited by Telegram. Please retry in a moment.", replyOptions);
      } catch {
        // no-op
      }
    }
  } else {
    const textToFormat = result.output_text.slice(0, MAX_MESSAGE_TEXT_LENGTH);
    if (shouldSkipTelegramIo("reply:no-chatId")) return;
    await ctx.reply(textToFormat, replyOptions);
  }
  } finally {
    if (threadControllers.get(threadKey) === generationController) {
      threadControllers.delete(threadKey);
    }
  }
}
