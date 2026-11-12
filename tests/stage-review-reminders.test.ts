import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rowFindMany: vi.fn(),
  dockFindMany: vi.fn(),
  roleFindMany: vi.fn(),
  userFindMany: vi.fn(),
  sendBrandedEmails: vi.fn(),
  claimReviewNotice: vi.fn(),
  deliverProducerMail: vi.fn(),
  loadProgressRow: vi.fn(),
  resolveProducerRecipients: vi.fn(),
  loadRequiredFinalCutGraders: vi.fn()
}));

vi.mock("@/src/lib/prisma", () => ({
  prisma: {
    packageProgressRow: { findMany: mocks.rowFindMany },
    participationGradeRequest: { findMany: mocks.dockFindMany },
    platformRoleAssignment: { findMany: mocks.roleFindMany },
    user: { findMany: mocks.userFindMany }
  }
}));
vi.mock("@/src/lib/email", () => ({ sendBrandedEmails: mocks.sendBrandedEmails }));
vi.mock("@/src/server/package-cycle-stage", () => ({ resolveActiveCycleNumber: vi.fn().mockResolvedValue(2) }));
vi.mock("@/src/server/package-progress-data", () => ({ loadRequiredFinalCutGraders: mocks.loadRequiredFinalCutGraders }));
vi.mock("@/src/server/package-review-notify", () => ({
  claimReviewNotice: mocks.claimReviewNotice,
  deliverProducerMail: mocks.deliverProducerMail,
  loadProgressRow: mocks.loadProgressRow,
  resolveProducerRecipients: mocks.resolveProducerRecipients,
  memberNames: (members: Array<{ user: { name: string | null } }>) => members.map((member) => member.user.name).join(", ")
}));

import {
  aRollReminderKey,
  aRollWaitingSince,
  finalCutGradersOwing,
  finalCutReminderKey,
  reminderDueThisHour,
  runARollReviewReminders,
  runFinalCutGradingReminders,
  runParticipationDockReminders
} from "@/src/server/stage-review-reminders";

const at = (iso: string) => new Date(iso);
const score = (graderUserId: string, memberUserId: string | null) => ({
  graderUserId,
  memberUserId,
  points: 40,
  qualityPoints: 20,
  effortPoints: 20
});

describe("review reminder selection", () => {
  it("waits on the producer from the latest A-roll upload, unless feedback came after it", () => {
    const uploads = [at("2026-11-01T10:00:00Z"), at("2026-11-02T10:00:00Z")];
    expect(aRollWaitingSince({ approved: false, uploads, feedback: [] })).toEqual(at("2026-11-02T10:00:00Z"));
    expect(aRollWaitingSince({ approved: false, uploads, feedback: [at("2026-11-01T12:00:00Z")] })).toEqual(
      at("2026-11-02T10:00:00Z")
    );
    expect(aRollWaitingSince({ approved: false, uploads, feedback: [at("2026-11-02T11:00:00Z")] })).toBeNull();
    expect(aRollWaitingSince({ approved: true, uploads, feedback: [] })).toBeNull();
    expect(aRollWaitingSince({ approved: false, uploads: [], feedback: [] })).toBeNull();
  });

  it("lists graders who haven't scored every member, never members themselves", () => {
    const scores = [score("ep1", "abby"), score("ep1", "otto"), score("ep2", "abby"), score("ep3", null)];
    expect(
      finalCutGradersOwing({ graderIds: ["ep1", "ep2", "ep3", "ep4", "otto"], memberIds: ["abby", "otto"], scores })
    ).toEqual(["ep2", "ep4"]);
  });

  it("fires a receipt-less reminder only in the first hour of each 12-hour window", () => {
    const since = at("2026-11-01T08:00:00Z");
    expect(reminderDueThisHour(since, at("2026-11-01T19:59:00Z"))).toBeNull();
    expect(reminderDueThisHour(since, at("2026-11-01T20:00:00Z"))).toBe(1);
    expect(reminderDueThisHour(since, at("2026-11-01T20:59:00Z"))).toBe(1);
    expect(reminderDueThisHour(since, at("2026-11-01T21:00:00Z"))).toBeNull();
    expect(reminderDueThisHour(since, at("2026-11-02T08:30:00Z"))).toBe(2);
  });

  it("keys each reminder by upload and window", () => {
    expect(aRollReminderKey("link-1", 2)).toBe("a-roll-reminder:link-1:2");
    expect(finalCutReminderKey("v1", 1)).toBe("final-cut-reminder:v1:1");
  });
});

describe("review reminder runs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.claimReviewNotice.mockResolvedValue(true);
    mocks.deliverProducerMail.mockResolvedValue(undefined);
    mocks.sendBrandedEmails.mockResolvedValue({ configured: true, sent: 1, failed: 0 });
  });

  it("reminds the assigned producer about A-roll waiting 12 hours", async () => {
    mocks.rowFindMany.mockResolvedValue([
      {
        id: "row-1",
        stageMedia: [{ id: "link-1", createdAt: at("2026-11-01T08:00:00Z") }],
        stageComments: []
      },
      {
        id: "row-2",
        stageMedia: [{ id: "link-2", createdAt: at("2026-11-01T08:00:00Z") }],
        stageComments: [{ createdAt: at("2026-11-01T09:00:00Z") }]
      }
    ]);
    mocks.loadProgressRow.mockResolvedValue({ id: "row-1", cycleNumber: 2, groupTopic: "Robotics", members: [] });
    mocks.resolveProducerRecipients.mockResolvedValue({ emails: ["ap@example.edu"], userIds: ["ap"] });

    const result = await runARollReviewReminders(at("2026-11-01T21:00:00Z"));
    expect(result).toEqual({ checked: 2, sent: 1 });
    expect(mocks.claimReviewNotice).toHaveBeenCalledWith({
      progressRowId: "row-1",
      stage: "ASSOCIATE_REVIEW",
      mediaVersionId: "a-roll-reminder:link-1:1"
    });
    expect(mocks.resolveProducerRecipients).toHaveBeenCalledWith("ap", expect.anything());
    const delivery = mocks.deliverProducerMail.mock.calls[0][0];
    expect(delivery.path).toBe("/groups/row-1/a-roll");
    expect(delivery.content.subject).toMatch(/A-roll\/B-roll approval/);
  });

  it("skips an A-roll reminder already claimed", async () => {
    mocks.rowFindMany.mockResolvedValue([
      { id: "row-1", stageMedia: [{ id: "link-1", createdAt: at("2026-11-01T08:00:00Z") }], stageComments: [] }
    ]);
    mocks.claimReviewNotice.mockResolvedValue(false);
    expect(await runARollReviewReminders(at("2026-11-01T21:00:00Z"))).toEqual({ checked: 1, sent: 0 });
    expect(mocks.deliverProducerMail).not.toHaveBeenCalled();
  });

  it("reminds only the graders who still owe Final Cut scores", async () => {
    mocks.loadRequiredFinalCutGraders.mockResolvedValue([
      { userId: "ep1", email: "ep1@example.edu" },
      { userId: "ep2", email: "ep2@example.edu" }
    ]);
    mocks.rowFindMany.mockResolvedValue([
      {
        id: "row-1",
        cycleNumber: 1,
        groupTopic: "Robotics",
        finalCutMediaItem: { currentVersion: { id: "v1", createdAt: at("2026-11-01T08:00:00Z") } },
        finalCutScores: [score("ep1", "abby")],
        members: [{ userId: "abby", user: { name: "Abby", nickname: null, email: "abby@example.edu" } }]
      }
    ]);

    const result = await runFinalCutGradingReminders(at("2026-11-02T09:00:00Z"));
    expect(result).toEqual({ checked: 1, sent: 1 });
    expect(mocks.rowFindMany.mock.calls[0][0].where.cycleNumber).toEqual({ gte: 1 });
    expect(mocks.claimReviewNotice).toHaveBeenCalledWith({
      progressRowId: "row-1",
      stage: "EXECUTIVE_REVIEW",
      mediaVersionId: "final-cut-reminder:v1:2"
    });
    const delivery = mocks.deliverProducerMail.mock.calls[0][0];
    expect(delivery).toMatchObject({ emails: ["ep2@example.edu"], userIds: ["ep2"], path: "/groups/row-1/final-cut" });
    expect(delivery.content.paragraphs[0]).toMatch(/Final Cut grading for 24 hours/);
  });

  it("reminds reviewers of a pending participation dock, minus the requester", async () => {
    mocks.dockFindMany.mockResolvedValue([
      {
        id: "dock-1",
        createdAt: at("2026-11-01T08:00:00Z"),
        requestedBy: { email: "ep1@example.edu", name: "Otto Park", nickname: null },
        _count: { items: 3 }
      },
      {
        id: "dock-2",
        createdAt: at("2026-11-01T10:30:00Z"),
        requestedBy: { email: "ep1@example.edu", name: "Otto Park", nickname: null },
        _count: { items: 1 }
      }
    ]);
    mocks.roleFindMany.mockResolvedValue([{ email: "ep1@example.edu" }, { email: "ep2@example.edu" }]);
    mocks.userFindMany.mockResolvedValue([
      { email: "ep2@example.edu", notificationPreference: { notificationEmail: "ep2.home@example.edu" } }
    ]);

    const result = await runParticipationDockReminders(at("2026-11-01T20:15:00Z"));
    expect(result).toEqual({ checked: 2, sent: 1 });
    const mail = mocks.sendBrandedEmails.mock.calls[0][0];
    expect(mail.recipients).toContain("ep2.home@example.edu");
    expect(mail.recipients).not.toContain("ep1@example.edu");
    expect(mail.idempotencyKey).toBe("participation-dock-reminder/dock-1/1");
    expect(mail.paragraphs[0]).toMatch(/Otto Park submitted 3 participation scores 12 hours ago/);
  });
});
