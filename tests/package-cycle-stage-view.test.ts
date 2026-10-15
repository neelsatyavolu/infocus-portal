import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  ensureDefaults: vi.fn(),
  rowFindFirst: vi.fn(),
  rowFindMany: vi.fn(),
  rowFindUnique: vi.fn(),
  commentFindMany: vi.fn(),
  userFindUnique: vi.fn(),
  loadApprovalView: vi.fn()
}));

vi.mock("@/src/lib/prisma", () => ({
  prisma: {
    packageProgressRow: {
      findFirst: mocks.rowFindFirst,
      findMany: mocks.rowFindMany,
      findUnique: mocks.rowFindUnique
    },
    packageStageComment: { findMany: mocks.commentFindMany },
    user: { findUnique: mocks.userFindUnique }
  }
}));
vi.mock("@/src/server/package-progress-data", () => ({
  ensurePackageProgressDefaults: mocks.ensureDefaults,
  loadRequiredFinalCutGraders: vi.fn()
}));
vi.mock("@/src/server/package-approval-service", () => ({
  getOrCreateApproval: vi.fn(),
  loadApprovalView: mocks.loadApprovalView
}));
vi.mock("@/src/lib/media-card-urls", () => ({
  resolveCardMediaUrls: async () => ({ thumbnailUrl: null, playbackUrl: null })
}));

import { loadCycleStageView } from "@/src/server/package-cycle-stage";

const LATER = new Date("2099-01-01T00:00:00.000Z");
const PAST = new Date("2020-01-01T00:00:00.000Z");

function row(cycleNumber: number, overrides: Record<string, unknown> = {}) {
  return {
    id: `row-${cycleNumber}`,
    cycleNumber,
    groupTopic: "Lunch lines",
    finalCutToss: "",
    packageOfCycleAt: null,
    pitching: true,
    proofOfContact: true,
    aRollBRoll: false,
    initialCut: false,
    finalCut: false,
    awaitingRevisedInitialCut: false,
    queuedForAirAt: null,
    brainstormDocUrl: "https://docs.google.com/document/d/abc/edit",
    initialCutMediaItemId: null,
    finalCutMediaItemId: null,
    assignedProducerUserId: "u-rowan",
    members: [{ userId: "u-abby", user: { id: "u-abby", name: "Abby", nickname: null, email: "abby@example.edu" } }],
    assignedProducer: { id: "u-rowan", name: "Rowan", nickname: null, email: "rowan@example.edu" },
    approval: null,
    initialCutMediaItem: null,
    finalCutMediaItem: null,
    stageMedia: [],
    ...overrides
  };
}

describe("loadCycleStageView: student rows", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.commentFindMany.mockResolvedValue([]);
    // Cycle 1 has closed, so cycle 2 is active.
    mocks.ensureDefaults.mockResolvedValue([
      { cycleNumber: 1, finalCutDate: PAST },
      { cycleNumber: 2, finalCutDate: LATER }
    ]);
  });

  it("loads both cycles' rows in one query and stays on the previous cycle until its Final Cut is in", async () => {
    mocks.rowFindMany.mockResolvedValue([row(1), row(2)]);

    const view = await loadCycleStageView({ userId: "u-abby", role: null, slug: "a-roll" });

    expect(mocks.rowFindMany).toHaveBeenCalledTimes(1);
    expect(mocks.rowFindMany.mock.calls[0][0].where).toEqual({
      cycleNumber: { in: [1, 2] },
      members: { some: { userId: "u-abby" } }
    });
    expect(mocks.rowFindFirst).not.toHaveBeenCalled();
    expect(view.empty).toBe(false);
    expect(view.empty ? null : view.row.cycleNumber).toBe(1);
  });

  it("moves to the active cycle once the previous Final Cut is in", async () => {
    mocks.rowFindMany.mockResolvedValue([row(1, { finalCut: true }), row(2)]);

    const view = await loadCycleStageView({ userId: "u-abby", role: Promise.resolve(null), slug: "a-roll" });

    expect(view.empty ? null : view.row.cycleNumber).toBe(2);
  });

  it("is empty when the student has no row on the cycle they are on", async () => {
    mocks.rowFindMany.mockResolvedValue([row(1, { finalCut: true })]);

    const view = await loadCycleStageView({ userId: "u-abby", role: null, slug: "a-roll" });

    expect(view.empty).toBe(true);
  });

  it("reads one row on cycle 1 (no previous cycle)", async () => {
    mocks.ensureDefaults.mockResolvedValue([{ cycleNumber: 1, finalCutDate: LATER }]);
    mocks.rowFindFirst.mockResolvedValue(row(1));

    const view = await loadCycleStageView({ userId: "u-abby", role: null, slug: "a-roll" });

    expect(mocks.rowFindMany).not.toHaveBeenCalled();
    expect(view.empty ? null : view.row.cycleNumber).toBe(1);
  });
});

describe("loadCycleStageView: producers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.commentFindMany.mockResolvedValue([]);
    mocks.loadApprovalView.mockResolvedValue({ stage: "ASSOCIATE_REVIEW" });
  });

  it("uses the caller's email for the Initial Cut approval instead of reading the user", async () => {
    mocks.rowFindUnique.mockResolvedValue(row(2));

    const view = await loadCycleStageView({
      userId: "u-rowan",
      role: Promise.resolve("ASSOCIATE_PRODUCER"),
      email: "rowan@example.edu",
      slug: "initial-cut",
      rowId: "row-2"
    });

    expect(mocks.userFindUnique).not.toHaveBeenCalled();
    expect(mocks.loadApprovalView).toHaveBeenCalledWith("row-2", {
      userId: "u-rowan",
      role: "ASSOCIATE_PRODUCER",
      email: "rowan@example.edu"
    });
    expect(view.empty ? null : view.cutApproval).toEqual({ stage: "ASSOCIATE_REVIEW" });
  });

  it("reads the stored email when the caller has none", async () => {
    mocks.rowFindUnique.mockResolvedValue(row(2));
    mocks.userFindUnique.mockResolvedValue({ email: "rowan@example.edu" });

    await loadCycleStageView({ userId: "u-rowan", role: "ASSOCIATE_PRODUCER", slug: "initial-cut", rowId: "row-2" });

    expect(mocks.userFindUnique).toHaveBeenCalledTimes(1);
    expect(mocks.loadApprovalView.mock.calls[0][1].email).toBe("rowan@example.edu");
  });

  it("refuses a viewer who is neither a member nor a producer", async () => {
    mocks.rowFindUnique.mockResolvedValue(row(2));

    await expect(
      loadCycleStageView({ userId: "u-sage", role: Promise.resolve(null), slug: "a-roll", rowId: "row-2" })
    ).rejects.toThrow("FORBIDDEN");
  });
});
