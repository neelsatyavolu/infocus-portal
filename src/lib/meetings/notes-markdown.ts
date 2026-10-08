import { parseAssistantReply, splitInlineBold } from "@/src/lib/assistant-format";
import { EMAIL_BRAND, escapeHtml } from "@/src/lib/email-layout";

/** The Scribe's summary markdown: "#" headings, then paragraphs, bullets and **bold**. */

export type NotesSection = { heading: string | null; body: string };

export function splitMarkdownSections(markdown: string): NotesSection[] {
  const sections: NotesSection[] = [{ heading: null, body: "" }];
  for (const line of markdown.split("\n")) {
    const heading = /^#{1,6}\s+(.+)$/.exec(line.trim());
    if (heading) sections.push({ heading: heading[1].trim(), body: "" });
    else {
      const last = sections[sections.length - 1];
      sections[sections.length - 1] = { ...last, body: `${last.body}${line}\n` };
    }
  }
  return sections.filter((s) => s.heading || s.body.trim());
}

/** Escaped inline HTML: **bold**, and an action item's "[ ]" as a box. */
function inlineHtml(text: string) {
  const boxed = text.replace(/^\[ \]\s*/, "☐ ");
  return splitInlineBold(boxed)
    .map((part) => (part.bold ? `<strong>${escapeHtml(part.text)}</strong>` : escapeHtml(part.text)))
    .join("");
}

/** The summary as email HTML (every piece of text escaped; inline styles for mail clients). */
export function notesEmailHtml(markdown: string) {
  const { paper, line } = EMAIL_BRAND;
  const text = `color:${paper};font-size:14px;line-height:1.55;margin:0 0 10px`;
  return splitMarkdownSections(markdown)
    .map((section) => {
      const heading = section.heading
        ? `<h3 style="color:${paper};font-size:15px;margin:18px 0 8px;padding-top:12px;border-top:1px solid ${line}">${inlineHtml(section.heading)}</h3>`
        : "";
      const blocks = parseAssistantReply(section.body)
        .map((block) =>
          block.type === "ul"
            ? `<ul style="${text};padding-left:20px">${block.items.map((item) => `<li style="margin:0 0 4px">${inlineHtml(item)}</li>`).join("")}</ul>`
            : `<p style="${text}">${inlineHtml(block.text)}</p>`
        )
        .join("");
      return heading + blocks;
    })
    .join("");
}
