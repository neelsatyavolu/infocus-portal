import Link from "next/link";
import { Panel } from "@/components/kit/panel";
import { markdownSections, parseMarkdown, type Block, type Inline, type ListItem } from "@/src/lib/simple-markdown";

function Text({ content }: { content: Inline[] }) {
  return (
    <>
      {content.map((part, index) => {
        if (part.type === "strong") return <strong key={index} className="font-semibold text-foreground">{part.text}</strong>;
        if (part.type === "code") return <code key={index} className="rounded bg-muted px-1 py-0.5 font-mono text-[12.5px]">{part.text}</code>;
        if (part.type === "link") {
          return (
            <Link key={index} href={part.href as never} className="text-foreground underline underline-offset-2">
              {part.text}
            </Link>
          );
        }
        return <span key={index}>{part.text}</span>;
      })}
    </>
  );
}

function List({ ordered, items }: { ordered: boolean; items: ListItem[] }) {
  const Tag = ordered ? "ol" : "ul";
  return (
    <Tag className={`space-y-1.5 pl-5 ${ordered ? "list-decimal" : "list-disc"}`}>
      {items.map((item, index) => (
        <li key={index}>
          <Text content={item.content} />
          {item.children ? <div className="mt-1.5"><List {...item.children} /></div> : null}
        </li>
      ))}
    </Tag>
  );
}

function BlockView({ block }: { block: Block }) {
  if (block.type === "list") return <List ordered={block.ordered} items={block.items} />;
  if (block.type === "heading") {
    const Tag = block.level === 1 ? "h2" : "h4";
    return <Tag className="font-semibold text-foreground"><Text content={block.content} /></Tag>;
  }
  return <p><Text content={block.content} /></p>;
}

/**
 * The How to view: docs/knowledge/automatic-editing.md (the same guide the Portal assistant reads), one panel per
 * section. The page passes the markdown in from the server's bundled docs.
 */
export function EditingHowToView({ markdown }: { markdown: string }) {
  const sections = markdownSections(parseMarkdown(markdown));
  if (sections.length === 0) {
    return <p className="text-sm text-muted-foreground">The guide isn&rsquo;t available right now.</p>;
  }
  return (
    <div className="space-y-5">
      {sections.map((section, index) => (
        <Panel
          key={section.heading?.text ?? `intro-${index}`}
          title={section.heading ? <Text content={section.heading.content} /> : undefined}
          bodyClassName="space-y-3 text-sm leading-relaxed text-muted-foreground"
        >
          {section.blocks.map((block, blockIndex) => <BlockView key={blockIndex} block={block} />)}
        </Panel>
      ))}
    </div>
  );
}
