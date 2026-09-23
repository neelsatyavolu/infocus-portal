export type KioskItem = {
  archivedAt: Date | null;
  checkedOut: boolean;
  checkedOutById: string | null;
  onHoldForStudentId: string | null;
};

export type KioskDecision =
  | { action: "checkout"; clearHold?: boolean }
  | { action: "return" }
  | { action: "error"; code: "NOT_FOUND" | "OUT_TO_OTHER" | "HELD_FOR_OTHER" };

export function decideKioskScan(input: { studentId: string; item: KioskItem | null }): KioskDecision {
  const { studentId, item } = input;
  if (!item || item.archivedAt) {
    return { action: "error", code: "NOT_FOUND" };
  }
  if (item.checkedOut && item.checkedOutById === studentId) {
    return { action: "return" };
  }
  if (item.checkedOut) {
    return { action: "error", code: "OUT_TO_OTHER" };
  }
  if (item.onHoldForStudentId && item.onHoldForStudentId !== studentId) {
    return { action: "error", code: "HELD_FOR_OTHER" };
  }
  if (item.onHoldForStudentId) {
    return { action: "checkout", clearHold: true };
  }
  return { action: "checkout" };
}
