/** Chat pane body in wide three-column layout. */
export const MESSAGE_CHAT_BODY_PADDING_PX = 30;
export const MESSAGE_BUBBLE_AVATAR_PX = 40;
export const MESSAGE_BUBBLE_AVATAR_GAP_PX = 15;
export const MESSAGE_BUBBLE_ROW_GAP_PX = 15;

/** Text/media message bubble corners (square). */
export const MESSAGE_BUBBLE_BORDER_RADIUS_PX = 0;
/** Single-line inline rows match {@link MESSAGE_BUBBLE_AVATAR_PX} height. */
export const MESSAGE_BUBBLE_COMPACT_HEIGHT_PX = MESSAGE_BUBBLE_AVATAR_PX;
export const MESSAGE_BUBBLE_PADDING_HORIZONTAL_PX = 15;
export const MESSAGE_BUBBLE_PADDING_VERTICAL_PX = 10;
export const MESSAGE_BUBBLE_FONT_SIZE_PX = 15;
export const MESSAGE_BUBBLE_LINE_HEIGHT_PX = 25;
export const MESSAGE_BUBBLE_TIME_FONT_SIZE_PX = 11;
export const MESSAGE_BUBBLE_TIME_LINE_HEIGHT_PX = 15;
export const MESSAGE_BUBBLE_TIME_MIN_WIDTH_PX = 52;
export const MESSAGE_CHAT_CHECKMARK_SIZE_PX = 14;
export const MESSAGE_CHAT_CHECKMARK_GAP_PX = 3;
/** Horizontal gap between message text and time/checks when sharing a line. */
export const MESSAGE_BUBBLE_META_GAP_PX = 6;
/**
 * Time + checks sit this far above the bubble (or bare-media frame) bottom edge —
 * same inset on text, media-overlay, inline, and stacked layouts.
 */
export const MESSAGE_BUBBLE_META_BOTTOM_INSET_PX = MESSAGE_BUBBLE_PADDING_VERTICAL_PX;
/** Body baseline within a {@link MESSAGE_BUBBLE_LINE_HEIGHT_PX} line box (from line bottom). */
export const MESSAGE_BUBBLE_BODY_BASELINE_FROM_LINE_BOTTOM_PX = 6;
/** Time baseline within a {@link MESSAGE_BUBBLE_TIME_LINE_HEIGHT_PX} line box (from line bottom). */
export const MESSAGE_BUBBLE_TIME_BASELINE_FROM_LINE_BOTTOM_PX = 3;
/** Nudge inline meta so time baseline matches body text baseline on one row. */
export const MESSAGE_BUBBLE_INLINE_META_BASELINE_OFFSET_PX =
  MESSAGE_BUBBLE_BODY_BASELINE_FROM_LINE_BOTTOM_PX -
  MESSAGE_BUBBLE_TIME_BASELINE_FROM_LINE_BOTTOM_PX;

export function messageBubbleMediaMetaBottomPx(
  hasProgressBar: boolean,
  progressHeightPx = MESSAGE_BUBBLE_MEDIA_PROGRESS_HEIGHT_PX,
): number {
  return (
    (hasProgressBar ? progressHeightPx : 0) +
    MESSAGE_BUBBLE_META_BOTTOM_INSET_PX
  );
}
export const MESSAGE_BUBBLE_MEDIA_MAX_WIDTH_PX = 360;
/** In-chat sticker cap (Telegram ~192px). */
export const MESSAGE_BUBBLE_STICKER_MAX_PX = 192;
/** GIF / animation native cap — never upscale beyond source dimensions. */
export const MESSAGE_BUBBLE_GIF_MAX_PX = 320;
/** Playback progress strip under in-chat video / GIF. */
export const MESSAGE_BUBBLE_MEDIA_PROGRESS_HEIGHT_PX = 1;
/** Progress strip under video/GIF while poster preview is visible (before playback). */
export const MESSAGE_BUBBLE_MEDIA_PREVIEW_PROGRESS_HEIGHT_PX = 5;

/** Web-only: match {@link measureWrappedLineWidths} probe so long URLs/hashtags wrap inside bubbles. */
export const messageChatBubbleTextWebWrapStyle = {
  overflowWrap: "break-word",
  wordBreak: "break-word",
} as const;

/** Initial / paginated history page size (scroll up to load older). */
export const MESSAGE_CHAT_HISTORY_PAGE_SIZE = 30;

/** Distance from top (px) that triggers loading the previous page. */
export const MESSAGE_CHAT_LOAD_OLDER_THRESHOLD_PX = 120;
