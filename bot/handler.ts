import { callOpenAi, getOpenAiGuardState, type ChatMessage } from "./openapi.js";
import { extractTickerFromText, fetchCoffeeContext } from "./coffee.js";
import { buildVerifiedTokenContextSystemMessage } from "./instructions.js";

export type HandleChatInput = {
  messages: ChatMessage[];
  tokenHint?: string;
};

export type HandleChatOutput = {
  text: string;
  meta: {
    tickerSymbol?: string;
    usedCoffee: boolean;
    usedOpenAi: boolean;
    usedFallback: boolean;
    sourceUrls: string[];
    openAiGuard: ReturnType<typeof getOpenAiGuardState>;
  };
};

const USE_OPENAI_WITH_CONTEXT = (process.env.HANDLER_USE_OPENAI_WITH_CONTEXT || "1").trim() === "1";

function lastUserText(messages: ChatMessage[]): string {
  return [...messages].reverse().find((message) => message.role === "user")?.content || "";
}

function hasGenericFallbackPhrase(text: string): boolean {
  const value = text.toLowerCase().replace(/\s+/g, " ").trim();
  return (
    value.includes("i don't have verified data") ||
    value.includes("token provider unavailable") ||
    value.includes("i cannot verify") ||
    value.includes("no verified data")
  );
}

function fallbackNarrative(symbol: string, name?: string, description?: string): string {
  const normalized = symbol.replace("$", "").toUpperCase();
  const title = name?.trim() || `$${normalized}`;
  if (description?.trim()) {
    return `${title} (${normalized}) currently reads like a narrative-driven token.\n\n${description.trim()}\n\nIf useful, I can break this down into thesis, risk flags, and what to verify before entering.`;
  }
  return `${title} (${normalized}) looks like a speculative token where narrative and risk management matter most.\n\nI can provide a compact brief with thesis, catalysts, and risk checks.`;
}

function buildCoffeeOnlySummary(symbol: string, facts: string[]): string {
  const top = facts.slice(0, 5).map((fact) => `- ${fact}`).join("\n");
  if (top.length === 0) return `I found ${symbol}, but no reliable context was returned yet.`;
  return `Here is the latest context for ${symbol}:\n${top}`;
}

function withContextMessages(messages: ChatMessage[], facts: string[], sourceUrls: string[]): ChatMessage[] {
  if (facts.length === 0) return messages;
  return [
    { role: "system", content: buildVerifiedTokenContextSystemMessage(facts, sourceUrls) },
    ...messages,
  ];
}

export async function handleChat(input: HandleChatInput): Promise<HandleChatOutput> {
  const userText = lastUserText(input.messages);
  const tickerSymbol = (input.tokenHint || extractTickerFromText(userText) || "").replace("$", "").toUpperCase() || undefined;

  let usedCoffee = false;
  let usedOpenAi = false;
  let usedFallback = false;
  let sourceUrls: string[] = [];

  let coffeeName: string | undefined;
  let coffeeDescription: string | undefined;
  let coffeeFacts: string[] = [];

  if (tickerSymbol) {
    try {
      const coffee = await fetchCoffeeContext(tickerSymbol);
      if (coffee) {
        usedCoffee = true;
        coffeeName = coffee.name;
        coffeeDescription = coffee.description;
        coffeeFacts = coffee.facts;
        sourceUrls = coffee.sourceUrls;
      }
    } catch {
      // Fail open: coffee errors should not block chat path.
    }
  }

  if (usedCoffee && coffeeFacts.length > 1 && !USE_OPENAI_WITH_CONTEXT) {
    return {
      text: buildCoffeeOnlySummary(tickerSymbol || "token", coffeeFacts),
      meta: {
        tickerSymbol,
        usedCoffee,
        usedOpenAi,
        usedFallback,
        sourceUrls,
        openAiGuard: getOpenAiGuardState(),
      },
    };
  }

  let text = "";
  let openAiError: string | undefined;

  try {
    const modelMessages = withContextMessages(input.messages, coffeeFacts, sourceUrls);
    text = await callOpenAi(modelMessages);
    usedOpenAi = true;
  } catch (error) {
    openAiError = error instanceof Error ? error.message : "Unknown OpenAI error";
  }

  const needsFallback = Boolean(tickerSymbol) && (
    openAiError !== undefined ||
    text.trim().length === 0 ||
    hasGenericFallbackPhrase(text)
  );

  if (needsFallback) {
    usedFallback = true;
    text = fallbackNarrative(tickerSymbol || "TOKEN", coffeeName, coffeeDescription);
  }

  if (!text.trim()) {
    text = "AI response is currently unavailable. Please try again in a moment.";
  }

  return {
    text: text.trim(),
    meta: {
      tickerSymbol,
      usedCoffee,
      usedOpenAi,
      usedFallback,
      sourceUrls,
      openAiGuard: getOpenAiGuardState(),
    },
  };
}
