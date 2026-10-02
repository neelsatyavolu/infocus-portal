import { describe, expect, it } from "vitest";
import { spiritWeekCrewRoles, spiritWeekDaysIn, spiritWeekRecapToss, spiritWeekTheme } from "@/src/lib/spirit-week";

describe("spirit week", () => {
  it("gives brunch filmers only on Monday and Friday, plus night rally filmers on Wednesday", () => {
    expect(spiritWeekCrewRoles("2026-10-05")).toEqual(["Brunch Filmers", "Lunch Filmers", "Editors"]);
    expect(spiritWeekCrewRoles("2026-10-06")).toEqual(["Lunch Filmers", "Editors"]);
    expect(spiritWeekCrewRoles("2026-10-07")).toEqual(["Lunch Filmers", "Night Rally Filmers", "Editors"]);
    expect(spiritWeekCrewRoles("2026-10-08")).toEqual(["Lunch Filmers", "Editors"]);
    expect(spiritWeekCrewRoles("2026-10-09")).toEqual(["Brunch Filmers", "Lunch Filmers", "Editors"]);
    expect(spiritWeekCrewRoles("2026-10-12")).toEqual([]);
  });

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

describe("spiritWeekDaysIn", () => {
  it("lists only the Spirit Week days among the dates, with their crew lists", () => {
    expect(spiritWeekDaysIn(["2026-10-02", "2026-10-07", "2026-10-09"])).toEqual({
      "2026-10-07": { theme: "Green & white/Paly spirit", crewRoles: ["Lunch Filmers", "Night Rally Filmers", "Editors"] },
      "2026-10-09": { theme: "Class colors", crewRoles: ["Brunch Filmers", "Lunch Filmers", "Editors"] }
    });
    expect(spiritWeekDaysIn(["2026-11-02"])).toEqual({});
  });
});
