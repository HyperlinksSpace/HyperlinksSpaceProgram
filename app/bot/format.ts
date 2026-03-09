/**
 * Converts Markdown (as typically produced by the AI) to Telegram HTML.
 * Telegram supports: <b>, <i>, <code>, <pre>, <a href="...">.
 * We escape & < > in text; lists stay as newlines (no list tags in Telegram).
 */

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Convert Markdown to Telegram HTML. Safe for AI output (handles **bold**,
 * *italic*, `code`, ```blocks```, [text](url)).
 */
export function mdToTelegramHtml(md: string): string {
  if (typeof md !== "string" || md.length === 0) return md;

  let out = md;

  // 1) Escape HTML so we can safely wrap segments in tags
  out = escapeHtml(out);

  // 2) Code blocks (must be before inline code so we don't touch content)
  out = out.replace(/```\n?([\s\S]*?)```/g, (_m, code) => `<pre>${code.trimEnd()}</pre>`);

  // 3) Inline code
  out = out.replace(/`([^`]*)`/g, "<code>$1</code>");

  // 4) Bold (** or __)
  out = out.replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");
  out = out.replace(/__([^_]+)__/g, "<b>$1</b>");

  // 5) Italic (* or _); bold already replaced so **/__ are gone
  out = out.replace(/\*([^*]+)\*/g, "<i>$1</i>");
  out = out.replace(/_([^_]+)_/g, "<i>$1</i>");

  // 6) Links [text](url) - href and text are already escaped
  out = out.replace(/\[([^\]]*)\]\(([^)]*)\)/g, '<a href="$2">$1</a>');

  return out;
}

/**
 * Remove unpaired **, __, and ` from HTML (output of mdToTelegramHtml). Use for partial
 * content so the bot never shows raw delimiters; only formatted or plain text.
 */
export function stripUnpairedMarkdownDelimiters(html: string): string {
  if (typeof html !== "string" || html.length === 0) return html;
  return html
    .replace(/\*\*/g, "")
    .replace(/__/g, "")
    .replace(/`/g, "");
}

/**
 * Append closing tags for any unclosed Telegram HTML tags. Use after mdToTelegramHtml
 * on partial content so we never send invalid HTML (avoids reject + flicker).
 */
export function closeOpenTelegramHtml(html: string): string {
  if (typeof html !== "string" || html.length === 0) return html;
  const stack: string[] = [];
  // Match opening <tag> or <tag ...> and closing </tag> in order (longer names first)
  const re = new RegExp(
    "<(?:/(code|pre|a|b|i))>|((code|pre|a|b|i)(?:\\s[^>]*)?)>",
    "gi",
  );
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    if (m[1] !== undefined) {
      const tag = m[1].toLowerCase();
      if (stack.length > 0 && stack[stack.length - 1] === tag) stack.pop();
    } else if (m[3] !== undefined) {
      stack.push(m[3].toLowerCase());
    }
  }
  if (stack.length === 0) return html;
  const closers = stack.reverse().map((tag) => `</${tag}>`).join("");
  return html + closers;
}
