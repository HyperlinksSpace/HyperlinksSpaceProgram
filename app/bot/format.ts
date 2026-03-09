/**
 * Converts Markdown (as typically produced by the AI) to Telegram HTML.
 * Telegram supports: <b>, <i>, <code>, <pre>, <a href="...">.
 * We escape & < > in text; lists stay as newlines (no list tags in Telegram).
 */

/** Escape for Telegram HTML: only &lt; &gt; &amp; &quot; are supported. Unescaped " breaks attribute values (e.g. href). */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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
 * content so the bot never shows raw delimiters. Skips content inside <pre> and <code>
 * so we don't strip asterisks/backticks that are part of code.
 */
export function stripUnpairedMarkdownDelimiters(html: string): string {
  if (typeof html !== "string" || html.length === 0) return html;
  const blocks: string[] = [];
  const placeholder = (i: number) => `\x00B${i}\x00`;
  let out = html.replace(/<pre>[\s\S]*?<\/pre>/gi, (m) => {
    const i = blocks.length;
    blocks.push(m);
    return placeholder(i);
  });
  out = out.replace(/<code>[\s\S]*?<\/code>/gi, (m) => {
    const i = blocks.length;
    blocks.push(m);
    return placeholder(i);
  });
  out = out.replace(/\*\*/g, "").replace(/__/g, "").replace(/`/g, "");
  for (let i = 0; i < blocks.length; i++) {
    out = out.split(placeholder(i)).join(blocks[i]);
  }
  return out;
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

/**
 * Truncate HTML to at most maxLen without cutting through a tag, then close any unclosed tags.
 * Use before sending/edit with parse_mode: "HTML" so Telegram never receives invalid HTML
 * (avoids reject and fallback to plain text).
 */
export function truncateTelegramHtmlSafe(html: string, maxLen: number): string {
  if (typeof html !== "string" || html.length <= maxLen) return html;
  const cut = html.slice(0, maxLen);
  const lastTagEnd = cut.lastIndexOf(">");
  const safe = lastTagEnd >= 0 ? cut.slice(0, lastTagEnd + 1) : cut;
  return closeOpenTelegramHtml(safe);
}
