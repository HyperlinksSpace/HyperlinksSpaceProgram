import { buildApiUrl } from "../../../api/_base";
import { bytesLookLikeTgs, bytesLookLikeVideo } from "./loadTgsAnimation";
import { telegramEmojiDebug } from "./telegramEmojiDebug";

export type TelegramEmojiFetchRef =
  | { kind: "custom"; customEmojiId: string }
  | { kind: "animated"; emoji: string };

export type TelegramEmojiAsset = {
  bytes: Uint8Array;
  mime: string;
};

const bytesCache = new Map<string, TelegramEmojiAsset>();
const unavailableCache = new Set<string>();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cacheKey(ref: TelegramEmojiFetchRef): string {
  return ref.kind === "custom" ? `custom:${ref.customEmojiId}` : `animated:${ref.emoji}`;
}

function resolveMime(mime: string, bytes: Uint8Array): string {
  if (mime && mime !== "application/octet-stream") return mime;
  if (bytesLookLikeTgs(bytes)) return "application/x-tgsticker";
  if (bytesLookLikeVideo(bytes)) return "video/webm";
  if (bytes.length >= 12) {
    const riff = String.fromCharCode(bytes[0]!, bytes[1]!, bytes[2]!, bytes[3]!);
    if (riff === "RIFF") return "image/webp";
  }
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50) return "image/png";
  return mime || "application/octet-stream";
}

export async function fetchTelegramEmojiAsset(
  ref: TelegramEmojiFetchRef,
): Promise<TelegramEmojiAsset | null> {
  const key = cacheKey(ref);
  if (unavailableCache.has(key)) {
    telegramEmojiDebug.fetchUnavailableCached(ref);
    return null;
  }
  const cached = bytesCache.get(key);
  if (cached) {
    telegramEmojiDebug.fetchCacheHit(ref, cached.mime, cached.bytes.length);
    return cached;
  }

  const params = new URLSearchParams();
  if (ref.kind === "custom") {
    params.set("custom_emoji_id", ref.customEmojiId);
  } else {
    params.set("emoji", ref.emoji);
  }

  const url = buildApiUrl(`/api/telegram-messages-custom-emoji?${params.toString()}`);
  telegramEmojiDebug.fetchStart(ref, url);
  try {
    let response = await fetch(url, { credentials: "include" });
    if (response.status === 403 || response.status === 503 || response.status === 404) {
      await sleep(response.status === 404 ? 1200 : 600);
      response = await fetch(url, { credentials: "include" });
    }
    const contentType = response.headers.get("Content-Type");
  if (!response.ok) {
    telegramEmojiDebug.fetchHttpResult(ref, response.status, contentType, 0);
    if (response.status !== 404) {
      unavailableCache.add(key);
    }
    return null;
  }

    const bytes = new Uint8Array(await response.arrayBuffer());
    telegramEmojiDebug.fetchHttpResult(ref, response.status, contentType, bytes.length);
    if (bytes.length === 0) {
      telegramEmojiDebug.fetchEmptyBody(ref);
      unavailableCache.add(key);
      return null;
    }
    const mime = resolveMime(contentType || "", bytes);
    const asset = { bytes, mime };
    bytesCache.set(key, asset);
    return asset;
  } catch (err) {
    telegramEmojiDebug.fetchNetworkError(ref, err);
    unavailableCache.add(key);
    return null;
  }
}

/** @deprecated Use {@link fetchTelegramEmojiAsset}. */
export async function fetchCustomEmojiBytes(customEmojiId: string): Promise<Uint8Array | null> {
  const asset = await fetchTelegramEmojiAsset({ kind: "custom", customEmojiId });
  return asset?.bytes ?? null;
}
