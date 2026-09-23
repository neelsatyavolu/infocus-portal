import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ findUnique: vi.fn(), update: vi.fn() }));
vi.mock("@/src/lib/prisma", () => ({ prisma: { packageProgressRow: db } }));
import { loadGroupRosterNotes, saveGroupRosterNotes } from "@/src/server/group-roster-notes";

beforeEach(() => {
  vi.clearAllMocks();
  db.findUnique.mockResolvedValue({ id: "row", possibleIdeas: "Cycle notes", assignedProducerUserId: "ap", members: [] });
  db.update.mockResolvedValue({ possibleIdeas: "Updated" });
});

describe("group roster notes", () => {
  it("reads the Package Cycle Notes field", async () => {
    expect(await loadGroupRosterNotes("row", "ap", "ASSOCIATE_PRODUCER")).toEqual({ possibleIdeas: "Cycle notes" });
  });
  it("updates only the shared notes field", async () => {
    await saveGroupRosterNotes("row", "ap", "ASSOCIATE_PRODUCER", "Updated");
    expect(db.update).toHaveBeenCalledWith({ where: { id: "row" }, data: { possibleIdeas: "Updated" }, select: { possibleIdeas: true } });
  });
  it.each([null, "ASSOCIATE_PRODUCER"] as const)("rejects unauthorized viewer %s", async (role) => {
    await expect(saveGroupRosterNotes("row", "other", role, "Updated")).rejects.toThrow("FORBIDDEN");
    expect(db.update).not.toHaveBeenCalled();
  });
  it("rejects an AP who is a member of the group", async () => {
    db.findUnique.mockResolvedValue({ assignedProducerUserId: "ap", members: [{ userId: "ap" }] });
    await expect(saveGroupRosterNotes("row", "ap", "ASSOCIATE_PRODUCER", "Updated")).rejects.toThrow("FORBIDDEN");
  });
  it.each(["EXECUTIVE_PRODUCER", "ADVISER", "SUPER_ADMIN"] as const)("allows %s on other groups", async (role) => {
    await expect(saveGroupRosterNotes("row", "exec", role, "Updated")).resolves.toEqual({ possibleIdeas: "Updated" });
  });
  it("returns not found for a missing group", async () => {
    db.findUnique.mockResolvedValue(null);
    await expect(loadGroupRosterNotes("missing", "ap", "ASSOCIATE_PRODUCER")).rejects.toThrow("NOT_FOUND");
  });
});
