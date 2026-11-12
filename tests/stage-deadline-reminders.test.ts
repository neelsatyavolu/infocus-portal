import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cycleFindMany: vi.fn(),
  rowFindMany: vi.fn(),
  userFindMany: vi.fn(),
  noticeCreate: vi.fn(),
  sendBrandedEmails: vi.fn(),
  sendPushToUserIds: vi.fn()
}));

vi.mock("@/src/lib/prisma", () => ({
  prisma: {
    packageCycle: { findMany: mocks.cycleFindMany },
    packageProgressRow: { findMany: mocks.rowFindMany },
    user: { findMany: mocks.userFindMany },
    packageReviewNotice: { create: mocks.noticeCreate }
  }
}));
vi.mock("@/src/lib/email", () => ({ sendBrandedEmails: mocks.sendBrandedEmails }));
vi.mock("@/src/server/push-notify", () => ({ sendPushToUserIds: mocks.sendPushToUserIds }));
vi.mock("@/src/server/program-settings", () => ({ getCycleNumbers: vi.fn().mockResolvedValue([1, 2, 3]) }));

import {
  runStageDeadlineReminders,
  selectStageDeadlineReminders,
  stageDeadlineReminderKey,
  type DeadlineCycle,
  type DeadlineRow
} from "@/src/server/stage-deadline-reminders";

const utc = (dateKey: string) => new Date(`${dateKey}T00:00:00.000Z`);
// Wednesday, November 11, 2026, 7:30 AM PST (UTC-8).
const NOW = new Date("2026-11-11T07:30:00-08:00");

const cycle: DeadlineCycle = {
  cycleNumber: 2,
  pitchingDate: utc("2026-11-12"),
  proofOfContactDate: utc("2026-11-16"),
  aRollBRollDate: utc("2026-11-12"),
  initialCutDate: utc("2026-11-20"),
  finalCutDate: utc("2026-11-30")
};

function row(overrides: Partial<DeadlineRow> = {}): DeadlineRow {
  return {
    id: "row-1",
    cycleNumber: 2,
    groupTopic: "Robotics",
    extension: false,
    extensionRequests: [],
    pitching: true,
    proofOfContact: false,
    aRollBRoll: false,
    initialCut: false,
    finalCut: false,
    brainstormDocUrl: "",
    proofOfContactCount: 0,
    hasARollMedia: false,
    initialCutMediaItemId: null,
    finalCutMediaItemId: null,
    memberUserIds: ["abby", "otto", "sage"],
    ...overrides
  };
}

describe("selectStageDeadlineReminders", () => {
  it("reminds every member of a stage due tomorrow that isn't turned in", () => {
    const reminders = selectStageDeadlineReminders({ cycles: [cycle], rows: [row()], dueDateKey: "2026-11-12" });
    // Pitching is due tomorrow too, but a producer already marked it.
    expect(reminders).toHaveLength(1);
    expect(reminders[0]).toMatchObject({ rowId: "row-1", stage: "a-roll", userIds: ["abby", "otto", "sage"] });
  });

  it("skips a stage the group already turned in, even before approval", () => {
    expect(
      selectStageDeadlineReminders({ cycles: [cycle], rows: [row({ hasARollMedia: true })], dueDateKey: "2026-11-12" })
    ).toEqual([]);
  });

  it("moves each member's deadline by their own approved extension days", () => {
    const rows = [
      row({
        extension: true,
        // Otto has 1 day, Sage half a day (closes at 11:59 AM on the 13th); Abby isn't covered.
        extensionRequests: [
          { requestedDays: 1, grantedDays: 1, grantedUserIds: ["otto"] },
          { requestedDays: 0.5, grantedDays: 0.5, grantedUserIds: ["sage"] }
        ]
      })
    ];
    const tomorrow = selectStageDeadlineReminders({ cycles: [cycle], rows, dueDateKey: "2026-11-12" });
    expect(tomorrow.map((reminder) => reminder.userIds)).toEqual([["abby"]]);
    const dayAfter = selectStageDeadlineReminders({ cycles: [cycle], rows, dueDateKey: "2026-11-13" });
    expect(dayAfter.map((reminder) => [reminder.stage, reminder.userIds])).toEqual([["a-roll", ["otto", "sage"]]]);
    // Quotes the latest close of the day: Otto's 11:59 PM.
    expect(dayAfter[0]!.closesAt.toISOString()).toBe("2026-11-14T07:59:59.999Z");
  });

  it("checks proof of contact, the cuts, and pitching", () => {
    const dates = { ...cycle, aRollBRollDate: null, proofOfContactDate: utc("2026-11-12"), initialCutDate: utc("2026-11-12"), finalCutDate: utc("2026-11-12") };
    const stages = (overrides: Partial<DeadlineRow>) =>
      selectStageDeadlineReminders({ cycles: [dates], rows: [row(overrides)], dueDateKey: "2026-11-12" }).map(
        (reminder) => reminder.stage
      );
    expect(stages({ pitching: false })).toEqual(["pitching", "brainstorming", "initial-cut", "final-cut"]);
    expect(
      stages({ brainstormDocUrl: "https://docs.google.com/document/d/abc/edit", proofOfContactCount: 3, initialCutMediaItemId: "m1", finalCutMediaItemId: "m2" })
    ).toEqual([]);
  });

  it("builds one dedupe key per group, stage and due date", () => {
    expect(stageDeadlineReminderKey("row-1", "a-roll", "2026-11-12")).toBe("deadline:a-roll:2026-11-12:row-1");
  });
});

describe("runStageDeadlineReminders", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.cycleFindMany.mockResolvedValue([cycle, { ...cycle, cycleNumber: 1, pitchingDate: utc("2026-08-01"), proofOfContactDate: null, aRollBRollDate: null, initialCutDate: null, finalCutDate: utc("2026-09-29") }]);
    mocks.rowFindMany.mockResolvedValue([
      {
        id: "row-1",
        cycleNumber: 2,
        groupTopic: "Robotics",
        extension: false,
        pitching: true,
        proofOfContact: false,
        aRollBRoll: false,
        initialCut: false,
        finalCut: false,
        brainstormDocUrl: "",
        initialCutMediaItemId: null,
        finalCutMediaItemId: null,
        extensionRequests: [],
        _count: { proofOfContacts: 0 },
        stageMedia: [],
        members: [{ userId: "abby" }, { userId: "otto" }, { userId: "gone" }]
      }
    ]);
    mocks.userFindMany.mockResolvedValue([
      { id: "abby", email: "abby@example.edu", notificationPreference: null },
      { id: "otto", email: "otto@example.edu", notificationPreference: { notificationEmail: "otto.home@example.edu" } },
      { id: "gone", email: null, notificationPreference: null }
    ]);
    mocks.noticeCreate.mockResolvedValue({});
    mocks.sendBrandedEmails.mockResolvedValue({ configured: true, sent: 2, failed: 0 });
    mocks.sendPushToUserIds.mockResolvedValue({ sent: 0, failed: 0 });
  });

  it("emails and pushes the members once, skipping removed accounts", async () => {
    const result = await runStageDeadlineReminders(NOW);
    expect(result).toEqual({ dueDateKey: "2026-11-12", due: 1, sent: 1 });
    // Only the cycle with a date in range is loaded.
    expect(mocks.rowFindMany.mock.calls[0][0].where).toEqual({ cycleNumber: { in: [2] } });
    expect(mocks.noticeCreate).toHaveBeenCalledWith({
      data: { progressRowId: "row-1", stage: "DRAFT", mediaVersionId: "deadline:a-roll:2026-11-12:row-1" }
    });
    const mail = mocks.sendBrandedEmails.mock.calls[0][0];
    expect(mail.recipients).toEqual(["abby@example.edu", "otto.home@example.edu"]);
    expect(mail.subject).toBe("Due tomorrow: A-roll/B-roll — Robotics");
    expect(mail.paragraphs[0]).toMatch(/due Thursday, November 12 at 11:59 PM Pacific/);
    expect(mail.ctaUrl).toMatch(/\/a-roll$/);
    expect(mail.idempotencyKey).toBe("stage-deadline-reminder/deadline:a-roll:2026-11-12:row-1");
    expect(mocks.sendPushToUserIds).toHaveBeenCalledWith(["abby", "otto"], expect.objectContaining({ url: "/a-roll" }), "browser");
  });

  it("sends nothing when the reminder was already claimed", async () => {
    mocks.noticeCreate.mockRejectedValue(new Error("Unique constraint failed"));
    const result = await runStageDeadlineReminders(NOW);
    expect(result.sent).toBe(0);
    expect(mocks.sendBrandedEmails).not.toHaveBeenCalled();
    expect(mocks.sendPushToUserIds).not.toHaveBeenCalled();
  });
});
