import { describe, expect, it } from "vitest";
import { decideKioskScan } from "@/src/lib/equipment-checkout";

const student = { id: "stu-1" };
const other = { id: "stu-2" };

describe("decideKioskScan", () => {
  it("checks out an in item", () => {
    const result = decideKioskScan({
      studentId: student.id,
      item: { archivedAt: null, checkedOut: false, checkedOutById: null, onHoldForStudentId: null }
    });
    expect(result).toEqual({ action: "checkout" });
  });

  it("returns when the same student has it", () => {
    const result = decideKioskScan({
      studentId: student.id,
      item: { archivedAt: null, checkedOut: true, checkedOutById: student.id, onHoldForStudentId: null }
    });
    expect(result).toEqual({ action: "return" });
  });

  it("rejects out to someone else", () => {
    const result = decideKioskScan({
      studentId: student.id,
      item: { archivedAt: null, checkedOut: true, checkedOutById: other.id, onHoldForStudentId: null }
    });
    expect(result.action).toBe("error");
    if (result.action === "error") expect(result.code).toBe("OUT_TO_OTHER");
  });

  it("rejects hold for someone else", () => {
    const result = decideKioskScan({
      studentId: student.id,
      item: { archivedAt: null, checkedOut: false, checkedOutById: null, onHoldForStudentId: other.id }
    });
    expect(result.action).toBe("error");
    if (result.action === "error") expect(result.code).toBe("HELD_FOR_OTHER");
  });

  it("checks out a hold for this student and clears hold", () => {
    const result = decideKioskScan({
      studentId: student.id,
      item: { archivedAt: null, checkedOut: false, checkedOutById: null, onHoldForStudentId: student.id }
    });
    expect(result).toEqual({ action: "checkout", clearHold: true });
  });

  it("rejects archived items", () => {
    const result = decideKioskScan({
      studentId: student.id,
      item: { archivedAt: new Date(), checkedOut: false, checkedOutById: null, onHoldForStudentId: null }
    });
    expect(result.action).toBe("error");
    if (result.action === "error") expect(result.code).toBe("NOT_FOUND");
  });

  it("rejects a missing item", () => {
    const result = decideKioskScan({
      studentId: student.id,
      item: null
    });
    expect(result.action).toBe("error");
    if (result.action === "error") expect(result.code).toBe("NOT_FOUND");
  });
});
