import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  packageGrade: { findMany: vi.fn(), findUnique: vi.fn(), findUniqueOrThrow: vi.fn(), upsert: vi.fn() },
  packageProgressRow: { findMany: vi.fn(), findFirst: vi.fn() },
  portfolioGrade: { findMany: vi.fn(), findUnique: vi.fn() },
  user: { findMany: vi.fn(), findUnique: vi.fn() },
  platformRoleAssignment: { findMany: vi.fn() },
  participationEntry: { findMany: vi.fn() },
  packageCycle: { findMany: vi.fn(), findUnique: vi.fn(), createMany: vi.fn() },
  schoolCalendarDay: { findMany: vi.fn() },
  packageGradeHistoryEvent: { create: vi.fn() },
  $transaction: vi.fn()
}));
const actor = vi.hoisted(() => ({ role: "EXECUTIVE_PRODUCER" as string | null }));
vi.mock("@/src/lib/auth", () => ({ requireUserId: vi.fn(async () => "editor"), syncUserProfile: vi.fn(async () => ({ email: "editor@example.com" })) }));
vi.mock("@/src/lib/email", () => ({ sendGradeEmails: vi.fn() }));
vi.mock("@/src/lib/web-push", () => ({ isWebPushConfigured: vi.fn(() => false), sendWebPush: vi.fn() }));
vi.mock("@/src/server/student-grades-view", () => ({ loadStudentGradebookView: vi.fn() }));
vi.mock("@/src/lib/gradable-roster", () => ({ loadNonGradableEmails: vi.fn(async () => new Set()), isExcludedFromGrading: vi.fn(() => false) }));
vi.mock("@/src/lib/prisma", () => ({ prisma: db }));
vi.mock("@/src/server/livestream-credit", () => ({
  completedLivestreamHoursByUserIds: vi.fn(async () => new Map([["student", 3]])),
  resolveLivestreamPointsByUserIds: vi.fn(async () => new Map()),
  resolveLivestreamPointsForUser: vi.fn(async () => null)
}));
vi.mock("@/src/server/program-settings", () => ({ getCycleNumbers: vi.fn(async () => [1]) }));
vi.mock("@/src/lib/platform-admin", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/src/lib/platform-admin")>(),
  getPlatformRoleForEmail: vi.fn(async () => null),
  getPlatformAccess: vi.fn(async () => ({ role: actor.role }))
}));

import { GET, POST } from "@/app/api/grades/admin/route";
import { loadGradeEditorCredits } from "@/src/server/grade-editor-credits";
import { buildGradeSummary } from "@/src/server/student-grade-summary";

const cycle = {
  cycleNumber: 1,
  pitchingDate: new Date("2026-08-28Z"),
  proofOfContactDate: new Date("2026-09-02Z"),
  aRollBRollDate: new Date("2026-09-11Z"),
  initialCutDate: new Date("2026-09-16Z"),
  finalCutDate: new Date("2026-09-30Z")
};

beforeEach(() => {
  vi.clearAllMocks();
  actor.role = "EXECUTIVE_PRODUCER";
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-11T12:00:00Z"));
  db.packageGrade.findMany.mockResolvedValue([]);
  db.packageGrade.findUnique.mockResolvedValue(null);
  db.packageProgressRow.findFirst.mockResolvedValue(null);
  db.$transaction.mockImplementation(async (run) => run(db));
  db.packageGrade.upsert.mockResolvedValue({ aRollBRollPoints: 3 });
  db.packageCycle.findUnique.mockResolvedValue(cycle);
  db.packageCycle.createMany.mockResolvedValue({ count: 0 });
  db.packageProgressRow.findMany.mockResolvedValue([{
    cycleNumber: 1, pitching: true, proofOfContact: true, aRollBRoll: false, initialCut: false,
    brainstormDocUrl: "https://docs.google.com/document/d/example", initialCutMediaItemId: null,
    _count: { proofOfContacts: 3 }, stageMedia: [{ id: "upload" }], members: [{ userId: "student" }],
    extension: false, extensionRequests: [], approval: null
  }]);
  db.portfolioGrade.findMany.mockResolvedValue([]);
  db.portfolioGrade.findUnique.mockResolvedValue(null);
  db.user.findMany.mockResolvedValue([{ id: "student", email: "student@example.com" }]);
  db.user.findUnique.mockResolvedValue({ email: "student@example.com" });
  db.platformRoleAssignment.findMany.mockResolvedValue([]);
  db.participationEntry.findMany.mockResolvedValue([]);
  db.packageCycle.findMany.mockResolvedValue([cycle]);
  db.schoolCalendarDay.findMany.mockResolvedValue([]);
});
afterEach(() => vi.useRealTimers());

describe("persisted check-in overrides", () => {
  it("changes both the official student grade and Grade Editor totals without grading the final cut", async () => {
    const before = await buildGradeSummary("student");
    expect(before.checkInPoints).toEqual([10]);
    expect(before.percentage).toBe(66.7);

    db.packageGrade.findMany.mockResolvedValue([{
      userId: "student", cycleNumber: 1, awardedFinalCutPoints: null, finalCutPoints: 0,
      pitchingPoints: 0, proofOfContactPoints: 3, aRollBRollPoints: 4, initialCutPoints: 5
    }]);
    const summary = await buildGradeSummary("student");
    const { byUserId } = await loadGradeEditorCredits({ userIds: ["student"], cycles: [cycle] });
    expect(summary.checkInPoints).toEqual([7]);
    expect(summary.checkInPossible).toEqual([15]);
    expect(summary.percentage).toBe(46.7);
    expect(summary.finalCutPoints).toEqual([null]);
    expect(byUserId.get("student")?.checkInScoresByCycle[1]).toEqual({ pitching: 0, proofOfContact: 3, aRollBRoll: 4, initialCut: null });
    expect(byUserId.get("student")?.checkInPoints).toBe(12); // 20 semester max - 8 missed due points
  });

  it.each(["UNGRADED", "EXEMPT"])("excludes %s check-ins from both official and editor totals", async (state) => {
    db.packageGrade.findMany.mockResolvedValue([{
      userId: "student", cycleNumber: 1, aRollBRollPoints: 0, aRollBRollState: state
    }]);
    const summary = await buildGradeSummary("student");
    expect(summary.checkInPoints).toEqual([10]);
    expect(summary.checkInPossible).toEqual([10]);
    expect(summary.percentage).toBe(100);
    const { byUserId } = await loadGradeEditorCredits({ userIds: ["student"], cycles: [cycle] });
    expect(byUserId.get("student")?.checkInScoresByCycle[1]?.aRollBRoll).toBe(state);
    expect(byUserId.get("student")?.checkInPossible).toBe(15);
    expect(byUserId.get("student")?.checkInPoints).toBe(15);
  });

  it.each(["UNGRADED", "EXEMPT"])("keeps a %s final cut excluded after its deadline", async (state) => {
    vi.setSystemTime(new Date("2026-10-01T12:00:00Z"));
    db.packageGrade.findMany.mockResolvedValue([{
      userId: "student", cycleNumber: 1, finalCutState: state,
      awardedFinalCutPoints: 40, finalCutPoints: 40
    }]);
    expect((await buildGradeSummary("student")).finalCutPoints).toEqual([null]);
  });

  it("does not charge an associate for a cycle they skipped", async () => {
    db.packageProgressRow.findMany.mockResolvedValue([]);
    db.platformRoleAssignment.findMany.mockResolvedValue([{ email: "student@example.com", role: "ASSOCIATE_PRODUCER" }]);
    const { byUserId } = await loadGradeEditorCredits({ userIds: ["student"], cycles: [cycle] });
    expect(byUserId.get("student")?.checkInScoresByCycle[1]).toEqual({ pitching: null, proofOfContact: null, aRollBRoll: null, initialCut: null });
    expect(byUserId.get("student")?.checkInPoints).toBeNull();
  });
});

function saveRequest(points: number | "UNGRADED" | "EXEMPT" | null = 3) {
  return new Request("http://test/api/grades/admin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "setCheckIn", userId: "student", cycleNumber: 1, stage: "aRollBRoll", points }) });
}

describe("check-in save access and isolation", () => {
  it.each(["UNGRADED", "EXEMPT"] as const)("saves and restores %s without changing final cut", async (state) => {
    const grade = { userId: "student", cycleNumber: 1, aRollBRollState: state, aRollBRollPoints: null };
    db.packageGrade.upsert.mockResolvedValue(grade);
    db.packageGrade.findMany.mockResolvedValue([grade]);
    const response = await POST(saveRequest(state));
    expect(response.status).toBe(200);
    expect((await response.json()).data.checkInOverrides.aRollBRoll).toBe(state);
    expect(db.packageGrade.upsert).toHaveBeenCalledWith(expect.objectContaining({
      update: { aRollBRollPoints: null, aRollBRollState: state }
    }));
    expect((await POST(saveRequest(0))).status).toBe(200);
    expect(db.packageGrade.upsert).toHaveBeenLastCalledWith(expect.objectContaining({
      update: { aRollBRollPoints: 0, aRollBRollState: null }
    }));
    expect((await POST(saveRequest(null))).status).toBe(200);
    expect(db.packageGrade.upsert).toHaveBeenLastCalledWith(expect.objectContaining({
      update: { aRollBRollPoints: null, aRollBRollState: null }
    }));
  });
  it.each(["EXECUTIVE_PRODUCER", "ADVISER", "SUPER_ADMIN"])("allows %s to save only the selected check-in", async (role) => {
    actor.role = role;
    expect((await POST(saveRequest())).status).toBe(200);
    expect(db.packageGrade.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: { userId: "student", cycleNumber: 1, aRollBRollPoints: 3, aRollBRollState: null },
      update: { aRollBRollPoints: 3, aRollBRollState: null }
    }));
  });
  it.each(["ASSOCIATE_PRODUCER", null])("denies %s", async (role) => {
    actor.role = role;
    expect((await POST(saveRequest())).status).toBe(403);
    expect(db.packageGrade.upsert).not.toHaveBeenCalled();
  });
  it.each([-1, 6, 2.5])("rejects invalid score %s", async (points) => {
    expect((await POST(saveRequest(points))).status).toBe(400);
    expect(db.packageGrade.upsert).not.toHaveBeenCalled();
  });
  it("rejects edits before the deadline", async () => {
    vi.setSystemTime(new Date("2026-09-10T23:59:59Z"));
    expect((await POST(saveRequest())).status).toBe(400);
    expect(db.packageGrade.upsert).not.toHaveBeenCalled();
  });
  it("clears an override without touching any final-cut fields", async () => {
    expect((await POST(saveRequest(null))).status).toBe(200);
    expect(db.packageGrade.upsert).toHaveBeenCalledWith(expect.objectContaining({ update: { aRollBRollPoints: null, aRollBRollState: null } }));
  });
});


describe("final cut score states", () => {
  function finalRequest(effortPoints: number | null, finalCutState: "UNGRADED" | "EXEMPT" | null) {
    return new Request("http://test/api/grades/admin", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "save", userId: "student", cycleNumber: 1, effortPoints, finalCutState })
    });
  }

  beforeEach(() => {
    db.packageGrade.upsert.mockResolvedValue({ id: "grade" });
    db.packageGrade.findUniqueOrThrow.mockImplementation(async () => {
      const call = db.packageGrade.upsert.mock.lastCall![0];
      return { ...call.create, publicationHistory: [], publishedAt: null };
    });
  });

  it.each(["UNGRADED", "EXEMPT"] as const)("persists %s and returns it without a zero score", async (state) => {
    const response = await POST(finalRequest(null, state));
    expect(response.status).toBe(200);
    expect((await response.json()).data).toMatchObject({
      finalCutState: state, effortPoints: null, totalPoints: null, percentage: null
    });
    expect(db.packageGrade.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ finalCutState: state, awardedFinalCutPoints: null, revisionCount: 0 })
    }));
  });

  it.each(["UNGRADED", "EXEMPT"] as const)("reloads %s final cuts and check-ins as excluded", async (state) => {
    db.packageGrade.findMany.mockResolvedValue([{
      userId: "student", cycleNumber: 1, finalCutState: state,
      awardedFinalCutPoints: null, aRollBRollState: state, aRollBRollPoints: null
    }]);
    const response = await GET(new Request("http://test/api/grades/admin?cycle=1"));
    expect(response.status).toBe(200);
    expect((await response.json()).data.rows[0]).toMatchObject({
      finalCutState: state, effortPoints: null, totalPoints: null, percentage: null,
      checkInOverrides: { aRollBRoll: state }, checkInScores: { aRollBRoll: state }
    });
  });

  it("preserves revision limits when an excluded final is scored again", async () => {
    db.packageGrade.findUnique.mockResolvedValue({ finalCutState: "EXEMPT", awardedFinalCutPoints: null, revisionCount: 2 });
    const response = await POST(finalRequest(50, null));
    expect(response.status).toBe(200);
    expect(db.packageGrade.upsert).toHaveBeenCalledWith(expect.objectContaining({
      update: expect.objectContaining({ finalCutState: null, awardedFinalCutPoints: 37, revisionCount: 2 })
    }));
  });

  it("saves zero as a graded score and clears the exclusion", async () => {
    const response = await POST(finalRequest(0, null));
    expect(response.status).toBe(200);
    expect((await response.json()).data).toMatchObject({
      finalCutState: null, effortPoints: 0, totalPoints: 0, percentage: 0
    });
    expect(db.packageGrade.upsert).toHaveBeenCalledWith(expect.objectContaining({
      update: expect.objectContaining({ finalCutState: null, awardedFinalCutPoints: 0 })
    }));
  });
});
