import { WEB_UI_SANS_STACK } from "../../fonts";
import {
  MESSAGE_BUBBLE_FONT_SIZE_PX,
  MESSAGE_BUBBLE_LINE_HEIGHT_PX,
  MESSAGE_BUBBLE_META_GAP_PX,
  MESSAGE_BUBBLE_PADDING_HORIZONTAL_PX,
  MESSAGE_BUBBLE_TIME_FONT_SIZE_PX,
  MESSAGE_BUBBLE_TIME_LINE_HEIGHT_PX,
} from "./messageChatLayout";

export type BubbleMetaPlacement = "inline" | "lastLine" | "stacked";

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

/** Wrapped line widths for bubble body text at `maxContentWidth`. */
export function measureWrappedLineWidths(text: string, maxContentWidth: number): number[] {
  if (typeof document === "undefined" || maxContentWidth <= 0 || !text.trim()) return [];

  const probe = document.createElement("div");
  applyBodyProbeStyles(probe, maxContentWidth);
  probe.textContent = text;
  document.body.appendChild(probe);

  const textNode = probe.firstChild;
  if (!textNode || textNode.nodeType !== Node.TEXT_NODE) {
    document.body.removeChild(probe);
    return text.trim() ? [measureTextGlyphWidth(text, MESSAGE_BUBBLE_FONT_SIZE_PX, MESSAGE_BUBBLE_LINE_HEIGHT_PX)] : [];
  }

  const node = textNode as Text;
  const range = document.createRange();
  let lineStart = 0;
  const lineWidths: number[] = [];
  let end = 1;

  while (end <= node.length) {
    range.setStart(node, lineStart);
    range.setEnd(node, end);
    if (range.getClientRects().length > 1) {
      range.setStart(node, lineStart);
      range.setEnd(node, end - 1);
      lineWidths.push(Math.ceil(range.getBoundingClientRect().width));
      lineStart = end - 1;
      end = lineStart + 1;
      continue;
    }
    end += 1;
  }

  range.setStart(node, lineStart);
  range.setEnd(node, node.length);
  lineWidths.push(Math.ceil(range.getBoundingClientRect().width));

  document.body.removeChild(probe);
  return lineWidths.length > 0 ? lineWidths : [0];
}

export function measureLongestWrappedBodyLineWidth(text: string, maxContentWidth: number): number {
  const lines = measureWrappedLineWidths(text, maxContentWidth);
  if (lines.length === 0) return 0;
  return Math.max(...lines);
}

export function measureMessageBubbleMetaWidthPx(
  timeLabel: string,
  metaExtraWidthPx = 0,
): number {
  if (!timeLabel) return metaExtraWidthPx;
  const timeWidth = measureTextGlyphWidth(
    timeLabel,
    MESSAGE_BUBBLE_TIME_FONT_SIZE_PX,
    MESSAGE_BUBBLE_TIME_LINE_HEIGHT_PX,
  );
  return timeWidth + metaExtraWidthPx;
}

/** Single-line inline row: body glyphs + gap + time/checks. */
export function measureInlineBubbleRowWidth(bodyText: string, metaWidthPx: number): number {
  const trimmed = bodyText.trim();
  if (!trimmed) return Math.max(0, metaWidthPx);
  const textWidth = measureTextGlyphWidth(
    trimmed,
    MESSAGE_BUBBLE_FONT_SIZE_PX,
    MESSAGE_BUBBLE_LINE_HEIGHT_PX,
  );
  if (metaWidthPx <= 0) return textWidth;
  return textWidth + MESSAGE_BUBBLE_META_GAP_PX + metaWidthPx;
}

export function resolveBubbleMetaPlacementFromLineWidths(
  lineWidths: number[],
  maxContentWidth: number,
  metaWidthPx: number,
  metaGapPx = MESSAGE_BUBBLE_META_GAP_PX,
): BubbleMetaPlacement {
  if (lineWidths.length === 0 || metaWidthPx <= 0) return "stacked";
  if (lineWidths.length === 1) {
    return lineWidths[0]! + metaGapPx + metaWidthPx <= maxContentWidth ? "inline" : "stacked";
  }
  const longest = Math.max(...lineWidths);
  const lastLine = lineWidths[lineWidths.length - 1]!;
  const metaBlock = metaGapPx + metaWidthPx;
  if (lastLine + metaBlock <= maxContentWidth) {
    return "lastLine";
  }
  if (longest - lastLine >= metaBlock) {
    return "lastLine";
  }
  return "stacked";
}

export function measureBubbleInnerContentWidth(
  lineWidths: number[],
  placement: BubbleMetaPlacement,
  metaWidthPx: number,
  metaGapPx = MESSAGE_BUBBLE_META_GAP_PX,
  bodyText = "",
): number {
  if (lineWidths.length === 0) return Math.max(0, metaWidthPx);
  const longest = Math.max(...lineWidths);
  switch (placement) {
    case "inline":
      return measureInlineBubbleRowWidth(bodyText, metaWidthPx);
    case "lastLine": {
      const lastLine = lineWidths[lineWidths.length - 1] ?? 0;
      return Math.max(longest, lastLine + metaGapPx + metaWidthPx);
    }
    default:
      return Math.max(longest, metaWidthPx);
  }
}

export function resolveMessageBubbleLayout(
  bodyText: string,
  maxColumnWidth: number,
  metaWidthPx: number,
  extraInnerWidthPx = 0,
): {
  placement: BubbleMetaPlacement;
  innerWidthPx: number;
  lineWidths: number[];
} {
  const maxContentWidth = Math.max(
    0,
    maxColumnWidth - MESSAGE_BUBBLE_PADDING_HORIZONTAL_PX * 2,
  );
  const trimmed = bodyText.trim();
  let contentWidth = maxContentWidth;
  let lineWidths = trimmed ? measureWrappedLineWidths(trimmed, contentWidth) : [];
  let placement = resolveBubbleMetaPlacementFromLineWidths(
    lineWidths,
    contentWidth,
    metaWidthPx,
  );
  let innerWidthPx = measureBubbleInnerContentWidth(
    lineWidths,
    placement,
    metaWidthPx,
    MESSAGE_BUBBLE_META_GAP_PX,
    trimmed,
  );

  if (trimmed && innerWidthPx > 0 && innerWidthPx < maxContentWidth) {
    const remeasured = measureWrappedLineWidths(trimmed, innerWidthPx);
    if (remeasured.length > 0) {
      lineWidths = remeasured;
      placement = resolveBubbleMetaPlacementFromLineWidths(lineWidths, innerWidthPx, metaWidthPx);
      innerWidthPx = measureBubbleInnerContentWidth(
        lineWidths,
        placement,
        metaWidthPx,
        MESSAGE_BUBBLE_META_GAP_PX,
        trimmed,
      );
    }
  }

  if (extraInnerWidthPx > 0) innerWidthPx = Math.max(innerWidthPx, extraInnerWidthPx);
  if (!trimmed && metaWidthPx > 0) innerWidthPx = Math.max(innerWidthPx, metaWidthPx);
  innerWidthPx = Math.min(maxContentWidth, innerWidthPx);
  return { placement, innerWidthPx, lineWidths };
}

/** Outer bubble width — shrink-wraps text + adaptive time/checks placement. */
export function measureMessageBubbleOuterWidth(
  bodyText: string,
  maxColumnWidth: number,
  extraInnerWidthPx = 0,
  timeLabel = "",
  metaExtraWidthPx = 0,
): number {
  if (maxColumnWidth <= 0) return 0;
  const metaWidthPx = measureMessageBubbleMetaWidthPx(timeLabel, metaExtraWidthPx);
  const { innerWidthPx } = resolveMessageBubbleLayout(
    bodyText,
    maxColumnWidth,
    metaWidthPx,
    extraInnerWidthPx,
  );
  if (innerWidthPx <= 0) {
    return Math.min(
      maxColumnWidth,
      Math.max(extraInnerWidthPx, metaWidthPx) + MESSAGE_BUBBLE_PADDING_HORIZONTAL_PX * 2,
    );
  }
  return Math.min(maxColumnWidth, innerWidthPx + MESSAGE_BUBBLE_PADDING_HORIZONTAL_PX * 2);
}
