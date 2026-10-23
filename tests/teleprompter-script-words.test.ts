import { describe, expect, it } from "vitest";
import { fillPackageTosses } from "@/src/lib/teleprompter-package-toss";
import { getSectionDisplayParts } from "@/src/lib/teleprompter-run-script";
import {
  buildScriptWordMap,
  readingLineOf,
  readLinesBefore,
  scriptLineKey,
  splitStyledSegments,
  type ScriptWordMap
} from "@/src/lib/teleprompter-script-words";
import { buildDefaultTeleprompterSections, renderA2BulletinContent } from "@/src/lib/teleprompter-template";
import type { SubmittedAnnouncement } from "@/src/lib/submitted-announcements";

function announcement(text: string) {
  return { announcement: text } as SubmittedAnnouncement;
}

function templateSections() {
  const sections = buildDefaultTeleprompterSections({
    showDate: new Date("2026-10-23T12:00:00.000Z"),
    a2BulletinContent: renderA2BulletinContent([
      announcement("College visits this week: check MaiaLearning for times."),
      announcement("Spirit Week starts Monday with pajama day."),
      announcement("Robot Club meets Thursday in the library.")
    ]),
    anchorName: "Abby Ames",
    coanchorName: "Otto Ortiz"
  });

  return sections.map((section, index) => ({
    id: `s${index + 1}`,
    label: section.label,
    content:
      section.label === "A3"
        ? fillPackageTosses(section.content, [
            { title: "Robotics", toss: "The robotics team built a robot that sorts recycling." },
            { title: "Garden", toss: "" }
          ])
        : section.content
  }));
}

function spokenText(map: ScriptWordMap, sectionId: string) {
  return map.words
    .filter((word) => word.sectionId === sectionId)
    .map((word) => word.raw)
    .join(" ");
}

describe("splitStyledSegments", () => {
  it("splits red and yellow markup out of a line", () => {
    expect(splitStyledSegments("Go [RED]Vikings[/RED] and [yellow]win[/yellow]!")).toEqual([
      { text: "Go ", tone: "default" },
      { text: "Vikings", tone: "red" },
      { text: " and ", tone: "default" },
      { text: "win", tone: "yellow" },
      { text: "!", tone: "default" }
    ]);
  });
});

describe("buildScriptWordMap", () => {
  const sections = templateSections();
  const map = buildScriptWordMap(sections);

  it("lists only the words an anchor reads, in order", () => {
    expect(spokenText(map, "s1")).toBe(
      "Good Morning PALY! Today is Friday, October 23rd, 2026. I'm Abby Ames. And I'm Otto Ortiz. BANTER ABOUT..."
    );
    expect(spokenText(map, "s4")).toBe("");
    expect(map.words.map((word) => word.index)).toEqual(map.words.map((_, index) => index));
  });

  it("skips beat headings, cameras, cues and [INSERT …] placeholders", () => {
    const raws = map.words.map((word) => word.raw);
    for (const skipped of ["OPEN", "BULLETIN", "PACKAGE", "CLOSING", "CAM", "{HOLD}", "{ROLL", "[INSERT"]) {
      expect(raws.some((raw) => raw.startsWith(skipped))).toBe(false);
    }
    expect(spokenText(map, "s3")).toBe("The robotics team built a robot that sorts recycling.");
  });

  it("skips inline placeholders but keeps the words around them", () => {
    const unfilled = buildScriptWordMap([{ id: "x", label: "A1", content: "I'm {ANCHOR NAME}.\nHello [INSERT NAME] there" }]);
    expect(unfilled.words.map((word) => word.raw)).toEqual(["I'm", "Hello", "there"]);
  });

  it("reads the spoken half of a role-prefixed line", () => {
    const prefixed = buildScriptWordMap([{ id: "x", label: "A1", content: "ANCHOR: Good Morning PALY!" }]);
    expect(prefixed.words.map((word) => word.raw)).toEqual(["Good", "Morning", "PALY!"]);
    expect(prefixed.words[0]?.lineIndex).toBe(0);
  });

  it("normalizes each word for matching", () => {
    const date = map.words.filter((word) => word.sectionId === "s1").slice(5, 9);
    expect(date.map((word) => word.tokens)).toEqual([
      ["friday"],
      ["october"],
      ["twenty", "third"],
      ["twenty", "twenty", "six"]
    ]);
    const handle = map.words.find((word) => word.raw === "@infocusnews");
    expect(handle?.tokens).toEqual(["at", "in", "focus", "news"]);
  });

  it("uses the line numbers run mode renders (after the beat heading is removed)", () => {
    for (const section of sections) {
      const lines = getSectionDisplayParts(section).content.split(/\r?\n/);
      for (const word of map.words.filter((entry) => entry.sectionId === section.id)) {
        expect(lines[word.lineIndex]).toContain(word.raw);
      }
    }
  });

  it("gives each spoken line parts that rebuild the line's text", () => {
    const section = sections[4];
    const lines = getSectionDisplayParts(section).content.split(/\r?\n/);
    const lineIndex = lines.findIndex((line) => line.startsWith("Follow us"));
    const parts = map.lineParts.get(scriptLineKey(section.id, lineIndex)) ?? [];
    expect(parts.map((part) => part.text).join("")).toBe(lines[lineIndex]);
    expect(parts.filter((part) => part.wordIndex !== null).length).toBeGreaterThan(30);
  });

  it("keeps red and yellow markup on the words, without the tags", () => {
    const styled = buildScriptWordMap([{ id: "x", label: "A1", content: "Go [RED]big Vikings[/RED]!" }]);
    const parts = styled.lineParts.get(scriptLineKey("x", 0)) ?? [];
    expect(parts.map((part) => part.text).join("")).toBe("Go big Vikings!");
    expect(parts.filter((part) => part.tone === "red").map((part) => part.text)).toEqual(["big", " ", "Vikings"]);
    expect(styled.words.map((word) => word.raw)).toEqual(["Go", "big", "Vikings"]);
  });

  it("does not number punctuation-only words", () => {
    const dashed = buildScriptWordMap([{ id: "x", label: "A1", content: "Robots — and more" }]);
    expect(dashed.words.map((word) => word.raw)).toEqual(["Robots", "and", "more"]);
    const parts = dashed.lineParts.get(scriptLineKey("x", 0)) ?? [];
    expect(parts.find((part) => part.text === "—")?.wordIndex).toBeNull();
  });

  it("splits sections into blocks at camera lines", () => {
    const a2 = map.blocks.filter((block) => block.sectionId === "s2");
    expect(a2).toHaveLength(3);
    expect(a2.map((block) => map.words[block.firstWordIndex]?.raw)).toEqual(["College", "Spirit", "Robot"]);
    const a3 = map.blocks.filter((block) => block.sectionId === "s3");
    expect(a3).toHaveLength(1);
    for (const word of map.words) {
      const block = map.blocks.find((entry) => entry.id === word.blockId);
      expect(block).toBeDefined();
      expect(word.index).toBeGreaterThanOrEqual(block?.firstWordIndex ?? Infinity);
      expect(word.index).toBeLessThanOrEqual(block?.lastWordIndex ?? -1);
    }
  });

  it("flags lines that say prompter, so reading them can never be a command", () => {
    const flagged = buildScriptWordMap([
      { id: "x", label: "A1", content: "Hey Prompter, meet the new teleprompter.\nNothing to see here." }
    ]);
    expect(flagged.words.filter((word) => word.mentionsPrompter).map((word) => word.raw)).toEqual([
      "Hey",
      "Prompter,",
      "meet",
      "the",
      "new",
      "teleprompter."
    ]);
    expect(map.words.some((word) => word.mentionsPrompter)).toBe(false);
  });
});

describe("reading line", () => {
  const map = buildScriptWordMap([
    { id: "a", label: "A1", content: "One two\nCAM 2\nThree four" },
    { id: "b", label: "A2", content: "Five six" }
  ]);

  it("finds the section and line of the cursor word", () => {
    expect(readingLineOf(map, 2)).toEqual({ sectionIndex: 0, lineIndex: 2 });
    expect(readingLineOf(map, 4)).toEqual({ sectionIndex: 1, lineIndex: 0 });
    expect(readingLineOf(map, null)).toBeNull();
    expect(readingLineOf(map, 99)).toBeNull();
  });

  it("dims every line above the reading line and nothing below it", () => {
    const reading = { sectionIndex: 1, lineIndex: 3 };
    expect(readLinesBefore(0, reading)).toBe(Infinity);
    expect(readLinesBefore(1, reading)).toBe(3);
    expect(readLinesBefore(2, reading)).toBe(0);
    expect(readLinesBefore(0, null)).toBe(0);
  });
});
