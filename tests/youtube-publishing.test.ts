import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  row: vi.fn(), update: vi.fn(), upsert: vi.fn(), token: vi.fn(), progress: vi.fn(), chunk: vi.fn(), check: vi.fn(),
  source: vi.fn(), emails: vi.fn(), emailUpdate: vi.fn(), send: vi.fn(), manager: vi.fn(), managers: vi.fn(), rows: vi.fn()
}));
vi.mock("@/src/lib/prisma", () => ({ prisma: {
  packageProgressRow: { findUnique: mocks.row, findMany: mocks.rows },
  publishingManager: { findUnique: mocks.manager, findMany: mocks.managers },
  youtubePublication: { update: mocks.update, upsert: mocks.upsert },
  youtubePublicationEmail: { findMany: mocks.emails, update: mocks.emailUpdate }
} }));
vi.mock("@/src/lib/media-playback", () => ({ resolveOriginalDownloadUrl: mocks.source }));
vi.mock("@/src/lib/email", () => ({ sendPreparedEmail: mocks.send }));
vi.mock("@/src/server/youtube-client", async (original) => ({
  ...await original<typeof import("@/src/server/youtube-client")>(),
  youtubePublishingConfig: () => ({ channelId: "channel", startDate: "2026-09-19", hour: 0 }),
  youtubeAccessToken: mocks.token, readUploadProgress: mocks.progress, uploadYoutubeChunk: mocks.chunk,
  checkYoutubeVideo: mocks.check
}));
import { advanceYoutubePublication, dueYoutubePackageIds } from "@/src/server/youtube-publishing";
import { deliverPublicationEmails, publicationEmailPayload } from "@/src/server/youtube-publication-email";

describe("publication retries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.token.mockResolvedValue("token");
    mocks.update.mockResolvedValue({});
    mocks.row.mockResolvedValue({ id: "row", queuedForAirAt: new Date(), queuedForShowDate: "2026-09-19",
      youtubePublication: { id: "pub", status: "UPLOADING", showDate: "2026-09-19", mediaVersionId: "v1", channelId: "channel", sourceSize: 20n, uploadSessionUrl: "session", videoId: null }
    });
  });
  it("saves a recovered video ID without uploading again", async () => {
    mocks.progress.mockResolvedValue({ offset: 20, videoId: "abcdefgh_12" });
    await advanceYoutubePublication("row", new Date("2026-09-19T12:00:00Z"));
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ videoId: "abcdefgh_12", status: "PROCESSING" }) }));
    expect(mocks.chunk).not.toHaveBeenCalled();
  });
  it("titles a new YouTube video with the Final Cut headline, else the topic", async () => {
    const version = { id: "v1", status: "READY", sourceType: "VIDEO", nasPath: "Package Storage/Cycle 1/Airport/Final Cut/airport final.mp4" };
    const base = { id: "row", groupTopic: "Airport", queuedForAirAt: new Date(), queuedForShowDate: "2026-09-19", youtubePublication: null };
    mocks.token.mockRejectedValue(new Error("stop after creating the publication"));
    mocks.upsert.mockResolvedValue({ id: "pub", channelId: "channel" });
    mocks.row.mockResolvedValue({ ...base, finalCutMediaItem: { title: "Palo Alto Airport Day brings the community together", currentVersion: version } });
    await advanceYoutubePublication("row", new Date("2026-09-19T12:00:00Z")).catch(() => undefined);
    expect(mocks.upsert).toHaveBeenLastCalledWith(expect.objectContaining({ create: expect.objectContaining({ title: "Palo Alto Airport Day brings the community together" }) }));
    mocks.row.mockResolvedValue({ ...base, finalCutMediaItem: { title: "airport final", currentVersion: version } });
    await advanceYoutubePublication("row", new Date("2026-09-19T12:00:00Z")).catch(() => undefined);
    expect(mocks.upsert).toHaveBeenLastCalledWith(expect.objectContaining({ create: expect.objectContaining({ title: "Airport" }) }));
  });
  it("does not start future or removed packages", async () => {
    mocks.row.mockResolvedValue({ queuedForAirAt: null });
    await advanceYoutubePublication("row");
    expect(mocks.token).not.toHaveBeenCalled();
    mocks.row.mockResolvedValue({ queuedForAirAt: new Date(), queuedForShowDate: "2027-09-19" });
    await advanceYoutubePublication("row", new Date("2026-09-19T12:00:00Z"));
    expect(mocks.token).not.toHaveBeenCalled();
  });
  it("pauses a partially uploaded package if its air date moves", async () => {
    const row = await mocks.row();
    row.queuedForShowDate = "2026-09-20";
    await advanceYoutubePublication("row", new Date("2026-09-21T12:00:00Z"));
    expect(mocks.progress).not.toHaveBeenCalled();
  });
  it("waits for processing before creating emails", async () => {
    const row = await mocks.row();
    row.youtubePublication.videoId = "abcdefgh_12";
    mocks.check.mockResolvedValue(false);
    await advanceYoutubePublication("row", new Date("2026-09-19T12:00:00Z"));
    expect(mocks.managers).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("commits a ready video and its recipient outbox together", async () => {
    vi.stubEnv("RESEND_API_KEY", "test-key");
    vi.stubEnv("RESEND_FROM_EMAIL", "InFocus <sender@example.test>");
    const row = await mocks.row();
    row.youtubePublication.videoId = "abcdefgh_12";
    row.youtubePublication.rowId = "row";
    row.youtubePublication.title = "Story";
    mocks.check.mockResolvedValue(true);
    mocks.managers.mockResolvedValue([{ userId: "manager", user: { email: "manager@example.test" } }]);
    mocks.emails.mockResolvedValue([]);
    await advanceYoutubePublication("row", new Date("2026-09-19T12:00:00Z"));
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      status: "PUBLISHED", emails: { createMany: { skipDuplicates: true, data: [expect.objectContaining({ recipientUserId: "manager", recipient: "manager@example.test" })] } }
    }) }));
    vi.unstubAllEnvs();
  });
});

describe("manager email delivery", () => {
  beforeEach(() => {
    vi.clearAllMocks(); mocks.emailUpdate.mockResolvedValue({});
    mocks.manager.mockResolvedValue({ user: { email: "manager@example.test" } });
  });
  it("uses a stable idempotency key and marks only successful sends", async () => {
    const payload = { from: "sender@example.test", to: "manager@example.test", subject: "Published", html: "html", text: "text" };
    mocks.emails.mockResolvedValue([{ id: "email1", recipientUserId: "manager", recipient: "manager@example.test", payload, firstAttemptAt: null }]);
    mocks.send.mockResolvedValue({ id: "sent" });
    await deliverPublicationEmails("pub");
    expect(mocks.send).toHaveBeenCalledWith(payload, "youtube-publication/email1");
    expect(mocks.emailUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ sentAt: expect.any(Date) }) }));
  });
  it("stops uncertain delivery after the provider deduplication window", async () => {
    mocks.emails.mockResolvedValue([{ id: "email1", recipientUserId: "manager", recipient: "manager@example.test", firstAttemptAt: new Date("2026-09-19T00:00:00Z") }]);
    await deliverPublicationEmails("pub", new Date("2026-09-20T00:00:00Z"));
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.emailUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: { lastError: expect.stringContaining("Check Resend") } }));
  });
  it("cancels queued emails after a manager is removed", async () => {
    mocks.emails.mockResolvedValue([{ id: "email1", recipientUserId: "manager", recipient: "manager@example.test", firstAttemptAt: null }]);
    mocks.manager.mockResolvedValue(null);
    await deliverPublicationEmails("pub");
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.emailUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ cancelledAt: expect.any(Date) }) }));
  });
  it("does not mark failed sends as delivered", async () => {
    mocks.emails.mockResolvedValue([{ id: "email1", recipientUserId: "manager", recipient: "manager@example.test", firstAttemptAt: null,
      payload: { from: "sender@example.test", to: "manager@example.test", subject: "Published", html: "html", text: "text" } }]);
    mocks.send.mockRejectedValue(new Error("network failure"));
    await deliverPublicationEmails("pub");
    expect(mocks.emailUpdate.mock.calls.some(([args]) => args.data.sentAt)).toBe(false);
  });
  it("puts literal embed code in text and escaped embed code in HTML", () => {
    vi.stubEnv("RESEND_API_KEY", "test-key");
    vi.stubEnv("RESEND_FROM_EMAIL", "sender@example.test");
    const payload = publicationEmailPayload({ rowId: "row", title: "<script>unsafe</script>", showDate: "2026-09-19", videoId: "abcdefgh_12" }, "manager@example.test");
    expect(payload.text).toContain('<iframe width="560"');
    expect(payload.html).toContain("&lt;iframe");
    expect(payload.html).not.toContain("<script>");
    expect(payload.html).toContain("/publishing-queue/row");
    vi.unstubAllEnvs();
  });
});

it("discovers subsequent pages without repeatedly selecting the oldest stuck rows", async () => {
  mocks.rows.mockResolvedValue([{ id: "next" }]);
  expect(await dueYoutubePackageIds(new Date("2026-09-19T12:00:00Z"), "previous")).toEqual(["next"]);
  expect(mocks.rows).toHaveBeenCalledWith(expect.objectContaining({ cursor: { id: "previous" }, skip: 1, orderBy: { id: "asc" } }));
});
