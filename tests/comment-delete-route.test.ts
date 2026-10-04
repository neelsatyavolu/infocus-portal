import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  reviewComment: { findUnique: vi.fn(), delete: vi.fn() },
  activityEvent: { create: vi.fn() },
  auditLog: { create: vi.fn() },
  $transaction: vi.fn()
}));
vi.mock("@/src/lib/auth", () => ({
  requireUserId: vi.fn(async () => "author"),
  syncUserProfile: vi.fn(async () => ({ email: "author@example.edu" }))
}));
vi.mock("@/src/lib/prisma", () => ({ prisma: db }));
vi.mock("@/src/server/workspace-access", () => ({
  resolveWorkspaceAccess: vi.fn(async () => ({ membership: { role: "COMMENTER" } }))
}));

import { DELETE } from "@/app/api/comments/[commentId]/route";

const comment = {
  id: "comment-1",
  authorId: "author",
  parentCommentId: null,
  mediaVersion: {
    id: "version-1",
    mediaItemId: "item-1",
    mediaItem: { project: { id: "project-1", workspaceId: "workspace-1" } }
  }
};

function call() {
  return DELETE(new Request("http://localhost/api/comments/comment-1", { method: "DELETE" }), {
    params: Promise.resolve({ commentId: "comment-1" })
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  db.reviewComment.findUnique.mockResolvedValue(comment);
  db.reviewComment.delete.mockResolvedValue(comment);
  db.$transaction.mockImplementation(async (run) => run(db));
});

describe("DELETE /api/comments/[commentId]", () => {
  it("does not link the activity and audit rows to the deleted comment", async () => {
    const response = await call();

    expect(response.status).toBe(200);
    expect(db.reviewComment.delete).toHaveBeenCalledWith({ where: { id: "comment-1" } });
    const activity = db.activityEvent.create.mock.calls[0][0].data;
    const audit = db.auditLog.create.mock.calls[0][0].data;
    expect(activity.commentId).toBeUndefined();
    expect(audit.commentId).toBeUndefined();
    expect(activity.payload).toMatchObject({ commentId: "comment-1" });
    expect(audit.targetId).toBe("comment-1");
  });

  it("forbids deleting someone else's comment as a commenter", async () => {
    db.reviewComment.findUnique.mockResolvedValue({ ...comment, authorId: "someone-else" });

    const response = await call();

    expect(response.status).toBe(403);
    expect(db.reviewComment.delete).not.toHaveBeenCalled();
  });
});
