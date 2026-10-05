import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  memberFindMany: vi.fn(),
  commentFindMany: vi.fn(),
  readFindMany: vi.fn()
}));
vi.mock("@/src/lib/prisma", () => ({
  prisma: {
    packageProgressMember: { findMany: mocks.memberFindMany },
    packageStageComment: { findMany: mocks.commentFindMany },
    packageStageCommentRead: { findMany: mocks.readFindMany }
  }
}));
vi.mock("@/src/server/package-review-notify", () => ({ notifyPackageMembersOfComment: vi.fn() }));
import { loadStageCommentUnread } from "@/src/server/package-stage-comments";

describe("loadStageCommentUnread", () => {
  beforeEach(() => vi.clearAllMocks());

  it("only counts the student's row in the given cycle", async () => {
    mocks.memberFindMany.mockResolvedValue([{ rowId: "row-cycle-2" }]);
    mocks.commentFindMany.mockResolvedValue([
      {
        rowId: "row-cycle-2",
        stage: "brainstorming",
        authorId: "producer-1",
        createdAt: new Date("2026-10-01T18:00:00.000Z")
      }
    ]);
    mocks.readFindMany.mockResolvedValue([]);

    const unread = await loadStageCommentUnread("student-1", 2);

    expect(mocks.memberFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "student-1", row: { cycleNumber: 2 } } })
    );
    expect(unread).toEqual({ brainstorming: 1, "a-roll": 0, "initial-cut": 0, "final-cut": 0 });
  });
});
