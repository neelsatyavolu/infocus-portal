import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(path.join(__dirname, "../components/story-maker/story-maker.css"), "utf8");

describe("story-maker.css", () => {
  // The artwork and the Custom editor share one global stylesheet. A class defined twice leaks
  // editor chrome into exported stories (the footer handle once rendered as a resize handle).
  it("defines each top-level class rule once", () => {
    const rules = [...css.matchAll(/^(\.sm-[a-z0-9-]+)\s*\{/gm)].map((match) => match[1]);
    const duplicates = rules.filter((rule, index) => rules.indexOf(rule) !== index);
    expect(duplicates).toEqual([]);
  });
});
