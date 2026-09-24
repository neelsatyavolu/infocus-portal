import { describe, expect, it } from "vitest";
import { buildPaScript, nextPaDate, paTimeLabel, refreshPaNames, resolvePaPeople } from "@/src/lib/pa-script";

describe("PA schedule", () => {
  it("does not generate scripts outside the supported school year", () => {
    expect(nextPaDate(new Date("2027-06-04T17:00:00Z"))).toBeNull();
    expect(nextPaDate(new Date("2026-08-01T17:00:00Z"))).toBe("2026-08-17");
  });
  it("keeps the current Monday through the end of the Los Angeles day", () => {
    expect(nextPaDate(new Date("2026-09-15T06:59:00Z"))).toBe("2026-09-14");
    expect(nextPaDate(new Date("2026-09-15T07:00:00Z"))).toBe("2026-09-21");
  });
  it("skips holidays and respects manual PA and cancellation overrides", () => {
    expect(nextPaDate(new Date("2026-09-07T17:00:00Z"))).toBe("2026-09-14");
    expect(nextPaDate(new Date("2026-11-20T17:00:00Z"))).toBe("2026-11-30");
    const overrides = new Map([
      ["2026-09-14", { kind: "NONE" as const }],
      ["2026-09-15", { kind: "PA" as const }]
    ]);
    expect(nextPaDate(new Date("2026-09-09T17:00:00Z"), overrides)).toBe("2026-09-15");
  });
});

describe("PA script", () => {
  it("follows the sample with date, two speakers, announcements, and closing", () => {
    const content = buildPaScript("2026-09-14", ["Alex Kim", "Jordan Lee"]);
    expect(content).toContain("Anchor: Good morning, PALY! I'm Alex Kim.");
    expect(content).toContain("Anchor: Today is Monday, September 14th, 2026.");
    expect(content).toContain("Co-Anchor: That's all for today. I'm Jordan Lee.");
    expect(content).toContain("Anchor: I'm Alex Kim and this has been InFocus News.");
    expect(content).toContain("Co-Anchor: Have a fantastic day, Vikings!");
    expect(content.match(/\[announcement\]/g)).toHaveLength(4);
  });
  it("updates only generated name lines without overwriting edited copy or swapping names twice", () => {
    const original = buildPaScript("2026-09-14", ["Alex Kim", "Jordan Lee"])
      .replace("[announcement]", "Alex Kim hosts a meeting today.");
    const result = refreshPaNames(original, ["Alex Kim", "Jordan Lee"], ["Jordan Lee", "Alex Kim"]);
    expect(result).toContain("Good morning, PALY! I'm Jordan Lee.");
    expect(result).toContain("Co-Anchor: And I'm Alex Kim.");
    expect(result).toContain("Alex Kim hosts a meeting today.");
    const edited = original.replace("Anchor: Good morning, PALY! I'm Alex Kim.", "Anchor: Welcome back, Vikings!");
    expect(refreshPaNames(edited, ["Alex Kim", "Jordan Lee"], ["Taylor Smith", "Jordan Lee"]))
      .toContain("Anchor: Welcome back, Vikings!");
  });
  it("fills unassigned names later", () => {
    expect(refreshPaNames(buildPaScript("2026-09-14", []), [], ["Alex Kim"]))
      .toContain("Good morning, PALY! I'm Alex Kim.");
  });
  it("resolves registered full names and nicknames, but never grants access via ambiguous or fuzzy names", () => {
    const users = [
      { id: "a", name: "Alex Kim", nickname: "AK" },
      { id: "b", name: "Alex Lee", nickname: null },
      { id: "c", name: "Jordan Jones", nickname: null }
    ];
    expect(resolvePaPeople(["AK", "Jordan"], users).map((person) => person?.id)).toEqual(["a", "c"]);
    expect(resolvePaPeople(["Alex", "Jord"], users)).toEqual([null, null]);
  });
});

describe("paTimeLabel", () => {
  it("uses second period on a normal Monday", () => {
    expect(paTimeLabel("2026-09-21")).toBe("Start of second period");
  });

  it("uses fifth period when Monday runs the Friday 5–7 schedule", () => {
    expect(paTimeLabel("2026-09-28")).toBe("Start of fifth period");
  });
});
