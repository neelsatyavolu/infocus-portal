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

    const row = { cycleNumber: 2, members: { some: { userId: "student-1" } } };
    expect(mocks.commentFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: { row } }));
    expect(mocks.readFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "student-1", row } })
    );
    expect(mocks.memberFindMany).not.toHaveBeenCalled();
    expect(unread).toEqual({ brainstorming: 1, "a-roll": 0, "initial-cut": 0, "final-cut": 0 });
  });

  it("returns zero counts when the student has no row in the cycle", async () => {
    mocks.commentFindMany.mockResolvedValue([]);
    mocks.readFindMany.mockResolvedValue([]);

    const unread = await loadStageCommentUnread("student-1", 3);

    expect(unread).toEqual({ brainstorming: 0, "a-roll": 0, "initial-cut": 0, "final-cut": 0 });
  });
});
