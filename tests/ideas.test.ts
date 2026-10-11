import { describe, expect, it } from "vitest";
import type { FeedItem } from "@/src/lib/idea-feeds";
import {
  IDEA_ITEMS_PER_FEED,
  IDEA_PROMPT_BYTE_BUDGET,
  IDEAS_PER_BATCH,
  buildIdeaMessages,
  estimateNeurons,
  formatIdeaRunDate,
  groupRunDatesByMonth,
  isIdeaBatchDue,
  parseIdeaResponse,
  parseStoredIdeas,
  selectFeedItems
} from "@/src/lib/ideas";

const now = new Date("2026-10-10T23:30:00Z");

function item(outlet: string, n: number, hoursAgo: number, extra: Partial<FeedItem> = {}): FeedItem {
  return {
    outlet,
    kind: "news",
    title: `${outlet} story ${n}`,
    summary: `Summary of ${outlet} story ${n}.`,
    url: `https://${outlet.toLowerCase().replace(/\s+/g, "")}.example.com/${n}`,
    publishedAt: new Date(now.getTime() - hoursAgo * 3_600_000).toISOString(),
    ...extra
  };
}

describe("isIdeaBatchDue", () => {
  it("is due when there is no batch yet, or the last one is at least 2 days old", () => {
    expect(isIdeaBatchDue(null, "2026-10-10")).toBe(true);
    expect(isIdeaBatchDue("2026-10-08", "2026-10-10")).toBe(true);
    expect(isIdeaBatchDue("2026-09-30", "2026-10-02")).toBe(true);
    expect(isIdeaBatchDue("2026-10-01", "2026-10-10")).toBe(true);
  });

  it("is not due the same day or the day after", () => {
    expect(isIdeaBatchDue("2026-10-10", "2026-10-10")).toBe(false);
    expect(isIdeaBatchDue("2026-10-09", "2026-10-10")).toBe(false);
    expect(isIdeaBatchDue("2026-10-31", "2026-11-01")).toBe(false);
  });

  it("counts calendar days across a clock change and a new year", () => {
    expect(isIdeaBatchDue("2026-10-31", "2026-11-02")).toBe(true);
    expect(isIdeaBatchDue("2027-03-13", "2027-03-14")).toBe(false);
    expect(isIdeaBatchDue("2026-12-31", "2027-01-01")).toBe(false);
    expect(isIdeaBatchDue("2026-12-31", "2027-01-02")).toBe(true);
  });
});

describe("selectFeedItems", () => {
  it("keeps recent items only, newest first within a feed", () => {
    const picked = selectFeedItems([[item("Alpha", 1, 100), item("Alpha", 2, 30), item("Alpha", 3, 2)]], now);
    expect(picked.map((entry) => entry.title)).toEqual(["Alpha story 3", "Alpha story 2"]);
  });

  it("takes turns between feeds and caps each feed", () => {
    const alpha = Array.from({ length: IDEA_ITEMS_PER_FEED + 4 }, (_, i) => item("Alpha", i, i + 1));
    const beta = [item("Beta", 0, 1), item("Beta", 1, 2)];
    const picked = selectFeedItems([alpha, beta], now);
    expect(picked.slice(0, 4).map((entry) => entry.outlet)).toEqual(["Alpha", "Beta", "Alpha", "Beta"]);
    expect(picked.filter((entry) => entry.outlet === "Alpha")).toHaveLength(IDEA_ITEMS_PER_FEED);
  });

  it("drops a story two outlets both carry", () => {
    const shared = { title: "Storm closes Highway 1", url: "https://wire.example.com/storm" };
    const picked = selectFeedItems([
      [item("Alpha", 1, 1, shared)],
      [item("Beta", 1, 1, { title: "Storm Closes Highway 1 ", url: "https://beta.example.com/storm" }), item("Beta", 2, 2)]
    ], now);
    expect(picked.map((entry) => entry.title)).toEqual(["Storm closes Highway 1", "Beta story 2"]);
  });

  it("never lets the prompt grow past the character budget", () => {
    const feeds = Array.from({ length: 60 }, (_, f) =>
      Array.from({ length: IDEA_ITEMS_PER_FEED }, (_, i) =>
        item(`Outlet ${f}`, i, i + 1, { title: `Outlet ${f} ${"long headline ".repeat(10)}${i}`, summary: "s".repeat(220) })
      )
    );
    const picked = selectFeedItems(feeds, now);
    const { user } = buildIdeaMessages(picked, now);
    expect(picked.length).toBeGreaterThan(20);
    expect(picked.length).toBeLessThan(60 * IDEA_ITEMS_PER_FEED);
    expect(user.length).toBeLessThanOrEqual(IDEA_PROMPT_BYTE_BUDGET + 200);
  });

  it("budgets in bytes, so text that costs more tokens per character gets fewer items", () => {
    const feeds = (summary: string) => Array.from({ length: 60 }, (_, f) =>
      Array.from({ length: IDEA_ITEMS_PER_FEED }, (_, i) => item(`Outlet ${f}`, i, i + 1, { summary }))
    );
    const plain = selectFeedItems(feeds("a".repeat(200)), now);
    const wide = selectFeedItems(feeds("日".repeat(200)), now);
    expect(wide.length).toBeLessThan(plain.length / 2);
    expect(new TextEncoder().encode(buildIdeaMessages(wide, now).user).length).toBeLessThanOrEqual(IDEA_PROMPT_BYTE_BUDGET + 200);
  });
});

describe("buildIdeaMessages", () => {
  it("numbers the items and tells the model to treat them as untrusted", () => {
    const { system, user } = buildIdeaMessages([item("Alpha", 1, 1), item("Beta", 2, 30, { kind: "events" })], now);
    expect(system).toMatch(/untrusted/i);
    expect(system).toContain(`${IDEAS_PER_BATCH} story ideas`);
    expect(user).toContain("Saturday, October 10, 2026");
    expect(user).toContain("1. [Alpha · news · Oct 10] Alpha story 1 — Summary of Alpha story 1.");
    expect(user).toContain("2. [Beta · events · Oct 9] Beta story 2 — Summary of Beta story 2.");
  });
});

describe("parseIdeaResponse", () => {
  const items = [item("Alpha", 1, 1), item("Beta", 2, 2), item("Gamma", 3, 3)];
  const idea = (extra: Record<string, unknown> = {}) => ({
    title: "Teens redesign the library",
    pitch: "The city library opened a teen room students helped plan.",
    angle: "Interview Paly students on the advisory board.",
    category: "feature",
    sources: [2],
    ...extra
  });

  it("turns source numbers into the real articles", () => {
    const ideas = parseIdeaResponse(JSON.stringify({ ideas: [idea({ sources: [2, 3, 2] })] }), items);
    expect(ideas).toEqual([{
      title: "Teens redesign the library",
      pitch: "The city library opened a teen room students helped plan.",
      angle: "Interview Paly students on the advisory board.",
      category: "feature",
      sources: [
        { title: "Beta story 2", outlet: "Beta", url: items[1].url },
        { title: "Gamma story 3", outlet: "Gamma", url: items[2].url }
      ]
    }]);
  });

  it("reads JSON wrapped in a code fence and tidies the text", () => {
    const content = "```json\n" + JSON.stringify({ ideas: [idea({ title: "  Spaced   out  ", category: "NEWS" })] }) + "\n```";
    const [parsed] = parseIdeaResponse(content, items);
    expect(parsed.title).toBe("Spaced out");
    expect(parsed.category).toBe("news");
  });

  it("accepts source numbers sent as strings, but nothing else", () => {
    const [parsed] = parseIdeaResponse(JSON.stringify({ ideas: [idea({ sources: ["3", " 1 "] })] }), items);
    expect(parsed.sources.map((source) => source.outlet)).toEqual(["Gamma", "Alpha"]);
    expect(() => parseIdeaResponse(JSON.stringify({ ideas: [idea({ sources: [true] })] }), items)).toThrow(/no usable ideas/i);
    expect(() => parseIdeaResponse(JSON.stringify({ ideas: [idea({ sources: [1.5] })] }), items)).toThrow(/no usable ideas/i);
  });

  it("drops ideas with no real source, a made-up category, or empty text", () => {
    const ideas = parseIdeaResponse(JSON.stringify({ ideas: [
      idea({ title: "No source", sources: [] }),
      idea({ title: "Invented source", sources: [0, 99] }),
      idea({ title: "Bad category", category: "sports" }),
      idea({ title: " " }),
      "not an idea",
      idea({ title: "Kept" })
    ] }), items);
    expect(ideas.map((entry) => entry.title)).toEqual(["Kept"]);
  });

  it("keeps at most one batch worth of ideas", () => {
    const many = Array.from({ length: IDEAS_PER_BATCH + 5 }, (_, i) => idea({ title: `Idea ${i}` }));
    expect(parseIdeaResponse(JSON.stringify({ ideas: many }), items)).toHaveLength(IDEAS_PER_BATCH);
  });

  it("throws when nothing usable comes back", () => {
    expect(() => parseIdeaResponse("Sorry, I can't help with that.", items)).toThrow(/no usable ideas/i);
    expect(() => parseIdeaResponse(JSON.stringify({ ideas: [idea({ sources: [42] })] }), items)).toThrow(/no usable ideas/i);
    expect(() => parseIdeaResponse("{ not json", items)).toThrow(/no usable ideas/i);
  });
});

describe("parseStoredIdeas", () => {
  const stored = {
    title: "Teens redesign the library",
    pitch: "A pitch.",
    angle: "An angle.",
    category: "feature",
    sources: [{ title: "Story", outlet: "Alpha", url: "https://alpha.example.com/1" }]
  };

  it("returns saved ideas", () => {
    expect(parseStoredIdeas([stored])).toEqual([stored]);
  });

  it("returns nothing for a damaged row or an unsafe link", () => {
    expect(parseStoredIdeas(null)).toEqual([]);
    expect(parseStoredIdeas({ ideas: [stored] })).toEqual([]);
    expect(parseStoredIdeas([{ ...stored, sources: [{ title: "x", outlet: "y", url: "javascript:alert(1)" }] }])).toEqual([]);
  });
});

describe("helpers", () => {
  it("estimates neurons from Cloudflare's listed token prices", () => {
    expect(estimateNeurons(80, 61)).toBeCloseTo(6.7, 1);
    expect(Math.round(estimateNeurons(12_000, 4_096))).toBe(661);
  });

  it("formats run dates without shifting the day", () => {
    expect(formatIdeaRunDate("2026-10-10", "long")).toBe("Saturday, October 10");
    expect(formatIdeaRunDate("2026-01-01", "short")).toBe("Thu, Jan 1");
  });

  it("groups past run dates by month, newest first", () => {
    expect(groupRunDatesByMonth(["2026-10-10", "2026-10-08", "2026-09-30"])).toEqual([
      { month: "October 2026", runDates: ["2026-10-10", "2026-10-08"] },
      { month: "September 2026", runDates: ["2026-09-30"] }
    ]);
  });
});
