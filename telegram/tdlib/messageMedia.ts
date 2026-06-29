import fs from "fs";
import type { Client } from "tdl";
import type { TdMessage } from "./chatPreview.js";

type TdFile = {
  id?: number;
  local?: {
    path?: string;
    is_downloading_completed?: boolean;
    is_downloading_active?: boolean;
  };
};

const MEDIA_DOWNLOAD_TIMEOUT_MS = 45_000;
const MEDIA_VIDEO_DOWNLOAD_TIMEOUT_MS = 60_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function mediaDownloadTimeoutMs(contentType: string | undefined): number {
  if (contentType === "messageVideo" || contentType === "messageAnimation") {
    return MEDIA_VIDEO_DOWNLOAD_TIMEOUT_MS;
  }
  if (contentType === "messagePhoto") return MEDIA_DOWNLOAD_TIMEOUT_MS;
  return 30_000;
}

function mimeFromPath(filePath: string): string {
  const lower = filePath.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".mp4")) return "video/mp4";
  if (lower.endsWith(".webm")) return "video/webm";
  if (lower.endsWith(".tgs")) return "application/x-tgsticker";
  return "image/jpeg";
}

async function waitForLocalFile(
  client: Client,
  fileId: number,
  timeoutMs = MEDIA_DOWNLOAD_TIMEOUT_MS,
  forceSync = false,
): Promise<TdFile | null> {
  const deadline = Date.now() + timeoutMs;
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
      /* keep polling until deadline */
    }
    await sleep(200);
  }
  return null;
}

type PhotoSizeRow = {
  _?: string;
  type?: string;
  photo?: { id?: number };
  width?: number;
  height?: number;
  sizes?: PhotoSizeRow[];
};

function photoSizeArea(row: PhotoSizeRow): number {
  const w = Number(row.width);
  const h = Number(row.height);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return 0;
  return w * h;
}

function photoSizeFileId(row: PhotoSizeRow): number | null {
  const id = row.photo?.id;
  return typeof id === "number" ? id : null;
}

function collectPhotoSizeRows(raw: unknown): PhotoSizeRow[] {
  if (!raw || typeof raw !== "object") return [];
  const row = raw as Record<string, unknown> & PhotoSizeRow;
  if (row._ === "photoSizeProgressive" && Array.isArray(row.sizes)) {
    return row.sizes.flatMap((inner) => collectPhotoSizeRows(inner));
  }
  if (photoSizeFileId(row) != null) return [row];
  return [];
}

function photoFileIdsBySizeDesc(content: Record<string, unknown>): number[] {
  const photo = content.photo as { sizes?: unknown[] } | undefined;
  const sizes = photo?.sizes;
  if (!Array.isArray(sizes) || sizes.length === 0) return [];
  const deduped = new Map<number, number>();
  for (const raw of sizes) {
    for (const row of collectPhotoSizeRows(raw)) {
      const id = photoSizeFileId(row);
      const area = photoSizeArea(row);
      if (id == null || area <= 0) continue;
      const prev = deduped.get(id);
      if (prev == null || area > prev) deduped.set(id, area);
    }
  }
  return [...deduped.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => id);
}

function pickThumbnailFileId(media: unknown): number | null {
  if (!media || typeof media !== "object") return null;
  const thumb = (media as { thumbnail?: { file?: { id?: number } } }).thumbnail;
  const id = thumb?.file?.id;
  return typeof id === "number" ? id : null;
}

function pickPhotoFileId(content: Record<string, unknown>): number | null {
  const ids = photoFileIdsBySizeDesc(content);
  return ids[0] ?? null;
}

function pickFileIdFromTdFile(file: unknown): number | null {
  if (!file || typeof file !== "object") return null;
  const id = (file as { id?: number }).id;
  return typeof id === "number" ? id : null;
}

function pickNestedFileId(media: unknown): number | null {
  if (!media || typeof media !== "object") return null;
  const row = media as Record<string, unknown>;
  const direct = pickFileIdFromTdFile(row);
  if (direct != null) return direct;
  for (const key of ["video", "animation", "sticker", "document", "photo"]) {
    const nested = row[key];
    const id = pickFileIdFromTdFile(nested);
    if (id != null) return id;
  }
  return null;
}

function mimeFromMessageContent(content: Record<string, unknown>): string | null {
  const type = content._;
  if (type === "messageVideo") {
    const mime = (content.video as { mime_type?: string } | undefined)?.mime_type;
    return typeof mime === "string" && mime.trim() ? mime.trim() : null;
  }
  if (type === "messageAnimation") {
    const mime = (content.animation as { mime_type?: string } | undefined)?.mime_type;
    return typeof mime === "string" && mime.trim() ? mime.trim() : null;
  }
  if (type === "messageSticker") {
    const mime = (content.sticker as { mime_type?: string } | undefined)?.mime_type;
    return typeof mime === "string" && mime.trim() ? mime.trim() : null;
  }
  return null;
}

function readMinithumbnailJpeg(content: Record<string, unknown>): Buffer | null {
  const photo = content.photo as { minithumbnail?: { data?: string } } | undefined;
  const data = photo?.minithumbnail?.data;
  if (typeof data !== "string" || data.length === 0) return null;
  try {
    return Buffer.from(data, "base64");
  } catch {
    return null;
  }
}

function mediaFileIdFromMessage(message: TdMessage): number | null {
  const content = message.content;
  if (!content || typeof content !== "object") return null;
  const row = content as Record<string, unknown>;
  const type = row._;
  if (type === "messagePhoto") return pickPhotoFileId(row);
  if (type === "messageVideo") {
    const video = row.video as { video?: { id?: number }; thumbnail?: unknown } | undefined;
    return pickNestedFileId(video);
  }
  if (type === "messageAnimation") {
    const animation = row.animation as { animation?: { id?: number }; thumbnail?: unknown } | undefined;
    return pickNestedFileId(animation);
  }
  if (type === "messageSticker") {
    const sticker = row.sticker as { sticker?: { id?: number }; thumbnail?: unknown } | undefined;
    return pickNestedFileId(sticker);
  }
  return null;
}

async function readLocalFileBytes(
  client: Client,
  fileId: number,
  timeoutMs = MEDIA_DOWNLOAD_TIMEOUT_MS,
): Promise<{ data: Buffer; path: string } | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const file = await waitForLocalFile(client, fileId, timeoutMs, attempt > 0);
    const path = file?.local?.path;
    if (!path || !fs.existsSync(path)) continue;
    try {
      const data = fs.readFileSync(path);
      if (data.length === 0) continue;
      return { data, path };
    } catch {
      /* try again */
    }
  }
  return null;
}

function resolveMediaMime(
  content: Record<string, unknown>,
  path: string,
  preferVideoMime: boolean,
): string {
  const contentMime = mimeFromMessageContent(content);
  const pathMime = mimeFromPath(path);
  let mime = contentMime ?? pathMime;
  const contentType = (content as { _?: string })._;
  if (
    preferVideoMime &&
    !contentMime &&
    (contentType === "messageVideo" || contentType === "messageAnimation") &&
    pathMime === "image/jpeg"
  ) {
    mime = "video/mp4";
  }
  return mime;
}

function mediaFileIdsFromMessage(message: TdMessage): number[] {
  const content = message.content;
  if (!content || typeof content !== "object") return [];
  const row = content as Record<string, unknown>;
  const type = row._;
  if (type === "messagePhoto") return photoFileIdsBySizeDesc(row);
  const primary = mediaFileIdFromMessage(message);
  return primary != null ? [primary] : [];
}

function mediaThumbnailFileIdFromMessage(message: TdMessage): number | null {
  const content = message.content;
  if (!content || typeof content !== "object") return null;
  const row = content as Record<string, unknown>;
  const type = row._;
  if (type === "messageVideo") return pickThumbnailFileId(row.video);
  if (type === "messageAnimation") return pickThumbnailFileId(row.animation);
  if (type === "messageSticker") return pickThumbnailFileId(row.sticker);
  return null;
}

export type MessageMediaFetchMode = "full" | "preview";

async function readMessageMediaPreviewBytes(
  client: Client,
  message: TdMessage,
  contentRow: Record<string, unknown>,
  contentType: string | undefined,
): Promise<{ data: Buffer; mime: string } | null> {
  const preferVideoMime =
    contentType === "messageVideo" || contentType === "messageAnimation";

  if (preferVideoMime) {
    const thumbnailId = mediaThumbnailFileIdFromMessage(message);
    if (thumbnailId != null) {
      const local = await readLocalFileBytes(client, thumbnailId, 15_000);
      if (local) {
        return { data: local.data, mime: mimeFromPath(local.path) };
      }
    }
    return null;
  }

  if (contentType === "messagePhoto") {
    const mini = readMinithumbnailJpeg(contentRow);
    if (mini && mini.length > 0) return { data: mini, mime: "image/jpeg" };
    const photoIds = photoFileIdsBySizeDesc(contentRow);
    const smallestId = photoIds[photoIds.length - 1];
    if (smallestId != null) {
      const local = await readLocalFileBytes(client, smallestId, 15_000);
      if (local) {
        return { data: local.data, mime: mimeFromPath(local.path) };
      }
    }
  }

  const thumbnailId = mediaThumbnailFileIdFromMessage(message);
  if (thumbnailId != null) {
    const local = await readLocalFileBytes(client, thumbnailId, 15_000);
    if (local) {
      return { data: local.data, mime: mimeFromPath(local.path) };
    }
  }

  return null;
}

export async function readMessageMediaBytes(
  client: Client,
  chatId: number,
  messageId: number,
  mode: MessageMediaFetchMode = "full",
): Promise<{ data: Buffer; mime: string } | null> {
  let message: TdMessage;
  try {
    message = (await client.invoke({
      _: "getMessage",
      chat_id: chatId,
      message_id: messageId,
    })) as TdMessage;
  } catch {
    return null;
  }

  const content = message.content;
  if (!content || typeof content !== "object") return null;
  const contentRow = content as Record<string, unknown>;
  const contentType = contentRow._;

  if (mode === "preview") {
    return readMessageMediaPreviewBytes(
      client,
      message,
      contentRow,
      typeof contentType === "string" ? contentType : undefined,
    );
  }

  const downloadTimeoutMs = mediaDownloadTimeoutMs(
    typeof contentType === "string" ? contentType : undefined,
  );
  const preferVideoMime =
    contentType === "messageVideo" || contentType === "messageAnimation";

  for (const fileId of mediaFileIdsFromMessage(message)) {
    const local = await readLocalFileBytes(client, fileId, downloadTimeoutMs);
    if (!local) continue;
    const mime = resolveMediaMime(contentRow, local.path, preferVideoMime);
    if (preferVideoMime && mime.startsWith("image/")) continue;
    return { data: local.data, mime };
  }

  const thumbnailId = mediaThumbnailFileIdFromMessage(message);
  if (thumbnailId != null && !preferVideoMime) {
    const local = await readLocalFileBytes(client, thumbnailId, downloadTimeoutMs);
    if (local) {
      return { data: local.data, mime: mimeFromPath(local.path) };
    }
  }

  if (contentType === "messagePhoto") {
    const mini = readMinithumbnailJpeg(contentRow);
    if (mini && mini.length > 0) return { data: mini, mime: "image/jpeg" };
  }

  if (preferVideoMime) {
    const videoThumbId = mediaThumbnailFileIdFromMessage(message);
    if (videoThumbId != null) {
      const local = await readLocalFileBytes(client, videoThumbId, 15_000);
      if (local) {
        return { data: local.data, mime: mimeFromPath(local.path) };
      }
    }
  }

  return null;
}
