import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUserId: vi.fn(), syncUserProfile: vi.fn(), getPlatformAccess: vi.fn(), manager: vi.fn(),
  calendarEntry: vi.fn(), showRolesShow: vi.fn(), packageRows: vi.fn(), teleprompterDoc: vi.fn(), calendarDays: vi.fn(),
  fetchSubmitted: vi.fn(), collegeVisit: vi.fn(), generateContent: vi.fn(), limitByKey: vi.fn()
}));
vi.mock("@/src/lib/auth", () => ({ requireUserId: mocks.requireUserId, syncUserProfile: mocks.syncUserProfile }));
vi.mock("@/src/lib/platform-admin", async (original) => ({
  ...await original<typeof import("@/src/lib/platform-admin")>(), getPlatformAccess: mocks.getPlatformAccess
}));
vi.mock("@/src/lib/prisma", () => ({ prisma: {
  socialMediaManager: { findUnique: mocks.manager },
  masterCalendarEntry: { findUnique: mocks.calendarEntry },
  showRolesShow: { findUnique: mocks.showRolesShow },
  packageProgressRow: { findMany: mocks.packageRows },
  teleprompterDoc: { findFirst: mocks.teleprompterDoc },
  schoolCalendarDay: { findMany: mocks.calendarDays }
} }));
vi.mock("@/src/lib/rate-limit", () => ({ getRequestKey: () => "test", limitByKey: mocks.limitByKey }));
vi.mock("@/src/server/announcement-submissions", () => ({ fetchSubmittedAnnouncements: mocks.fetchSubmitted }));
vi.mock("@/src/lib/college-visits-sheet", () => ({ loadCollegeVisitBulletinAnnouncement: mocks.collegeVisit }));
vi.mock("@google/genai", () => ({ GoogleGenAI: class { models = { generateContent: mocks.generateContent }; } }));

import { GET, POST } from "@/app/api/managers/social-media/show/route";
import { joinNames, packageByline, showApDate, showSlideFileName, showSlideName, showSlides } from "@/src/lib/show-story";
import { bulletinParagraphs, listRecapShowDates } from "@/src/server/show-story";

const URL_BASE = "https://infocus.test/api/managers/social-media/show";
const post = (body: unknown) => new Request(URL_BASE, {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
});
const member = (nickname: string | null, name: string | null) => ({ user: { name, nickname } });

describe("show story helpers", () => {
  it("orders slides recap, announcements, then one per package", () => {
    const slides = showSlides(2);
    expect(slides).toEqual([{ kind: "recap" }, { kind: "announcements" }, { kind: "package", index: 0 }, { kind: "package", index: 1 }]);
    expect(slides.map((slide) => showSlideName(slide, 2))).toEqual(["Recap", "Announcements", "Package 1", "Package 2"]);
    expect(showSlideName({ kind: "package", index: 0 }, 1)).toBe("Package");
  });

  it("joins names AP style and builds bylines", () => {
    expect(joinNames(["Abby"])).toBe("Abby");
    expect(joinNames(["Abby", " Otto "])).toBe("Abby and Otto");
    expect(joinNames(["Abby", "Otto", "Sage"])).toBe("Abby, Otto and Sage");
    expect(packageByline([])).toBe("");
    expect(packageByline(["Abby", "Otto"])).toBe("By Abby and Otto");
  });

  it("formats the show date and slide file names", () => {
    expect(showApDate("2026-09-25")).toBe("Sept. 25, 2026");
    expect(showSlideFileName("2026-09-25", { kind: "package", index: 1 }, 3)).toBe("infocus-story-show-2026-09-25-4-package-2.png");
  });

  it("reads one announcement per spoken paragraph of an A2 bulletin", () => {
    const a2 = "BULLETIN\n\nCAM 2\n[ANCHOR]\nClub Fair is Thursday\nin the Quad.\n\nCAM 3\n[CO-ANCHOR]\nThe blood drive is Friday.\n\n[INSERT PACKAGE TOSS]";
    expect(bulletinParagraphs(a2)).toEqual(["Club Fair is Thursday in the Quad.", "The blood drive is Friday."]);
    expect(bulletinParagraphs("")).toEqual([]);
  });
});

describe("recap show dates", () => {
  beforeEach(() => mocks.calendarDays.mockResolvedValue([]));

  it("offers the next show first and defaults to the latest aired show", async () => {
    // Wednesday, Sept. 30, 2026: shows run Wednesdays and Fridays.
    const { dates, defaultDate } = await listRecapShowDates(new Date(2026, 8, 30, 15));
    expect(dates[0]).toBe("2026-10-07"); // Friday, Oct. 2 is a no-school day
    expect(dates[1]).toBe("2026-09-30");
    expect(defaultDate).toBe("2026-09-30");
  });
});

describe("show story API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUserId.mockResolvedValue("viewer");
    mocks.syncUserProfile.mockResolvedValue({ id: "viewer", email: "viewer@example.edu" });
    mocks.getPlatformAccess.mockResolvedValue({ role: "ASSOCIATE_PRODUCER" });
    mocks.manager.mockResolvedValue(null);
    mocks.calendarDays.mockResolvedValue([]);
    mocks.calendarEntry.mockResolvedValue(null);
    mocks.showRolesShow.mockResolvedValue({ anchors: ["Abby", "Otto"] });
    mocks.packageRows.mockResolvedValue([
      { id: "p1", groupTopic: " Parking lot ", members: [member("Sage", "Sage Example"), member(null, "Robin Example"), member(null, null)], finalCutMediaItem: null }
    ]);
    mocks.teleprompterDoc.mockResolvedValue({ sections: [{ content: "BULLETIN\n\nCAM 2\n[ANCHOR]\nClub Fair is Thursday." }] });
    mocks.limitByKey.mockReturnValue({ allowed: true });
  });

  it("refuses people who are not producers or social media managers", async () => {
    mocks.getPlatformAccess.mockResolvedValue({ role: null });
    expect((await GET(new Request(`${URL_BASE}?date=2026-09-25`))).status).toBe(403);
    expect((await POST(post({ announcements: ["x"] }))).status).toBe(403);
  });

  it("lets appointed social media managers in", async () => {
    mocks.getPlatformAccess.mockResolvedValue({ role: null });
    mocks.manager.mockResolvedValue({ id: "appointment" });
    expect((await GET(new Request(`${URL_BASE}?date=2026-09-25`))).status).toBe(200);
  });

  it("rejects a malformed or impossible date", async () => {
    expect((await GET(new Request(`${URL_BASE}?date=next-friday`))).status).toBe(400);
    expect((await GET(new Request(`${URL_BASE}?date=2026-13-01`))).status).toBe(400);
    expect((await GET(new Request(`${URL_BASE}?date=2026-02-30`))).status).toBe(400);
  });

  it("loads anchors, aired announcements and queued packages with display names", async () => {
    const res = await GET(new Request(`${URL_BASE}?date=2026-09-25`));
    const { data } = await res.json();
    expect(data).toMatchObject({
      date: "2026-09-25",
      anchors: ["Abby", "Otto"],
      announcements: ["Club Fair is Thursday."],
      announcementSource: "teleprompter",
      packages: [{ id: "p1", title: "Parking lot", reporters: ["Sage", "Robin Example"] }]
    });
    expect(Array.isArray(data.shows)).toBe(true);
    expect(mocks.packageRows).toHaveBeenCalledWith(expect.objectContaining({
      where: { queuedForAirAt: { not: null }, queuedForShowDate: "2026-09-25" }
    }));
    expect(mocks.fetchSubmitted).not.toHaveBeenCalled();
    // Never selects email, so a name-less member can't leak an address onto a slide.
    expect(mocks.packageRows.mock.calls[0][0].select.members.select.user.select).toEqual({ name: true, nickname: true });
  });

  it("falls back to scheduled announcements when there is no teleprompter script", async () => {
    mocks.teleprompterDoc.mockResolvedValue(null);
    mocks.fetchSubmitted.mockRejectedValue(new Error("sheet down"));
    mocks.collegeVisit.mockResolvedValue(null);
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { data } = await (await GET(new Request(`${URL_BASE}?date=2026-09-25`))).json();
    expect(data.announcements).toEqual([]);
    expect(data.announcementSource).toBe("submissions");
    expect(mocks.fetchSubmitted).toHaveBeenCalled();
  });

  it("summarizes announcements in order with Gemini", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    mocks.generateContent.mockResolvedValue({
      text: JSON.stringify({ summaries: [{ index: 1, text: "Blood drive Friday." }, { index: 0, text: "Club Fair Thursday in the Quad" }] })
    });
    const res = await POST(post({ announcements: ["Club Fair is Thursday in the Quad.", "The blood drive is Friday."] }));
    expect(res.status).toBe(200);
    expect((await res.json()).data.summaries).toEqual(["Club Fair Thursday in the Quad", "Blood drive Friday"]);
    expect(mocks.generateContent.mock.calls[0][0].contents).toContain("12 words or fewer");
  });

  it("says so plainly when Gemini fails", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    mocks.generateContent.mockRejectedValue(new Error("quota"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await POST(post({ announcements: ["Club Fair is Thursday."] }));
    expect(res.status).toBe(502);
    expect((await res.json()).error.message).toMatch(/Couldn’t summarize/);
  });

  it("validates the summary request and rate-limits it", async () => {
    expect((await POST(post({ announcements: [] }))).status).toBe(400);
    mocks.limitByKey.mockReturnValue({ allowed: false });
    expect((await POST(post({ announcements: ["x"] }))).status).toBe(429);
  });
});
