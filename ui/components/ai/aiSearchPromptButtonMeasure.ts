import { WEB_UI_SANS_STACK } from "../../fonts";

export const AI_PROMPT_BUTTON_PADDING_HORIZONTAL_PX = 15;
export const AI_PROMPT_BUTTON_PADDING_VERTICAL_PX = 10;
export const AI_PROMPT_BUTTON_TEXT_FONT_SIZE_PX = 15;
export const AI_PROMPT_BUTTON_TEXT_LINE_HEIGHT_PX = 25;

function applyProbeTextStyles(element: HTMLElement) {
  element.style.fontFamily = WEB_UI_SANS_STACK;
  element.style.fontSize = `${AI_PROMPT_BUTTON_TEXT_FONT_SIZE_PX}px`;
  element.style.fontWeight = "400";
  element.style.lineHeight = `${AI_PROMPT_BUTTON_TEXT_LINE_HEIGHT_PX}px`;
  element.style.whiteSpace = "normal";
  element.style.overflowWrap = "break-word";
}

/** Longest line's glyph width when `label` wraps within `maxContentWidth`. */
export function measureLongestWrappedLineGlyphWidth(label: string, maxContentWidth: number): number {
  if (typeof document === "undefined" || maxContentWidth <= 0 || label.length === 0) return 0;

  const probe = document.createElement("div");
  probe.style.position = "fixed";
  probe.style.left = "-9999px";
  probe.style.top = "0";
  probe.style.visibility = "hidden";
  probe.style.pointerEvents = "none";
  probe.style.width = `${maxContentWidth}px`;
  applyProbeTextStyles(probe);
  probe.textContent = label;
  document.body.appendChild(probe);

  const textNode = probe.firstChild;
  if (!textNode || textNode.nodeType !== Node.TEXT_NODE) {
    document.body.removeChild(probe);
    return 0;
  }

  const text = textNode as Text;
  const range = document.createRange();
  let lineStart = 0;
  let longest = 0;
  let end = 1;

  while (end <= text.length) {
    range.setStart(text, lineStart);
    range.setEnd(text, end);
    if (range.getClientRects().length > 1) {
      range.setStart(text, lineStart);
      range.setEnd(text, end - 1);
      longest = Math.max(longest, range.getBoundingClientRect().width);
      lineStart = end - 1;
      end = lineStart + 1;
      continue;
    }
    end += 1;
  }

  range.setStart(text, lineStart);
  range.setEnd(text, text.length);
  longest = Math.max(longest, range.getBoundingClientRect().width);

  document.body.removeChild(probe);
  return Math.ceil(longest);
}

/** Outer button width: longest wrapped line + horizontal padding, capped to the column. */
export function measurePromptButtonOuterWidth(label: string, columnWidth: number): number {
  if (columnWidth <= 0) return 0;
  const maxContentWidth = Math.max(0, columnWidth - AI_PROMPT_BUTTON_PADDING_HORIZONTAL_PX * 2);
  const longestLine = measureLongestWrappedLineGlyphWidth(label, maxContentWidth);
  if (longestLine <= 0) return columnWidth;
  return Math.min(columnWidth, longestLine + AI_PROMPT_BUTTON_PADDING_HORIZONTAL_PX * 2);
}
