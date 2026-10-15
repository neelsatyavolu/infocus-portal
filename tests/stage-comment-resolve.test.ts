import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ findComment: vi.fn(), updateComment: vi.fn(), findRow: vi.fn() }));
vi.mock("@/src/lib/prisma", () => ({
  prisma: {
    packageStageComment: { findUnique: m.findComment, update: m.updateComment },
    packageProgressRow: { findUnique: m.findRow }
  }
}));
vi.mock("@/src/server/package-review-notify", () => ({ notifyPackageMembersOfComment: vi.fn() }));
vi.mock("@/src/lib/package-producer-assignment", () => ({
  producerMayActOnPackage: (_role: unknown, userId: string, row: { assignedProducerUserId: string | null }) =>
    row.assignedProducerUserId === userId
}));

import { setStageCommentResolved } from "@/src/server/package-stage-comments";

const row = {
  id: "row-1",
  assignedProducerUserId: "otto",
  members: [{ userId: "abby" }],
  approval: { stage: "DRAFT" }
};

describe("setStageCommentResolved", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    m.findComment.mockResolvedValue({ id: "note-1", rowId: "row-1" });
    m.findRow.mockResolvedValue(row);
    m.updateComment.mockImplementation(async ({ data }: { data: { resolvedAt: Date | null } }) => ({
      id: "note-1",
      resolvedAt: data.resolvedAt
    }));
  });

  it("lets a group member mark a note resolved", async () => {
    const result = await setStageCommentResolved({ commentId: "note-1", userId: "abby", role: null, resolved: true });
    expect(m.updateComment).toHaveBeenCalledWith(
      expect.objectContaining({ data: { resolvedAt: expect.any(Date), resolvedById: "abby" } })
    );
    expect(result.resolvedAt).not.toBeNull();
  });

  it("lets the package's producer reopen a note", async () => {
    const result = await setStageCommentResolved({
      commentId: "note-1",
      userId: "otto",
      role: "ASSOCIATE_PRODUCER",
      resolved: false
    });
    expect(m.updateComment).toHaveBeenCalledWith(
      expect.objectContaining({ data: { resolvedAt: null, resolvedById: null } })
    );
    expect(result.resolvedAt).toBeNull();
  });

  it("refuses a producer who only reads the package", async () => {
    await expect(
      setStageCommentResolved({ commentId: "note-1", userId: "sage", role: "ASSOCIATE_PRODUCER", resolved: true })
    ).rejects.toThrow("FORBIDDEN");
    expect(m.updateComment).not.toHaveBeenCalled();
  });

  it("refuses someone outside the group", async () => {
    await expect(
      setStageCommentResolved({ commentId: "note-1", userId: "sage", role: null, resolved: true })
    ).rejects.toThrow("FORBIDDEN");
  });

  it("reports a missing note", async () => {
    m.findComment.mockResolvedValue(null);
    await expect(
      setStageCommentResolved({ commentId: "gone", userId: "abby", role: null, resolved: true })
    ).rejects.toThrow("NOT_FOUND");
  });
});
