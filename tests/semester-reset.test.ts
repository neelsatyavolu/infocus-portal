import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const op = (count = 0) => vi.fn((args: unknown) => ({ args, count }));
  return {
    resolveActiveCycleNumber: vi.fn(),
    rowFindMany: vi.fn(),
    rowCount: vi.fn(),
    mediaCount: vi.fn(),
    gradeCount: vi.fn(),
    extensionCount: vi.fn(),
    noteCount: vi.fn(),
    transaction: vi.fn((ops: unknown[]) => Promise.resolve(ops)),
    mediaUpdateMany: op(12),
    stageMediaDeleteMany: op(),
    commentDeleteMany: op(),
    commentReadDeleteMany: op(),
    proofDeleteMany: op(),
    scoreDeleteMany: op(),
    voteDeleteMany: op(),
    noticeDeleteMany: op(),
    approvalDeleteMany: op(),
    chatDeleteMany: op(),
    rowUpdateMany: op(2),
    rowDeleteMany: op(5),
    extensionDeleteMany: op(3),
    gradeDeleteMany: op(40),
    noteDeleteMany: op(4),
    cycleUpdateMany: op(3),
    settingUpdateMany: op()
  };
});

vi.mock("@/src/server/package-cycle-stage", () => ({
  resolveActiveCycleNumber: mocks.resolveActiveCycleNumber
}));

vi.mock("@/src/lib/prisma", () => ({
  prisma: {
    $transaction: mocks.transaction,
    packageProgressRow: {
      findMany: mocks.rowFindMany,
      count: mocks.rowCount,
      updateMany: mocks.rowUpdateMany,
      deleteMany: mocks.rowDeleteMany
    },
    mediaItem: { count: mocks.mediaCount, updateMany: mocks.mediaUpdateMany },
    packageGrade: { count: mocks.gradeCount, deleteMany: mocks.gradeDeleteMany },
    packageExtensionRequest: { count: mocks.extensionCount, deleteMany: mocks.extensionDeleteMany },
    memberProducerNote: { count: mocks.noteCount, deleteMany: mocks.noteDeleteMany },
    packageStageMedia: { deleteMany: mocks.stageMediaDeleteMany },
    packageStageComment: { deleteMany: mocks.commentDeleteMany },
    packageStageCommentRead: { deleteMany: mocks.commentReadDeleteMany },
    packageProofOfContact: { deleteMany: mocks.proofDeleteMany },
    packageFinalCutScore: { deleteMany: mocks.scoreDeleteMany },
    packageOfCycleVote: { deleteMany: mocks.voteDeleteMany },
    packageReviewNotice: { deleteMany: mocks.noticeDeleteMany },
    packageApproval: { deleteMany: mocks.approvalDeleteMany },
    hubChat: { deleteMany: mocks.chatDeleteMany },
    packageCycle: { updateMany: mocks.cycleUpdateMany },
    programSetting: { updateMany: mocks.settingUpdateMany }
  }
}));

import { previewSemesterReset, resetSemester, SemesterResetError } from "@/src/server/semester-reset";

const S1 = { gte: 1, lte: 3 };
const S2 = { gt: 3 };

describe("semester reset", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveActiveCycleNumber.mockResolvedValue(4);
    mocks.rowFindMany.mockResolvedValue([{ id: "kept_1" }, { id: "kept_2" }]);
  });

  it("refuses the semester the active cycle is in, before touching anything", async () => {
    mocks.resolveActiveCycleNumber.mockResolvedValue(2);
    await expect(resetSemester({ term: 1, actorUserId: "admin" })).rejects.toBeInstanceOf(SemesterResetError);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("clears only S1's cycles at the start of S2", async () => {
    const summary = await resetSemester({ term: 1, actorUserId: "admin" });
    expect(mocks.rowDeleteMany).toHaveBeenCalledWith({ where: { cycleNumber: S1 } });
    expect(mocks.gradeDeleteMany).toHaveBeenCalledWith({ where: { cycleNumber: S1 } });
    expect(mocks.extensionDeleteMany).toHaveBeenCalledWith({ where: { cycleNumber: S1 } });
    expect(mocks.noteDeleteMany).toHaveBeenCalledWith({ where: { cycleNumber: S1 } });
    expect(summary).toEqual({
      term: 1,
      packagesKept: 2,
      packagesDeleted: 5,
      mediaRemoved: 12,
      grades: 40,
      extensionRequests: 3,
      producerNotes: 4
    });
  });

  it("clears S2's cycles at a new school year", async () => {
    mocks.resolveActiveCycleNumber.mockResolvedValue(1);
    await resetSemester({ term: 2, actorUserId: "admin" });
    expect(mocks.rowDeleteMany).toHaveBeenCalledWith({ where: { cycleNumber: S2 } });
    expect(mocks.cycleUpdateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { cycleNumber: S2 } }));
  });

  it("keeps packages the publishing queue needs, moved to cycle 0 before the semester's rows are deleted", async () => {
    await resetSemester({ term: 1, actorUserId: "admin" });
    expect(mocks.rowFindMany).toHaveBeenCalledWith({
      where: {
        cycleNumber: S1,
        OR: [
          { finalCutMediaItemId: { not: null } },
          { queuedForAirAt: { not: null } },
          { youtubePublication: { isNot: null } }
        ]
      },
      select: { id: true }
    });
    expect(mocks.rowUpdateMany).toHaveBeenCalledWith({
      where: { id: { in: ["kept_1", "kept_2"] } },
      data: expect.objectContaining({ cycleNumber: 0, initialCutMediaItemId: null })
    });
    const ops = mocks.transaction.mock.calls[0][0] as Array<{ args: unknown }>;
    const order = (fn: { mock: { results: Array<{ value: unknown }> } }) => ops.indexOf(fn.mock.results[0].value as never);
    expect(order(mocks.rowUpdateMany)).toBeLessThan(order(mocks.rowDeleteMany));
    // Media is flagged first, while rows still link it.
    expect(order(mocks.mediaUpdateMany)).toBe(0);
  });

  it("sends A-roll/B-roll and Initial Cuts to Recently deleted, never a Final Cut", async () => {
    await resetSemester({ term: 1, actorUserId: "admin" });
    const { where, data } = mocks.mediaUpdateMany.mock.calls[0][0] as {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    };
    expect(where).toEqual({
      deletedAt: null,
      finalCutForRows: { none: {} },
      OR: [
        { cycleStageLinks: { some: { row: { cycleNumber: S1 } } } },
        { initialCutForRows: { some: { cycleNumber: S1 } } }
      ]
    });
    expect(data).toEqual({ deletedAt: expect.any(Date), deletedById: "admin" });
  });

  it("drops the kept packages' stage work but not their members or YouTube record", async () => {
    await resetSemester({ term: 1, actorUserId: "admin" });
    const kept = { rowId: { in: ["kept_1", "kept_2"] } };
    for (const fn of [
      mocks.stageMediaDeleteMany,
      mocks.commentDeleteMany,
      mocks.commentReadDeleteMany,
      mocks.proofDeleteMany,
      mocks.scoreDeleteMany,
      mocks.voteDeleteMany
    ]) {
      expect(fn).toHaveBeenCalledWith({ where: kept });
    }
    expect(mocks.approvalDeleteMany).toHaveBeenCalledWith({ where: { progressRowId: { in: ["kept_1", "kept_2"] } } });
    expect(mocks.chatDeleteMany).toHaveBeenCalledWith({ where: { packageRowId: { in: ["kept_1", "kept_2"] } } });
  });

  it("previews the counts and says when the semester is the current one", async () => {
    mocks.resolveActiveCycleNumber.mockResolvedValue(5);
    mocks.rowCount.mockImplementation(({ where }: { where: Record<string, unknown> }) => ("OR" in where ? 2 : 9));
    mocks.mediaCount.mockResolvedValue(30);
    mocks.gradeCount.mockResolvedValue(20);
    mocks.extensionCount.mockResolvedValue(1);
    mocks.noteCount.mockResolvedValue(0);
    const summary = await previewSemesterReset(2);
    expect(summary).toMatchObject({ packagesKept: 2, packagesDeleted: 7, mediaRemoved: 30, grades: 20 });
    expect(summary.blockedReason).toMatch(/current semester/);
    mocks.resolveActiveCycleNumber.mockResolvedValue(1);
    expect((await previewSemesterReset(2)).blockedReason).toBeNull();
  });
});
