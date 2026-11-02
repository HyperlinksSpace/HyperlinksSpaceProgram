import { getApiBaseUrl } from "../../api/_base";
import { getDesktopSessionToken } from "../../auth/desktopSessionToken";
import { getDesktopOAuthBridge, isDesktopAppShell } from "../appShell";
import { logPageDisplay } from "../pageDisplayLog";

const AUTH_AUDIO_PATH_MARKERS = [
  "/api/telegram-messages-profile-audio",
  "/api/telegram-messages-media",
] as const;

function isAuthenticatedMusicApiUrl(src: string): boolean {
  return AUTH_AUDIO_PATH_MARKERS.some((marker) => src.includes(marker));
}

/** Electron `app://` (and other non-http shells) must not rely on `<audio src=api>` + CORS cookies. */
export function musicPlaybackNeedsAuthenticatedFetch(src: string): boolean {
  if (typeof window === "undefined" || !isAuthenticatedMusicApiUrl(src)) return false;
  try {
    const page = new URL(window.location.href);
    if (page.protocol !== "http:" && page.protocol !== "https:") {
      return true;
    }
    const apiOrigin = new URL(getApiBaseUrl()).origin;
    const mediaOrigin = new URL(src, window.location.href).origin;
    return mediaOrigin !== page.origin || page.origin !== apiOrigin;
  } catch {
    return true;
  }
}

/**
 * Prefer `<audio src="https://…/api/…">` so the browser buffers and plays while downloading.
 * Electron attaches session auth via webRequest; full blob prefetch is fallback when streaming fails.
 */
export function musicPlaybackUseStreamingElementSrc(src: string): boolean {
  return isAuthenticatedMusicApiUrl(src);
}

type CachedPlayback = {
  objectUrl: string;
  mime: string;
};

const playbackCache = new Map<string, CachedPlayback>();
const inflight = new Map<string, Promise<CachedPlayback>>();

export function revokeMusicPlaybackObjectUrl(objectUrl: string | null | undefined): void {
  if (!objectUrl || !objectUrl.startsWith("blob:")) return;
  for (const [key, entry] of playbackCache.entries()) {
    if (entry.objectUrl === objectUrl) {
      playbackCache.delete(key);
      break;
    }
  }
  try {
    URL.revokeObjectURL(objectUrl);
  } catch {
    // ignore
  }
}

function decodeBase64ToArrayBuffer(b64: string): ArrayBuffer {
  if (typeof Buffer !== "undefined") {
    const buf = Buffer.from(b64, "base64");
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  }
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

function assertLikelyAudioBody(bytes: Uint8Array): void {
  if (bytes.byteLength < 16) {
    throw new Error("AUDIO_TOO_SMALL");
  }
  const head = String.fromCharCode(...bytes.slice(0, Math.min(12, bytes.length)));
  const trimmed = head.trimStart();
  if (trimmed.startsWith("{") || trimmed.startsWith("<!") || trimmed.startsWith("<html")) {
    throw new Error("NOT_AUDIO_BODY");
  }
}

function normalizeAudioMime(raw: string | null | undefined): string {
  const mime =
    (raw || "audio/mpeg").split(";")[0]?.trim().toLowerCase() || "audio/mpeg";
  if (mime.startsWith("audio/") || mime === "application/octet-stream") return mime;
  return "audio/mpeg";
}

async function fetchMusicAudioBytes(apiUrl: string): Promise<{ buffer: ArrayBuffer; mime: string }> {
  const bridge = getDesktopOAuthBridge();
  if (isDesktopAppShell() && bridge?.fetchProgramApi) {
    const token = getDesktopSessionToken();
    const result = await bridge.fetchProgramApi(apiUrl, {
      method: "GET",
      bearerToken: token ?? undefined,
      responseType: "arrayBuffer",
      timeoutMs: 120_000,
    });
    if (!result.ok) {
      throw new Error(result.error || "program_api_fetch_failed");
    }
    if (result.status < 200 || result.status >= 300) {
      throw new Error(`HTTP_${result.status}`);
    }
    const b64 = "bodyBase64" in result ? result.bodyBase64 : null;
    if (!b64) {
      throw new Error("MISSING_BINARY_BODY");
    }
    const buffer = decodeBase64ToArrayBuffer(b64);
    const bytes = new Uint8Array(buffer);
    assertLikelyAudioBody(bytes);
    const mime = normalizeAudioMime(
      "contentType" in result ? result.contentType : null,
    );
    logPageDisplay("music_playback_fetch_ok", {
      transport: "ipc_program_api",
      bytes: bytes.byteLength,
      mime,
      status: result.status,
    });
    return { buffer, mime };
  }

  const response = await fetch(apiUrl, {
    method: "GET",
    credentials: "include",
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`HTTP_${response.status}`);
  }
  const contentType = response.headers.get("Content-Type");
  if (contentType?.includes("application/json")) {
    throw new Error("NOT_AUDIO_JSON");
  }
  const buffer = await response.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  assertLikelyAudioBody(bytes);
  const mime = normalizeAudioMime(contentType);
  logPageDisplay("music_playback_fetch_ok", {
    transport: "renderer_fetch",
    bytes: bytes.byteLength,
    mime,
    status: response.status,
  });
  return { buffer, mime };
}

/**
 * Full-file download → blob URL (recovery / legacy). Normal playback uses streaming element src.
 */
export async function resolveMusicPlaybackObjectUrl(
  apiUrl: string,
  cacheKey?: string,
): Promise<string> {
  const cacheId = cacheKey ? `${cacheKey}|${apiUrl}` : apiUrl;
  const hit = playbackCache.get(cacheId);
  if (hit) return hit.objectUrl;

  const pending = inflight.get(cacheId);
  if (pending) return (await pending).objectUrl;

  const promise = (async (): Promise<CachedPlayback> => {
    const { buffer, mime } = await fetchMusicAudioBytes(apiUrl);
    const blob = new Blob([buffer], { type: mime });
    const objectUrl = URL.createObjectURL(blob);
    const entry: CachedPlayback = { objectUrl, mime };
    playbackCache.set(cacheId, entry);
    return entry;
  })();

  inflight.set(cacheId, promise);
  try {
    const entry = await promise;
    return entry.objectUrl;
  } finally {
    inflight.delete(cacheId);
  }
}
