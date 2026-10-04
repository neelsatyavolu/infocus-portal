import { describe, expect, it } from "vitest";
import { CHIME_THROTTLE_MS, chimeRoster, rosterChange, shouldChime } from "@/src/lib/meetings/client/chimes";

const p = (uid: string, isScribe = false) => ({ uid, isScribe });

describe("chime rules", () => {
  it("ignores yourself and the scribe", () => {
    expect([...chimeRoster([p("me"), p("abby"), p("scribe", true)], "me")]).toEqual(["abby"]);
  });

  it("detects joins and leaves, join first", () => {
    const before = new Set(["abby"]);
    expect(rosterChange(before, new Set(["abby", "otto"]))).toBe("join");
    expect(rosterChange(before, new Set())).toBe("leave");
    expect(rosterChange(before, new Set(["otto"]))).toBe("join");
    expect(rosterChange(before, new Set(["abby"]))).toBeNull();
  });

  it("throttles, respects the setting and stays quiet in big calls", () => {
    const base = { enabled: true, peopleCount: 4, now: 10_000, lastAt: null };
    expect(shouldChime(base)).toBe(true);
    expect(shouldChime({ ...base, lastAt: 10_000 - CHIME_THROTTLE_MS + 1 })).toBe(false);
    expect(shouldChime({ ...base, lastAt: 10_000 - CHIME_THROTTLE_MS })).toBe(true);
    expect(shouldChime({ ...base, enabled: false })).toBe(false);
    expect(shouldChime({ ...base, peopleCount: 11 })).toBe(false);
    expect(shouldChime({ ...base, peopleCount: 10 })).toBe(true);
  });
});
