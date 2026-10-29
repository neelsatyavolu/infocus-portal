import { describe, expect, it } from "vitest";
import { buildClassBoardSlackText } from "@/src/lib/class-board-slack";

describe("buildClassBoardSlackText", () => {
  it("is the cycle heading and the board link, no packages listed", () => {
    const text = buildClassBoardSlackText({ cycleNumber: 2, boardUrl: "https://example.edu/class-board" });
    expect(text).toBe(["*Cycle 2 Progress*", "<https://example.edu/class-board|See the full board>"].join("\n"));
  });
});
