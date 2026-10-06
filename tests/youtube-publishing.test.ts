import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  row: vi.fn(), update: vi.fn(), upsert: vi.fn(), token: vi.fn(), progress: vi.fn(), chunk: vi.fn(), check: vi.fn(),
  source: vi.fn(), emails: vi.fn(), emailUpdate: vi.fn(), send: vi.fn(), manager: vi.fn(), managers: vi.fn(), rows: vi.fn(),
  push: vi.fn(), event: vi.fn()
}));
vi.mock("@/src/lib/inngest", () => ({ inngest: { send: mocks.event } }));
vi.mock("@/src/lib/native-push", () => ({ sendNativePushToUserIds: mocks.push }));
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
import { advanceYoutubePublication, dueYoutubePackageIds, startYoutubePublication } from "@/src/server/youtube-publishing";
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
  it("keeps uploading a manually started package before its air date", async () => {
    const row = await mocks.row();
    row.queuedForShowDate = "2026-09-25";
    row.youtubePublication.showDate = "2026-09-25";
    mocks.progress.mockResolvedValue({ offset: 20, videoId: "abcdefgh_12" });
    expect(await advanceYoutubePublication("row", new Date("2026-09-19T12:00:00Z"))).toEqual({ more: true });
    expect(mocks.progress).toHaveBeenCalled();
  });
  it("pauses a partially uploaded package if its air date moves", async () => {
    const row = await mocks.row();
    row.queuedForShowDate = "2026-09-20";
    await advanceYoutubePublication("row", new Date("2026-09-21T12:00:00Z"));
    expect(mocks.progress).not.toHaveBeenCalled();
  });
  it("does not upload a published package again after it moves to a later show", async () => {
    mocks.emails.mockResolvedValue([]);
    mocks.row.mockResolvedValue({ id: "row", queuedForAirAt: new Date(), queuedForShowDate: "2026-10-07",
      finalCutMediaItem: { title: "Story", currentVersion: { id: "v2", status: "READY", sourceType: "VIDEO" } },
      youtubePublication: { id: "pub", status: "PUBLISHED", showDate: "2026-09-19", mediaVersionId: "v1", channelId: "channel", videoId: "abcdefgh_12" }
    });
    await advanceYoutubePublication("row", new Date("2026-10-07T12:00:00Z"));
    expect(mocks.upsert).not.toHaveBeenCalled();
    expect(mocks.token).not.toHaveBeenCalled();
    expect(mocks.chunk).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: expect.anything() }) }));
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

describe("manual publish", () => {
  const version = { id: "v1", status: "READY", sourceType: "VIDEO" };
  const futureRow = { id: "row", groupTopic: "Spirit Week", queuedForAirAt: new Date(), queuedForShowDate: "2027-01-05",
    youtubePublication: null, finalCutMediaItem: { title: "Spirit Week Day 1 Recap", currentVersion: version } };
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.upsert.mockResolvedValue({ id: "pub" });
    mocks.event.mockResolvedValue({});
  });
  it("pins the Final Cut for a future show and wakes the uploader", async () => {
    mocks.row.mockResolvedValue(futureRow);
    expect(await startYoutubePublication("row")).toBeNull();
    expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({ create: expect.objectContaining({
      rowId: "row", showDate: "2027-01-05", mediaVersionId: "v1" }) }));
    expect(mocks.event).toHaveBeenCalledWith({ name: "youtube/publication.advance", data: { rowId: "row" } });
  });
  it("still succeeds when the wake-up event fails, since the cron resumes started uploads", async () => {
    mocks.row.mockResolvedValue(futureRow);
    mocks.event.mockRejectedValue(new Error("inngest down"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(await startYoutubePublication("row")).toBeNull();
  });
  it("refuses unqueued, already started, and not-ready packages", async () => {
    mocks.row.mockResolvedValue({ ...futureRow, queuedForAirAt: null });
    expect(await startYoutubePublication("row")).toMatch(/show first/);
    mocks.row.mockResolvedValue({ ...futureRow, youtubePublication: { id: "pub", status: "UPLOADING" } });
    expect(await startYoutubePublication("row")).toMatch(/already/);
    mocks.row.mockResolvedValue({ ...futureRow, finalCutMediaItem: { title: "x", currentVersion: { ...version, status: "PROCESSING" } } });
    expect(await startYoutubePublication("row")).toMatch(/not ready/);
    expect(mocks.upsert).not.toHaveBeenCalled();
    expect(mocks.event).not.toHaveBeenCalled();
  });
  it("404s an unknown package", async () => {
    mocks.row.mockResolvedValue(null);
    await expect(startYoutubePublication("row")).rejects.toThrow("NOT_FOUND");
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
  it("notifies the manager's Mac once, after a successful send", async () => {
    const payload = { from: "sender@example.test", to: "manager@example.test", subject: "Published: Spirit Week", html: "html", text: "text" };
    mocks.emails.mockResolvedValue([{ id: "email1", recipientUserId: "manager", recipient: "manager@example.test", payload,
      firstAttemptAt: null, publication: { rowId: "row 1" } }]);
    mocks.send.mockResolvedValue({ id: "sent" });
    await deliverPublicationEmails("pub");
    expect(mocks.push).toHaveBeenCalledWith(["manager"], expect.objectContaining({
      title: "Published: Spirit Week",
      url: expect.stringMatching(/\/publishing-queue\/row%201$/)
    }));

    mocks.push.mockClear();
    mocks.send.mockRejectedValue(new Error("network failure"));
    await deliverPublicationEmails("pub");
    expect(mocks.push).not.toHaveBeenCalled();
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
