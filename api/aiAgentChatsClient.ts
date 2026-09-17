import { buildApiUrl } from "./_base";

export type AiAgentChatDto = {
  id: string;
  owner_username: string;
  title: string;
  share_token: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

export type AiAgentMessageDto = {
  id: string;
  chat_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  model: string | null;
  created_at: string;
  like_count: number;
  liked_by_me: boolean;
};

async function parseJson<T>(res: Response): Promise<T & { ok?: boolean; error?: string }> {
  try {
    return (await res.json()) as T & { ok?: boolean; error?: string };
  } catch {
    return { ok: false, error: `Invalid response (${res.status})` } as T & {
      ok?: boolean;
      error?: string;
    };
  }
}

export async function listAiAgentChats(): Promise<{
  ok: boolean;
  chats?: AiAgentChatDto[];
  error?: string;
}> {
  const res = await fetch(buildApiUrl("/api/ai-chats"), {
    method: "GET",
    credentials: "include",
  });
  return parseJson(res);
}

export async function getSharedAiAgentChat(shareToken: string): Promise<{
  ok: boolean;
  chat?: { id: string; title: string; shareToken: string | null; ownerUsername: string };
  messages?: Array<{
    id: string;
    role: string;
    content: string;
    model: string | null;
    createdAt: string;
    likeCount: number;
  }>;
  error?: string;
}> {
  const res = await fetch(
    buildApiUrl(`/api/ai-chats?share=${encodeURIComponent(shareToken)}`),
    { method: "GET", credentials: "include" },
  );
  return parseJson(res);
}

export async function postAiAgentChatAction(
  body: Record<string, unknown>,
): Promise<Record<string, unknown> & { ok?: boolean; error?: string }> {
  // Send waits on Tiny Model / Universal Brain; keep under serverless maxDuration.
  const isSend = body.action === "send";
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    isSend ? 100_000 : 30_000,
  );
  try {
    const res = await fetch(buildApiUrl("/api/ai-chats"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    return parseJson(res);
  } catch (e: unknown) {
    const aborted =
      (e instanceof Error && e.name === "AbortError") ||
      (typeof DOMException !== "undefined" && e instanceof DOMException && e.name === "AbortError");
    return {
      ok: false,
      error: aborted ? "ai_timeout" : "network_error",
    };
  } finally {
    clearTimeout(timer);
  }
}
