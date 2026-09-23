export const PACKAGE_CYCLE_NUMBERS = [1, 2, 3, 4] as const;

/** Last cycle number that belongs to semester 1. Cycle 4+ is semester 2 only. */
export const LAST_S1_CYCLE_NUMBER = 3;

export function cycleSemesterTerm(cycleNumber: number): 1 | 2 {
  return cycleNumber <= LAST_S1_CYCLE_NUMBER ? 1 : 2;
}

export function parseSemesterTerm(label: string): 1 | 2 | null {
  const match = label.match(/\bS([12])\b/i);
  if (!match) return null;
  return Number(match[1]) === 2 ? 2 : 1;
}

/** Cycle editor field: true quality score out of 50. */
export const MAX_EFFORT_POINTS = 50;
/** Unused in 2026-27. Kept so older rows still serialize. */
export const MAX_TEAMWORK_POINTS = 15;
export const MAX_TOTAL_POINTS = MAX_EFFORT_POINTS;

export function parseCycleNumber(value: string | null) {
  if (!value) {
    return PACKAGE_CYCLE_NUMBERS[0];
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || !PACKAGE_CYCLE_NUMBERS.includes(parsed as (typeof PACKAGE_CYCLE_NUMBERS)[number])) {
    throw new Error("BAD_REQUEST");
  }

  return parsed;
}

export function gradeTotal(effortPoints: number, _teamworkPoints = 0) {
  return effortPoints;
}

export function gradePercentage(total: number) {
  return Number(((total / MAX_TOTAL_POINTS) * 100).toFixed(1));
}
