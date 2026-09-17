/**
 * Universal Brain HTTP client (TinyModel Space Gradio `/chat` or Horizon2 `/v1/generate`).
 * Used when the user selects Tiny Model so answers come from the generative UB stack,
 * not only local RAG templates.
 *
 * Env:
 * - `UB_CHAT_URL` — base URL (defaults to HyperlinksSpace TinyModel1 Space)
 * - `UB_CHAT_TIMEOUT_MS` — request budget (default 120000; Space cold starts are slow)
 * - `AI_ALLOW_HF_SPACE` — set `false` to require an explicit non-HF `UB_CHAT_URL`
 */

const DEFAULT_UB_CHAT_URL = "https://hyperlinksspace-tinymodel1space.hf.space";
const DEFAULT_TIMEOUT_MS = 120_000;

export type UniversalBrainGenerateResult =
  | { ok: true; text: string; backend: "gradio_chat" | "horizon2_generate"; elapsedMs: number }
  | { ok: false; error: string; backend?: "gradio_chat" | "horizon2_generate" };

function baseUrl(): string {
  const raw = (process.env.UB_CHAT_URL ?? "").trim().replace(/\/$/, "");
  if (raw) return raw;
  const allowHf = (process.env.AI_ALLOW_HF_SPACE ?? "true").trim().toLowerCase();
  if (allowHf === "0" || allowHf === "false" || allowHf === "no") return "";
  return DEFAULT_UB_CHAT_URL;
}

export function isUniversalBrainConfigured(): boolean {
  return baseUrl().length > 0;
}

export function getUniversalBrainBaseUrl(): string {
  return baseUrl();
}

function timeoutMs(): number {
  const raw = process.env.UB_CHAT_TIMEOUT_MS?.trim();
  if (!raw) return DEFAULT_TIMEOUT_MS;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_TIMEOUT_MS;
}

function withTimeout(ms: number): { signal: AbortSignal; clear: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, clear: () => clearTimeout(timer) };
}

async function tryHorizon2Generate(
  base: string,
  message: string,
  contextBlock?: string,
): Promise<UniversalBrainGenerateResult | null> {
  const health = withTimeout(8_000);
  try {
    const healthRes = await fetch(`${base}/healthz`, { signal: health.signal });
    if (!healthRes.ok) return null;
    const body = (await healthRes.json().catch(() => null)) as { horizon2_model?: string } | null;
    if (!body || typeof body.horizon2_model !== "string") return null;
  } catch {
    return null;
  } finally {
    health.clear();
  }

  const started = Date.now();
  const ctx = (contextBlock ?? "").trim();
  const task = ctx ? "grounded" : "reformulate";
  const gen = withTimeout(timeoutMs());
  try {
    const res = await fetch(`${base}/v1/generate`, {
      method: "POST",
      signal: gen.signal,
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        task,
        text: message,
        context: ctx,
        max_new_tokens: 512,
      }),
    });
    const data = (await res.json().catch(() => null)) as { output?: string; detail?: string } | null;
    if (!res.ok) {
      return {
        ok: false,
        error: data?.detail || `Universal Brain HTTP ${res.status}`,
        backend: "horizon2_generate",
      };
    }
    const text = typeof data?.output === "string" ? data.output.trim() : "";
    if (!text) {
      return { ok: false, error: "empty_universal_brain_output", backend: "horizon2_generate" };
    }
    return {
      ok: true,
      text: sanitizeUniversalBrainUserText(text),
      backend: "horizon2_generate",
      elapsedMs: Date.now() - started,
    };
  } catch (e: unknown) {
    const messageText = e instanceof Error ? e.message : "universal_brain_failed";
    return { ok: false, error: messageText, backend: "horizon2_generate" };
  } finally {
    gen.clear();
  }
}

type GradioHistoryItem = {
  role?: string;
  content?: string;
};

function extractAssistantText(payload: unknown): string | null {
  if (!Array.isArray(payload)) return null;
  // Gradio complete payload: ["", history[], sessionState]
  const history = payload.find((item) => Array.isArray(item));
  if (!Array.isArray(history)) return null;
  for (let i = history.length - 1; i >= 0; i -= 1) {
    const row = history[i] as GradioHistoryItem | null;
    if (row && row.role === "assistant" && typeof row.content === "string" && row.content.trim()) {
      return row.content.trim();
    }
  }
  return null;
}

/**
 * Drop HF Space debug footers (`---\n*Brain trace:* …`) so chat never shows
 * raw markdown stars or internal classify/RAG telemetry.
 */
export function sanitizeUniversalBrainUserText(text: string): string {
  let t = text.replace(/\r\n/g, "\n").trim();
  t = t.replace(/\n*---+[ \t]*\n+\*?Brain\s*trace:?\*?\s*[^\n]*$/iu, "");
  t = t.replace(/\n+\*?Brain\s*trace:?\*?\s*[^\n]*$/iu, "");
  return t.trim();
}

async function generateViaGradioChat(
  base: string,
  message: string,
  opts?: { scopeKey?: string | null; contextBlock?: string | null },
): Promise<UniversalBrainGenerateResult> {
  const started = Date.now();
  const budget = timeoutMs();
  const ctx = (opts?.contextBlock ?? "").trim();
  const userMessage = ctx
    ? `${ctx}\n\n---\nUser question:\n${message}`
    : message;
  const sessionState: Record<string, unknown> = {};
  const scope = (opts?.scopeKey ?? "").trim();
  if (scope) sessionState.scope_key = scope;

  const post = withTimeout(Math.min(30_000, budget));
  let eventId = "";
  try {
    const res = await fetch(`${base}/gradio_api/call/chat`, {
      method: "POST",
      signal: post.signal,
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ data: [userMessage, [], sessionState] }),
    });
    const data = (await res.json().catch(() => null)) as { event_id?: string } | null;
    if (!res.ok || !data?.event_id) {
      return {
        ok: false,
        error: `Universal Brain Gradio call failed (${res.status})`,
        backend: "gradio_chat",
      };
    }
    eventId = data.event_id;
  } catch (e: unknown) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "universal_brain_call_failed",
      backend: "gradio_chat",
    };
  } finally {
    post.clear();
  }

  const remaining = Math.max(5_000, budget - (Date.now() - started));
  const poll = withTimeout(remaining);
  try {
    const res = await fetch(`${base}/gradio_api/call/chat/${encodeURIComponent(eventId)}`, {
      method: "GET",
      signal: poll.signal,
      headers: { Accept: "text/event-stream" },
    });
    if (!res.ok) {
      return {
        ok: false,
        error: `Universal Brain Gradio poll failed (${res.status})`,
        backend: "gradio_chat",
      };
    }
    const raw = await res.text();
    const blocks = raw.split(/\n\n+/);
    let completePayload: string | null = null;
    for (const block of blocks) {
      const lines = block.split(/\r?\n/);
      let eventName = "";
      let dataLines: string[] = [];
      for (const line of lines) {
        if (line.startsWith("event:")) eventName = line.slice(6).trim();
        if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
      }
      if (eventName === "complete" && dataLines.length > 0) {
        completePayload = dataLines.join("\n");
        break;
      }
      // Some Gradio builds omit the event name and only send a final data payload.
      if (!eventName && dataLines.length > 0 && dataLines[0] !== "null") {
        completePayload = dataLines.join("\n");
      }
    }
    if (!completePayload || completePayload === "null") {
      return { ok: false, error: "universal_brain_empty_sse", backend: "gradio_chat" };
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(completePayload);
    } catch {
      return { ok: false, error: "universal_brain_invalid_sse", backend: "gradio_chat" };
    }
    const text = extractAssistantText(parsed);
    if (!text) {
      return { ok: false, error: "universal_brain_no_assistant_text", backend: "gradio_chat" };
    }
    return {
      ok: true,
      text: sanitizeUniversalBrainUserText(text),
      backend: "gradio_chat",
      elapsedMs: Date.now() - started,
    };
  } catch (e: unknown) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "universal_brain_poll_failed",
      backend: "gradio_chat",
    };
  } finally {
    poll.clear();
  }
}

/**
 * Ask Universal Brain for a generative reply to any user question.
 * Prefers Horizon2 `/v1/generate` when the host exposes it; otherwise Gradio `/chat`.
 */
export async function generateWithUniversalBrain(args: {
  message: string;
  contextBlock?: string | null;
  scopeKey?: string | null;
}): Promise<UniversalBrainGenerateResult> {
  const trimmed = args.message.trim();
  if (!trimmed) {
    return { ok: false, error: "empty_message" };
  }
  const base = baseUrl();
  if (!base) {
    return { ok: false, error: "UB_CHAT_URL not set" };
  }

  const horizon = await tryHorizon2Generate(base, trimmed, args.contextBlock ?? undefined);
  if (horizon) return horizon;

  return generateViaGradioChat(base, trimmed, {
    scopeKey: args.scopeKey,
    contextBlock: args.contextBlock,
  });
}
