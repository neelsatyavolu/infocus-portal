/**
 * Just enough Markdown for the Portal's own guides (docs/knowledge): headings, paragraphs, bulleted and numbered
 * lists (one level of nesting), **bold**, `code` and [links](/path). Returns plain data that a component renders
 * as React elements, so nothing is ever injected as HTML.
 */

export type Inline =
  | { type: "text"; text: string }
  | { type: "strong"; text: string }
  | { type: "code"; text: string }
  | { type: "link"; text: string; href: string };

export type ListItem = { content: Inline[]; children: { ordered: boolean; items: ListItem[] } | null };

export type Block =
  | { type: "heading"; level: 1 | 2 | 3; content: Inline[]; text: string }
  | { type: "paragraph"; content: Inline[] }
  | { type: "list"; ordered: boolean; items: ListItem[] };

const INLINE = /\*\*([^*]+)\*\*|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)/g;

/** Only links inside the Portal or to https pages; anything else stays plain text. */
function safeHref(href: string) {
  return href.startsWith("/") || href.startsWith("https://") ? href : null;
}

export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  let last = 0;
  for (const match of text.matchAll(INLINE)) {
    if (match.index > last) out.push({ type: "text", text: text.slice(last, match.index) });
    if (match[1] !== undefined) out.push({ type: "strong", text: match[1] });
    else if (match[2] !== undefined) out.push({ type: "code", text: match[2] });
    else {
      const href = safeHref(match[4]);
      out.push(href ? { type: "link", text: match[3], href } : { type: "text", text: match[3] });
    }
    last = match.index + match[0].length;
  }
  if (last < text.length) out.push({ type: "text", text: text.slice(last) });
  return out;
}

const LIST_ITEM = /^(\s*)(-|\d+\.)\s+(.*)$/;

export function parseMarkdown(markdown: string): Block[] {
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  let list: Extract<Block, { type: "list" }> | null = null;

  const flushParagraph = () => {
    if (paragraph.length) blocks.push({ type: "paragraph", content: parseInline(paragraph.join(" ")) });
    paragraph = [];
  };
  const flushList = () => {
    if (list) blocks.push(list);
    list = null;
  };

  for (const raw of markdown.split(/\r?\n/)) {
    const line = raw.trimEnd();
    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    const item = LIST_ITEM.exec(line);
    if (!line.trim()) {
      flushParagraph();
      flushList();
    } else if (heading) {
      flushParagraph();
      flushList();
      const text = heading[2].trim();
      blocks.push({ type: "heading", level: heading[1].length as 1 | 2 | 3, content: parseInline(text), text });
    } else if (item) {
      flushParagraph();
      const ordered = item[2] !== "-";
      const entry: ListItem = { content: parseInline(item[3]), children: null };
      const current = list as Extract<Block, { type: "list" }> | null;
      const parent = current?.items.at(-1);
      if (item[1].length >= 2 && parent) {
        parent.children ??= { ordered, items: [] };
        parent.children.items.push(entry);
      } else if (current && current.ordered === ordered) {
        current.items.push(entry);
      } else {
        flushList();
        list = { type: "list", ordered, items: [entry] };
      }
    } else if (list && /^\s{2,}/.test(raw)) {
      // A wrapped list line: part of the last item.
      const current = list as Extract<Block, { type: "list" }>;
      const last = current.items.at(-1)!;
      const target = last.children?.items.at(-1) ?? last;
      target.content = [...target.content, { type: "text", text: " " }, ...parseInline(line.trim())];
    } else {
      flushList();
      paragraph.push(line.trim());
    }
  }
  flushParagraph();
  flushList();
  return blocks;
}

/** Blocks split at each level-2 heading: the intro (everything before the first one), then one section per heading. */
export function markdownSections(blocks: Block[]) {
  const sections: { heading: Extract<Block, { type: "heading" }> | null; blocks: Block[] }[] = [{ heading: null, blocks: [] }];
  for (const block of blocks) {
    if (block.type === "heading" && block.level === 2) sections.push({ heading: block, blocks: [] });
    else sections[sections.length - 1].blocks.push(block);
  }
  return sections.filter((section) => section.heading || section.blocks.length > 0);
}
