import { buildApiUrl } from "../../../api/_base";
import { bytesLookLikeTgs, bytesLookLikeVideo } from "./loadTgsAnimation";

export type TelegramEmojiFetchRef =
  | { kind: "custom"; customEmojiId: string }
  | { kind: "animated"; emoji: string };

export type TelegramEmojiAsset = {
  bytes: Uint8Array;
  mime: string;
};

const bytesCache = new Map<string, TelegramEmojiAsset>();

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
  const cached = bytesCache.get(key);
  if (cached) return cached;

  const params = new URLSearchParams();
  if (ref.kind === "custom") {
    params.set("custom_emoji_id", ref.customEmojiId);
  } else {
    params.set("emoji", ref.emoji);
  }

  const url = buildApiUrl(`/api/telegram-messages-custom-emoji?${params.toString()}`);
  let response = await fetch(url, { credentials: "include" });
  if (response.status === 403 || response.status === 503) {
    await sleep(1200);
    response = await fetch(url, { credentials: "include" });
  }
  if (!response.ok && ref.kind === "custom") {
    await sleep(800);
    response = await fetch(url, { credentials: "include" });
  }
  if (!response.ok) return null;

  const bytes = new Uint8Array(await response.arrayBuffer());
  const mime = resolveMime(response.headers.get("Content-Type") || "", bytes);
  const asset = { bytes, mime };
  bytesCache.set(key, asset);
  return asset;
}

/** @deprecated Use {@link fetchTelegramEmojiAsset}. */
export async function fetchCustomEmojiBytes(customEmojiId: string): Promise<Uint8Array | null> {
  const asset = await fetchTelegramEmojiAsset({ kind: "custom", customEmojiId });
  return asset?.bytes ?? null;
}
