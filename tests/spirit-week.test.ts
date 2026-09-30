import { describe, expect, it } from "vitest";
import { spiritWeekRecapToss, spiritWeekTheme } from "@/src/lib/spirit-week";

describe("spirit week", () => {
  it("returns each weekday's theme and null outside Spirit Week", () => {
    expect(spiritWeekTheme("2026-10-05")).toBe("Class themes");
    expect(spiritWeekTheme("2026-10-06")).toBe("Salad dressing");
    expect(spiritWeekTheme("2026-10-09")).toBe("Class colors");
    expect(spiritWeekTheme("2026-10-12")).toBeNull();
  });

  it("tosses a Day N recap with the previous day's theme", () => {
    expect(spiritWeekRecapToss("Spirit Week Day 2 Recap")).toBe(
      "Yesterday's theme was Salad dressing - let's watch the InFocus Spirit Week Day 2 recap."
    );
    expect(spiritWeekRecapToss("Spirit Week Day 1 Recap")).toContain("Class themes");
  });

  it("tosses the overall recap without a theme and ignores other shows", () => {
    expect(spiritWeekRecapToss("Spirit Week Overall Recap")).toBe(
      "Let's watch the InFocus Spirit Week Overall Recap."
    );
    expect(spiritWeekRecapToss("")).toBeNull();
    expect(spiritWeekRecapToss("Homecoming Special")).toBeNull();
  });
});
