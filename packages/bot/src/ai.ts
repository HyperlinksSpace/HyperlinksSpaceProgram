import { detectRequestedLanguage, fallbackNarrative, hasGenericFallbackText } from "./fallback.js";
import type { LlmClient } from "./llm.js";
import { extractTickerFromText, RagContextBuilder } from "./rag.js";
import { buildVerifiedTokenContextSystemMessage } from "./instructions.js";
import type {
  ChatMessage,
  GenerateAnswerInput,
  GenerateAnswerResult,
  OutputLanguage,
} from "./types.js";

export async function generateAnswer(
  input: GenerateAnswerInput,
  deps: {
    llm: LlmClient;
    rag?: RagContextBuilder;
    defaultModel?: string;
    defaultLanguage?: OutputLanguage;
  }
): Promise<GenerateAnswerResult> {
  const messages = input.messages;
  const lastUser = [...messages].reverse().find((item) => item.role === "user")?.content ?? "";
  const language = detectRequestedLanguage(messages, deps.defaultLanguage ?? "en");
  const tickerSymbol = normalizeSymbol(input.tokenHint ?? extractTickerFromText(lastUser));

  let cacheHit = false;
  let sourceUrls: string[] = [];
  let tokenName: string | undefined;
  let tokenDescription: string | undefined;
  let contextBlocks: string[] = [];

  if (tickerSymbol && deps.rag) {
    const context = await deps.rag.fetchContext({
      query: lastUser,
      tokenHint: tickerSymbol,
    });
    cacheHit = context.cacheHit;
    sourceUrls = context.sourceUrls;
    contextBlocks = context.contextBlocks;
    tokenName = context.token?.name;
    tokenDescription = context.token?.description;
  }

  if (tickerSymbol && deps.rag && contextBlocks.length === 0) {
    return {
      text: fallbackNarrative({
        symbol: tickerSymbol,
        name: tokenName,
        description: tokenDescription,
        language,
      }),
      meta: {
        language,
        tickerSymbol,
        usedFallback: true,
        cacheHit,
        sourceUrls,
      },
    };
  }

  const llmMessages = withContextMessages(messages, contextBlocks, sourceUrls);

  let text = "";
  let providerError: string | undefined;

  try {
    text = await deps.llm.complete({
      model: input.model ?? deps.defaultModel ?? "gpt-4o-mini",
      messages: llmMessages,
      temperature: input.temperature,
    });
  } catch (error) {
    providerError = error instanceof Error ? error.message : "Unknown LLM error";
  }

  const needsFallback =
    Boolean(tickerSymbol) &&
    (providerError !== undefined || text.trim().length === 0 || hasGenericFallbackText(text, language));

  const safeText = needsFallback
    ? fallbackNarrative({
        symbol: tickerSymbol || "TOKEN",
        name: tokenName,
        description: tokenDescription,
        language,
      })
    : text.trim();

  if (providerError && !needsFallback) {
    throw new Error(providerError);
  }

  return {
    text: safeText,
    meta: {
      language,
      tickerSymbol,
      usedFallback: needsFallback,
      cacheHit,
      sourceUrls,
    },
  };
}

function withContextMessages(
  messages: ChatMessage[],
  contextBlocks: string[],
  sourceUrls: string[]
): ChatMessage[] {
  if (contextBlocks.length === 0) return messages;
  return [
    { role: "system", content: buildVerifiedTokenContextSystemMessage(contextBlocks, sourceUrls) },
    ...messages,
  ];
}

function normalizeSymbol(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const normalized = value.replace("$", "").trim().toUpperCase();
  return normalized || undefined;
}
