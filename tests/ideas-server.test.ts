import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IDEA_FEEDS, type FeedItem } from "@/src/lib/idea-feeds";
import { IDEA_MAX_OUTPUT_TOKENS, type IdeaSuggestion } from "@/src/lib/ideas";

const m = vi.hoisted(() => ({
  findFirst: vi.fn(),
  findUnique: vi.fn(),
  findMany: vi.fn(),
  create: vi.fn(),
  config: vi.fn(),
  chat: vi.fn()
}));

vi.mock("@/src/lib/prisma", () => ({
  prisma: { ideaBatch: { findFirst: m.findFirst, findUnique: m.findUnique, findMany: m.findMany, create: m.create } }
}));
vi.mock("@/src/server/workers-ai", () => ({ workersAiConfig: m.config, workersAiJsonChat: m.chat }));

import { checkIdeaRunDue, getIdeaBatch, listIdeaRunDates, loadIdeaFeedItems, requestIdeas, storeIdeaBatch } from "@/src/server/ideas";

const now = new Date("2026-10-10T23:30:00Z");
const config = { accountId: "account123", token: "test-token" };
const fetchMock = vi.fn();

const items: FeedItem[] = [
  { outlet: "Alpha", kind: "news", title: "Alpha story", summary: "About Alpha.", url: "https://alpha.example.com/1", publishedAt: "2026-10-10T20:00:00.000Z" },
  { outlet: "Beta", kind: "events", title: "Beta fair", summary: "", url: "https://beta.example.com/1", publishedAt: "2026-10-10T19:00:00.000Z" }
];

const idea: IdeaSuggestion = {
  title: "Teens redesign the library",
  pitch: "A pitch.",
  angle: "An angle.",
  category: "feature",
  sources: [{ title: "Alpha story", outlet: "Alpha", url: "https://alpha.example.com/1" }]
};

function feedXml(title: string, link: string) {
  return `<rss><channel><item><title>${title}</title><link>${link}</link><pubDate>Sat, 10 Oct 2026 20:00:00 +0000</pubDate></item></channel></rss>`;
}

beforeEach(() => {
  Object.values(m).forEach((mock) => mock.mockReset());
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "error").mockImplementation(() => {});
  m.config.mockReturnValue(config);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("checkIdeaRunDue", () => {
  it("does nothing when Workers AI is not configured", async () => {
    m.config.mockReturnValue(null);
    await expect(checkIdeaRunDue(now)).resolves.toEqual({ due: false, reason: "not_configured" });
    expect(m.findFirst).not.toHaveBeenCalled();
  });

  it("waits until the newest batch is 2 days old", async () => {
    m.findFirst.mockResolvedValue({ runDate: "2026-10-09" });
    await expect(checkIdeaRunDue(now)).resolves.toEqual({ due: false, reason: "not_due" });
    expect(m.findFirst).toHaveBeenCalledWith({ orderBy: { runDate: "desc" }, select: { runDate: true } });
  });

  it("is due with the Pacific date of the run", async () => {
    m.findFirst.mockResolvedValue({ runDate: "2026-10-08" });
    await expect(checkIdeaRunDue(now)).resolves.toEqual({ due: true, runDate: "2026-10-10" });
    m.findFirst.mockResolvedValue(null);
    await expect(checkIdeaRunDue(new Date("2026-10-11T05:00:00Z"))).resolves.toEqual({ due: true, runDate: "2026-10-10" });
  });
});

describe("loadIdeaFeedItems", () => {
  it("reads every feed with a labelled request, and one broken feed does not stop the rest", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === IDEA_FEEDS[0].url) throw new Error("timeout");
      if (url === IDEA_FEEDS[1].url) return new Response("Forbidden", { status: 403 });
      return new Response(feedXml(`Story from ${url}`, `${url}story`), { status: 200 });
    });

    const loaded = await loadIdeaFeedItems(now);

    expect(fetchMock).toHaveBeenCalledTimes(IDEA_FEEDS.length);
    expect(fetchMock.mock.calls[0][1].headers["User-Agent"]).toMatch(/^InFocusPortal\//);
    expect(loaded).toHaveLength(IDEA_FEEDS.length - 2);
    expect(loaded.every((item) => item.title.startsWith("Story from "))).toBe(true);
  });

  it("skips a feed whose response is far larger than any real feed", async () => {
    fetchMock.mockImplementation(async (url: string) =>
      new Response(url === IDEA_FEEDS[0].url ? `${feedXml("Giant", `${url}giant`)}${" ".repeat(4_000_000)}` : feedXml(`Story from ${url}`, `${url}story`), { status: 200 })
    );
    const loaded = await loadIdeaFeedItems(now);
    expect(loaded).toHaveLength(IDEA_FEEDS.length - 1);
    expect(loaded.some((item) => item.title === "Giant")).toBe(false);
  });
});

describe("requestIdeas", () => {
  it("makes one capped model call and returns validated ideas with token counts", async () => {
    m.chat.mockResolvedValue({
      content: JSON.stringify({ ideas: [{ title: idea.title, pitch: idea.pitch, angle: idea.angle, category: "feature", sources: [1] }] }),
      inputTokens: 900,
      outputTokens: 150
    });

    await expect(requestIdeas(items, now)).resolves.toEqual({ ideas: [idea], inputTokens: 900, outputTokens: 150 });

    expect(m.chat).toHaveBeenCalledTimes(1);
    const [usedConfig, request] = m.chat.mock.calls[0];
    expect(usedConfig).toEqual(config);
    expect(request.maxTokens).toBe(IDEA_MAX_OUTPUT_TOKENS);
    expect(request.user).toContain("1. [Alpha · news · Oct 10] Alpha story — About Alpha.");
  });

  it("refuses to run without configuration", async () => {
    m.config.mockReturnValue(null);
    await expect(requestIdeas(items, now)).rejects.toThrow(/not configured/);
    expect(m.chat).not.toHaveBeenCalled();
  });
});

describe("storeIdeaBatch", () => {
  const input = { runDate: "2026-10-10", itemCount: 2, ideas: [idea], inputTokens: 900, outputTokens: 150 };

  it("saves the batch and reports what it cost", async () => {
    m.create.mockResolvedValue({ id: "batch1" });
    await expect(storeIdeaBatch(input)).resolves.toEqual({
      status: "created", runDate: "2026-10-10", ideas: 1, items: 2, inputTokens: 900, outputTokens: 150, neurons: 39
    });
    expect(m.create).toHaveBeenCalledWith({ data: input });
  });

  it("treats a second batch for the same day as already done", async () => {
    m.create.mockRejectedValue(Object.assign(new Error("Unique constraint"), { code: "P2002" }));
    await expect(storeIdeaBatch(input)).resolves.toMatchObject({ status: "already_exists", runDate: "2026-10-10" });
  });

  it("rethrows other database errors", async () => {
    m.create.mockRejectedValue(new Error("connection lost"));
    await expect(storeIdeaBatch(input)).rejects.toThrow("connection lost");
  });
});

describe("reading batches", () => {
  const row = { runDate: "2026-10-10", ideas: [idea], itemCount: 86, createdAt: new Date("2026-10-10T23:31:00Z") };

  it("lists run dates newest first", async () => {
    m.findMany.mockResolvedValue([{ runDate: "2026-10-10" }, { runDate: "2026-10-08" }]);
    await expect(listIdeaRunDates()).resolves.toEqual(["2026-10-10", "2026-10-08"]);
    expect(m.findMany).toHaveBeenCalledWith({ orderBy: { runDate: "desc" }, select: { runDate: true }, take: 200 });
  });

  it("returns the newest batch by default", async () => {
    m.findFirst.mockResolvedValue(row);
    await expect(getIdeaBatch()).resolves.toEqual({ runDate: "2026-10-10", ideas: [idea], itemCount: 86 });
    expect(m.findUnique).not.toHaveBeenCalled();
  });

  it("returns a past batch by its date, and nothing for a date that is not one", async () => {
    m.findUnique.mockResolvedValue(row);
    await expect(getIdeaBatch("2026-10-10")).resolves.toMatchObject({ runDate: "2026-10-10" });
    expect(m.findUnique.mock.calls[0][0].where).toEqual({ runDate: "2026-10-10" });
    await expect(getIdeaBatch("../etc")).resolves.toBeNull();
    m.findUnique.mockResolvedValue(null);
    await expect(getIdeaBatch("2026-01-01")).resolves.toBeNull();
  });
});
