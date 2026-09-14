/**
 * Extract TDLib `webPage` / `messageText.web_page` metadata for Telegram-style
 * in-bubble link previews.
 */

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function trimmedString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function minithumbnailDataUrl(value: unknown): string | null {
  const rec = asRecord(value);
  const data = rec?.data;
  if (typeof data === "string" && data.trim()) {
    const raw = data.trim();
    if (raw.startsWith("data:")) return raw;
    return `data:image/jpeg;base64,${raw}`;
  }
  if (typeof Buffer !== "undefined" && Buffer.isBuffer(data) && data.length > 0) {
    return `data:image/jpeg;base64,${data.toString("base64")}`;
  }
  return null;
}

export type MappedWebPagePreview = {
  url: string;
  display_url: string | null;
  site_name: string | null;
  title: string | null;
  description: string | null;
  photo_minithumbnail_data_url: string | null;
};

function webPageObjectFromContent(content: Record<string, unknown>): Record<string, unknown> | null {
  const type = content._;
  if (type === "messageText" || type === "messageWebPage") {
    return asRecord(content.web_page);
  }
  // Captioned media can also carry a webpage (rare) — ignore for preview card.
  return asRecord(content.web_page);
}

export function parseTdWebPagePreview(messageContent: unknown): MappedWebPagePreview | null {
  const content = asRecord(messageContent);
  if (!content) return null;
  const webPage = webPageObjectFromContent(content);
  if (!webPage) return null;

  const url =
    trimmedString(webPage.url) ||
    trimmedString(webPage.display_url) ||
    trimmedString(webPage.displayUrl);
  if (!url) return null;

  const photo = asRecord(webPage.photo);
  const photoMini =
    minithumbnailDataUrl(photo?.minithumbnail) ||
    minithumbnailDataUrl(webPage.photo_minithumbnail) ||
    minithumbnailDataUrl(webPage.minithumbnail);

  const descriptionRaw =
    trimmedString(webPage.description) ||
    trimmedString(asRecord(webPage.description)?.text);

  return {
    url,
    display_url: trimmedString(webPage.display_url) || trimmedString(webPage.displayUrl),
    site_name: trimmedString(webPage.site_name) || trimmedString(webPage.siteName),
    title: trimmedString(webPage.title),
    description: descriptionRaw,
    photo_minithumbnail_data_url: photoMini,
  };
}
