/**
 * Release webhook endpoint.
 * - GET /api/releases  -> health check
 * - POST /api/releases -> accepts release publish events from CI
 */

import { appError, appWarn } from "../../shared/appLog.js";

type NodeRes = {
  setHeader(name: string, value: string): void;
  status(code: number): void;
  end(body?: string): void;
};

type Asset = {
  name: string;
  url: string;
  sha256?: string;
};

type ReleasePayload = {
  release_id: string;
  version?: string;
  published_at: string;
  platform?: string;
  assets: Asset[];
  github_release_url?: string;
};

const processedReleaseIds = new Set<string>();
const MAX_REMEMBERED_RELEASE_IDS = 500;

function jsonResponse(body: object, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

function setNodeCors(res: NodeRes): void {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-release-token");
  res.setHeader("Content-Type", "application/json");
}

function isValidPayload(payload: unknown): payload is ReleasePayload {
  if (!payload || typeof payload !== "object") return false;
  const candidate = payload as Partial<ReleasePayload>;
  if (typeof candidate.release_id !== "string" || candidate.release_id.trim() === "") return false;
  if (typeof candidate.published_at !== "string" || candidate.published_at.trim() === "") return false;
  if (!Array.isArray(candidate.assets)) return false;
  return candidate.assets.every(
    (asset) =>
      asset &&
      typeof asset === "object" &&
      typeof (asset as Asset).name === "string" &&
      typeof (asset as Asset).url === "string",
  );
}

function rememberReleaseId(releaseId: string): void {
  processedReleaseIds.add(releaseId);
  if (processedReleaseIds.size <= MAX_REMEMBERED_RELEASE_IDS) return;

  // Best-effort bounded memory for warm server instances.
  const oldest = processedReleaseIds.values().next().value as string | undefined;
  if (oldest) processedReleaseIds.delete(oldest);
}

async function notifyReleaseSignal(payload: ReleasePayload): Promise<void> {
  const notifyUrl = process.env.RELEASES_NOTIFY_URL?.trim();
  if (!notifyUrl) return;

  const token = process.env.RELEASES_NOTIFY_TOKEN?.trim();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["x-release-token"] = token;

  const response = await fetch(notifyUrl, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`notify_failed:${response.status}`);
  }
}

async function readPayload(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

async function handleWebRequest(request: Request): Promise<Response> {
  const method = request.method;
  if (method === "OPTIONS") return jsonResponse({}, 200);

  if (method === "GET") {
    const tokenConfigured = !!process.env.RELEASE_WEBHOOK_TOKEN?.trim();
    return jsonResponse(
      {
        ok: true,
        service: "releases-webhook",
        token_configured: tokenConfigured,
        auth_mode: tokenConfigured ? "token_required" : "open",
      },
      200,
    );
  }

  if (method !== "POST") {
    return jsonResponse({ ok: false, error: "Method not allowed" }, 405);
  }

  const requiredToken = process.env.RELEASE_WEBHOOK_TOKEN?.trim();
  if (requiredToken) {
    const providedToken = request.headers.get("x-release-token")?.trim();
    if (providedToken !== requiredToken) {
      return jsonResponse({ ok: false, error: "Unauthorized" }, 401);
    }
  } else {
    appWarn("[releases]", "webhook_token_missing");
  }

  const payload = await readPayload(request);
  if (!isValidPayload(payload)) {
    return jsonResponse({ ok: false, error: "Invalid payload" }, 400);
  }

  if (processedReleaseIds.has(payload.release_id)) {
    return jsonResponse({ ok: true, duplicate: true }, 200);
  }

  rememberReleaseId(payload.release_id);
  try {
    await notifyReleaseSignal(payload);
  } catch (error) {
    appError("[releases]", "notify_error", undefined, error);
    return jsonResponse({ ok: false, error: "Failed to notify downstream service" }, 502);
  }

  return jsonResponse({ ok: true }, 200);
}

export default async function handler(request: Request, res?: NodeRes): Promise<Response | void> {
  if (!res) {
    return handleWebRequest(request);
  }

  setNodeCors(res);
  const webResponse = await handleWebRequest(request);
  res.status(webResponse.status);
  res.end(await webResponse.text());
}

export const GET = handler;
export const POST = handler;
