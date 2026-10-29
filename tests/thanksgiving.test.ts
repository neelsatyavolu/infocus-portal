import { describe, expect, it } from "vitest";
import {
  DEFAULT_THANKSGIVING_PREFS,
  isThanksgivingDay,
  isThanksgivingOn,
  isThanksgivingSeason,
  matchThanksgivingSecret,
  parseThanksgivingPrefs,
  THANKSGIVING_INIT_SCRIPT
} from "@/src/lib/thanksgiving";
import { isHalloweenSeason } from "@/src/lib/halloween";

describe("isThanksgivingSeason", () => {
  it("runs from November 1 through November 30", () => {
    expect(isThanksgivingSeason(new Date(2026, 9, 31, 23, 59))).toBe(false);
    expect(isThanksgivingSeason(new Date(2026, 10, 1, 0, 0))).toBe(true);
    expect(isThanksgivingSeason(new Date(2026, 10, 26))).toBe(true);
    expect(isThanksgivingSeason(new Date(2026, 10, 30, 23, 59))).toBe(true);
    expect(isThanksgivingSeason(new Date(2026, 11, 1, 0, 0))).toBe(false);
  });

  it("never overlaps Halloween, and takes over the day after it", () => {
    for (let day = 1; day <= 31; day += 1) {
      const date = new Date(2026, 9, day);
      expect(isHalloweenSeason(date) && isThanksgivingSeason(date)).toBe(false);
    }
    expect(isHalloweenSeason(new Date(2026, 9, 31))).toBe(true);
    expect(isThanksgivingSeason(new Date(2026, 10, 1))).toBe(true);
  });
});

describe("isThanksgivingDay", () => {
  it("is the fourth Thursday of November", () => {
    expect(isThanksgivingDay(new Date(2026, 10, 26))).toBe(true);
    expect(isThanksgivingDay(new Date(2027, 10, 25))).toBe(true);
    expect(isThanksgivingDay(new Date(2028, 10, 23))).toBe(true);
    expect(isThanksgivingDay(new Date(2026, 10, 19))).toBe(false);
    expect(isThanksgivingDay(new Date(2026, 10, 27))).toBe(false);
  });
});

describe("isThanksgivingOn", () => {
  const october = new Date(2026, 9, 28);
  const november = new Date(2026, 10, 5);

  it("is on in season, or out of season while previewing, unless turned off", () => {
    expect(isThanksgivingOn(DEFAULT_THANKSGIVING_PREFS, november)).toBe(true);
    expect(isThanksgivingOn(DEFAULT_THANKSGIVING_PREFS, october)).toBe(false);
    expect(isThanksgivingOn({ ...DEFAULT_THANKSGIVING_PREFS, preview: true }, october)).toBe(true);
    expect(isThanksgivingOn({ ...DEFAULT_THANKSGIVING_PREFS, preview: true, off: true }, october)).toBe(false);
    expect(isThanksgivingOn({ ...DEFAULT_THANKSGIVING_PREFS, off: true }, november)).toBe(false);
  });
});

describe("parseThanksgivingPrefs", () => {
  it("falls back to the defaults for missing or broken values", () => {
    expect(parseThanksgivingPrefs(null)).toEqual(DEFAULT_THANKSGIVING_PREFS);
    expect(parseThanksgivingPrefs("not json")).toEqual(DEFAULT_THANKSGIVING_PREFS);
    expect(parseThanksgivingPrefs("null")).toEqual(DEFAULT_THANKSGIVING_PREFS);
  });

  it("keeps only real booleans and a whole, positive count", () => {
    expect(parseThanksgivingPrefs('{"off":true,"muted":true,"turkeyOff":true,"preview":true,"leaves":7,"pies":3}')).toEqual({
      off: true,
      muted: true,
      turkeyOff: true,
      preview: true,
      leaves: 7,
      pies: 3
    });
    expect(parseThanksgivingPrefs('{"preview":"yes","leaves":-2,"pies":2.9}')).toEqual({ ...DEFAULT_THANKSGIVING_PREFS, pies: 2 });
  });
});

describe("matchThanksgivingSecret", () => {
  const typed = (text: string) => text.split("");

  it("finds a secret word as soon as its last letter is typed", () => {
    expect(matchThanksgivingSecret(typed("xgobble"))).toBe("gobble");
    expect(matchThanksgivingSecret(typed("pie"))).toBe("pie");
    expect(matchThanksgivingSecret(typed("thanks"))).toBe("thanks");
    expect(matchThanksgivingSecret(typed("gobbl"))).toBeNull();
    expect(matchThanksgivingSecret(typed("pies"))).toBeNull();
  });
});

describe("THANKSGIVING_INIT_SCRIPT", () => {
  function run(now: Date, stored: string | null, initial: string[] = []) {
    const classes = new Set<string>(initial);
    const fakeDate = class extends Date {
      constructor() {
        super(now.getTime());
      }
    };
    const fn = new Function("Date", "localStorage", "document", THANKSGIVING_INIT_SCRIPT);
    fn(fakeDate, { getItem: () => stored }, {
      documentElement: { classList: { add: (c: string) => classes.add(c), remove: (c: string) => classes.delete(c) } }
    });
    return classes;
  }

  it("adds the class in November unless this browser turned it off", () => {
    expect(run(new Date(2026, 10, 5), null).has("thanksgiving")).toBe(true);
    expect(run(new Date(2026, 10, 5), '{"off":true}').has("thanksgiving")).toBe(false);
    expect(run(new Date(2026, 10, 5), "broken").has("thanksgiving")).toBe(true);
    expect(run(new Date(2026, 11, 1), null).has("thanksgiving")).toBe(false);
  });

  it("previews out of season and moves Halloween aside", () => {
    const classes = run(new Date(2026, 9, 28), '{"preview":true}', ["halloween"]);
    expect(classes.has("thanksgiving")).toBe(true);
    expect(classes.has("halloween")).toBe(false);
    expect(run(new Date(2026, 9, 28), null, ["halloween"]).has("halloween")).toBe(true);
  });
});
