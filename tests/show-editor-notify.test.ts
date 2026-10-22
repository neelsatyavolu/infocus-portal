import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  heartbeatUpdate: vi.fn(), settingsUpsert: vi.fn(),
  jobs: vi.fn(), create: vi.fn(), latestJob: vi.fn(),
  publication: vi.fn(),
  user: vi.fn(), users: vi.fn(),
  recordings: vi.fn(),
  managers: vi.fn(), managerEmail: vi.fn(),
  email: vi.fn(), push: vi.fn(), roles: vi.fn()
}));

vi.mock("@/src/lib/prisma", () => ({ prisma: {
  showEditorSettings: { updateMany: mocks.heartbeatUpdate, upsert: mocks.settingsUpsert },
  showEditJob: { findMany: mocks.jobs, create: mocks.create, findFirst: mocks.latestJob },
  showPublication: { findUnique: mocks.publication },
  user: { findUnique: mocks.user, findMany: mocks.users },
  platformRoleAssignment: { findMany: mocks.roles }
} }));
vi.mock("@/src/server/show-editor-drive", () => ({ listShowRecordings: mocks.recordings }));
vi.mock("@/src/server/show-schedule", () => ({ loadScheduleOverrides: async () => new Map() }));
vi.mock("@/src/server/show-manager", () => ({ resolveShowManagers: mocks.managers, findShowManagerEmail: mocks.managerEmail }));
vi.mock("@/src/lib/email", () => ({ sendBrandedEmails: mocks.email }));
vi.mock("@/src/server/push-notify", () => ({ sendPushToUserIds: mocks.push }));

import { nextUpcomingShowDate } from "@/src/lib/show-assignment";
import {
  notifyShowEdit, notifyShowEditEscalation, runShowEditAutoStart, runShowEditReminders, shortShowDate
} from "@/src/server/show-editor-notify";

// Tuesday 2026-10-20, 3 PM Pacific: filmed this morning, airs on the next show day.
const NOW = new Date("2026-10-20T22:00:00Z");
const NEXT_SHOW = nextUpcomingShowDate("2026-10-20", new Map(), { includeToday: false })!;

/** The TriCaster names exports after the AIRING date. */
const SHOW_NAME = `InFocus Show ${NEXT_SHOW.slice(5, 7)}-${NEXT_SHOW.slice(8)}-${NEXT_SHOW.slice(0, 4)}`;

function recording(overrides: Record<string, unknown> = {}) {
  const name = (overrides.name as string | undefined) ?? `${SHOW_NAME}.mov`;
  return { path: `Shows/${name}`, name, size: 345_000_000,
    modifiedAt: "2026-10-20T18:00:00.000Z", stable: true, folder: null, ...overrides };
}

function job(overrides: Record<string, unknown> = {}) {
  return {
    id: "job1", showDate: "2026-10-21", status: "REVIEW", createdById: "starter", version: 1, error: null,
    decisions: [], needsReview: false, ...overrides
  } as never;
}

describe("show editor notifications and auto-start", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.heartbeatUpdate.mockResolvedValue({ count: 1 });
    mocks.jobs.mockResolvedValue([]);
    mocks.create.mockResolvedValue({});
    mocks.publication.mockResolvedValue(null);
    mocks.recordings.mockResolvedValue([recording()]);
    mocks.managers.mockResolvedValue({ pool: [], managers: { [NEXT_SHOW]: { name: "Sage Smith" }, "2026-10-21": { name: "Sage Smith" } } });
    mocks.managerEmail.mockResolvedValue("manager@example.edu");
    mocks.user.mockResolvedValue({ email: "starter@example.edu", notificationPreference: null });
    mocks.users.mockResolvedValue([{ id: "manager-id", email: "manager@example.edu" }]);
    mocks.email.mockResolvedValue({ configured: true, sent: 2, failed: 0 });
    mocks.push.mockResolvedValue({ sent: 1, failed: 0 });
    mocks.roles.mockResolvedValue([]);
  });

  it("auto-start creates one job from every settled file named after the show, all on Auto", async () => {
    mocks.recordings.mockResolvedValue([
      recording({ name: `${SHOW_NAME} (1).mov`, modifiedAt: "2026-10-20T18:30:00.000Z", size: 2 }),
      recording({ size: 1 }),
      recording({ name: "InFocus Show.mov", size: 3 }),
      recording({ name: `${SHOW_NAME} EDITED.mov`, size: 4 })
    ]);
    await runShowEditAutoStart(NOW);
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(mocks.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      showDate: NEXT_SHOW, createdById: "manager-id", checks: { autoStarted: true },
      sourcePaths: [{ path: `Shows/${SHOW_NAME}.mov`, role: "auto" }, { path: `Shows/${SHOW_NAME} (1).mov`, role: "auto" }]
    }) });
  });

  it("auto-start waits for files still changing, and 10 more minutes after the newest of several", async () => {
    mocks.recordings.mockResolvedValue([recording({ modifiedAt: new Date(NOW.getTime() - 5 * 60_000).toISOString() })]);
    await runShowEditAutoStart(NOW);
    expect(mocks.create).not.toHaveBeenCalled();

    // Two exports, the newest settled for 15 minutes: one file would start, two wait until 20.
    mocks.recordings.mockResolvedValue([
      recording({ size: 1, modifiedAt: new Date(NOW.getTime() - 60 * 60_000).toISOString() }),
      recording({ name: `${SHOW_NAME} (1).mov`, size: 2, modifiedAt: new Date(NOW.getTime() - 15 * 60_000).toISOString() })
    ]);
    await runShowEditAutoStart(NOW);
    expect(mocks.create).not.toHaveBeenCalled();
    await runShowEditAutoStart(new Date(NOW.getTime() + 5 * 60_000));
    expect(mocks.create).toHaveBeenCalledTimes(1);
  });

  it("auto-start skips dates that already have a job", async () => {
    mocks.jobs.mockResolvedValue([{ id: "old", status: "CANCELLED" }]);
    await runShowEditAutoStart(NOW);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("auto-start skips a show already sent to YouTube", async () => {
    mocks.publication.mockResolvedValue({ status: "SCHEDULED" });
    await runShowEditAutoStart(NOW);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("auto-start looks at Drive at most every 5 minutes", async () => {
    mocks.heartbeatUpdate.mockResolvedValue({ count: 0 });
    await runShowEditAutoStart(NOW);
    expect(mocks.recordings).not.toHaveBeenCalled();
    expect(mocks.heartbeatUpdate).toHaveBeenCalledWith({
      where: { id: "editor", OR: [{ lastAutoStartCheckAt: null }, { lastAutoStartCheckAt: { lt: new Date(NOW.getTime() - 5 * 60_000) } }] },
      data: { lastAutoStartCheckAt: NOW }
    });
  });

  it("review and failure notify the starter and show manager, linking to that date on Editing", async () => {
    await notifyShowEdit(job(), "review");
    expect(mocks.email).toHaveBeenCalledWith(expect.objectContaining({
      recipients: ["starter@example.edu", "manager@example.edu"],
      ctaLabel: "Open Editing",
      ctaUrl: expect.stringMatching(/\/editing\?date=2026-10-21$/),
      idempotencyKey: "show-edit/job1/review/1"
    }));
    expect(mocks.push).toHaveBeenCalledWith(["starter", "manager-id"], expect.objectContaining({ url: expect.stringMatching(/\/editing\?date=2026-10-21$/) }));

    mocks.email.mockClear();
    await notifyShowEdit(job({ status: "FAILED", error: "This is the SD capture; pick the HD recording." }), "failed");
    const failed = mocks.email.mock.calls[0][0];
    expect(failed.subject).toMatch(/failed/i);
    expect(failed.paragraphs.join(" ")).toContain("This is the SD capture; pick the HD recording.");
    expect(failed.paragraphs.join(" ")).toContain("Open Editing to try again with Redo");
    expect(failed.ctaUrl).toMatch(/\/editing\?date=2026-10-21$/);
  });

  it("an auto-started edit notifies only the show manager, never the account it was started under", async () => {
    await notifyShowEdit(job({ createdById: "manager-or-adviser", checks: { autoStarted: true } }), "review");
    expect(mocks.user).not.toHaveBeenCalled();
    expect(mocks.email).toHaveBeenCalledWith(expect.objectContaining({ recipients: ["manager@example.edu"] }));
    expect(mocks.push).toHaveBeenCalledWith(["manager-id"], expect.anything());
  });

  describe("approval escalation notices", () => {
    beforeEach(() => {
      mocks.roles.mockResolvedValue([{ email: "Otto@Example.edu" }, { email: "sage@example.edu" }]);
      mocks.managers.mockResolvedValue({ pool: [], managers: { "2026-10-23": { name: "Sage Smith" } } });
      mocks.users.mockImplementation(async ({ where }) => (where.OR
        ? [
            { id: "otto-id", email: "otto@example.edu", notificationPreference: { notificationEmail: "otto.alerts@example.edu" } },
            { id: "sage-id", email: "sage@example.edu", notificationPreference: null }
          ]
        : [{ id: "manager-id", email: "manager@example.edu" }]));
    });

    it("the escalation goes to every producer, at their notification address, once per version", async () => {
      await notifyShowEditEscalation(job({ showDate: "2026-10-23", version: 2 }), { kind: "escalate" });
      const sent = mocks.email.mock.calls[0][0];
      expect(sent.recipients).toEqual(expect.arrayContaining(["otto.alerts@example.edu", "sage@example.edu"]));
      expect(sent.recipients).not.toContain("starter@example.edu");
      expect(sent.subject).toBe("The Fri, Oct 23 show still needs approval");
      expect(sent.paragraphs.join(" ")).toContain("the show manager hasn't responded");
      expect(sent.paragraphs.join(" ")).toContain("scheduled automatically at 8:00 AM on show day");
      expect(sent.idempotencyKey).toBe("show-edit/job1/escalate/2");
      expect(sent.ctaUrl).toMatch(/\/editing\?date=2026-10-23$/);
      expect(mocks.push).toHaveBeenCalledWith(["otto-id", "sage-id"], expect.anything());
    });

    it("the auto-schedule notice goes to the starter and show manager, with the publish time", async () => {
      await notifyShowEditEscalation(job({ showDate: "2026-10-23" }), { kind: "auto-scheduled", publishAt: new Date("2026-10-23T15:30:00Z") });
      const sent = mocks.email.mock.calls[0][0];
      expect(sent.recipients).toEqual(["starter@example.edu", "manager@example.edu"]);
      expect(sent.paragraphs[0]).toBe("The Fri, Oct 23 show was scheduled automatically because nobody approved it by 8:00 AM. It publishes at 8:30 AM.");
    });

    it("a failed auto-schedule tells the starter, show manager and producers why", async () => {
      await notifyShowEditEscalation(job({ showDate: "2026-10-23" }), { kind: "auto-schedule-failed", reason: "Pick a season first: use Change details." });
      const sent = mocks.email.mock.calls[0][0];
      expect(sent.recipients).toEqual(expect.arrayContaining(["starter@example.edu", "manager@example.edu", "otto.alerts@example.edu", "sage@example.edu"]));
      expect(sent.paragraphs.join(" ")).toContain("Pick a season first: use Change details.");
    });

    it("never throws", async () => {
      mocks.roles.mockRejectedValue(new Error("db down"));
      await expect(notifyShowEditEscalation(job(), { kind: "escalate" })).resolves.toBeUndefined();
    });

    it("short show dates read like Fri, Oct 23", () => {
      expect(shortShowDate("2026-10-23")).toBe("Fri, Oct 23");
    });
  });

  it("a flagged edit names the first flagged decision", async () => {
    await notifyShowEdit(job({ needsReview: true, decisions: [
      { kind: "name", detail: "Roster spelling", flagged: false },
      { kind: "package", detail: "No package was queued; used a placeholder.", flagged: true }
    ] }), "needs-review");
    expect(mocks.email.mock.calls[0][0].paragraphs.join(" ")).toContain("No package was queued; used a placeholder.");
  });

  it("a missing package is the flag the email leads with, even when it isn't the first", async () => {
    await notifyShowEdit(job({ needsReview: true, decisions: [
      { kind: "name", detail: "Guessed an anchor's spelling.", flagged: true },
      { kind: "package", detail: "The anchors throw to a package, but none is queued.", flagged: true }
    ] }), "needs-review");
    const text = mocks.email.mock.calls[0][0].paragraphs.join(" ");
    expect(text).toContain("The anchors throw to a package, but none is queued.");
    expect(text).not.toContain("Guessed an anchor's spelling.");
  });

  it("a notification failure never throws", async () => {
    mocks.email.mockRejectedValue(new Error("Resend down"));
    await expect(notifyShowEdit(job(), "review")).resolves.toBeUndefined();
  });

  describe("18:00 reminder", () => {
    // 6 PM Pacific the evening before NEXT_SHOW.
    const evening = new Date(`${NEXT_SHOW}T01:00:00Z`);

    it("18:00 reminder fires once for unscheduled shows", async () => {
      mocks.latestJob.mockResolvedValue(job({ showDate: NEXT_SHOW, status: "REVIEW" }));
      mocks.publication.mockResolvedValue({ status: "DRAFT" });
      const result = await runShowEditReminders(evening);
      expect(result).toEqual({ sent: 1, date: NEXT_SHOW });
      expect(mocks.email).toHaveBeenCalledWith(expect.objectContaining({
        idempotencyKey: `show-edit-reminder/${NEXT_SHOW}`,
        ctaUrl: expect.stringMatching(new RegExp(`/editing\\?date=${NEXT_SHOW}$`))
      }));
      expect(mocks.push).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ url: expect.stringContaining(`/editing?date=${NEXT_SHOW}`) }));
    });

    it("no reminder once the show is scheduled, or when no edit was started", async () => {
      mocks.latestJob.mockResolvedValue(job({ showDate: NEXT_SHOW, status: "PUBLISHED" }));
      mocks.publication.mockResolvedValue({ status: "SCHEDULED" });
      expect((await runShowEditReminders(evening)).sent).toBe(0);
      mocks.latestJob.mockResolvedValue(null);
      mocks.publication.mockResolvedValue(null);
      expect((await runShowEditReminders(evening)).sent).toBe(0);
      expect(mocks.email).not.toHaveBeenCalled();
    });
  });
});
