import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Image } from "expo-image";
import type { ImageStyle, StyleProp } from "react-native";
import { Platform, StyleSheet } from "react-native";
import { cacheableDisplayUrlFromBlob, revokeDisplayUrlIfObjectUrl } from "../../media/binaryDisplayUrl";
import { isDesktopAppShell } from "../../appShell";
import { runQueuedNetworkFetch, type NetworkFetchPriority } from "./networkFetchQueue";
import { isVoiceDialogUiOpen, subscribeVoiceDialogUiOpen } from "./voiceDialogUiGate";

function needsAuthenticatedFetch(uri: string): boolean {
  return uri.includes("/api/telegram-messages-avatar");
}

/** Reuse blob URLs so avatar proxy images do not refetch on every list re-render. */
const avatarBlobCache = new Map<string, string>();
const avatarFailedUrls = new Set<string>();
/** Wall-clock of sticky 404/403 — expire so voice roster can recover after a cold miss. */
const avatarFailedAtMs = new Map<string, number>();
const AVATAR_FAIL_TTL_MS = 45_000;
const inflightAvatarFetches = new Map<string, Promise<string | null>>();
const avatarCacheListeners = new Set<() => void>();
let avatarCacheRevision = 0;

function notifyAvatarCacheListeners(): void {
  avatarCacheRevision += 1;
  for (const listener of avatarCacheListeners) {
    listener();
  }
}

function subscribeAvatarCache(listener: () => void): () => void {
  avatarCacheListeners.add(listener);
  return () => {
    avatarCacheListeners.delete(listener);
  };
}

function getAvatarCacheRevision(): number {
  return avatarCacheRevision;
}

function avatarProxyQueryIds(uri: string): { userId: string | null; chatId: string | null } | null {
  if (!needsAuthenticatedFetch(uri)) return null;
  const qIndex = uri.indexOf("?");
  if (qIndex < 0) return { userId: null, chatId: null };
  const params = new URLSearchParams(uri.slice(qIndex + 1));
  return {
    userId: params.get("user_id"),
    chatId: params.get("chat_id"),
  };
}

function purgeAvatarCacheEntries(match: (uri: string, ids: { userId: string | null; chatId: string | null }) => boolean): void {
  let changed = false;
  for (const key of [...avatarBlobCache.keys()]) {
    const ids = avatarProxyQueryIds(key);
    if (!ids || !match(key, ids)) continue;
    const blob = avatarBlobCache.get(key);
    if (blob) revokeDisplayUrlIfObjectUrl(blob);
    avatarBlobCache.delete(key);
    changed = true;
  }
  for (const key of [...avatarFailedUrls]) {
    const ids = avatarProxyQueryIds(key);
    if (!ids || !match(key, ids)) continue;
    avatarFailedUrls.delete(key);
    avatarFailedAtMs.delete(key);
    changed = true;
  }
  if (changed) notifyAvatarCacheListeners();
}

export function invalidateMessageChatAvatarCacheForUser(userId: number): void {
  if (!Number.isFinite(userId) || userId === 0) return;
  const id = String(Math.trunc(userId));
  purgeAvatarCacheEntries((_uri, ids) => ids.userId === id);
}

export function invalidateMessageChatAvatarCacheForChat(chatId: number): void {
  if (!Number.isFinite(chatId) || chatId === 0) return;
  const id = String(Math.trunc(chatId));
  purgeAvatarCacheEntries((_uri, ids) => ids.chatId === id);
}

function readCachedDisplayUri(uri: string): string | null {
  if (!needsAuthenticatedFetch(uri)) return uri;
  const cached = avatarBlobCache.get(uri);
  if (cached && isDesktopAppShell() && cached.startsWith("blob:")) {
    revokeDisplayUrlIfObjectUrl(cached);
    avatarBlobCache.delete(uri);
    return null;
  }
  return cached ?? null;
}

export function isMessageChatAvatarBlobCached(uri: string): boolean {
  return readCachedDisplayUri(uri) != null;
}

export function isMessageChatAvatarFetchFailed(uri: string): boolean {
  if (!avatarFailedUrls.has(uri)) return false;
  const at = avatarFailedAtMs.get(uri) ?? 0;
  if (Date.now() - at > AVATAR_FAIL_TTL_MS) {
    avatarFailedUrls.delete(uri);
    avatarFailedAtMs.delete(uri);
    return false;
  }
  return true;
}

async function fetchAvatarBlobOnce(uri: string): Promise<string | null> {
  if (!needsAuthenticatedFetch(uri)) return uri;
  if (avatarFailedUrls.has(uri)) return null;
  const cached = avatarBlobCache.get(uri);
  if (cached) return cached;

  // Bypass HTTP cache: authenticated 404s were previously Cache-Control:max-age=86400
  // and stuck voice-roster avatars on initials even after TDLib hydrated the photo.
  const response = await fetch(uri, {
    method: "GET",
    credentials: "include",
    cache: "no-store",
  });
  if (!response.ok) {
    if (response.status === 404 || response.status === 403) {
      // Record the miss but do NOT notify every avatar subscriber — a burst of
      // 404s used to bump cacheRevision and re-run effects for every mounted
      // avatar on the page (chat list + history + voice dialog), freezing the UI.
      // TTL so a cold TDLib miss does not permanently leave voice rows on letters.
      avatarFailedUrls.add(uri);
      avatarFailedAtMs.set(uri, Date.now());
    }
    return null;
  }
  const raw = await response.blob();
  const mime = (response.headers.get("content-type") || "").split(";")[0].trim();
  const displayUrl = await cacheableDisplayUrlFromBlob(raw, mime || "image/jpeg");
  avatarBlobCache.set(uri, displayUrl);
  notifyAvatarCacheListeners();
  return displayUrl;
}

async function fetchAvatarBlob(uri: string): Promise<string | null> {
  if (!needsAuthenticatedFetch(uri)) return uri;
  if (avatarFailedUrls.has(uri)) return null;
  const cached = avatarBlobCache.get(uri);
  if (cached) return cached;

  const inflight = inflightAvatarFetches.get(uri);
  if (inflight) return inflight;

  const promise = fetchAvatarBlobOnce(uri).finally(() => {
    inflightAvatarFetches.delete(uri);
  });
  inflightAvatarFetches.set(uri, promise);
  return promise;
}

export function loadMessageChatAvatarObjectUrl(uri: string): Promise<string | null> {
  return fetchAvatarBlob(uri);
}

/** Populate the shared avatar blob cache (open-chat prefetch). */
export function prefetchMessageChatAvatar(
  uri: string,
  options?: { priority?: NetworkFetchPriority },
): void {
  if (!uri || isMessageChatAvatarBlobCached(uri) || isMessageChatAvatarFetchFailed(uri)) return;
  const priority = options?.priority ?? "normal";
  // Chat-list avatar storms mid-voice-dialog froze Close after the first green mic.
  if (isVoiceDialogUiOpen() && priority === "normal") return;
  void runQueuedNetworkFetch(() => fetchAvatarBlob(uri), {
    priority,
  }).catch(() => {
    /* row onError handles visible failures */
  });
}

type Props = {
  uri: string;
  sizePx: number;
  style?: StyleProp<ImageStyle>;
  /** Fill the parent slot instead of a fixed pixel box. */
  fill?: boolean;
  /** When false, skip proxy fetch until the row scrolls into view. */
  loadEnabled?: boolean;
  fetchPriority?: NetworkFetchPriority;
  onLoad?: () => void;
  onError?: (error?: unknown) => void;
  /** Default `cover`; use `contain` for decorative preset / SVG feed icons. */
  contentFit?: "cover" | "contain";
};

/** Renders chat avatars; API proxy URLs are fetched with session cookies (required on web). */
export function MessageChatAvatarImage({
  uri,
  sizePx,
  style,
  fill = false,
  loadEnabled = true,
  fetchPriority = "normal",
  onLoad,
  onError,
  contentFit = "cover",
}: Props) {
  const cacheRevision = useSyncExternalStore(
    subscribeAvatarCache,
    getAvatarCacheRevision,
    getAvatarCacheRevision,
  );
  const voiceDialogOpen = useSyncExternalStore(
    subscribeVoiceDialogUiOpen,
    isVoiceDialogUiOpen,
    () => false,
  );
  const [displayUri, setDisplayUri] = useState<string | null>(() => readCachedDisplayUri(uri));
  const onLoadRef = useRef(onLoad);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    onLoadRef.current = onLoad;
    onErrorRef.current = onError;
  }, [onLoad, onError]);

  useEffect(() => {
    const cached = readCachedDisplayUri(uri);
    // Always realign (or clear) when `uri` changes. Keeping the previous blob
    // let React-recycled voice-strip slots paint peer A's face on peer B until
    // B's fetch finished — and expo-image onLoad could flip opacity back on
    // that stale blob mid-swap.
    setDisplayUri(cached);
  }, [uri, cacheRevision]);

  useEffect(() => {
    if (!loadEnabled) return;
    if (isMessageChatAvatarFetchFailed(uri)) {
      setDisplayUri(null);
      return;
    }
    // Pause list/history avatar HTTP while the voice sheet is open. Voice roster
    // uses high/critical and stays allowed.
    if (isVoiceDialogUiOpen() && fetchPriority === "normal") return;

    const cached = readCachedDisplayUri(uri);
    if (cached) {
      setDisplayUri(cached);
      return;
    }

    let cancelled = false;

    void runQueuedNetworkFetch(async () => {
      if (cancelled) return;
      if (isVoiceDialogUiOpen() && fetchPriority === "normal") return;
      const next = await fetchAvatarBlob(uri);
      if (!cancelled) {
        if (next) setDisplayUri(next);
        else {
          setDisplayUri(null);
          onErrorRef.current?.(new Error("avatar_unavailable"));
        }
      }
    }, { priority: fetchPriority });

    return () => {
      cancelled = true;
    };
    // Intentionally omit cacheRevision — a successful sibling fetch must not
    // re-queue every other avatar's network effect (that froze the voice dialog).
    // voiceDialogOpen: resume normal fetches after the sheet closes.
  }, [uri, loadEnabled, fetchPriority, voiceDialogOpen]);

  if (!displayUri) return null;

  return (
    <Image
      source={{ uri: displayUri }}
      accessibilityIgnoresInvertColors
      onLoad={() => onLoadRef.current?.()}
      onError={(event) => onErrorRef.current?.(event.error ?? "unknown_avatar_error")}
      style={[
        fill
          ? [StyleSheet.absoluteFillObject, { borderRadius: 0 }]
          : { width: sizePx, height: sizePx, borderRadius: 0 },
        Platform.OS === "web"
          ? ({ display: "block", objectFit: contentFit } as ImageStyle)
          : null,
        style,
      ]}
      contentFit={contentFit}
    />
  );
}
