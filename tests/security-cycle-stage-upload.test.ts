import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rowFindUnique: vi.fn(),
  rowFindFirst: vi.fn(),
  rowFindUniqueOrThrow: vi.fn(),
  rowUpdate: vi.fn(),
  commentFindMany: vi.fn(),
  gradeFindMany: vi.fn(),
  versionFindFirst: vi.fn(),
  versionUpdate: vi.fn(),
  mediaUpdate: vi.fn(),
  stageMediaUpsert: vi.fn(),
  scoreDeleteMany: vi.fn(),
  recordHistory: vi.fn(),
  afterResponse: vi.fn()
}));

vi.mock("@/src/lib/prisma", () => ({
  prisma: {
    packageProgressRow: {
      findUnique: mocks.rowFindUnique,
      findFirst: mocks.rowFindFirst,
      findUniqueOrThrow: mocks.rowFindUniqueOrThrow,
      update: mocks.rowUpdate
    },
    packageStageComment: { findMany: mocks.commentFindMany },
    packageGrade: { findMany: mocks.gradeFindMany },
    mediaVersion: { findFirst: mocks.versionFindFirst, update: mocks.versionUpdate },
    mediaItem: { update: mocks.mediaUpdate },
    packageStageMedia: { upsert: mocks.stageMediaUpsert },
    packageFinalCutScore: { deleteMany: mocks.scoreDeleteMany }
  }
}));
vi.mock("@/src/server/package-progress-data", () => ({
  ensurePackageProgressDefaults: vi.fn(),
  loadRequiredFinalCutGraders: vi.fn()
}));
vi.mock("@/src/server/package-approval-service", () => ({
  getOrCreateApproval: vi.fn(),
  loadApprovalView: vi.fn()
}));
vi.mock("@/src/server/associate-review-history", () => ({ recordAssociateReviewHistory: mocks.recordHistory }));
vi.mock("@/src/server/package-review-notify", () => ({
  notifyARollUploaded: vi.fn(),
  notifyFinalCutUploaded: vi.fn(),
  notifyPackageReview: vi.fn()
}));
vi.mock("@/src/server/package-of-cycle", () => ({ loadPackageOfCyclePanel: vi.fn() }));
vi.mock("@/src/lib/after-response", () => ({ afterResponse: mocks.afterResponse }));
vi.mock("@/src/lib/media-card-urls", () => ({
  resolveCardMediaUrls: async () => ({ thumbnailUrl: null, playbackUrl: null })
}));

import { completeCycleStageUpload } from "@/src/server/package-cycle-stage";

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: "row-1",
    cycleNumber: 2,
    groupTopic: "Lunch lines",
    finalCutToss: "",
    packageOfCycleAt: null,
    pitching: true,
    proofOfContact: true,
    aRollBRoll: false,
    initialCut: false,
    finalCut: false,
    revisedInitialCut: false,
    awaitingRevisedInitialCut: false,
    queuedForAirAt: null,
    initialCutMediaItemId: null,
    finalCutMediaItemId: null,
    assignedProducerUserId: "u-sage",
    members: [{ userId: "u-abby", user: { id: "u-abby", name: "Abby", nickname: null, email: "abby@example.edu" } }],
    assignedProducer: { id: "u-sage", name: "Sage", nickname: null, email: "sage@example.edu" },
    approval: null,
    initialCutMediaItem: null,
    finalCutMediaItem: null,
    stageMedia: [],
    ...overrides
  };
}

function expectNoWrites() {
  expect(mocks.versionUpdate).not.toHaveBeenCalled();
  expect(mocks.mediaUpdate).not.toHaveBeenCalled();
  expect(mocks.rowUpdate).not.toHaveBeenCalled();
  expect(mocks.stageMediaUpsert).not.toHaveBeenCalled();
  expect(mocks.scoreDeleteMany).not.toHaveBeenCalled();
}

const base = { rowId: "row-1", mediaId: "media-1", versionId: "version-1" };

describe("completeCycleStageUpload authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.commentFindMany.mockResolvedValue([]);
    mocks.gradeFindMany.mockResolvedValue([]);
    mocks.versionFindFirst.mockResolvedValue({ id: "version-1", versionNumber: 1 });
    mocks.rowFindFirst.mockResolvedValue(null);
  });

  it("treats a retried Final Cut complete for the attached version as done", async () => {
    mocks.rowFindFirst.mockResolvedValue({ finalCutMediaItem: { currentVersionId: "version-1" } });
    await expect(
      completeCycleStageUpload({ ...base, userId: "u-abby", role: null, slug: "final-cut" })
    ).resolves.toBeUndefined();
    expect(mocks.rowFindFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "row-1", finalCutMediaItemId: "media-1", members: { some: { userId: "u-abby" } } }
    }));
    expectNoWrites();
  });

  it("does not treat a different version on the attached Final Cut as a retry", async () => {
    mocks.rowFindFirst.mockResolvedValue({ finalCutMediaItem: { currentVersionId: "version-other" } });
    mocks.rowFindUnique.mockResolvedValue(row());
    await expect(
      completeCycleStageUpload({ ...base, userId: "u-otto", role: null, slug: "final-cut" })
    ).rejects.toThrow("FORBIDDEN");
    expectNoWrites();
  });

  it("refuses a student who is not on the row and writes nothing", async () => {
    mocks.rowFindUnique.mockResolvedValue(row());
    await expect(
      completeCycleStageUpload({ ...base, userId: "u-otto", role: null, slug: "a-roll" })
    ).rejects.toThrow("FORBIDDEN");
    expectNoWrites();
  });

  it("refuses an associate who is not on the row", async () => {
    mocks.rowFindUnique.mockResolvedValue(row());
    await expect(
      completeCycleStageUpload({ ...base, userId: "u-sage", role: "ASSOCIATE_PRODUCER", slug: "a-roll" })
    ).rejects.toThrow("FORBIDDEN");
    expectNoWrites();
  });

  it("refuses a member when the stage is not open for upload", async () => {
    mocks.rowFindUnique.mockResolvedValue(row({ proofOfContact: false }));
    await expect(
      completeCycleStageUpload({ ...base, userId: "u-abby", role: null, slug: "a-roll" })
    ).rejects.toThrow("FORBIDDEN");
    expectNoWrites();
  });

  it("refuses a second Final Cut the group has not earned and keeps the scores", async () => {
    const finalRow = row({
      aRollBRoll: true,
      initialCut: true,
      finalCutMediaItemId: "media-old",
      approval: { stage: "APPROVED", controversial: false, signoffs: [] }
    });
    mocks.rowFindUnique.mockResolvedValue(finalRow);
    mocks.rowFindUniqueOrThrow.mockResolvedValue(finalRow);
    await expect(
      completeCycleStageUpload({ ...base, userId: "u-abby", role: null, slug: "final-cut" })
    ).rejects.toThrow("FORBIDDEN");
    expectNoWrites();
  });

  it("refuses a version the caller did not start for this cycle", async () => {
    mocks.rowFindUnique.mockResolvedValue(row());
    mocks.rowFindUniqueOrThrow.mockResolvedValue(row());
    mocks.versionFindFirst.mockResolvedValue(null);
    await expect(
      completeCycleStageUpload({ ...base, userId: "u-abby", role: null, slug: "a-roll" })
    ).rejects.toThrow("NOT_FOUND");
    expect(mocks.versionFindFirst).toHaveBeenCalledWith({
      where: {
        id: "version-1",
        mediaItemId: "media-1",
        createdById: "u-abby",
        versionNumber: 1,
        mediaItem: { createdById: "u-abby", deletedAt: null, project: { name: "Cycle 2" } }
      }
    });
    expectNoWrites();
  });

  it("refuses an Initial Cut version on media other than the row's cut", async () => {
    const cutRow = row({ aRollBRoll: true, initialCutMediaItemId: "media-cut" });
    mocks.rowFindUnique.mockResolvedValue(cutRow);
    mocks.rowFindUniqueOrThrow.mockResolvedValue(cutRow);
    await expect(
      completeCycleStageUpload({ ...base, userId: "u-abby", role: null, slug: "initial-cut" })
    ).rejects.toThrow("NOT_FOUND");
    expect(mocks.versionFindFirst).not.toHaveBeenCalled();
    expectNoWrites();
  });

  it("lets a member finish their own A-roll upload", async () => {
    mocks.rowFindUnique.mockResolvedValue(row());
    mocks.rowFindUniqueOrThrow.mockResolvedValue(row());
    await completeCycleStageUpload({ ...base, userId: "u-abby", role: null, slug: "a-roll" });
    expect(mocks.versionUpdate).toHaveBeenCalledTimes(1);
    expect(mocks.stageMediaUpsert).toHaveBeenCalledTimes(1);
  });
});
