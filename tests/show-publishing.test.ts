import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  find: vi.fn(), findFirst: vi.fn(), upsert: vi.fn(), updateMany: vi.fn(),
  calendar: vi.fn(), show: vi.fn(), rows: vi.fn(),
  mint: vi.fn(), download: vi.fn(), send: vi.fn(), size: vi.fn(), token: vi.fn(), playlists: vi.fn(),
  configured: { value: true }
}));

vi.mock("@/src/lib/prisma", () => ({ prisma: {
  showPublication: { findUnique: mocks.find, findFirst: mocks.findFirst, upsert: mocks.upsert, updateMany: mocks.updateMany },
  masterCalendarEntry: { findUnique: mocks.calendar },
  showRolesShow: { findUnique: mocks.show },
  packageProgressRow: { findMany: mocks.rows }
} }));
vi.mock("@/src/lib/inngest", () => ({ inngest: { send: mocks.send, createFunction: vi.fn() } }));
vi.mock("@/src/lib/nas-storage", async (original) => ({
  ...await original<typeof import("@/src/lib/nas-storage")>(),
  isNasStorageEnabled: () => true,
  nasMintUploadSession: mocks.mint,
  nasMintDownloadUrl: mocks.download
}));
vi.mock("@/src/server/youtube-client", async (original) => ({
  ...await original<typeof import("@/src/server/youtube-client")>(),
  youtubePublishingConfig: () => (mocks.configured.value ? { channelId: "channel" } : null),
  youtubeAccessToken: mocks.token, listYoutubePlaylists: mocks.playlists, sourceVideoSize: mocks.size
}));

import { confirmShowPublication, initShowUpload, showPublicationState } from "@/src/server/show-publishing";

const NOW = new Date("2026-09-21T20:00:00Z");
const draft = { id: "pub", showDate: "2026-09-22", status: "DRAFT", nasPath: "Package Storage/Shows/2026-09-22/show.mp4" };
const confirmInput = {
  userId: "u1", showDate: "2026-09-22", title: "InFocus News | Tuesday, September 22nd, 2026",
  description: "Anchors …", publishDate: "2026-09-22", publishTime: "08:30", seasonNumber: 31
};

describe("show publishing service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.configured.value = true;
    mocks.calendar.mockResolvedValue(null);
    mocks.show.mockResolvedValue({ anchors: ["Abby Ames", "Otto Ortiz"] });
    mocks.rows.mockResolvedValue([
      { groupTopic: "school board decisions", members: [{ user: { name: "Sage Smith", nickname: null, email: "s@example.edu" } }] }
    ]);
    mocks.findFirst.mockResolvedValue(null);
    mocks.token.mockResolvedValue("token");
    mocks.playlists.mockResolvedValue([
      { id: "PL30", title: "InFocus News | Season 30" }, { id: "PL31", title: "InFocus News | Season 31" },
      { id: "X", title: "Other" }
    ]);
  });

  it("builds draft defaults from anchors, queued packages, and the highest season", async () => {
    mocks.find.mockResolvedValue(null);
    const state = await showPublicationState("2026-09-22");
    expect(state.defaults).toEqual({
      title: "InFocus News | Tuesday, September 22nd, 2026",
      description: "Anchors Abby Ames and Otto Ortiz share campus announcements. InFocus reporter Sage Smith shares news of school board decisions.",
      publishDate: "2026-09-22",
      publishTime: "08:30",
      seasonNumber: 31,
      existingSeasons: [31, 30]
    });
  });

  it("suggests a new season on the first show of a new semester", async () => {
    mocks.find.mockResolvedValue(null);
    mocks.findFirst.mockResolvedValue({ seasonNumber: 31, semesterLabel: "2026-27 S1" });
    const state = await showPublicationState("2027-01-12");
    expect(state.defaults?.seasonNumber).toBe(32);
  });

  it("never exposes the upload session", async () => {
    mocks.find.mockResolvedValue({ ...draft, status: "UPLOADING", uploadSessionUrl: "secret", title: "t", description: "d",
      publishAt: new Date("2026-09-22T15:30:00Z"), seasonNumber: 31, videoId: null, lastError: null });
    const state = await showPublicationState("2026-09-22");
    expect(JSON.stringify(state)).not.toContain("secret");
    expect(state.defaults).toBeNull();
  });

  it("refuses a new upload once the show was sent to YouTube", async () => {
    mocks.find.mockResolvedValue({ ...draft, status: "SCHEDULED" });
    await expect(initShowUpload({ userId: "u1", showDate: "2026-09-22", fileName: "show.mp4" }))
      .rejects.toMatchObject({ status: 409 });
    expect(mocks.mint).not.toHaveBeenCalled();
  });

  it("creates a draft pointing at the new Drive file", async () => {
    mocks.find.mockResolvedValue(null);
    mocks.mint.mockResolvedValue({ path: "Package Storage/Shows/2026-09-22/show-x.mp4", uploadUrl: "u" });
    await initShowUpload({ userId: "u1", showDate: "2026-09-22", fileName: "show.mp4" });
    expect(mocks.mint.mock.calls[0][0]).toMatch(/^Package Storage\/Shows\/2026-09-22\/show-[a-z0-9]+\.mp4$/);
    expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ showDate: "2026-09-22", nasPath: "Package Storage/Shows/2026-09-22/show-x.mp4" })
    }));
  });

  it("confirms a draft, pins metadata, and starts the worker", async () => {
    mocks.find.mockResolvedValueOnce(draft).mockResolvedValue({ ...draft, status: "UPLOADING", title: "t", description: "d",
      publishAt: new Date("2026-09-22T15:30:00Z"), seasonNumber: 31, videoId: null, lastError: null });
    mocks.size.mockResolvedValue(100);
    mocks.updateMany.mockResolvedValue({ count: 1 });
    await confirmShowPublication(confirmInput, NOW);
    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: { id: "pub", status: "DRAFT" },
      data: expect.objectContaining({
        status: "UPLOADING", publishAt: new Date("2026-09-22T15:30:00Z"), seasonNumber: 31,
        semesterLabel: "2026-27 S1", channelId: "channel"
      })
    });
    expect(mocks.send).toHaveBeenCalledWith({ name: "youtube/show-publication.advance", data: { id: "pub" } });
  });

  it("rejects a past publish time and an unfinished Drive upload", async () => {
    mocks.find.mockResolvedValue(draft);
    await expect(confirmShowPublication({ ...confirmInput, publishDate: "2026-09-20" }, NOW))
      .rejects.toThrow("future");
    mocks.size.mockRejectedValue(new Error("no range"));
    await expect(confirmShowPublication(confirmInput, NOW)).rejects.toThrow("InFocus Drive");
    expect(mocks.send).not.toHaveBeenCalled();
  });
});
