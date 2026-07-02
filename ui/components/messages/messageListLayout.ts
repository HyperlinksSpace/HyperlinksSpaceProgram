/** Matches {@link AuthenticatedHomeLeftNavStrip} total strip height. */
export const MESSAGE_CHAT_HEADER_STRIP_HEIGHT_PX = 55;

/** Shared list row metrics — aligned with {@link AuthenticatedHomeFeedPanel} feed rows. */
export const MESSAGE_ROW_HEIGHT_PX = 40;
export const MESSAGE_AVATAR_PX = 30;
export const MESSAGE_ICON_TEXT_GAP_PX = 15;
export const MESSAGE_NAME_TIME_GAP_PX = 15;
export const MESSAGE_FONT_SIZE_PX = 15;
export const MESSAGE_LINE_HEIGHT_PX = 20;
/** Inline emoji sticker height in chat-list previews — Telegram ~18px for 15px preview text. */
export const MESSAGE_LIST_INLINE_EMOJI_SIZE_PX = Math.round(MESSAGE_FONT_SIZE_PX * 1.2);
/** Unread-count pill horizontal inset inside the 20px-tall badge. */
export const MESSAGE_UNREAD_BADGE_PADDING_X_PX = 5;

/** Scroll-to-bottom control in the open chat message column. */
export const MESSAGE_CHAT_SCROLL_TO_BOTTOM_OUTER_PX = 60;
export const MESSAGE_CHAT_SCROLL_TO_BOTTOM_INNER_PX = 30;
export const MESSAGE_CHAT_SCROLL_TO_BOTTOM_ICON_BOTTOM_INSET_PX = 7.5;
export const MESSAGE_CHAT_SCROLL_TO_BOTTOM_BADGE_TOP_PX = 5;
/** Show when unread count is strictly greater than this value. */
export const MESSAGE_CHAT_SCROLL_TO_BOTTOM_UNREAD_THRESHOLD = 10;

export function formatMessageUnreadCountLabel(count: number, chatId: number): string {
  if (!Number.isFinite(count) || count <= 0) return "";
  if (count === chatId || count > 50_000) return "";
  if (count > 99) return "99+";
  return String(count);
}

/** Vertical rhythm for authenticated home Feed / Messages lists. */
export const LIST_TOP_INSET_PX = 15;
export const LIST_ROW_GAP_PX = 15;
export const LIST_BOTTOM_INSET_PX = 15;
/** Wide-layout row press highlight: padding above/below the 40px row content. */
export const LIST_ROW_PRESS_HIGHLIGHT_PADDING_Y_PX = 7.5;

export function homeListShellStyle(widePressHighlight: boolean) {
  return {
    paddingTop: widePressHighlight
      ? LIST_ROW_PRESS_HIGHLIGHT_PADDING_Y_PX
      : LIST_TOP_INSET_PX,
    paddingBottom: widePressHighlight
      ? LIST_ROW_PRESS_HIGHLIGHT_PADDING_Y_PX
      : LIST_BOTTOM_INSET_PX,
    width: "100%" as const,
    alignSelf: "stretch" as const,
  };
}

/** @deprecated Use {@link LIST_ROW_GAP_PX}. */
export const MESSAGE_ROW_MARGIN_BOTTOM_PX = LIST_ROW_GAP_PX;
