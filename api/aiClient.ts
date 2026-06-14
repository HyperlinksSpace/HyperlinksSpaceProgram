import { buildApiUrl } from "./_base";
import type { HspAiAction } from "../ai/intentActions";

export type AiChatApiResponse = {
  ok: boolean;
  provider?: string;
  mode?: string;
  output_text?: string;
  error?: string;
  actions?: HspAiAction[];
  meta?: Record<string, unknown>;
};

export type AiChatRequestContext = {
  route?: string;
  locale?: string;
  walletConnected?: boolean;
};

export async function postAiChat(
  input: string,
  context?: AiChatRequestContext,
): Promise<AiChatApiResponse> {
  const res = await fetch(buildApiUrl("/api/ai"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      input,
      mode: "chat",
      context,
    }),
  });

  let body: AiChatApiResponse;
  try {
    body = (await res.json()) as AiChatApiResponse;
  } catch {
    return {
      ok: false,
      error: res.ok ? "Invalid response from AI service." : `AI request failed (${res.status}).`,
    };
  }

  if (!res.ok && body.ok !== false) {
    return { ok: false, error: `AI request failed (${res.status}).` };
  }

  return body;
}

/** Apply the first navigational action from an AI response. */
export function applyFirstNavigateAction(
  router: { push: (href: string) => void },
  actions?: HspAiAction[],
): boolean {
  if (!actions?.length) return false;
  const nav = actions.find((a): a is Extract<HspAiAction, { type: "navigate" }> => a.type === "navigate");
  if (!nav?.path) return false;
  router.push(nav.path);
  return true;
}
