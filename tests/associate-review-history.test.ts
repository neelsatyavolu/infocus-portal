import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ row: vi.fn(), create: vi.fn(), workspace: vi.fn() }));
vi.mock("@/src/lib/prisma", () => ({ prisma: { packageProgressRow: { findUnique: mocks.row }, auditLog: { create: mocks.create } } }));
vi.mock("@/src/lib/canonical-workspace", () => ({ getCanonicalWorkspaceId: mocks.workspace }));
import { recordAssociateReviewHistory } from "@/src/server/associate-review-history";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.row.mockResolvedValue({ cycleNumber: 2, assignedProducerUserId: "ap", project: { workspaceId: "workspace" } });
  mocks.workspace.mockResolvedValue("canonical");
});
describe("durable associate review history", () => {
  it("snapshots the actor, assignment, cycle and media version independently of signoffs", async () => {
    await recordAssociateReviewHistory({ rowId: "row", stage: "initial-cut", kind: "review", actorId: "ap", note: "Fix audio", mediaVersionId: "v1" });
    expect(mocks.create).toHaveBeenCalledWith({ data: {
      workspaceId: "workspace", actorId: "ap", action: "associate.review", targetType: "PackageProgressRow", targetId: "row",
      metadata: { stage: "initial-cut", kind: "review", cycleNumber: 2, assignedProducerUserId: "ap", mediaVersionId: "v1", note: "Fix audio" }
    } });
    expect(mocks.workspace).not.toHaveBeenCalled();
  });
  it("supports brainstorming before a media project exists", async () => {
    mocks.row.mockResolvedValue({ cycleNumber: 2, assignedProducerUserId: "ap", project: null });
    await recordAssociateReviewHistory({ rowId: "row", stage: "brainstorming", kind: "ready" });
    expect(mocks.create.mock.calls[0][0].data.workspaceId).toBe("canonical");
  });
  it("propagates write failures so transactional callers roll back", async () => {
    mocks.create.mockRejectedValueOnce(new Error("Write failed"));
    await expect(recordAssociateReviewHistory({ rowId: "row", stage: "a-roll", kind: "review", actorId: "ap" })).rejects.toThrow("Write failed");
  });
});
