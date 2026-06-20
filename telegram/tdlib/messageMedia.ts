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

const MEDIA_DOWNLOAD_TIMEOUT_MS = 25_000;

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
        return null;
      }
      if (!file.local?.is_downloading_active) {
        await client.invoke({
          _: "downloadFile",
          file_id: fileId,
          priority: 16,
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

function pickPhotoFileId(content: Record<string, unknown>): number | null {
  const photo = content.photo as { sizes?: { photo?: { id?: number } }[] } | undefined;
  const sizes = photo?.sizes;
  if (!Array.isArray(sizes) || sizes.length === 0) return null;
  const preferred = ["w", "x", "y", "m", "s"];
  for (const key of preferred) {
    const match = sizes.find((row) => (row as { type?: string }).type === key);
    const id = match?.photo?.id;
    if (typeof id === "number") return id;
  }
  for (let i = sizes.length - 1; i >= 0; i--) {
    const id = sizes[i]?.photo?.id;
    if (typeof id === "number") return id;
  }
  return null;
}

function pickVideoThumbnailFileId(content: Record<string, unknown>): number | null {
  const video = content.video as { thumbnail?: { file?: { id?: number } } } | undefined;
  const id = video?.thumbnail?.file?.id;
  return typeof id === "number" ? id : null;
}

function pickAnimationThumbnailFileId(content: Record<string, unknown>): number | null {
  const animation = content.animation as { thumbnail?: { file?: { id?: number } } } | undefined;
  const id = animation?.thumbnail?.file?.id;
  return typeof id === "number" ? id : null;
}

function mediaFileIdFromMessage(message: TdMessage): number | null {
  const content = message.content;
  if (!content || typeof content !== "object") return null;
  const row = content as Record<string, unknown>;
  const type = row._;
  if (type === "messagePhoto") return pickPhotoFileId(row);
  if (type === "messageVideo") return pickVideoThumbnailFileId(row);
  if (type === "messageAnimation") return pickAnimationThumbnailFileId(row);
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

  const fileId = mediaFileIdFromMessage(message);
  if (fileId == null) return null;

  const file = await waitForLocalFile(client, fileId);
  const path = file?.local?.path;
  if (!path || !fs.existsSync(path)) return null;

  try {
    const data = fs.readFileSync(path);
    return { data, mime: mimeFromPath(path) };
  } catch {
    return null;
  }
}
