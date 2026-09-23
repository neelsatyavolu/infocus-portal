export const MEMBER_GENERAL_CYCLE_NUMBER = 0;
export const MEMBER_NOTE_MAX = 4000;

export function isGeneralMemberNoteCycle(cycleNumber: number) {
  return cycleNumber === MEMBER_GENERAL_CYCLE_NUMBER;
}

export function memberNoteCycleIsAllowed(cycleNumber: number, cycleNumbers: number[]) {
  if (!Number.isInteger(cycleNumber)) return false;
  if (isGeneralMemberNoteCycle(cycleNumber)) return true;
  return cycleNumbers.includes(cycleNumber);
}

export function memberNoteKey(userId: string, cycleNumber: number) {
  return `${userId}:${cycleNumber}`;
}

export function parseMemberNoteCycle(value: unknown) {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new Error("BAD_REQUEST");
  }
  if (value < MEMBER_GENERAL_CYCLE_NUMBER || value > 8) {
    throw new Error("BAD_REQUEST");
  }
  return value;
}
