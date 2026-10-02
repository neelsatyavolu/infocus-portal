import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { decodeHtmlEntities, newestItemChange, newlyLive, storyKey } from "@/src/lib/news-alerts";

const mocks = vi.hoisted(() => ({
  topic: vi.fn(),
  configured: vi.fn(),
  send: vi.fn(),
  states: vi.fn(),
  upsertState: vi.fn(),
  devices: vi.fn(),
  deleteDevices: vi.fn(),
  seasons: vi.fn(),
  live: vi.fn()
}));

vi.mock("@/src/lib/apns", () => ({ apnsTopic: mocks.topic, isApnsConfigured: mocks.configured, sendApns: mocks.send }));
vi.mock("@/src/lib/prisma", () => ({
  prisma: {
    newsFeedState: { findMany: mocks.states, upsert: mocks.upsertState },
    newsPushDevice: { findMany: mocks.devices, deleteMany: mocks.deleteDevices }
  }
}));
vi.mock("@/src/server/public-feed", () => ({ loadPublicSeasons: mocks.seasons, loadPublicLive: mocks.live }));

import { runNewsAlerts } from "@/src/server/news-alerts";

const token = "a".repeat(64);
const show = { videoId: "show2", title: "InFocus News | Friday, October 2nd, 2026", publishedAt: "2026-10-02T15:30:00Z" };

describe("what counts as new", () => {
  it("announces only items newer than the last one seen, and nothing on first sight", () => {
    expect(newestItemChange(undefined, "b")).toEqual({ announce: false, nextKey: "b" });
    expect(newestItemChange("a", "b")).toEqual({ announce: true, nextKey: "b" });
    expect(newestItemChange("b", "b")).toEqual({ announce: false, nextKey: "b" });
    expect(newestItemChange("b", "a")).toEqual({ announce: false, nextKey: "b" });
    expect(newestItemChange("b", null)).toEqual({ announce: false, nextKey: "b" });
  });

  it("announces streams that just went live", () => {
    expect(newlyLive(undefined, ["x"])).toEqual({ announce: [], nextIds: "x" });
    expect(newlyLive("x", ["x", "y"])).toEqual({ announce: ["y"], nextIds: "x,y" });
    expect(newlyLive("x,y", [])).toEqual({ announce: [], nextIds: "" });
  });

  it("orders WordPress post IDs as text and decodes titles", () => {
    expect(storyKey(1000) > storyKey(999)).toBe(true);
    expect(decodeHtmlEntities("Paly&#8217;s &amp; Gunn&#x2019;s &quot;game&quot;")).toBe("Paly’s & Gunn’s \"game\"");
  });
});

describe("runNewsAlerts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.topic.mockReturnValue("com.example.news");
    mocks.configured.mockReturnValue(true);
    mocks.states.mockResolvedValue([
      { feed: "show", lastId: "2026-09-30T15:30:00Z" },
      { feed: "story", lastId: storyKey(2619) },
      { feed: "live", lastId: "" }
    ]);
    mocks.seasons.mockResolvedValue([{ shows: [show] }]);
    mocks.live.mockResolvedValue({ live: [{ videoId: "game", title: "Varsity Football" }], upcoming: [], recent: [] });
    mocks.devices.mockResolvedValue([{ token, environment: "production" }]);
    mocks.send.mockImplementation(async (devices: { token: string }[]) =>
      devices.map((device) => ({ token: device.token, ok: true, dead: false }))
    );
    vi.stubGlobal("fetch", vi.fn(async () =>
      new Response(JSON.stringify([{ id: 2620, title: { rendered: "Breaking &amp; Entering" }, link: "https://news.example/2620" }]))
    ));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends each new item once to the people who asked for it", async () => {
    const result = await runNewsAlerts();
    expect(result).toEqual({ skipped: false, sent: { shows: 1, stories: 1, live: 1 } });
    expect(mocks.devices).toHaveBeenCalledWith({ where: { shows: true }, select: { token: true, environment: true } });
    expect(mocks.send).toHaveBeenCalledWith([{ token, environment: "production", topic: "com.example.news" }], expect.objectContaining({
      title: "New on InFocus",
      body: "Breaking & Entering",
      data: { kind: "story", postId: "2620" }
    }));
    expect(mocks.send).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ data: { kind: "show", videoId: "show2" } }));
    expect(mocks.upsertState).toHaveBeenCalledWith({ where: { feed: "live" }, update: { lastId: "game" }, create: { feed: "live", lastId: "game" } });
  });

  it("only records the feeds on the first run", async () => {
    mocks.states.mockResolvedValue([]);
    const result = await runNewsAlerts();
    expect(result.sent).toEqual({ shows: 0, stories: 0, live: 0 });
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.upsertState).toHaveBeenCalledTimes(3);
  });

  it("forgets dead tokens and keeps going when one feed fails", async () => {
    mocks.seasons.mockRejectedValue(new Error("YouTube down"));
    mocks.send.mockImplementation(async (devices: { token: string }[]) =>
      devices.map((device) => ({ token: device.token, ok: false, dead: true }))
    );
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await runNewsAlerts();
    expect(mocks.deleteDevices).toHaveBeenCalledWith({ where: { token: { in: [token] } } });
    expect(mocks.upsertState).toHaveBeenCalledWith(expect.objectContaining({ where: { feed: "story" } }));
    log.mockRestore();
  });

  it("does nothing until the news app has a push topic", async () => {
    mocks.topic.mockReturnValue(null);
    expect((await runNewsAlerts()).skipped).toBe(true);
    expect(mocks.states).not.toHaveBeenCalled();
  });
});
