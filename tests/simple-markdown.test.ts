import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { markdownSections, parseInline, parseMarkdown } from "@/src/lib/simple-markdown";
import { readAssistantDoc } from "@/src/server/assistant-docs";

describe("simple markdown", () => {
  it("reads bold, code and safe links, and keeps unsafe links as text", () => {
    expect(parseInline("Press **Start** in `/editing`, see [Machines](/editing?view=machines) or [x](javascript:alert(1))")).toEqual([
      { type: "text", text: "Press " }, { type: "strong", text: "Start" }, { type: "text", text: " in " },
      { type: "code", text: "/editing" }, { type: "text", text: ", see " },
      { type: "link", text: "Machines", href: "/editing?view=machines" }, { type: "text", text: " or " },
      { type: "text", text: "x" }, { type: "text", text: ")" }
    ]);
  });

  it("parses headings, paragraphs, numbered lists with nested bullets, and wrapped lines", () => {
    const blocks = parseMarkdown([
      "# Guide", "", "Intro line one", "line two.", "", "## Steps",
      "1. First", "2. Second", "   - **Preview** plays it", "   - Ignore leaves it out", "3. Third", "",
      "- a bullet", "  continued"
    ].join("\n"));
    expect(blocks.map((block) => block.type)).toEqual(["heading", "paragraph", "heading", "list", "list"]);
    expect(blocks[1]).toEqual({ type: "paragraph", content: [{ type: "text", text: "Intro line one line two." }] });
    const steps = blocks[3] as Extract<(typeof blocks)[number], { type: "list" }>;
    expect(steps.ordered).toBe(true);
    expect(steps.items).toHaveLength(3);
    expect(steps.items[1].children?.items).toHaveLength(2);
    const bullets = blocks[4] as Extract<(typeof blocks)[number], { type: "list" }>;
    expect(bullets.items[0].content.map((part) => part.text).join("")).toBe("a bullet continued");
  });

  it("splits into an intro and one section per level-2 heading", () => {
    const sections = markdownSections(parseMarkdown("# T\n\nIntro\n\n## A\n\ntext\n\n## B\n\n- x"));
    expect(sections.map((section) => section.heading?.text ?? null)).toEqual([null, "A", "B"]);
  });
});

describe("the automatic editing guide", () => {
  it("is in the assistant's docs, whole (under its 14,000-character read limit), and renders as sections", () => {
    const doc = readAssistantDoc("automatic-editing");
    expect(doc?.title).toBe("How automatic editing works");
    expect(doc?.truncated).toBe(false);
    const sections = markdownSections(parseMarkdown(doc!.content));
    expect(sections.length).toBeGreaterThan(8);
    expect(readFileSync("docs/knowledge/automatic-editing.md", "utf8")).toContain("Approve & schedule");
  });

  it("is open to every assistant audience, students included", () => {
    expect(readAssistantDoc("automatic-editing", "member")).not.toBeNull();
  });
});
