import { WEB_UI_SANS_STACK } from "../../fonts";
import {
  MESSAGE_BUBBLE_FONT_SIZE_PX,
  MESSAGE_BUBBLE_LINE_HEIGHT_PX,
  MESSAGE_BUBBLE_PADDING_HORIZONTAL_PX,
  MESSAGE_BUBBLE_TIME_FONT_SIZE_PX,
  MESSAGE_BUBBLE_TIME_LINE_HEIGHT_PX,
} from "./messageChatLayout";

function applyBodyProbeStyles(element: HTMLElement, maxContentWidth: number) {
  element.style.position = "fixed";
  element.style.left = "-9999px";
  element.style.top = "0";
  element.style.visibility = "hidden";
  element.style.pointerEvents = "none";
  element.style.width = `${maxContentWidth}px`;
  element.style.fontFamily = WEB_UI_SANS_STACK;
  element.style.fontSize = `${MESSAGE_BUBBLE_FONT_SIZE_PX}px`;
  element.style.fontWeight = "400";
  element.style.lineHeight = `${MESSAGE_BUBBLE_LINE_HEIGHT_PX}px`;
  element.style.whiteSpace = "pre-wrap";
  element.style.overflowWrap = "break-word";
}

export function measureTextGlyphWidth(text: string, fontSizePx: number, lineHeightPx: number): number {
  if (typeof document === "undefined" || !text) return 0;
  const probe = document.createElement("span");
  probe.style.position = "fixed";
  probe.style.left = "-9999px";
  probe.style.visibility = "hidden";
  probe.style.fontFamily = WEB_UI_SANS_STACK;
  probe.style.fontSize = `${fontSizePx}px`;
  probe.style.lineHeight = `${lineHeightPx}px`;
  probe.style.whiteSpace = "nowrap";
  probe.textContent = text;
  document.body.appendChild(probe);
  const width = Math.ceil(probe.getBoundingClientRect().width);
  document.body.removeChild(probe);
  return width;
}

/** Wrapped line count for bubble body text at `maxContentWidth`. */
export function countWrappedBodyLines(text: string, maxContentWidth: number): number {
  if (typeof document === "undefined" || maxContentWidth <= 0 || !text.trim()) return 0;

  const probe = document.createElement("div");
  applyBodyProbeStyles(probe, maxContentWidth);
  probe.textContent = text;
  document.body.appendChild(probe);

  const textNode = probe.firstChild;
  if (!textNode || textNode.nodeType !== Node.TEXT_NODE) {
    document.body.removeChild(probe);
    return 1;
  }

  const node = textNode as Text;
  const range = document.createRange();
  let lineStart = 0;
  let lines = 0;
  let end = 1;

  while (end <= node.length) {
    range.setStart(node, lineStart);
    range.setEnd(node, end);
    if (range.getClientRects().length > 1) {
      lines += 1;
      lineStart = end - 1;
      end = lineStart + 1;
      continue;
    }
    end += 1;
  }
  if (lineStart < node.length) lines += 1;

  document.body.removeChild(probe);
  return Math.max(1, lines);
}

export function measureLongestWrappedBodyLineWidth(text: string, maxContentWidth: number): number {
  if (typeof document === "undefined" || maxContentWidth <= 0 || !text.trim()) return 0;

  const probe = document.createElement("div");
  applyBodyProbeStyles(probe, maxContentWidth);
  probe.textContent = text;
  document.body.appendChild(probe);

  const textNode = probe.firstChild;
  if (!textNode || textNode.nodeType !== Node.TEXT_NODE) {
    document.body.removeChild(probe);
    return 0;
  }

  const node = textNode as Text;
  const range = document.createRange();
  let lineStart = 0;
  let longest = 0;
  let end = 1;

  while (end <= node.length) {
    range.setStart(node, lineStart);
    range.setEnd(node, end);
    if (range.getClientRects().length > 1) {
      range.setStart(node, lineStart);
      range.setEnd(node, end - 1);
      longest = Math.max(longest, range.getBoundingClientRect().width);
      lineStart = end - 1;
      end = lineStart + 1;
      continue;
    }
    end += 1;
  }

  range.setStart(node, lineStart);
  range.setEnd(node, node.length);
  longest = Math.max(longest, range.getBoundingClientRect().width);

  document.body.removeChild(probe);
  return Math.ceil(longest);
}

export function shouldInlineBubbleTime(
  bodyText: string,
  timeLabel: string,
  maxContentWidth: number,
  metaExtraWidthPx = 0,
): boolean {
  if (!bodyText.trim() || !timeLabel) return false;
  const lines = countWrappedBodyLines(bodyText, maxContentWidth);
  if (lines > 1) return false;
  const textWidth = measureLongestWrappedBodyLineWidth(bodyText, maxContentWidth);
  const timeWidth = measureTextGlyphWidth(
    timeLabel,
    MESSAGE_BUBBLE_TIME_FONT_SIZE_PX,
    MESSAGE_BUBBLE_TIME_LINE_HEIGHT_PX,
  );
  return textWidth + timeWidth + metaExtraWidthPx + 10 <= maxContentWidth;
}

/** Outer bubble width from longest wrapped line (AI prompt chip pattern). */
export function measureMessageBubbleOuterWidth(
  bodyText: string,
  maxColumnWidth: number,
  extraInnerWidthPx = 0,
  timeLabel = "",
  metaExtraWidthPx = 0,
): number {
  if (maxColumnWidth <= 0) return 0;
  const maxContentWidth = Math.max(
    0,
    maxColumnWidth - MESSAGE_BUBBLE_PADDING_HORIZONTAL_PX * 2,
  );
  const longestLine = measureLongestWrappedBodyLineWidth(bodyText, maxContentWidth);
  let inner = Math.max(longestLine, extraInnerWidthPx);

  const trimmed = bodyText.trim();
  if (trimmed && timeLabel) {
    const timeWidth = measureTextGlyphWidth(
      timeLabel,
      MESSAGE_BUBBLE_TIME_FONT_SIZE_PX,
      MESSAGE_BUBBLE_TIME_LINE_HEIGHT_PX,
    );
    const metaWidth = timeWidth + metaExtraWidthPx;
    if (shouldInlineBubbleTime(trimmed, timeLabel, maxContentWidth, metaExtraWidthPx)) {
      const textWidth = measureLongestWrappedBodyLineWidth(trimmed, maxContentWidth);
      inner = Math.max(inner, textWidth + metaWidth + 10);
    } else {
      inner = Math.max(inner, metaWidth);
    }
  } else if (!trimmed && timeLabel) {
    const timeWidth = measureTextGlyphWidth(
      timeLabel,
      MESSAGE_BUBBLE_TIME_FONT_SIZE_PX,
      MESSAGE_BUBBLE_TIME_LINE_HEIGHT_PX,
    );
    inner = Math.max(inner, timeWidth + metaExtraWidthPx);
  }

  if (inner <= 0) {
    return Math.min(maxColumnWidth, extraInnerWidthPx + MESSAGE_BUBBLE_PADDING_HORIZONTAL_PX * 2);
  }
  return Math.min(maxColumnWidth, inner + MESSAGE_BUBBLE_PADDING_HORIZONTAL_PX * 2);
}
