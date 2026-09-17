/**
 * Pure Markdown parse helpers for AI replies (no React).
 * Covers **bold**, lists, headers, `code`, links.
 */

export type AiInlineNode =
  | { kind: "text"; text: string }
  | { kind: "bold"; text: string }
  | { kind: "italic"; text: string }
  | { kind: "code"; text: string }
  | { kind: "link"; text: string; href: string };

export type AiBlock =
  | { kind: "blank" }
  | { kind: "paragraph"; children: AiInlineNode[] }
  | { kind: "heading"; level: number; children: AiInlineNode[] }
  | {
      kind: "list_item";
      ordered: boolean;
      depth: number;
      index: number;
      children: AiInlineNode[];
    }
  | { kind: "code_block"; text: string };

/** Strip trailing incomplete markers so typewriter reveal does not flash `**`. */
export function stripIncompleteAiMarkdownTail(md: string): string {
  if (!md) return md;
  let out = md;
  const fenceCount = (out.match(/```/g) ?? []).length;
  if (fenceCount % 2 === 1) {
    const i = out.lastIndexOf("```");
    if (i >= 0) out = out.slice(0, i);
  }

  // Incomplete **bold** — odd number of `**` markers.
  if (((out.match(/\*\*/g) ?? []).length) % 2 === 1) {
    const i = out.lastIndexOf("**");
    if (i >= 0) out = `${out.slice(0, i)}${out.slice(i + 2)}`;
  }

  // Incomplete `code` — odd backticks (fences already trimmed above).
  if (((out.match(/`/g) ?? []).length) % 2 === 1) {
    const i = out.lastIndexOf("`");
    if (i >= 0) out = out.slice(0, i);
  }

  // Incomplete *italic* — only when a lone `*` is unpaired.
  // Do NOT strip from a closing `*` through EOL (that left `*Brain trace:` visible).
  const loneStarCount = (out.replace(/\*\*/g, "").match(/\*/g) ?? []).length;
  if (loneStarCount % 2 === 1) {
    for (let i = out.length - 1; i >= 0; i -= 1) {
      if (out[i] !== "*") continue;
      if (out[i - 1] === "*" || out[i + 1] === "*") continue;
      out = out.slice(0, i);
      break;
    }
  }

  // Incomplete _italic_
  const loneUnderscore = (out.replace(/__/g, "").match(/_/g) ?? []).length;
  if (loneUnderscore % 2 === 1) {
    for (let i = out.length - 1; i >= 0; i -= 1) {
      if (out[i] !== "_") continue;
      if (out[i - 1] === "_" || out[i + 1] === "_") continue;
      out = out.slice(0, i);
      break;
    }
  }

  return out;
}

export function parseAiInline(text: string): AiInlineNode[] {
  if (!text) return [];
  const nodes: AiInlineNode[] = [];
  const re =
    /(\*\*([^*]+)\*\*)|(__([^_]+)__)|(`([^`]+)`)|(\[([^\]]+)\]\(([^)]+)\))|(\*([^*]+)\*)|(_([^_]+)_)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) {
      nodes.push({ kind: "text", text: text.slice(last, m.index) });
    }
    if (m[1]) nodes.push({ kind: "bold", text: m[2] ?? "" });
    else if (m[3]) nodes.push({ kind: "bold", text: m[4] ?? "" });
    else if (m[5]) nodes.push({ kind: "code", text: m[6] ?? "" });
    else if (m[7]) nodes.push({ kind: "link", text: m[8] ?? "", href: m[9] ?? "" });
    else if (m[10]) nodes.push({ kind: "italic", text: m[11] ?? "" });
    else if (m[12]) nodes.push({ kind: "italic", text: m[13] ?? "" });
    last = m.index + m[0].length;
  }
  if (last < text.length) {
    nodes.push({ kind: "text", text: text.slice(last) });
  }
  return nodes.length > 0 ? nodes : [{ kind: "text", text }];
}

export function parseAiMarkdownBlocks(md: string): AiBlock[] {
  const prepared = stripIncompleteAiMarkdownTail(md.replace(/\r\n/g, "\n"));
  if (!prepared.trim()) {
    return prepared.length > 0
      ? [{ kind: "paragraph", children: parseAiInline(prepared) }]
      : [];
  }

  const blocks: AiBlock[] = [];
  const lines = prepared.split("\n");
  let i = 0;
  let olCounterByDepth = new Map<number, number>();

  while (i < lines.length) {
    const line = lines[i] ?? "";

    if (/^\s*```/.test(line)) {
      const body: string[] = [];
      i += 1;
      while (i < lines.length && !/^\s*```/.test(lines[i] ?? "")) {
        body.push(lines[i] ?? "");
        i += 1;
      }
      if (i < lines.length) i += 1;
      blocks.push({ kind: "code_block", text: body.join("\n") });
      olCounterByDepth = new Map();
      continue;
    }

    if (line.trim() === "") {
      blocks.push({ kind: "blank" });
      olCounterByDepth = new Map();
      i += 1;
      continue;
    }

    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    if (heading) {
      blocks.push({
        kind: "heading",
        level: heading[1]!.length,
        children: parseAiInline(heading[2]!.trim()),
      });
      olCounterByDepth = new Map();
      i += 1;
      continue;
    }

    const ul = /^(\s*)([-*•])\s+(.+)$/.exec(line);
    if (ul) {
      const depth = Math.min(4, Math.floor(ul[1]!.length / 2));
      blocks.push({
        kind: "list_item",
        ordered: false,
        depth,
        index: 0,
        children: parseAiInline(ul[3]!),
      });
      olCounterByDepth = new Map();
      i += 1;
      continue;
    }

    const ol = /^(\s*)(\d+)[.)]\s+(.+)$/.exec(line);
    if (ol) {
      const depth = Math.min(4, Math.floor(ol[1]!.length / 2));
      const next = (olCounterByDepth.get(depth) ?? 0) + 1;
      olCounterByDepth.set(depth, next);
      blocks.push({
        kind: "list_item",
        ordered: true,
        depth,
        index: Number(ol[2]) || next,
        children: parseAiInline(ol[3]!),
      });
      i += 1;
      continue;
    }

    blocks.push({ kind: "paragraph", children: parseAiInline(line) });
    olCounterByDepth = new Map();
    i += 1;
  }

  return blocks;
}

/** Plain text for clipboard — no markdown markers. */
export function aiMarkdownToPlainText(md: string): string {
  return parseAiMarkdownBlocks(md)
    .map((b) => {
      if (b.kind === "blank") return "";
      if (b.kind === "code_block") return b.text;
      const inline = b.children.map((c) => c.text).join("");
      if (b.kind === "list_item") {
        const pad = "  ".repeat(b.depth);
        const mark = b.ordered ? `${b.index}. ` : "• ";
        return `${pad}${mark}${inline}`;
      }
      return inline;
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function summarizeAiMarkdownBlocks(md: string): string[] {
  return parseAiMarkdownBlocks(md).map((b) => {
    if (b.kind === "blank") return "(blank)";
    if (b.kind === "code_block") return `pre:${b.text}`;
    if (b.kind === "heading") {
      return `h${b.level}:${b.children.map((c) => c.text).join("")}`;
    }
    if (b.kind === "list_item") {
      const t = b.children
        .map((c) => `${c.kind === "bold" ? "*" : ""}${c.text}`)
        .join("");
      return `li${b.depth}:${t}`;
    }
    return `p:${b.children.map((c) => (c.kind === "bold" ? `*${c.text}*` : c.text)).join("")}`;
  });
}
