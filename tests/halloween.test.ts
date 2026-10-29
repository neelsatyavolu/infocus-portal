import { describe, expect, it } from "vitest";
import {
  DEFAULT_HALLOWEEN_PREFS,
  HALLOWEEN_INIT_SCRIPT,
  isHalloweenDay,
  isHalloweenSeason,
  KONAMI,
  matchHalloweenSecret,
  parseHalloweenPrefs
} from "@/src/lib/halloween";

describe("isHalloweenSeason", () => {
  it("runs from October 15 through October 31", () => {
    expect(isHalloweenSeason(new Date(2026, 9, 14, 23, 59))).toBe(false);
    expect(isHalloweenSeason(new Date(2026, 9, 15, 0, 0))).toBe(true);
    expect(isHalloweenSeason(new Date(2026, 9, 26))).toBe(true);
    expect(isHalloweenSeason(new Date(2026, 9, 31, 23, 59))).toBe(true);
    expect(isHalloweenSeason(new Date(2026, 10, 1, 0, 0))).toBe(false);
  });

  it("is off the rest of the year", () => {
    expect(isHalloweenSeason(new Date(2026, 0, 15))).toBe(false);
    expect(isHalloweenSeason(new Date(2026, 8, 30))).toBe(false);
    expect(isHalloweenSeason(new Date(2026, 11, 25))).toBe(false);
  });
});

describe("isHalloweenDay", () => {
  it("is only October 31", () => {
    expect(isHalloweenDay(new Date(2026, 9, 31))).toBe(true);
    expect(isHalloweenDay(new Date(2026, 9, 30))).toBe(false);
    expect(isHalloweenDay(new Date(2026, 10, 1))).toBe(false);
  });
});

describe("parseHalloweenPrefs", () => {
  it("falls back to the defaults for missing or broken values", () => {
    expect(parseHalloweenPrefs(null)).toEqual(DEFAULT_HALLOWEEN_PREFS);
    expect(parseHalloweenPrefs("not json")).toEqual(DEFAULT_HALLOWEEN_PREFS);
    expect(parseHalloweenPrefs("null")).toEqual(DEFAULT_HALLOWEEN_PREFS);
  });

  it("keeps only real booleans and a whole, positive count", () => {
    expect(parseHalloweenPrefs('{"off":true,"muted":true,"musicOff":true,"scaresOff":true,"hauntsOff":true,"smashed":7,"candy":12}')).toEqual({
      off: true,
      muted: true,
      musicOff: true,
      scaresOff: true,
      hauntsOff: true,
      smashed: 7,
      candy: 12
    });
    expect(parseHalloweenPrefs('{"off":"yes","muted":1,"musicOff":"no","scaresOff":0,"hauntsOff":"on","smashed":-3,"candy":-1}')).toEqual(
      DEFAULT_HALLOWEEN_PREFS
    );
    expect(parseHalloweenPrefs('{"smashed":4.8}').smashed).toBe(4);
    expect(parseHalloweenPrefs('{"smashed":"lots"}').smashed).toBe(0);
    expect(parseHalloweenPrefs('{"smashed":3}').candy).toBe(0);
  });
});

describe("matchHalloweenSecret", () => {
  const typed = (text: string) => text.split("");

  it("finds a secret word as soon as its last letter is typed", () => {
    expect(matchHalloweenSecret(typed("xboo"))).toBe("boo");
    expect(matchHalloweenSecret(typed("treat"))).toBe("treat");
    expect(matchHalloweenSecret(typed("aatrick"))).toBe("trick");
    expect(matchHalloweenSecret(typed("bo"))).toBeNull();
    expect(matchHalloweenSecret(typed("tricky"))).toBeNull();
  });

  it("finds the Konami code, and ignores it with a wrong key in the middle", () => {
    expect(matchHalloweenSecret(["x", ...KONAMI])).toBe("konami");
    expect(matchHalloweenSecret([...KONAMI.slice(0, 4), "x", ...KONAMI.slice(5)])).toBeNull();
  });
});

describe("HALLOWEEN_INIT_SCRIPT", () => {
  function run(now: Date, stored: string | null) {
    const classes = new Set<string>();
    const fakeDate = class extends Date {
      constructor() {
        super(now.getTime());
      }
    };
    const fn = new Function("Date", "localStorage", "document", HALLOWEEN_INIT_SCRIPT);
    fn(fakeDate, { getItem: () => stored }, { documentElement: { classList: { add: (c: string) => classes.add(c) } } });
    return classes.has("halloween");
  }

  it("adds the class in season unless this browser turned it off", () => {
    expect(run(new Date(2026, 9, 26), null)).toBe(true);
    expect(run(new Date(2026, 9, 26), '{"off":true}')).toBe(false);
    expect(run(new Date(2026, 9, 26), "broken")).toBe(true);
  });

  it("matches isHalloweenSeason at the edges", () => {
    for (const date of [new Date(2026, 9, 14), new Date(2026, 9, 15), new Date(2026, 9, 31), new Date(2026, 10, 1)]) {
      expect(run(date, null)).toBe(isHalloweenSeason(date));
    }
  });
});
