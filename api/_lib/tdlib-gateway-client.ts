import { getGatewayBaseUrl, getGatewaySecret } from "../../telegram/tdlib/env.js";
import {
  gatewayHealthCheckDetailed,
  logTdlibGatewayApi,
  type GatewayHealthResult,
} from "./tdlib-gateway-debug.js";

export type GatewayConnectSnapshot = {
  ok?: boolean;
  attemptId?: string;
  telegramUsername?: string;
  authState?: string;
  qrLink?: string | null;
  error?: string | null;
  chatCount?: number | null;
};

async function gatewayFetch(
  path: string,
  init?: RequestInit,
): Promise<{ response: Response; json: GatewayConnectSnapshot & Record<string, unknown> }> {
  const base = getGatewayBaseUrl();
  const secret = getGatewaySecret();
  const url = `${base}${path}`;
  const started = Date.now();
  logTdlibGatewayApi("gateway_fetch_start", {
    method: init?.method ?? "GET",
    path,
    gatewayHost: safeHost(url),
  });
  try {
    const response = await fetch(url, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        "X-Gateway-Secret": secret,
        ...(init?.headers ?? {}),
      },
    });
    const json = (await response.json().catch(() => ({}))) as GatewayConnectSnapshot &
      Record<string, unknown>;
    logTdlibGatewayApi("gateway_fetch_done", {
      path,
      status: response.status,
      ok: response.ok,
      elapsedMs: Date.now() - started,
      authState: typeof json.authState === "string" ? json.authState : null,
      error: typeof json.error === "string" ? json.error : null,
    });
    return { response, json };
  } catch (err) {
    logTdlibGatewayApi("gateway_fetch_error", {
      path,
      elapsedMs: Date.now() - started,
      fetchError: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
    });
    throw err;
  }
}

function safeHost(url: string): string | null {
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

export async function gatewayConnectStart(
  telegramUsername: string,
  options?: { resume?: boolean; fresh?: boolean },
): Promise<GatewayConnectSnapshot & { httpStatus: number }> {
  const { response, json } = await gatewayFetch("/v1/connect/start", {
    method: "POST",
    body: JSON.stringify({
      telegramUsername,
      resume: Boolean(options?.resume),
      fresh: Boolean(options?.fresh),
    }),
  });
  return { ...json, httpStatus: response.status };
}

export async function gatewayConnectStatus(
  attemptId: string,
): Promise<GatewayConnectSnapshot & { httpStatus: number }> {
  const { response, json } = await gatewayFetch(
    `/v1/connect/status?attemptId=${encodeURIComponent(attemptId)}`,
    { method: "GET" },
  );
  return { ...json, httpStatus: response.status };
}

export async function gatewayConnectPassword(
  attemptId: string,
  password: string,
): Promise<GatewayConnectSnapshot & { httpStatus: number }> {
  const { response, json } = await gatewayFetch("/v1/connect/password", {
    method: "POST",
    body: JSON.stringify({ attemptId, password }),
  });
  return { ...json, httpStatus: response.status };
}

export async function gatewayDisconnect(telegramUsername: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const { response, json } = await gatewayFetch("/v1/disconnect", {
      method: "POST",
      body: JSON.stringify({ telegramUsername }),
    });
    return { ok: response.ok && json.ok !== false, error: typeof json.error === "string" ? json.error : undefined };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "gateway_unreachable" };
  }
}

export async function gatewayHealthCheck(): Promise<boolean> {
  const result = await gatewayHealthCheckDetailed();
  return result.ok;
}

export { gatewayHealthCheckDetailed, type GatewayHealthResult };

export function gatewayNotConfiguredResponse(): GatewayConnectSnapshot {
  return {
    authState: "failed",
    error: "tdlib_gateway_not_configured",
    qrLink: null,
    chatCount: null,
  };
}
