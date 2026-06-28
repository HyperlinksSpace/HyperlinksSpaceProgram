export type MessageTextSegment =
  | { kind: "text"; text: string }
  | { kind: "link"; text: string; url: string };

const MESSAGE_LINK_PATTERN =
  /(?:https?:\/\/[^\s]+|www\.[^\s]+|t\.me\/[^\s]+|tg:\/\/[^\s]+)/gi;

const TRAILING_LINK_PUNCTUATION = /[.,!?;:)\]}>]+$/;

function stripTrailingLinkPunctuation(raw: string): { linkText: string; trailing: string } {
  let linkText = raw;
  let trailing = "";
  while (linkText.length > 0 && TRAILING_LINK_PUNCTUATION.test(linkText)) {
    trailing = linkText.slice(-1) + trailing;
    linkText = linkText.slice(0, -1);
  }
  return { linkText, trailing };
}

export function normalizeMessageLinkUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return trimmed;
  if (/^tg:\/\//i.test(trimmed)) return trimmed;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^www\./i.test(trimmed)) return `https://${trimmed}`;
  if (/^t\.me\//i.test(trimmed)) return `https://${trimmed}`;
  return trimmed;
}

export function parseMessageTextLinks(input: string): MessageTextSegment[] {
  if (!input) return [];

  const segments: MessageTextSegment[] = [];
  let lastIndex = 0;
  const pattern = new RegExp(MESSAGE_LINK_PATTERN.source, "gi");
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(input)) !== null) {
    const start = match.index;
    if (start > lastIndex) {
      segments.push({ kind: "text", text: input.slice(lastIndex, start) });
    }

    const { linkText, trailing } = stripTrailingLinkPunctuation(match[0]);
    if (linkText) {
      segments.push({
        kind: "link",
        text: linkText,
        url: normalizeMessageLinkUrl(linkText),
      });
    }
    if (trailing) {
      segments.push({ kind: "text", text: trailing });
    }

    lastIndex = start + match[0].length;
  }

  if (lastIndex < input.length) {
    segments.push({ kind: "text", text: input.slice(lastIndex) });
  }

  return segments.length > 0 ? segments : [{ kind: "text", text: input }];
}

export function messageTextContainsLink(input: string): boolean {
  return parseMessageTextLinks(input).some((segment) => segment.kind === "link");
}
