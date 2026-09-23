import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ findMany: vi.fn(), upsert: vi.fn() }));
vi.mock("@/src/lib/prisma", () => ({ prisma: { equipmentStudent: m } }));
vi.mock("@/src/server/equipment-directory", () => ({ directoryLookup: vi.fn() }));
import { resolveEquipmentStudentContact } from "@/src/server/equipment-students";
describe("checkout student name and email", () => {
  beforeEach(() => { vi.resetAllMocks(); m.findMany.mockResolvedValue([]); m.upsert.mockResolvedValue({ id: "student" }); });
  it("normalizes the name and email and preserves PAUSD student IDs", async () => {
    await resolveEquipmentStudentContact(" Ada Lovelace ", " AL12345@PAUSD.US ");
    expect(m.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { studentId: "95012345" },
      create: { studentId: "95012345", name: "Ada Lovelace", email: "al12345@pausd.us" }
    }));
  });
  it("reuses the existing record found by email for returns and holds", async () => {
    m.findMany.mockResolvedValue([{ studentId: "legacy-123", email: "ada@example.com" }]);
    await resolveEquipmentStudentContact("Ada", "ada@example.com");
    expect(m.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { studentId: "legacy-123" } }));
  });
  it("uses a stable email key for other addresses", async () => {
    await resolveEquipmentStudentContact("Ada", "ada@example.com");
    expect(m.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { studentId: "email:ada@example.com" } }));
  });
  it("does not interpret a lookalike domain as a PAUSD ID", async () => {
    await resolveEquipmentStudentContact("Ada", "al12345@pausd.us.example.com");
    expect(m.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { studentId: "email:al12345@pausd.us.example.com" } }));
  });
  it("does not overwrite a different email on a matching student ID", async () => {
    m.findMany.mockResolvedValue([{ studentId: "95012345", email: "other12345@pausd.us" }]);
    await expect(resolveEquipmentStudentContact("Ada", "al12345@pausd.us")).rejects.toThrow();
    expect(m.upsert).not.toHaveBeenCalled();
  });
  it("does not guess between duplicate existing records", async () => {
    m.findMany.mockResolvedValue([{ studentId: "1" }, { studentId: "2" }]);
    await expect(resolveEquipmentStudentContact("Ada", "ada@example.com")).rejects.toThrow();
    expect(m.upsert).not.toHaveBeenCalled();
  });
  it.each([[" ", "ada@example.com"], ["Ada", "bad-email"], ["Ada", ""]])("requires name and valid email", async (name, email) => {
    await expect(resolveEquipmentStudentContact(name, email)).rejects.toThrow();
    expect(m.upsert).not.toHaveBeenCalled();
  });
});
