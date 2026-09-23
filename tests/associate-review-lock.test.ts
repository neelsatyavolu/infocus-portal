import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rowFindUnique: vi.fn(), rowFindFirst: vi.fn() }));
vi.mock("@/src/lib/prisma", () => ({
  prisma: { packageProgressRow: { findUnique: mocks.rowFindUnique, findFirst: mocks.rowFindFirst } }
}));
vi.mock("@/src/server/package-review-notify", () => ({ notifyPackageMembersOfComment: vi.fn() }));
import { initialCutReviewClosed } from "@/src/server/comment-access";
import { requireStageCommentAccess } from "@/src/server/package-stage-comments";

const row = (stage: string, members: string[] = []) => ({
  id: "row",
  assignedProducerUserId: "ap",
  members: members.map((userId) => ({ userId })),
  approval: { stage }
});

describe("associate review lock after Stage 1", () => {
  beforeEach(() => vi.clearAllMocks());

  it("lets the assigned associate post Initial Cut feedback during Stage 1", async () => {
    mocks.rowFindUnique.mockResolvedValue(row("ASSOCIATE_REVIEW"));
    await expect(
      requireStageCommentAccess("row", "ap", "ASSOCIATE_PRODUCER", { write: true, stage: "initial-cut" })
    ).resolves.toMatchObject({ isProducer: true });
  });

  it("blocks the assigned associate from Initial Cut feedback at Stage 2", async () => {
    mocks.rowFindUnique.mockResolvedValue(row("ADVISER_REVIEW"));
    await expect(
      requireStageCommentAccess("row", "ap", "ASSOCIATE_PRODUCER", { write: true, stage: "initial-cut" })
    ).rejects.toThrow("FORBIDDEN");
  });

  it("keeps other stages and executives open", async () => {
    mocks.rowFindUnique.mockResolvedValue(row("EXECUTIVE_REVIEW"));
    await expect(
      requireStageCommentAccess("row", "ap", "ASSOCIATE_PRODUCER", { write: true, stage: "final-cut" })
    ).resolves.toBeTruthy();
    await expect(
      requireStageCommentAccess("row", "ep", "EXECUTIVE_PRODUCER", { write: true, stage: "initial-cut" })
    ).resolves.toBeTruthy();
  });

  it("closes timeline review on the Initial Cut for associates from Stage 2 on", async () => {
    mocks.rowFindFirst.mockResolvedValue(row("ADVISER_REVIEW"));
    await expect(initialCutReviewClosed("media", "ap", "ASSOCIATE_PRODUCER")).resolves.toBe(true);
    mocks.rowFindFirst.mockResolvedValue(row("ASSOCIATE_REVIEW"));
    await expect(initialCutReviewClosed("media", "ap", "ASSOCIATE_PRODUCER")).resolves.toBe(false);
  });

  it("leaves package members, executives, and non-package media alone", async () => {
    mocks.rowFindFirst.mockResolvedValue(row("ADVISER_REVIEW", ["ap"]));
    await expect(initialCutReviewClosed("media", "ap", "ASSOCIATE_PRODUCER")).resolves.toBe(false);
    await expect(initialCutReviewClosed("media", "ep", "EXECUTIVE_PRODUCER")).resolves.toBe(false);
    mocks.rowFindFirst.mockResolvedValue(null);
    await expect(initialCutReviewClosed("media", "ap", "ASSOCIATE_PRODUCER")).resolves.toBe(false);
  });
});
