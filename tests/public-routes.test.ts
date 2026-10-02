import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  shows: vi.fn(),
  announcements: vi.fn(),
  live: vi.fn(),
  upsert: vi.fn(),
  deleteMany: vi.fn()
}));

vi.mock("@/src/server/public-feed", () => ({
  loadPublicShows: mocks.shows,
  loadShowAnnouncements: mocks.announcements,
  loadPublicLive: mocks.live
}));
vi.mock("@/src/lib/prisma", () => ({ prisma: { newsPushDevice: { upsert: mocks.upsert, deleteMany: mocks.deleteMany } } }));

import { GET as getLive } from "@/app/api/public/live/route";
import { DELETE, POST } from "@/app/api/public/news-devices/route";
import { GET as getAnnouncements } from "@/app/api/public/shows/[date]/announcements/route";
import { GET as getShows } from "@/app/api/public/shows/route";

const token = "AB".repeat(32);
let ip = 0;

function deviceRequest(method: string, body: unknown) {
  return new Request("https://portal.example.edu/api/public/news-devices", {
    method,
    headers: { "content-type": "application/json", "x-forwarded-for": `10.0.0.${++ip}` },
    body: JSON.stringify(body)
  });
}

const context = (date: string) => ({ params: Promise.resolve({ date }) });

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("public feeds", () => {
  it("serves shows with a CDN cache header", async () => {
    mocks.shows.mockResolvedValue({ latest: null, seasons: [], upcomingShowDates: [] });
    const response = await getShows();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("s-maxage=300");
    expect(await response.json()).toEqual({ data: { latest: null, seasons: [], upcomingShowDates: [] } });
  });

  it("hides YouTube failure details", async () => {
    mocks.shows.mockRejectedValue(new Error("YouTube lookup failed (HTTP 403)."));
    const response = await getShows();
    expect(response.status).toBe(502);
    expect(JSON.stringify(await response.json())).not.toContain("403");
  });

  it("serves a show's announcements only for a public show", async () => {
    expect((await getAnnouncements(new Request("https://x"), context("09-25"))).status).toBe(400);
    mocks.announcements.mockResolvedValueOnce(null);
    expect((await getAnnouncements(new Request("https://x"), context("2026-09-25"))).status).toBe(404);
    mocks.announcements.mockResolvedValueOnce({ showDate: "2026-09-25", announcements: ["Club Fair is Thursday."] });
    const response = await getAnnouncements(new Request("https://x"), context("2026-09-25"));
    expect((await response.json()).data.announcements).toEqual(["Club Fair is Thursday."]);
  });

  it("serves livestreams", async () => {
    mocks.live.mockResolvedValue({ live: [], upcoming: [], recent: [] });
    expect((await getLive()).status).toBe(200);
  });
});

describe("news alert devices", () => {
  it("saves an iPhone's alert choices", async () => {
    const response = await POST(deviceRequest("POST", {
      token, environment: "production", appVersion: "1.0", shows: true, stories: false, live: true
    }));
    expect(response.status).toBe(201);
    const choices = { environment: "production", appVersion: "1.0", shows: true, stories: false, live: true };
    expect(mocks.upsert).toHaveBeenCalledWith({
      where: { token: token.toLowerCase() },
      update: choices,
      create: { token: token.toLowerCase(), ...choices }
    });
  });

  it("rejects bad tokens and missing choices", async () => {
    expect((await POST(deviceRequest("POST", { token: "nope", environment: "production", shows: true, stories: true, live: true }))).status).toBe(400);
    expect((await POST(deviceRequest("POST", { token, environment: "production" }))).status).toBe(400);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("removes an iPhone when every alert is off", async () => {
    mocks.deleteMany.mockResolvedValue({ count: 1 });
    const response = await DELETE(deviceRequest("DELETE", { token }));
    expect(await response.json()).toEqual({ data: { removed: true } });
  });

  it("limits how often one address can register", async () => {
    const request = () => new Request("https://portal.example.edu/api/public/news-devices", {
      method: "DELETE",
      headers: { "content-type": "application/json", "x-forwarded-for": "10.9.9.9" },
      body: JSON.stringify({ token })
    });
    mocks.deleteMany.mockResolvedValue({ count: 0 });
    for (let attempt = 0; attempt < 30; attempt++) await DELETE(request());
    expect((await DELETE(request())).status).toBe(429);
  });
});

describe("news alerts cron", () => {
  it("runs only with the cron secret", async () => {
    const { isCronRequest } = await import("@/src/lib/cron-auth");
    const withAuth = (value?: string) =>
      new Request("https://portal.example.edu/api/cron/news-alerts", { headers: value ? { authorization: value } : {} });
    expect(isCronRequest(withAuth("Bearer s3cret"), "s3cret")).toBe(true);
    expect(isCronRequest(withAuth("Bearer wrong!"), "s3cret")).toBe(false);
    expect(isCronRequest(withAuth(), "s3cret")).toBe(false);
    expect(isCronRequest(withAuth("Bearer "), "")).toBe(false);
  });
});
