/** Matches {@link AuthenticatedHomeLeftNavStrip} total strip height. */
export const MESSAGE_CHAT_HEADER_STRIP_HEIGHT_PX = 55;

/** Shared list row metrics — aligned with {@link AuthenticatedHomeFeedPanel} feed rows. */
export const MESSAGE_ROW_HEIGHT_PX = 40;
export const MESSAGE_AVATAR_PX = 30;
export const MESSAGE_ICON_TEXT_GAP_PX = 15;
export const MESSAGE_NAME_TIME_GAP_PX = 15;
export const MESSAGE_FONT_SIZE_PX = 15;
export const MESSAGE_LINE_HEIGHT_PX = 20;
/** Unread-count pill horizontal inset inside the 20px-tall badge. */
export const MESSAGE_UNREAD_BADGE_PADDING_X_PX = 5;

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
