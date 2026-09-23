export type AssistantBlock = { type: "p"; text: string } | { type: "ul"; items: string[] };

export function cleanAssistantReply(raw: string) {
  return raw
    .replace(/【[^】]*】/g, "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*{3,}/g, "**")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function splitInlineBold(text: string) {
  const chunks: Array<{ bold: boolean; text: string }> = [];
  const re = /\*\*(.+?)\*\*/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    if (match.index > last) {
      const plain = text.slice(last, match.index).replace(/\*+/g, "");
      if (plain) {
        chunks.push({ bold: false, text: plain });
      }
    }
    const inner = match[1].replace(/\*+/g, "");
    if (inner) {
      chunks.push({ bold: true, text: inner });
    }
    last = match.index + match[0].length;
  }
  const rest = text.slice(last).replace(/\*+/g, "");
  if (rest) {
    chunks.push({ bold: false, text: rest });
  }
  return chunks;
}

function isBullet(line: string) {
  return /^\s*(?:[-*]|\d+\.)\s+/.test(line);
}

function bulletText(line: string) {
  return line.replace(/^\s*(?:[-*]|\d+\.)\s+/, "").trim();
}

export function parseAssistantReply(raw: string): AssistantBlock[] {
  const text = cleanAssistantReply(raw);
  if (!text) {
    return [];
  }

  const blocks: AssistantBlock[] = [];
  let paragraph: string[] = [];
  let list: string[] = [];

  const flushParagraph = () => {
    const joined = paragraph.join(" ").trim();
    if (joined) {
      blocks.push({ type: "p", text: joined });
    }
    paragraph = [];
  };

  const flushList = () => {
    if (list.length > 0) {
      blocks.push({ type: "ul", items: list });
    }
    list = [];
  };

  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) {
      flushParagraph();
      flushList();
      continue;
    }
    if (isBullet(trimmed)) {
      flushParagraph();
      list.push(bulletText(trimmed));
      continue;
    }
    flushList();
    paragraph.push(trimmed);
  }

  flushParagraph();
  flushList();
  return blocks;
}
