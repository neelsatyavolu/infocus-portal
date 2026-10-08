import { parseAssistantReply, splitInlineBold } from "@/src/lib/assistant-format";
import { splitMarkdownSections } from "@/src/lib/meetings/notes-markdown";

/**
 * Renders the Scribe's summary/transcript markdown as plain React (no HTML injection):
 * "#" headings, then paragraphs, bullets and **bold** via the assistant formatter.
 */

function Inline({ text }: { text: string }) {
  return (
    <>
      {splitInlineBold(text).map((part, i) =>
        part.bold ? (
          <strong key={i} className="font-semibold text-foreground">
            {part.text}
          </strong>
        ) : (
          <span key={i}>{part.text}</span>
        )
      )}
    </>
  );
}

export function MeetingMarkdown({ markdown }: { markdown: string }) {
  return (
    <div className="space-y-4 text-sm leading-relaxed text-[var(--ink-text)]">
      {splitMarkdownSections(markdown).map((section, si) => (
        <section key={si} className="space-y-2">
          {section.heading ? <h3 className="text-base font-semibold text-foreground">{section.heading}</h3> : null}
          {parseAssistantReply(section.body).map((block, bi) =>
            block.type === "ul" ? (
              <ul key={bi} className="list-disc space-y-1 pl-5">
                {block.items.map((item, ii) => (
                  <li key={ii}>
                    <Inline text={item} />
                  </li>
                ))}
              </ul>
            ) : (
              <p key={bi}>
                <Inline text={block.text} />
              </p>
            )
          )}
        </section>
      ))}
    </div>
  );
}
