import type { FormattedTextSegment } from "../../shared/formattedTextSegments.js";
import {
  segmentsContainTelegramEmoji,
  segmentsPlainText,
} from "../../shared/formattedTextSegments.js";
import { readCustomEmojiIdField } from "../../shared/telegramCustomEmojiId.js";

export type { FormattedTextSegment };

type EntityRange = {
  offset: number;
  length: number;
  kind: "custom_emoji" | "link";
  custom_emoji_id?: string;
  url?: string;
};

function readTextEntityType(entity: Record<string, unknown>): Record<string, unknown> | null {
  const nested = entity.type;
  if (nested && typeof nested === "object") {
    return nested as Record<string, unknown>;
  }
  return entity;
}

function parseEntityRange(entity: unknown): EntityRange | null {
  if (!entity || typeof entity !== "object") return null;
  const row = entity as Record<string, unknown>;
  const typeRow = readTextEntityType(row);
  if (!typeRow) return null;
  const type = typeRow._;
  const offset = Number(row.offset);
  const length = Number(row.length);
  if (!Number.isFinite(offset) || !Number.isFinite(length) || length <= 0) return null;

  if (
    type === "messageEntityCustomEmoji" ||
    type === "textEntityTypeCustomEmoji" ||
    type === "textEntityCustomEmoji"
  ) {
    const customEmojiId =
      readCustomEmojiIdField(typeRow) ?? readCustomEmojiIdField(row);
    if (!customEmojiId) return null;
    return { offset, length, kind: "custom_emoji", custom_emoji_id: customEmojiId };
  }
  if (type === "messageEntityTextUrl" || type === "textEntityTypeTextUrl" || type === "textEntityTextUrl") {
    const url = typeof typeRow.url === "string" ? typeRow.url.trim() : "";
    if (!url) return null;
    return { offset, length, kind: "link", url };
  }
  if (type === "messageEntityUrl" || type === "textEntityTypeUrl" || type === "textEntityUrl") {
    return { offset, length, kind: "link" };
  }
  return null;
}

export function parseFormattedTextSegments(value: unknown): FormattedTextSegment[] | null {
  if (!value || typeof value !== "object") return null;
  const obj = value as { text?: string; entities?: unknown[] };
  const text = typeof obj.text === "string" ? obj.text : "";
  if (!text) return null;

  const entities = Array.isArray(obj.entities) ? obj.entities : [];
  const ranges: EntityRange[] = [];
  for (const entity of entities) {
    const parsed = parseEntityRange(entity);
    if (parsed) ranges.push(parsed);
  }
  if (ranges.length === 0) return null;

  ranges.sort((a, b) => a.offset - b.offset || b.length - a.length);

  const segments: FormattedTextSegment[] = [];
  let cursor = 0;

  for (const range of ranges) {
    if (range.offset < cursor) continue;
    if (range.offset > text.length) continue;
    const end = Math.min(range.offset + range.length, text.length);
    if (end <= range.offset) continue;

    if (range.offset > cursor) {
      segments.push({ kind: "text", text: text.slice(cursor, range.offset) });
    }

    const slice = text.slice(range.offset, end);
    if (range.kind === "custom_emoji") {
      segments.push({
        kind: "custom_emoji",
        text: slice,
        custom_emoji_id: range.custom_emoji_id!,
      });
    } else {
      segments.push({
        kind: "link",
        text: slice,
        url: range.url ?? slice,
      });
    }
    cursor = end;
  }

  if (cursor < text.length) {
    segments.push({ kind: "text", text: text.slice(cursor) });
  }

  return segments.length > 0 ? segments : null;
}

export function truncatePreviewSegments(
  segments: FormattedTextSegment[],
  maxLen = 240,
): FormattedTextSegment[] {
  const plain = segmentsPlainText(segments);
  if (plain.length <= maxLen) return segments;

  const truncated: FormattedTextSegment[] = [];
  let used = 0;
  for (const segment of segments) {
    const remaining = maxLen - used;
    if (remaining <= 0) break;
    if (segment.text.length <= remaining) {
      truncated.push(segment);
      used += segment.text.length;
      continue;
    }
    truncated.push({ ...segment, text: segment.text.slice(0, remaining) });
    break;
  }
  return truncated;
}

export function animatedEmojiSegments(content: Record<string, unknown>): FormattedTextSegment[] | null {
  const animated = content.animated_emoji as Record<string, unknown> | undefined;
  const sticker = animated?.sticker as Record<string, unknown> | undefined;
  const customEmojiId =
    readCustomEmojiIdField(animated ?? {}) ??
    readCustomEmojiIdField(sticker ?? {}) ??
    readCustomEmojiIdField(content);

  const fallback =
    (typeof animated?.emoji === "string" && animated.emoji) ||
    (typeof (content.emoji as { emoji?: string } | undefined)?.emoji === "string"
      ? (content.emoji as { emoji: string }).emoji
      : "") ||
    "";

  if (customEmojiId) {
    return [{ kind: "custom_emoji", text: fallback || "🎭", custom_emoji_id: customEmojiId }];
  }
  if (fallback) {
    return [{ kind: "animated_emoji", text: fallback, emoji: fallback }];
  }
  return null;
}

const UNICODE_EMOJI_PATTERN =
  /\p{Extended_Pictographic}(?:\uFE0F|\uFE0E)?(?:\u200D\p{Extended_Pictographic}(?:\uFE0F|\uFE0E)?)*/gu;

function splitTextIntoAnimatedEmojiSegments(text: string): FormattedTextSegment[] {
  if (!text) return [];
  const segments: FormattedTextSegment[] = [];
  let lastIndex = 0;
  const pattern = new RegExp(UNICODE_EMOJI_PATTERN.source, "gu");
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    const start = match.index;
    if (start > lastIndex) {
      segments.push({ kind: "text", text: text.slice(lastIndex, start) });
    }
    const emoji = match[0];
    segments.push({ kind: "animated_emoji", text: emoji, emoji });
    lastIndex = start + emoji.length;
  }

  if (lastIndex < text.length) {
    segments.push({ kind: "text", text: text.slice(lastIndex) });
  }

  return segments.length > 0 ? segments : [{ kind: "text", text }];
}

function enrichSegmentsWithStandardEmojis(segments: FormattedTextSegment[]): FormattedTextSegment[] {
  const enriched: FormattedTextSegment[] = [];
  for (const segment of segments) {
    if (segment.kind !== "text" || !segment.text) {
      enriched.push(segment);
      continue;
    }
    enriched.push(...splitTextIntoAnimatedEmojiSegments(segment.text));
  }
  return enriched;
}

export function messageTextSegments(message: {
  content?: Record<string, unknown> | null;
} | null | undefined): FormattedTextSegment[] | null {
  if (!message) return null;
  const content = message.content;
  if (!content || typeof content !== "object") return null;
  const row = content as Record<string, unknown>;
  const type = row._;

  if (type === "messageText") {
    const parsed = parseFormattedTextSegments(row.text);
    if (parsed) return enrichSegmentsWithStandardEmojis(parsed);
    const plain = typeof (row.text as { text?: string } | undefined)?.text === "string"
      ? (row.text as { text: string }).text
      : "";
    return plain ? enrichSegmentsWithStandardEmojis([{ kind: "text", text: plain }]) : null;
  }
  if (type === "messageAnimatedEmoji") {
    return animatedEmojiSegments(row);
  }
  if (
    type === "messagePhoto" ||
    type === "messageVideo" ||
    type === "messageDocument" ||
    type === "messageAnimation" ||
    type === "messageAudio" ||
    type === "messageVoiceNote" ||
    type === "messagePaidMedia"
  ) {
    const parsed = parseFormattedTextSegments(row.caption);
    return parsed ? enrichSegmentsWithStandardEmojis(parsed) : null;
  }
  if (type === "messageWebPage") {
    const parsed = parseFormattedTextSegments(row.caption);
    return parsed ? enrichSegmentsWithStandardEmojis(parsed) : null;
  }
  return null;
}

export function previewSegmentsFromMessage(message: {
  content?: Record<string, unknown> | null;
} | null | undefined): FormattedTextSegment[] | null {
  const segments = messageTextSegments(message);
  if (!segments) return null;
  if (!segmentsContainTelegramEmoji(segments)) return null;
  return truncatePreviewSegments(segments);
}
