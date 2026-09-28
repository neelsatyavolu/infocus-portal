import { prisma } from "@/src/lib/prisma";

export const DEFAULT_CYCLES_PER_SEMESTER = 3;
export const MIN_CYCLES_PER_SEMESTER = 1;
export const MAX_CYCLES_PER_SEMESTER = 8;

const SETTING_ID = "singleton";

export async function getProgramSettings() {
  const existing = await prisma.programSetting.findUnique({
    where: { id: SETTING_ID }
  });

  if (existing) {
    return existing;
  }

  return prisma.programSetting.upsert({
    where: { id: SETTING_ID },
    update: {},
    create: { id: SETTING_ID, cyclesPerSemester: DEFAULT_CYCLES_PER_SEMESTER }
  });
}

export async function getCyclesPerSemester() {
  const settings = await getProgramSettings();
  return settings.cyclesPerSemester;
}

export function sanitizeCyclesPerSemester(value: number) {
  if (!Number.isInteger(value)) {
    throw new Error("BAD_REQUEST");
  }

  if (value < MIN_CYCLES_PER_SEMESTER || value > MAX_CYCLES_PER_SEMESTER) {
    throw new Error("BAD_REQUEST");
  }

  return value;
}

export async function setCyclesPerSemester(value: number) {
  const cyclesPerSemester = sanitizeCyclesPerSemester(value);

  return prisma.programSetting.upsert({
    where: { id: SETTING_ID },
    update: { cyclesPerSemester },
    create: { id: SETTING_ID, cyclesPerSemester }
  });
}

export async function getCycleNumbers() {
  const count = await getCyclesPerSemester();
  return Array.from({ length: count }, (_, index) => index + 1);
}

export async function assertValidCycleNumber(value: number) {
  const count = await getCyclesPerSemester();

  if (!Number.isInteger(value) || value < 1 || value > count) {
    throw new Error("BAD_REQUEST");
  }

  return value;
}

/** The cycle the Class Board shows, or null to follow the current cycle. */
export async function getClassBoardCycleNumber() {
  const { classBoardCycleNumber } = await getProgramSettings();
  if (classBoardCycleNumber === null) return null;
  // A pinned cycle that was later removed falls back to the current cycle.
  const exists = await prisma.packageCycle.count({ where: { cycleNumber: classBoardCycleNumber } });
  return exists ? classBoardCycleNumber : null;
}

export async function setClassBoardCycleNumber(value: number | null) {
  if (value !== null) {
    const exists = await prisma.packageCycle.count({ where: { cycleNumber: value } });
    if (!exists) throw new Error("BAD_REQUEST");
  }
  return prisma.programSetting.upsert({
    where: { id: SETTING_ID },
    update: { classBoardCycleNumber: value },
    create: { id: SETTING_ID, cyclesPerSemester: DEFAULT_CYCLES_PER_SEMESTER, classBoardCycleNumber: value }
  });
}
