/**
 * Detect "what model are you?" questions and resolve the user-selected model label/id
 * so replies never invent a different provider identity.
 */
import { AI_TOOLS_MODEL_OPTIONS } from "./llmRouter.js";

export type AiModelRoutePreference = {
  modelMode?: "auto" | "tinymodel" | "model";
  modelId?: string | null;
};

export type SelectedModelDisclosure = {
  mode: "auto" | "tinymodel" | "model";
  /** Catalog / API model id when mode is model (e.g. openai/gpt-6-astra). */
  modelId: string | null;
  /** Human label for UI (e.g. GPT-6 Astra). */
  label: string;
};

/** True when the user is asking which LLM / version is answering. */
export function isModelIdentityQuestion(input: string): boolean {
  const t = input.trim().toLowerCase();
  if (!t || t.length > 280) return false;

  // EN
  if (
    /\bwhat(?:'s| is| are)?\s+(?:the\s+)?(?:ai\s+)?(?:model|llm|version)\b/.test(t) ||
    /\bwhich\s+(?:ai\s+)?(?:model|llm|version)\b/.test(t) ||
    /\bwhat\s+model\s+(?:are|is)\s+you\b/.test(t) ||
    /\b(?:are|who)\s+you\b/.test(t) && /\b(?:model|gpt|claude|gemini|chatgpt|openai|llm)\b/.test(t) ||
    /\bwho\s+are\s+you\b/.test(t) ||
    /\bare\s+you\s+(?:gpt|claude|gemini|chatgpt|openai|anthropic|grok|deepseek|qwen|mistral)\b/.test(
      t,
    ) ||
    /\b(?:model|llm)\s+(?:name|id|version)\b/.test(t) ||
    /\bexact\s+(?:model|name|id|version)\b/.test(t)
  ) {
    return true;
  }

  // RU — avoid \b (JS word boundaries are ASCII-only and miss Cyrillic).
  if (
    /какая\s+(?:у\s+тебя\s+|твоя\s+)?(?:версия|модель)/.test(t) ||
    /какая\s+ты\s+модел/.test(t) ||
    /че\s+ты\s+за\s+модел/.test(t) ||
    /что\s+ты\s+за\s+(?:ии|ai|модел)/.test(t) ||
    /твоя\s+(?:версия|модель)/.test(t) ||
    /назови\s+(?:свою\s+)?модел/.test(t) ||
    /точн(?:ое|ый)\s+(?:название|id|идентификатор)/.test(t) ||
    /название\s+своей\s+модел/.test(t) ||
    /какая\s+модель\s+ии/.test(t) ||
    /за\s+модель\s+ии/.test(t)
  ) {
    return true;
  }

  // Short follow-ups after prior model talk.
  if (/^(model|модел[ьи]|версия|version)\??$/i.test(t)) return true;

  return false;
}

export function resolveSelectedModelDisclosure(
  preference?: AiModelRoutePreference | null,
): SelectedModelDisclosure {
  const mode = preference?.modelMode ?? "auto";
  if (mode === "tinymodel") {
    return { mode: "tinymodel", modelId: "tinymodel/rag", label: "Tiny Model" };
  }
  if (mode === "model" && preference?.modelId?.trim()) {
    const id = preference.modelId.trim();
    const hit = AI_TOOLS_MODEL_OPTIONS.find((m) => m.id === id);
    return {
      mode: "model",
      modelId: id,
      label: hit?.label ?? id,
    };
  }
  return { mode: "auto", modelId: null, label: "Auto" };
}

/** Prefer Russian when the question is mostly Cyrillic; otherwise English. */
export function detectIdentityReplyLanguage(input: string | null | undefined): "ru" | "en" {
  const t = (input ?? "").trim();
  if (!t) return "en";
  const cyr = (t.match(/[\u0400-\u04FF]/g) ?? []).length;
  const lat = (t.match(/[A-Za-z]/g) ?? []).length;
  if (cyr > 0 && cyr >= lat) return "ru";
  return "en";
}

/** Deterministic answer — does not call the LLM (avoids wrong self-ID). */
export function buildModelIdentityAnswer(
  preference?: AiModelRoutePreference | null,
  opts?: { actualRuntimeModel?: string | null; input?: string | null },
): string {
  const selected = resolveSelectedModelDisclosure(preference);
  const runtime = opts?.actualRuntimeModel?.trim() || null;
  const lang = detectIdentityReplyLanguage(opts?.input);

  if (selected.mode === "tinymodel") {
    if (lang === "ru") {
      return (
        "В AI tools выбрана **Tiny Model**. " +
        "Этот ответ из знаний Hyperlinks Space Program (Tiny Model / локальный корпус), " +
        "а не из облачной frontier-модели. Внутренний id: `tinymodel/rag`."
      );
    }
    return (
      "You selected **Tiny Model** in AI tools. " +
      "This turn is answered from Hyperlinks Space Program knowledge (Tiny Model / local corpus), " +
      "not a frontier cloud LLM. Internal id: `tinymodel/rag`."
    );
  }

  if (selected.mode === "model" && selected.modelId) {
    const runtimeMismatch =
      runtime &&
      runtime !== selected.modelId &&
      !runtime.endsWith(selected.modelId.split("/").pop() || "");
    if (lang === "ru") {
      const runtimeNote = runtimeMismatch
        ? ` Запрос к провайдеру для этого ответа шёл через \`${runtime}\` (запасной вариант, если выбранный маршрут был недоступен).`
        : "";
      return (
        `В AI tools выбрана **${selected.label}**. ` +
        `Точный id модели в этом чате: \`${selected.modelId}\`.` +
        runtimeNote +
        " Я — ассистент Hyperlinks Space Program на этой выбранной модели, а не на другой."
      );
    }
    const runtimeNote = runtimeMismatch
      ? ` The provider request for this reply used \`${runtime}\` (fallback if the selected route was unavailable).`
      : "";
    return (
      `You selected **${selected.label}** in AI tools. ` +
      `Exact model id for this chat: \`${selected.modelId}\`.` +
      runtimeNote +
      " I am the Hyperlinks Space Program assistant running on that selection — not a different model."
    );
  }

  if (lang === "ru") {
    return (
      "В AI tools стоит **Auto**. Бэкенд на каждое сообщение выбирает достаточно дешёвую модель " +
      "(Tiny Model для фактов о программе, иначе Gateway / OpenAI). " +
      "Откройте AI tools и выберите конкретную модель, если нужен фиксированный id каждый раз."
    );
  }
  return (
    "AI tools is set to **Auto**. The backend picks the cheapest sufficient model for each message " +
    "(Tiny Model for program facts when possible, otherwise a Gateway / OpenAI chat model). " +
    "Open AI tools and pick a specific model if you want a fixed id every turn."
  );
}

/** Append to LLM system instructions so non-short-circuited turns stay honest. */
export function appendSelectedModelIdentityInstructions(
  base: string | undefined,
  preference?: AiModelRoutePreference | null,
): string {
  const selected = resolveSelectedModelDisclosure(preference);
  let identity: string;
  if (selected.mode === "tinymodel") {
    identity =
      "User selected Tiny Model. If asked which model/version you are, say Tiny Model " +
      "(Hyperlinks program knowledge / tinymodel/rag) in the same language as the user's question. " +
      "Do not claim to be GPT, Claude, Gemini, or another cloud model.";
  } else if (selected.mode === "model" && selected.modelId) {
    identity =
      `User selected model "${selected.label}" with exact id "${selected.modelId}". ` +
      "When asked which model, LLM, or version you are (any language), state that exact label and id " +
      "in the same language as the user's question. " +
      "Do not invent a different model name, claim a generic OpenAI assistant, or refuse to disclose the selected id.";
  } else {
    identity =
      "User selected Auto routing. When asked which model you are, say Auto is enabled and the backend " +
      "chooses per message (reply in the same language as the user); invite them to pick a fixed model in AI tools for a stable id.";
  }
  const prefix = (base ?? "").trim();
  return prefix ? `${prefix} ${identity}` : identity;
}
