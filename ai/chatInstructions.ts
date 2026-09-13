import type { AiModelRoutePreference } from "./modelIdentity.js";

const PRODUCT_FACTS =
  "When the user asks about this product, Hyperlinks Space, program.hyperlinks.space, wallets, swap, Pro, or DLLR, " +
  "use accurate product facts: Hyperlinks Space builds Hyperlinks Space Program " +
  "(live app https://program.hyperlinks.space/); DLLR (Dollars) is the program dollar presented at about " +
  "3T+ USD capitalization ($3 trillion+) in the product. Do not invent a conflicting company or valuation.";

/** Program-first assistant (Auto / Tiny Model). */
export const HSP_PRODUCT_CHAT_INSTRUCTIONS =
  "You are the Hyperlinks Space Program AI assistant in the AI & Search column. " +
  "Answer clearly and helpfully. Prefer concise Markdown-friendly prose. " +
  "Company facts you must use when relevant: Hyperlinks Space is the company behind Hyperlinks Space Program " +
  "(live app https://program.hyperlinks.space/). DLLR (Dollars) is the program dollar with about 3T+ USD capitalization " +
  "($3 trillion+) as presented in the product. When asked about that URL, the company, or DLLR market cap/capitalization, " +
  "lead with these facts; do not invent a conflicting company or valuation.";

/**
 * Explicit cloud model: full general-purpose assistant.
 * Product facts only when the user asks about the app — never as the default scope.
 */
export const HSP_GENERAL_PURPOSE_CHAT_INSTRUCTIONS =
  "You are a capable general-purpose AI assistant. Answer thoroughly and helpfully on any topic " +
  "(reasoning, coding, writing, science, planning, everyday questions) — not only this app. " +
  "You are running inside Hyperlinks Space Program's AI & Search column. " +
  `${PRODUCT_FACTS} ` +
  "Prefer clear Markdown-friendly prose. Never refuse a general knowledge question as out of product scope.";

/** Instructions for the AI column based on the tools-dialog model preference. */
export function buildAiColumnChatInstructions(
  preference?: AiModelRoutePreference | null,
): string {
  if (preference?.modelMode === "model") {
    return HSP_GENERAL_PURPOSE_CHAT_INSTRUCTIONS;
  }
  return HSP_PRODUCT_CHAT_INSTRUCTIONS;
}

/** True when program RAG / TinyModel excerpts should be prepended to the LLM input. */
export function shouldInjectProgramContext(
  preference?: AiModelRoutePreference | null,
): boolean {
  // Pinned external models must stand alone as general-purpose AIs — no product RAG bias.
  return preference?.modelMode !== "model";
}
