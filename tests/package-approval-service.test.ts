import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  packageApproval: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  packageProgressRow: { findUnique: vi.fn(), update: vi.fn() },
  packageApprovalSignoff: { deleteMany: vi.fn(), create: vi.fn() },
  mediaVersion: { updateMany: vi.fn(), update: vi.fn(), findFirst: vi.fn() },
  mediaItem: { findUnique: vi.fn() },
  user: { findUnique: vi.fn() },
  $transaction: vi.fn()
}));
vi.mock("@/src/lib/prisma", () => ({ prisma: db }));
vi.mock("@/src/server/associate-review-history", () => ({ recordAssociateReviewHistory: vi.fn() }));
vi.mock("@/src/server/package-stage-comments", () => ({ createStageComment: vi.fn() }));
const notify = vi.hoisted(() => ({ notifyPackageMembersOfDecision: vi.fn(), notifyPackageReview: vi.fn() }));
vi.mock("@/src/server/package-review-notify", () => notify);

import { approveAnyway, recordDecision, unapproveCut, submitCutReview } from "@/src/server/package-approval-service";

const actor = { userId: "ap", email: "ap@example.com", role: "ASSOCIATE_PRODUCER" as const };
const versions = [
  { id: "v1", versionNumber: 1, createdAt: new Date("2026-09-01") },
  { id: "v2", versionNumber: 2, createdAt: new Date("2026-09-03") }
];
const signoffs = [
  { userId: "ap", stage: "ASSOCIATE_REVIEW", approved: true, createdAt: new Date("2026-09-02") },
  { userId: "adviser", stage: "ADVISER_REVIEW", approved: true, createdAt: new Date("2026-09-04") },
  { userId: "ep", stage: "EXECUTIVE_REVIEW", approved: true, createdAt: new Date("2026-09-05") },
  { userId: "ep2", stage: "EXECUTIVE_REVIEW", approved: true, createdAt: new Date("2026-09-05") }
];
function row(queuedForAirAt: Date | null = null) {
  return {
    assignedProducerUserId: "ap", members: [], queuedForAirAt,
    awaitingRevisedInitialCut: false, initialCutMediaItemId: "cut",
    initialCutMediaItem: {
      id: "cut", projectId: "project", currentVersionId: "v2", versions,
      currentVersion: { id: "v2", versionNumber: 2, approvalStatus: "IN_REVIEW" }
    }
  };
}
beforeEach(() => {
  vi.resetAllMocks();
  db.$transaction.mockImplementation(async (fn) => fn(db));
  db.packageApproval.findUnique.mockResolvedValue({ id: "approval", stage: "APPROVED", controversial: false, signoffs });
  db.packageProgressRow.findUnique.mockResolvedValue(row());
});
describe("unapproveCut", () => {
  it("reopens Stage 1, clears downstream votes and both invalidated video badges", async () => {
    const standIn = { userId: "aep", email: "aep@example.com", role: "EXECUTIVE_PRODUCER" as const };
    db.packageApproval.findUnique.mockResolvedValue({
      id: "approval", stage: "APPROVED", controversial: false,
      signoffs: [{ ...signoffs[0], userId: "aep" }, ...signoffs.slice(1)]
    });
    db.packageProgressRow.findUnique.mockResolvedValue({
      ...row(), assignedProducerUserId: null, assignedExecutiveProducerUserId: "aep"
    });
    await unapproveCut("row", standIn);
    expect(db.packageApproval.update).toHaveBeenCalledWith({ where: { id: "approval" }, data: { stage: "ASSOCIATE_REVIEW" } });
    expect(db.packageApprovalSignoff.deleteMany).toHaveBeenCalledWith({
      where: { approvalId: "approval", stage: { in: ["ASSOCIATE_REVIEW", "ADVISER_REVIEW", "EXECUTIVE_REVIEW", "APPROVED"] } }
    });
    expect(db.mediaVersion.updateMany).toHaveBeenCalledWith({
      where: { id: { in: expect.arrayContaining(["v1", "v2"]) } }, data: { approvalStatus: "IN_REVIEW" }
    });
    expect(db.packageProgressRow.update).toHaveBeenCalledWith({
      where: { id: "row" }, data: { awaitingRevisedInitialCut: false }
    });
  });
  it("removes only the withdrawing executive's vote", async () => {
    await unapproveCut("row", { userId: "ep", email: "ep@example.com", role: "EXECUTIVE_PRODUCER" });
    expect(db.packageApprovalSignoff.deleteMany).toHaveBeenCalledWith({
      where: { approvalId: "approval", stage: "EXECUTIVE_REVIEW", userId: "ep" }
    });
    expect(db.mediaVersion.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["v2"] } }, data: { approvalStatus: "IN_REVIEW" }
    });
  });
  it("does not let the assigned associate pull a package back after Stage 1", async () => {
    await expect(unapproveCut("row", actor)).rejects.toThrow("FORBIDDEN");
    expect(db.packageApproval.update).not.toHaveBeenCalled();
  });
  it("does not change queued packages or another producer's approval", async () => {
    db.packageProgressRow.findUnique.mockResolvedValue(row(new Date()));
    await expect(unapproveCut("row", actor)).rejects.toThrow("FORBIDDEN");
    db.packageProgressRow.findUnique.mockResolvedValue(row());
    await expect(unapproveCut("row", { ...actor, userId: "other" })).rejects.toThrow("FORBIDDEN");
    expect(db.packageApproval.update).not.toHaveBeenCalled();
    expect(db.mediaVersion.updateMany).not.toHaveBeenCalled();
  });
});
describe("submitCutReview", () => {
  it("marks the current video for revisions and keeps the package in Stage 1", async () => {
    db.packageApproval.findUnique.mockResolvedValue({
      id: "approval", stage: "ASSOCIATE_REVIEW", controversial: false, signoffs: []
    });
    db.mediaVersion.findFirst.mockResolvedValue({ id: "v2", approvalStatus: "IN_REVIEW" });
    db.mediaItem.findUnique.mockResolvedValue({ currentVersionId: "v2" });
    await submitCutReview("row", actor, "v2");
    expect(db.packageApproval.update).not.toHaveBeenCalled();
    expect(db.mediaVersion.update).toHaveBeenCalledWith({ where: { id: "v2" }, data: { approvalStatus: "NEEDS_CHANGES" } });
    expect(notify.notifyPackageMembersOfDecision).toHaveBeenCalledWith(expect.objectContaining({ kind: "sent-back" }));
  });
  it("rejects a review of an older version without changing anything", async () => {
    db.mediaVersion.findFirst.mockResolvedValue({ id: "v1", approvalStatus: "IN_REVIEW" });
    await expect(submitCutReview("row", actor, "v1")).rejects.toThrow("BAD_REQUEST");
    expect(db.$transaction).not.toHaveBeenCalled();
  });
});
describe("recordDecision", () => {
  it("keeps a Stage 2 send-back with the adviser", async () => {
    db.packageApproval.findUnique.mockResolvedValue({
      id: "approval", stage: "ADVISER_REVIEW", controversial: false, signoffs: signoffs.slice(0, 1)
    });
    db.mediaItem.findUnique.mockResolvedValue({ currentVersionId: "v2" });
    db.user.findUnique.mockResolvedValue({ name: "Otto", nickname: null, email: "adviser@example.edu" });
    const adviser = { userId: "adviser", email: "adviser@example.edu", role: "ADVISER" as const };
    await expect(recordDecision("row", adviser, false, "Needs revisions", "v2")).resolves.toEqual({
      type: "SEND_BACK", stage: "ADVISER_REVIEW"
    });
    expect(db.packageApproval.update).not.toHaveBeenCalled();
    expect(db.packageApprovalSignoff.deleteMany).not.toHaveBeenCalled();
    expect(db.mediaVersion.update).toHaveBeenCalledWith({ where: { id: "v2" }, data: { approvalStatus: "NEEDS_CHANGES" } });
  });
  it("keeps a Stage 3 send-back on record while clearing earlier exec votes", async () => {
    db.packageApproval.findUnique.mockResolvedValue({
      id: "approval", stage: "EXECUTIVE_REVIEW", controversial: false, signoffs: signoffs.slice(0, 3)
    });
    db.mediaItem.findUnique.mockResolvedValue({ currentVersionId: "v2" });
    db.user.findUnique.mockResolvedValue({ name: "Sage", nickname: null, email: "ep2@example.com" });
    const ep = { userId: "ep2", email: "ep2@example.com", role: "EXECUTIVE_PRODUCER" as const };
    await expect(recordDecision("row", ep, false, "Needs revisions", "v2")).resolves.toMatchObject({ type: "SEND_BACK" });
    expect(db.packageApprovalSignoff.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ stage: "EXECUTIVE_REVIEW", approved: false, userId: "ep2" })
    });
    expect(db.packageApprovalSignoff.deleteMany.mock.invocationCallOrder[0])
      .toBeLessThan(db.packageApprovalSignoff.create.mock.invocationCallOrder[0]);
    expect(db.packageApprovalSignoff.deleteMany).toHaveBeenCalledWith({
      where: { approvalId: "approval", stage: "EXECUTIVE_REVIEW" }
    });
    expect(db.packageApproval.update).not.toHaveBeenCalled();
  });
  it("approving after a send-back moves the latest version to the next stage", async () => {
    db.packageApproval.findUnique.mockResolvedValue({
      id: "approval", stage: "ASSOCIATE_REVIEW", controversial: false,
      signoffs: [{ userId: "ap", stage: "ASSOCIATE_REVIEW", approved: false, createdAt: new Date("2026-09-04") }]
    });
    db.mediaItem.findUnique.mockResolvedValue({ currentVersionId: "v2" });
    db.user.findUnique.mockResolvedValue({ name: "Abby", nickname: null, email: "ap@example.com" });
    await expect(recordDecision("row", actor, true, "", "v2")).resolves.toEqual({ type: "ADVANCE", stage: "ADVISER_REVIEW" });
    expect(db.packageApproval.update).toHaveBeenCalledWith({ where: { id: "approval" }, data: { stage: "ADVISER_REVIEW" } });
    expect(db.mediaVersion.update).toHaveBeenCalledWith({ where: { id: "v2" }, data: { approvalStatus: "APPROVED" } });
  });
});
describe("approveAnyway", () => {
  const reviewed = [
    { userId: "ap", stage: "ASSOCIATE_REVIEW", approved: false, createdAt: new Date("2026-09-02") }
  ];
  beforeEach(() => {
    db.packageApproval.findUnique.mockResolvedValue({
      id: "approval", stage: "DRAFT", controversial: false, signoffs: reviewed
    });
    db.packageApproval.updateMany.mockResolvedValue({ count: 1 });
    db.user.findUnique.mockResolvedValue({ name: "Avery", nickname: null, email: "ap@example.com" });
  });
  it("sends the reviewed latest cut to Stage 2 and tells the adviser", async () => {
    await approveAnyway("row", actor);
    expect(db.packageApproval.updateMany).toHaveBeenCalledWith({
      where: { id: "approval", stage: "DRAFT" }, data: { stage: "ADVISER_REVIEW" }
    });
    expect(db.packageProgressRow.update).toHaveBeenCalledWith({
      where: { id: "row" }, data: { awaitingRevisedInitialCut: false, initialCut: true }
    });
    expect(db.packageApprovalSignoff.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ approvalId: "approval", userId: "ap", stage: "ASSOCIATE_REVIEW", approved: true, mediaItemId: "cut" })
    });
    expect(db.mediaVersion.update).toHaveBeenCalledWith({ where: { id: "v2" }, data: { approvalStatus: "APPROVED" } });
    expect(notify.notifyPackageReview).toHaveBeenCalledWith({ progressRowId: "row", kind: "adviser", mediaVersionId: "v2" });
    expect(notify.notifyPackageMembersOfDecision).toHaveBeenCalledWith(expect.objectContaining({ kind: "stage-1" }));
  });
  it("refuses a package another stage sent back", async () => {
    db.packageApproval.findUnique.mockResolvedValue({
      id: "approval", stage: "DRAFT", controversial: false,
      signoffs: [
        { userId: "ap", stage: "ASSOCIATE_REVIEW", approved: true, createdAt: new Date("2026-09-02") },
        { userId: "adviser", stage: "ADVISER_REVIEW", approved: false, createdAt: new Date("2026-09-04") }
      ]
    });
    await expect(approveAnyway("row", actor)).rejects.toThrow("FORBIDDEN");
    expect(db.$transaction).not.toHaveBeenCalled();
  });
  it("refuses producers who do not own Stage 1", async () => {
    await expect(approveAnyway("row", { ...actor, userId: "other" })).rejects.toThrow("FORBIDDEN");
    expect(db.$transaction).not.toHaveBeenCalled();
  });
  it("does nothing if a new upload already moved the package on", async () => {
    db.packageApproval.updateMany.mockResolvedValue({ count: 0 });
    await expect(approveAnyway("row", actor)).rejects.toThrow("FORBIDDEN");
    expect(db.packageApprovalSignoff.create).not.toHaveBeenCalled();
    expect(notify.notifyPackageReview).not.toHaveBeenCalled();
  });
});
