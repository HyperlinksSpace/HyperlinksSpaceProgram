import { buildApiUrl } from "../../../api/_base";
import { logPageDisplay } from "../../pageDisplayLog";
import {
  isDisplayableMediaMessage,
  type MessageChatHistoryItem,
} from "./messageChatHistoryTypes";
import {
  getCachedMessageMedia,
  prefetchMessageMedia,
} from "./messageMediaBlobCache";
import { resolvePreviewMediaUrl } from "./MessageChatMediaContent";
import { MESSAGE_CHAT_EDGE_PREFETCH_SCREENS } from "./messageChatLayout";
import { isVoiceDialogUiOpen } from "./voiceDialogUiGate";

/** Cap concurrent full-photo warmups per display-window tick (tdesktop nearby band). */
const DISPLAY_FULL_PREFETCH_MAX = 8;
const DISPLAY_PREVIEW_PREFETCH_MAX = 16;

type LayoutEntry = { y: number; height: number };

const lastPrefetchSignature = new Map<number, string>();

function resolveMediaUrl(chatId: number, messageId: number): string {
  return buildApiUrl(
    `/api/telegram-messages-media?chat_id=${chatId}&message_id=${messageId}`,
  );
}

/**
 * Warm photo preview + full blobs for the painted display window so scroll arrives
 * at already-decoded images (tdesktop: preload around viewport / in-window media).
 *
 * Visible rows fetch on mount (critical). This only warms the band *above and
 * below* the viewport so those jobs cannot occupy the pool before on-screen media.
 */
export function prefetchDisplayChatMedia(
  chatId: number,
  messages: readonly MessageChatHistoryItem[],
  options?: {
    scrollY?: number;
    layoutH?: number;
    layouts?: Map<number, LayoutEntry> | null;
    contentActive?: boolean;
  },
): void {
  if (isVoiceDialogUiOpen()) return;
  if (!Number.isFinite(chatId) || messages.length === 0) return;
  if (options?.contentActive === false) return;

  const scrollY = options?.scrollY ?? 0;
  const layoutH = Math.max(1, options?.layoutH ?? 480);
  const preloadBandPx = layoutH * MESSAGE_CHAT_EDGE_PREFETCH_SCREENS;
  const layouts = options?.layouts ?? null;
  if (!layouts || layouts.size === 0) {
    // Wait for layouts: without them we used to queue oldest-first (above the
    // open viewport) and starve on-screen photo/preview fetches.
    return;
  }

  const headId = messages[0]?.telegram_message_id ?? 0;
  const tailId = messages[messages.length - 1]?.telegram_message_id ?? 0;
  const signature = `${messages.length}:${headId}:${tailId}:${Math.round(scrollY / layoutH)}`;
  if (lastPrefetchSignature.get(chatId) === signature) return;
  lastPrefetchSignature.set(chatId, signature);

  const viewTop = scrollY;
  const viewBottom = scrollY + layoutH;
  const viewCenter = scrollY + layoutH / 2;
  const bandTop = scrollY - preloadBandPx;
  const bandBottom = scrollY + layoutH + preloadBandPx;

  type Ranked = {
    item: MessageChatHistoryItem;
    dist: number;
  };
  const near: Ranked[] = [];

  for (const item of messages) {
    if (!isDisplayableMediaMessage(item)) continue;
    const kind = item.content_kind ?? "other";
    const isPhoto = kind === "photo";
    const isStreamable = kind === "video" || kind === "animation";
    if (!isPhoto && !isStreamable && kind !== "sticker") continue;
    const entry = layouts.get(item.telegram_message_id);
    if (!entry) continue;
    const top = entry.y;
    const bottom = entry.y + entry.height;
    const inViewport = bottom >= viewTop && top <= viewBottom;
    if (inViewport) continue;
    const inBand = bottom >= bandTop && top <= bandBottom;
    if (!inBand) continue;
    const mid = top + entry.height / 2;
    near.push({ item, dist: Math.abs(mid - viewCenter) });
  }

  near.sort((a, b) => a.dist - b.dist);

  let previewQueued = 0;
  let fullQueued = 0;

  for (const { item } of near) {
    const kind = item.content_kind ?? "other";
    const isPhoto = kind === "photo";
    const isStreamable = kind === "video" || kind === "animation";
    const uri = resolveMediaUrl(chatId, item.telegram_message_id);
    const previewUri = resolvePreviewMediaUrl(uri);

    if (previewQueued < DISPLAY_PREVIEW_PREFETCH_MAX && !getCachedMessageMedia(previewUri)) {
      prefetchMessageMedia(previewUri, { priority: "normal", preview: true });
      previewQueued += 1;
    }

    const wantFull = isPhoto || kind === "sticker" || isStreamable;
    if (wantFull && fullQueued < DISPLAY_FULL_PREFETCH_MAX && !getCachedMessageMedia(uri)) {
      prefetchMessageMedia(uri, { priority: "normal", preview: false });
      fullQueued += 1;
    }
  }

  if (previewQueued > 0 || fullQueued > 0) {
    logPageDisplay("messages_media_prefetch_display", {
      chatId,
      displayCount: messages.length,
      previewQueued,
      fullQueued,
      scrollY: Math.round(scrollY),
      layoutH: Math.round(layoutH),
      preloadBandPx: Math.round(preloadBandPx),
      band: "above_below",
    });
  }
}

export function clearDisplayChatMediaPrefetchSignature(chatId: number): void {
  lastPrefetchSignature.delete(chatId);
}
