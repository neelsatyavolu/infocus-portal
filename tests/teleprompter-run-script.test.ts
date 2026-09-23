import { describe, expect, it } from "vitest";
import {
  classifyRunScriptLine,
  formatRunCueLabel,
  getSectionDisplayParts
} from "@/src/lib/teleprompter-run-script";

describe("formatRunCueLabel", () => {
  it("strips braces and brackets", () => {
    expect(formatRunCueLabel("{ROLL INTRO}")).toBe("ROLL INTRO");
    expect(formatRunCueLabel("{HOLD}")).toBe("HOLD");
    expect(formatRunCueLabel("[ANCHOR]")).toBe("ANCHOR");
  });

  it("normalizes co-anchor spellings", () => {
    expect(formatRunCueLabel("{COANCHOR}")).toBe("COANCHOR");
    expect(formatRunCueLabel("{CO ANCHOR}")).toBe("COANCHOR");
    expect(formatRunCueLabel("[CO-ANCHOR]")).toBe("COANCHOR");
    expect(formatRunCueLabel("CO ANCHOR")).toBe("COANCHOR");
  });
});

describe("classifyRunScriptLine", () => {
  it("treats blank lines as gaps", () => {
    expect(classifyRunScriptLine("")).toEqual({ kind: "gap" });
    expect(classifyRunScriptLine("   ")).toEqual({ kind: "gap" });
  });

  it("keeps camera lines as large white cues", () => {
    expect(classifyRunScriptLine("CAM 2")).toEqual({ kind: "camera", text: "CAM 2" });
    expect(classifyRunScriptLine("cam 3")).toEqual({ kind: "camera", text: "CAM 3" });
  });

  it("classifies Rundown-style production cues", () => {
    expect(classifyRunScriptLine("{ROLL INTRO}")).toEqual({ kind: "cue", text: "ROLL INTRO" });
    expect(classifyRunScriptLine("{HOLD}")).toEqual({ kind: "cue", text: "HOLD" });
    expect(classifyRunScriptLine("{ANCHOR}")).toEqual({ kind: "cue", text: "ANCHOR" });
    expect(classifyRunScriptLine("{COANCHOR}")).toEqual({ kind: "cue", text: "COANCHOR" });
    expect(classifyRunScriptLine("[CO-ANCHOR]")).toEqual({ kind: "cue", text: "COANCHOR" });
    expect(classifyRunScriptLine("ANCHOR")).toEqual({ kind: "cue", text: "ANCHOR" });
  });

  it("splits role prefixes into a cue plus spoken copy", () => {
    expect(classifyRunScriptLine("ANCHOR: Good Morning PALY!")).toEqual({
      kind: "cue",
      text: "ANCHOR",
      spoken: "Good Morning PALY!"
    });
  });

  it("leaves spoken copy unhighlighted", () => {
    expect(classifyRunScriptLine("Good Morning PALY!")).toEqual({
      kind: "spoken",
      text: "Good Morning PALY!"
    });
  });
});

describe("getSectionDisplayParts", () => {
  it("strips default rundown beat titles from the script body", () => {
    expect(
      getSectionDisplayParts({
        label: "A1",
        content: "OPEN\n\n{ROLL INTRO}\nGood Morning PALY!"
      })
    ).toEqual({
      badgeLabel: "A1 - Open",
      content: "{ROLL INTRO}\nGood Morning PALY!"
    });
  });

  it("keeps pasted spoken copy, including the first sentence", () => {
    const content =
      "Hey Viking parents! My name is Katie Kim and I am the ASB President.\n\nI have a few announcements from Asb:";

    expect(getSectionDisplayParts({ label: "A1", content })).toEqual({
      badgeLabel: "A1",
      content
    });
  });

  it("does not treat camera or cue lines as section titles", () => {
    const content = "CAM 2\n{ANCHOR}\nGood Morning PALY!";
    expect(getSectionDisplayParts({ label: "A1", content })).toEqual({
      badgeLabel: "A1",
      content
    });
  });
});
