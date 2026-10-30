import { describe, expect, it } from "vitest";
import { birthdayLabel, isValidBirthday, placeBirthdays } from "@/src/lib/birthdays";

/** Weekdays are class days, except the listed days off. */
function classDays(daysOff: string[] = []) {
  const off = new Set(daysOff);
  return (dateKey: string) => {
    const weekday = new Date(`${dateKey}T00:00:00.000Z`).getUTCDay();
    return weekday !== 0 && weekday !== 6 && !off.has(dateKey);
  };
}

describe("isValidBirthday", () => {
  it("accepts real month and day pairs, including February 29", () => {
    expect(isValidBirthday(1, 31)).toBe(true);
    expect(isValidBirthday(2, 29)).toBe(true);
  });

  it("rejects days a month doesn't have", () => {
    expect(isValidBirthday(2, 30)).toBe(false);
    expect(isValidBirthday(4, 31)).toBe(false);
    expect(isValidBirthday(13, 1)).toBe(false);
    expect(isValidBirthday(0, 1)).toBe(false);
    expect(isValidBirthday(5, 0)).toBe(false);
    expect(isValidBirthday(5, 1.5)).toBe(false);
  });
});

describe("placeBirthdays", () => {
  const november = { startKey: "2026-11-01", endKey: "2026-12-01" };

  it("puts a class-day birthday on its own date", () => {
    const placed = placeBirthdays({ people: [{ name: "Abby", month: 11, day: 4 }], ...november, isClassDay: classDays() });
    expect(placed).toEqual({ "2026-11-04": [{ name: "Abby", actualDate: null }] });
  });

  it("moves a weekend birthday back to Friday", () => {
    const placed = placeBirthdays({ people: [{ name: "Otto", month: 11, day: 8 }], ...november, isClassDay: classDays() });
    expect(placed).toEqual({ "2026-11-06": [{ name: "Otto", actualDate: "2026-11-08" }] });
  });

  it("moves a birthday over a break to the last class day before it", () => {
    const placed = placeBirthdays({
      people: [{ name: "Sage", month: 11, day: 25 }],
      ...november,
      isClassDay: classDays(["2026-11-23", "2026-11-24", "2026-11-25", "2026-11-26", "2026-11-27"])
    });
    expect(placed).toEqual({ "2026-11-20": [{ name: "Sage", actualDate: "2026-11-25" }] });
  });

  it("shows next month's birthday in this month when it moves back across the line", () => {
    // Sunday, November 1, 2026 → Friday, October 30.
    const people = [{ name: "Abby", month: 11, day: 1 }];
    expect(placeBirthdays({ people, startKey: "2026-10-01", endKey: "2026-11-01", isClassDay: classDays() })).toEqual({
      "2026-10-30": [{ name: "Abby", actualDate: "2026-11-01" }]
    });
    expect(placeBirthdays({ people, ...november, isClassDay: classDays() })).toEqual({});
  });

  it("carries January birthdays back into December across the new year", () => {
    const placed = placeBirthdays({
      people: [{ name: "Otto", month: 1, day: 2 }],
      startKey: "2026-12-01",
      endKey: "2027-01-01",
      isClassDay: classDays(["2026-12-21", "2026-12-22", "2026-12-23", "2026-12-24", "2026-12-25", "2026-12-28", "2026-12-29", "2026-12-30", "2026-12-31", "2027-01-01"])
    });
    expect(placed).toEqual({ "2026-12-18": [{ name: "Otto", actualDate: "2027-01-02" }] });
  });

  it("celebrates February 29 on February 28 outside leap years", () => {
    const placed = placeBirthdays({
      people: [{ name: "Sage", month: 2, day: 29 }],
      startKey: "2027-02-01",
      endKey: "2027-03-01",
      isClassDay: classDays()
    });
    // Sunday, February 28, 2027 → Friday, February 26.
    expect(placed).toEqual({ "2027-02-26": [{ name: "Sage", actualDate: "2027-02-28" }] });
  });

  it("lists everyone sharing a day in name order", () => {
    const placed = placeBirthdays({
      people: [
        { name: "Sage", month: 11, day: 6 },
        { name: "Abby", month: 11, day: 7 }
      ],
      ...november,
      isClassDay: classDays()
    });
    expect(placed["2026-11-06"].map((entry) => entry.name)).toEqual(["Abby", "Sage"]);
  });

  it("skips a birthday it finds no class day for", () => {
    const placed = placeBirthdays({ people: [{ name: "Abby", month: 11, day: 4 }], ...november, isClassDay: () => false });
    expect(placed).toEqual({});
  });
});

describe("birthdayLabel", () => {
  it("is the name on the day itself, and adds the real date when it moved", () => {
    expect(birthdayLabel({ name: "Abby", actualDate: null })).toBe("Abby");
    expect(birthdayLabel({ name: "Otto", actualDate: "2026-11-08" })).toBe("Otto (Sun, Nov 8)");
  });
});
