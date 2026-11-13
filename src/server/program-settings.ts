import { cache } from "react";
import type { Prisma } from "@prisma/client";
import { parseProgramConfig, type ProgramConfig } from "@/src/lib/program-config";
import { SEMESTER_TWO_CYCLE_NUMBERS } from "@/src/lib/package-grades";
import { prisma } from "@/src/lib/prisma";
import { workTurnInClosedAfter, workTurnInClosedMessage } from "@/src/lib/work-turn-in";

export const DEFAULT_CYCLES_PER_SEMESTER = 3;
export const MIN_CYCLES_PER_SEMESTER = 1;
export const MAX_CYCLES_PER_SEMESTER = 8;

const SETTING_ID = "singleton";

/** Deduped per server render via React cache(); route handlers run it each call. */
export const getProgramSettings = cache(async function getProgramSettings() {
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
});

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

/**
 * Cycle Dates' cycles: the configured ones plus semester 2's, even while the count still hides
 * semester 2 (see SEMESTER_TWO_CYCLE_NUMBERS).
 */
export function cycleDatesNumbers(cyclesPerSemester: number) {
  const configured = Array.from({ length: cyclesPerSemester }, (_, index) => index + 1);
  return [...new Set([...configured, ...SEMESTER_TWO_CYCLE_NUMBERS])].sort((a, b) => a - b);
}

/** Cycle Dates can save any of its cycles, including semester 2's before the count reaches them. */
export async function assertCycleDatesNumber(value: number) {
  if (!cycleDatesNumbers(await getCyclesPerSemester()).includes(value)) {
    throw new Error("BAD_REQUEST");
  }
  return value;
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

/** Admin → Configuration values, with defaults filled in. */
export async function getProgramConfig(): Promise<ProgramConfig> {
  const settings = await getProgramSettings();
  return parseProgramConfig(settings.config);
}

/** Merges `patch` into the stored configuration and returns the result. */
export async function updateProgramConfig(patch: Partial<ProgramConfig>): Promise<ProgramConfig> {
  // Read the row directly: getProgramSettings() is cached for the request and may be stale here.
  const row = await prisma.programSetting.findUnique({ where: { id: SETTING_ID }, select: { config: true } });
  const next = parseProgramConfig({ ...parseProgramConfig(row?.config), ...patch });
  const config = next as unknown as Prisma.InputJsonValue;
  await prisma.programSetting.upsert({
    where: { id: SETTING_ID },
    update: { config },
    create: { id: SETTING_ID, cyclesPerSemester: DEFAULT_CYCLES_PER_SEMESTER, config }
  });
  return next;
}

/** The last turn-in day when students can no longer turn in work right now, else null. */
export async function getWorkTurnInClosedAfter(now = new Date()) {
  const { schoolYears } = await getProgramConfig();
  return workTurnInClosedAfter(schoolYears, now);
}

/** Throws a friendly error when the semester's last turn-in day has passed. */
export async function assertWorkTurnInOpen(now = new Date()) {
  const closedAfter = await getWorkTurnInClosedAfter(now);
  if (closedAfter) {
    throw new Error(workTurnInClosedMessage(closedAfter));
  }
}
