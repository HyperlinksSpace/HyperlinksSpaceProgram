import { appLog } from "../../shared/appLog.js";
import {
  getGatewayBaseUrl,
  getGatewaySecret,
  getTelegramApiCredentials,
} from "../../telegram/tdlib/env.js";

export const TDLIB_GATEWAY_LOG_PREFIX = "[tdlib-gateway-api]";

export function logTdlibGatewayApi(
  step: string,
  details?: Record<string, unknown>,
): void {
  appLog(TDLIB_GATEWAY_LOG_PREFIX, step, details);
}

export function gatewayEnvDiagnostics(): Record<string, unknown> {
  const explicitUrl = (process.env.TDLIB_GATEWAY_URL || "").trim();
  const base = getGatewayBaseUrl();
  let host: string | null = null;
  let urlParseError: string | null = null;
  try {
    host = new URL(base).host;
  } catch (err) {
    urlParseError = err instanceof Error ? err.message : "invalid_url";
  }

  const creds = getTelegramApiCredentials();
  const secret = getGatewaySecret();
  const defaultSecret = "dev-local-tdlib-gateway-secret";

  const tdlibEnvKeys = Object.keys(process.env).filter((k) => k.startsWith("TDLIB_")).sort();

  return {
    vercel: process.env.VERCEL === "1",
    vercelEnv: process.env.VERCEL_ENV ?? null,
    nodeEnv: process.env.NODE_ENV ?? null,
    gatewayUrlSource: explicitUrl ? "TDLIB_GATEWAY_URL" : "localhost_fallback",
    gatewayUrlConfigured: Boolean(explicitUrl),
    gatewayUrlHost: host,
    gatewayUrlParseError: urlParseError,
    gatewayUrlLength: base.length,
    hasTelegramApiId: Boolean((process.env.TELEGRAM_API_ID || "").trim()),
    hasTelegramApiHash: Boolean((process.env.TELEGRAM_API_HASH || "").trim()),
    telegramApiCredentialsOk: Boolean(creds),
    hasGatewaySecret: Boolean((process.env.TDLIB_GATEWAY_SECRET || "").trim()),
    gatewaySecretIsDefault: secret === defaultSecret,
    /** Names only — confirms which TDLIB_* vars the lambda actually received */
    tdlibEnvKeysPresent: tdlibEnvKeys,
    tdlibGatewayUrlKeyPresent: tdlibEnvKeys.includes("TDLIB_GATEWAY_URL"),
  };
}

export type GatewayHealthResult = {
  ok: boolean;
  healthUrl: string;
  healthUrlHost: string | null;
  httpStatus: number | null;
  elapsedMs: number;
  fetchError: string | null;
  responseBodyPreview: string | null;
};

export async function gatewayHealthCheckDetailed(): Promise<GatewayHealthResult> {
  const base = getGatewayBaseUrl();
  const healthUrl = `${base}/v1/health`;
  let healthUrlHost: string | null = null;
  try {
    healthUrlHost = new URL(healthUrl).host;
  } catch {
    healthUrlHost = null;
  }

  const started = Date.now();
  try {
    const response = await fetch(healthUrl, { method: "GET" });
    const elapsedMs = Date.now() - started;
    const text = await response.text().catch(() => "");
    const preview = text.slice(0, 200) || null;
    return {
      ok: response.ok,
      healthUrl,
      healthUrlHost,
      httpStatus: response.status,
      elapsedMs,
      fetchError: null,
      responseBodyPreview: preview,
    };
  } catch (err) {
    return {
      ok: false,
      healthUrl,
      healthUrlHost,
      httpStatus: null,
      elapsedMs: Date.now() - started,
      fetchError: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
      responseBodyPreview: null,
    };
  }
}
