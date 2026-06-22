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

const MEDIA_DOWNLOAD_TIMEOUT_MS = 30_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function mimeFromPath(filePath: string): string {
  const lower = filePath.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".mp4")) return "video/mp4";
  if (lower.endsWith(".webm")) return "video/webm";
  return "image/jpeg";
}

async function waitForLocalFile(client: Client, fileId: number): Promise<TdFile | null> {
  const deadline = Date.now() + MEDIA_DOWNLOAD_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      const file = (await client.invoke({ _: "getFile", file_id: fileId })) as TdFile;
      if (file.local?.is_downloading_completed && file.local.path) return file;
      if (file.local?.is_downloading_active === false && !file.local?.is_downloading_completed) {
        await client.invoke({
          _: "downloadFile",
          file_id: fileId,
          priority: 32,
          offset: 0,
          limit: 0,
          synchronous: true,
        });
        const retry = (await client.invoke({ _: "getFile", file_id: fileId })) as TdFile;
        if (retry.local?.is_downloading_completed && retry.local.path) return retry;
        return null;
      }
      if (!file.local?.is_downloading_active) {
        await client.invoke({
          _: "downloadFile",
          file_id: fileId,
          priority: 32,
          offset: 0,
          limit: 0,
          synchronous: false,
        });
      }
    } catch {
      return null;
    }
    await sleep(200);
  }
  return null;
}

type PhotoSizeRow = {
  type?: string;
  photo?: { id?: number };
  width?: number;
  height?: number;
};

function pickLargestPhotoFileId(sizes: PhotoSizeRow[]): number | null {
  let bestId: number | null = null;
  let bestArea = 0;
  for (const row of sizes) {
    const id = row.photo?.id;
    const w = Number(row.width);
    const h = Number(row.height);
    if (typeof id !== "number" || !Number.isFinite(w) || !Number.isFinite(h)) continue;
    const area = w * h;
    if (area > bestArea) {
      bestArea = area;
      bestId = id;
    }
  }
  return bestId;
}

function pickPhotoFileId(content: Record<string, unknown>): number | null {
  const photo = content.photo as { sizes?: PhotoSizeRow[] } | undefined;
  const sizes = photo?.sizes;
  if (!Array.isArray(sizes) || sizes.length === 0) return null;

  const preferred = ["w", "x", "y", "m", "s"];
  for (const key of preferred) {
    const match = sizes.find((row) => row.type === key);
    const id = match?.photo?.id;
    if (typeof id === "number") return id;
  }
  return pickLargestPhotoFileId(sizes);
}

function pickThumbnailFileId(thumbnail: unknown): number | null {
  if (!thumbnail || typeof thumbnail !== "object") return null;
  const row = thumbnail as { file?: { id?: number } };
  const id = row.file?.id;
  return typeof id === "number" ? id : null;
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
    const video = row.video as { thumbnail?: unknown } | undefined;
    return pickThumbnailFileId(video?.thumbnail);
  }
  if (type === "messageAnimation") {
    const animation = row.animation as { thumbnail?: unknown } | undefined;
    return pickThumbnailFileId(animation?.thumbnail);
  }
  return null;
}

export async function readMessageMediaBytes(
  client: Client,
  chatId: number,
  messageId: number,
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
  if (content && typeof content === "object" && content._ === "messagePhoto") {
    const mini = readMinithumbnailJpeg(content as Record<string, unknown>);
    if (mini && mini.length > 0) {
      return { data: mini, mime: "image/jpeg" };
    }
  }

  const fileId = mediaFileIdFromMessage(message);
  if (fileId == null) return null;

  const file = await waitForLocalFile(client, fileId);
  const path = file?.local?.path;
  if (!path || !fs.existsSync(path)) {
    if (content && typeof content === "object") {
      const mini = readMinithumbnailJpeg(content as Record<string, unknown>);
      if (mini && mini.length > 0) return { data: mini, mime: "image/jpeg" };
    }
    return null;
  }

  try {
    const data = fs.readFileSync(path);
    if (data.length === 0) return null;
    return { data, mime: mimeFromPath(path) };
  } catch {
    return null;
  }
}
