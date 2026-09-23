import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ row: vi.fn(), rows: vi.fn(), entries: vi.fn(), upsert: vi.fn(), workspace: vi.fn() }));
vi.mock("@/src/lib/prisma", () => ({ prisma: {
  packageProgressRow: { findMany: m.rows }, auditLog: { findMany: m.entries },
  $transaction: (fn: (tx: unknown) => unknown) => fn({ packageProgressRow: { findFirst: m.row }, auditLog: { upsert: m.upsert } })
} }));
vi.mock("@/src/lib/canonical-workspace", () => ({ getCanonicalWorkspaceId: m.workspace }));
import { loadProducerFeedbackGroups, saveProducerFeedback } from "@/src/server/producer-feedback";
const input = { helpfulness: 4, communication: 3, support: 5, body: "Useful feedback and helpful examples." };
beforeEach(() => { vi.clearAllMocks(); m.workspace.mockResolvedValue("ws"); m.row.mockResolvedValue({ id: "g", cycleNumber: 1, groupTopic: "Story", assignedProducerUserId: "ap" }); });
describe("anonymous producer feedback", () => {
  it("requires membership even when a caller is a producer", async () => {
    m.row.mockResolvedValue(null);
    await expect(saveProducerFeedback("outsider", "g", input)).rejects.toThrow("FORBIDDEN");
    expect(m.upsert).not.toHaveBeenCalled();
    expect(m.row.mock.calls[0][0].where.members).toEqual({ some: { userId: "outsider" } });
  });
  it("prevents self-review", async () => {
    await expect(saveProducerFeedback("ap", "g", input)).rejects.toThrow("FORBIDDEN");
  });
  it("supports past cycles and stores the group, never the submitting member", async () => {
    await saveProducerFeedback("student-secret-id", "g", input);
    const args = m.upsert.mock.calls[0][0];
    expect(args.create.actorId).toBeNull();
    expect(args.update.actorId).toBeNull();
    expect(args.create.metadata.cycleNumber).toBe(1);
    expect(JSON.stringify(args)).not.toContain("student-secret-id");
    expect(args.where.id).toBe("producer-feedback:g:ap");
  });
  it("returns only submission status to group members, not anonymous content", async () => {
    m.rows.mockResolvedValue([{ id: "g", cycleNumber: 1, groupTopic: "Story", assignedProducerUserId: "ap", assignedProducer: { name: "Alex" } }]);
    m.entries.mockResolvedValue([{ id: "producer-feedback:g:ap", metadata: input }]);
    const result = await loadProducerFeedbackGroups("student");
    expect(result[0].submitted).toBe(true);
    expect(JSON.stringify(result)).not.toContain(input.body);
    expect(result[0]).not.toHaveProperty("helpfulness");
  });
});
