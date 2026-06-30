import fs from "fs";
import type { Client } from "tdl";
import { logGateway } from "./gatewayLog.js";

type TdFile = {
  local?: {
    path?: string;
    is_downloading_completed?: boolean;
    is_downloading_active?: boolean;
  };
};

/** TDLib `file` object, or `sticker` object (bytes on nested `sticker` file field). */
function pickTdlibFileId(value: unknown): number | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;

  // Sticker objects expose a top-level `id` (sticker row) and nested `sticker.id` (file to download).
  const nested = row.sticker;
  if (nested && typeof nested === "object") {
    const nestedId = Number((nested as { id?: number }).id);
    if (Number.isFinite(nestedId) && nestedId > 0) return nestedId;
  }

  const direct = Number(row.id);
  if (Number.isFinite(direct) && direct > 0) return direct;

  const thumbnail = row.thumbnail;
  if (thumbnail && typeof thumbnail === "object") {
    const file = (thumbnail as { file?: unknown }).file;
    if (file && typeof file === "object") {
      const fileId = Number((file as { id?: number }).id);
      if (Number.isFinite(fileId) && fileId > 0) return fileId;
    }
  }
  return null;
}

function normalizeAnimatedEmojiInput(emoji: string): string[] {
  const trimmed = emoji.trim();
  if (!trimmed) return [];
  const variants = new Set<string>([trimmed]);
  const withoutFe0f = trimmed.replace(/\uFE0F/g, "");
  if (withoutFe0f && withoutFe0f !== trimmed) variants.add(withoutFe0f);
  if (!trimmed.includes("\uFE0F")) variants.add(`${trimmed}\uFE0F`);
  return [...variants];
}

const EMOJI_DOWNLOAD_TIMEOUT_MS = 20_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function mimeFromPath(filePath: string): string {
  const lower = filePath.toLowerCase();
  if (lower.endsWith(".tgs")) return "application/x-tgsticker";
  if (lower.endsWith(".webm")) return "video/webm";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".gif")) return "image/gif";
  return "application/octet-stream";
}

async function waitForLocalFile(
  client: Client,
  fileId: number,
  forceSync = false,
): Promise<TdFile | null> {
  const deadline = Date.now() + EMOJI_DOWNLOAD_TIMEOUT_MS;
  let syncAttempted = forceSync;

  while (Date.now() < deadline) {
    try {
      const file = (await client.invoke({ _: "getFile", file_id: fileId })) as TdFile;
      if (file.local?.is_downloading_completed && file.local.path) return file;

      if (!file.local?.is_downloading_active) {
        await client.invoke({
          _: "downloadFile",
          file_id: fileId,
          priority: 32,
          offset: 0,
          limit: 0,
          synchronous: !syncAttempted,
        });
        syncAttempted = true;
        const refreshed = (await client.invoke({ _: "getFile", file_id: fileId })) as TdFile;
        if (refreshed.local?.is_downloading_completed && refreshed.local.path) return refreshed;
      }
    } catch {
      /* keep polling */
    }
    await sleep(150);
  }
  return null;
}

async function readDownloadedFile(
  client: Client,
  fileId: number,
  logContext: Record<string, unknown>,
): Promise<{ data: Buffer; mime: string } | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const file = await waitForLocalFile(client, fileId, attempt > 0);
    const path = file?.local?.path;
    if (!path || !fs.existsSync(path)) continue;
    try {
      const data = fs.readFileSync(path);
      if (data.length === 0) continue;
      const resolved = { data, mime: mimeFromPath(path) };
      logGateway("telegram_emoji_ok", {
        ...logContext,
        fileId,
        bytes: data.length,
        mime: resolved.mime,
        pathExt: path.split(".").pop() ?? null,
        attempt,
      });
      return resolved;
    } catch {
      /* retry once with forced sync download */
    }
  }

  logGateway("telegram_emoji_file_missing", { ...logContext, fileId });
  return null;
}

const bytesCache = new Map<string, { data: Buffer; mime: string }>();

function cacheKey(kind: "custom" | "animated", id: string): string {
  return `${kind}:${id}`;
}

export async function readCustomEmojiBytes(
  client: Client,
  customEmojiId: string,
): Promise<{ data: Buffer; mime: string } | null> {
  const id = customEmojiId.trim();
  if (!id) return null;

  const key = cacheKey("custom", id);
  const cached = bytesCache.get(key);
  if (cached) return cached;

  try {
    const result = (await client.invoke({
      _: "getCustomEmojiStickers",
      custom_emoji_ids: [id],
    })) as { stickers?: unknown[] };

    const fileId = pickTdlibFileId(result.stickers?.[0]);
    if (fileId == null) {
      logGateway("custom_emoji_sticker_missing", {
        customEmojiId: id,
        stickerKeys:
          result.stickers?.[0] && typeof result.stickers[0] === "object"
            ? Object.keys(result.stickers[0] as object)
            : null,
      });
      return null;
    }

    const resolved = await readDownloadedFile(client, fileId, { customEmojiId: id, source: "custom" });
    if (resolved) bytesCache.set(key, resolved);
    return resolved;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logGateway("custom_emoji_error", { customEmojiId: id, message });
    return null;
  }
}

export async function readAnimatedEmojiBytes(
  client: Client,
  emoji: string,
): Promise<{ data: Buffer; mime: string } | null> {
  const candidates = normalizeAnimatedEmojiInput(emoji);
  if (candidates.length === 0) return null;

  for (const value of candidates) {
    const key = cacheKey("animated", value);
    const cached = bytesCache.get(key);
    if (cached) return cached;

    try {
      const result = (await client.invoke({
        _: "getAnimatedEmoji",
        emoji: value,
      })) as { sticker?: unknown };

      const fileId = pickTdlibFileId(result.sticker);
      if (fileId == null) {
        logGateway("animated_emoji_sticker_missing", {
          emoji: value,
          stickerKeys:
            result.sticker && typeof result.sticker === "object"
              ? Object.keys(result.sticker as object)
              : null,
        });
        continue;
      }

      const resolved = await readDownloadedFile(client, fileId, { emoji: value, source: "animated" });
      if (resolved) {
        bytesCache.set(key, resolved);
        return resolved;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logGateway("animated_emoji_error", { emoji: value, message });
    }
  }

  return null;
}

export async function readTelegramEmojiBytes(
  client: Client,
  options: { customEmojiId?: string; emoji?: string },
): Promise<{ data: Buffer; mime: string } | null> {
  const customEmojiId = options.customEmojiId?.trim();
  if (customEmojiId) return readCustomEmojiBytes(client, customEmojiId);
  const emoji = options.emoji?.trim();
  if (emoji) return readAnimatedEmojiBytes(client, emoji);
  return null;
}
