import { describe, expect, it } from "vitest";
import { parseAssistantReply, splitInlineBold } from "@/src/lib/assistant-format";

describe("parseAssistantReply", () => {
  it("turns markdown bullets and bold into blocks and drops tool leftovers", () => {
    const blocks = parseAssistantReply(
      "**Groups** is where producers review packages.\n\n- Tiles show the topic and members 【read_doc】\n- Click a tile to open the stage that needs you\n\n`DRAFT` stays internal."
    );
    expect(blocks[0]).toEqual({
      type: "p",
      text: "**Groups** is where producers review packages."
    });
    expect(blocks[1]).toEqual({
      type: "ul",
      items: ["Tiles show the topic and members", "Click a tile to open the stage that needs you"]
    });
    expect(blocks[2]).toEqual({ type: "p", text: "DRAFT stays internal." });
  });
});

describe("splitInlineBold", () => {
  it("does not leave leftover asterisks from nested or extra bold markers", () => {
    expect(splitInlineBold("**View or manage the **Publishing Queue****")).toEqual([
      { bold: true, text: "View or manage the " },
      { bold: false, text: "Publishing Queue" }
    ]);
    expect(splitInlineBold("Publishing Queue****")).toEqual([{ bold: false, text: "Publishing Queue" }]);
  });
});
