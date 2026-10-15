import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUserId: vi.fn(),
  syncUserProfile: vi.fn(),
  getPlatformAccess: vi.fn(),
  loadStudentNavGates: vi.fn(),
  ensurePackageProgressDefaults: vi.fn(),
  countExtensionRequestsAwaitingUser: vi.fn(),
  canManageLivestreams: vi.fn(),
  getCycleNumbers: vi.fn(),
  prisma: {
    packageCycle: { findUnique: vi.fn(), findMany: vi.fn(), createMany: vi.fn() },
    packageProgressRow: { findFirst: vi.fn(), findMany: vi.fn(), groupBy: vi.fn(), createMany: vi.fn() },
    packageGrade: { findMany: vi.fn(), findFirst: vi.fn() },
    meeting: { count: vi.fn() },
    participationGradeRequest: { count: vi.fn() },
    livestreamSignupRequest: { count: vi.fn() },
    platformAccessRequest: { count: vi.fn() },
    // Only the real Groups page loader (the parity test) reads these.
    platformRoleAssignment: { findMany: vi.fn() },
    user: { findMany: vi.fn(), findFirst: vi.fn() },
    auditLog: { findMany: vi.fn() }
  }
}));

vi.mock("@/src/lib/auth", () => ({ requireUserId: mocks.requireUserId, syncUserProfile: mocks.syncUserProfile }));
vi.mock("@/src/lib/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/src/lib/platform-admin", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/src/lib/platform-admin")>()),
  getPlatformAccess: mocks.getPlatformAccess
}));
vi.mock("@/src/server/package-cycle-stage", () => ({ loadStudentNavGates: mocks.loadStudentNavGates }));
vi.mock("@/src/server/package-progress-data", () => ({
  ensurePackageProgressDefaults: mocks.ensurePackageProgressDefaults,
  activeCycleNumberFor: (cycles: Array<{ cycleNumber: number }>) => cycles[cycles.length - 1]?.cycleNumber ?? 1
}));
vi.mock("@/src/server/extension-requests", () => ({
  countExtensionRequestsAwaitingUser: mocks.countExtensionRequestsAwaitingUser
}));
vi.mock("@/src/server/livestream-access", () => ({ canManageLivestreams: mocks.canManageLivestreams }));
vi.mock("@/src/server/meetings-access", () => ({
  visibleMeetingWhere: (viewer: { userId: string }) => ({ OR: [{ access: "OPEN" }, { createdById: viewer.userId }] })
}));
vi.mock("@/src/server/program-settings", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/src/server/program-settings")>()),
  getCycleNumbers: mocks.getCycleNumbers
}));

import { GET } from "@/app/api/nav/status/route";
import { viewerAttention, visibleGroupRows } from "@/components/groups/group-attention";
import { nextGradesSeen } from "@/components/shell/nav-seen";
import { accessRequestsFromEvent, mergeNavStatus } from "@/components/shell/use-nav-status";
import { deadlineClosesAt, finalCutClosesAt } from "@/src/lib/deadlines";
import { EMPTY_NAV_STATUS, NAV_STATUS_PARTS, type NavStatusResponse } from "@/src/lib/sidebar-nav";
import {
  countGroupsNeedingViewer,
  loadNavStatus,
  parseNavStatusParts,
  stageClosesAt,
  type GroupAttentionRow,
  type NavStatusViewer
} from "@/src/server/nav-status";

const previousReviewEmail = process.env.APP_REVIEW_EMAIL;
process.env.APP_REVIEW_EMAIL = "review@example.edu";
afterAll(() => {
  process.env.APP_REVIEW_EMAIL = previousReviewEmail;
});

const cycle = {
  proofOfContactDate: new Date("2026-10-07T00:00:00.000Z"),
  aRollBRollDate: new Date("2026-10-11T00:00:00.000Z"),
  initialCutDate: new Date("2026-10-16T00:00:00.000Z"),
  finalCutDate: new Date("2026-10-23T00:00:00.000Z")
};

const gates = {
  cycleNumber: 3,
  hasRow: true,
  unlocked: { "a-roll": true, "initial-cut": true, "final-cut": false },
  statuses: { brainstorming: "approved", "a-roll": "approved", "initial-cut": "pending", "final-cut": "locked" },
  remainingExecutiveSignoffs: 2,
  unread: { brainstorming: 0, "a-roll": 1, "initial-cut": 2, "final-cut": 0 }
};

async function call(query = "") {
  const response = await GET(new Request(`http://test/api/nav/status${query}`));
  const body = (await response.json()) as { data?: Record<string, unknown>; error?: { message: string } };
  return { status: response.status, body };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUserId.mockResolvedValue("u-abby");
  mocks.syncUserProfile.mockResolvedValue({ id: "u-abby", email: "abby@example.edu" });
  mocks.getPlatformAccess.mockResolvedValue({ role: null });
  mocks.loadStudentNavGates.mockResolvedValue(gates);
  mocks.ensurePackageProgressDefaults.mockResolvedValue([{ cycleNumber: 3, finalCutDate: cycle.finalCutDate }]);
  mocks.countExtensionRequestsAwaitingUser.mockResolvedValue(1);
  mocks.canManageLivestreams.mockResolvedValue(false);
  mocks.prisma.packageCycle.findUnique.mockResolvedValue(cycle);
  mocks.prisma.packageProgressRow.findFirst.mockResolvedValue({ extension: false, extensionRequests: [] });
  mocks.prisma.packageProgressRow.findMany.mockResolvedValue([]);
  mocks.prisma.packageGrade.findMany.mockResolvedValue([]);
  mocks.prisma.packageGrade.findFirst.mockResolvedValue({ publishedAt: new Date("2026-10-12T18:00:00.000Z") });
  mocks.prisma.meeting.count.mockResolvedValue(1);
  mocks.prisma.participationGradeRequest.count.mockResolvedValue(2);
  mocks.prisma.livestreamSignupRequest.count.mockResolvedValue(3);
  mocks.prisma.platformAccessRequest.count.mockResolvedValue(4);
});

describe("GET /api/nav/status", () => {
  it("rejects signed-out requests before loading anything", async () => {
    mocks.requireUserId.mockRejectedValue(new Error("UNAUTHORIZED"));
    expect((await call()).status).toBe(401);
    expect(mocks.loadStudentNavGates).not.toHaveBeenCalled();
  });

  it("rejects unknown parts", async () => {
    expect((await call("?parts=package,secrets")).status).toBe(400);
    expect(mocks.loadStudentNavGates).not.toHaveBeenCalled();
  });

  it("gives the App Review account nothing", async () => {
    mocks.syncUserProfile.mockResolvedValue({ id: "u-review", email: "Review@example.edu" });
    const { status, body } = await call();
    expect(status).toBe(200);
    expect(body.data).toMatchObject({ package: null, extensionRequestsAwaiting: null, latestGradePublishedAt: null, failed: [] });
    expect(mocks.getPlatformAccess).not.toHaveBeenCalled();
    expect(mocks.loadStudentNavGates).not.toHaveBeenCalled();
  });

  it("gives a student their package, extension requests and grades, and nothing staff-only", async () => {
    const { status, body } = await call();
    expect(status).toBe(200);
    expect(body.data).toMatchObject({
      parts: [...NAV_STATUS_PARTS],
      failed: [],
      package: {
        hasRow: true,
        cycleNumber: 3,
        currentStage: "initial-cut",
        remainingExecutiveSignoffs: 2,
        unread: gates.unread,
        dueAt: deadlineClosesAt(cycle.initialCutDate).toISOString()
      },
      extensionRequestsAwaiting: 1,
      groupsNeedYou: null,
      liveMeetings: null,
      participationApprovals: null,
      livestreamSignups: null,
      latestGradePublishedAt: "2026-10-12T18:00:00.000Z",
      accessRequests: null
    });
    expect(mocks.prisma.meeting.count).not.toHaveBeenCalled();
    expect(mocks.prisma.participationGradeRequest.count).not.toHaveBeenCalled();
    expect(mocks.prisma.platformAccessRequest.count).not.toHaveBeenCalled();
    expect(mocks.ensurePackageProgressDefaults).not.toHaveBeenCalled();
    expect(mocks.prisma.packageGrade.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "u-abby", publishedAt: { not: null } } })
    );
  });

  it("counts a livestream manager's pending sign-ups", async () => {
    mocks.canManageLivestreams.mockResolvedValue(true);
    expect((await call("?parts=livestreams")).body.data).toMatchObject({ livestreamSignups: 3 });
    expect(mocks.prisma.livestreamSignupRequest.count).toHaveBeenCalledWith({ where: { status: "PENDING" } });
  });

  it("skips the due date when the current stage owes nothing", async () => {
    mocks.loadStudentNavGates.mockResolvedValue({ ...gates, statuses: { ...gates.statuses, "initial-cut": "submitted" } });
    const { body } = await call("?parts=package");
    expect((body.data?.package as { dueAt: string | null }).dueAt).toBeNull();
    expect(mocks.prisma.packageCycle.findUnique).not.toHaveBeenCalled();
  });

  it("returns an off-roster package without a stage", async () => {
    mocks.loadStudentNavGates.mockResolvedValue({
      cycleNumber: 3,
      hasRow: false,
      unlocked: { "a-roll": false, "initial-cut": false, "final-cut": false },
      statuses: gates.statuses,
      unread: gates.unread
    });
    const { body } = await call("?parts=package");
    expect(body.data?.package).toMatchObject({ hasRow: false, statuses: null, currentStage: null, dueAt: null, remainingExecutiveSignoffs: null });
  });

  it("loads only the parts asked for", async () => {
    const { body } = await call("?parts=extensions");
    expect(body.data).toMatchObject({ parts: ["extensions"], extensionRequestsAwaiting: 1, package: null });
    expect(mocks.loadStudentNavGates).not.toHaveBeenCalled();
    expect(mocks.prisma.packageGrade.findFirst).not.toHaveBeenCalled();
  });

  it("loads the stage bar's parts side by side, not one wave after another", async () => {
    // The package lookup only finishes once the extension count has started; in separate waves it never would.
    let extensionsStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      extensionsStarted = resolve;
    });
    mocks.loadStudentNavGates.mockImplementation(async () => {
      await started;
      return gates;
    });
    mocks.countExtensionRequestsAwaitingUser.mockImplementation(async () => {
      extensionsStarted();
      return 1;
    });
    const { body } = await call("?parts=package,extensions");
    expect(body.data).toMatchObject({ extensionRequestsAwaiting: 1, package: { hasRow: true }, failed: [] });
  });

  it("keeps going when one part fails, and says which", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.countExtensionRequestsAwaitingUser.mockRejectedValue(new Error("db down"));
    const { status, body } = await call("?parts=package,extensions");
    expect(status).toBe(200);
    expect(body.data).toMatchObject({ extensionRequestsAwaiting: null, failed: ["extensions"], package: { hasRow: true } });
    expect(error).toHaveBeenCalledWith("Nav status part failed: extensions", expect.any(Error));
    error.mockRestore();
  });

  it("gives an associate producer meetings, people and sign-ups but no group or admin counts", async () => {
    mocks.getPlatformAccess.mockResolvedValue({ role: "ASSOCIATE_PRODUCER" });
    mocks.canManageLivestreams.mockResolvedValue(true);
    const { body } = await call();
    expect(body.data).toMatchObject({ liveMeetings: 1, participationApprovals: 2, livestreamSignups: 3, groupsNeedYou: null, accessRequests: null });
    expect(mocks.prisma.meeting.count).toHaveBeenCalledWith({
      where: { AND: [{ OR: [{ access: "OPEN" }, { createdById: "u-abby" }] }, { status: "LIVE" }] }
    });
    expect(mocks.prisma.participationGradeRequest.count).toHaveBeenCalledWith({
      where: { status: "PENDING", requestedById: { not: "u-abby" } }
    });
    expect(mocks.ensurePackageProgressDefaults).not.toHaveBeenCalled();
  });

  it("gives executives the groups that need them and pending access requests, but no grades dot", async () => {
    mocks.getPlatformAccess.mockResolvedValue({ role: "EXECUTIVE_PRODUCER" });
    mocks.prisma.packageProgressRow.findMany.mockResolvedValue([groupRow({ approval: { stage: "EXECUTIVE_REVIEW" } })]);
    const { body } = await call();
    expect(body.data).toMatchObject({ groupsNeedYou: 1, accessRequests: 4, latestGradePublishedAt: null });
    expect(mocks.prisma.packageProgressRow.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { cycleNumber: 3 } }));
    expect(mocks.prisma.packageGrade.findFirst).not.toHaveBeenCalled();
  });
});

describe("parseNavStatusParts", () => {
  it("defaults to every part and keeps the canonical order", () => {
    expect(parseNavStatusParts(null)).toEqual([...NAV_STATUS_PARTS]);
    expect(parseNavStatusParts("")).toEqual([...NAV_STATUS_PARTS]);
    expect(parseNavStatusParts("grades, package,grades")).toEqual(["package", "grades"]);
    expect(parseNavStatusParts("package,nope")).toBeNull();
  });
});

describe("stageClosesAt", () => {
  it("uses each stage's own date, Brainstorming on the proof-of-contact date", () => {
    expect(stageClosesAt("brainstorming", cycle, 0)).toEqual(deadlineClosesAt(cycle.proofOfContactDate));
    expect(stageClosesAt("a-roll", cycle, 0)).toEqual(deadlineClosesAt(cycle.aRollBRollDate));
    expect(stageClosesAt("initial-cut", cycle, 0)).toEqual(deadlineClosesAt(cycle.initialCutDate));
    expect(stageClosesAt("final-cut", cycle, 0)).toEqual(finalCutClosesAt(cycle.finalCutDate));
  });

  it("moves the close by the student's approved extension days", () => {
    expect(stageClosesAt("final-cut", cycle, 2)?.toISOString()).toBe(
      finalCutClosesAt(new Date("2026-10-25T00:00:00.000Z")).toISOString()
    );
    expect(stageClosesAt("initial-cut", cycle, 1)?.toISOString()).toBe(
      deadlineClosesAt(new Date("2026-10-17T00:00:00.000Z")).toISOString()
    );
    // A Final Cut due Friday with 2 extra days closes 11:59 PM Pacific on Sunday.
    expect(stageClosesAt("final-cut", cycle, 2)?.toISOString()).toBe("2026-10-26T06:59:59.999Z");
  });

  it("has no close without a date", () => {
    expect(stageClosesAt("final-cut", { ...cycle, finalCutDate: null }, 0)).toBeNull();
  });
});

function groupRow(overrides: Partial<GroupAttentionRow> = {}): GroupAttentionRow {
  return {
    id: "row",
    groupTopic: "Bike lanes",
    groupMembers: "",
    category: null,
    pitching: true,
    initialCut: false,
    finalCut: false,
    assignedProducerUserId: null,
    assignedExecutiveProducerUserId: null,
    proofOfContact: true,
    brainstormDocUrl: "",
    aRollBRoll: true,
    finalCutMediaItemId: null,
    queuedForAirAt: null,
    approval: { stage: "DRAFT" },
    initialCutMediaItem: null,
    members: [{ userId: "m-otto" }, { userId: "m-sage" }],
    stageMedia: [],
    finalCutScores: [],
    _count: { proofOfContacts: 0 },
    ...overrides
  } as GroupAttentionRow;
}

describe("countGroupsNeedingViewer (the Groups page's Needs you rule)", () => {
  const executive = { userId: "u-exec", role: "EXECUTIVE_PRODUCER" as const };

  it("counts executive review, the viewer's own brainstorm queue and unscored Final Cuts", () => {
    const rows = [
      groupRow({ id: "a", approval: { stage: "EXECUTIVE_REVIEW" } }),
      groupRow({ id: "b", approval: { stage: "ADVISER_REVIEW" } }),
      groupRow({
        id: "c",
        assignedExecutiveProducerUserId: "u-exec",
        proofOfContact: false,
        brainstormDocUrl: "https://docs.google.com/document/d/example",
        _count: { proofOfContacts: 3 }
      }),
      groupRow({ id: "d", approval: { stage: "APPROVED" }, finalCutMediaItemId: "media-1" }),
      groupRow({
        id: "e",
        approval: { stage: "APPROVED" },
        finalCutMediaItemId: "media-2",
        finalCutScores: [
          { graderUserId: "u-exec", memberUserId: null, points: 40, qualityPoints: null, effortPoints: null }
        ]
      }),
      groupRow({
        id: "f",
        approval: { stage: "EXECUTIVE_REVIEW" },
        initialCutMediaItem: { currentVersion: { approvalStatus: "NEEDS_CHANGES" } }
      })
    ];
    expect(countGroupsNeedingViewer(rows, [], executive)).toBe(3);
  });

  it("drops Final Cuts that are officially graded", () => {
    const rows = [groupRow({ approval: { stage: "APPROVED" }, finalCutMediaItemId: "media-1" })];
    const grades = [
      { userId: "m-otto", awardedFinalCutPoints: 45, revisionCount: 0 },
      { userId: "m-sage", awardedFinalCutPoints: 44, revisionCount: 0 }
    ];
    expect(countGroupsNeedingViewer(rows, grades, executive)).toBe(0);
  });

  it("counts Stage 2 for the adviser unless revisions were asked for", () => {
    const adviser = { userId: "u-adviser", role: "ADVISER" as const };
    const rows = [
      groupRow({ approval: { stage: "ADVISER_REVIEW" } }),
      groupRow({ approval: { stage: "ADVISER_REVIEW" }, initialCutMediaItem: { currentVersion: { approvalStatus: "NEEDS_CHANGES" } } }),
      groupRow({ approval: { stage: "EXECUTIVE_REVIEW" } })
    ];
    expect(countGroupsNeedingViewer(rows, [], adviser)).toBe(1);
  });

  it("has no Needs you count for associate producers or students", () => {
    const rows = [groupRow({ approval: { stage: "ASSOCIATE_REVIEW" }, assignedProducerUserId: "u-ap" })];
    expect(countGroupsNeedingViewer(rows, [], { userId: "u-ap", role: "ASSOCIATE_PRODUCER" })).toBe(0);
    expect(countGroupsNeedingViewer(rows, [], { userId: "u-ap", role: null })).toBe(0);
  });
});

describe("Groups count parity (the sidebar and the Groups page read one roster the same way)", () => {
  const at = new Date("2026-10-10T18:00:00.000Z");
  const score = (graderUserId: string, memberUserId: string | null) => ({
    graderUserId,
    memberUserId,
    points: 40,
    qualityPoints: null,
    effortPoints: null
  });
  const proof = (slot: number) => ({ id: `proof-${slot}`, slot, fileName: `proof-${slot}.png`, mimeType: "image/png", updatedAt: at });

  /** A roster row as the database returns it: every field either loader selects or includes. */
  function rosterRow(id: string, overrides: Record<string, unknown> = {}) {
    const proofs = (overrides.proofOfContacts as unknown[] | undefined) ?? [];
    return {
      id,
      rowOrder: 0,
      cycleNumber: 3,
      groupTopic: `Topic ${id}`,
      groupMembers: "",
      groupType: "",
      category: null,
      assignedProducerUserId: null,
      assignedProducer: null,
      assignedExecutiveProducerUserId: null,
      assignedExecutiveProducer: null,
      members: [
        { userId: "m-otto", user: { id: "m-otto", name: "Otto", nickname: null, email: "otto@example.edu" } },
        { userId: "m-sage", user: { id: "m-sage", name: "Sage", nickname: null, email: "sage@example.edu" } }
      ],
      projectId: null,
      initialCutMediaItemId: null,
      finalCutMediaItemId: null,
      pitching: true,
      proofOfContact: true,
      aRollBRoll: true,
      initialCut: false,
      initialCutManual: false,
      revisedInitialCut: false,
      finalCut: false,
      finalCutManual: false,
      extension: false,
      possibleInterviews: "",
      possibleIdeas: "",
      notes: "",
      stageNotes: null,
      brainstormDocUrl: "",
      awaitingRevisedInitialCut: false,
      queuedForAirAt: null,
      packageOfCycleAt: null,
      approval: { stage: "DRAFT", controversial: false, signoffs: [] },
      initialCutMediaItem: null,
      finalCutMediaItem: null,
      stageMedia: [],
      stageComments: [],
      finalCutScores: [],
      extensionRequests: [],
      ...overrides,
      _count: { proofOfContacts: proofs.length },
      proofOfContacts: proofs
    };
  }

  const roster = [
    rosterRow("exec-review", { approval: { stage: "EXECUTIVE_REVIEW", controversial: false, signoffs: [] } }),
    rosterRow("adviser-review", { approval: { stage: "ADVISER_REVIEW", controversial: false, signoffs: [] } }),
    rosterRow("my-brainstorm", {
      assignedExecutiveProducerUserId: "u-exec",
      proofOfContact: false,
      brainstormDocUrl: "https://docs.google.com/document/d/example",
      proofOfContacts: [proof(1), proof(2), proof(3)]
    }),
    rosterRow("my-a-roll", {
      assignedExecutiveProducerUserId: "u-exec",
      aRollBRoll: false,
      stageMedia: [{ id: "link-1", createdAt: at, mediaItem: { currentVersionId: "v-1" } }]
    }),
    rosterRow("my-stage-one", {
      assignedProducerUserId: "u-exec",
      approval: { stage: "ASSOCIATE_REVIEW", controversial: false, signoffs: [] }
    }),
    rosterRow("revisions", {
      approval: { stage: "ADVISER_REVIEW", controversial: false, signoffs: [] },
      initialCutMediaItemId: "cut-1",
      initialCutMediaItem: { currentVersion: { id: "v-2", createdAt: at, versionNumber: 1, approvalStatus: "NEEDS_CHANGES" } }
    }),
    rosterRow("final-unscored", {
      approval: { stage: "APPROVED", controversial: false, signoffs: [] },
      finalCutMediaItemId: "final-1",
      finalCutMediaItem: { createdAt: at }
    }),
    rosterRow("final-half-scored", {
      approval: { stage: "APPROVED", controversial: false, signoffs: [] },
      finalCutMediaItemId: "final-2",
      finalCutMediaItem: { createdAt: at },
      finalCutScores: [score("u-exec", "m-otto")]
    }),
    rosterRow("final-scored", {
      approval: { stage: "APPROVED", controversial: false, signoffs: [] },
      finalCutMediaItemId: "final-3",
      finalCutMediaItem: { createdAt: at },
      queuedForAirAt: at,
      finalCutScores: [score("u-exec", "m-otto"), score("u-exec", "m-sage")]
    }),
    rosterRow("final-graded", {
      approval: { stage: "APPROVED", controversial: false, signoffs: [] },
      finalCutMediaItemId: "final-4",
      finalCutMediaItem: { createdAt: at },
      members: [{ userId: "m-abby", user: { id: "m-abby", name: "Abby", nickname: null, email: "abby@example.edu" } }]
    }),
    rosterRow("empty", { groupTopic: "", pitching: false, proofOfContact: false, aRollBRoll: false, members: [] })
  ];
  const grades = [{ userId: "m-abby", awardedFinalCutPoints: 45, revisionCount: 0, publishedAt: null }];

  it("gives the same Needs you count as the Groups page for each role that has one", async () => {
    mocks.getCycleNumbers.mockResolvedValue([3]);
    mocks.prisma.packageCycle.findMany.mockResolvedValue([{ cycleNumber: 3, focus: "", pitchingDate: null, ...cycle }]);
    mocks.prisma.packageProgressRow.groupBy.mockResolvedValue([{ cycleNumber: 3 }]);
    mocks.prisma.packageProgressRow.findMany.mockImplementation(async (args: { where: { cycleNumber: number } }) =>
      args.where.cycleNumber === 3 ? roster : []
    );
    mocks.prisma.packageGrade.findMany.mockResolvedValue(grades);
    mocks.prisma.platformRoleAssignment.findMany.mockResolvedValue([]);
    mocks.prisma.user.findMany.mockResolvedValue([]);
    mocks.prisma.user.findFirst.mockResolvedValue(null);
    mocks.prisma.auditLog.findMany.mockResolvedValue([]);

    const { loadPackageProgressData } = await vi.importActual<typeof import("@/src/server/package-progress-data")>(
      "@/src/server/package-progress-data"
    );
    const page = await loadPackageProgressData();

    const viewers: NavStatusViewer[] = [
      { userId: "u-exec", role: "EXECUTIVE_PRODUCER" },
      { userId: "u-exec", role: "SUPER_ADMIN" },
      { userId: "u-adviser", role: "ADVISER" }
    ];
    for (const viewer of viewers) {
      const pageCount = visibleGroupRows(page.rows, {
        platformRole: viewer.role,
        currentUserId: viewer.userId,
        producerCategory: null
      }).filter((row) => viewerAttention(viewer.role, viewer.userId, row) === "needed").length;
      const nav = await loadNavStatus(viewer, ["groups"]);
      expect(pageCount).toBeGreaterThan(0);
      expect(nav.groupsNeedYou, viewer.role ?? "no role").toBe(pageCount);
    }
  });
});

describe("mergeNavStatus (the sidebar's client merge)", () => {
  const previous = { ...EMPTY_NAV_STATUS, groupsNeedYou: 2, accessRequests: 1 };
  const response: NavStatusResponse = {
    ...EMPTY_NAV_STATUS,
    groupsNeedYou: 5,
    accessRequests: null,
    parts: ["groups", "admin"],
    failed: ["admin"]
  };

  it("copies only the parts it is told to apply and returns a new object", () => {
    const next = mergeNavStatus(previous, response, ["groups"]);
    expect(next).toEqual({ ...previous, groupsNeedYou: 5 });
    expect(next).not.toBe(previous);
    expect(previous.groupsNeedYou).toBe(2);
  });

  it("keeps the old value of a part that was not applied (a failed load)", () => {
    expect(mergeNavStatus(previous, response, ["groups"]).accessRequests).toBe(1);
    expect(mergeNavStatus(previous, response, [])).toEqual(previous);
  });
});

describe("accessRequestsFromEvent (the Admin page's count)", () => {
  const event = (detail: unknown) => new CustomEvent("infocus-access-requests-changed", { detail });

  it("reads a whole, non-negative pending count", () => {
    expect(accessRequestsFromEvent(event({ pending: 3 }))).toBe(3);
    expect(accessRequestsFromEvent(event({ pending: 0 }))).toBe(0);
  });

  it("ignores anything else, so the shell refetches instead", () => {
    expect(accessRequestsFromEvent(event({ pending: -1 }))).toBeNull();
    expect(accessRequestsFromEvent(event({ pending: 1.5 }))).toBeNull();
    expect(accessRequestsFromEvent(event({ pending: "2" }))).toBeNull();
    expect(accessRequestsFromEvent(event(null))).toBeNull();
    expect(accessRequestsFromEvent(new Event("infocus-access-requests-changed"))).toBeNull();
  });
});

describe("nextGradesSeen (the Grades new dot)", () => {
  const now = Date.parse("2026-10-15T19:00:00.000Z");
  const lastVisit = Date.parse("2026-10-10T00:00:00.000Z");
  const newer = Date.parse("2026-10-12T00:00:00.000Z");

  it("seeds the first run with now, so grades already out never light the dot", () => {
    expect(nextGradesSeen({ stored: null, now, latest: newer, onGradesPage: false })).toEqual({ seenAt: now, write: true });
  });

  it("keeps the stored visit elsewhere, so a newer grade lights the dot", () => {
    expect(nextGradesSeen({ stored: lastVisit, now, latest: newer, onGradesPage: false })).toEqual({
      seenAt: lastVisit,
      write: false
    });
  });

  it("marks everything seen on /grades, even a grade stamped after the browser's clock", () => {
    const ahead = now + 60_000;
    expect(nextGradesSeen({ stored: lastVisit, now, latest: ahead, onGradesPage: true })).toEqual({ seenAt: ahead, write: true });
  });
});
