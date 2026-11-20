import { describe, expect, it } from "vitest";
import {
  CHRISTMAS_INIT_SCRIPT,
  daysUntilChristmas,
  DEFAULT_CHRISTMAS_PREFS,
  isChristmasDay,
  isChristmasEve,
  isChristmasOn,
  isChristmasSeason,
  matchChristmasSecret,
  needsChristmasWelcome,
  parseChristmasPrefs
} from "@/src/lib/christmas";
import { isThanksgivingSeason } from "@/src/lib/thanksgiving";

describe("isChristmasSeason", () => {
  it("runs from November 29 through December 31", () => {
    expect(isChristmasSeason(new Date(2026, 10, 28, 23, 59))).toBe(false);
    expect(isChristmasSeason(new Date(2026, 10, 29, 0, 0))).toBe(true);
    expect(isChristmasSeason(new Date(2026, 10, 30, 23, 59))).toBe(true);
    expect(isChristmasSeason(new Date(2026, 11, 1, 0, 0))).toBe(true);
    expect(isChristmasSeason(new Date(2026, 9, 29))).toBe(false);
    expect(isChristmasSeason(new Date(2026, 11, 31, 23, 59))).toBe(true);
    expect(isChristmasSeason(new Date(2027, 0, 1, 0, 0))).toBe(false);
  });

  it("takes over the last two days of Thanksgiving's November", () => {
    expect(isThanksgivingSeason(new Date(2026, 10, 28))).toBe(true);
    expect(isChristmasSeason(new Date(2026, 10, 28))).toBe(false);
    expect(isThanksgivingSeason(new Date(2026, 10, 29))).toBe(true);
    expect(isChristmasSeason(new Date(2026, 10, 29))).toBe(true);
  });
});

describe("Christmas Eve, Christmas Day and the countdown", () => {
  it("knows the Eve and the Day", () => {
    expect(isChristmasEve(new Date(2026, 11, 24))).toBe(true);
    expect(isChristmasDay(new Date(2026, 11, 25))).toBe(true);
    expect(isChristmasEve(new Date(2026, 11, 25))).toBe(false);
    expect(isChristmasDay(new Date(2026, 10, 25))).toBe(false);
  });

  it("counts whole days to December 25, ignoring the time of day", () => {
    expect(daysUntilChristmas(new Date(2026, 11, 1, 23, 30))).toBe(24);
    expect(daysUntilChristmas(new Date(2026, 11, 24, 0, 5))).toBe(1);
    expect(daysUntilChristmas(new Date(2026, 11, 25, 12))).toBe(0);
    expect(daysUntilChristmas(new Date(2026, 11, 26))).toBe(-1);
    // Across the March daylight-saving change, still whole days.
    expect(daysUntilChristmas(new Date(2026, 2, 1))).toBe(299);
  });
});

describe("needsChristmasWelcome", () => {
  const december = new Date(2026, 11, 1);

  it("shows once per browser each year", () => {
    expect(needsChristmasWelcome(null, december)).toBe(true);
    expect(needsChristmasWelcome("2025", december)).toBe(true);
    expect(needsChristmasWelcome("2026", december)).toBe(false);
  });
});

describe("parseChristmasPrefs and isChristmasOn", () => {
  it("falls back to the defaults on missing or broken storage", () => {
    expect(parseChristmasPrefs(null)).toEqual(DEFAULT_CHRISTMAS_PREFS);
    expect(parseChristmasPrefs("not json")).toEqual(DEFAULT_CHRISTMAS_PREFS);
    expect(parseChristmasPrefs("null")).toEqual(DEFAULT_CHRISTMAS_PREFS);
  });

  it("keeps only real switches and whole positive counts", () => {
    expect(parseChristmasPrefs('{"off":"yes","muted":true,"snowOff":true,"preview":1,"gifts":12.7,"treats":-3}')).toEqual({
      off: false,
      muted: true,
      snowOff: true,
      preview: false,
      gifts: 12,
      treats: 0
    });
  });

  it("is on in season or while previewing, unless turned off", () => {
    const november = new Date(2026, 10, 20);
    const december = new Date(2026, 11, 10);
    expect(isChristmasOn(DEFAULT_CHRISTMAS_PREFS, december)).toBe(true);
    expect(isChristmasOn(DEFAULT_CHRISTMAS_PREFS, november)).toBe(false);
    expect(isChristmasOn({ ...DEFAULT_CHRISTMAS_PREFS, preview: true }, november)).toBe(true);
    expect(isChristmasOn({ ...DEFAULT_CHRISTMAS_PREFS, preview: true, off: true }, november)).toBe(false);
    expect(isChristmasOn({ ...DEFAULT_CHRISTMAS_PREFS, off: true }, december)).toBe(false);
  });
});

describe("matchChristmasSecret", () => {
  const typed = (word: string) => [..."xyz", ...word];

  it("finds each secret at the end of what was typed", () => {
    expect(matchChristmasSecret(typed("snow"))).toBe("snow");
    expect(matchChristmasSecret(typed("santa"))).toBe("santa");
    expect(matchChristmasSecret(typed("jingle"))).toBe("jingle");
    expect(matchChristmasSecret(typed("gift"))).toBe("gift");
    expect(matchChristmasSecret(typed("merry"))).toBe("merry");
    expect(matchChristmasSecret(typed("rudolph"))).toBe("rudolph");
    expect(matchChristmasSecret(typed("sant"))).toBeNull();
    expect(matchChristmasSecret(typed("snowy"))).toBeNull();
  });
});

describe("CHRISTMAS_INIT_SCRIPT", () => {
  function run(now: Date, stored: string | null, initial: string[] = []) {
    const classes = new Set<string>(initial);
    const fakeDate = class extends Date {
      constructor() {
        super(now.getTime());
      }
    };
    const fn = new Function("Date", "localStorage", "document", CHRISTMAS_INIT_SCRIPT);
    fn(fakeDate, { getItem: () => stored }, {
      documentElement: { classList: { add: (c: string) => classes.add(c), remove: (c: string) => classes.delete(c) } }
    });
    return classes;
  }

  it("adds the class from November 29 unless this browser turned it off", () => {
    expect(run(new Date(2026, 10, 29), null, ["thanksgiving"]).has("christmas")).toBe(true);
    expect(run(new Date(2026, 10, 29), null, ["thanksgiving"]).has("thanksgiving")).toBe(false);
    expect(run(new Date(2026, 10, 28), null, ["thanksgiving"]).has("christmas")).toBe(false);
    expect(run(new Date(2026, 11, 5), null).has("christmas")).toBe(true);
    expect(run(new Date(2026, 11, 5), '{"off":true}').has("christmas")).toBe(false);
    expect(run(new Date(2026, 11, 5), "broken").has("christmas")).toBe(true);
    expect(run(new Date(2027, 0, 1), null).has("christmas")).toBe(false);
  });

  it("previews out of season and moves Thanksgiving and Halloween aside", () => {
    const classes = run(new Date(2026, 10, 20), '{"preview":true}', ["thanksgiving", "halloween"]);
    expect(classes.has("christmas")).toBe(true);
    expect(classes.has("thanksgiving")).toBe(false);
    expect(classes.has("halloween")).toBe(false);
    expect(run(new Date(2026, 10, 20), null, ["thanksgiving"]).has("thanksgiving")).toBe(true);
  });
});
