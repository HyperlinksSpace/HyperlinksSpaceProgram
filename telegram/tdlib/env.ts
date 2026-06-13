import path from "path";

export function getTdlibDbRoot(): string {
  const root = (process.env.TDLIB_DB_ROOT || path.join(process.cwd(), ".tdlib-data")).trim();
  return path.resolve(root);
}

export function getTdlibUserDir(telegramUsername: string): string {
  const safe = telegramUsername.replace(/[^a-zA-Z0-9._-]/g, "_");
  return path.join(getTdlibDbRoot(), safe);
}

export function getGatewayBindHost(): string {
  return (process.env.TDLIB_GATEWAY_HOST || "127.0.0.1").trim();
}

export function getGatewayPort(): number {
  const raw = process.env.TDLIB_GATEWAY_PORT || "8787";
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : 8787;
}

export function getGatewaySecret(): string {
  return (process.env.TDLIB_GATEWAY_SECRET || "dev-local-tdlib-gateway-secret").trim();
}

export function getGatewayBaseUrl(): string {
  const explicit = (process.env.TDLIB_GATEWAY_URL || "").trim();
  if (explicit) return explicit.replace(/\/$/, "");
  return `http://127.0.0.1:${getGatewayPort()}`;
}

export function getTelegramApiCredentials(): { apiId: number; apiHash: string } | null {
  const apiIdRaw = (process.env.TELEGRAM_API_ID || "").trim();
  const apiHash = (process.env.TELEGRAM_API_HASH || "").trim();
  const apiId = Number.parseInt(apiIdRaw, 10);
  if (!apiIdRaw || !Number.isFinite(apiId) || !apiHash) return null;
  return { apiId, apiHash };
}

export function isGatewayConfiguredForApi(): boolean {
  return Boolean(getTelegramApiCredentials()) || Boolean((process.env.TDLIB_GATEWAY_URL || "").trim());
}
