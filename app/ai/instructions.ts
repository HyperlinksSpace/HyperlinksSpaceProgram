import type { AiMode } from "./openai.js";

export const TOKEN_INFO_INPUT_PREFIX =
  "You are a blockchain and token analyst. Answer clearly and briefly.\n\n";

export function getInputPrefixForMode(mode: AiMode): string {
  return mode === "token_info" ? TOKEN_INFO_INPUT_PREFIX : "";
}

/** Instruction passed to AI for Telegram bot messages (HTML replies must fit Telegram limits). */
export const TELEGRAM_BOT_LENGTH_INSTRUCTION =
  "Please give an answer in less than 4096 chars. If user asks for a long message or a message with more than 4096 chars add a sentence that full responses are available only in TMA and your bot you can give just a short answer that follows.";

