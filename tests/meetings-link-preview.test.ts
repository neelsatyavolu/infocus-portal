import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ findUnique: vi.fn(), resolveSeries: vi.fn() }));
vi.mock("@/src/lib/prisma", () => ({ prisma: { meeting: { findUnique: mocks.findUnique } } }));
vi.mock("@/src/server/meetings-schedule", () => ({ resolveProducerSeriesMeetingId: mocks.resolveSeries }));

import { NextRequest } from "next/server";
import middleware from "@/middleware";
import { MEETING_PREVIEW_PUBLIC_PATH, isLinkPreviewBot, meetingPreviewRewritePath } from "@/src/lib/meetings/link-preview";
import { GENERIC_MEETING_PREVIEW, loadMeetingPreview, previewFromMeeting } from "@/src/server/meetings-preview";

const IMESSAGE = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_11_1) AppleWebKit/601.2.4 (KHTML, like Gecko) Version/9.0.1 Safari/601.2.4 facebookexternalhit/1.1 Facebot Twitterbot/1.0";
const SAFARI = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const BOTS = [
  IMESSAGE,
  "Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)",
  "Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)",
  "WhatsApp/2.23.20.0",
  "LinkedInBot/1.0 (compatible; Mozilla/5.0; Apache-HttpClient +http://www.linkedin.com)",
  "TelegramBot (like TwitterBot)",
  "Twitterbot/1.0"
];

describe("meetingPreviewRewritePath", () => {
  it("rewrites meeting links for every preview crawler", () => {
    for (const ua of BOTS) {
      expect(isLinkPreviewBot(ua)).toBe(true);
      expect(meetingPreviewRewritePath("/meet/abc123", "GET", ua)).toBe("/meet-preview/abc123");
    }
    expect(meetingPreviewRewritePath("/meet/producers", "GET", IMESSAGE)).toBe("/meet-preview/producers");
    expect(meetingPreviewRewritePath("/meet/abc123", "HEAD", IMESSAGE)).toBe("/meet-preview/abc123");
  });

  it("leaves normal browsers, other paths and other methods alone", () => {
    expect(meetingPreviewRewritePath("/meet/abc123", "GET", SAFARI)).toBeNull();
    expect(meetingPreviewRewritePath("/meet/abc123", "GET", null)).toBeNull();
    expect(meetingPreviewRewritePath("/meetings", "GET", IMESSAGE)).toBeNull();
    expect(meetingPreviewRewritePath("/meet/abc/extra", "GET", IMESSAGE)).toBeNull();
    expect(meetingPreviewRewritePath("/groups", "GET", IMESSAGE)).toBeNull();
    expect(meetingPreviewRewritePath("/meet/abc123", "POST", IMESSAGE)).toBeNull();
  });

  it("makes only the preview page and its image public", () => {
    expect(MEETING_PREVIEW_PUBLIC_PATH.test("/meet-preview/abc123")).toBe(true);
    expect(MEETING_PREVIEW_PUBLIC_PATH.test("/meet-preview/abc123/opengraph-image")).toBe(true);
    expect(MEETING_PREVIEW_PUBLIC_PATH.test("/meet-preview/abc123/opengraph-image-1a2b3c")).toBe(true);
    expect(MEETING_PREVIEW_PUBLIC_PATH.test("/meet-preview/abc123/other")).toBe(false);
    expect(MEETING_PREVIEW_PUBLIC_PATH.test("/meet/abc123")).toBe(false);
  });
});

describe("middleware", () => {
  function request(path: string, ua: string) {
    return new NextRequest(`https://portal.example.edu${path}`, { headers: { "user-agent": ua, host: "portal.example.edu" } });
  }

  it("rewrites a crawler's meeting link to the preview without signing in", async () => {
    const response = await middleware(request("/meet/abc123", IMESSAGE));
    expect(response?.headers.get("x-middleware-rewrite")).toBe("https://portal.example.edu/meet-preview/abc123");
  });

  it("sends a signed-out browser to sign-in as before", async () => {
    const response = await middleware(request("/meet/abc123", SAFARI));
    expect(response?.headers.get("x-middleware-rewrite")).toBeNull();
    expect(response?.status).toBe(307);
  });

  it("serves the preview image signed out", async () => {
    const response = await middleware(request("/meet-preview/abc123/opengraph-image", IMESSAGE));
    expect(response?.status).toBe(200);
    expect(response?.headers.get("location")).toBeNull();
  });
});

describe("preview contents", () => {
  const startsAt = new Date("2026-10-05T04:15:00.000Z"); // Sunday, October 4, 9:15 PM Pacific

  it("shows the title and the Pacific time, for every access mode", () => {
    expect(previewFromMeeting({ title: "Exec sync", startsAt, status: "SCHEDULED" })).toEqual({
      title: "Exec sync",
      description: "Sunday, October 4 · 9:15 PM Pacific · InFocus Portal",
      when: "Sunday, October 4 · 9:15 PM Pacific"
    });
  });

  it("says Happening now while live", () => {
    expect(previewFromMeeting({ title: "Rundown", startsAt, status: "LIVE" })).toMatchObject({
      description: "Happening now · InFocus Portal",
      when: "Happening now"
    });
  });

  it("unknown ids are generic; cancelled meetings say so without a time", () => {
    expect(previewFromMeeting(null)).toEqual(GENERIC_MEETING_PREVIEW);
    expect(previewFromMeeting({ title: "Rundown", startsAt, status: "CANCELED" })).toEqual({
      title: "Cancelled · Rundown",
      description: "InFocus Portal",
      when: null
    });
  });

  it("only ever reads the title, time and status (never names, attendees or invitees)", async () => {
    mocks.findUnique.mockResolvedValue({ title: "Rundown", startsAt, status: "SCHEDULED" });
    await loadMeetingPreview("abc123");
    expect(mocks.findUnique).toHaveBeenCalledWith({ where: { id: "abc123" }, select: { title: true, startsAt: true, status: true } });
  });

  it("resolves the stable producers link, and rejects odd ids without a lookup", async () => {
    mocks.resolveSeries.mockResolvedValue("m-series");
    mocks.findUnique.mockResolvedValue({ title: "InFocus Producer Meeting", startsAt, status: "SCHEDULED" });
    expect((await loadMeetingPreview("producers")).title).toBe("InFocus Producer Meeting");
    expect(mocks.findUnique).toHaveBeenLastCalledWith(expect.objectContaining({ where: { id: "m-series" } }));

    mocks.findUnique.mockClear();
    expect(await loadMeetingPreview("../etc")).toEqual(GENERIC_MEETING_PREVIEW);
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });
});

beforeEach(() => {
  vi.stubEnv("APP_BASE_URL", "https://portal.example.edu");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
