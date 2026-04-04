/**
 * API base URL helper used by frontend and bot.
 *
 * Priority:
 * - EXPO_PUBLIC_API_BASE_URL (explicit override for any environment)
 * - React Native / Expo Go dev: derive from dev server host (port 3000)
 * - Browser:
 *   - In dev: map localhost/LAN + dev port (8081/19000/19006) → port 3000
 *   - In prod: window.location.origin (e.g. https://hsbexpo.vercel.app)
 * - Node (no window): Vercel host if available, otherwise http://localhost:3000
 */

function normalizeBase(base: string): string {
  return base.replace(/\/$/, "");
}

function isLocalhostUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return isPrivateOrLocalHost(u.hostname);
  } catch {
    return false;
  }
}

function isLikelyTelegramMiniApp(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if ((window.location.hash ?? "").includes("tgWebApp")) return true;
  } catch {
    // ignore
  }
  try {
    return !!(window as unknown as { Telegram?: { WebApp?: unknown } }).Telegram?.WebApp;
  } catch {
    return false;
  }
}

function isPrivateOrLocalHost(hostname: string): boolean {
  if (hostname === "localhost" || hostname === "127.0.0.1") return true;
  if (hostname.startsWith("10.")) return true;
  if (hostname.startsWith("192.168.")) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname)) return true;
  return false;
}

function getExpoNativeDevBaseUrl(): string | null {
  // Only attempt this in React Native / Expo Go.
  if (typeof navigator === "undefined" || navigator.product !== "ReactNative") {
    return null;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Constants = require("expo-constants").default as any;
    const hostUri: string | undefined =
      Constants?.expoConfig?.hostUri ??
      Constants?.manifest2?.extra?.expoGo?.developer?.hostUri;

    if (!hostUri || typeof hostUri !== "string") {
      return null;
    }

    const [hostname] = hostUri.split(":");
    if (!hostname) return null;

    return `http://${hostname}:3000`;
  } catch {
    return null;
  }
}

function getBrowserBaseUrl(): string | null {
  if (typeof window === "undefined" || !window.location?.href) {
    return null;
  }

  try {
    const url = new URL(window.location.href);
    const { protocol, hostname, port } = url;

    // In dev, Expo often runs on 8081/19000/19006; map to 3000 for APIs.
    if (
      isPrivateOrLocalHost(hostname) &&
      (port === "8081" || port === "19000" || port === "19006")
    ) {
      return normalizeBase(`${protocol}//${hostname}:3000`);
    }

    // In production (no explicit dev port), use origin as-is.
    return normalizeBase(url.origin);
  } catch {
    return null;
  }
}

function getNodeBaseUrl(): string {
  const vercelProjectProd = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (vercelProjectProd) {
    return normalizeBase(`https://${vercelProjectProd}`);
  }

  const vercelUrl = process.env.VERCEL_URL?.trim();
  if (vercelUrl) {
    return normalizeBase(
      vercelUrl.startsWith("http") ? vercelUrl : `https://${vercelUrl}`,
    );
  }

  // Local dev fallback (vercel dev on 3000).
  return "http://localhost:3000";
}

export function getApiBaseUrl(): string {
  const envBase = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();
  if (envBase) {
    if (
      typeof window !== "undefined" &&
      isLikelyTelegramMiniApp() &&
      isLocalhostUrl(envBase)
    ) {
      const browserBase = getBrowserBaseUrl();
      if (browserBase) return browserBase;
    }
    return normalizeBase(envBase);
  }

  const expoDev = getExpoNativeDevBaseUrl();
  if (expoDev) {
    return normalizeBase(expoDev);
  }

  const browserBase = getBrowserBaseUrl();
  if (browserBase) {
    return browserBase;
  }

  return getNodeBaseUrl();
}

export function buildApiUrl(path: string): string {
  const base = getApiBaseUrl();
  if (!base) {
    return path;
  }
  return `${base}${path}`;
}
