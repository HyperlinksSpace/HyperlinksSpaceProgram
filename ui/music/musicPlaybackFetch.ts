import { getApiBaseUrl } from "../../api/_base";

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

/**
 * Fetch profile/chat audio with session cookies and return a blob URL for `<audio>`.
 * Cached by API URL so replays and seek retries do not re-download.
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
    const response = await fetch(apiUrl, {
      method: "GET",
      credentials: "include",
      cache: "no-store",
    });
    if (!response.ok) {
      throw new Error(`HTTP_${response.status}`);
    }
    const blob = await response.blob();
    const mime =
      (blob.type || response.headers.get("Content-Type") || "audio/mpeg").split(";")[0]?.trim() ||
      "audio/mpeg";
    const typed =
      blob.type && blob.type.length > 0 ? blob : new Blob([await blob.arrayBuffer()], { type: mime });
    const objectUrl = URL.createObjectURL(typed);
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
